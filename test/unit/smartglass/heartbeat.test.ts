import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { installHeartbeat } from '../../../src/console/smartglass/heartbeat';
import { FakeSgClient } from './fake-sg-client';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const opts = { timeoutSec: 30, keepAliveAfterSec: 3, keepAliveIntervalSec: 2 };

test('replaces the library interval and sends repeated keep-alives while silent', () => {
  const client = new FakeSgClient();
  client._connection_status = true;
  const libraryInterval = setInterval(() => undefined, 1000);
  client._interval_timeout = libraryInterval;
  let now = 100;
  client._last_received_time = 100;
  const stop = installHeartbeat(client, { ...opts, nowSec: () => now, onTimeout: () => assert.fail('no timeout') });
  assert.notEqual(client._interval_timeout, libraryInterval);

  for (let t = 1; t <= 8; t++) { now = 100 + t; vi.advanceTimersByTime(1000); }
  // silent 4, 6, 8 -> three keep-alives (>= 3 s and even)
  assert.equal(client.sent.length, 3);
  stop();
  assert.equal(client._interval_timeout, false);
});

test('times out after the configured silence and closes the client', () => {
  const client = new FakeSgClient();
  client._connection_status = true;
  client._last_received_time = 0;
  const silences: number[] = [];
  installHeartbeat(client, { ...opts, nowSec: () => 31, onTimeout: s => silences.push(s) });
  vi.advanceTimersByTime(1000);
  assert.deepEqual(silences, [31]);
  assert.ok(client.closed);
  vi.advanceTimersByTime(5000);
  assert.equal(silences.length, 1, 'stops after timing out');
});

test('stops quietly when the client disconnects; keep-alive errors are reported', () => {
  const client = new FakeSgClient();
  client._connection_status = true;
  client._last_received_time = 0;
  client._send = () => { throw new Error('socket closed'); };
  const errors: unknown[] = [];
  installHeartbeat(client, { ...opts, nowSec: () => 4, onTimeout: () => assert.fail('no timeout'), onKeepAliveError: e => errors.push(e) });
  vi.advanceTimersByTime(1000);
  assert.equal(errors.length, 1);
  client._connection_status = false;
  vi.advanceTimersByTime(3000);
  assert.equal(errors.length, 1);
});
