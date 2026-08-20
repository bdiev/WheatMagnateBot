'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');

assert.match(
  botSource,
  /async function synchronizePlayerHeadEmojiUnlocked[\s\S]*hashPlayerHeadImage\(preparedImage\)[\s\S]*PLAYER_HEAD_SKIN_HASHES\.get\(key\) === skinHash/,
  'the synchronizer must compare the current rendered skin with its persisted hash'
);
assert.match(
  botSource,
  /name: existing \? temporaryName : emojiName[\s\S]*await existing\.delete\(\)[\s\S]*replacement = await replacement\.setName\(emojiName\)/,
  'skin refresh must upload the replacement before deleting the active emoji'
);
assert.match(
  botSource,
  /async function addUsernameToWhitelist[\s\S]*result\.changed[\s\S]*synchronizePlayerHeadEmoji\(targetUsername, \{ forceRecreate: true \}\)/,
  'a newly or re-added whitelist player must receive a fresh emoji'
);
assert.match(
  botSource,
  /async function removeUsernameFromWhitelist[\s\S]*DELETE FROM whitelist WHERE LOWER\(username\) = LOWER\(\$1\)[\s\S]*await deletePlayerHeadEmoji\(safeUsername\)/,
  'whitelist removal must also delete the player emoji'
);
assert.match(
  botSource,
  /async function deletePlayerHeadEmojiUnlocked[\s\S]*for \(const emoji of applicationMatches\.values\(\)\) await emoji\.delete\(\)[\s\S]*PLAYER_HEAD_EMOJIS\.delete\(key\)[\s\S]*PLAYER_HEAD_SKIN_HASHES\.delete\(key\)/,
  'Discord deletion must happen before local emoji and skin caches are cleared'
);
assert.match(
  botSource,
  /function getPlayerHeadEmoji[\s\S]*if \(!isWhitelisted\) return STATUS_EMOJIS\.players/,
  'removed players must not display or recreate a custom head from a stale cache'
);
assert.match(
  botSource,
  /setInterval\(\(\) => \{[\s\S]*reconcileWhitelistedPlayerHeadEmojis\(\)[\s\S]*PLAYER_HEAD_SKIN_SYNC_INTERVAL_MS/,
  'whitelisted skins must be checked periodically'
);

console.log('Player head lifecycle tests passed.');
