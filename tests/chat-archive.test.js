'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');

assert.doesNotMatch(
  botSource,
  /DELETE FROM game_chat_messages WHERE created_at < NOW\(\) - INTERVAL '30 days'/,
  'recorded game chat must not be deleted by the old 30-day retention rule'
);
assert.match(serverSource, /beforeMessageId/, 'player chat history must support stable pagination');
assert.match(serverSource, /WHERE id <= \$2::bigint/, 'chat API must load messages before the exact message ID');
assert.match(serverSource, /WHERE id > \$2::bigint/, 'chat API must load messages after the exact message ID');
assert.match(appSource, /data-player-chat-more/, 'player profile must expose older archived messages');
assert.match(appSource, /data-chat-message-id/, 'player messages must link back to their chat context');
assert.match(appSource, /chatContextMessageId/, 'live refreshes must preserve historical context viewing');

console.log('Chat archive tests passed.');
