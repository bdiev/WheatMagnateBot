'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createIgnoredUsersRepository } = require('../database/ignored-users');
const { isIgnoredIdentity, ignoredIdentityMatchSql } = require('../database/ignored-identity');
const siteIdentity = require('../site/ignored-identity');

const UUID = 'b5cefebc-4b4b-4f59-ac5c-aa6c6a04618e';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function run() {
  const migration = fs.readFileSync('database/migrations/067_ignored_users_player_uuid.sql', 'utf8');
  assert.equal(migration, fs.readFileSync('site/migrations/067_ignored_users_player_uuid.sql', 'utf8'));
  assert.equal(ignoredIdentityMatchSql('i', 'p.username', 'p.player_uuid'), siteIdentity.ignoredIdentityMatchSql('i', 'p.username', 'p.player_uuid'));
  const db = new PGlite();
  const pool = { query: async (sql, params = []) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  } };
  try {
    await db.exec(`
      CREATE TABLE ignored_users (id SERIAL PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255), added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE player_activity (id SERIAL PRIMARY KEY, username TEXT, player_uuid UUID,
        is_online BOOLEAN DEFAULT FALSE, last_seen TIMESTAMP, last_online TIMESTAMP);
      CREATE TABLE player_name_history (username TEXT, player_uuid UUID);
      INSERT INTO player_activity (username,player_uuid) VALUES ('artixlinux','${UUID}');
      INSERT INTO player_name_history VALUES ('OldName','${UUID}'),('artixlinux','${UUID}');
      INSERT INTO ignored_users(username,added_by) VALUES ('OldName','owner'),('Unknown','owner');
    `);
    await db.exec(migration);
    await db.exec(migration);
    let entries = [];
    let resolved = { artixlinux: { username: 'artixlinux', uuid: UUID } };
    const repository = createIgnoredUsersRepository({ pool, resolveIdentity: async name => resolved[name.toLowerCase()], updateMemory: value => { entries = value; } });
    await repository.loadIgnoredChatUsernames();
    assert.equal(isIgnoredIdentity(entries, 'artixlinux', UUID.replace(/-/g, '')), true, 'old ignore follows renamed UUID');
    assert.equal(isIgnoredIdentity(entries, 'Unknown'), true, 'unresolved legacy ignores are retained');
    assert.equal(isIgnoredIdentity(entries, 'artixlinux', OTHER), false, 'known different UUID cannot inherit the ignore');
    await repository.addIgnoredPlayer('artixlinux', 'another-owner');
    assert.equal(entries.filter(entry => entry.uuid === UUID).length, 1, 'adding twice coalesces UUIDs');
    await assert.rejects(repository.addIgnoredPlayer('Unresolvable', 'owner'), /Cannot resolve UUID/);
    await db.exec(`UPDATE player_activity SET username='NewName' WHERE player_uuid='${UUID}';
      INSERT INTO player_activity(username,player_uuid) VALUES ('artixlinux','${OTHER}');`);
    await repository.loadIgnoredChatUsernames();
    assert.equal(isIgnoredIdentity(entries, 'NewName', UUID), true);
    assert.equal(isIgnoredIdentity(entries, 'artixlinux', OTHER), false);
    const sqlMatch = await db.query(`SELECT EXISTS(SELECT 1 FROM ignored_users i
      WHERE ${ignoredIdentityMatchSql('i', '$1::text', '$2::uuid')}) AS ignored`, ['NewName', UUID]);
    assert.equal(sqlMatch.rows[0].ignored, true, 'site marks renamed UUID ignored');
    resolved = { artixlinux: { username: 'artixlinux', uuid: OTHER }, newname: { username: 'NewName', uuid: UUID } };
    assert.equal((await repository.removeIgnoredPlayer('artixlinux')).rowCount, 0, 'reused nickname cannot remove former owner');

    // Execute the actual forwarding function with a renamed ignored sender.
    const source = fs.readFileSync('bot.js', 'utf8');
    const functionSource = source.slice(source.indexOf('function scheduleGameChatForward('), source.indexOf('\nfunction ', source.indexOf('function scheduleGameChatForward(') + 1));
    let timer;
    let archived;
    let forwarded = false;
    const context = {
      cleanMinecraftChatMessage: value => value,
      isPrivateMinecraftChatLine: () => false,
      bot: { username: 'Bot' },
      recentlyForwardedGameChat: new Map(), recentWhispers: new Map(), outboundWhispers: new Map(), pendingChatTimers: new Map(),
      consumeOutboundSelfEcho: () => false,
      isIgnoredChatPlayer: (name, uuid) => isIgnoredIdentity(entries, name, uuid),
      getOnlinePlayerUuid: () => null,
      setTimeout: callback => { timer = callback; return 1; },
      recordGameChatMessage: async (name, message, options) => { archived = { name, options }; },
      sendGameChatMessageToDiscord: async () => { forwarded = true; return true; },
      settlePendingGameChatDelivery() {}, debugLog() {}, console,
      PENDING_CHAT_DELAY_MS: 1, OUTBOUND_WHISPER_TTL_MS: 1000
    };
    vm.createContext(context);
    vm.runInContext(functionSource, context);
    assert.equal(context.scheduleGameChatForward('NewName', 'spam', 'packet', { senderUuid: UUID }), true);
    await timer();
    assert.equal(forwarded, false, 'UUID-bound ignore blocks forwarding without online name lookup');
    assert.equal(archived.options.visible, false, 'ignored message remains hidden in archive');
    assert.match(source, /if \(isIgnoredChatPlayer\(username\)\) \{\s*siteWhisperTargets.delete/, 'whispers use the same identity check');
    assert.equal((await repository.removeIgnoredPlayer('NewName')).rowCount, 1, 'unignore works under new nickname');
    assert.equal(isIgnoredIdentity(entries, 'NewName', UUID), false);
    await db.exec(`INSERT INTO player_activity(username,player_uuid) VALUES ('Unknown','33333333-3333-4333-8333-333333333333');`);
    await repository.loadIgnoredChatUsernames();
    assert.ok(entries.find(entry => entry.username === 'Unknown').uuid, 'late observations bind legacy names');
  } finally {
    await db.close();
  }
  console.log('UUID ignore tests passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
