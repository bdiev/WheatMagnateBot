'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AuthRateLimiter,
  DEFAULT_CSP,
  applySecurityHeaders,
  assertSameOrigin
} = require('./security');
const {
  auditLogin,
  changePasswordAndInvalidateSessions,
  createSession,
  invalidateUserSessions,
  publicErrorMessage,
  sessionCookieValue,
  updateAdminUser
} = require('./server');

function limiterConfig() {
  return {
    login: { maxAttempts: 20, maxFailures: 3, windowMs: 60_000, blockMs: 30_000 },
    register: { maxAttempts: 2, maxFailures: 2, windowMs: 60_000, blockMs: 30_000 }
  };
}

test('login failures temporarily block both the IP and normalized username', () => {
  let now = 1_000;
  const limiter = new AuthRateLimiter(limiterConfig(), () => now);
  for (let index = 0; index < 3; index += 1) {
    limiter.recordAttempt('login', '203.0.113.4', 'Alice');
    limiter.recordFailure('login', '203.0.113.4', 'Alice');
  }

  assert.equal(limiter.check('login', '203.0.113.4', 'someone-else').allowed, false);
  assert.equal(limiter.check('login', '198.51.100.8', 'alice').allowed, false);
  assert.equal(limiter.check('login', '198.51.100.8', 'someone-else').allowed, true);

  now += 30_001;
  assert.equal(limiter.check('login', '203.0.113.4', 'Alice').allowed, true);
});

test('successful registrations still count toward the per-IP and per-username request limit', () => {
  const limiter = new AuthRateLimiter(limiterConfig());
  for (let index = 0; index < 2; index += 1) {
    limiter.recordAttempt('register', '203.0.113.9', 'new-user');
    limiter.recordSuccess('register', '203.0.113.9', 'new-user', { preserveAttempts: true });
  }
  assert.equal(limiter.check('register', '203.0.113.9', 'another-user').allowed, false);
  assert.equal(limiter.check('register', '198.51.100.9', 'NEW-USER').allowed, false);
});

test('mutating requests require the configured same Origin', () => {
  const request = {
    method: 'POST',
    headers: { host: 'panel.example', origin: 'https://panel.example' },
    socket: {}
  };
  assert.doesNotThrow(() => assertSameOrigin(request, { publicOrigin: 'https://panel.example/' }));
  assert.throws(
    () => assertSameOrigin({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }, { publicOrigin: 'https://panel.example' }),
    err => err.statusCode === 403 && err.code === 'INVALID_ORIGIN'
  );
  assert.throws(
    () => assertSameOrigin({ ...request, headers: { host: 'panel.example' } }, { publicOrigin: 'https://panel.example' }),
    err => err.statusCode === 403
  );
});

test('security headers include CSP, anti-sniffing, referrer and frame protections', () => {
  const headers = {};
  applySecurityHeaders({ setHeader(name, value) { headers[name] = value; } });
  assert.equal(headers['Content-Security-Policy'], DEFAULT_CSP);
  assert.match(DEFAULT_CSP, /frame-ancestors 'none'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['X-Frame-Options'], 'DENY');
});

test('session cookies are HttpOnly, Strict, configurable and Secure in production mode', () => {
  const cookie = sessionCookieValue('secret token', { maxAge: 1234, secure: true });
  assert.match(cookie, /^wm_session=secret%20token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=1234/);
  assert.match(cookie, /; Secure$/);
});

test('creating a session rotates the presented token before storing a new one', async () => {
  const queries = [];
  const db = { async query(sql, params) { queries.push({ sql, params }); return { rowCount: 1, rows: [] }; } };
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; } };
  await createSession(res, 42, db, 'old-token');

  assert.match(queries[0].sql, /DELETE FROM site_sessions WHERE token_hash/);
  assert.match(queries[1].sql, /INSERT INTO site_sessions/);
  assert.notEqual(queries[0].params[0], queries[1].params[0]);
  assert.match(headers['Set-Cookie'], /^wm_session=/);
});

test('session invalidation removes every session for a user', async () => {
  const queries = [];
  await invalidateUserSessions({ async query(sql, params) { queries.push({ sql, params }); } }, 77);
  assert.match(queries[0].sql, /DELETE FROM site_sessions WHERE user_id = \$1/);
  assert.deepEqual(queries[0].params, [77]);
});

test('password change and session revocation are committed atomically', async () => {
  const statements = [];
  const client = {
    async query(sql) { statements.push(sql.trim()); },
    release() { statements.push('RELEASE'); }
  };
  const db = { async connect() { return client; } };
  await changePasswordAndInvalidateSessions(db, 12, 'new-hash');
  assert.equal(statements[0], 'BEGIN');
  assert.match(statements[1], /^UPDATE site_users SET password_hash/);
  assert.match(statements[2], /^DELETE FROM site_sessions WHERE user_id/);
  assert.equal(statements[3], 'COMMIT');
  assert.equal(statements[4], 'RELEASE');
});

test('blocking an account revokes all sessions', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT id, username, role, status/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 5, username: 'target', role: 'user', status: 'approved' }] };
      }
      if (/SELECT id, username, role, status, created_at/.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    }
  };
  await updateAdminUser(
    { id: 1, username: 'admin', role: 'admin', status: 'approved' },
    { username: 'target', action: 'block' },
    db
  );
  assert.ok(queries.some(query => /SET status = 'blocked'/.test(query.sql)));
  assert.ok(queries.some(query => /DELETE FROM site_sessions WHERE user_id/.test(query.sql)));
});

test('deleting an account explicitly revokes sessions before deleting the user', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT id, username, role, status\s+FROM site_users/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 8, username: 'target', role: 'user', status: 'pending' }] };
      }
      if (/DELETE FROM site_users/.test(sql)) return { rowCount: 1, rows: [{ id: 8 }] };
      if (/ORDER BY/.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    }
  };
  await updateAdminUser(
    { id: 1, username: 'admin', role: 'admin', status: 'approved' },
    { username: 'target', action: 'delete' },
    db
  );
  const revokeIndex = queries.findIndex(query => /DELETE FROM site_sessions WHERE user_id/.test(query.sql));
  const deleteIndex = queries.findIndex(query => /DELETE FROM site_users/.test(query.sql));
  assert.ok(revokeIndex >= 0 && deleteIndex > revokeIndex);
});

test('PostgreSQL details are not exposed as public server errors', () => {
  const error = new Error('duplicate key violates unique constraint site_users_username_lower_idx');
  error.code = '23505';
  assert.equal(publicErrorMessage(error), 'Internal server error.');
});

test('login audit records outcomes and metadata but never a password', async () => {
  let event;
  await auditLogin(
    { username: 'Alice', ip: '203.0.113.7', successful: false, reason: 'invalid_credentials' },
    async value => { event = value; }
  );
  assert.equal(event.category, 'auth_login');
  assert.equal(event.details.successful, false);
  assert.equal(event.details.ip, '203.0.113.7');
  assert.equal(JSON.stringify(event).includes('password'), false);
});
