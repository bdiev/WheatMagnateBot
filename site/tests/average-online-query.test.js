'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const averageOnlineSql = [...serverSource.matchAll(/database\.query\(`([\s\S]*?)`(?:,\s*\[[^\]]*\])?\)/g)]
  .map(match => match[1])
  .find(sql => sql.includes('AS average_online'));

assert.ok(averageOnlineSql, 'the average-online SQL must be discoverable');

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`
      SET TimeZone = 'UTC';
      CREATE TABLE player_session_events (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE player_activity (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        is_online BOOLEAN NOT NULL,
        presence_observed_at TIMESTAMPTZ
      );
      CREATE TABLE server_online_hourly (
        bucket TIMESTAMPTZ PRIMARY KEY,
        sample_count BIGINT NOT NULL,
        player_sum BIGINT NOT NULL
      );

      -- A normal completed one-hour session.
      INSERT INTO player_session_events(username,event_type,occurred_at) VALUES
        ('Closed','player_joined',NOW()-INTERVAL '90 minutes'),
        ('Closed','player_left',NOW()-INTERVAL '30 minutes');

      -- A missed leave must stop at the final presence observation, not NOW().
      INSERT INTO player_session_events(username,event_type,occurred_at) VALUES
        ('Ghost','player_joined',NOW()-INTERVAL '150 minutes');
      INSERT INTO player_activity(username,is_online,presence_observed_at) VALUES
        ('Ghost',TRUE,NOW()-INTERVAL '120 minutes');

      -- A genuinely online player keeps contributing through the present.
      INSERT INTO player_session_events(username,event_type,occurred_at) VALUES
        ('Live','player_joined',NOW()-INTERVAL '45 minutes');
      INSERT INTO player_activity(username,is_online,presence_observed_at) VALUES
        ('Live',TRUE,NOW());
    `);

    const rows = (await db.query(averageOnlineSql, [30_000])).rows;
    const totalOnlineSeconds = rows.reduce(
      (total, row) => total + Number(row.average_online || 0) * Number(row.sample_seconds || 0),
      0
    );
    assert.ok(Math.abs(totalOnlineSeconds - 8100) < 5,
      `expected 2.25 observed player-hours, received ${totalOnlineSeconds} seconds`);
    assert.ok(rows.some(row => Number(row.average_online) > 1),
      'overlapping player sessions must be represented as concurrent average online');

    await db.query(`
      INSERT INTO server_online_hourly(bucket,sample_count,player_sum)
      VALUES(date_trunc('hour',NOW()),10,320)
    `);
    const sampledRows = (await db.query(averageOnlineSql, [30_000])).rows;
    const sampledCurrentHour = sampledRows.find(row =>
      new Date(row.bucket).getTime() === new Date().setMinutes(0, 0, 0)
    );
    assert.equal(Number(sampledCurrentHour.average_online), 32,
      'direct TAB samples must override incomplete reconstructed sessions');
    assert.equal(Number(sampledCurrentHour.sample_seconds), 10,
      'the direct sample count must weight daily and monthly aggregation');

    console.log('Average server online query tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
