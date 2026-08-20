'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlayerGameSessions } = require('../server');

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
assert.match(appSource, /data-current-session-start=[\s\S]*?function updatePlayerProfileSessionClock\(\)[\s\S]*?formatDurationMs\(Math\.max\(0, now - startedAt\)\)[\s\S]*?setInterval\(updatePlayerProfileSessionClock, 1_000\)/,
  'the active session duration must update every second while the profile is open');
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
assert.match(migrationSource, /operational_events_player_session_resource_idx[\s\S]*?operational_events_archive_player_session_resource_idx/,
  'active and archived session events must both have profile lookup indexes');
assert.doesNotMatch(appSource, /most recent recorded/,
  'the capped session-list size must not be presented as the total number of sessions');

console.log('Player game session tests passed.');
