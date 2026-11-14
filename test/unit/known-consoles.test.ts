import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { KnownConsoles } from '../../src/known-consoles';

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'couchkey-known-'));

test('empty when nothing stored or the file is corrupt', () => {
  const dir = tmp();
  const store = new KnownConsoles(dir);
  assert.deepEqual(store.list(), []);
  assert.equal(store.last(), null);
  fs.writeFileSync(path.join(dir, 'known-consoles.json'), '{ broken');
  assert.deepEqual(store.list(), []);
  fs.writeFileSync(path.join(dir, 'known-consoles.json'), JSON.stringify({ ip: 'x' }));
  assert.deepEqual(store.list(), []);
});

test('remembers consoles, most recent first, keeping names', () => {
  let t = 0;
  const store = new KnownConsoles(path.join(tmp(), 'nested'), () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)));
  store.remember('10.0.0.5', 'Living room');
  store.remember('10.0.0.9');
  assert.equal(store.last()?.ip, '10.0.0.9');
  store.remember('10.0.0.5'); // reconnect without a name keeps the old one
  const last = store.last();
  assert.ok(last);
  assert.equal(last.ip, '10.0.0.5');
  assert.equal(last.name, 'Living room');
  assert.equal(store.list().length, 2);
  store.forget('10.0.0.5');
  assert.deepEqual(store.list().map(c => c.ip), ['10.0.0.9']);
});

test('drops invalid entries and caps the list', () => {
  const dir = tmp();
  const store = new KnownConsoles(dir);
  for (let i = 0; i < 15; i++) store.remember(`10.0.0.${i}`);
  assert.equal(store.list().length, 10);
  fs.writeFileSync(path.join(dir, 'known-consoles.json'), JSON.stringify([{ ip: '1.1.1.1', lastConnectedAt: 'x' }, { nope: 1 }, null]));
  assert.deepEqual(store.list().map(c => c.ip), ['1.1.1.1']);
});
