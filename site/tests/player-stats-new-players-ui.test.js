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
  /WITH identities AS[\s\S]*ORDER BY identities\.registration_at DESC[\s\S]*LIMIT 12[\s\S]*newPlayers: newPlayersResult\.rows\.map/,
  'Player Stats must return the latest tracked player identities'
);
assert.match(stylesSource, /\.player-new-panel\s*\{[\s\S]*?grid-template-rows:/, 'the new player list must have a bounded panel layout');

console.log('player stats new players UI tests passed');
