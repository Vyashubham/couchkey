'use strict';

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

const { plog } = require('../logger');
const { sendButton } = require('../xbox/input');
const { initialState } = require('./layout');
const { planText } = require('./planner');

// Where we believe the highlight is, per layout id. Reset when the
// user tells us the keyboard was (re)opened.
const positions = new Map();
let current = null; // { cancelled } for the run in progress

function resetPosition(layoutId) {
  if (layoutId) positions.delete(layoutId);
  else positions.clear();
}

function splitWords(text) {
  // Keep separators attached so "lofi beats" -> ["lofi", " beats"].
  return text.match(/\s*\S+|\s+$/g) || [];
}

async function typeOnOsk(layout, text, { reanchorPerWord = true, send = sendButton } = {}) {
  if (current) return { ok: false, error: 'Already typing' };
  const run = { cancelled: false };
  current = run;

  let st = positions.get(layout.id) || initialState(layout);
  let pressed = 0;
  const skipped = [];

  try {
    for (const word of splitWords(text)) {
      if (reanchorPerWord && layout.anchor) {
        for (const btn of layout.anchor.buttons) {
          if (run.cancelled) return { ok: false, error: 'Cancelled', pressed };
          const r = await send(btn);
          if (!r.ok) return { ok: false, error: r.error, pressed };
          pressed++;
        }
        st = initialState(layout, layout.anchor.lands);
      }

      const plan = planText(layout, word, st);
      skipped.push(...plan.skipped);
      for (const btn of plan.buttons) {
        if (run.cancelled) return { ok: false, error: 'Cancelled', pressed };
        const r = await send(btn);
        if (!r.ok) {
          // We no longer know where the highlight is.
          positions.delete(layout.id);
          return { ok: false, error: r.error, pressed };
        }
        pressed++;
      }
      st = plan.end;
      positions.set(layout.id, st);
    }

    if (skipped.length) plog('warn', `OSK ${layout.id}: can't type ${JSON.stringify(skipped.join(''))}`);
    plog('ok', `OSK ${layout.id}: typed ${text.length} chars in ${pressed} presses`);
    return { ok: true, pressed, skipped };
  } finally {
    current = null;
  }
}

function cancelOskTyping() {
  if (current) current.cancelled = true;
}

module.exports = {
  typeOnOsk,
  cancelOskTyping,
  resetPosition,
  splitWords,
};
