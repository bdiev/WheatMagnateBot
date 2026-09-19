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
  /playerIdentity\(player\.username, 28, \{ status: player\.isOnline \? 'online' : 'offline', loading: 'lazy' \}\)/,
  'leaderboard avatars must be lazy-loaded'
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
assert.match(
  stylesSource,
  /@media \(max-width: 700px\) \{[\s\S]*?\.rank-item\.leaderboard-item \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: 48px;/,
  'off-screen mobile leaderboard rows must skip layout and paint work'
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

console.log('player mobile performance UI tests passed');
