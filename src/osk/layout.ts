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
// verticalColumn controls where up/down lands when rows don't line up:
//   "memory" - TV keyboards usually remember the column you were in
//              before you entered a wide key, and return to it.
//   "start"  - always use the current key's left-most column.

export const DIRS = ['up', 'down', 'left', 'right'] as const;
export type Dir = (typeof DIRS)[number];

/** Gamepad buttons a layout may bind as a one-press shortcut. */
export const SHORTCUT_BUTTONS = ['a', 'b', 'x', 'y', 'menu', 'view'] as const;
export type ShortcutButton = (typeof SHORTCUT_BUTTONS)[number];

export type LayoutCell = string | { key: string; span?: number };

/** Layout JSON as stored in layouts/*.json. */
export interface LayoutDef {
  id: string;
  name?: string;
  verified?: boolean;
  notes?: string;
  titleIds?: number[];
  /** Key highlighted when the OSK opens. Defaults to the first key. */
  start?: string;
  wrap?: { h?: boolean; v?: boolean };
  verticalColumn?: 'memory' | 'start';
  caseInsensitive?: boolean;
  rows: LayoutCell[][];
  /** Character -> key id, when they differ (e.g. " " -> "space"). */
  chars?: Record<string, string>;
  /** Gamepad button -> key it types in place (e.g. y -> space). */
  shortcuts?: Partial<Record<ShortcutButton, string>>;
  /** Explicit moves: from key -> direction -> destination (null = blocked). */
  edges?: Record<string, Partial<Record<Dir, string | null>>>;
  /** Presses that always land on a known key, used to re-sync. */
  anchor?: { buttons: string[]; lands: string };
}

interface PlacedKey {
  key: string;
  span: number;
  col: number;
}

interface KeyPos {
  row: number;
  idx: number;
  col: number;
  span: number;
}

export interface Layout {
  id: string;
  name: string;
  verified: boolean;
  titleIds: number[];
  start: string;
  wrapH: boolean;
  wrapV: boolean;
  verticalColumn: 'memory' | 'start';
  caseInsensitive: boolean;
  chars: Record<string, string>;
  shortcuts: Partial<Record<ShortcutButton, string>>;
  anchor: { buttons: string[]; lands: string } | null;
  rows: PlacedKey[][];
  keys: Map<string, KeyPos>;
  edges: Record<string, Partial<Record<Dir, string | null>>>;
}

/** Highlighted key plus the column the keyboard remembers for vertical moves. */
export interface NavState {
  key: string;
  col: number;
}

function normalizeRows(rows: LayoutCell[][]): PlacedKey[][] {
  return rows.map(row => {
    let col = 0;
    return row.map(cell => {
      const k = typeof cell === 'string' ? { key: cell, span: 1 } : { key: cell.key, span: cell.span ?? 1 };
      const placed = { key: k.key, span: k.span, col };
      col += k.span;
      return placed;
    });
  });
}

export function compileLayout(def: LayoutDef): Layout {
  if (!Array.isArray(def.rows) || def.rows.length === 0) {
    throw new Error('layout: rows must be a non-empty array');
  }
  const rows = normalizeRows(def.rows);
  if (rows.some(r => r.length === 0)) throw new Error('layout: rows must not be empty');

  const keys = new Map<string, KeyPos>();
  rows.forEach((row, r) => {
    row.forEach((k, i) => {
      if (keys.has(k.key)) throw new Error(`layout: duplicate key "${k.key}"`);
      keys.set(k.key, { row: r, idx: i, col: k.col, span: k.span });
    });
  });

  const firstKey = rows[0]?.[0]?.key;
  const start = def.start ?? firstKey;
  if (start === undefined || !keys.has(start)) throw new Error(`layout: start key "${String(start)}" not in rows`);

  const edges = def.edges ?? {};
  for (const [from, dirs] of Object.entries(edges)) {
    if (!keys.has(from)) throw new Error(`layout: edge from unknown key "${from}"`);
    for (const [dir, to] of Object.entries(dirs)) {
      if (!(DIRS as readonly string[]).includes(dir)) throw new Error(`layout: bad direction "${dir}"`);
      if (to !== null && !keys.has(to)) throw new Error(`layout: edge to unknown key "${to}"`);
    }
  }

  // A shortcut's key may be off-grid (e.g. backspace we never navigate to).
  const shortcuts = def.shortcuts ?? {};
  for (const btn of Object.keys(shortcuts)) {
    if (!(SHORTCUT_BUTTONS as readonly string[]).includes(btn)) {
      throw new Error(`layout: shortcut on unsupported button "${btn}"`);
    }
  }

  if (def.anchor && !keys.has(def.anchor.lands)) {
    throw new Error(`layout: anchor lands on unknown key "${def.anchor.lands}"`);
  }

  return {
    id: def.id,
    name: def.name ?? def.id,
    verified: def.verified === true,
    titleIds: def.titleIds ?? [],
    start,
    wrapH: def.wrap?.h === true,
    wrapV: def.wrap?.v === true,
    verticalColumn: def.verticalColumn ?? 'memory',
    caseInsensitive: def.caseInsensitive !== false,
    chars: def.chars ?? {},
    shortcuts,
    anchor: def.anchor ?? null,
    rows,
    keys,
    edges,
  };
}

function posOf(layout: Layout, key: string): KeyPos {
  const pos = layout.keys.get(key);
  if (!pos) throw new Error(`layout ${layout.id}: unknown key "${key}"`);
  return pos;
}

function rowAt(layout: Layout, r: number): PlacedKey[] {
  const row = layout.rows[r];
  if (!row) throw new Error(`layout ${layout.id}: no row ${r}`);
  return row;
}

export function initialState(layout: Layout, keyId: string = layout.start): NavState {
  return { key: keyId, col: posOf(layout, keyId).col };
}

function keyAtColumn(row: PlacedKey[], col: number): PlacedKey {
  const hit = row.find(k => col >= k.col && col < k.col + k.span);
  if (hit) return hit;
  // Column past the end of a short row: land on its last key.
  const edge = col < 0 ? row[0] : row[row.length - 1];
  if (!edge) throw new Error('layout: empty row');
  return edge;
}

/**
 * Apply one d-pad press. Returns the new state, or the same state if
 * the press hits an edge that doesn't wrap.
 */
export function move(layout: Layout, st: NavState, dir: Dir): NavState {
  const vertical = dir === 'up' || dir === 'down';
  const override = layout.edges[st.key]?.[dir];
  if (override !== undefined) {
    if (override === null) return st; // explicitly blocked
    const k = posOf(layout, override);
    return { key: override, col: vertical && layout.verticalColumn === 'memory' ? st.col : k.col };
  }

  const cur = posOf(layout, st.key);
  const row = rowAt(layout, cur.row);

  if (!vertical) {
    let i = cur.idx + (dir === 'right' ? 1 : -1);
    if (i < 0 || i >= row.length) {
      if (!layout.wrapH) return st;
      i = (i + row.length) % row.length;
    }
    const k = row[i];
    if (!k) return st;
    return { key: k.key, col: k.col };
  }

  let r = cur.row + (dir === 'down' ? 1 : -1);
  if (r < 0 || r >= layout.rows.length) {
    if (!layout.wrapV) return st;
    r = (r + layout.rows.length) % layout.rows.length;
  }
  const col = layout.verticalColumn === 'memory' ? st.col : cur.col;
  const k = keyAtColumn(rowAt(layout, r), col);
  // Keep remembering the original column while passing through wide keys.
  return { key: k.key, col: layout.verticalColumn === 'memory' ? col : k.col };
}

function isTypeable(layout: Layout, key: string): boolean {
  return layout.keys.has(key) || Object.values(layout.shortcuts).includes(key);
}

/** Map a character to the key that types it, or null if the layout can't. */
export function keyForChar(layout: Layout, ch: string): string | null {
  const mapped = layout.chars[ch];
  if (mapped !== undefined) return isTypeable(layout, mapped) ? mapped : null;
  if (layout.keys.has(ch)) return ch;
  if (layout.caseInsensitive) {
    const lower = ch.toLowerCase();
    const mappedLower = layout.chars[lower];
    if (mappedLower !== undefined) return isTypeable(layout, mappedLower) ? mappedLower : null;
    if (layout.keys.has(lower)) return lower;
  }
  return null;
}
