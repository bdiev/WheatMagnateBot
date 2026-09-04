const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');

assert.match(
  appSource,
  /player-profile-uuid uuid-copy[^>]*data-copy-uuid="\$\{escapeHtml\(profile\.uuid\)\}"/,
  'the UUID in a player profile must be an interactive copy target'
);
assert.match(
  appSource,
  /function copyUuid\(target\)[\s\S]*writeClipboardText\(uuid\)[\s\S]*UUID copied/,
  'UUID copy targets must write the exact UUID and show confirmation'
);
assert.match(
  appSource,
  /chat-activity-player[^>]*data-player="\$\{escapeHtml\(username\)\}"/,
  'join and leave activity nicknames must open the standard player profile'
);
assert.match(
  htmlSource,
  /player-new-panel[\s\S]*<h2>New Players<\/h2>[\s\S]*id="newPlayersList"/,
  'Player Stats must contain a New Players card'
);
assert.match(
  serverSource,
  /function getNewPlayersPage[\s\S]*WITH identities AS[\s\S]*ORDER BY identities\.registration_at DESC[\s\S]*LIMIT \$1 OFFSET \$2/,
  'Player Stats must query tracked identities in newest-first pages'
);
assert.match(
  serverSource,
  /url\.pathname === '\/api\/new-players'[\s\S]*getNewPlayersPage\(url\)/,
  'the remaining New Players history must be available through a paginated API'
);
assert.match(
  appSource,
  /const NEW_PLAYERS_PAGE_SIZE = 24;[\s\S]*function loadMoreNewPlayers\(\)[\s\S]*\/api\/new-players\?\$\{params\}/,
  'New Players must load in small client-side pages'
);
assert.match(
  appSource,
  /newPlayersFirstPageSize[\s\S]*function syncNewPlayers[\s\S]*state\.newPlayers\.slice\(previousFirstPageSize\)[\s\S]*state\.newPlayersFirstPageSize = firstPage\.length/,
  'a refreshed first page must replace its stale cached rows while preserving pages loaded below it'
);
assert.match(
  appSource,
  /type === 'player_info_updated'[\s\S]*queueRealtimeRefresh\('players-info', refreshPlayersFromEvent, 200\)/,
  'updated player information must immediately refresh Player Stats ordering'
);
assert.match(
  appSource,
  /type === 'player_info_updated'[\s\S]*!eventPayload\.username[\s\S]*queueRealtimeRefresh\('player-profile-info',[\s\S]*loadPlayerProfile/,
  'a global player-information event must refresh the currently open profile even when the event has no username'
);
assert.doesNotMatch(
  appSource,
  /type === 'player_info_updated' && state\.currentUser\?\.role === 'admin'/,
  'approved non-admin users must also receive live updates for public player profiles'
);
assert.match(
  serverSource,
  /MAX\(updated_at\) FROM player_info_observation_state[\s\S]*playerInfoObservationAt[\s\S]*sseHub\.publish\('player_info_updated'/,
  'completed Discord imports must advance the realtime player-information marker'
);
assert.match(
  appSource,
  /function maybeLoadMoreNewPlayers\(\)[\s\S]*distanceFromBottom <= 160[\s\S]*loadMoreNewPlayers\(\)/,
  'scrolling near the end of New Players must request the next page'
);
assert.match(
  appSource,
  /function newPlayerRow[\s\S]*loading: 'lazy'/,
  'New Player avatars must not all load eagerly'
);
assert.match(stylesSource, /\.player-new-panel\s*\{[\s\S]*?grid-template-rows:/, 'the new player list must have a bounded panel layout');
assert.match(
  stylesSource,
  /\.new-player-item\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) max-content;[\s\S]*?\.new-player-meta\s*\{[^}]*justify-self:\s*end;[^}]*white-space:\s*nowrap;/s,
  'mobile New Player rows must keep identity left and date right on one line'
);
assert.match(
  stylesSource,
  /\.chat-activity-player:hover,\s*\.chat-activity-player:active\s*\{[^}]*color:\s*var\(--text\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*text-decoration:\s*none;/s,
  'clickable join and leave nicknames must explicitly neutralize the global button hover treatment'
);
assert.match(
  stylesSource,
  /\.chat-message \.player-identity\[role="button"\]:hover,\s*\.chat-message \.player-identity\[role="button"\]:active\s*\{[^}]*color:\s*inherit;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
  'player identity controls inside chat messages must remain visually unchanged on hover'
);

console.log('player stats new players UI tests passed');
