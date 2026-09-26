'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const periodSql = [...serverSource.matchAll(/database\.query\(`([\s\S]*?)`\)/g)]
  .map(match => match[1])
  .find(sql => sql.includes('AS seen_today'));
assert.ok(periodSql, 'the unique-player period SQL must be discoverable');

// Local Vilnius wall-clock expressions relative to the real "now", so the
// scenarios hold at any time of day. Events are stored as TIMESTAMPTZ.
const LOCAL_NOW = "(NOW() AT TIME ZONE 'Europe/Vilnius')";
const DAY_START = `date_trunc('day', ${LOCAL_NOW})`;
const ELAPSED = `(${LOCAL_NOW} - ${DAY_START})`;
const at = localExpression => `((${localExpression}) AT TIME ZONE 'Europe/Vilnius')`;

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`
      SET TimeZone = 'UTC';
      CREATE TABLE obsidian_farm_analytics_settings (id INTEGER PRIMARY KEY, timezone TEXT);
      INSERT INTO obsidian_farm_analytics_settings VALUES (1, 'Europe/Vilnius');
      CREATE TABLE player_activity (id SERIAL PRIMARY KEY, username TEXT, is_online BOOLEAN DEFAULT FALSE);
      CREATE TABLE player_session_events (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL
      );

      -- Joined just after local midnight and left: seen today.
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        ('EarlyBird', 'player_joined', ${at(`${DAY_START} + ${ELAPSED} * 0.01`)}),
        ('EarlyBird', 'player_left', ${at(`${DAY_START} + ${ELAPSED} * 0.02`)});

      -- Still in an open session that started before midnight: seen today.
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        ('NightOwl', 'player_joined', ${at(`${DAY_START} - INTERVAL '5 minutes'`)});

      -- Online since the bot connected (no join event), then left: seen today.
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        ('Reconnected', 'player_left', ${at(`${DAY_START} - INTERVAL '2 days'`)}),
        ('Reconnected', 'player_left', ${at(`${DAY_START} + ${ELAPSED} * 0.5`)});

      -- Online now according to the presence lease, without any events.
      INSERT INTO player_activity (username, is_online) VALUES ('OnlineNow', TRUE), ('OfflineRow', FALSE);

      -- Yesterday before this time of day: part of the comparison.
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        ('YesterdayEarly', 'player_joined', ${at(`${DAY_START} - INTERVAL '1 day' + ${ELAPSED} * 0.3`)}),
        ('YesterdayEarly', 'player_left', ${at(`${DAY_START} - INTERVAL '1 day' + ${ELAPSED} * 0.4`)});

      -- Yesterday after this time of day: not yet comparable, must be excluded.
      INSERT INTO player_session_events (username, event_type, occurred_at) VALUES
        ('YesterdayLate', 'player_joined', ${at(`${DAY_START} - INTERVAL '1 day' + ${ELAPSED} + (INTERVAL '1 day' - ${ELAPSED}) * 0.5`)}),
        ('YesterdayLate', 'player_left', ${at(`${DAY_START} - INTERVAL '1 day' + ${ELAPSED} + (INTERVAL '1 day' - ${ELAPSED}) * 0.6`)});
    `);

    const [row] = (await db.query(periodSql)).rows;

    assert.equal(row.seen_today, 4,
      'today must count players seen since local midnight, open sessions across midnight, leaves without a recorded join, and players online now');
    assert.equal(row.seen_previous_day, 1,
      'yesterday must be cut at the same elapsed time as today, not compared as a full day');
    assert.ok(row.seen_week >= row.seen_today, 'the week includes today');
    assert.ok(row.seen_month >= row.seen_today, 'the month includes today');

    // A last_seen value written as a naive UTC wall clock must no longer shift
    // the day boundary: the query does not read player_activity.last_seen.
    assert.doesNotMatch(periodSql, /last_seen/, 'period counts must not depend on the naive last_seen column');

    console.log('Unique player period query tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
