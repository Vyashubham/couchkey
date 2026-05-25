'use strict';

// Channel-open dance, hand-rolled because the SmartGlass library waits
// for a console_status broadcast before opening channels and the Xbox
// Series X does not send that broadcast on anonymous connections.
//
// Each channel is identified by a fixed service UUID. We pick our own
// client request IDs (10/11/12) that don't collide with the library's
// own managers (which use 0 and 1). When the Xbox replies with a
// StartChannelResponse, we plumb the assigned channel ID back into the
// library's managers for SystemInput/SystemMedia, or store it ourselves
// for SystemText (which has no library manager).

const Packer = require('xbox-smartglass-core-node/src/packet/packer');

const config = require('../config');
const { plog } = require('../logger');
const state = require('../state');

const CHANNELS = [
  { name: 'SystemInput', manager: 'system_input',  uuid: 'fa20b8ca66fb46e0adb60b978a59d35f', clientId: 10 },
  { name: 'SystemMedia', manager: 'system_media',  uuid: '48a9ca24eb6d4e128c43d57469edd3cd', clientId: 11 },
  { name: 'SystemText',  manager: null,            uuid: '7af3e6a2488b40cba93179c04b7da3a0', clientId: 12 },
];

function handleChannelResponse(response) {
  try {
    const payload = response.packet_decoded.protected_payload;
    plog('proto', 'Channel response received:', {
      channel_request_id: payload.channel_request_id,
      result: payload.result,
      target_channel_id: payload.target_channel_id,
    });

    if (payload.result !== 0) {
      plog('err', `Channel request ${payload.channel_request_id} was REJECTED (result: ${payload.result})`);
      return;
    }

    const ch = CHANNELS.find(c => c.clientId === payload.channel_request_id);
    if (!ch) return;

    const idHex = Buffer.from(payload.target_channel_id).toString('hex');

    if (ch.manager === null) {
      // SystemText is tracked in our own state since the library has no manager for it.
      state.textChannelId = payload.target_channel_id;
      state.textChannelOpen = true;
      plog('ok', `Channel '${ch.name}' open (channelId ${idHex})`);
      return;
    }

    // For the library-managed channels, we have to fill in the manager's
    // private state ourselves since we bypassed its normal handshake.
    const mgr = state.sgClient.getManager(ch.manager);
    if (mgr && mgr._channel_manager) {
      mgr._channel_manager._channel_status = true;
      mgr._channel_manager._channel_server_id = payload.target_channel_id;
      mgr._channel_manager._smartglass = state.sgClient;
      plog('ok', `Channel '${ch.name}' open (channelId ${idHex})`);
    }
  } catch (e) {
    plog('err', `Error processing channel response: ${e.message}`);
  }
}

function sendChannelOpenRequest(ch) {
  const xbox = state.sgClient._console;
  try {
    plog('info', `Sending channel open request: ${ch.name} (uuid ${ch.uuid}, clientId ${ch.clientId})`);

    const request = Packer('message.start_channel_request');
    request.set('channel_request_id', ch.clientId);
    request.set('title_id', 0);
    request.set('service', Buffer.from(ch.uuid, 'hex'));
    request.set('activity_id', 0);

    xbox.get_requestnum();
    const message = request.pack(xbox);

    state.sgClient._send(message);
    plog('ok', `Channel request sent for ${ch.name}`);
  } catch (e) {
    plog('err', `Failed to send channel request for ${ch.name}: ${e.message}`, e.stack);
  }
}

// Send a StartChannelRequest for each known service, staggered to avoid
// flooding the Xbox. The Xbox replies with a StartChannelResponse that
// our shared listener picks up.
function forceOpenChannels() {
  if (!state.sgClient || !state.sgClient._console) {
    plog('err', 'Cannot force open channels: no console connection');
    return;
  }

  state.sgClient._events.on('_on_start_channel_response', handleChannelResponse);

  CHANNELS.forEach((ch, index) => {
    setTimeout(() => sendChannelOpenRequest(ch), index * config.channelOpenStaggerMs);
  });
}

module.exports = {
  CHANNELS,
  forceOpenChannels,
};
