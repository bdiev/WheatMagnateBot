'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const minecraftChatSource = fs.readFileSync(path.join(root, 'minecraft-chat-component.js'), 'utf8');
const chatNormalizationSource = fs.readFileSync(path.join(root, 'site', 'chat-message-normalization.js'), 'utf8');
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
  /const wmMatch = message\.match\([\s\S]*?if \(wmMatch\) \{\s*\/\/[\s\S]*?scheduleGameChatForward\(username, message, source\);\s*await handleWmCommand/,
  '!wm commands must use the shared chat forwarder so message/messagestr echoes are deduplicated'
);
assert.match(serverSource, /beforeMessageId/, 'player chat history must support stable pagination');
assert.match(serverSource, /WHERE id <= \$2::bigint/, 'chat API must load messages before the exact message ID');
assert.match(serverSource, /WHERE id > \$2::bigint/, 'chat API must load messages after the exact message ID');
assert.match(serverSource, /POSITION\(LOWER\(\$2\) IN LOWER\(message\)\) > 0/, 'chat search must query the full stored message table');
assert.match(serverSource, /LOWER\(TRIM\(admin_tag\.value\)\) = 'bot'/,
  'chat API must classify the case-insensitive Minecraft Players Bot tag');
assert.match(serverSource, /isBot: Boolean\(row\.is_bot\)/,
  'chat API must expose the bot classification to the dashboard');
assert.match(appSource, /chat-message-bot[\s\S]*chat-bot-badge/,
  'bot chat messages must render with a dedicated class and badge');
assert.match(stylesSource, /\.chat-message\.chat-message-bot:not\(\.chat-activity\)[\s\S]*--bot-accent/,
  'bot chat messages must have a distinct visual treatment');
assert.match(botSource, /isTaggedBotPlayer\(username\)[\s\S]*name: isBotPlayer \? `\$\{username\} • BOT`/,
  'Discord bridge messages from tagged bots must have a visible BOT label');
assert.doesNotMatch(botSource, /Automated player/,
  'tagged bot messages must not add an Automated player caption');
assert.match(botSource, /footer: \{ text: 'Flood protection' \}/,
  'flood summaries must use the concise footer label');
assert.doesNotMatch(botSource, /Discord bridge flood protection/,
  'the old verbose flood footer must not remain');
assert.doesNotMatch(
  botSource.match(/async function sendGameChatMessageToDiscord[\s\S]*?\n\}/)?.[0] || '',
  /recordGameChatMessage/,
  'website chat must not archive a message before shared AntiFlood accepts it'
);
assert.match(
  botSource,
  /async function deliverGameChatMessageToDiscord[\s\S]*await recordGameChatMessage\(username, message\);[\s\S]*!DISCORD_CHAT_CHANNEL_ID[\s\S]*return true;/,
  'accepted messages and flood summaries must reach the website archive even while Discord is unavailable'
);
assert.match(
  serverSource,
  /function displayGameChatMessage[\s\S]*normalizeGreenChatMessage\(value\)[\s\S]*message: displayGameChatMessage\(row\.message\)/,
  'site chat responses must use the shared safe GreenChat prefix normalizer'
);
assert.match(minecraftChatSource, /require\('\.\/site\/chat-message-normalization'\)/, 'the bot and website must share one GreenChat normalizer');
assert.match(chatNormalizationSource, /function normalizeGreenChatMessage[\s\S]*replace\(\/\^>\\s\+\//, 'GreenChat normalization must require whitespace after its marker');
assert.doesNotMatch(chatNormalizationSource, /replace\(\/\^>\\s\*\//, 'message content such as >_< must retain its leading angle bracket');
assert.match(serverSource, /date_trunc\('day', MIN\(created_at\)\)/, 'daily chat statistics must begin at the first archived message');
assert.match(serverSource, /date_trunc\('month', created_at\)/, 'monthly chat statistics must cover the archive');
assert.match(appSource, /data-player-chat-more/, 'player profile must expose older archived messages');
assert.match(appSource, /data-chat-message-id/, 'player messages must link back to their chat context');
assert.match(appSource, /function linkifyChatMessage[\s\S]*new URL[\s\S]*parsed\.protocol !== 'http:'[\s\S]*rel="noopener noreferrer"/, 'game-chat links must be protocol-checked and safely opened in a new tab');
assert.match(appSource, /chatText\.innerHTML = linkifyChatMessage\(text\)/, 'the main game-chat feed must render safe clickable links');
assert.match(appSource, /player-profile-message[\s\S]*linkifyChatMessage\(message\.message\)/, 'player chat history must render the same safe clickable links');
assert.match(appSource, /handlePlayerProfileClick[\s\S]*closest\('\.chat-link'\)[\s\S]*handleChatReplyClick[\s\S]*closest\('\.chat-link'\)/, 'clicking a chat link must not trigger profile-history or reply actions');
assert.match(stylesSource, /\.chat-link\s*\{[^}]*text-decoration:\s*underline;/s, 'clickable chat links must remain visually recognizable');
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
assert.match(appSource, /function playerHeadUrl\([\s\S]*\/api\/minecraft-avatar\?username=\$\{safeUsername\}/,
  'chat avatars must use the cached fallback avatar endpoint');
assert.match(appSource, /playerIdentity\(username, 28, \{ uuid: message\.playerUuid \}\)/,
  'chat avatars must use the recorded player UUID when available');
assert.match(serverSource, /playerUuid: row\.player_uuid \|\| null/,
  'chat API must expose the recorded player UUID for stable skin resolution');
assert.match(serverSource, /const cacheKey = `v2:\$\{avatarIdentity\.toLowerCase\(\)\}`/,
  'avatar cache must not reuse stale username-only placeholder entries');
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
assert.match(indexSource, /styles\.css\?v=201/, 'the updated mobile layout must use a fresh stylesheet URL');
assert.match(indexSource, /app\.js\?v=201/, 'the updated dashboard behavior must use a fresh script URL');
assert.match(serviceWorkerSource, /CACHE_VERSION = '201'/, 'the app shell cache must be replaced after dashboard behavior changes');
assert.match(serviceWorkerSource, /fallbackPath[\s\S]*?'\/request\.html'/, 'resource requests must have their own navigation fallback');
assert.match(stylesSource, /\.chat-message\s*\{[^}]*flex:\s*0 0 auto;/s,
  'chat cards must retain their natural height inside the scrolling flex list');
assert.doesNotMatch(serviceWorkerSource, /return cached \|\| fresh/, 'UI assets must not prefer stale cached responses');
assert.match(
  botSource,
  /function resolvePublicChatEnvelope\([\s\S]*if \(jsonMessage\)[\s\S]*parseRawPublicChatLine\(candidate\)[\s\S]*if \(parsed\?\.username && parsed\?\.message\) return parsed;[\s\S]*return fallback;/,
  'the rendered Minecraft chat envelope must determine the sender when it is available'
);
assert.doesNotMatch(
  botSource,
  /COMMAND_RESPONSE_|recentCommandBotResponses|rawChatTraceUntil|armSeenCommandResponseCapture|rememberCommandBotResponse|isTruncatedCommandBotResponse/i,
  'chat handling must not contain command-bot-specific attribution or tracing workarounds'
);
assert.match(
  botSource,
  /const handleMinecraftPlayerChat = async[\s\S]*bot\.on\('chat', handleMinecraftPlayerChat\)/,
  'standard chat and component-only GreenChat must share one player-message handler'
);
assert.match(
  botSource,
  /analyzeMinecraftChatComponent\(message,[\s\S]*componentChat\.isGreenChat[\s\S]*handleMinecraftPlayerChat\([\s\S]*source: 'mineflayer-message-greenchat'/,
  'GreenChat must be recovered from structured message components and enter the shared pipeline'
);
assert.match(
  botSource,
  /handledGreenChatComponents\.has\(jsonMessage\)[\s\S]*handledGreenChatComponents\.mark\(message\)[\s\S]*handledGreenChatComponents\.has\(originalMessage\)/,
  'chat and messagestr echoes of a classified GreenChat must be rejected by exact ChatMessage identity'
);
assert.doesNotMatch(
  botSource,
  /recentGreenComponentMessages|greenComponentMessageKey|rememberGreenComponentMessage|consumeGreenComponentMessage/,
  'GreenChat event exclusion must not rely on text keys or timeout windows'
);
assert.match(
  botSource,
  /duplicate && duplicate\.source !== source && nowTs - duplicate\.timestamp < 1_500/,
  'chat and message events for the same player message must collapse before Discord delivery'
);
const discordCommandBranch = botSource.match(
  /if \(gameText\.startsWith\('\/'\) \|\| gameText\.startsWith\('!'\)\) \{[\s\S]*?\n\s*\} else \{/
)?.[0] || '';
assert.match(
  discordCommandBranch,
  /recordGameChatMessage\(username, gameText\)/,
  'Discord-to-Minecraft commands must still be written to the chat archive'
);
assert.doesNotMatch(
  discordCommandBranch,
  /sendGameChatMessageToDiscord/,
  'Discord-to-Minecraft commands must not create a second Discord bridge message before confirmation'
);
assert.match(
  botSource,
  /isKnownOnlinePlayer[\s\S]*isSignedPlayerChat[\s\S]*if \(!isKnownOnlinePlayer && !isSignedPlayerChat\) \{\s*return false;/,
  'player-shaped system text must require a signed chat position or a currently known player'
);
assert.doesNotMatch(botSource, /\[MC CHAT DEBUG\]/, 'temporary Minecraft chat diagnostics must be removed');
assert.doesNotMatch(botSource, /\[MC->DISCORD TRACE\]/, 'temporary Discord bridge traces must be removed');
assert.doesNotMatch(botSource, /\[MC->DISCORD SEND\]/, 'temporary final Discord send traces must be removed');
assert.match(botSource, /isPrivateMinecraftChatLine\(text\)[\s\S]*evidence: \['private_message'\]/, 'whispers must be rejected before component GreenChat classification');

console.log('Chat archive tests passed.');
