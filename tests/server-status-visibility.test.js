'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SERVER_STATUS_HIDDEN_TAG,
  SERVER_STATUS_HIDDEN_TAG_KEYS,
  createServerStatusHiddenIndex,
  hasServerStatusHiddenTag,
  isServerStatusIdentityHidden
} = require('../discord/server-status-visibility');

assert.equal(SERVER_STATUS_HIDDEN_TAG, 'Our Bot');
assert.deepEqual(SERVER_STATUS_HIDDEN_TAG_KEYS, ['our bot', 'hide-from-server-status']);
assert.equal(hasServerStatusHiddenTag(['Trusted', 'OUR BOT']), true, 'the human-readable system tag is case-insensitive');
assert.equal(hasServerStatusHiddenTag(['hide-from-server-status']), true, 'the legacy technical tag remains compatible');
assert.equal(hasServerStatusHiddenTag(['trusted']), false);

const hidden = createServerStatusHiddenIndex([
  {
    username: 'CurrentName',
    player_uuid: '71e1cf60-758e-4aae-bab9-b2e4281e8eab',
    aliases: ['OldName'],
    admin_tags: ['Our Bot']
  },
  { username: 'VisibleName', admin_tags: ['trusted'] }
]);

assert.equal(isServerStatusIdentityHidden(hidden, { username: 'currentname' }), true);
assert.equal(isServerStatusIdentityHidden(hidden, { username: 'OLDNAME' }), true, 'historical names inherit profile visibility');
assert.equal(isServerStatusIdentityHidden(hidden, { uuid: '71e1cf60758e4aaebab9b2e4281e8eab' }), true, 'UUID matching ignores dashes');
assert.equal(isServerStatusIdentityHidden(hidden, { username: 'VisibleName' }), false);

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');

assert.match(botSource, /LOWER\(TRIM\(admin_tag\.value\)\) = ANY\(\$1::text\[\]\)[\s\S]*SERVER_STATUS_HIDDEN_TAG_KEYS/, 'the bot must load tagged profiles from the database');
assert.match(botSource, /function getVisibleServerStatusOnlinePlayers\(\)[\s\S]*!isServerStatusPlayerHidden\(player\.username\)/, 'whitelist-online entries must use the shared visibility filter');
assert.match(botSource, /function getVisibleServerStatusNearbyPlayers\(\)[\s\S]*!isServerStatusPlayerHidden\(player\.username\)/, 'nearby entries must use the shared visibility filter');
assert.equal((botSource.match(/getVisibleServerStatusOnlinePlayers\(\)/g) || []).length, 4, 'all three Server Status renderers must use filtered online players');
assert.equal((botSource.match(/getVisibleServerStatusNearbyPlayers\(\)/g) || []).length, 4, 'all three Server Status renderers must use filtered nearby players');
assert.match(htmlSource, /Our Bot[\s\S]*Server Status[\s\S]*Nearby[\s\S]*Whitelist online/, 'the profile editor must document the human-readable system tag');

console.log('Server Status visibility tests passed.');
