'use strict';

const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'sha256-PrUjU/2gw9qIDlkVbSMZQeSHb3xV4iWiuddra53BBcg='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://minotar.net",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'"
].join('; ');

function authSecurityConfig(siteConfig = {}) {
  return {
    login: siteConfig.loginRateLimit || { maxAttempts: 20, maxFailures: 5, windowMs: 900_000, blockMs: 900_000 },
    register: siteConfig.registerRateLimit || { maxAttempts: 10, maxFailures: 5, windowMs: 3_600_000, blockMs: 1_800_000 }
  };
}

class AuthRateLimiter {
  constructor(config = authSecurityConfig(), now = () => Date.now()) {
    this.config = config;
    this.now = now;
    this.entries = new Map();
  }

  keys(action, ip, username) {
    const normalizedIp = String(ip || 'unknown').trim() || 'unknown';
    const normalizedUsername = String(username || '').trim().toLowerCase() || '<empty>';
    return [`${action}:ip:${normalizedIp}`, `${action}:username:${normalizedUsername}`];
  }

  currentEntry(key, action, create = false) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (entry && now - entry.windowStartedAt >= this.config[action].windowMs && entry.blockedUntil <= now) {
      this.entries.delete(key);
      entry = null;
    }
    if (!entry && create) {
      entry = { attempts: 0, failures: 0, windowStartedAt: now, blockedUntil: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  check(action, ip, username) {
    const now = this.now();
    let retryAfterMs = 0;
    for (const key of this.keys(action, ip, username)) {
      const entry = this.currentEntry(key, action);
      if (!entry) continue;
      if (entry.blockedUntil > now) retryAfterMs = Math.max(retryAfterMs, entry.blockedUntil - now);
      if (entry.attempts >= this.config[action].maxAttempts) {
        retryAfterMs = Math.max(retryAfterMs, entry.windowStartedAt + this.config[action].windowMs - now);
      }
    }
    return { allowed: retryAfterMs <= 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  recordAttempt(action, ip, username) {
    for (const key of this.keys(action, ip, username)) this.currentEntry(key, action, true).attempts += 1;
  }

  recordFailure(action, ip, username) {
    const now = this.now();
    for (const key of this.keys(action, ip, username)) {
      const entry = this.currentEntry(key, action, true);
      entry.failures += 1;
      if (entry.failures >= this.config[action].maxFailures) {
        entry.blockedUntil = Math.max(entry.blockedUntil, now + this.config[action].blockMs);
      }
    }
  }

  recordSuccess(action, ip, username, { preserveAttempts = false } = {}) {
    for (const key of this.keys(action, ip, username)) {
      if (!preserveAttempts) {
        this.entries.delete(key);
        continue;
      }
      const entry = this.currentEntry(key, action);
      if (entry) {
        entry.failures = 0;
        entry.blockedUntil = 0;
      }
    }
  }
}

function getRequestIp(req, { trustProxy = false } = {}) {
  // Forwarded headers are ignored unless explicitly trusted so clients cannot
  // choose their own rate-limit key.
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 128);
}

function expectedOrigin(req, { publicOrigin = null } = {}) {
  if (publicOrigin) return String(publicOrigin).replace(/\/$/, '');
  const protocol = req.socket?.encrypted ? 'https' : 'http';
  return `${protocol}://${req.headers.host || 'localhost'}`;
}

function assertSameOrigin(req, options = {}) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!origin || origin !== expectedOrigin(req, options)) {
    const err = new Error('Request origin is not allowed.');
    err.statusCode = 403;
    err.code = 'INVALID_ORIGIN';
    throw err;
  }
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', DEFAULT_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

module.exports = {
  AuthRateLimiter,
  DEFAULT_CSP,
  applySecurityHeaders,
  assertSameOrigin,
  authSecurityConfig,
  expectedOrigin,
  getRequestIp
};
