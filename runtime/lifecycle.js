'use strict';

const http = require('node:http');

function startHealthServer({ port, getStatus = () => ({ ok: true }) }) {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found.' }));
      return;
    }
    const payload = { ok: true, ...getStatus() };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
  });
  server.listen(port, '0.0.0.0');
  return server;
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise(resolve => server.close(() => resolve()));
}

function installGracefulShutdown(shutdown, { timeoutMs = 15_000 } = {}) {
  let shuttingDown = false;
  const handler = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceTimer = setTimeout(() => {
      console.error(`[Lifecycle] Forced shutdown after ${timeoutMs}ms.`);
      process.exit(1);
    }, timeoutMs);

    Promise.resolve(shutdown(signal))
      .then(() => {
        clearTimeout(forceTimer);
        process.exit(0);
      })
      .catch(err => {
        clearTimeout(forceTimer);
        console.error(`[Lifecycle] Shutdown failed: ${err.message}`);
        process.exit(1);
      });
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
  return handler;
}

module.exports = { closeServer, installGracefulShutdown, startHealthServer };
