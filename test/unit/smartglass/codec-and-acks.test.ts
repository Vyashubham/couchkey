import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { AckTracker } from '../../../src/console/smartglass/ack-tracker';
import { parseTextAck, parseTextConfiguration, parseTextInput } from '../../../src/console/smartglass/text-codec';
import { summarizeEvent } from '../../../src/console/smartglass/summarize';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const u32s = (...n: number[]): Buffer => {
  const b = Buffer.alloc(n.length * 4);
  n.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4));
  return b;
};

test('text configuration parses whatever fields are present', () => {
  assert.equal(parseTextConfiguration(Buffer.alloc(2)), null);
  assert.deepEqual(parseTextConfiguration(u32s(7)), { sessionId: 7 });
  assert.deepEqual(parseTextConfiguration(u32s(7, 1, 2, 3, 0xffffffff)), {
    sessionId: 7, bufferVersion: 1, options: 2, inputScope: 3, maxLength: -1,
  });
});

test('text input and ack parse headers only', () => {
  assert.equal(parseTextInput(Buffer.alloc(10)), null);
  const input = Buffer.concat([u32s(7, 2, 3, 5), Buffer.alloc(12), Buffer.from('secret')]);
  assert.deepEqual(parseTextInput(input), { sessionId: 7, baseVersion: 2, submittedVersion: 3 });
  assert.equal(parseTextAck(undefined), null);
  assert.deepEqual(parseTextAck(u32s(7, 3)), { sessionId: 7, versionAck: 3 });
});

test('ack tracker: processed, rejected, watermark, timeout, clear', async () => {
  const t = new AckTracker();
  const a = t.track(1, 1000);
  const b = t.track(2, 1000);
  const c = t.track(3, 1000);
  const d = t.track(9, 1000);
  const e = t.track(10, 1000);
  t.handle({ processed_list: [{ id: 1 }], rejected_list: [{ id: 2 }] });
  t.handle({ low_watermark: 3 });
  assert.equal(await a, 'confirmed');
  assert.equal(await b, 'rejected');
  assert.equal(await c, 'confirmed');
  vi.advanceTimersByTime(1000);
  assert.equal(await d, 'timeout');
  t.clear();
  assert.equal(await e, 'timeout');
  assert.equal(t.size, 0);
});

test('ack tracker ignores malformed bodies', () => {
  const t = new AckTracker();
  assert.doesNotThrow(() => { t.handle(undefined); t.handle(Buffer.alloc(4)); t.handle('x'); });
});

test('event summaries keep headers, hide buffers, certificates and all text payloads', () => {
  const pkt = (payload: unknown): unknown => ({ packet_decoded: { type: 'd00d', name: 'x', sequence_number: 4, protected_payload: payload } });
  const s = summarizeEvent('_on_connect_response', [pkt({ certificate: 'abc', key: Buffer.alloc(8), result: 0 })]);
  assert.deepEqual(s.payload, { certificate: '[certificate]', key: '[8 bytes]', result: 0 });
  const t = summarizeEvent('_on_systemtextinput', [pkt({ text: 'password123' })]);
  assert.equal(t.payload, undefined);
  assert.ok(!JSON.stringify(t).includes('password123'));
  assert.deepEqual(summarizeEvent('x', [1, 2]), { argCount: 2 });
});
