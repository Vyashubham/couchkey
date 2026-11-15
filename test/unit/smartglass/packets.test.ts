import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildAckPacket, buildGamepadPacket, buildTouchPacket, gamepadTimestamp, buildTextAckPacket, buildTextDonePacket, buildTextInputPacket, encodeSGString, padTo16,
} from '../../../src/console/smartglass/packets';
import { FakeSgClient, SIG, unseal } from './fake-sg-client';

const channelId = Buffer.from('0000000000000003', 'hex');
const env = (): { xbox: FakeSgClient['_console']; channelId: Buffer } => {
  const c = new FakeSgClient();
  c._console._request_num = 42;
  return { xbox: c._console, channelId };
};

test('padTo16 pads with the pad length and leaves aligned buffers alone', () => {
  assert.deepEqual(padTo16(Buffer.alloc(14)).subarray(14), Buffer.from([2, 2]));
  assert.equal(padTo16(Buffer.alloc(16)).length, 16);
});

test('text input layout matches OpenXbox: versions, -1 selection, text last', () => {
  const p = unseal(buildTextInputPacket({ ...env(), text: 'héllo', sessionId: 9, baseVersion: 3, submittedVersion: 4 }));
  assert.equal(p.flags, 'af2c');
  assert.equal(p.seq, 42);
  assert.equal(p.channel, channelId.toString('hex'));
  const b = p.payload;
  assert.equal(b.readUInt32BE(0), 9);
  assert.equal(b.readUInt32BE(4), 3);
  assert.equal(b.readUInt32BE(8), 4);
  assert.equal(b.readUInt32BE(12), Buffer.byteLength('héllo'));
  assert.equal(b.readInt32BE(16), -1);
  assert.equal(b.readInt32BE(20), -1);
  assert.equal(b.readUInt16BE(24), 0);
  assert.equal(b.readUInt32BE(26), 0);
  const strLen = b.readUInt16BE(30);
  assert.equal(strLen, 6, 'length prefix is UTF-8 bytes, not characters');
  assert.equal(b.subarray(32, 32 + strLen).toString('utf8'), 'héllo');
  assert.equal(b[32 + strLen], 0, 'NUL terminated');
});

test('SmartGlass strings use UTF-8 byte length (emoji, accents)', () => {
  const enc = encodeSGString('a😀');
  assert.equal(enc.readUInt16BE(0), 5);
  assert.equal(enc.subarray(2, 7).toString('utf8'), 'a😀');
  assert.equal(enc.length, 8);
  assert.throws(() => encodeSGString('x'.repeat(70000)), RangeError);
});

test('text ack and done layouts (done flags are u32)', () => {
  const ack = unseal(buildTextAckPacket({ ...env(), sessionId: 9, versionAck: 4 }));
  assert.equal(ack.flags, 'af34');
  assert.deepEqual([ack.payload.readUInt32BE(0), ack.payload.readUInt32BE(4)], [9, 4]);
  const done = unseal(buildTextDonePacket({ ...env(), sessionId: 9, version: 4, result: 1 }));
  assert.equal(done.flags, 'af35');
  assert.equal(done.len, 16);
  assert.deepEqual([0, 4, 8, 12].map(o => done.payload.readUInt32BE(o)), [9, 4, 0, 1]);
});

test('gamepad packet: acked by default, timestamp + buttons + zeroed axes', () => {
  const acked = unseal(buildGamepadPacket({ ...env(), buttons: 16, now: 1_700_000_000_000 }));
  assert.equal(acked.flags, 'af0a');
  assert.equal(acked.payload.subarray(0, 8).toString('hex'), '0001700000000000', 'library timestamp encoding');
  assert.equal(acked.payload.readUInt16BE(8), 16);
  assert.ok(acked.payload.subarray(10, 34).every(x => x === 0));
  assert.equal(acked.len, 34);
  const plain = unseal(buildGamepadPacket({ ...env(), buttons: 0, needAck: false }));
  assert.equal(plain.flags, '8f0a');
});

test('packets end with the HMAC signature', () => {
  const pkt = buildTextAckPacket({ ...env(), sessionId: 1, versionAck: 1 });
  assert.deepEqual(pkt.subarray(-32), SIG);
});

test('acknowledge packet: watermark, processed ids, empty rejected list, optional need_ack', () => {
  const plain = unseal(buildAckPacket({ xbox: env().xbox, lowWatermark: 9, processed: [9] }));
  assert.equal(plain.flags, '8001');
  assert.deepEqual([0, 4, 8, 12].map(o => plain.payload.readUInt32BE(o)), [9, 1, 9, 0]);
  assert.equal(unseal(buildAckPacket({ xbox: env().xbox, lowWatermark: 9, needAck: true })).flags, 'a001');
});

test('gamepad analog values are big-endian float32, clamped', () => {
  const p = unseal(buildGamepadPacket({
    ...env(), buttons: 0, needAck: false,
    analog: { leftX: 0.5, leftY: -2, rightY: 0.25, rightTrigger: 7, leftTrigger: Number.NaN },
  }));
  const f = (i: number): number => p.payload.readFloatBE(10 + i * 4);
  assert.deepEqual([f(0), f(1), f(2), f(3), f(4), f(5)], [0, 1, 0.5, -1, 0, 0.25]);
});

test('gamepad timestamps match the library encoding and stay monotonic', () => {
  assert.equal(gamepadTimestamp(1763108152312).toString('hex'), '0001763108152312');
  assert.equal(gamepadTimestamp(1763108152312).length, 8);
  const a = gamepadTimestamp(1763108152312).readBigUInt64BE(0);
  const b = gamepadTimestamp(1763108152313).readBigUInt64BE(0);
  assert.ok(b > a);
});

test('touch packet layout per OpenXbox: ts, count, points of id/action/x/y', () => {
  const p = unseal(buildTouchPacket({
    ...env(), timestamp: 1234, needAck: true,
    points: [{ id: 7, action: 'down', x: 960, y: 540 }, { id: 7, action: 'up', x: -5, y: 540.6 }],
  }));
  assert.equal(p.flags, 'af2e');
  assert.equal(p.len, 6 + 28);
  const b = p.payload;
  assert.deepEqual([b.readUInt32BE(0), b.readUInt16BE(4)], [1234, 2]);
  assert.deepEqual([b.readUInt32BE(6), b.readUInt16BE(10), b.readUInt32BE(12), b.readUInt32BE(16)], [7, 1, 960, 540]);
  assert.deepEqual([b.readUInt16BE(24), b.readUInt32BE(26), b.readUInt32BE(30)], [3, 0, 541]);
  assert.equal(unseal(buildTouchPacket({ ...env(), points: [] })).flags, '8f2e');
});
