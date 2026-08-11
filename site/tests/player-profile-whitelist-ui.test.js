'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

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
  /isWhitelisted = action === 'whitelist_add';[\s\S]*state\.playerProfileLastPayload\.isWhitelisted = isWhitelisted;[\s\S]*renderPlayerProfile\(state\.playerProfileLastPayload\)/,
  'the card must immediately reflect a successful whitelist addition or removal'
);

console.log('Player profile whitelist UI tests passed.');
