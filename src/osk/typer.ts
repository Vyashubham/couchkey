// Drives an app's on-screen keyboard: plans the presses for a string
// and sends them one at a time through the normal gamepad path.
//
// We can't see the screen, so we trust our model of where the highlight
// is. Two things keep that trust honest:
//   - If the layout has an `anchor` (presses that always land on a known
//     key, e.g. slamming up+left on a keyboard that doesn't wrap), we
//     re-anchor before each word so one dropped press only garbles one
//     word.
//   - We remember where the highlight ended, so the next call can start
//     from there instead of assuming the OSK just opened.

import { initialState, type Layout, type NavState } from './layout';
import { planText } from './planner';

export interface SendResult {
  ok: boolean;
  error?: string;
}
export type SendButton = (button: string) => Promise<SendResult>;

export interface TypeResult {
  ok: boolean;
  pressed: number;
  skipped?: string[];
  error?: string;
}

export interface TypeOptions {
  reanchorPerWord?: boolean;
  send: SendButton;
  log?: (level: 'ok' | 'warn', msg: string) => void;
}

// Where we believe the highlight is, per layout id. Reset when the
// user tells us the keyboard was (re)opened.
const positions = new Map<string, NavState>();
let current: { cancelled: boolean } | null = null;

export function resetPosition(layoutId?: string): void {
  if (layoutId) positions.delete(layoutId);
  else positions.clear();
}

/** Split into words, keeping separators attached: "lofi beats" -> ["lofi", " beats"]. */
export function splitWords(text: string): string[] {
  return text.match(/\s*\S+|\s+$/g) ?? [];
}

export async function typeOnOsk(layout: Layout, text: string, opts: TypeOptions): Promise<TypeResult> {
  const { reanchorPerWord = true, send, log } = opts;
  if (current) return { ok: false, error: 'Already typing', pressed: 0 };
  const run = { cancelled: false };
  current = run;

  let st = positions.get(layout.id) ?? initialState(layout);
  let pressed = 0;
  const skipped: string[] = [];

  const press = async (btn: string): Promise<TypeResult | null> => {
    if (run.cancelled) return { ok: false, error: 'Cancelled', pressed };
    const r = await send(btn);
    if (!r.ok) {
      // We no longer know where the highlight is.
      positions.delete(layout.id);
      return { ok: false, error: r.error ?? 'Press failed', pressed };
    }
    pressed++;
    return null;
  };

  try {
    for (const word of splitWords(text)) {
      if (reanchorPerWord && layout.anchor) {
        for (const btn of layout.anchor.buttons) {
          const fail = await press(btn);
          if (fail) return fail;
        }
        st = initialState(layout, layout.anchor.lands);
      }

      const plan = planText(layout, word, st);
      skipped.push(...plan.skipped);
      for (const btn of plan.buttons) {
        const fail = await press(btn);
        if (fail) return fail;
      }
      st = plan.end;
      positions.set(layout.id, st);
    }

    if (skipped.length > 0) log?.('warn', `OSK ${layout.id}: can't type ${skipped.length} character(s)`);
    log?.('ok', `OSK ${layout.id}: typed ${text.length} chars in ${pressed} presses`);
    return { ok: true, pressed, skipped };
  } finally {
    current = null;
  }
}

export function cancelOskTyping(): void {
  if (current) current.cancelled = true;
}
