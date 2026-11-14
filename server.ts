// Entry point: builds the Express + WebSocket server, wires the
// transport layers to the domain modules, and starts listening.
// All connection lifecycle, protocol packet construction, and input
// logic lives under src/.

import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import config from './src/config';

if (config.smartglassDebug) {
  process.env.DEBUG = 'smartglass:*';
}

// Legacy CommonJS modules (rewritten in TypeScript during M2). Loaded
// after DEBUG is set so the SmartGlass library picks it up.
/* eslint-disable @typescript-eslint/no-require-imports */
const { plog, paths: logPaths } = require('./src/logger') as typeof import('./src/logger');
const { registerHttpRoutes } = require('./src/server/http') as typeof import('./src/server/http');
const { attachWebSocket } = require('./src/server/ws') as typeof import('./src/server/ws');
/* eslint-enable @typescript-eslint/no-require-imports */
import { loadLayouts } from './src/osk/registry';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

loadLayouts(undefined, (file, err) => {
  plog('err', `Bad OSK layout ${file}: ${err.message}`);
});
registerHttpRoutes(app);
attachWebSocket(wss);

server.listen(config.port, () => {
  console.log(`
couchkey listening on http://localhost:${config.port}

Session log: ${logPaths.sessionLog}
Latest log:  ${logPaths.latestLog}
`);
});
