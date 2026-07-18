'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Client } = require('pg');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForHealth(origin, child, output) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode != null) throw new Error(`Site exited before healthcheck.\n${output()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Site healthcheck timed out.\n${output()}`);
}

test('site registration, login, roles and health use PostgreSQL without external integrations', async t => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return t.skip('DATABASE_URL is required for PostgreSQL integration tests.');
  const schema = `site_auth_test_${process.pid}_${Date.now()}`;
  const quoted = `"${schema}"`;
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${quoted}`);

  const testUrl = new URL(databaseUrl);
  testUrl.searchParams.set('options', `-c search_path=${schema}`);
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const safeEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME']) {
    if (process.env[key]) safeEnv[key] = process.env[key];
  }
  Object.assign(safeEnv, {
    NODE_ENV: 'test', DATABASE_URL: testUrl.toString(), SITE_PORT: String(port), SITE_PUBLIC_ORIGIN: origin,
    SITE_ADMIN_USERNAME: 'TestAdmin', SITE_ADMIN_PASSWORD: 'AdminPass123!', SITE_COOKIE_SECURE: 'false',
    BOT_TEST_MODE: 'true', DISCORD_BOT_TOKEN: '', GEMINI_API_KEY: '', MINECRAFT_SESSION: ''
  });
  const child = spawn(process.execPath, [path.join('site', 'server.js')], {
    cwd: path.resolve(__dirname, '..', '..'), env: safeEnv, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });

  const request = async (pathname, { method = 'GET', body, cookie } = {}) => {
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers.Origin = origin;
    }
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${origin}${pathname}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] || null };
  };

  try {
    const health = await waitForHealth(origin, child, () => logs);
    assert.deepEqual(health, { ok: true, database: true });

    const registration = await request('/api/auth/register', {
      method: 'POST', body: { username: 'RegularUser', password: 'UserPass123!', role: 'admin', status: 'approved' }
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.payload.pendingApproval, true);

    const stored = await admin.query(`SET search_path TO ${quoted}; SELECT username, role, status FROM site_users WHERE LOWER(username)='regularuser'`);
    const registeredUser = stored[1].rows[0];
    assert.deepEqual({ role: registeredUser.role, status: registeredUser.status }, { role: 'user', status: 'pending' });

    const pendingLogin = await request('/api/auth/login', {
      method: 'POST', body: { username: 'regularuser', password: 'UserPass123!' }
    });
    assert.equal(pendingLogin.response.status, 403);

    const adminLogin = await request('/api/auth/login', {
      method: 'POST', body: { username: 'TestAdmin', password: 'AdminPass123!' }
    });
    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.payload.user.role, 'admin');
    assert.ok(adminLogin.cookie);

    const approval = await request('/api/admin/users', {
      method: 'POST', cookie: adminLogin.cookie, body: { username: 'RegularUser', action: 'approve' }
    });
    assert.equal(approval.response.status, 200);

    const userLogin = await request('/api/auth/login', {
      method: 'POST', body: { username: 'REGULARUSER', password: 'UserPass123!' }
    });
    assert.equal(userLogin.response.status, 200);
    assert.equal(userLogin.payload.user.role, 'user');

    const forbiddenPromotion = await request('/api/admin/users', {
      method: 'POST', cookie: userLogin.cookie, body: { username: 'RegularUser', action: 'make_admin' }
    });
    assert.equal(forbiddenPromotion.response.status, 403);
  } finally {
    const exitPromise = child.exitCode == null ? once(child, 'exit') : Promise.resolve();
    if (child.exitCode == null) child.kill('SIGTERM');
    await Promise.race([exitPromise, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode == null) {
      const forcedExit = once(child, 'exit');
      child.kill('SIGKILL');
      await forcedExit;
    }
    await admin.query('SET search_path TO public').catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`).catch(() => {});
    await admin.end();
  }
});
