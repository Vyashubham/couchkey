import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildAckPacket, buildGamepadPacket, buildTextAckPacket, buildTextDonePacket, buildTextInputPacket, encodeSGString, padTo16,
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
  assert.equal(acked.payload.readBigUInt64BE(0), 1_700_000_000_000n);
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
