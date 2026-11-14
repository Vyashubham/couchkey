'use strict';

// Loads OSK layouts from layouts/*.json at startup.

const fs = require('fs');
const path = require('path');
const { compileLayout } = require('./layout');
const { plog } = require('../logger');

const LAYOUT_DIR = path.join(__dirname, '..', '..', 'layouts');
const layouts = new Map();

function loadLayouts(dir = LAYOUT_DIR) {
  layouts.clear();
  if (!fs.existsSync(dir)) return layouts;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const def = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const layout = compileLayout(def);
      layouts.set(layout.id, layout);
    } catch (e) {
      plog('err', `Bad OSK layout ${file}: ${e.message}`);
    }
  }
  return layouts;
}

function getLayout(id) {
  return layouts.get(id) || null;
}

function listLayouts() {
  return [...layouts.values()].map(l => ({ id: l.id, name: l.name, verified: !!l.verified }));
}

module.exports = {
  loadLayouts,
  getLayout,
  listLayouts,
};
