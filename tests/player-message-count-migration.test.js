'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migrationName = '047_player_message_observation_time.sql';
const migration = fs.readFileSync(path.join(__dirname, '../database/migrations', migrationName), 'utf8');
const date = day => `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`;
const uuid = id => id == null ? null : `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

async function run() {
  assert.equal(migration, fs.readFileSync(path.join(__dirname, '../site/migrations', migrationName), 'utf8'));
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE player_activity (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL, player_uuid UUID,
        observed_message_count BIGINT
      );
      CREATE TABLE player_name_history (player_uuid UUID NOT NULL, username TEXT NOT NULL);
      CREATE TABLE game_chat_messages (
        username TEXT NOT NULL, message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL, is_visible BOOLEAN NOT NULL
      );
      CREATE TABLE player_info_observation_state (
        metric TEXT NOT NULL, identity_key TEXT NOT NULL, username TEXT NOT NULL,
        imported BOOLEAN NOT NULL, updated_at TIMESTAMPTZ NOT NULL
      );
    `);

    // Username, imported count, UUID suffix, expected snapshot day (or fallback).
    const players = [
      ['manikmuptezel', 53287, 1, 3],
      ['CurrentName', 22, 2, 4],
      ['Spoofed', 7, null, 6],
      ['ZeroCase', 0, null, 6],
      ['ZeroExact', 0, null, 4],
      ['PositiveCase', 8, null, 10],
      ['ReusedCurrent', 33, 3, 6],
      ['UuidState', 9, 5, 9],
      ['AliasState', 10, 6, 9],
      ['NameState', 11, null, 8],
      ['NoAnchor', 44, null, 'now'],
      ['Unimported', 2, null, 'now'],
      ['WrongMetric', 3, null, 'now'],
      ['NullCount', null, null, null]
    ];
    for (const [name, count, id] of players) {
      await db.query('INSERT INTO player_activity (username, observed_message_count, player_uuid) VALUES ($1,$2,$3)',
        [name, count, uuid(id)]);
    }
    for (const [id, name] of [[2, 'OldName'], [3, 'SharedName'], [4, 'sharedname'], [5, 'OldUuidState'], [6, 'OldAliasState']]) {
      await db.query('INSERT INTO player_name_history VALUES ($1,$2)', [uuid(id), name]);
    }

    const response = (speaker, message, day, visible = true) => db.query(
      'INSERT INTO game_chat_messages VALUES ($1,$2,$3,$4)', [speaker, message, date(day), visible]
    );
    for (const row of [
      ['LolRiTTeRBot', 'manikmuptezel: 53287 messages', 2],
      ['LolRiTTeRBot', '  \u00a7amanikmuptezel: 53,287 messages.\u00a7r  ', 3, false],
      ['LolRiTTeRBot', 'manikmuptezel: 53,288 messages', 10],
      ['LolRiTTeRBot', 'OldName: 000,022 messages!', 4],
      ['Impostor', 'Spoofed: 7 messages', 10],
      ['moooomoooo', 'Spoofed: 7 messages', 10],
      ['LolRiTTeRBot', 'Prefix Spoofed: 7 messages', 10],
      ['LolRiTTeRBot', 'Spoofed: 7 messages trailing', 10],
      ['LolRiTTeRBot', `Spoofed: ${'9'.repeat(100)} messages`, 10],
      ['LolRiTTeRBot', 'zerocase: 0 messages', 10],
      ['LolRiTTeRBot', 'ZeroExact: 0 message.', 4],
      ['LolRiTTeRBot', 'positivecase: 8 messages', 10],
      ['LolRiTTeRBot', 'SharedName: 33 messages', 10],
      ['LolRiTTeRBot', 'NullCount: 0 messages', 10]
    ]) await response(...row);

    const state = (name, identity, day, imported = true, metric = 'messages') => db.query(
      'INSERT INTO player_info_observation_state VALUES ($1,$2,$3,$4,$5)',
      [metric, identity, name, imported, date(day)]
    );
    for (const row of [
      ['manikmuptezel', `uuid:${uuid(1)}`, 11], // Matching response takes priority over later state updates.
      ['Spoofed', 'name:spoofed', 6],
      ['ZeroCase', 'name:zerocase', 6],
      ['PositiveCase', 'name:positivecase', 6],
      ['ReusedCurrent', 'name:reusedcurrent', 6],
      ['SharedName', 'name:sharedname', 11], // A reused alias cannot supply either kind of anchor.
      ['UuidState', `uuid:${uuid(5)}`, 9],
      ['UuidState', 'name:uuidstate', 8],
      ['OldUuidState', 'name:olduuidstate', 7],
      ['AliasState', `uuid:${uuid(6)}`, 7],
      ['AliasState', 'name:aliasstate', 8],
      ['OldAliasState', 'name:oldaliasstate', 9],
      ['NameState', 'name:namestate', 8],
      ['Unimported', 'name:unimported', 10, false],
      ['WrongMetric', 'name:wrongmetric', 10, true, 'playtime']
    ]) await state(...row);

    await db.exec('BEGIN');
    const migrationTime = (await db.query('SELECT NOW() AS value')).rows[0].value.toISOString();
    await db.exec(migration);
    const readPlayers = async () => (await db.query(`
      SELECT username, observed_message_count::text AS count, observed_message_count_at AS observed_at
      FROM player_activity ORDER BY username
    `)).rows;
    const first = await readPlayers();
    await db.exec('COMMIT');
    assert.equal(first.length, players.length, 'the migration must preserve all players');
    for (const [name, count, , expected] of players) {
      const actual = first.find(row => row.username === name);
      assert.equal(actual.count, count == null ? null : String(count), `${name}: imported count unchanged`);
      assert.equal(actual.observed_at?.toISOString() ?? null,
        expected === 'now' ? migrationTime : expected == null ? null : date(expected),
        `${name}: snapshot must use the most recent trustworthy matching source`);
    }

    await response('LolRiTTeRBot', 'manikmuptezel: 53,287 messages', 15);
    await state('NameState', 'name:namestate', 15);
    await db.exec(migration);
    assert.deepEqual(await readPlayers(), first, 'rerunning must preserve established timestamps and all imported counts');
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM game_chat_messages')).rows[0].count, 15,
      'archived chat must remain intact');
    console.log('Player message count migration tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
