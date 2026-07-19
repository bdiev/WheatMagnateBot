'use strict';

const { EventEmitter } = require('node:events');

const ADMIN_EVENTS = new Set(['notification_created', 'admin_control_updated', 'operational_event_created']);

class SseHub extends EventEmitter {
  constructor({ maxConnectionsPerUser = 3, heartbeatMs = 25_000 } = {}) {
    super();
    this.maxConnectionsPerUser = Math.max(1, Number(maxConnectionsPerUser) || 3);
    this.heartbeatMs = Math.max(5_000, Number(heartbeatMs) || 25_000);
    this.clientsByUser = new Map();
    this.heartbeatTimer = null;
    this.nextClientId = 1;
  }

  start() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const clients of this.clientsByUser.values()) {
      for (const client of [...clients]) this.remove(client, true);
    }
  }

  countForUser(userId) {
    return this.clientsByUser.get(String(userId))?.size || 0;
  }

  get connectionCount() {
    let count = 0;
    for (const clients of this.clientsByUser.values()) count += clients.size;
    return count;
  }

  connect(user, req, res) {
    const userId = String(user.id);
    if (this.countForUser(userId) >= this.maxConnectionsPerUser) return null;
    req.setTimeout?.(0);
    res.socket?.setKeepAlive?.(true);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    const client = {
      id: this.nextClientId++, userId, username: String(user.username), role: String(user.role),
      req, res, closed: false, listeners: []
    };
    let clients = this.clientsByUser.get(userId);
    if (!clients) {
      clients = new Set();
      this.clientsByUser.set(userId, clients);
    }
    clients.add(client);

    const cleanup = () => this.remove(client);
    for (const [emitter, event] of [[req, 'close'], [req, 'aborted'], [res, 'close'], [res, 'error']]) {
      emitter.on(event, cleanup);
      client.listeners.push([emitter, event, cleanup]);
    }
    res.write('retry: 3000\nevent: connected\ndata: {"ok":true}\n\n');
    this.emit('connected', client);
    return client;
  }

  remove(client, endResponse = false) {
    if (!client || client.closed) return false;
    client.closed = true;
    for (const [emitter, event, listener] of client.listeners) emitter.removeListener(event, listener);
    client.listeners.length = 0;
    const clients = this.clientsByUser.get(client.userId);
    clients?.delete(client);
    if (clients?.size === 0) this.clientsByUser.delete(client.userId);
    if (endResponse && !client.res.writableEnded) client.res.end();
    this.emit('disconnected', client);
    return true;
  }

  canReceive(client, eventType, { roles = null, usernames = null } = {}) {
    if (ADMIN_EVENTS.has(eventType) && client.role !== 'admin') return false;
    if (roles && !roles.includes(client.role)) return false;
    if (usernames && !usernames.some(name => String(name).toLowerCase() === client.username.toLowerCase())) return false;
    return true;
  }

  publish(eventType, payload = {}, audience = {}) {
    const frame = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    let delivered = 0;
    for (const clients of this.clientsByUser.values()) {
      for (const client of [...clients]) {
        if (!this.canReceive(client, eventType, audience)) continue;
        try {
          client.res.write(frame);
          delivered++;
        } catch {
          this.remove(client);
        }
      }
    }
    return delivered;
  }

  heartbeat() {
    const frame = `: heartbeat ${Date.now()}\n\n`;
    for (const clients of this.clientsByUser.values()) {
      for (const client of [...clients]) {
        try { client.res.write(frame); } catch { this.remove(client); }
      }
    }
  }
}

async function handleSseRequest({ req, res, getCurrentUser, hub }) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch (err) {
    const status = err.statusCode || 503;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: status >= 500 ? 'Real-time service is temporarily unavailable.' : (err.message || 'Request failed.') }));
    return { accepted: false, status };
  }
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Login required.' }));
    return { accepted: false, status: 401 };
  }
  if (!hub.connect(user, req, res)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '10' });
    res.end(JSON.stringify({ error: 'Too many real-time connections for this user.' }));
    return { accepted: false, status: 429 };
  }
  return { accepted: true, status: 200, user };
}

module.exports = { SseHub, handleSseRequest, ADMIN_EVENTS };
