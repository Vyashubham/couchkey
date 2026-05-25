'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./config');
const bus = require('./bus');

const LEVEL_ICONS = {
  info: 'i',
  ok: '+',
  warn: '!',
  err: 'x',
  proto: '~',
};

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const logDir = config.logDir;
fs.mkdirSync(logDir, { recursive: true });

const sessionLogPath = path.join(logDir, `session-${sessionTimestamp}.log`);
const sessionJsonPath = path.join(logDir, `session-${sessionTimestamp}.jsonl`);
const latestLogPath = path.join(logDir, 'latest.log');
const latestJsonPath = path.join(logDir, 'latest.jsonl');

// Truncate latest.* at the start of every process so they always
// reflect just this session.
try {
  fs.writeFileSync(latestLogPath, '');
  fs.writeFileSync(latestJsonPath, '');
} catch (e) {
  // non-fatal; we'll log to console below
  // eslint-disable-next-line no-console
  console.warn('Could not truncate latest log files:', e.message);
}

const ringBuffer = [];

function appendIgnore(file, data) {
  fs.appendFile(file, data, () => {});
}

function plog(level, msg, data) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    data: data === undefined ? undefined : JSON.stringify(data, null, 2),
  };

  ringBuffer.push(entry);
  if (ringBuffer.length > config.protocolLogRingBufferSize) ringBuffer.shift();

  const icon = LEVEL_ICONS[level] || '.';
  // eslint-disable-next-line no-console
  console.log(`[${icon}] ${msg}`);
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console.log('   ', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }

  const timeShort = entry.time.slice(11, 23);
  const levelPad = level.toUpperCase().padEnd(5);
  let line = `[${timeShort}] ${levelPad} ${msg}\n`;
  if (entry.data) line += `               ${entry.data}\n`;
  appendIgnore(sessionLogPath, line);
  appendIgnore(latestLogPath, line);

  const json = JSON.stringify(entry) + '\n';
  appendIgnore(sessionJsonPath, json);
  appendIgnore(latestJsonPath, json);

  bus.emit('log', entry);
}

function getRecentLogs(count) {
  if (typeof count !== 'number') return ringBuffer.slice();
  return ringBuffer.slice(-count);
}

module.exports = {
  plog,
  getRecentLogs,
  paths: {
    sessionLog: sessionLogPath,
    sessionJson: sessionJsonPath,
    latestLog: latestLogPath,
    latestJson: latestJsonPath,
    logDir,
  },
};
