import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { compileLayout, initialState, move, type Dir, type Layout, type LayoutDef } from '../../src/osk/layout';
import { planText, shortestPath } from '../../src/osk/planner';
import { getLayout, listLayouts, loadLayouts } from '../../src/osk/registry';
import { cancelOskTyping, typeOnOsk, resetPosition, splitWords, type SendButton } from '../../src/osk/typer';

// Generic alphabetical TV keyboard used only for tests.
const GRID: LayoutDef = {
  id: 'test-grid',
  start: 'a',
  rows: [
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    ['h', 'i', 'j', 'k', 'l', 'm', 'n'],
    ['o', 'p', 'q', 'r', 's', 't', 'u'],
    ['v', 'w', 'x', 'y', 'z', '-', "'"],
    [{ key: 'space', span: 4 }, { key: 'del', span: 3 }],
  ],
  chars: { ' ': 'space' },
};

// Replays presses through the model to check what would be typed.
function simulate(layout: Layout, buttons: readonly string[], st = initialState(layout)): string {
  let out = '';
  const inv: Record<string, string> = Object.fromEntries(Object.entries(layout.chars).map(([c, k]) => [k, c]));
  const shortcuts: Record<string, string | undefined> = layout.shortcuts;
  for (const b of buttons) {
    if (['up', 'down', 'left', 'right'].includes(b)) st = move(layout, st, b as Dir);
    else if (b === 'a') out += inv[st.key] ?? st.key;
    else {
      const k = shortcuts[b];
      if (k !== undefined) out += inv[k] ?? k;
    }
  }
  return out;
}

const okSend = (sent: string[]): SendButton => b => {
  sent.push(b);
  return Promise.resolve({ ok: true });
};

test('right then down moves across the grid', () => {
  const l = compileLayout(GRID);
  let st = initialState(l);
  st = move(l, st, 'right');
  st = move(l, st, 'down');
  assert.strictEqual(st.key, 'i');
});

test('edges block without wrap, wrap when enabled', () => {
  const l = compileLayout(GRID);
  assert.strictEqual(move(l, initialState(l), 'left').key, 'a');
  const w = compileLayout({ ...GRID, wrap: { h: true, v: true } });
  assert.strictEqual(move(w, initialState(w), 'left').key, 'g');
  assert.strictEqual(move(w, initialState(w), 'up').key, 'space');
});

test('wide key remembers column in memory mode', () => {
  const l = compileLayout(GRID);
  let st = initialState(l, 'c');
  for (let i = 0; i < 4; i++) st = move(l, st, 'down');
  assert.strictEqual(st.key, 'space');
  for (let i = 0; i < 4; i++) st = move(l, st, 'up');
  assert.strictEqual(st.key, 'c');
});

test('wide key returns to its start column in start mode', () => {
  const l = compileLayout({ ...GRID, verticalColumn: 'start' });
  let st = initialState(l, 'c');
  for (let i = 0; i < 4; i++) st = move(l, st, 'down');
  st = move(l, st, 'up');
  assert.strictEqual(st.key, 'v');
});

test('shortest path is minimal (manhattan on a plain grid)', () => {
  const l = compileLayout(GRID);
  const r = shortestPath(l, initialState(l), 's');
  assert.ok(r);
  assert.strictEqual(r.path.length, 4 + 2);
});

test('plan types the right text', () => {
  const l = compileLayout(GRID);
  for (const text of ['lofi beats', 'hello', "don't-stop", 'Zz Aa']) {
    const { buttons, skipped } = planText(l, text);
    assert.deepStrictEqual(skipped, []);
    assert.strictEqual(simulate(l, buttons), text.toLowerCase());
  }
});

test('untypeable characters are skipped, not fatal', () => {
  const l = compileLayout(GRID);
  const { buttons, skipped } = planText(l, 'a!b');
  assert.deepStrictEqual(skipped, ['!']);
  assert.strictEqual(simulate(l, buttons), 'ab');
});

test('shortcuts are used instead of navigating', () => {
  const l = compileLayout({ ...GRID, shortcuts: { y: 'space' } });
  const { buttons } = planText(l, 'a a');
  assert.deepStrictEqual(buttons, ['a', 'y', 'a']);
});

test('edge overrides win over the generated graph', () => {
  const l = compileLayout({ ...GRID, edges: { a: { up: 'del' }, del: { right: null } } });
  assert.strictEqual(move(l, initialState(l), 'up').key, 'del');
  const st = initialState(l, 'del');
  assert.strictEqual(move(l, st, 'right').key, 'del');
});

test('bad layouts are rejected', () => {
  assert.throws(() => compileLayout({ id: 'x', rows: [] }));
  assert.throws(() => compileLayout({ id: 'x', rows: [[]] }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a', 'a']] }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], start: 'z' }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], edges: { a: { up: 'q' } } }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], edges: { q: { up: 'a' } } }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], edges: { a: { sideways: 'a' } as never } }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], shortcuts: { lt: 'a' } as never }));
  assert.throws(() => compileLayout({ id: 'x', rows: [['a']], anchor: { buttons: ['up'], lands: 'q' } }));
});

test('splitWords keeps separators', () => {
  assert.deepStrictEqual(splitWords('lofi beats'), ['lofi', ' beats']);
  assert.deepStrictEqual(splitWords('a  b '), ['a', '  b', ' ']);
});

test('typer sends planned presses and remembers position', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  const sent: string[] = [];
  const send = okSend(sent);
  const r1 = await typeOnOsk(l, 'hi', { send });
  assert.ok(r1.ok);
  const r2 = await typeOnOsk(l, 'j', { send });
  assert.ok(r2.ok);
  assert.strictEqual(simulate(l, sent), 'hij');
});

test('typer re-anchors before each word', async () => {
  const l = compileLayout({ ...GRID, anchor: { buttons: ['up', 'left'], lands: 'a' } });
  resetPosition();
  const sent: string[] = [];
  await typeOnOsk(l, 'b c', { send: okSend(sent) });
  assert.deepStrictEqual(sent.slice(0, 2), ['up', 'left']);
  assert.strictEqual(simulate(l, sent), 'b c');
});

test('typer forgets position after a failed press', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  let n = 0;
  const r = await typeOnOsk(l, 'zz', {
    send: () => Promise.resolve(++n === 3 ? { ok: false, error: 'drop' } : { ok: true }),
  });
  assert.strictEqual(r.ok, false);
  const sent: string[] = [];
  await typeOnOsk(l, 'b', { send: okSend(sent) });
  assert.deepStrictEqual(sent, ['right', 'a']); // started from 'a' again
});

test('shipped layouts compile and can type common searches', () => {
  const yt = loadLayouts().get('youtube');
  assert.ok(yt, 'youtube layout loaded');
  for (const text of ['lofi beats', "don't stop me now", 'mr-beast']) {
    const { buttons, skipped } = planText(yt, text);
    assert.deepStrictEqual(skipped, []);
    assert.strictEqual(simulate(yt, buttons), text);
  }

  const nf = loadLayouts().get('netflix');
  assert.ok(nf, 'netflix layout loaded');
  for (const text of ['black mirror', 'stranger things 4', '21 jump street']) {
    const { buttons, skipped } = planText(nf, text);
    assert.deepStrictEqual(skipped, []);
    assert.strictEqual(simulate(nf, buttons), text);
  }
  // Space uses the Y shortcut, never navigates to the space key.
  assert.ok(!planText(nf, 'a b').buttons.includes('up'));

  const sys = loadLayouts().get('xbox-system');
  assert.ok(sys, 'xbox-system layout loaded');
  for (const text of ['youtube.com', "what's up?", 'route 66, ny']) {
    const { buttons, skipped } = planText(sys, text);
    assert.deepStrictEqual(skipped, []);
    assert.strictEqual(simulate(sys, buttons), text);
  }
});

test('typer can be cancelled and refuses concurrent runs', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  let release: () => void = () => undefined;
  const gate = new Promise<void>(r => { release = r; });
  const sent: string[] = [];
  const slow: SendButton = async b => { sent.push(b); await gate; return { ok: true }; };
  const run = typeOnOsk(l, 'zz', { send: slow });
  const second = await typeOnOsk(l, 'a', { send: okSend([]) });
  assert.deepStrictEqual(second, { ok: false, error: 'Already typing', pressed: 0 });
  cancelOskTyping();
  release();
  const r = await run;
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'Cancelled');
  assert.strictEqual(sent.length, 1);
});

test('typer reports skipped characters without echoing them in logs', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  const logs: string[] = [];
  const r = await typeOnOsk(l, 'a!b', { send: okSend([]), log: (_lvl, msg) => logs.push(msg) });
  assert.deepStrictEqual(r.skipped, ['!']);
  assert.ok(logs.every(m => !m.includes('!') && !m.includes('a!b')));
});

test('registry reports bad layout files and keeps good ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'couchkey-layouts-'));
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(GRID));
  fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  const errors: string[] = [];
  const loaded = loadLayouts(dir, file => errors.push(file));
  assert.deepStrictEqual([...loaded.keys()], ['test-grid']);
  assert.deepStrictEqual(errors, ['bad.json']);
  assert.strictEqual(loadLayouts(path.join(dir, 'missing')).size, 0);
  loadLayouts(); // restore shipped layouts for other tests
});

test('move handles start-column mode and blocked overrides', () => {
  const l = compileLayout({ ...GRID, verticalColumn: 'start', edges: { a: { down: 'i' } } });
  assert.deepStrictEqual(move(l, initialState(l), 'down'), { key: 'i', col: 1 });
  const w = compileLayout({ ...GRID, wrap: { h: true } });
  assert.strictEqual(move(w, initialState(w, 'g'), 'right').key, 'a');
});

test('registry lookups and summaries', () => {
  loadLayouts();
  assert.strictEqual(getLayout('youtube')?.name, 'YouTube');
  assert.strictEqual(getLayout('nope'), null);
  const ids = listLayouts().map(l => l.id).sort();
  assert.deepStrictEqual(ids, ['netflix', 'xbox-system', 'youtube']);
  assert.ok(listLayouts().every(l => typeof l.verified === 'boolean'));
});

test('registry ignores bad files silently when no error handler is given', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'couchkey-layouts-'));
  fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
  assert.doesNotThrow(() => loadLayouts(dir));
  loadLayouts();
});

test('unreachable keys are skipped', () => {
  // 'b' is walled off: nothing can move into it.
  const l = compileLayout({
    id: 'walled',
    rows: [['a', 'b']],
    edges: { a: { right: null } },
  });
  const { buttons, skipped } = planText(l, 'ab');
  assert.deepStrictEqual(skipped, ['b']);
  assert.deepStrictEqual(buttons, ['a']);
});
