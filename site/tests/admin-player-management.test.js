'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  adminPlayerIdentity,
  deleteAdminPlayer,
  getAdminPlayers,
  normalizeAdminPlayerPatch,
  patchAdminPlayer
} = require('../server');

const playerUuid = '11111111-1111-4111-8111-111111111111';
const admin = { id: '7', username: 'SiteAdmin', role: 'admin', status: 'approved' };

function fakeDatabase(player = null) {
  let current = player ? { ...player } : null;
  const statements = [];
  const client = {
    async query(sql, params = []) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();
      statements.push({ sql: compact, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact)) return { rows: [], rowCount: 0 };
      if (compact.startsWith('SELECT id,username,player_uuid,last_seen')) {
        return { rows: current ? [{ ...current }] : [], rowCount: current ? 1 : 0 };
      }
      if (compact.startsWith('UPDATE player_activity SET')) {
        const notesMatch = compact.match(/admin_notes=\$(\d+)/);
        const tagsMatch = compact.match(/admin_tags=\$(\d+)/);
        const hatchXMatch = compact.match(/pearl_hatch_x=\$(\d+)/);
        const hatchYMatch = compact.match(/pearl_hatch_y=\$(\d+)/);
        const hatchZMatch = compact.match(/pearl_hatch_z=\$(\d+)/);
        if (notesMatch) current.admin_notes = params[Number(notesMatch[1]) - 1];
        if (tagsMatch) current.admin_tags = params[Number(tagsMatch[1]) - 1];
        if (hatchXMatch) current.pearl_hatch_x = params[Number(hatchXMatch[1]) - 1];
        if (hatchYMatch) current.pearl_hatch_y = params[Number(hatchYMatch[1]) - 1];
        if (hatchZMatch) current.pearl_hatch_z = params[Number(hatchZMatch[1]) - 1];
        return { rows: [{ ...current }], rowCount: 1 };
      }
      if (compact.startsWith('SELECT LOWER(own_name.username)')) {
        return { rows: [{ username_key: 'oldname' }, { username_key: current.username.toLowerCase() }], rowCount: 2 };
      }
      if (compact.startsWith('DELETE FROM player_playtime')) return { rows: [], rowCount: 1 };
      if (compact.startsWith('DELETE FROM player_name_history')) return { rows: [], rowCount: 2 };
      if (compact.startsWith('DELETE FROM nearby_player_sightings')) return { rows: [], rowCount: 1 };
      if (compact.startsWith('DELETE FROM player_activity')) {
        const existed = Boolean(current);
        current = null;
        return { rows: [], rowCount: existed ? 1 : 0 };
      }
      throw new Error(`Unexpected query: ${compact}`);
    },
    release() {}
  };
  return { statements, get player() { return current; }, async connect() { return client; } };
}

async function testAdminEdit() {
  const database = fakeDatabase({
    id: '42', username: 'CurrentName', player_uuid: playerUuid,
    is_online: false, admin_notes: '', admin_tags: []
  });
  const audits = [];
  const result = await patchAdminPlayer(admin, playerUuid, {
    notes: 'Keep an eye on build activity.', tags: ['Builder', 'trusted'],
    pearlHatch: { x:120,y:64,z:-42 }
  }, database, entry => audits.push(entry));
  assert.equal(result.player.notes, 'Keep an eye on build activity.');
  assert.deepEqual(result.player.tags, ['Builder', 'trusted']);
  assert.deepEqual(result.player.pearlHatch, { x:120,y:64,z:-42 });
  const update = database.statements.find(statement => statement.sql.startsWith('UPDATE player_activity SET'));
  assert.match(update.sql, /admin_notes=\$1,admin_tags=\$2::text\[\],pearl_hatch_x=\$3,pearl_hatch_y=\$4,pearl_hatch_z=\$5/, 'PATCH must update only allowlisted submitted fields');
  assert.deepEqual(audits[0].details.changedFields, ['notes', 'tags', 'pearlHatch']);
  assert.doesNotMatch(JSON.stringify(audits[0]), /Keep an eye/, 'audit logs must not include note contents');
}

async function testEditValidationAndAuthorization() {
  assert.deepEqual(normalizeAdminPlayerPatch({ tags: ['Builder', 'builder'] }), { tags: ['Builder'] });
  assert.throws(() => normalizeAdminPlayerPatch({ username: 'ForgedName' }), /cannot be edited/);
  assert.throws(() => normalizeAdminPlayerPatch({ notes: 123 }), /Notes must be text/);
  assert.throws(() => normalizeAdminPlayerPatch({ tags: ['bad/tag'] }), /Each tag must be/);
  assert.deepEqual(normalizeAdminPlayerPatch({ pearlHatch:{x:'10',y:64,z:-20} }), { pearlHatch:{x:10,y:64,z:-20} });
  assert.deepEqual(normalizeAdminPlayerPatch({ pearlHatch:null }), { pearlHatch:null });
  assert.throws(() => normalizeAdminPlayerPatch({ pearlHatch:{x:'',y:64,z:-20} }), /integer X, Y and Z/);
  assert.deepEqual(adminPlayerIdentity(playerUuid), { type: 'uuid', value: playerUuid });
  assert.deepEqual(adminPlayerIdentity('42'), { type: 'id', value: '42' });
  assert.throws(() => adminPlayerIdentity('CurrentName'), error => error.statusCode === 404);
  await assert.rejects(
    patchAdminPlayer({ username: 'Member', role: 'user', status: 'approved' }, playerUuid, { notes: 'no' }, {}),
    error => error.statusCode === 403
  );
}

async function testDeleteAndRelations() {
  const database = fakeDatabase({
    id: '42', username: 'CurrentName', player_uuid: playerUuid,
    is_online: false, admin_notes: 'private', admin_tags: ['tag']
  });
  const audits = [];
  const result = await deleteAdminPlayer(admin, playerUuid, database, entry => audits.push(entry));
  assert.equal(result.ok, true);
  assert.equal(database.player, null);
  assert.deepEqual(result.deleted, { playtime: 1, aliases: 2, nearbySightings: 1, profile: 1 });
  assert.deepEqual(audits[0].details.preserved, [
    'game_chat_messages', 'whitelist', 'ignored_users', 'site_whisper_messages', 'operational_events'
  ]);
  const sql = database.statements.map(statement => statement.sql).join('\n');
  assert.match(sql, /DELETE FROM player_playtime/);
  assert.match(sql, /DELETE FROM player_name_history/);
  assert.match(sql, /DELETE FROM nearby_player_sightings/);
  assert.doesNotMatch(sql, /DELETE FROM game_chat_messages|DELETE FROM whitelist|DELETE FROM ignored_users/);
  assert.equal(database.statements.at(-1).sql, 'COMMIT');
}

async function testDeleteGuardsAndMissingPlayer() {
  await assert.rejects(
    deleteAdminPlayer({ username: 'Member', role: 'user', status: 'approved' }, playerUuid, {}),
    error => error.statusCode === 403
  );
  await assert.rejects(deleteAdminPlayer(admin, playerUuid, fakeDatabase(), () => {}), error => error.statusCode === 404);
  await assert.rejects(deleteAdminPlayer(admin, 'not-a-uuid', fakeDatabase(), () => {}), error => error.statusCode === 404);
}

async function testAdminPlayerSortingAndOptimizedQuery() {
  const calls = [];
  const database = {
    async query(sql, params) {
      const callIndex = calls.length;
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      return {
        rows: callIndex === 0
          ? Array.from({ length: 7 }, (_, index) => ({ id: index + 1, username: `Player${index + 1}`, total_seconds: index }))
          : []
      };
    }
  };
  const sorted = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?query=bad&sort=joindate&direction=desc&limit=6&offset=12'),
    database
  );
  assert.equal(sorted.players.length, 6);
  assert.equal(sorted.players[1].playtime, '1s', 'sub-minute playtime must remain visible in player cards');
  assert.deepEqual(
    { query: sorted.query, sort: sorted.sort, direction: sorted.direction, limit: sorted.limit, offset: sorted.offset, hasMore: sorted.hasMore },
    { query: 'bad', sort: 'joindate', direction: 'desc', limit: 6, offset: 12, hasMore: true }
  );
  assert.deepEqual(calls[0].params, ['bad', 7, 12]);
  assert.match(calls[0].sql, /WITH candidate_players AS MATERIALIZED/);
  assert.match(calls[0].sql, /ORDER BY pa\.registration_at DESC NULLS LAST/);
  assert.match(calls[0].sql, /LEFT JOIN player_playtime pt_uuid[\s\S]*LEFT JOIN player_playtime pt_name/);
  assert.match(calls[0].sql, /chat_uuid ON candidate\.player_uuid IS NOT NULL[\s\S]*chat_name ON candidate\.player_uuid IS NULL/);
  assert.doesNotMatch(calls[0].sql, /message\.player_uuid=candidate\.player_uuid\)\s+OR/);

  const normalized = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?sort=DROP%20TABLE&direction=sideways'),
    database
  );
  assert.equal(normalized.sort, 'playtime');
  assert.equal(normalized.direction, 'asc');
  assert.equal(normalized.limit, 8);
  assert.equal(normalized.offset, 0);
  assert.equal(normalized.hasMore, false);
  assert.deepEqual(calls[1].params, ['', 9, 0]);
  assert.match(calls[1].sql, /ORDER BY total_seconds ASC,LOWER\(pa\.username\) ASC/);

  const seen = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?sort=seen&direction=asc'),
    database
  );
  assert.equal(seen.sort, 'seen');
  assert.match(calls[2].sql, /ORDER BY pa\.last_seen DESC NULLS FIRST,LOWER\(pa\.username\) ASC/);
  assert.match(calls[2].sql, /ORDER BY candidate\.last_seen DESC NULLS FIRST,LOWER\(candidate\.username\) ASC/);

  const uuid = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?sort=uuid&direction=desc'),
    database
  );
  assert.equal(uuid.sort, 'uuid');
  assert.equal(uuid.direction, 'desc');
  assert.match(calls[3].sql, /ORDER BY pa\.player_uuid DESC NULLS LAST,LOWER\(pa\.username\) ASC/);
  assert.match(calls[3].sql, /ORDER BY candidate\.player_uuid DESC NULLS LAST,LOWER\(candidate\.username\) ASC/);

  const uuidMissingFirst = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?sort=uuid&direction=asc'),
    database
  );
  assert.equal(uuidMissingFirst.sort, 'uuid');
  assert.equal(uuidMissingFirst.direction, 'asc');
  assert.match(calls[4].sql, /ORDER BY pa\.player_uuid ASC NULLS FIRST,LOWER\(pa\.username\) ASC/);
  assert.match(calls[4].sql, /ORDER BY candidate\.player_uuid ASC NULLS FIRST,LOWER\(candidate\.username\) ASC/);

  const messages = await getAdminPlayers(
    admin,
    new URL('https://example.test/api/admin/players?sort=messages&direction=desc'),
    database
  );
  assert.equal(messages.sort, 'messages');
  assert.equal(messages.direction, 'desc');
  assert.match(calls[5].sql, /chat_counts_uuid AS MATERIALIZED/);
  assert.match(calls[5].sql, /chat_counts_name AS MATERIALIZED/);
  assert.match(calls[5].sql, /ORDER BY total_messages DESC,LOWER\(pa\.username\) ASC/);
  assert.match(calls[5].sql, /ORDER BY candidate\.total_messages DESC,LOWER\(candidate\.username\) ASC/);
  assert.doesNotMatch(calls[5].sql, /FROM game_chat_messages message/, 'message sorting must reuse the pre-pagination aggregates');
}

function testArchitectureAndUiContracts() {
  const root = path.resolve(__dirname, '..', '..');
  const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
  const databaseSource = fs.readFileSync(path.join(root, 'database', 'index.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
  const databaseMigration = fs.readFileSync(path.join(root, 'database', 'migrations', '023_player_admin_metadata.sql'), 'utf8');
  const siteMigration = fs.readFileSync(path.join(root, 'site', 'migrations', '023_player_admin_metadata.sql'), 'utf8');
  const databaseListIndexes = fs.readFileSync(path.join(root, 'database', 'migrations', '024_admin_player_list_indexes.sql'), 'utf8');
  const siteListIndexes = fs.readFileSync(path.join(root, 'site', 'migrations', '024_admin_player_list_indexes.sql'), 'utf8');
  assert.equal(databaseMigration, siteMigration, 'bot and site must migrate the same player metadata fields');
  assert.equal(databaseListIndexes, siteListIndexes, 'bot and site must install the same admin-list indexes');
  assert.match(serverSource, /getPlayerProfile\(url, \{ includeAdminFields = false \}/, 'the existing player GET must be reused');
  assert.match(serverSource, /MINECRAFT_UUID_PATTERN[\s\S]*type: 'uuid'/, 'UUID must remain the primary admin identity');
  assert.match(serverSource, /preserved: \['game_chat_messages'/, 'shared history preservation must be explicit and auditable');
  assert.match(databaseSource, /admin_notes = COALESCE[\s\S]*admin_tags = ARRAY/, 'UUID reconciliation must preserve admin-managed metadata');
  assert.match(databaseSource, /INSERT INTO player_activity \(username, player_uuid/, 'a returning UUID player must be recreated by normal tracking');
  assert.match(htmlSource, /id="adminPlayersSearch"[\s\S]*id="adminPlayersSort"[\s\S]*id="adminPlayersDirection"[\s\S]*id="adminPlayersScroller"[\s\S]*id="adminPlayersList"[\s\S]*id="adminPlayersScrollStatus"/);
  assert.match(htmlSource, /option value="playtime">Playtime<[\s\S]*option value="nickname">Nickname<[\s\S]*option value="uuid">UUID<[\s\S]*option value="joindate">Join date<[\s\S]*option value="seen">Seen<[\s\S]*option value="messages">Messages</, 'all requested player sort fields must be available');
  assert.match(htmlSource, /id="adminPlayerDeleteModal"[\s\S]*role="alertdialog"/);
  assert.match(appSource, /Object\.keys\(patch\)\.length/, 'the frontend must build a partial patch');
  assert.match(appSource, /state\.adminPlayers = state\.adminPlayers\.filter/, 'delete must remove the card without reloading the page');
  assert.match(appSource, /classList\.toggle\('menu-open', menu\.open\)/, 'an open actions menu must elevate its entire card');
  assert.match(appSource, /document\.addEventListener\('pointerdown', closeAdminPlayerMenus, true\)/, 'clicking or tapping outside a player menu must close it');
  assert.match(appSource, /menu\.contains\(event\.target\)[\s\S]*menu\.removeAttribute\('open'\)/, 'interactions inside the active player menu must not close it');
  assert.match(appSource, /new URLSearchParams\(\{[\s\S]*sort: state\.adminPlayersSort,[\s\S]*direction: state\.adminPlayersDirection,[\s\S]*limit: String\(state\.adminPlayersLimit\),[\s\S]*offset:/, 'sorting and pagination must happen on the server');
  assert.match(appSource, /admin-player-avatar[^\n]*accountHeadUrl\(player\.username, player\.uuid\)[^\n]*loading="lazy" decoding="async"/, 'player cards must use the UUID-aware cached avatar proxy and asynchronous decoding');
  assert.match(appSource, /admin-player-avatar-button[^>]*data-admin-player-action="view"[^>]*data-player-key/, 'clicking a player avatar must open the profile');
  assert.match(appSource, /admin-player-name-button[^>]*data-admin-player-action="view"[^>]*data-player-key/, 'clicking a player nickname must open the profile');
  assert.match(appSource, /adminPlayersScroller'[\s\S]*addEventListener\('scroll', maybeLoadMoreAdminPlayers/, 'scrolling must progressively load the next server page');
  assert.match(appSource, /insertAdjacentHTML\('beforeend', markup\)/, 'new cards must append without rebuilding loaded cards');
  assert.match(appSource, /player_joined[\s\S]*player_left[\s\S]*loadAdminPlayers\(\{ showLoading: false, preserveScroll: true \}\)/, 'join and leave refreshes must preserve the admin player scroll position');
  assert.match(appSource, /previousScrollTop[\s\S]*preserveScroll[\s\S]*requestAnimationFrame[\s\S]*scroller\.scrollTop = previousScrollTop/, 'background player refreshes must restore the scroll position after rendering');
  assert.match(stylesSource, /\.admin-players-scroller\s*\{[^}]*max-height:[^;]+;[^}]*overflow-y:auto;/, 'the player card area must stay compact and scroll internally');
  assert.match(stylesSource, /\.admin-player-card\.menu-open\s*\{[^}]*z-index:100/, 'the active player card must render above later cards');
  assert.match(stylesSource, /\.admin-player-avatar-button\s*\{[^}]*grid-column:1;[^}]*min-width:52px!important;/, 'the clickable avatar must stay inside its grid column');
  assert.match(stylesSource, /\.admin-player-card-main\s*\{[^}]*grid-column:2;[^}]*grid-row:1;/, 'the nickname must occupy a separate grid column from the avatar');
  assert.doesNotMatch(appSource.match(/async function confirmAdminPlayerDelete\(\)[\s\S]*?\n}/)?.[0] || '', /location\.reload/);
}

(async () => {
  await testAdminEdit();
  await testEditValidationAndAuthorization();
  await testDeleteAndRelations();
  await testDeleteGuardsAndMissingPlayer();
  await testAdminPlayerSortingAndOptimizedQuery();
  testArchitectureAndUiContracts();
  console.log('Admin Minecraft player management tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
