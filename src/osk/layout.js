'use strict';

// On-screen keyboard (OSK) layout model.
//
// Third-party apps (YouTube, Netflix, ...) draw their own on-screen
// keyboard and never open a SmartGlass text session, so we can't type
// into them directly. Instead we drive their OSK with d-pad presses.
// To do that we need a model of the keyboard: which key you land on
// when you press up/down/left/right from any key.
//
// A layout file describes the keyboard as rows of keys. Wide keys
// (space bar, etc.) take a `span`. From the rows we generate a
// navigation graph automatically; anything the rows can't express
// (odd jumps, wrap-around quirks) goes in `edges` as explicit overrides.
//
// Layout JSON shape:
// {
//   "id": "youtube",
//   "name": "YouTube",
//   "titleIds": [ ... ],            // optional: SmartGlass title IDs that use it
//   "start": "a",                   // key highlighted when the OSK opens
//   "wrap": { "h": false, "v": false },
//   "verticalColumn": "memory",     // "memory" | "start" (see below)
//   "caseInsensitive": true,
//   "rows": [
//     ["a","b","c","d","e","f","g"],
//     [{ "key": "space", "span": 3 }, ...]
//   ],
//   "chars": { " ": "space" },      // char -> key id, when they differ
//   "shortcuts": { "y": "space" },  // gamepad button that types a key in place
//   "edges": { "space": { "up": "c" } },
//   "anchor": { "buttons": ["up","up","left","left"], "lands": "a" }
// }
//
// verticalColumn controls where up/down lands when rows don't line up:
//   "memory" - TV keyboards usually remember the column you were in
//              before you entered a wide key, and return to it.
//   "start"  - always use the current key's left-most column.

const DIRS = ['up', 'down', 'left', 'right'];

function normalizeRows(rows) {
  return rows.map(row => {
    let col = 0;
    return row.map(cell => {
      const k = typeof cell === 'string' ? { key: cell, span: 1 } : { span: 1, ...cell };
      const placed = { key: k.key, span: k.span, col };
      col += k.span;
      return placed;
    });
  });
}

function compileLayout(def) {
  if (!def || !Array.isArray(def.rows) || def.rows.length === 0) {
    throw new Error('layout: rows must be a non-empty array');
  }
  const rows = normalizeRows(def.rows);
  const keys = new Map(); // id -> { row, idx, col, span }
  rows.forEach((row, r) => row.forEach((k, i) => {
    if (keys.has(k.key)) throw new Error(`layout: duplicate key "${k.key}"`);
    keys.set(k.key, { row: r, idx: i, col: k.col, span: k.span });
  }));

  const start = def.start || rows[0][0].key;
  if (!keys.has(start)) throw new Error(`layout: start key "${start}" not in rows`);

  const edges = def.edges || {};
  for (const [from, dirs] of Object.entries(edges)) {
    if (!keys.has(from)) throw new Error(`layout: edge from unknown key "${from}"`);
    for (const [dir, to] of Object.entries(dirs)) {
      if (!DIRS.includes(dir)) throw new Error(`layout: bad direction "${dir}"`);
      if (to !== null && !keys.has(to)) throw new Error(`layout: edge to unknown key "${to}"`);
    }
  }

  const shortcuts = def.shortcuts || {};
  // A shortcut's key may be off-grid (e.g. backspace we never navigate to).
  const BUTTONS = ['a', 'b', 'x', 'y', 'menu', 'view'];
  for (const btn of Object.keys(shortcuts)) {
    if (!BUTTONS.includes(btn)) throw new Error(`layout: shortcut on unsupported button "${btn}"`);
  }

  return {
    id: def.id,
    name: def.name || def.id,
    verified: !!def.verified,
    titleIds: def.titleIds || [],
    start,
    wrapH: !!(def.wrap && def.wrap.h),
    wrapV: !!(def.wrap && def.wrap.v),
    verticalColumn: def.verticalColumn || 'memory',
    caseInsensitive: def.caseInsensitive !== false,
    chars: def.chars || {},
    shortcuts,
    anchor: def.anchor || null,
    rows,
    keys,
    edges,
  };
}

// Navigation state: which key is highlighted, plus the column the
// keyboard "remembers" for vertical moves.
function initialState(layout, keyId = layout.start) {
  return { key: keyId, col: layout.keys.get(keyId).col };
}

function keyAtColumn(row, col) {
  for (const k of row) {
    if (col >= k.col && col < k.col + k.span) return k;
  }
  // Column past the end of a short row: land on its last key.
  return col < 0 ? row[0] : row[row.length - 1];
}

// Apply one d-pad press. Returns the new state, or the same state if
// the press hits an edge that doesn't wrap.
function move(layout, st, dir) {
  const override = layout.edges[st.key] && layout.edges[st.key][dir];
  if (override !== undefined) {
    if (override === null) return st; // explicitly blocked
    const k = layout.keys.get(override);
    const vertical = dir === 'up' || dir === 'down';
    return { key: override, col: vertical && layout.verticalColumn === 'memory' ? st.col : k.col };
  }

  const cur = layout.keys.get(st.key);
  const row = layout.rows[cur.row];

  if (dir === 'left' || dir === 'right') {
    let i = cur.idx + (dir === 'right' ? 1 : -1);
    if (i < 0 || i >= row.length) {
      if (!layout.wrapH) return st;
      i = (i + row.length) % row.length;
    }
    return { key: row[i].key, col: row[i].col };
  }

  let r = cur.row + (dir === 'down' ? 1 : -1);
  if (r < 0 || r >= layout.rows.length) {
    if (!layout.wrapV) return st;
    r = (r + layout.rows.length) % layout.rows.length;
  }
  const col = layout.verticalColumn === 'memory' ? st.col : cur.col;
  const k = keyAtColumn(layout.rows[r], col);
  // Keep remembering the original column while passing through wide keys.
  return { key: k.key, col: layout.verticalColumn === 'memory' ? col : k.col };
}

// Map a character to the key that types it, or null if the layout
// can't type it.
function keyForChar(layout, ch) {
  const known = k => layout.keys.has(k) || Object.values(layout.shortcuts).includes(k);
  if (layout.chars[ch] !== undefined) return known(layout.chars[ch]) ? layout.chars[ch] : null;
  if (layout.keys.has(ch)) return ch;
  if (layout.caseInsensitive) {
    const lower = ch.toLowerCase();
    if (layout.chars[lower] !== undefined) return layout.chars[lower];
    if (layout.keys.has(lower)) return lower;
  }
  return null;
}

module.exports = {
  DIRS,
  compileLayout,
  initialState,
  move,
  keyForChar,
};
