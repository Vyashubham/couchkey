'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const state = require('../state');
const { getRecentLogs, paths: logPaths } = require('../logger');
const { discoverConsoles, connectToConsole, disconnect } = require('../xbox/connection');

const { PUBLIC_DIR } = require('../paths');

const RECENT_LOGS_HTTP_COUNT = 200;

function registerHttpRoutes(app) {
  app.use(express.static(PUBLIC_DIR));
  app.use(express.json());

  app.get('/api/status', (req, res) => {
    res.json(state.snapshot());
  });

  app.get('/api/logs', (req, res) => {
    res.json(getRecentLogs(RECENT_LOGS_HTTP_COUNT));
  });

  app.get('/api/logs/download', (req, res) => {
    if (!fs.existsSync(logPaths.sessionLog)) {
      return res.status(404).json({ error: 'No log file yet' });
    }
    res.download(logPaths.sessionLog);
  });

  app.get('/api/logs/download-json', (req, res) => {
    if (!fs.existsSync(logPaths.sessionJson)) {
      return res.status(404).json({ error: 'No log file yet' });
    }
    res.download(logPaths.sessionJson);
  });

  app.get('/api/logs/list', (req, res) => {
    if (!fs.existsSync(logPaths.logDir)) return res.json([]);
    const files = fs.readdirSync(logPaths.logDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.log'))
      .map(f => {
        const stat = fs.statSync(path.join(logPaths.logDir, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  });

  app.post('/api/discover', async (req, res) => {
    try {
      const consoles = await discoverConsoles(req.body.ip);
      res.json({
        ok: true,
        consoles: consoles.map(c => ({
          name: c.message.name || 'Xbox',
          ip: c.remote.address,
          type: c.message.type,
        })),
      });
    } catch (err) {
      res.json({ ok: false, error: err.message || 'Discovery failed' });
    }
  });

  app.post('/api/connect', async (req, res) => {
    try {
      await connectToConsole(req.body.ip);
      res.json({ ok: true });
    } catch (err) {
      res.json({ ok: false, error: state.lastError || 'Connection failed' });
    }
  });

  app.post('/api/disconnect', (req, res) => {
    disconnect();
    res.json({ ok: true });
  });
}

module.exports = {
  registerHttpRoutes,
};
