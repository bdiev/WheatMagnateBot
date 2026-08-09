'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const publicDirectory = path.join(siteDirectory, 'public');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(
  serverSource,
  /FROM player_playtime[\s\S]*ORDER BY pt\.total_seconds DESC, pt\.username_key[\s\S]*LIMIT 100/,
  'the server-wide leaderboard must be capped to the top 100 in SQL'
);
assert.match(serverSource, /playtimeLeaderboards:\s*\{\s*global:/, 'player stats must expose a global leaderboard');
assert.match(serverSource, /whitelisted:\s*whitelistLeaderboardResult\.rows/, 'player stats must expose the whitelist leaderboard separately');
assert.match(indexSource, /data-playtime-scope="global"[^>]*aria-pressed="true"[^>]*>Global</, 'Global must be the default leaderboard tab');
assert.match(indexSource, /data-playtime-scope="whitelisted"[^>]*>Whitelisted</, 'the leaderboard must provide a Whitelisted tab');
assert.match(appSource, /playtimeLeaderboardScope:\s*'global'/, 'the leaderboard must default to the server-wide scope');
assert.match(appSource, /leaderboardSources\.global\) \? leaderboardSources\.global\.slice\(0, 100\)/, 'the client must defensively cap Global to 100 players');
assert.match(appSource, /function setPlaytimeLeaderboardScope\(scope\)/, 'the leaderboard tabs must switch without reloading the dashboard');
assert.match(stylesSource, /\.playtime-scope-controls \.chart-range-button\s*\{[^}]*min-width:\s*88px;/s, 'leaderboard tabs must have stable desktop sizing');
assert.match(stylesSource, /\.playtime-scope-controls \.chart-range-button\s*\{[^}]*flex:\s*1 1 50%;/s, 'leaderboard tabs must share the available mobile width');

console.log('Playtime leaderboard UI tests passed.');
