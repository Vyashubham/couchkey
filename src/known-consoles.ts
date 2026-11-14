// Consoles we've connected to before, so Couchkey can reconnect on its
// own instead of making people scan every time. Stored as JSON in the
// data directory. Corrupt or missing files are treated as empty.

import fs from 'node:fs';
import path from 'node:path';

export interface KnownConsole {
  ip: string;
  name?: string;
  lastConnectedAt: string; // ISO timestamp
}

const FILE = 'known-consoles.json';
const MAX_ENTRIES = 10;

export class KnownConsoles {
  constructor(private readonly dir: string, private readonly now: () => Date = () => new Date()) {}

  private get file(): string {
    return path.join(this.dir, FILE);
  }

  list(): KnownConsole[] {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw.filter((c): c is KnownConsole =>
        typeof c === 'object' && c !== null
        && typeof (c as KnownConsole).ip === 'string'
        && typeof (c as KnownConsole).lastConnectedAt === 'string');
    } catch {
      return [];
    }
  }

  /** Most recently connected console, if any. */
  last(): KnownConsole | null {
    const all = this.list();
    all.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
    return all[0] ?? null;
  }

  /** Record a successful connection. Keeps the name if a later connect doesn't know it. */
  remember(ip: string, name?: string): KnownConsole {
    const others = this.list().filter(c => c.ip !== ip);
    const previous = this.list().find(c => c.ip === ip);
    const resolvedName = name ?? previous?.name;
    const entry: KnownConsole = {
      ip,
      ...(resolvedName ? { name: resolvedName } : {}),
      lastConnectedAt: this.now().toISOString(),
    };
    const next = [entry, ...others].slice(0, MAX_ENTRIES);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, this.file);
    return entry;
  }

  forget(ip: string): void {
    const next = this.list().filter(c => c.ip !== ip);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2));
  }
}
