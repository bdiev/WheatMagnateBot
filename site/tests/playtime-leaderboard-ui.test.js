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

const getPlayerStatsSource = serverSource.match(
  /async function getPlayerStats\(\) \{[\s\S]*?\n\}(?=\r?\n\r?\nfunction obsidianChartBucketKey)/
)?.[0] || '';
const leaderboardQuery = [...getPlayerStatsSource.matchAll(/database\.query\(`([\s\S]*?)`\)/g)][0]?.[1] || '';
assert.match(leaderboardQuery, /FROM identities identity[\s\S]*ORDER BY total_seconds DESC/, 'the server must return every resolved player identity');
assert.doesNotMatch(leaderboardQuery, /\bLIMIT\s+(?:100|500)\b/, 'the server must not discard players before the selected metric is sorted');
assert.doesNotMatch(leaderboardQuery, /JOIN LATERAL/, 'leaderboard totals must not rescan metric tables once per player');
assert.match(serverSource, /playtimeLeaderboards:\s*\{\s*global:/, 'player stats must expose a global leaderboard');
assert.match(serverSource, /whitelisted:\s*whitelistedLeaderboardRows/, 'the shared metric query must expose the whitelist leaderboard separately');
assert.match(getPlayerStatsSource, /const client = await pool\.connect\(\)[\s\S]*queryQueue[\s\S]*client\.release\(\)/, 'player statistics must use only one pooled database connection');
assert.match(serverSource, /PLAYER_STATS_CACHE_TTL_MS[\s\S]*playerStatsCachePromise[\s\S]*getCachedPlayerStats/, 'concurrent player-stat requests must share a short-lived cache');
const getServerStatsSource = serverSource.match(
  /async function getServerStats\(\) \{[\s\S]*?\n\}(?=\r?\n\r?\nasync function searchSeenPlayers)/
)?.[0] || '';
assert.doesNotMatch(getServerStatsSource, /getPlayerStats|getCachedPlayerStats/, 'general server statistics must not wait for the leaderboard query');
assert.match(serverSource, /url\.pathname === '\/api\/player-stats'[\s\S]*getCachedPlayerStats/, 'player statistics must have an independent cached endpoint');
assert.match(
  leaderboardQuery,
  /message_deltas AS[\s\S]*message\.created_at > identity\.observed_message_count_at/,
  'leaderboard message totals must use the observed server count plus messages archived afterward'
);
assert.match(
  leaderboardQuery,
  /alias_owners AS[\s\S]*mapped_playtime AS[\s\S]*playtime_totals AS[\s\S]*mapped_messages AS/,
  'aliases and metric totals must be resolved with set-based aggregation'
);
assert.match(
  leaderboardQuery,
  /uuid_identities AS[\s\S]*legacy_identities AS[\s\S]*identities AS/,
  'global leaderboard rows must resolve UUID identities and collapse historical names'
);
assert.match(indexSource, /data-playtime-scope="global"[^>]*aria-pressed="true"[^>]*>Global</, 'Global must be the default leaderboard tab');
assert.match(indexSource, /data-playtime-scope="whitelisted"[^>]*>Whitelisted</, 'the leaderboard must provide a Whitelisted tab');
assert.match(indexSource, /id="playtimeLeaderboardScope"[^>]*data-active-scope="global"/, 'the segmented control indicator must start on Global');
assert.match(appSource, /playtimeLeaderboardScope:\s*'global'/, 'the leaderboard must default to the server-wide scope');
assert.match(appSource, /global:\s*Array\.isArray\(leaderboardSources\.global\) \? leaderboardSources\.global : \[\]/, 'the client must retain every Global player for sorting');
assert.match(appSource, /sortPlaytimeLeaderboardEntries[\s\S]*scope === 'global' \? sortedLeaderboard\.slice\(0, 100\)/, 'the client must select the visible top 100 only after sorting the full metric set');
assert.match(appSource, /tab === 'players'[\s\S]*loadPlayerStats\(\)/, 'the expensive player metrics must load lazily when Players is opened');
assert.match(appSource, /state\.activeTab === 'players'[\s\S]*sectionLoads\.push\(loadPlayerStats\(\)\)/, 'full synchronization must skip player metrics outside the Players tab');
assert.match(
  appSource,
  /type === 'player_info_updated'[\s\S]*state\.playerStatsLoadedAt = 0;[\s\S]*refreshPlayersFromEvent\(\{ forcePlayerStats: true \}\)/,
  'player information events must invalidate local data and bypass the freshness window when refreshing the leaderboard'
);
assert.match(
  appSource,
  /if \(state\.playerStatsPromise\) \{[\s\S]*state\.playerStatsPromise\.finally\(\(\) => loadPlayerStats\(\{ force: true \}\)\)/,
  'a player information event received during an older request must queue a fresh leaderboard request'
);
assert.match(appSource, /function setPlaytimeLeaderboardScope\(scope\)/, 'the leaderboard tabs must switch without reloading the dashboard');
assert.match(appSource, /classList\.add\('is-leaving'\)[\s\S]*classList\.add\('is-entering'\)[\s\S]*160/, 'the old list must leave before the new list enters');
assert.match(appSource, /setAttribute\('aria-busy', 'true'\)[\s\S]*removeAttribute\('aria-busy'\)/, 'the animated list swap must expose its busy state');
assert.match(stylesSource, /\.playtime-scope-controls::before\s*\{[^}]*transition:\s*transform 300ms/s, 'the active scope indicator must slide smoothly');
assert.match(stylesSource, /data-active-scope="whitelisted"[^}]*translateX\(calc\(100% \+ 4px\)\)/s, 'the active indicator must move to Whitelisted');
assert.match(stylesSource, /@keyframes playtime-leaderboard-out[\s\S]*@keyframes playtime-leaderboard-in/, 'leaderboard content must animate in both directions of the swap');
assert.match(stylesSource, /\.playtime-scope-controls \.chart-range-button\s*\{[^}]*flex:\s*1 1 50%;/s, 'leaderboard tabs must share the available mobile width');
assert.match(stylesSource, /\.chart-controls:not\(\.playtime-scope-controls\)\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s, 'three-column mobile chart controls must not override the two-column leaderboard switch');
assert.match(stylesSource, /\.player-leaderboard-panel \.leaderboard-list\s*\{[^}]*overflow-anchor:\s*none;/s, 'scope changes must not restore the previous mobile scroll anchor');
assert.match(stylesSource, /\.player-leaderboard-panel\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);/s, 'leaderboard controls must occupy their own grid row above the scrollable list');
assert.match(appSource, /function resetPlaytimeLeaderboardScroll[\s\S]*list\.scrollTop = 0;[\s\S]*requestAnimationFrame[\s\S]*state\.playtimeLeaderboardScope === scope[\s\S]*list\.scrollTop = 0;/, 'scope changes must reset the leaderboard before and after layout');
assert.match(appSource, /tab === 'players'[\s\S]*resetPlaytimeLeaderboardScroll\(\$\('#playtimeLeaderboard'\)/, 'opening Players must reset the leaderboard to first place');
assert.match(appSource, /isFirstRender[\s\S]*didRender && isFirstRender[\s\S]*resetPlaytimeLeaderboardScroll/, 'the initial asynchronous render must override bottom anchoring');

console.log('Playtime leaderboard UI tests passed.');
