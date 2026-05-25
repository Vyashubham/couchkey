'use strict';

// Multi-step button sequences executed sequentially with optional delays.
// Each step: { btn: <button-name>, delay: <ms before pressing> }
// The first step's delay is the delay before the first press (usually 0).
const MACROS = {
  open_guide: [{ btn: 'nexus', delay: 0 }],
  go_home: [
    { btn: 'nexus', delay: 0 },
    { btn: 'a', delay: 500 },
  ],
  open_search: [
    { btn: 'nexus', delay: 0 },
    { btn: 'y', delay: 500 },
  ],
  screenshot: [
    { btn: 'nexus', delay: 0 },
    { btn: 'y', delay: 500 },
  ],
  record_clip: [
    { btn: 'nexus', delay: 0 },
    { btn: 'x', delay: 500 },
  ],
  quick_settings: [
    { btn: 'nexus', delay: 0 },
    { btn: 'right', delay: 400 },
    { btn: 'right', delay: 200 },
    { btn: 'right', delay: 200 },
    { btn: 'right', delay: 200 },
  ],
  parties: [
    { btn: 'nexus', delay: 0 },
    { btn: 'right', delay: 400 },
  ],
};

module.exports = MACROS;
