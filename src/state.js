'use strict';

// Shared mutable application state.
//
// CommonJS module exports are not live bindings, so we wrap state in
// an object and mutate the fields on that object. Modules `require`
// this once and then read/write `state.sgClient`, etc. The single
// shared reference means every module sees every update.
//
// Long-term this could become a proper class with explicit setters
// that emit change events; for now the codebase is small enough that
// the flat object is easier to read.

const state = {
  // SmartGlass client + connection lifecycle
  sgClient: null,
  connectionStatus: 'disconnected', // 'disconnected' | 'discovering' | 'connecting' | 'connected'
  connectedConsole: null,           // { ip } when connected
  lastError: null,
  inputReady: false,                // true once at least one input channel is open
  reconnectTimer: null,             // setTimeout handle for the auto-reconnect attempt
  connectionGeneration: 0,          // bumped on every (re)connect to invalidate stale callbacks
  channelCheckInterval: null,       // setInterval handle while polling channel readiness

  // Text channel (we manage this one ourselves; the library has no manager for it)
  textChannelId: null,
  textChannelOpen: false,
  textSessionId: 0,
  textVersion: 0,
  currentText: '',
  textSessionActive: false,         // true between SystemTextConfiguration and TextDone

  // Input throttle (set by input module)
  lastButtonTime: 0,
};

// Build a snapshot of the current channel-open status for inclusion in
// the GUI state broadcast. Reads through `sgClient._managers` which is
// an internal of the xbox-smartglass-core-node library; if that
// internal shape changes we'll need to update this.
function getChannelStatus() {
  if (!state.sgClient) return {};
  const result = {};
  for (const name of Object.keys(state.sgClient._managers)) {
    const mgr = state.sgClient._managers[name];
    result[name] = {
      status: mgr._channel_manager ? mgr._channel_manager.getStatus() : 'unknown',
      channelId: mgr._channel_manager ? mgr._channel_manager._channel_server_id : null,
      clientId: mgr._channel_manager ? mgr._channel_manager._channel_client_id : null,
    };
  }
  result.system_text = {
    status: state.textChannelOpen,
    channelId: state.textChannelId ? Buffer.from(state.textChannelId).toString('hex') : null,
    sessionActive: state.textSessionActive,
  };
  return result;
}

function snapshot() {
  return {
    status: state.connectionStatus,
    console: state.connectedConsole,
    inputReady: state.inputReady,
    lastError: state.lastError,
    activeApp: state.sgClient ? state.sgClient.getActiveApp() : null,
    channelStatus: getChannelStatus(),
  };
}

module.exports = state;
module.exports.getChannelStatus = getChannelStatus;
module.exports.snapshot = snapshot;
