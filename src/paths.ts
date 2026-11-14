// Project-root-relative paths that work both from source (tsx) and from
// the compiled output in dist/, where __dirname is one level deeper.

import fs from 'node:fs';
import path from 'node:path';

export function findProjectRoot(start: string = __dirname): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No package.json found above ${start}`);
    dir = parent;
  }
}

export const ROOT_DIR = findProjectRoot();
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const LAYOUT_DIR = path.join(ROOT_DIR, 'layouts');
