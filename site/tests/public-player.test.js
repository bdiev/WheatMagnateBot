'use strict';

const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { playerProfileUrl } = require('../../discord/player-profile-link');
const { buildFloodSummaryEmbed } = require('../../discord/flood-summary');

// Exercise the real HTTP handler without touching a live database.
process.env.DATABASE_URL = 'postgresql://test:test@localhost/public_player_test';
const queries = [];
Pool.prototype.query = async function (sql, params = []) {
  queries.push({ sql, params });
  if (sql.includes('WITH uuid_matches AS')) {
    return { rows: params[1] === 'Unknown' ? [] : [{ username: 'bdiev_', uuid: '11111111-1111-4111-8111-111111111111', is_online: true, online_since: '2026-10-14T10:00:00Z', last_seen: '2026-10-14T10:00:00Z', admin_notes: 'PRIVATE NOTES' }] };
  }
  if (sql.includes('FROM player_activity pa') && sql.includes('AS aliases')) {
    return { rows: params[0] === 'Unknown' ? [] : [{ username: 'bdiev_', player_uuid: '11111111-1111-4111-8111-111111111111', aliases: ['oldname'] }] };
  }
  if (sql.includes('WITH activity AS')) return { rows: [{ username: 'bdiev_', player_uuid: '11111111-1111-4111-8111-111111111111', total_seconds: 7200, registration_at: '2025-01-01T00:00:00Z', is_whitelisted: true, name_history: [{ username: 'bdiev_' }, { username: 'OldName' }], admin_notes: 'PRIVATE NOTES', admin_tags: ['private'] }] };
  if (sql.includes('recent_messages')) return { rows: [{ id: '10', message: 'Hello from Minecraft!', created_at: '2026-10-14T10:00:00Z', is_visible: true }] };
  if (sql.includes('message_baseline')) return { rows: [{ total: 42, last_24h: 2 }] };
  if (sql.includes('session_events')) return { rows: [{ event_type: 'player_left', occurred_at: '2026-10-14T10:30:00Z', total_sessions: 1 }, { event_type: 'player_joined', occurred_at: '2026-10-14T10:00:00Z', total_sessions: 1 }] };
  if (sql.includes('area_explorer_finds')) return { rows: sql.includes('COUNT(*)::int') ? [{ total: 0 }] : [] };
  return { rows: [], rowCount: 0 };
};

const { server } = require('../server');

async function run() {
  assert.equal(playerProfileUrl('bdiev_', {}), 'https://bdiev.org/player/bdiev_');
  assert.equal(playerProfileUrl('OldName', { SITE_PUBLIC_URL: 'https://example.org/' }), 'https://example.org/player/OldName');
  assert.equal(buildFloodSummaryEmbed({ username: 'bdiev_', reasons: { rate: 2 } }).author.url, playerProfileUrl('bdiev_'));
  assert.throws(() => playerProfileUrl('bdiev_', { SITE_PUBLIC_URL: 'javascript:alert(1)' }));

  await new Promise(resolve => server.listen(process.argv.includes('--preview') ? 3087 : 0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/player/bdiev_`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const html = await page.text();
    assert.match(html, /data-public-player="bdiev_"/);
    assert.match(html, /public-player\.css/);
    assert.doesNotMatch(html, /public-player-search\.js/);
    const search = await fetch(`${base}/api/public/player-search?q=bd`);
    assert.equal(search.status, 200);
    assert.deepEqual(await search.json(), { players: [{ username: 'bdiev_', uuid: '11111111-1111-4111-8111-111111111111', isOnline: true, onlineSince: '2026-10-14T10:00:00Z', lastSeen: '2026-10-14T10:00:00Z' }] });
    assert.equal((await fetch(`${base}/api/public/player-search?query=OldName`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/public/player-search?q=Unknown`)).json(), { players: [] });
    assert.deepEqual(await (await fetch(`${base}/api/public/player-search?q=`)).json(), { players: [] });
    assert.equal((await fetch(`${base}/api/public/player-search?q=bad.name`)).status, 400);
    assert.equal((await fetch(`${base}/api/public/player-search?q=abcdefghijklmnopq`)).status, 400);
    assert.equal((await fetch(`${base}/api/public/player-search?q=bd`, { method: 'POST' })).status, 403);
    const searchQuery = queries.find(query => query.sql.includes('WITH uuid_matches AS'));
    assert.deepEqual(searchQuery.params, ['%bd%', 'bd', []]);
    assert.match(searchQuery.sql, /FROM player_name_history searched_name/, 'public search shares alias matching with the dashboard');
    assert.match(searchQuery.sql, /LIMIT 8/);
    assert.equal((await fetch(`${base}/player/bad.name`)).status, 404);
    assert.equal((await fetch(`${base}/player/bdiev_/`, { method: 'HEAD' })).status, 200);

    const response = await fetch(`${base}/api/public/player?username=OldName&beforeMessageId=11&messageLimit=20`);
    assert.equal(response.status, 200);
    const profile = await response.json();
    assert.equal(profile.username, 'bdiev_');
    assert.equal(profile.totalSeconds, 7200);
    assert.equal(profile.chat.recentMessages[0].message, 'Hello from Minecraft!');
    assert.equal(profile.gameSessions.length, 1);
    for (const field of ['adminNotes', 'adminTags', 'pearlHatch', 'identityKey', 'id']) assert.equal(Object.hasOwn(profile, field), false);
    const chatQuery = queries.find(query => query.sql.includes('recent_messages'));
    assert.equal((chatQuery.sql.match(/AND \(is_visible = TRUE\)/g) || []).length, 2, 'both UUID and legacy-name chat must filter hidden messages before pagination');
    assert.equal(chatQuery.params[2], '11');
    assert.ok(chatQuery.params[1].includes('oldname'));
    assert.equal((await fetch(`${base}/api/public/player?username=Unknown`)).status, 404);
    assert.equal((await fetch(`${base}/api/public/player?username=bad.name`)).status, 400);
    assert.equal((await fetch(`${base}/api/public/player-signs?player=bdiev_&count=1`)).status, 200);
    const signs = await fetch(`${base}/api/public/player-signs?player=bdiev_`);
    assert.equal(signs.status, 200);
    assert.deepEqual(await signs.json(), { signs: [], total: 0 });
    assert.equal((await fetch(`${base}/api/public/chat?username=bdiev_`)).status, 404);
    for (const endpoint of ['/api/player?username=bdiev_', '/api/chat', '/api/admin/players', '/api/area-explorer/finds']) {
      assert.equal((await fetch(base + endpoint)).status, 401, `${endpoint} must remain private`);
    }
    console.log('Public player HTTP, privacy, pagination and Discord link tests passed.');
  } finally {
    if (!process.argv.includes('--preview')) await new Promise(resolve => server.close(resolve));
  }
  if (process.argv.includes('--preview')) console.log(`Preview: ${base}/player/bdiev_ (fixture data)`);
}

run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
