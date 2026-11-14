import assert from 'node:assert/strict';
import { test } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports -- legacy CJS module under test until T-202 */
const { _onAcknowledge, _pending, BUTTONS } = require('../../src/xbox/gamepad') as {
  _onAcknowledge: (m: unknown) => void;
  _pending: Map<number, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>;
  BUTTONS: Record<string, number>;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function track(seq: number): Promise<unknown> {
  return new Promise(resolve => {
    _pending.set(seq, { resolve, timer: setTimeout(() => { resolve('timeout'); }, 200) });
  });
}
const ack = (body: unknown): void => { _onAcknowledge({ packet_decoded: { protected_payload: body } }); };

test('processed list confirms a press', async () => {
  const p = track(10);
  ack({ low_watermark: 0, processed_list: [{ id: 10 }], rejected_list: [] });
  assert.strictEqual(await p, true);
});

test('rejected list fails a press', async () => {
  const p = track(11);
  ack({ low_watermark: 0, processed_list: [], rejected_list: [{ id: 11 }] });
  assert.strictEqual(await p, false);
});

test('low watermark confirms everything at or below it', async () => {
  const a = track(20); const b = track(21); const c = track(25);
  ack({ low_watermark: 21, processed_list: [], rejected_list: [] });
  assert.strictEqual(await a, true);
  assert.strictEqual(await b, true);
  assert.strictEqual(await c, 'timeout');
  _pending.clear();
});

test('malformed acks are ignored', () => {
  assert.doesNotThrow(() => { _onAcknowledge(undefined); });
  assert.doesNotThrow(() => { _onAcknowledge({ packet_decoded: { protected_payload: Buffer.alloc(4) } }); });
});

test('button bitmask matches the library for shared buttons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = (require('xbox-smartglass-core-node/src/channels/systeminput') as () => { _button_map: Record<string, number> })()._button_map;
  for (const [name, mask] of Object.entries(lib)) assert.strictEqual(BUTTONS[name], mask, name);
});
