// Behavior every ConsoleAdapter must have. Run against each
// implementation that can be driven without a real Xbox.

import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { ConsoleError, type ConsoleAdapter, type ConsoleEvents } from '../../src/console';

export interface ContractHarness {
  adapter: ConsoleAdapter;
  /** Make all channels open (immediately or by driving the fake). */
  openChannels: () => Promise<void> | void;
  ip: string;
}

function collect<E extends keyof ConsoleEvents>(a: ConsoleAdapter, e: E): ConsoleEvents[E][] {
  const seen: ConsoleEvents[E][] = [];
  a.on(e, p => seen.push(p));
  return seen;
}

export function consoleAdapterContract(name: string, make: () => Promise<ContractHarness> | ContractHarness): void {
  describe(`ConsoleAdapter contract: ${name}`, () => {
    test('starts disconnected with no channels', async () => {
      const { adapter } = await make();
      assert.equal(adapter.isConnected(), false);
      assert.deepEqual(adapter.channels(), { input: false, media: false, text: false });
    });

    test('sending before connect fails with NOT_CONNECTED', async () => {
      const { adapter } = await make();
      // Promise-returning methods must reject, not throw synchronously.
      const pending = adapter.sendGamepadState(16);
      await assert.rejects(pending, (e: unknown) => e instanceof ConsoleError && e.code === 'NOT_CONNECTED');
      await assert.rejects(adapter.sendMedia('play'), (e: unknown) => e instanceof ConsoleError && e.code === 'NOT_CONNECTED');
      assert.throws(() => { adapter.sendTextAck(1, 1); }, (e: unknown) => e instanceof ConsoleError && e.code === 'NOT_CONNECTED');
    });

    test('connect emits connected, then channels open', async () => {
      const h = await make();
      const connected = collect(h.adapter, 'connected');
      const channels = collect(h.adapter, 'channel');
      await h.adapter.connect(h.ip);
      assert.equal(h.adapter.isConnected(), true);
      assert.deepEqual(connected, [{ ip: h.ip }]);
      await h.openChannels();
      assert.deepEqual(h.adapter.channels(), { input: true, media: true, text: true });
      assert.deepEqual(channels.filter(c => c.open).map(c => c.name).sort(), ['input', 'media', 'text']);
    });

    test('unacked gamepad send resolves "sent"', async () => {
      const h = await make();
      await h.adapter.connect(h.ip);
      await h.openChannels();
      assert.equal(await h.adapter.sendGamepadState(16), 'sent');
    });

    test('disconnect emits disconnected(requested) and closes channels', async () => {
      const h = await make();
      await h.adapter.connect(h.ip);
      await h.openChannels();
      const dis = collect(h.adapter, 'disconnected');
      const channels = collect(h.adapter, 'channel');
      h.adapter.disconnect();
      assert.equal(h.adapter.isConnected(), false);
      assert.deepEqual(dis, [{ reason: 'requested' }]);
      assert.deepEqual(h.adapter.channels(), { input: false, media: false, text: false });
      assert.ok(channels.every(c => !c.open));
    });

    test('disconnect when not connected is a no-op', async () => {
      const { adapter } = await make();
      const dis = collect(adapter, 'disconnected');
      adapter.disconnect();
      assert.deepEqual(dis, []);
    });

    test('listeners can unsubscribe', async () => {
      const h = await make();
      const seen: unknown[] = [];
      const off = h.adapter.on('connected', p => seen.push(p));
      off();
      await h.adapter.connect(h.ip);
      assert.deepEqual(seen, []);
    });
  });
}
