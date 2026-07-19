'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { RateLimiter, configuredOrigins, requestIsHttps, resolveStaticPath, securityHeaders, validateOrigin, verifyCsrfToken } = require('../security');
const { assertAdminUser, hashPassword, normalizeNavigationPreferences, registrationDefaults, server, verifyPassword } = require('../server');

function request(method, headers = {}, encrypted = false) {
  return { method, headers, socket: { encrypted, remoteAddress: '127.0.0.1' } };
}

function testAdminNameCannotEscalate() {
  assert.deepEqual(registrationDefaults('bdiev_'), { role: 'user', status: 'pending' });
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
  assert.equal(limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 }).allowed, false, 'brute force must become HTTP 429 at the handler boundary');
  now += 1001;
  assert.equal(limiter.consume('login:ip:user', { limit: 3, windowMs: 1000 }).allowed, true);
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

function testNormalAuthAndAdminRemainValid() {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.doesNotThrow(() => assertAdminUser({ role: 'admin' }));
  assert.throws(() => assertAdminUser({ role: 'user' }), /Admin access required/);
}

function testHeadersAndCsrfContract() {
  const headers = securityHeaders({ https: true });
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(headers['Strict-Transport-Security']);
  const csrf = 'random-csrf-token';
  const stored = require('node:crypto').createHash('sha256').update(csrf).digest('hex');
  assert.equal(verifyCsrfToken('', stored), false, 'missing CSRF must be rejected');
  assert.equal(verifyCsrfToken('wrong', stored), false);
  assert.equal(verifyCsrfToken(csrf, stored), true);
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
    assert.equal((await httpRequest(port, '/%252e%252e/server.js')).status, 403);
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
  testOriginValidation();
  testStaticTraversal();
  testNormalAuthAndAdminRemainValid();
  testHeadersAndCsrfContract();
  await testHttpBoundary();
  console.log('Security hardening tests passed.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
