'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { RateLimiter, configuredOrigins, requestIsHttps, resolveStaticPath, securityHeaders, validateOrigin, verifyCsrfToken } = require('../security');
const { adminReadRateLimitSubject, assertAdminUser, changeSitePassword, csrfTokenForSessionHash, hashPassword, normalizeNavigationPreferences, normalizePlayerInfoRefreshRequest, registrationDefaults, server, shouldRecordStaticSecurityEvent, validatePasswordChange, verifyPassword } = require('../server');

function request(method, headers = {}, encrypted = false) {
  return { method, headers, socket: { encrypted, remoteAddress: '127.0.0.1' } };
}

function testAdminNameCannotEscalate() {
  assert.deepEqual(registrationDefaults('bdiev_'), { role: 'user', status: 'pending' });
  assert.deepEqual(
    normalizePlayerInfoRefreshRequest({ metric: 'playtime', username: 'bdiev_' }, '!pt bdiev_'),
    { metric: 'playtime', username: 'bdiev_' },
    'profile refresh metadata must match the exact command sent to Minecraft'
  );
  assert.deepEqual(
    normalizePlayerInfoRefreshRequest({ metric: 'lastSeen', username: 'bdiev_' }, '!seen bdiev_'),
    { metric: 'lastSeen', username: 'bdiev_' },
    'last-seen refresh metadata must match the exact !seen command'
  );
  assert.deepEqual(
    normalizePlayerInfoRefreshRequest({ metric: 'messages', username: 'bdiev_' }, '!messages bdiev_'),
    { metric: 'messages', username: 'bdiev_' },
    'message-count refresh metadata must match the exact !messages command'
  );
  assert.throws(
    () => normalizePlayerInfoRefreshRequest({ metric: 'joinDate', username: 'bdiev_' }, '!pt bdiev_'),
    error => error.statusCode === 400,
    'ordinary chat requests must not forge a mismatched profile refresh authorization'
  );
}

function testNavigationPreferencesAreNormalized() {
  const value = normalizeNavigationPreferences({
    visibility: { chat: false, settings: false, unknown: true, bot: 'false' },
    order: ['settings', 'chat', 'settings', 'unknown']
  });
  assert.deepEqual(value.visibility, { chat: false }, 'only valid boolean visibility settings may be stored');
  assert.equal(value.order[0], 'settings');
  assert.equal(value.order[1], 'chat');
  assert.equal(new Set(value.order).size, value.order.length, 'navigation order must not contain duplicates');
  assert.equal(value.order.includes('unknown'), false);
}

function testRateLimit() {
  let now = 1000;
  const limiter = new RateLimiter({ now: () => now });
  for (let i = 0; i < 3; i += 1) assert.equal(limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 }).allowed, true);
  const firstExceeded = limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 });
  assert.equal(firstExceeded.allowed, false, 'brute force must become HTTP 429 at the handler boundary');
  assert.equal(firstExceeded.firstExceeded, true, 'the first rejected request should be auditable');
  assert.equal(limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 }).firstExceeded, false, 'repeated rejected requests must not spam the audit log');
  now += 1001;
  assert.equal(limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 }).allowed, true);
}

function testAdminReadRateLimitScopes() {
  assert.equal(adminReadRateLimitSubject('Bdiev_', '/api/admin/players'), 'bdiev_:players');
  assert.equal(adminReadRateLimitSubject('Bdiev_', '/api/admin/users'), 'bdiev_:users');
  assert.equal(
    adminReadRateLimitSubject('Bdiev_', '/api/admin/system-logs/42/debug'),
    adminReadRateLimitSubject('bdiev_', '/api/admin/system-logs/99/debug'),
    'dynamic resource IDs must not create rate-limit bypasses'
  );
}

function testOriginValidation() {
  const good = request('POST', { host: 'dashboard.example', origin: 'https://dashboard.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'dashboard.example' });
  assert.equal(validateOrigin(good, { trustProxy: true, allowedOrigins: [] }).ok, true);
  assert.equal(requestIsHttps(good, true), true);
  const wrong = request('DELETE', { host: 'dashboard.example', origin: 'https://evil.example' });
  assert.deepEqual(validateOrigin(wrong, { trustProxy: false, allowedOrigins: [] }), { ok: false, reason: 'origin_mismatch' });
  assert.equal(validateOrigin(request('PATCH', { host: 'dashboard.example' }), { allowedOrigins: [] }).ok, false);

  const previousSiteOrigins = process.env.SITE_ALLOWED_ORIGINS;
  const previousCoolifyUrl = process.env.COOLIFY_URL;
  try {
    delete process.env.SITE_ALLOWED_ORIGINS;
    process.env.COOLIFY_URL = 'https://dashboard.example/';
    const coolifyOrigins = configuredOrigins();
    assert.deepEqual(coolifyOrigins, ['https://dashboard.example']);
    assert.equal(validateOrigin(request('POST', { host: 'dashboard.example', origin: 'https://dashboard.example' }), {
      trustProxy: false, allowedOrigins: coolifyOrigins
    }).ok, true, 'Coolify public HTTPS URL must be accepted even though the internal socket is HTTP');
    assert.equal(requestIsHttps(request('POST', { host: 'dashboard.example', origin: 'https://dashboard.example' }), false, coolifyOrigins), true,
      'an exact configured HTTPS public origin must produce Secure cookies without trusting forwarded headers');
  } finally {
    if (previousSiteOrigins === undefined) delete process.env.SITE_ALLOWED_ORIGINS; else process.env.SITE_ALLOWED_ORIGINS = previousSiteOrigins;
    if (previousCoolifyUrl === undefined) delete process.env.COOLIFY_URL; else process.env.COOLIFY_URL = previousCoolifyUrl;
  }
}

function testStaticTraversal() {
  const publicRoot = path.resolve(__dirname, '..', 'public');
  const mounts = [{ mount: '/', root: publicRoot, index: 'index.html' }];
  assert.equal(resolveStaticPath('/../server.js', mounts), null);
  assert.equal(resolveStaticPath('/%2e%2e/server.js', mounts), null);
  assert.equal(resolveStaticPath('/%252e%252e/server.js', mounts), null);
  assert.equal(resolveStaticPath('/.env', mounts), null);
  assert.equal(resolveStaticPath('/%00.txt', mounts), null);
  assert.equal(resolveStaticPath('/app.js', mounts).candidate, path.join(publicRoot, 'app.js'));
}

function testStaticSecurityAuditDeduplication() {
  let now = 1_000;
  const limiter = new RateLimiter({ now: () => now });
  const firstScanner = request('GET');
  firstScanner.socket.remoteAddress = '203.0.113.10';
  const secondScanner = request('GET');
  secondScanner.socket.remoteAddress = '203.0.113.11';

  assert.equal(shouldRecordStaticSecurityEvent(firstScanner, 'invalid_static_path', limiter, 60_000), true,
    'the first unsafe static request must remain auditable');
  assert.equal(shouldRecordStaticSecurityEvent(firstScanner, 'invalid_static_path', limiter, 60_000), false,
    'repeated probes from the same IP must not flood the audit log');
  assert.equal(shouldRecordStaticSecurityEvent(firstScanner, 'static_symlink_escape', limiter, 60_000), true,
    'different static security reasons must be audited independently');
  assert.equal(shouldRecordStaticSecurityEvent(secondScanner, 'invalid_static_path', limiter, 60_000), true,
    'a different source IP must retain its own audit entry');
  now += 60_001;
  assert.equal(shouldRecordStaticSecurityEvent(firstScanner, 'invalid_static_path', limiter, 60_000), true,
    'the source must become auditable again after the deduplication window');
}

function testNormalAuthAndAdminRemainValid() {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.doesNotThrow(() => assertAdminUser({ role: 'admin' }));
  assert.throws(() => assertAdminUser({ role: 'user' }), /Admin access required/);
}

function testPasswordChangeValidation() {
  assert.deepEqual(validatePasswordChange({
    currentPassword: 'old password', newPassword: 'new password', confirmPassword: 'new password'
  }), { currentPassword: 'old password', newPassword: 'new password' });
  assert.throws(() => validatePasswordChange({ currentPassword: '', newPassword: 'new password', confirmPassword: 'new password' }), /Current password is required/);
  assert.throws(() => validatePasswordChange({ currentPassword: 'old password', newPassword: 'short', confirmPassword: 'short' }), /between 6 and 256/);
  assert.throws(() => validatePasswordChange({ currentPassword: 'old password', newPassword: 'new password', confirmPassword: 'different' }), /does not match/);
  assert.throws(() => validatePasswordChange({ currentPassword: 'same password', newPassword: 'same password', confirmPassword: 'same password' }), /must be different/);
}

async function testPasswordChangeTransaction() {
  let storedHash = hashPassword('old password');
  let signedOutSessions = 0;
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push(sql);
      if (sql.startsWith('SELECT password_hash')) return { rows: [{ password_hash: storedHash }], rowCount: 1 };
      if (sql.startsWith('UPDATE site_users')) { storedHash = params[0]; return { rows: [], rowCount: 1 }; }
      if (sql.startsWith('DELETE FROM site_sessions')) { signedOutSessions = 2; return { rows: [], rowCount: signedOutSessions }; }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const database = { async connect() { return client; } };
  const result = await changeSitePassword({ id: '7' }, 'current-session', {
    currentPassword: 'old password', newPassword: 'new password', confirmPassword: 'new password'
  }, database);
  assert.deepEqual(result, { ok: true, signedOutSessions: 2 });
  assert.equal(verifyPassword('new password', storedHash), true);
  assert.ok(statements.includes('COMMIT'));
}

function testHeadersAndCsrfContract() {
  const headers = securityHeaders({ https: true });
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /https:\/\/cdn\.discordapp\.com/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(headers['Strict-Transport-Security']);
  const csrf = 'random-csrf-token';
  const stored = require('node:crypto').createHash('sha256').update(csrf).digest('hex');
  assert.equal(verifyCsrfToken('', stored), false, 'missing CSRF must be rejected');
  assert.equal(verifyCsrfToken('wrong', stored), false);
  assert.equal(verifyCsrfToken(csrf, stored), true);
}

function testCsrfTokenIsStablePerSession() {
  const firstSession = 'a'.repeat(64);
  const secondSession = 'b'.repeat(64);
  const firstToken = csrfTokenForSessionHash(firstSession);
  assert.equal(csrfTokenForSessionHash(firstSession), firstToken,
    'opening or refreshing another tab must not rotate the session CSRF token');
  assert.notEqual(csrfTokenForSessionHash(secondSession), firstToken,
    'different sessions must receive different CSRF tokens');
  const stored = require('node:crypto').createHash('sha256').update(firstToken).digest('hex');
  assert.equal(verifyCsrfToken(firstToken, stored), true,
    'the stable session token must keep the existing hashed verification contract');
}

function httpRequest(port, requestPath, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: requestPath, method, headers: { Host: 'localhost', ...headers } }, res => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function testHttpBoundary() {
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const port = server.address().port;
    const page = await httpRequest(port, '/index.html');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    const requestPage = await httpRequest(port, '/request');
    assert.equal(requestPage.status, 200);
    assert.match(requestPage.body, /<title>Resource Requests — WheatMagnateBot<\/title>/);
    assert.equal((await httpRequest(port, '/%252e%252e/server.js')).status, 403);
    assert.equal((await httpRequest(port, '/.git/config')).status, 403,
      'audit deduplication must never allow a repeated unsafe static request');
    const crossOrigin = await httpRequest(port, '/api/auth/login', {
      method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(crossOrigin.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  testAdminNameCannotEscalate();
  testNavigationPreferencesAreNormalized();
  testRateLimit();
  testAdminReadRateLimitScopes();
  testOriginValidation();
  testStaticTraversal();
  testStaticSecurityAuditDeduplication();
  testNormalAuthAndAdminRemainValid();
  testPasswordChangeValidation();
  await testPasswordChangeTransaction();
  testHeadersAndCsrfContract();
  testCsrfTokenIsStablePerSession();
  await testHttpBoundary();
  console.log('Security hardening tests passed.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
