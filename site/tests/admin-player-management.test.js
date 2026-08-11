'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  adminPlayerIdentity,
  deleteAdminPlayer,
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
        if (notesMatch) current.admin_notes = params[Number(notesMatch[1]) - 1];
        if (tagsMatch) current.admin_tags = params[Number(tagsMatch[1]) - 1];
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
    notes: 'Keep an eye on build activity.', tags: ['Builder', 'trusted']
  }, database, entry => audits.push(entry));
  assert.equal(result.player.notes, 'Keep an eye on build activity.');
  assert.deepEqual(result.player.tags, ['Builder', 'trusted']);
  const update = database.statements.find(statement => statement.sql.startsWith('UPDATE player_activity SET'));
  assert.match(update.sql, /admin_notes=\$1,admin_tags=\$2::text\[\]/, 'PATCH must update only allowlisted submitted fields');
  assert.deepEqual(audits[0].details.changedFields, ['notes', 'tags']);
  assert.doesNotMatch(JSON.stringify(audits[0]), /Keep an eye/, 'audit logs must not include note contents');
}

async function testEditValidationAndAuthorization() {
  assert.deepEqual(normalizeAdminPlayerPatch({ tags: ['Builder', 'builder'] }), { tags: ['Builder'] });
  assert.throws(() => normalizeAdminPlayerPatch({ username: 'ForgedName' }), /cannot be edited/);
  assert.throws(() => normalizeAdminPlayerPatch({ notes: 123 }), /Notes must be text/);
  assert.throws(() => normalizeAdminPlayerPatch({ tags: ['bad/tag'] }), /Each tag must be/);
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

function testArchitectureAndUiContracts() {
  const root = path.resolve(__dirname, '..', '..');
  const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
  const databaseSource = fs.readFileSync(path.join(root, 'database', 'index.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
  const databaseMigration = fs.readFileSync(path.join(root, 'database', 'migrations', '023_player_admin_metadata.sql'), 'utf8');
  const siteMigration = fs.readFileSync(path.join(root, 'site', 'migrations', '023_player_admin_metadata.sql'), 'utf8');
  assert.equal(databaseMigration, siteMigration, 'bot and site must migrate the same player metadata fields');
  assert.match(serverSource, /getPlayerProfile\(url, \{ includeAdminFields = false \}/, 'the existing player GET must be reused');
  assert.match(serverSource, /MINECRAFT_UUID_PATTERN[\s\S]*type: 'uuid'/, 'UUID must remain the primary admin identity');
  assert.match(serverSource, /preserved: \['game_chat_messages'/, 'shared history preservation must be explicit and auditable');
  assert.match(databaseSource, /admin_notes = COALESCE[\s\S]*admin_tags = ARRAY/, 'UUID reconciliation must preserve admin-managed metadata');
  assert.match(databaseSource, /INSERT INTO player_activity \(username, player_uuid/, 'a returning UUID player must be recreated by normal tracking');
  assert.match(htmlSource, /id="adminPlayersSearch"[\s\S]*id="adminPlayersList"/);
  assert.match(htmlSource, /id="adminPlayerDeleteModal"[\s\S]*role="alertdialog"/);
  assert.match(appSource, /Object\.keys\(patch\)\.length/, 'the frontend must build a partial patch');
  assert.match(appSource, /state\.adminPlayers = state\.adminPlayers\.filter/, 'delete must remove the card without reloading the page');
  assert.doesNotMatch(appSource.match(/async function confirmAdminPlayerDelete\(\)[\s\S]*?\n}/)?.[0] || '', /location\.reload/);
}

(async () => {
  await testAdminEdit();
  await testEditValidationAndAuthorization();
  await testDeleteAndRelations();
  await testDeleteGuardsAndMissingPlayer();
  testArchitectureAndUiContracts();
  console.log('Admin Minecraft player management tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
