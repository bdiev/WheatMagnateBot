'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createWhitelistRepository } = require('../database');
const { isWhitelistedIdentity, whitelistMatchSql } = require('../database/whitelist-identity');
const siteWhitelistIdentity = require('../site/whitelist-identity');

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const GHOST = '44444444-4444-4444-8444-444444444444';
const IMPOSTOR = '55555555-5555-4555-8555-555555555555';

async function run() {
  const root = path.resolve(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'database/migrations/061_whitelist_player_uuid.sql'), 'utf8');
  assert.equal(
    migration,
    fs.readFileSync(path.join(root, 'site/migrations/061_whitelist_player_uuid.sql'), 'utf8'),
    'bot and site must apply the same whitelist migration'
  );
  assert.equal(
    siteWhitelistIdentity.whitelistMatchSql('w', 'a.username', 'a.player_uuid'),
    whitelistMatchSql('w', 'a.username', 'a.player_uuid'),
    'the site copy of the matcher must stay identical'
  );

  const db = new PGlite();
  const pool = {
    query: (sql, params = []) => db.query(sql, params).then(result => ({
      ...result,
      rowCount: result.affectedRows ?? result.rows.length
    }))
  };
  try {
    // The schema as it existed before UUID-bound entries.
    await db.exec(`
      CREATE TABLE whitelist (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX whitelist_username_lower_idx ON whitelist (LOWER(username));
      CREATE TABLE player_activity (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL, player_uuid UUID, is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMPTZ, last_online TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX ON player_activity (LOWER(username));
      CREATE TABLE player_name_history (id SERIAL PRIMARY KEY, player_uuid UUID NOT NULL, username TEXT NOT NULL);

      INSERT INTO player_activity (username, player_uuid) VALUES ('Alice', '${ALICE}'), ('Bob', '${BOB}');
      INSERT INTO player_name_history (player_uuid, username) VALUES ('${BOB}', 'OldBob'), ('${BOB}', 'Bob');
      INSERT INTO whitelist (username, added_by) VALUES ('Alice', 'test'), ('OldBob', 'test'), ('Ghost', 'test');
    `);
    await db.exec(migration);
    await db.exec(migration);

    const rows = async () => (await db.query('SELECT username, player_uuid FROM whitelist ORDER BY id')).rows;
    assert.deepEqual(await rows(), [
      { username: 'Alice', player_uuid: ALICE },
      { username: 'Bob', player_uuid: BOB },
      { username: 'Ghost', player_uuid: null }
    ], 'the migration binds observed names and unambiguous former names, and shows current names');

    let memory = [];
    let resolved = {};
    const repository = createWhitelistRepository({
      pool,
      loadWhitelistFile: () => ['Alice', 'Carol'],
      appendWhitelistFile() {},
      updateWhitelistMemory: entries => { memory = entries; },
      resolvePlayerIdentity: async username => resolved[username.toLowerCase()] || null
    });

    resolved = { carol: { username: 'Carol', uuid: CAROL } };
    let result = await repository.addUsernameToWhitelist('carol', 'test');
    assert.equal(result.changed, true);
    assert.deepEqual(memory.find(entry => entry.uuid === CAROL), { username: 'Carol', uuid: CAROL });

    resolved = { ghost: { username: 'Ghost', uuid: GHOST } };
    result = await repository.addUsernameToWhitelist('Ghost', 'test');
    assert.equal(result.changed, false, 'a name-only entry is claimed, not duplicated');
    assert.equal((await rows()).filter(row => row.username === 'Ghost').length, 1);
    assert.equal((await rows()).find(row => row.username === 'Ghost').player_uuid, GHOST);

    // Alice renames to Alicia, and someone else takes the freed name.
    await db.exec(`
      UPDATE player_activity SET username = 'Alicia' WHERE player_uuid = '${ALICE}';
      INSERT INTO player_name_history (player_uuid, username) VALUES ('${ALICE}', 'Alice'), ('${ALICE}', 'Alicia');
      INSERT INTO player_activity (username, player_uuid) VALUES ('Alice', '${IMPOSTOR}');
    `);
    memory = await repository.loadWhitelistFromDB();
    assert.ok(memory.some(entry => entry.username === 'Alicia' && entry.uuid === ALICE), 'the entry follows the rename');
    assert.ok(!memory.some(entry => entry.username === 'Alice'));
    assert.equal(isWhitelistedIdentity(memory, 'Alicia', ALICE), true, 'a renamed member keeps access');
    assert.equal(isWhitelistedIdentity(memory, 'Alice', IMPOSTOR), false, 'the new owner of a freed name gets no access');
    assert.equal(isWhitelistedIdentity(memory, 'Alice', null), false);
    assert.equal(isWhitelistedIdentity(memory, 'Carol', IMPOSTOR), false, 'a bound name with another UUID is rejected');
    assert.equal(isWhitelistedIdentity([{ username: 'Legacy', uuid: null }], 'legacy', IMPOSTOR), true,
      'unbound entries still match by name');

    const flagged = (await db.query(`
      SELECT activity.username,
             EXISTS (SELECT 1 FROM whitelist w WHERE ${whitelistMatchSql('w', 'activity.username', 'activity.player_uuid')}) AS is_whitelisted
      FROM player_activity activity
      ORDER BY activity.username
    `)).rows;
    assert.deepEqual(flagged, [
      { username: 'Alice', is_whitelisted: false },
      { username: 'Alicia', is_whitelisted: true },
      { username: 'Bob', is_whitelisted: true }
    ]);

    // whitelist.txt still lists Alice: her old name must not be re-imported.
    await repository.migrateWhitelistToDB();
    assert.ok(!(await rows()).some(row => row.username === 'Alice'), 'a former name of a member is not re-imported');

    // The impostor cannot be added by claiming the stale name either.
    resolved = { alice: { username: 'Alice', uuid: IMPOSTOR } };
    result = await repository.addUsernameToWhitelist('Alice', 'test');
    assert.equal(result.changed, true, 'adding the new owner creates a separate entry');
    assert.equal((await rows()).find(row => row.player_uuid === ALICE).username, 'Alicia');

    assert.equal((await repository.removeUsernameFromWhitelistDB('Alicia')).changed, true);
    assert.ok(!(await rows()).some(row => row.player_uuid === ALICE));
    assert.ok((await rows()).some(row => row.player_uuid === IMPOSTOR), 'removal only touches the named entry');
  } finally {
    await db.close();
  }

  console.log('Whitelist identity tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
