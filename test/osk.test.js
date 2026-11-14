'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { compileLayout, initialState, move } = require('../src/osk/layout');
const { planText, shortestPath } = require('../src/osk/planner');
const { typeOnOsk, resetPosition, splitWords } = require('../src/osk/typer');

// Generic alphabetical TV keyboard used only for tests.
const GRID = {
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
function simulate(layout, buttons, st = initialState(layout)) {
  let out = '';
  const inv = Object.fromEntries(Object.entries(layout.chars).map(([c, k]) => [k, c]));
  for (const b of buttons) {
    if (['up', 'down', 'left', 'right'].includes(b)) st = move(layout, st, b);
    else if (b === 'a') out += inv[st.key] ?? st.key;
    else if (layout.shortcuts[b]) out += inv[layout.shortcuts[b]] ?? layout.shortcuts[b];
  }
  return out;
}

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
  assert.throws(() => compileLayout({ rows: [] }));
  assert.throws(() => compileLayout({ rows: [['a', 'a']] }));
  assert.throws(() => compileLayout({ rows: [['a']], start: 'z' }));
  assert.throws(() => compileLayout({ rows: [['a']], edges: { a: { up: 'q' } } }));
});

test('splitWords keeps separators', () => {
  assert.deepStrictEqual(splitWords('lofi beats'), ['lofi', ' beats']);
  assert.deepStrictEqual(splitWords('a  b '), ['a', '  b', ' ']);
});

test('typer sends planned presses and remembers position', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  const sent = [];
  const send = async b => { sent.push(b); return { ok: true }; };
  const r1 = await typeOnOsk(l, 'hi', { send });
  assert.ok(r1.ok);
  const r2 = await typeOnOsk(l, 'j', { send });
  assert.ok(r2.ok);
  assert.strictEqual(simulate(l, sent), 'hij');
});

test('typer re-anchors before each word', async () => {
  const l = compileLayout({ ...GRID, anchor: { buttons: ['up', 'left'], lands: 'a' } });
  resetPosition();
  const sent = [];
  await typeOnOsk(l, 'b c', { send: async b => { sent.push(b); return { ok: true }; } });
  assert.deepStrictEqual(sent.slice(0, 2), ['up', 'left']);
  assert.strictEqual(simulate(l, sent), 'b c');
});

test('typer forgets position after a failed press', async () => {
  const l = compileLayout(GRID);
  resetPosition();
  let n = 0;
  const r = await typeOnOsk(l, 'zz', { send: async () => (++n === 3 ? { ok: false, error: 'drop' } : { ok: true }) });
  assert.strictEqual(r.ok, false);
  const sent = [];
  await typeOnOsk(l, 'b', { send: async b => { sent.push(b); return { ok: true }; } });
  assert.deepStrictEqual(sent, ['right', 'a']); // started from 'a' again
});

test('shipped layouts compile and can type common searches', () => {
  const { loadLayouts } = require('../src/osk/registry');
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
