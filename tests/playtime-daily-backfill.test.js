'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migrations = path.join(__dirname, '../database/migrations');
const readMigration = name => fs.readFileSync(path.join(migrations, name), 'utf8');

async function run() {
  for (const name of ['065_player_playtime_daily.sql', '066_backfill_player_playtime_daily.sql']) {
    assert.equal(readMigration(name), fs.readFileSync(path.join(__dirname, '../site/migrations', name), 'utf8'),
      `${name} must be identical for the bot and the site`);
  }

  const db = new PGlite();
  try {
    const aliceUuid = 'fb1553da-5f6f-4d61-a96f-955f4e7e1f79';
    await db.exec(`
      CREATE TABLE player_session_events (
        id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE player_activity (username TEXT, is_online BOOLEAN);
      CREATE TABLE player_name_history (username TEXT, player_uuid UUID);
      CREATE TABLE player_playtime (username TEXT PRIMARY KEY, player_uuid UUID, total_seconds BIGINT);
    `);
    await db.exec(readMigration('065_player_playtime_daily.sql'));
    await db.exec(`
      -- Live tracking began on 2026-09-10; that day belongs to the live checkpoints.
      INSERT INTO player_playtime_daily VALUES ('bob', '2026-09-10', 42);
      INSERT INTO player_playtime VALUES ('Alice', '${aliceUuid}', 0), ('Bob', NULL, 0), ('Carol', NULL, 0);
      INSERT INTO player_name_history VALUES ('OldAlice', '${aliceUuid}'), ('Alice', '${aliceUuid}');
      INSERT INTO player_activity VALUES ('Carol', TRUE), ('Dave', FALSE);
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        -- An old nickname resolves to the UUID row and is split at UTC midnight.
        ('OldAlice', 'player_joined', '2026-09-08T23:00:00Z'),
        ('OldAlice', 'player_left',   '2026-09-09T01:00:00Z'),
        -- A join followed by another join has no known end and is skipped.
        ('Bob', 'player_joined', '2026-09-09T10:00:00Z'),
        ('Bob', 'player_joined', '2026-09-09T12:00:00Z'),
        ('Bob', 'player_left',   '2026-09-09T12:30:00Z'),
        -- A player online now keeps the open session up to the cutoff.
        ('Carol', 'player_joined', '2026-09-09T23:00:00Z'),
        -- An offline player's open session has no known end.
        ('Dave', 'player_joined', '2026-09-09T20:00:00Z'),
        -- Time after the cutoff is left to the live tracker.
        ('Eve', 'player_joined', '2026-09-09T23:30:00Z'),
        ('Eve', 'player_left',   '2026-09-10T01:00:00Z'),
        -- Sessions older than 30 days are outside the window.
        ('Bob', 'player_joined', '2026-08-01T00:00:00Z'),
        ('Bob', 'player_left',   '2026-08-01T01:00:00Z');
    `);
    await db.exec(readMigration('066_backfill_player_playtime_daily.sql'));
    await db.exec(readMigration('066_backfill_player_playtime_daily.sql'));

    const rows = (await db.query(`
      SELECT identity_key, day::text AS day, seconds::int AS seconds
      FROM player_playtime_daily ORDER BY identity_key, day
    `)).rows;
    assert.deepEqual(rows, [
      { identity_key: 'bob', day: '2026-09-09', seconds: 1800 },
      { identity_key: 'bob', day: '2026-09-10', seconds: 42 },
      { identity_key: 'carol', day: '2026-09-09', seconds: 3600 },
      { identity_key: 'eve', day: '2026-09-09', seconds: 1800 },
      { identity_key: aliceUuid, day: '2026-09-08', seconds: 3600 },
      { identity_key: aliceUuid, day: '2026-09-09', seconds: 3600 }
    ]);
    console.log('Playtime daily backfill tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
