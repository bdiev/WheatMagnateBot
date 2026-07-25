'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');

assert.doesNotMatch(
  botSource,
  /DELETE FROM game_chat_messages WHERE created_at < NOW\(\) - INTERVAL '30 days'/,
  'recorded game chat must not be deleted by the old 30-day retention rule'
);
assert.match(serverSource, /beforeMessageId/, 'player chat history must support stable pagination');
assert.match(serverSource, /WHERE id <= \$2::bigint/, 'chat API must load messages before the exact message ID');
assert.match(serverSource, /WHERE id > \$2::bigint/, 'chat API must load messages after the exact message ID');
assert.match(serverSource, /POSITION\(LOWER\(\$2\) IN LOWER\(message\)\) > 0/, 'chat search must query the full stored message table');
assert.match(serverSource, /date_trunc\('day', MIN\(created_at\)\)/, 'daily chat statistics must begin at the first archived message');
assert.match(serverSource, /date_trunc\('month', created_at\)/, 'monthly chat statistics must cover the archive');
assert.match(appSource, /data-player-chat-more/, 'player profile must expose older archived messages');
assert.match(appSource, /data-chat-message-id/, 'player messages must link back to their chat context');
assert.match(appSource, /chatContextMessageId/, 'live refreshes must preserve historical context viewing');
assert.match(appSource, /searchGameChat/, 'the chat UI must expose archive search');
assert.match(appSource, /setChatArchiveSearchOpen/, 'archive search must use a compact expandable control');
assert.match(appSource, /updateChatDateIndicator/, 'the chat must show the date of the currently visible messages');
assert.match(appSource, /state\.charts\.chatMonthly/, 'the month chart must use archive-wide monthly statistics');
assert.match(stylesSource, /\.player-profile-message p\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s,
  'long player messages must wrap without overlapping their timestamp');
assert.match(stylesSource, /Mobile composition for the permanent chat archive and player history/,
  'chat archive and player history must have a dedicated mobile composition');
assert.match(stylesSource, /\.chat-message,\s*\.chat-message\.chat-activity\s*\{[^}]*grid-template-areas:/s,
  'mobile chat messages must keep identity, timestamp, and text in stable grid areas');

console.log('Chat archive tests passed.');
