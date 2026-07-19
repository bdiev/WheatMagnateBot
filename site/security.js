'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function firstForwarded(value) {
  return String(value || '').split(',')[0].trim();
}

function trustProxyEnabled(value = process.env.SITE_TRUST_PROXY) {
  return /^(1|true)$/i.test(String(value || '').trim());
}

function requestIsHttps(req, trustProxy = trustProxyEnabled()) {
  if (req.socket?.encrypted === true) return true;
  return trustProxy && firstForwarded(req.headers['x-forwarded-proto']).toLowerCase() === 'https';
}

function clientIp(req, trustProxy = trustProxyEnabled()) {
  const forwarded = trustProxy ? firstForwarded(req.headers['x-forwarded-for']) : '';
  return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 128);
}

function validHost(value) {
  const host = String(value || '').trim();
  if (!host || host.length > 255 || /[\s\\/@]/.test(host)) return null;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.host === host.toLowerCase() ? parsed.host : null;
  } catch {
    return null;
  }
}

function configuredOrigins(value = process.env.SITE_ALLOWED_ORIGINS) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(item => {
    try {
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
      return url.origin;
    } catch { return null; }
  }).filter(Boolean);
}

function validateOrigin(req, { trustProxy = trustProxyEnabled(), allowedOrigins = configuredOrigins() } = {}) {
  if (!MUTATING_METHODS.has(String(req.method || '').toUpperCase())) return { ok: true };
  const rawHost = trustProxy ? firstForwarded(req.headers['x-forwarded-host']) || req.headers.host : req.headers.host;
  const host = validHost(rawHost);
  if (!host) return { ok: false, reason: 'invalid_host' };
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return { ok: false, reason: 'missing_origin' };
  let normalized;
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('invalid');
    normalized = parsed.origin;
  } catch { return { ok: false, reason: 'invalid_origin' }; }
  const expected = allowedOrigins.length
    ? allowedOrigins
    : [`${requestIsHttps(req, trustProxy) ? 'https' : 'http'}://${host}`];
  if (allowedOrigins.length && !allowedOrigins.some(item => new URL(item).host === host)) return { ok: false, reason: 'host_not_allowed' };
  return expected.includes(normalized) ? { ok: true, origin: normalized } : { ok: false, reason: 'origin_mismatch' };
}

function resolveStaticPath(rawUrl, mounts) {
  let rawPath = String(rawUrl || '/').split(/[?#]/, 1)[0];
  if (rawPath.includes('\0')) return null;
  for (let pass = 0; pass < 3; pass += 1) {
    let decoded;
    try { decoded = decodeURIComponent(rawPath); } catch { return null; }
    if (decoded.includes('\0') || decoded.includes('\\')) return null;
    const segments = decoded.split('/');
    if (segments.some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
    if (decoded === rawPath) break;
    rawPath = decoded;
  }
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const match = mounts.find(item => pathname === item.mount || pathname.startsWith(`${item.mount}/`)) || mounts.find(item => item.mount === '/');
  if (!match) return null;
  let relative = match.mount === '/' ? pathname.slice(1) : pathname.slice(match.mount.length + 1);
  if (!relative && match.index) relative = match.index;
  const segments = relative.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || segment === '..')) return null;
  const root = path.resolve(match.root);
  const candidate = path.resolve(root, ...segments);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return { root, candidate, mount: match.mount, relative };
}

class RateLimiter {
  constructor({ maxEntries = 10000, now = () => Date.now() } = {}) {
    this.entries = new Map();
    this.maxEntries = maxEntries;
    this.now = now;
  }

  consume(key, { limit, windowMs }) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry || now >= entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  prune() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (now >= entry.resetAt) this.entries.delete(key);
  }
}

function securityHeaders({ https = false } = {}) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://minotar.net https://ccvaults.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; worker-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  if (https) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function verifyCsrfToken(supplied, storedHash) {
  if (!supplied || !storedHash) return false;
  const actual = crypto.createHash('sha256').update(String(supplied)).digest();
  let expected;
  try { expected = Buffer.from(String(storedHash), 'hex'); } catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { MUTATING_METHODS, RateLimiter, clientIp, configuredOrigins, requestIsHttps, resolveStaticPath, securityHeaders, trustProxyEnabled, validateOrigin, validHost, verifyCsrfToken };
