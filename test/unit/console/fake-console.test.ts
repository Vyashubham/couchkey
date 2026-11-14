import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConsoleError, FakeConsole } from '../../../src/console';
import { consoleAdapterContract } from '../../contract/console-adapter.contract';

consoleAdapterContract('FakeConsole', () => {
  const adapter = new FakeConsole({ autoOpenChannels: false });
  return { adapter, ip: '192.0.2.10', openChannels: () => { adapter.openChannels(); } };
});

test('discovery returns scripted consoles, filtered by ip', async () => {
  const fake = new FakeConsole({ consoles: [{ name: 'A', ip: '1.1.1.1' }, { name: 'B', ip: '2.2.2.2' }] });
  assert.equal((await fake.discover()).length, 2);
  assert.deepEqual(await fake.discover('2.2.2.2'), [{ name: 'B', ip: '2.2.2.2' }]);
});

test('connect can be scripted to fail', async () => {
  const fake = new FakeConsole({ connectError: new ConsoleError('ANONYMOUS_BLOCKED', 'blocked') });
  await assert.rejects(fake.connect('1.1.1.1'), (e: unknown) => e instanceof ConsoleError && e.code === 'ANONYMOUS_BLOCKED');
  assert.equal(fake.isConnected(), false);
});

test('ack behavior is scriptable per send', async () => {
  const seq = ['confirm', 'reject', 'drop'] as const;
  const fake = new FakeConsole({ ack: i => seq[i % 3] ?? 'confirm' });
  await fake.connect('1.1.1.1');
  assert.equal(await fake.sendGamepadState(16, { ack: true }), 'confirmed');
  assert.equal(await fake.sendGamepadState(0, { ack: true }), 'rejected');
  assert.equal(await fake.sendGamepadState(256, { ack: true }), 'timeout');
  assert.deepEqual(fake.pressedButtons(), ['a', 'up']);
});

test('records media and text calls; channel must be open', async () => {
  const fake = new FakeConsole({ autoOpenChannels: false });
  await fake.connect('1.1.1.1');
  await assert.rejects(fake.sendMedia('play'), (e: unknown) => e instanceof ConsoleError && e.code === 'CHANNEL_NOT_READY');
  fake.openChannels();
  await fake.sendMedia('play');
  fake.sendTextInput({ sessionId: 1, baseVersion: 0, submittedVersion: 1, text: 'hi' });
  fake.sendTextAck(1, 1);
  fake.sendTextDone(1, 1, true);
  assert.deepEqual(fake.calls.map(c => c.kind), ['media', 'text-input', 'text-ack', 'text-done']);
});

test('scripted console events reach listeners', async () => {
  const fake = new FakeConsole();
  const seen: string[] = [];
  fake.on('text-config', c => seen.push(`config:${c.sessionId}`));
  fake.on('text-input', c => seen.push(`input:${c.submittedVersion}`));
  fake.on('disconnected', d => seen.push(`drop:${d.reason}`));
  await fake.connect('1.1.1.1');
  fake.openTextSession(5);
  fake.consoleEdited(5, 3);
  fake.drop('timeout');
  fake.drop('timeout'); // second drop is a no-op
  assert.deepEqual(seen, ['config:5', 'input:3', 'drop:timeout']);
});

test('configure updates behavior after construction', async () => {
  const fake = new FakeConsole();
  fake.configure({ connectError: new ConsoleError('CONNECT_FAILED', 'nope') });
  await assert.rejects(fake.connect('1.1.1.1'));
});
