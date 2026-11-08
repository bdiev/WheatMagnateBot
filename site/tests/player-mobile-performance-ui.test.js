'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.resolve(__dirname, '../public');
const appSource = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');

assert.match(
  appSource,
  /const MOBILE_LEADERBOARD_BATCH_SIZE = 24;/,
  'the mobile leaderboard must start with a bounded batch'
);
assert.match(
  appSource,
  /const leaderboard = isMobile\s*\? scopedLeaderboard\.slice\(0, state\.playtimeLeaderboardVisibleCount\)\s*: scopedLeaderboard;/,
  'mobile rendering must only create the currently visible leaderboard batch'
);
assert.match(
  appSource,
  /function maybeLoadMorePlaytimeLeaderboard\(\)[\s\S]*?scrollHeight - list\.scrollTop - list\.clientHeight > 120[\s\S]*?playtimeLeaderboardVisibleCount \+ MOBILE_LEADERBOARD_BATCH_SIZE/,
  'more leaderboard rows must be appended as the mobile list approaches its end'
);
assert.match(
  appSource,
  /playerIdentity\(player\.username, 28, \{ status: player\.isOnline \? 'online' : 'offline', uuid: player\.uuid, loading: 'lazy' \}\)/,
  'leaderboard avatars must be lazy-loaded using the same UUID as the profile'
);
assert.match(
  appSource,
  /\$\('#playtimeLeaderboard'\)\?\.addEventListener\('scroll', maybeLoadMorePlaytimeLeaderboard, \{ passive: true \}\);/,
  'the leaderboard scroll listener must stay passive'
);
assert.match(
  appSource,
  /<div class="player-profile-summary">\s*<div class="player-profile-identity">/,
  'the player profile name column must have a dedicated shrinkable container'
);
assert.match(
  appSource,
  /function fitPlayerProfileName\(\)[\s\S]*?closeRect\.left - nameRect\.left - 10[\s\S]*?naturalWidth <= availableWidth[\s\S]*?defaultSize \* availableWidth \/ naturalWidth/,
  'long mobile player names must scale down before reaching the close button'
);
assert.match(
  appSource,
  /requestAnimationFrame\(fitPlayerProfileName\);[\s\S]*?document\.fonts\?\.ready\?\.then/,
  'the player name must be fitted after rendering and after its font loads'
);
assert.doesNotMatch(
  stylesSource,
  /\.rank-item\.leaderboard-item\s*\{[^}]*content-visibility:/,
  'bounded mobile batches must retain measured row heights while scrolling'
);
assert.match(
  stylesSource,
  /@media \(max-width: 700px\) \{[\s\S]*?\.player-profile-head h2 \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: clip;[\s\S]*?white-space: nowrap;/,
  'long player names must remain on one clipped-safe line while fitting'
);
assert.match(
  stylesSource,
  /@media \(max-width: 700px\) \{[\s\S]*?\.player-profile-summary \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/,
  'the mobile name column must be allowed to shrink within the profile grid'
);

// Exercise real rendering and batch loading without a browser. Any scroll write
// or deferred restoration here would interrupt native touch momentum.
const vm = require('node:vm');
let identityRenders = 0;
let scrollWrites = 0;
class Row {
  constructor() { this.dataset = {}; this.cells = {}; }
  set innerHTML(value) {
    this.cells = Object.fromEntries(['.rank-index', '.leaderboard-player', 'strong'].map(key => [key, { textContent: '' }]));
  }
  querySelector(selector) { return this.cells[selector]; }
  remove() { list.children.splice(list.children.indexOf(this), 1); }
}
let scrollTop = 850;
const list = {
  children: [],
  clientHeight: 500,
  scrollHeight: 1360,
  get scrollTop() { return scrollTop; },
  set scrollTop(value) { scrollWrites++; scrollTop = value; },
  insertBefore(row, before) {
    const oldIndex = this.children.indexOf(row);
    if (oldIndex >= 0) this.children.splice(oldIndex, 1);
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, row);
  }
};
const players = Array.from({ length: 60 }, (_, i) => ({ username: `Player${i}`, uuid: `uuid${i}`, playtime: `${i}h`, isOnline: false }));
const context = vm.createContext({
  state: { renderSignatures: {}, playtimeLeaderboardScope: 'global', playtimeLeaderboards: { global: players }, playtimeLeaderboardVisibleCount: 24 },
  document: { createElement: () => new Row() },
  window: { matchMedia: () => ({ matches: true }) },
  $: () => list,
  stableSignature: JSON.stringify,
  playerIdentity: (username, size, options) => { identityRenders++; return `${username}:${options.uuid}`; },
  playtimeLeaderboardStatValue: player => player.playtime,
  requestAnimationFrame: () => assert.fail('batch rendering must not schedule a scroll restoration'),
  renderStable: () => assert.fail('populated leaderboard must not replace the whole list')
});
const rowsSource = appSource.match(/function renderPlaytimeLeaderboardRows\([\s\S]*?\n\}/)[0];
const loadSource = appSource.match(/function maybeLoadMorePlaytimeLeaderboard\([\s\S]*?\n\}/)[0];
vm.runInContext(`const MOBILE_LEADERBOARD_BATCH_SIZE = 24; ${rowsSource}\n${loadSource}
  function renderPlaytimeLeaderboard() {
    return renderPlaytimeLeaderboardRows($(), state.playtimeLeaderboards.global.slice(0, state.playtimeLeaderboardVisibleCount), 'global', 'playtime');
  }
  renderPlaytimeLeaderboard();`, context);
const firstRows = [...list.children];
const firstIdentity = firstRows[0].querySelector('.leaderboard-player');
vm.runInContext('maybeLoadMorePlaytimeLeaderboard()', context);
assert.equal(list.children.length, 48);
assert.deepEqual(list.children.slice(0, 24), firstRows, 'appending must retain existing row nodes');
assert.equal(identityRenders, 48, 'appending must only render new avatars');
assert.equal(scrollWrites, 0, 'appending near the bottom must not alter touch scroll position');
assert.equal(list.scrollTop, 850);
players[0].playtime = '999h';
vm.runInContext('renderPlaytimeLeaderboard()', context);
assert.equal(firstRows[0].querySelector('strong').textContent, '999h');
assert.equal(firstRows[0].querySelector('.leaderboard-player'), firstIdentity);
assert.equal(identityRenders, 48, 'metric refreshes must retain decoded avatars');
players.reverse();
vm.runInContext('renderPlaytimeLeaderboard()', context);
assert.equal(list.children[0].dataset.playerKey, 'uuid59', 'sorting must move players into their new ranks');
assert.equal(list.children.length, 48, 'sorting must remove players outside the visible batch');
assert.equal(list.children[47].querySelector('.rank-index').textContent, '48');
assert.equal(scrollWrites, 0);

console.log('player mobile performance UI tests passed');
