'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlayerGameSessions, playerProfileRuntimePresence, sortSeenPlayers } = require('../server');

const sessions = buildPlayerGameSessions([
  { event_type: 'player_left', occurred_at: '2026-08-15T11:00:00.000Z' },
  { event_type: 'player_joined', occurred_at: '2026-08-15T10:00:00.000Z' },
  { event_type: 'player_joined', occurred_at: '2026-08-15T12:00:00.000Z' },
  { event_type: 'player_left', occurred_at: '2026-08-15T12:30:00.000Z' },
  { event_type: 'player_joined', occurred_at: '2026-08-15T13:00:00.000Z' },
  { event_type: 'player_left', occurred_at: '2026-08-15T14:00:00.000Z' },
  { event_type: 'player_joined', occurred_at: '2026-08-15T15:00:00.000Z' }
], { isOnline: true, now: new Date('2026-08-15T16:00:00.000Z') });

assert.equal(sessions.length, 4);
assert.equal(sessions[0].isCurrent, true, 'the active session must be shown first');
assert.equal(sessions[0].durationSeconds, 3600);
assert.equal(sessions[1].startedAt, '2026-08-15T13:00:00.000Z');
assert.equal(sessions[2].durationSeconds, 1800);
assert.equal(sessions[3].durationSeconds, 3600);

const fallbackCurrent = buildPlayerGameSessions([], {
  isOnline: true,
  currentStartedAt: '2026-08-15T15:45:00.000Z',
  now: new Date('2026-08-15T16:00:00.000Z')
});
assert.equal(fallbackCurrent[0].durationSeconds, 900, 'an online profile must use its tracked start when no join event is available');

const runtimeStartedAt = '2026-08-15T15:45:00.000Z';
const freshRuntimePresence = playerProfileRuntimePresence({
  status: 'connected',
  started_at: runtimeStartedAt,
  updated_at: '2026-08-15T16:00:00.000Z',
  status_payload: { connected: true, observedAt: '2026-08-15T16:00:00.000Z' }
}, new Date('2026-08-15T16:00:10.000Z').getTime());
assert.deepEqual(freshRuntimePresence, {
  isOnline: true,
  currentStartedAt: runtimeStartedAt
}, 'a fresh connected bot runtime must make its matching player profile online');

const staleRuntimePresence = playerProfileRuntimePresence({
  status: 'connected',
  started_at: runtimeStartedAt,
  updated_at: '2026-08-15T16:00:00.000Z',
  status_payload: { connected: true }
}, new Date('2026-08-15T16:00:16.000Z').getTime());
assert.equal(staleRuntimePresence.isOnline, false, 'an expired bot heartbeat must not leave the profile online');

const sortedSeenPlayers = sortSeenPlayers([
  { username: 'WheatEmperor', isOnline: false, lastSeen: '2026-08-24T12:00:00.000Z' },
  { username: 'WheatMagnate', isOnline: true, onlineSince: '2026-08-25T11:59:00.000Z', lastSeen: '2026-06-01T00:00:00.000Z' },
  { username: 'WheatExplorer', isOnline: false, lastSeen: '2026-08-01T12:00:00.000Z' },
  { username: 'WheatChancelor', isOnline: true, onlineSince: '2026-08-25T10:00:00.000Z' }
]);
assert.deepEqual(
  sortedSeenPlayers.map(player => player.username),
  ['WheatMagnate', 'WheatChancelor', 'WheatEmperor', 'WheatExplorer'],
  'connected players must sort first using their current online start, even when their stored Last Seen is old'
);

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
const migrationSource = fs.readFileSync(path.resolve(__dirname, '..', 'migrations', '029_player_profile_session_indexes.sql'), 'utf8');

assert.match(serverSource, /FROM operational_events[\s\S]*UNION ALL[\s\S]*FROM operational_events_archive[\s\S]*LIMIT 500/,
  'player profiles must load recent and archived join/leave transitions');
assert.match(serverSource, /COUNT\(\*\) FILTER \(WHERE event_type='player_joined'\) OVER \(\)[\s\S]*AS total_sessions/,
  'the profile API must count all recorded sessions before limiting the visible transition history');
assert.match(serverSource, /const gameSessionCount = Math\.max\([\s\S]*total_sessions[\s\S]*gameSessions\.length[\s\S]*gameSessionCount,[\s\S]*gameSessions,/,
  'the profile API must expose the full session count alongside the recent session list');
assert.match(appSource, /const gameSessionCount = Math\.max\([\s\S]*profile\.gameSessionCount[\s\S]*gameSessions\.length[\s\S]*total \$\{gameSessionCount === 1 \? 'session' : 'sessions'\}/,
  'the Game sessions heading must show the total session count instead of the capped list length');
assert.match(appSource, /<section class="player-profile-grid">[\s\S]*?\$\{gameSessionsSection\}[\s\S]*?<section class="player-profile-chat">/,
  'Game sessions must render between the metric cards and Recent Chat');
assert.match(stylesSource, /\.player-profile-session-list\.is-scrollable\s*\{[\s\S]*?max-height:\s*202px;[\s\S]*?overflow-y:\s*auto;/,
  'only three 62px session rows should be visible before older sessions scroll');
assert.match(appSource, /data-player-profile-scroll="game-sessions"[\s\S]*?function capturePlayerProfileViewState[\s\S]*?scrollTop: area\.scrollTop[\s\S]*?function restorePlayerProfileViewState[\s\S]*?area\.scrollTop = saved\.scrollTop/,
  'profile refreshes must preserve the nested Game sessions scroll position');
assert.match(appSource, /function replacePlayerProfileContent[\s\S]*?capturePlayerProfileViewState\(content\)[\s\S]*?content\.innerHTML = renderPlayerProfile\(profile\)[\s\S]*?restorePlayerProfileViewState\(content, viewState\)/,
  'profile content replacement must preserve the surrounding card and nested scroll state');
assert.match(appSource, /function updatePlayerProfileSessionClock\(\)[\s\S]*?hasActiveTextSelectionWithin\(content\)[\s\S]*?return;/,
  'live profile clocks must not mutate text while the user has a selection');
assert.match(appSource, /async function loadPlayerProfile[\s\S]*?hasActiveTextSelectionWithin\(content\)[\s\S]*?player-profile-selection[\s\S]*?await fetchJson[\s\S]*?hasActiveTextSelectionWithin\(content\)[\s\S]*?player-profile-selection/,
  'background profile refreshes must defer both before and after fetching while text is selected');
assert.match(appSource, /data-current-session-start=[\s\S]*?function updatePlayerProfileSessionClock\(\)[\s\S]*?formatDurationMs\(Math\.max\(0, now - startedAt\)\)[\s\S]*?setInterval\(updatePlayerProfileSessionClock, 1_000\)/,
  'the active session duration must update every second while the profile is open');
assert.match(appSource, /Last Message[\s\S]{0,300}data-profile-relative-time=[\s\S]*?function updatePlayerProfileSessionClock\(\)[\s\S]*?formatRecentDate\(relativeTime\.dataset\.profileRelativeTime\)[\s\S]*?setInterval\(updatePlayerProfileSessionClock, 1_000\)/,
  'the Last Message relative age must update every second while the profile is open');
assert.match(appSource, /function startSlowPolling\(\)[\s\S]*?liveDashboardTimer = setInterval\(refreshLiveDashboard, 1_000\)[\s\S]*?function startFallbackPolling\(\)[\s\S]*?liveDashboardTimer = setInterval\(refreshLiveDashboard, 1_000\)/,
  'live dashboard cards must refresh every second in connected and fallback modes');
assert.match(appSource, /function formatDate\(value\)[\s\S]*?timeZone:\s*state\.accountTimezone[\s\S]*?Ended \$\{escapeHtml\(formatDate\(session\.endedAt\)\)\}/,
  'completed session timestamps must use the timezone selected in account settings');
assert.match(appSource, /state\.accountTimezone = String\(payload\.timezone \|\| timezone\)[\s\S]*?replacePlayerProfileContent\(state\.playerProfileLastPayload\)/,
  'changing the account timezone must immediately re-render an open player profile');
assert.match(appSource, /function closePlayerProfile\(\)[\s\S]*?stopPlayerProfileSessionClock\(\)/,
  'closing the profile must stop its session clock');
assert.match(appSource, /type === 'player_joined' \|\| type === 'player_left'[\s\S]*?player-profile-activity[\s\S]*?loadPlayerProfile/,
  'join and leave events must refresh an open matching profile');
assert.match(appSource, /function renderPlayerProfileSkeleton\(\)[\s\S]*?player-profile-skeleton-head[\s\S]*?player-profile-skeleton-grid[\s\S]*?player-profile-skeleton-sessions/,
  'the profile must open immediately with a full-size structural skeleton');
assert.match(appSource, /messageLimit=20[\s\S]*?replacePlayerProfileContent\(profile, \{ animate: content\.classList\.contains\('is-loading'\) \}\)/,
  'initial profiles should load a smaller chat page and animate from the skeleton');
assert.match(stylesSource, /player-profile-skeleton-shimmer[\s\S]*?player-profile-data-reveal/,
  'loading placeholders and resolved profile data must both be animated');
assert.match(serverSource, /sessionResourceKeys = aliases\.map[\s\S]*?LOWER\(resource_key\)=ANY\(\$1::text\[\]\)/,
  'session history must use its indexed resource key instead of scanning event JSON');
assert.match(serverSource, /FROM bot_accounts account[\s\S]*LEFT JOIN bot_account_runtime_state runtime[\s\S]*LOWER\(account\.username\)=ANY\(\$1::text\[\]\)[\s\S]*playerProfileRuntimePresence\(botAccount\)/,
  'a bot player profile must merge the matching account runtime presence');
assert.match(appSource, /function lastSeenProfileValue\(profile\)\s*\{\s*if \(profile\.isOnline\) return 'Online now';/,
  'an online profile must never present its previous Last Seen age as the current status');
assert.match(appSource, /<span>Last Seen<\/span>[\s\S]*profile\.isOnline\s*\? '<strong>Online now<\/strong>'/,
  'the Last Seen metric must explicitly render Online now for a connected profile');
assert.match(serverSource, /async function searchSeenPlayers[\s\S]*FROM bot_accounts account[\s\S]*LEFT JOIN bot_account_runtime_state runtime[\s\S]*runtimesByUsername[\s\S]*Boolean\(row\.is_online\) \|\| runtimePresence\.isOnline/,
  'Seen search must merge fresh bot-account runtime presence into player activity results');
assert.match(serverSource, /activeRuntimeUsernames[\s\S]*CASE WHEN is_online OR LOWER\(username\)=ANY\(\$3::text\[\]\) THEN 0 ELSE 1 END[\s\S]*LIMIT 8/,
  'fresh bot runtime presence must participate in Seen sorting before the result limit');
assert.match(serverSource, /const onlineSince = isOnline[\s\S]*runtimePresence\.currentStartedAt \|\| row\.last_online[\s\S]*onlineSince,/,
  'Seen search must expose the beginning of the current online session');
assert.match(appSource, /function seenPlayerStatusText\(player, now = Date\.now\(\)\)[\s\S]*online for \$\{formatDurationMs\(Math\.max\(0, now - startedAt\)\)\}[\s\S]*data-seen-online-since/,
  'Seen search must show the elapsed duration of the current online session');
assert.match(appSource, /function startSeenOnlineTimer\(\)[\s\S]*setInterval\(updateSeenOnlineDurations, 1_000\)/,
  'Seen online durations must update every second while search results are visible');
assert.match(migrationSource, /operational_events_player_session_resource_idx[\s\S]*?operational_events_archive_player_session_resource_idx/,
  'active and archived session events must both have profile lookup indexes');
assert.doesNotMatch(appSource, /most recent recorded/,
  'the capped session-list size must not be presented as the total number of sessions');

console.log('Player game session tests passed.');
