'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getAdminUsers, touchSiteSessionActivity } = require('../server');

async function testAdminPresencePayload() {
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return {
        rows: [
          {
            id: 4,
            username: 'OnlineUser',
            role: 'user',
            status: 'approved',
            created_at: '2026-08-01T10:00:00.000Z',
            approved_at: '2026-08-01T10:05:00.000Z',
            last_seen_at: '2026-08-16T10:00:00.000Z',
            is_online: true
          },
          {
            id: 5,
            username: 'OfflineUser',
            role: 'user',
            status: 'approved',
            created_at: '2026-08-02T10:00:00.000Z',
            approved_at: null,
            last_seen_at: '2026-08-15T10:00:00.000Z',
            is_online: false
          }
        ]
      };
    }
  };

  const payload = await getAdminUsers({ role: 'admin' }, database);
  assert.equal(payload.users[0].isOnline, true);
  assert.equal(payload.users[0].lastSeenAt, '2026-08-16T10:00:00.000Z');
  assert.equal(payload.users[1].isOnline, false);
  assert.deepEqual(calls[0].params, [120]);
  assert.match(calls[0].sql, /BOOL_OR\(site_session\.last_active_at >= NOW\(\) - \(\$1 \* INTERVAL '1 second'\)\)/);
  await assert.rejects(() => getAdminUsers({ role: 'user' }, database), /Admin access required/);
}

async function testThrottledSessionTouch() {
  const calls = [];
  const database = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1 }; } };
  await touchSiteSessionActivity('session-hash', '7', database);
  assert.deepEqual(calls[0].params, ['session-hash', '7', 30]);
  assert.match(calls[0].sql, /UPDATE site_sessions[\s\S]*SET last_active_at=NOW\(\)[\s\S]*UPDATE site_users[\s\S]*SET last_seen_at=/);
}

function testAdminPresenceUi() {
  const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const migrationSource = fs.readFileSync(path.resolve(__dirname, '..', 'migrations', '030_site_user_presence.sql'), 'utf8');
  assert.match(appSource, /user\.isOnline[\s\S]*Online now[\s\S]*Last online \$\{formatRecentDate\(user\.lastSeenAt\)\}[\s\S]*Never online/);
  assert.match(appSource, /state\.activeTab === 'admin'[\s\S]*loadAdminUsers\(\{ showLoading: false \}\)/,
    'the open User Access panel must refresh presence during periodic dashboard sync');
  assert.match(stylesSource, /\.admin-user-presence\.online[\s\S]*color:\s*var\(--ok\)/);
  assert.match(migrationSource, /last_seen_at TIMESTAMPTZ[\s\S]*last_active_at TIMESTAMPTZ/);
}

Promise.resolve()
  .then(testAdminPresencePayload)
  .then(testThrottledSessionTouch)
  .then(testAdminPresenceUi)
  .then(() => console.log('Admin user presence tests passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
