import assert from 'node:assert/strict';
import { test } from 'vitest';
import { TypedEmitter } from '../../../src/console/emitter';
import { ConsoleError, isButton, isMediaCommand, toConnectError } from '../../../src/console';

test('toConnectError maps known SmartGlass failures to codes with help text', () => {
  // Real strings from the library's connect_result table.
  const blocked = toConnectError({ status: 'error_connect', message: 'No anonymous connections' });
  assert.equal(blocked.code, 'ANONYMOUS_BLOCKED');
  assert.match(blocked.message, /Allow connections from any device/);
  assert.equal(toConnectError({ message: 'Smartglass is disabled on the Xbox console' }).code, 'REMOTE_DISABLED');
  assert.equal(toConnectError({ message: 'Device limit exceeded' }).code, 'DEVICE_LIMIT');
  assert.equal(toConnectError({ error: 'weird' }).message, 'weird');
  const generic = toConnectError(42);
  assert.equal(generic.code, 'CONNECT_FAILED');
  assert.equal(generic.cause, 42);
  assert.ok(generic instanceof ConsoleError);
});

test('button and media command guards', () => {
  assert.ok(isButton('a'));
  assert.ok(isButton('left_shoulder'));
  assert.ok(!isButton('toString'));
  assert.ok(isMediaCommand('playpause'));
  assert.ok(!isMediaCommand('explode'));
});

test('emitter isolates listener errors and supports unsubscribe', () => {
  const errors: unknown[] = [];
  const em = new TypedEmitter<{ ping: number }>((_e, err) => errors.push(err));
  const seen: number[] = [];
  em.on('ping', () => { throw new Error('boom'); });
  const off = em.on('ping', n => seen.push(n));
  em.emit('ping', 1);
  off();
  em.emit('ping', 2);
  assert.deepEqual(seen, [1]);
  assert.equal(errors.length, 2);
  assert.equal(em.listenerCount('ping'), 1);
});
