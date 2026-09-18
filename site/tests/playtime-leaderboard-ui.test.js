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
  /WITH playtime_players AS[\s\S]*ORDER BY total_seconds DESC, pt\.source_username_key[\s\S]*LIMIT 100/,
  'the server-wide leaderboard must be capped to the top 100 in SQL'
);
assert.match(serverSource, /playtimeLeaderboards:\s*\{\s*global:/, 'player stats must expose a global leaderboard');
assert.match(serverSource, /whitelisted:\s*whitelistLeaderboardResult\.rows/, 'player stats must expose the whitelist leaderboard separately');
assert.match(
  serverSource,
  /observed_message_count[\s\S]*SUM\(message\.message_count\) FILTER[\s\S]*message\.created_at > pa\.observed_message_count_at/,
  'leaderboard message totals must use the observed server count plus messages archived afterward'
);
assert.match(
  serverSource,
  /resolved_players AS[\s\S]*player_name_history alias[\s\S]*players AS[\s\S]*DISTINCT ON \(identity_key\)/,
  'global leaderboard rows must resolve UUID identities and collapse historical names'
);
assert.match(
  serverSource,
  /SELECT SUM\([\s\S]*candidate\.total_seconds[\s\S]*candidate\.tracking_since[\s\S]*FROM player_playtime candidate/,
  'leaderboard playtime must combine UUID and legacy-name records like the player profile'
);
assert.match(indexSource, /data-playtime-scope="global"[^>]*aria-pressed="true"[^>]*>Global</, 'Global must be the default leaderboard tab');
assert.match(indexSource, /data-playtime-scope="whitelisted"[^>]*>Whitelisted</, 'the leaderboard must provide a Whitelisted tab');
assert.match(indexSource, /id="playtimeLeaderboardScope"[^>]*data-active-scope="global"/, 'the segmented control indicator must start on Global');
assert.match(appSource, /playtimeLeaderboardScope:\s*'global'/, 'the leaderboard must default to the server-wide scope');
assert.match(appSource, /leaderboardSources\.global\) \? leaderboardSources\.global\.slice\(0, 100\)/, 'the client must defensively cap Global to 100 players');
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
