'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

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
  serverSource,
  /isNewPlayer:\s*isNewPlayerRegistration\(profile\.registration_at\)/,
  'the player-profile API must compute the two-week New Player status from the current registration date'
);
assert.match(
  appSource,
  /storedAdminTags[\s\S]*toLowerCase\(\) !== 'new player'[\s\S]*profile\.isNewPlayer[\s\S]*New Player[\s\S]*adminTagMarkup \|\| 'None'/,
  'Admin metadata must show New Player as a computed tag and hide a stale stored copy'
);
assert.match(
  appSource,
  /function schedulePlayerProfileRefresh\(username\)[\s\S]*\[1_500, 4_000, 8_000\][\s\S]*loadPlayerProfile\(state\.playerProfileUsername\)[\s\S]*schedulePlayerProfileRefresh\(username\)/,
  'a player card must re-query the profile after an observed !jd response can update the registration date'
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
assert.match(
  stylesSource,
  /\.player-profile-head\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\);[^}]*padding:\s*18px 64px 0 18px;[^}]*background:\s*[^}]*var\(--panel\);/s,
  'the profile header must use the compact square-avatar composition'
);
assert.match(
  stylesSource,
  /\.player-profile-actions\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*margin:\s*16px -64px 0 -18px;[^}]*border-top:\s*1px solid var\(--line\);/s,
  'profile actions must live in a full-width footer toolbar'
);
assert.match(
  stylesSource,
  /\.player-profile-actions > \.player-profile-message-action:first-child\s*\{[^}]*border-color:\s*var\(--accent\);[^}]*color:\s*var\(--player-accent-contrast, var\(--panel\)\);[^}]*background:\s*var\(--accent\);/s,
  'the primary message action must use the current player accent with accessible text'
);
assert.match(
  appSource,
  /player-profile-action-icon[\s\S]*m22 9-6 6[\s\S]*M4 19\.5v-15[\s\S]*M21 15a4 4[\s\S]*M15 3h6v6/,
  'profile actions must use the proposed outline message, external-link, book, and mute icons'
);
assert.doesNotMatch(
  appSource,
  /player-profile-actions[\s\S]{0,1000}(?:Writable_Book|namemc_dark|Muted|Unmuted|Book)\.png/,
  'profile actions must not fall back to the old bitmap icons'
);
assert.match(
  stylesSource,
  /\.player-profile-action-icon\s*\{[^}]*stroke:\s*currentColor;[^}]*stroke-width:\s*2;[^}]*stroke-linecap:\s*round;/s,
  'profile action icons must use the same thin outline treatment as the selected mockup'
);
assert.match(
  stylesSource,
  /\.player-profile-whitelist-action\.is-remove\s*\{[^}]*color:\s*var\(--muted\);[^}]*background:\s*transparent;/s,
  'the remove-from-whitelist state must retain the neutral ghost-button color'
);
assert.match(
  indexSource,
  /id="playerProfileClose"[\s\S]*player-profile-close-icon[\s\S]*M18 6 6 18M6 6l12 12/,
  'the player profile close control must use the selected outline X icon'
);
assert.match(
  stylesSource,
  /\.player-profile-close\s*\{[^}]*border:\s*1px solid transparent;[^}]*background:\s*transparent;/s,
  'the player profile close control must use the minimal ghost treatment'
);

console.log('Player profile whitelist UI tests passed.');
