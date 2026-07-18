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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function authSecurityConfig(env = process.env) {
  return {
    login: {
      maxAttempts: positiveInteger(env.SITE_LOGIN_MAX_ATTEMPTS, 20),
      maxFailures: positiveInteger(env.SITE_LOGIN_MAX_FAILURES, 5),
      windowMs: positiveInteger(env.SITE_LOGIN_WINDOW_SECONDS, 15 * 60) * 1000,
      blockMs: positiveInteger(env.SITE_LOGIN_BLOCK_SECONDS, 15 * 60) * 1000
    },
    register: {
      maxAttempts: positiveInteger(env.SITE_REGISTER_MAX_ATTEMPTS, 10),
      maxFailures: positiveInteger(env.SITE_REGISTER_MAX_FAILURES, 5),
      windowMs: positiveInteger(env.SITE_REGISTER_WINDOW_SECONDS, 60 * 60) * 1000,
      blockMs: positiveInteger(env.SITE_REGISTER_BLOCK_SECONDS, 30 * 60) * 1000
    }
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

function getRequestIp(req, env = process.env) {
  // Forwarded headers are ignored unless explicitly trusted so clients cannot
  // choose their own rate-limit key.
  if (env.SITE_TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 128);
}

function expectedOrigin(req, env = process.env) {
  if (env.SITE_PUBLIC_ORIGIN) return String(env.SITE_PUBLIC_ORIGIN).replace(/\/$/, '');
  const protocol = req.socket?.encrypted ? 'https' : 'http';
  return `${protocol}://${req.headers.host || 'localhost'}`;
}

function assertSameOrigin(req, env = process.env) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!origin || origin !== expectedOrigin(req, env)) {
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
  getRequestIp,
  positiveInteger
};
