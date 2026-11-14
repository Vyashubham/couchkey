import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { ConsoleError, type ConsoleEvents } from '../../../src/console';
import { CHANNEL_DEFS } from '../../../src/console/smartglass/channels';
import { SmartGlassAdapter } from '../../../src/console/smartglass/adapter';
import { consoleAdapterContract } from '../../contract/console-adapter.contract';
import { FakeSgClient, unseal } from './fake-sg-client';

const CH = { input: '0000000000000001', media: '0000000000000002', text: '0000000000000003' } as const;

function harness(client = new FakeSgClient()): { adapter: SmartGlassAdapter; client: FakeSgClient; openAll: () => Promise<void> } {
  const adapter = new SmartGlassAdapter({ createClient: () => client, channelOpenDelayMs: 10, channelOpenStaggerMs: 5, ackTimeoutMs: 100 });
  const openAll = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(50); // channel requests go out
    for (const def of CHANNEL_DEFS) client.acceptChannel(def.clientId, Buffer.from(CH[def.name], 'hex'));
  };
  return { adapter, client, openAll };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

consoleAdapterContract('SmartGlassAdapter (fake library client)', () => {
  const h = harness();
  return { adapter: h.adapter, ip: '192.0.2.10', openChannels: h.openAll };
});

function collect<E extends keyof ConsoleEvents>(a: SmartGlassAdapter, e: E): ConsoleEvents[E][] {
  const seen: ConsoleEvents[E][] = [];
  a.on(e, p => seen.push(p));
  return seen;
}

test('discovery maps library results; failures become DISCOVERY_FAILED', async () => {
  const client = new FakeSgClient();
  client.discoveryResult = [{ remote: { address: '10.0.0.5', port: 5050 }, message: { name: 'Living room', type: 2 } }];
  const { adapter } = harness(client);
  assert.deepEqual(await adapter.discover(), [{ name: 'Living room', ip: '10.0.0.5', type: 2 }]);
  client.discovery = () => Promise.reject(new Error('EHOSTUNREACH'));
  await assert.rejects(adapter.discover(), (e: unknown) => e instanceof ConsoleError && e.code === 'DISCOVERY_FAILED');
});

test('connect failure is translated and leaves the adapter disconnected', async () => {
  const client = new FakeSgClient();
  client.connectError = { status: 'error_connect', message: 'No anonymous connections' };
  const { adapter } = harness(client);
  await assert.rejects(adapter.connect('10.0.0.5'), (e: unknown) => e instanceof ConsoleError && e.code === 'ANONYMOUS_BLOCKED');
  assert.equal(adapter.isConnected(), false);
});

test('channel requests are sent for all three services', async () => {
  const { adapter, client, openAll } = harness();
  await adapter.connect('10.0.0.5');
  await openAll();
  assert.equal(client.sent.length, 3);
  assert.deepEqual(adapter.channels(), { input: true, media: true, text: true });
  // Library managers are adopted so their own sendCommand works.
  assert.equal(client.getManager('system_media')?._channel_manager._channel_status, true);
});

test('rejected channel is reported, not opened', async () => {
  const { adapter, client } = harness();
  const proto = collect(adapter, 'protocol');
  await adapter.connect('10.0.0.5');
  await vi.advanceTimersByTimeAsync(50);
  client._events.emit('_on_start_channel_response', { packet_decoded: { protected_payload: { channel_request_id: 12, result: 5 } } });
  assert.equal(adapter.channels().text, false);
  assert.ok(proto.some(p => p.event === 'channel-rejected' && p.detail?.channel === 'text'));
});

test('acked gamepad send resolves when the Xbox acknowledges its sequence number', async () => {
  const { adapter, client, openAll } = harness();
  await adapter.connect('10.0.0.5');
  await openAll();
  const pending = adapter.sendGamepadState(16, { ack: true });
  const pkt = unseal(client.sent.at(-1) ?? Buffer.alloc(0));
  assert.equal(pkt.flags, 'af0a');
  assert.equal(pkt.channel, CH.input);
  client._events.emit('_on_acknowledge', { packet_decoded: { protected_payload: { processed_list: [{ id: pkt.seq }] } } });
  assert.equal(await pending, 'confirmed');

  const lost = adapter.sendGamepadState(0, { ack: true });
  await vi.advanceTimersByTimeAsync(100);
  assert.equal(await lost, 'timeout');
});

test('text sends go to the text channel; inbound text events are parsed', async () => {
  const { adapter, client, openAll } = harness();
  const configs = collect(adapter, 'text-config');
  const inputs = collect(adapter, 'text-input');
  const acks = collect(adapter, 'text-ack');
  await adapter.connect('10.0.0.5');
  await openAll();
  adapter.sendTextInput({ sessionId: 1, baseVersion: 0, submittedVersion: 1, text: 'hi' });
  adapter.sendTextAck(1, 1);
  adapter.sendTextDone(1, 1, false);
  const sent = client.sent.slice(-3).map(unseal);
  assert.deepEqual(sent.map(p => p.flags), ['af2c', 'af34', 'af35']);
  assert.ok(sent.every(p => p.channel === CH.text));
  assert.equal(sent[2]?.payload.readUInt32BE(12), 1, 'cancel result');

  const u32 = (...n: number[]): Buffer => Buffer.concat(n.map(v => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; }));
  client._events.emit('_on_systemtextconfiguration', { packet_decoded: { decrypted_payload: u32(4, 0) } });
  client._events.emit('_on_systemtextinput', { packet_decoded: { decrypted_payload: Buffer.concat([u32(4, 1, 2, 0), Buffer.alloc(14)]) } });
  client._events.emit('_on_systemtextack', { packet_decoded: { decrypted_payload: u32(4, 2) } });
  client._events.emit('_on_systemtextack', { packet_decoded: {} }); // malformed: ignored
  assert.deepEqual(configs, [{ sessionId: 4, bufferVersion: 0 }]);
  assert.deepEqual(inputs, [{ sessionId: 4, baseVersion: 1, submittedVersion: 2 }]);
  assert.deepEqual(acks, [{ sessionId: 4, versionAck: 2 }]);
});

test('media goes through the adopted library manager', async () => {
  const { adapter, client, openAll } = harness();
  await adapter.connect('10.0.0.5');
  await openAll();
  const before = client.sent.length;
  await adapter.sendMedia('playpause');
  assert.equal(client.sent.length, before + 1);
});

test('heartbeat silence drops the connection with reason timeout', async () => {
  const { adapter, client } = harness();
  const dis = collect(adapter, 'disconnected');
  await adapter.connect('10.0.0.5');
  client._last_received_time = Math.floor(Date.now() / 1000) - 40;
  await vi.advanceTimersByTimeAsync(1000);
  assert.equal(dis[0]?.reason, 'timeout');
  assert.ok(client.closed);
});

test("library's own timeout event also drops the connection", async () => {
  const { adapter, client } = harness();
  const dis = collect(adapter, 'disconnected');
  await adapter.connect('10.0.0.5');
  client._events.emit('_on_timeout');
  assert.deepEqual(dis, [{ reason: 'timeout' }]);
  client._events.emit('_on_timeout'); // listener removed on teardown
  assert.equal(dis.length, 1);
});

test('protocol events are mirrored as summaries', async () => {
  const { adapter, client } = harness();
  const proto = collect(adapter, 'protocol');
  await adapter.connect('10.0.0.5');
  client._events.emit('_on_console_status', { packet_decoded: { name: 'console_status', protected_payload: { live_tv_provider: 0 } } });
  client._events.emit('receive', Buffer.alloc(1)); // too noisy: not mirrored
  assert.ok(proto.some(p => p.event === '_on_console_status'));
  assert.ok(!proto.some(p => p.event === 'receive'));
});

test('a newer connect supersedes an in-flight one', async () => {
  const slow = new FakeSgClient();
  let release: () => void = () => undefined;
  slow.connect = () => new Promise(r => { release = () => { slow._connection_status = true; r({}); }; });
  const fast = new FakeSgClient();
  const clients = [slow, fast];
  const adapter = new SmartGlassAdapter({ createClient: () => clients.shift() ?? new FakeSgClient(), channelOpenDelayMs: 10 });
  const connected = collect(adapter, 'connected');
  const first = adapter.connect('10.0.0.1');
  await adapter.connect('10.0.0.2');
  release();
  await first;
  assert.deepEqual(connected, [{ ip: '10.0.0.2' }]);
});
