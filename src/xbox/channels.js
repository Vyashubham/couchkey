'use strict';

// Legacy glue: opens SmartGlass channels for the legacy connection code
// using the shared implementation in src/console/smartglass/channels.
// Replaced by SmartGlassAdapter in M2.

const config = require('../config');
const { plog } = require('../logger');
const state = require('../state');
const { openChannels, adoptChannelIntoManager } = require('../console/smartglass/channels');

function forceOpenChannels() {
  if (!state.sgClient || !state.sgClient._console) {
    plog('err', 'Cannot force open channels: no console connection');
    return;
  }
  const client = state.sgClient;
  openChannels(client, {
    staggerMs: config.channelOpenStaggerMs,
    onOpen: (def, channelId) => {
      if (def.name === 'text') {
        state.textChannelId = channelId;
        state.textChannelOpen = true;
      } else {
        adoptChannelIntoManager(client, def, channelId);
      }
      plog('ok', `Channel '${def.name}' open (channelId ${channelId.toString('hex')})`);
    },
    onRejected: (def, result) => plog('err', `Channel '${def.name}' was rejected (result ${result})`),
    onSendError: (def, err) => plog('err', `Failed to request channel '${def.name}': ${err && err.message}`),
  });
}

module.exports = { forceOpenChannels };
