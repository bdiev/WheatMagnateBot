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
  /function invalidatePlayerStatsCache\(\)[\s\S]*playerStatsCacheGeneration \+= 1;[\s\S]*playerStatsCacheExpiresAt = 0;[\s\S]*player_info_updated/,
  'player information changes must expire the cached leaderboard before notifying clients'
);
assert.doesNotMatch(
  serverSource.match(/function invalidatePlayerStatsCache\(\) \{[\s\S]*?\n\}/)?.[0] || '',
  /playerStatsCacheValue = null/,
  'cache invalidation must retain the last snapshot so Player Stats never blocks on a rebuild'
);
assert.match(
  serverSource,
  /if \(force\) \{[\s\S]*await playerStatsCachePromise\.catch[\s\S]*return refreshPlayerStatsCache\(\);/,
  'a forced refresh must wait out an older in-flight cache build before reading current player data'
);
assert.doesNotMatch(
  serverSource.match(/function refreshPlayerStatsCache\(\) \{[\s\S]*?\n\}/)?.[0] || '',
  /if \(generation !== playerStatsCacheGeneration\) return value;/,
  'a finished build must be stored even when players changed while it ran'
);
assert.match(
  serverSource,
  /playerStatsCacheValueGeneration = generation;[\s\S]*playerStatsCacheExpiresAt = generation === playerStatsCacheGeneration[\s\S]*: 0;/,
  'a build overtaken by newer player data must stay expired so the next read rebuilds'
);
assert.match(
  serverSource,
  /if \(force\) \{[\s\S]*if \(isCurrent\(\)\) return playerStatsCacheValue;[\s\S]*playerStatsCachePromiseGeneration === playerStatsCacheGeneration\) return playerStatsCachePromise;/,
  'forced refreshes from many tabs must share one build of the current data'
);
assert.match(
  serverSource,
  /function getNewPlayersPage[\s\S]*\), page AS \([\s\S]*LIMIT \$1 OFFSET \$2[\s\S]*EXISTS \([\s\S]*FROM page/,
  'New Players must match the whitelist only for the requested page'
);
const appSource = fs.readFileSync(path.join(siteDir, 'public', 'app.js'), 'utf8');
assert.match(
  appSource,
  /async function refreshNewPlayersFirstPage\(\)[\s\S]*\/api\/new-players\?\$\{params\}[\s\S]*syncNewPlayers\(/,
  'player events must refresh the first New Players page through its own query'
);
assert.match(
  appSource,
  /function refreshPlayersFromEvent[\s\S]*refreshNewPlayersFirstPage\(\)/,
  'player events must not wait for the full Player Stats build to show newcomers'
);
assert.match(
  serverSource,
  /await loadPersistedPlayerStatsCache\(\);[\s\S]*getCachedPlayerStats\(\)\.catch/,
  'the Player Stats cache must be warmed during site startup'
);

console.log('Player Stats cache tests passed.');
