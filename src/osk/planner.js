'use strict';

// Turns a string into the shortest sequence of gamepad presses that
// types it on an app's on-screen keyboard.
//
// For each character we breadth-first search the navigation graph
// (state = highlighted key + remembered column) for the fewest d-pad
// presses that reach the target key, then press A. If the layout has a
// gamepad shortcut for the key (e.g. Y = space) we use that instead,
// since it costs one press and doesn't move the highlight.

const { DIRS, initialState, move, keyForChar } = require('./layout');

const stateId = st => `${st.key}|${st.col}`;

// Shortest path from `from` to any state on key `target`.
// Returns { path: [dir...], end: state } or null if unreachable.
function shortestPath(layout, from, target) {
  if (from.key === target) return { path: [], end: from };
  const seen = new Set([stateId(from)]);
  let frontier = [{ st: from, path: [] }];
  while (frontier.length) {
    const next = [];
    for (const { st, path } of frontier) {
      for (const dir of DIRS) {
        const ns = move(layout, st, dir);
        const id = stateId(ns);
        if (seen.has(id)) continue;
        seen.add(id);
        const np = path.concat(dir);
        if (ns.key === target) return { path: np, end: ns };
        next.push({ st: ns, path: np });
      }
    }
    frontier = next;
  }
  return null;
}

// Plan presses to type `text`.
// Returns { buttons, end, skipped } where `skipped` lists characters the
// layout can't type (they are left out rather than failing the whole run).
function planText(layout, text, start = initialState(layout)) {
  const buttons = [];
  const skipped = [];
  let st = start;

  for (const ch of text) {
    const target = keyForChar(layout, ch);
    if (target === null) { skipped.push(ch); continue; }

    const shortcut = Object.entries(layout.shortcuts).find(([, k]) => k === target);
    if (shortcut) { buttons.push(shortcut[0]); continue; }

    const route = shortestPath(layout, st, target);
    if (!route) { skipped.push(ch); continue; }
    buttons.push(...route.path, 'a');
    st = route.end;
  }

  return { buttons, end: st, skipped };
}

module.exports = {
  shortestPath,
  planText,
};
