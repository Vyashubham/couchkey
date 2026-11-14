'use strict';

// Entry point: builds the Express + WebSocket server, wires the
// transport layers to the domain modules, and starts listening.
// All connection lifecycle, protocol packet construction, and input
// logic lives under src/.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const config = require('./src/config');

if (config.smartglassDebug) {
  process.env.DEBUG = 'smartglass:*';
}

const { paths: logPaths } = require('./src/logger');
const { registerHttpRoutes } = require('./src/server/http');
const { attachWebSocket } = require('./src/server/ws');
const { loadLayouts } = require('./src/osk/registry');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

loadLayouts();
registerHttpRoutes(app);
attachWebSocket(wss);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`
couchkey listening on http://localhost:${config.port}

Session log: ${logPaths.sessionLog}
Latest log:  ${logPaths.latestLog}
`);
});
