'use strict';

// The xbox-smartglass-core-node library installs a 1-second tick that:
//   - sends a keep-alive Acknowledge packet exactly 4 seconds after the
//     last received packet, and
//   - aborts the connection after 8 seconds of silence.
//
// Two problems for our use case:
//   1. Under rapid gamepad input, the event loop is saturated with
//      outgoing sends; the inbound acks queue up and the 'received'
//      timestamp falls behind even though the Xbox is healthy.
//   2. The library's keep-alive fires only once. If the first one
//      doesn't bring fresh inbound traffic, we're already past the 8s
//      mark before the next opportunity.
//
// We replace the library's interval with our own that:
//   - sends keep-alive acks every keepAliveIntervalSec, repeatedly
//   - tolerates timeoutSec seconds of silence before giving up
//   - never modifies node_modules — installs at runtime from the
//     established sgClient.

const Packer = require('xbox-smartglass-core-node/src/packet/packer');

const config = require('../config');
const { plog } = require('../logger');

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sendKeepAliveAck(sgClient) {
  try {
    const xbox = sgClient._console;
    xbox.get_requestnum();
    const ack = Packer('message.acknowledge');
    ack.set('low_watermark', xbox._request_num);
    sgClient._send(ack.pack(xbox));
  } catch (e) {
    plog('warn', `Keep-alive send failed: ${e.message}`);
  }
}

// Replace the library's heartbeat interval with our own, more tolerant
// loop. Returns a cleanup function that clears the new interval.
function installHeartbeat(sgClient, { onTimeout }) {
  if (sgClient._interval_timeout) {
    clearInterval(sgClient._interval_timeout);
    sgClient._interval_timeout = false;
  }

  const handle = setInterval(() => {
    if (!sgClient._connection_status) {
      clearInterval(handle);
      return;
    }

    const secondsSinceReceive = nowSec() - sgClient._last_received_time;

    if (secondsSinceReceive >= config.heartbeatKeepAliveAfterSec
        && secondsSinceReceive % config.heartbeatKeepAliveIntervalSec === 0) {
      sendKeepAliveAck(sgClient);
    }

    if (secondsSinceReceive > config.heartbeatTimeoutSec) {
      plog('err', `Heartbeat timeout: ${secondsSinceReceive}s since last received packet`);
      clearInterval(handle);
      try { sgClient._closeClient(); } catch (_) { /* ignore */ }
      if (onTimeout) onTimeout();
    }
  }, 1000);

  sgClient._interval_timeout = handle;
  return () => {
    clearInterval(handle);
    if (sgClient._interval_timeout === handle) sgClient._interval_timeout = false;
  };
}

module.exports = {
  installHeartbeat,
};
