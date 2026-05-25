'use strict';

// Process-wide event bus used to decouple state-mutating modules
// (logger, connection, text channel) from the transport layers that
// expose those events to the GUI (WebSocket broadcast).
//
// Conventions for event names:
//   'log'          — { time, level, msg, data? }   new protocol log entry
//   'state'        — { ...full connection state }  state changed, full snapshot
//   'text_session' — { active, sessionId? }        text session active flag changed

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

module.exports = bus;
