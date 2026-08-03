'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'site', 'public', 'sw.js'), 'utf8');

assert.doesNotMatch(
  botSource,
  /DELETE FROM game_chat_messages WHERE created_at < NOW\(\) - INTERVAL '30 days'/,
  'recorded game chat must not be deleted by the old 30-day retention rule'
);
assert.match(
  botSource,
  /const wmMatch = message\.match\([\s\S]*?if \(wmMatch\) \{\s*\/\/[\s\S]*?scheduleGameChatForward\(username, message, 'chat'\);\s*await handleWmCommand/,
  '!wm commands must use the shared chat forwarder so message/messagestr echoes are deduplicated'
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
assert.match(stylesSource, /\.chat-message\s*\{[^}]*grid-template-columns:\s*30px minmax\(0, 1fr\) max-content;/s,
  'mobile chat messages must keep avatar, readable message body, reply action, and time in stable columns');
assert.match(appSource, /isContinuation[\s\S]*chat-message-continuation[\s\S]*isContinuation \? '' : playerIdentity/s,
  'consecutive messages from one player must render as a group with one avatar and username');
assert.match(appSource, /previousChatUsername = isActivity \? null : normalizedUsername/,
  'join and leave events must end the current player message group');
assert.match(stylesSource, /\.chat-message\.chat-activity\s*\{[^}]*grid-template-columns:\s*7px minmax\(0, max-content\) max-content;/s,
  'mobile join and leave events must use their own compact status-row layout');
assert.match(appSource, /chat-activity-\$\{activityKind\}/,
  'join and leave events must expose distinct visual states');
assert.match(appSource, /const player = event\.target\.closest\('\[data-player\]'\);[\s\S]*if \(player\) \{[\s\S]*state\.chatPlayerTap[\s\S]*return;/,
  'tapping a player avatar must not first activate the message reply action');
assert.match(appSource, /function handleChatPlayerPointerEnd\(event\)[\s\S]*openPlayerProfile\(tap\.username\)/,
  'a mobile avatar tap must open the player profile directly on pointerup');
assert.match(appSource, /Math\.hypot\(event\.clientX - tap\.startX, event\.clientY - tap\.startY\) > 10/,
  'scrolling from an avatar must not be mistaken for a profile tap');
assert.match(appSource, /chatPlayerClickSuppression[\s\S]*player\.closest\('#chatList'\)/,
  'the synthetic click following a mobile avatar tap must not open the profile twice');
assert.match(appSource, /const step = total > 48 \? 6 : total > 24 \? 3 : total > 12 \? 2 : 1/,
  'chart timestamps must use a readable label interval for shorter mobile series');
assert.match(appSource, /if \(lastIndex - index < step\) return '';/,
  'the final chart timestamp must not overlap the preceding interval label');
assert.match(appSource, /pointWidth: range === 'hours' \? 48 : 42/,
  'hourly TPS points must leave additional horizontal room for timestamps');
assert.match(appSource, /axisLabel: item => range === 'hours' \? String\(item\.label \|\| ''\)\.slice\(-5\) : item\.label/,
  'hourly TPS axis labels must use compact times while tooltips retain the full date');
assert.match(appSource, /function chartAxisLabelFitsViewport[\s\S]*stickyAxisClearance = 64[\s\S]*visibleRight - edgeClearance/,
  'chart labels hidden behind the sticky axis or viewport edge must not be drawn');
assert.match(appSource, /player-profile-message[\s\S]*chat-message-head[\s\S]*chat-message-name/,
  'player profile history must use the same message header as game chat');
assert.match(stylesSource, /Profile history mirrors chat rows[\s\S]*player-profile-message:hover,[\s\S]*player-profile-message:focus-visible/,
  'player profile messages must share the chat hover treatment');
assert.match(appSource, /updateChatDateIndicator\(\{ show: true \}\)/,
  'the date indicator must be revealed by chat scrolling');
assert.match(stylesSource, /\.chat-date-indicator\.visible\s*\{[^}]*opacity:\s*1;/s,
  'the date indicator must fade into view while scrolling');
assert.match(stylesSource, /\.chat-panel\.chat-search-open > \.panel-head > div:first-child\s*\{[^}]*opacity:\s*0;/s,
  'the chat heading must fade away while archive search expands');
assert.match(indexSource, /styles\.css\?v=156/, 'the updated mobile layout must use a fresh stylesheet URL');
assert.match(indexSource, /app\.js\?v=160/, 'the updated dashboard behavior must use a fresh script URL');
assert.match(serviceWorkerSource, /CACHE_VERSION = '154'/, 'the app shell cache must be replaced after dashboard behavior changes');
assert.match(serviceWorkerSource, /fallbackPath[\s\S]*?'\/request\.html'/, 'resource requests must have their own navigation fallback');
assert.match(stylesSource, /\.chat-message\s*\{[^}]*flex:\s*0 0 auto;/s,
  'chat cards must retain their natural height inside the scrolling flex list');
assert.doesNotMatch(serviceWorkerSource, /return cached \|\| fresh/, 'UI assets must not prefer stale cached responses');

console.log('Chat archive tests passed.');
