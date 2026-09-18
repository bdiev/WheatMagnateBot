'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(siteDir, 'server.js'), 'utf8');
const migrationSource = fs.readFileSync(
  path.join(siteDir, 'migrations', '051_player_stats_cache.sql'),
  'utf8'
);

assert.match(
  migrationSource,
  /CREATE TABLE IF NOT EXISTS site_player_stats_cache[\s\S]*payload JSONB NOT NULL[\s\S]*generated_at TIMESTAMPTZ NOT NULL/,
  'the last completed Player Stats response must survive site restarts'
);
assert.match(
  serverSource,
  /async function loadPersistedPlayerStatsCache\(\)[\s\S]*FROM site_player_stats_cache[\s\S]*playerStatsCacheValue = row\.payload/,
  'startup must restore the persisted Player Stats response'
);
assert.match(
  serverSource,
  /function refreshPlayerStatsCache\(\)[\s\S]*getPlayerStats\(\)[\s\S]*persistPlayerStatsCache\(value\)/,
  'completed refreshes must update both memory and persistent cache storage'
);
assert.match(
  serverSource,
  /if \(playerStatsCacheValue\) \{[\s\S]*refreshPlayerStatsCache\(\)\.catch[\s\S]*return playerStatsCacheValue;/,
  'expired Player Stats data must be returned immediately while it refreshes in the background'
);
assert.match(
  serverSource,
  /await loadPersistedPlayerStatsCache\(\);[\s\S]*getCachedPlayerStats\(\)\.catch/,
  'the Player Stats cache must be warmed during site startup'
);

console.log('Player Stats cache tests passed.');
