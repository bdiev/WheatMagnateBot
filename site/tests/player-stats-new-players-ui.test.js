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
  /\.new-player-item\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.new-player-meta\s*\{[^}]*display:\s*flex;[^}]*padding-left:\s*37px;/s,
  'mobile New Player rows must stack identity and metadata without squeezing either column'
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
