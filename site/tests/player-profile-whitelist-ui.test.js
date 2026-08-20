'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

assert.match(
  appSource,
  /whitelistAction = profile\.isWhitelisted \? 'whitelist_remove' : 'whitelist_add'[\s\S]*state\.currentUser\?\.role === 'admin'[\s\S]*data-player-whitelist-action="\$\{whitelistAction\}"/,
  'the admin player-card button must switch between whitelist addition and removal'
);
assert.match(
  appSource,
  /closest\('\[data-player-whitelist-action\]'\)[\s\S]*commandType: action[\s\S]*payload: \{ username \}/,
  'the player-card action must queue the selected whitelist command for that player'
);
assert.match(
  appSource,
  /isWhitelisted = action === 'whitelist_add';[\s\S]*state\.playerProfileLastPayload\.isWhitelisted = isWhitelisted;[\s\S]*replacePlayerProfileContent\(state\.playerProfileLastPayload\)/,
  'the card must immediately reflect a successful whitelist addition or removal'
);
assert.match(
  appSource,
  /data-player-refresh-command="!pt"[\s\S]*data-player-refresh-command="!jd"[\s\S]*data-player-refresh-command="!seen"/,
  'playtime, registration, and empty Last Seen metrics must expose refresh actions'
);
assert.match(
  appSource,
  /closest\('\[data-player-refresh-command\]'\)[\s\S]*'!seen': \{ metric: 'lastSeen'[\s\S]*postJson\('\/api\/chat\/send',[\s\S]*message: `\$\{command\} \$\{username\}`[\s\S]*playerInfoRefresh:[\s\S]*metric: refresh\.metric/,
  'player metric refresh actions must explicitly authorize one observed update before sending the game command'
);
assert.match(
  appSource,
  /function registrationProfileValue\(profile\)[\s\S]*playerProfileRegistrationDateMode[\s\S]*formatRegistrationAge[\s\S]*function lastSeenProfileValue\(profile\)[\s\S]*playerProfileLastSeenDateMode[\s\S]*formatRegistrationAge\(profile\.lastSeen\).*ago/,
  'Registered and Last Seen must show elapsed time first and expose their exact-date modes independently'
);
assert.match(
  appSource,
  /data-profile-toggle="registration-date"[\s\S]*data-profile-toggle="last-seen-date"[\s\S]*closest\('\[data-profile-toggle\]'\)[\s\S]*playerProfileLastSeenDateMode = !state\.playerProfileLastSeenDateMode/,
  'Registered and Last Seen values must both be clickable toggles'
);
assert.match(
  appSource,
  /function formatFullDateTime\(value\)[\s\S]*year: 'numeric'[\s\S]*registrationProfileValue[\s\S]*formatFullDateTime\(profile\.registrationAt\)[\s\S]*lastSeenProfileValue[\s\S]*formatFullDateTime\(profile\.lastSeen\)/,
  'both exact metric dates must include the year'
);
assert.match(
  stylesSource,
  /@media \(max-width: 700px\)[\s\S]*\.player-profile-whitelist-action span\s*\{[^}]*white-space:\s*normal;/,
  'the mobile whitelist action label must wrap inside its button'
);

console.log('Player profile whitelist UI tests passed.');
