// Loads OSK layouts from layouts/*.json at startup.

import fs from 'node:fs';
import path from 'node:path';
import { compileLayout, type Layout, type LayoutDef } from './layout';
import { LAYOUT_DIR } from '../paths';

const layouts = new Map<string, Layout>();

export interface LayoutSummary {
  id: string;
  name: string;
  verified: boolean;
}

/** Load every layout in `dir`. Bad files are reported via `onError` and skipped. */
export function loadLayouts(
  dir: string = LAYOUT_DIR,
  onError: (file: string, err: Error) => void = () => undefined,
): Map<string, Layout> {
  layouts.clear();
  if (!fs.existsSync(dir)) return layouts;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const def = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as LayoutDef;
      const layout = compileLayout(def);
      layouts.set(layout.id, layout);
    } catch (e) {
      onError(file, e instanceof Error ? e : new Error(String(e)));
    }
  }
  return layouts;
}

export function getLayout(id: string): Layout | null {
  return layouts.get(id) ?? null;
}

export function listLayouts(): LayoutSummary[] {
  return [...layouts.values()].map(l => ({ id: l.id, name: l.name, verified: l.verified }));
}
