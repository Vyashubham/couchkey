// Turns a string into the shortest sequence of gamepad presses that
// types it on an app's on-screen keyboard.
//
// For each character we breadth-first search the navigation graph
// (state = highlighted key + remembered column) for the fewest d-pad
// presses that reach the target key, then press A. If the layout has a
// gamepad shortcut for the key (e.g. Y = space) we use that instead,
// since it costs one press and doesn't move the highlight.

import { DIRS, initialState, keyForChar, move, type Dir, type Layout, type NavState } from './layout';

export type PlannedButton = Dir | 'a' | 'b' | 'x' | 'y' | 'menu' | 'view';

export interface Route {
  path: Dir[];
  end: NavState;
}

export interface Plan {
  buttons: PlannedButton[];
  end: NavState;
  /** Characters the layout can't type; left out rather than failing the run. */
  skipped: string[];
}

const stateId = (st: NavState): string => `${st.key}|${st.col}`;

/** Shortest path from `from` to any state on key `target`, or null if unreachable. */
export function shortestPath(layout: Layout, from: NavState, target: string): Route | null {
  if (from.key === target) return { path: [], end: from };
  const seen = new Set([stateId(from)]);
  let frontier: { st: NavState; path: Dir[] }[] = [{ st: from, path: [] }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { st, path } of frontier) {
      for (const dir of DIRS) {
        const ns = move(layout, st, dir);
        const id = stateId(ns);
        if (seen.has(id)) continue;
        seen.add(id);
        const np = [...path, dir];
        if (ns.key === target) return { path: np, end: ns };
        next.push({ st: ns, path: np });
      }
    }
    frontier = next;
  }
  return null;
}

/** Plan presses to type `text`, starting from `start` (default: the layout's start key). */
export function planText(layout: Layout, text: string, start: NavState = initialState(layout)): Plan {
  const buttons: PlannedButton[] = [];
  const skipped: string[] = [];
  let st = start;

  for (const ch of text) {
    const target = keyForChar(layout, ch);
    if (target === null) {
      skipped.push(ch);
      continue;
    }

    const shortcut = Object.entries(layout.shortcuts).find(([, k]) => k === target);
    if (shortcut) {
      buttons.push(shortcut[0] as PlannedButton);
      continue;
    }

    const route = shortestPath(layout, st, target);
    if (!route) {
      skipped.push(ch);
      continue;
    }
    buttons.push(...route.path, 'a');
    st = route.end;
  }

  return { buttons, end: st, skipped };
}
