'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const {
  bootstrapAdminFromEnvironment,
  verifyPassword
} = require('./auth');
const { handleRegistration, updateAdminUser } = require('./server');

function requestWithJson(body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = 'POST';
  req.headers = {};
  return req;
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      Object.assign(this.headers, headers);
    },
    end(body = '') {
      this.body = body ? JSON.parse(body) : null;
    }
  };
}

function pendingRegistrationDb(expectedUsername) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT id FROM site_users/.test(sql)) return { rowCount: 0, rows: [] };
      if (/INSERT INTO site_users/.test(sql)) {
        assert.match(sql, /VALUES \(\$1, \$2, 'user', 'pending', NULL\)/);
        assert.equal(params[0], expectedUsername);
        return {
          rowCount: 1,
          rows: [{ id: 1, username: expectedUsername, role: 'user', status: 'pending' }]
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

async function registerThroughApi(username) {
  const db = pendingRegistrationDb(username);
  const res = responseRecorder();
  const user = await handleRegistration(
    requestWithJson({ username, password: 'safe-test-password' }),
    res,
    db,
    async () => {}
  );
  return { db, res, user };
}

test('registering SITE_ADMIN_USERNAME through the API creates a pending user', async () => {
  const previousUsername = process.env.SITE_ADMIN_USERNAME;
  process.env.SITE_ADMIN_USERNAME = 'configured-admin';
  try {
    const { res, user } = await registerThroughApi(process.env.SITE_ADMIN_USERNAME);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.authenticated, false);
    assert.equal(res.body.pendingApproval, true);
    assert.equal(user.role, 'user');
    assert.equal(user.status, 'pending');
  } finally {
    if (previousUsername === undefined) delete process.env.SITE_ADMIN_USERNAME;
    else process.env.SITE_ADMIN_USERNAME = previousUsername;
  }
});

test('ordinary registration creates a pending user', async () => {
  const { user } = await registerThroughApi('ordinary-user');
  assert.deepEqual({ role: user.role, status: user.status }, { role: 'user', status: 'pending' });
});

test('environment bootstrap creates an approved administrator', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/UPDATE site_users/.test(sql)) return { rowCount: 0, rows: [] };
      if (/INSERT INTO site_users/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ id: 9, username: params[0], role: 'admin', status: 'approved' }]
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const result = await bootstrapAdminFromEnvironment(db, {
    SITE_ADMIN_USERNAME: 'environment-admin',
    SITE_ADMIN_PASSWORD: 'environment-test-password'
  });
  assert.equal(result.created, true);
  assert.equal(result.user.role, 'admin');
  assert.equal(result.user.status, 'approved');
  assert.equal(verifyPassword('environment-test-password', queries[0].params[1]), true);
});

test('incomplete environment bootstrap cannot create an administrator', async () => {
  let queryCount = 0;
  const db = { async query() { queryCount += 1; } };
  await assert.rejects(
    bootstrapAdminFromEnvironment(db, { SITE_ADMIN_USERNAME: 'environment-admin' }),
    err => err.code === 'SITE_ADMIN_CONFIG_INCOMPLETE'
  );
  assert.equal(queryCount, 0);
});

test('existing administrators cannot be demoted or deleted through the API', async () => {
  let mutationCount = 0;
  const db = {
    async query(sql) {
      if (/SELECT id, username, role, status/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 2, username: 'existing-admin', role: 'admin', status: 'approved' }] };
      }
      mutationCount += 1;
      return { rowCount: 1, rows: [] };
    }
  };
  const actor = { id: '1', username: 'actor-admin', role: 'admin', status: 'approved' };

  for (const action of ['remove_admin', 'reject']) {
    await assert.rejects(
      updateAdminUser(actor, { username: 'existing-admin', action }, db),
      err => err.statusCode === 400
    );
  }
  assert.equal(mutationCount, 0);
});

test('registration migration preserves existing account rows', () => {
  const migration = fs.readFileSync(path.join(__dirname, 'migrations', '001_secure_registration_defaults.sql'), 'utf8');
  assert.match(migration, /ALTER COLUMN status SET DEFAULT 'pending'/);
  assert.doesNotMatch(migration, /UPDATE\s+site_users/i);
});
