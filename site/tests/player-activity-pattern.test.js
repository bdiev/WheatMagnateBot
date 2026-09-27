'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlayerActivityPattern, resolveTimeZone } = require('../player-activity-pattern');
const { buildPlayerGameSessions } = require('../server');

const now = new Date('2026-09-23T12:00:00.000Z'); // Wednesday

// Monday 2026-09-21 21:30 -> 23:00 in Europe/Vilnius (UTC+3 in September).
const pattern = buildPlayerActivityPattern([
  { startedAt: '2026-09-21T18:30:00.000Z', endedAt: '2026-09-21T20:00:00.000Z', isCurrent: false },
  { startedAt: '2026-09-22T18:00:00.000Z', endedAt: '2026-09-22T18:30:00.000Z', isCurrent: false },
  { startedAt: '2026-09-23T11:00:00.000Z', endedAt: null, isCurrent: true }
], { timeZone: 'Europe/Vilnius', now });

assert.equal(pattern.timeZone, 'Europe/Vilnius');
assert.equal(pattern.heatmap[0][21], 1800, 'Monday 21:30-22:00 local must land in the 21:00 cell');
assert.equal(pattern.heatmap[0][22], 3600, 'Monday 22:00-23:00 local must fill the 22:00 cell');
assert.equal(pattern.heatmap[1][21], 1800, 'Tuesday 21:00-21:30 local must land in the 21:00 cell');
assert.equal(pattern.heatmap[2][14], 3600, 'the live session must count up to now');
assert.equal(pattern.completedSessionCount, 2);
assert.equal(pattern.averageSessionSeconds, 3600, 'the average must ignore the unfinished session');
assert.equal(pattern.longestSession.durationSeconds, 5400);
assert.equal(pattern.activeDays, 3);
assert.equal(pattern.currentStreakDays, 3);
assert.equal(pattern.longestStreakDays, 3);
assert.deepEqual(pattern.peak, { weekday: 0, hour: 22 });
assert.equal(pattern.firstObservedAt, '2026-09-21T18:30:00.000Z');

const brokenStreak = buildPlayerActivityPattern([
  { startedAt: '2026-09-10T10:00:00.000Z', endedAt: '2026-09-10T11:00:00.000Z' },
  { startedAt: '2026-09-11T10:00:00.000Z', endedAt: '2026-09-11T11:00:00.000Z' },
  { startedAt: '2026-09-12T10:00:00.000Z', endedAt: '2026-09-12T11:00:00.000Z' },
  { startedAt: '2026-09-22T10:00:00.000Z', endedAt: '2026-09-22T11:00:00.000Z' }
], { timeZone: 'UTC', now });
assert.equal(brokenStreak.longestStreakDays, 3);
assert.equal(brokenStreak.currentStreakDays, 1, 'a session yesterday keeps the streak alive until today ends');

const expiredStreak = buildPlayerActivityPattern([
  { startedAt: '2026-09-20T10:00:00.000Z', endedAt: '2026-09-20T11:00:00.000Z' }
], { timeZone: 'UTC', now });
assert.equal(expiredStreak.currentStreakDays, 0);

const midnightSession = buildPlayerActivityPattern([
  { startedAt: '2026-09-21T23:30:00.000Z', endedAt: '2026-09-22T00:30:00.000Z' }
], { timeZone: 'UTC', now });
assert.equal(midnightSession.heatmap[0][23], 1800);
assert.equal(midnightSession.heatmap[1][0], 1800);
assert.equal(midnightSession.activeDays, 2, 'a session crossing midnight counts both local days');

assert.equal(pattern.heatmapDays[0][22], 1, 'each cell counts the distinct local days it was active');
assert.deepEqual(pattern.weekdayCounts, [1, 1, 1, 0, 0, 0, 0], 'weekday occurrences run from the first observed day to today');

const regular = buildPlayerActivityPattern([
  { startedAt: '2026-09-07T20:00:00.000Z', endedAt: '2026-09-07T20:30:00.000Z' },
  { startedAt: '2026-09-07T20:40:00.000Z', endedAt: '2026-09-07T20:50:00.000Z' },
  { startedAt: '2026-09-21T20:10:00.000Z', endedAt: '2026-09-21T20:20:00.000Z' }
], { timeZone: 'UTC', now });
assert.equal(regular.heatmapDays[0][20], 2, 'two sessions in the same hour of one day count that day once');
assert.equal(regular.weekdayCounts[0], 3, 'Mondays Sep 7, 14 and 21 were observed');

const overlapping = buildPlayerActivityPattern([
  { startedAt: '2026-09-22T10:00:00.000Z', endedAt: '2026-09-22T11:00:00.000Z', isCurrent: false },
  { startedAt: '2026-09-22T10:30:00.000Z', endedAt: '2026-09-22T11:30:00.000Z', isCurrent: false }
], { timeZone: 'UTC', now });
assert.equal(overlapping.heatmap[1][10], 3600, 'overlapping records must not count the same minutes twice');
assert.equal(overlapping.heatmap[1][11], 1800);

// Europe/Vilnius switched from UTC+3 to UTC+2 at 04:00 local on 2026-10-25,
// so 03:00 local happens twice.
const dstFallback = buildPlayerActivityPattern([
  { startedAt: '2026-10-24T23:00:00.000Z', endedAt: '2026-10-25T03:00:00.000Z' }
], { timeZone: 'Europe/Vilnius', now: new Date('2026-10-26T00:00:00.000Z') });
assert.equal(dstFallback.heatmap[6][2], 3600);
assert.equal(dstFallback.heatmap[6][3], 7200, 'the repeated DST hour holds both real hours');
assert.equal(dstFallback.heatmap[6][4], 3600);
const kathmandu = buildPlayerActivityPattern([
  { startedAt: '2026-09-22T10:00:00.000Z', endedAt: '2026-09-22T11:00:00.000Z' }
], { timeZone: 'Asia/Kathmandu', now });
assert.equal(kathmandu.heatmap[1][15], 900, 'UTC+5:45 must split slices on local hour marks');
assert.equal(kathmandu.heatmap[1][16], 2700);

const staleLiveStart = buildPlayerGameSessions([
  { event_type: 'player_joined', occurred_at: '2026-09-23T08:00:00.000Z' },
  { event_type: 'player_left', occurred_at: '2026-09-23T10:00:00.000Z' }
], { isOnline: true, currentStartedAt: '2026-09-23T09:00:00.000Z', now });
assert.equal(staleLiveStart[0].startedAt, '2026-09-23T10:00:00.000Z', 'a live session cannot start before the last recorded leave');

const empty = buildPlayerActivityPattern([], { timeZone: 'Not/AZone', now });
assert.equal(empty.timeZone, 'UTC', 'an invalid timezone must fall back to UTC');
assert.equal(empty.maxCellSeconds, 0);
assert.equal(empty.peak, null);
assert.equal(empty.longestSession, null);
assert.equal(resolveTimeZone(''), 'UTC');

const manyEvents = [];
for (let index = 0; index < 150; index += 1) {
  const start = Date.UTC(2026, 6, 1) + index * 3 * 3600 * 1000;
  manyEvents.push({ event_type: 'player_joined', occurred_at: new Date(start).toISOString() });
  manyEvents.push({ event_type: 'player_left', occurred_at: new Date(start + 3600 * 1000).toISOString() });
}
assert.equal(buildPlayerGameSessions(manyEvents).length, 100, 'the session list stays capped by default');
assert.equal(buildPlayerGameSessions(manyEvents, { limit: Infinity }).length, 150, 'the pattern must see every session');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
assert.match(appSource, /renderPlayerActivityPattern\(profile\.activityPattern\)/);
assert.match(appSource, /<div class="player-profile-badges">\s*\$\{renderPlayerPingBadge\(profile\)\}/, 'the ping badge must share the secondary badge row');
assert.match(appSource, /<details class="player-profile-activity">/, 'the activity pattern must be collapsible');
assert.match(appSource, /data-activity-cell/, 'heatmap cells must be interactive');
assert.match(appSource, /data-activity-selection aria-live="polite"/, 'the selected heatmap period must be announced');
assert.match(appSource, /'ArrowLeft'.*'ArrowRight'.*'ArrowUp'.*'ArrowDown'.*'Home'.*'End'/, 'heatmap cells must support arrow, Home and End navigation');
assert.match(appSource, /Math\.ceil\(Math\.sqrt\(seconds \/ pattern\.maxCellSeconds\) \* 4\)/, 'heat levels must use a square-root scale');
assert.match(appSource, /of \$\{formatNumber\(Math\.max\(days, weeks\)\)\} \$\{PLAYER_ACTIVITY_WEEKDAY_NAMES\[weekday\]\}/, 'cells must say how many of the observed weekdays were active');
assert.match(appSource, /Sessions observed by the bot\$\{since \?/, 'the section must say since when sessions are observed');
assert.match(appSource, /activityCellKey:[\s\S]*dataset\.activityKey === viewState\.activityCellKey[\s\S]*selectPlayerActivityCell\(selectedCell\)/, 'the selected cell must survive background refreshes');
assert.match(appSource, /player-ping-number/, 'ping digits must use a dedicated readable style');
assert.match(appSource, /const PLAYER_PING_CHART_DAYS = 14;[\s\S]*player-ping-bar is-empty/, 'the ping chart must keep a fixed day window with empty slots for missing days');
assert.match(appSource, /class="player-ping-stats"/, 'ping averages must render as compact stat tiles');
assert.match(appSource, /querySelectorAll\('\.player-ping-details\[open\]'\)[\s\S]*details\.open = false/, 'tapping outside must close the ping popover');
assert.match(appSource, /activityPatternOpen[\s\S]*pingDetailsOpen|pingDetailsOpen[\s\S]*activityPatternOpen/, 'open panels must survive background refreshes');
assert.match(stylesSource, /\.player-activity-stats\s*\{[^}]*grid-template-columns:\s*repeat\(6,/s, 'desktop activity stats must fit in one compact row');
assert.match(stylesSource, /\.player-activity-cell\s*\{[^}]*min-width:\s*0;/s, 'interactive cells must override the global button width');
assert.match(stylesSource, /\.player-ping-details\s*>\s*summary\s*\{[^}]*font-family:\s*ui-monospace/s, 'ping digits must not use the hard-to-read pixel font');
assert.match(stylesSource, /\.player-ping-bars\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s, 'ping bars must span the full popover width');
assert.match(stylesSource, /\.player-profile-avatar-wrap\s*\{[^}]*contain:\s*layout;[^}]*backface-visibility:\s*hidden;/s, 'the avatar must keep stable layout containment without clipping its status halo');
assert.match(stylesSource, /\.player-profile-avatar-wrap::before\s*\{[^}]*animation:\s*player-status-halo[^}]*will-change:\s*transform, opacity;/s, 'the profile status halo must animate only compositor-friendly properties');
assert.match(stylesSource, /\.player-profile-avatar-wrap::after\s*\{[^}]*background:\s*var\(--player-status-color\);[^}]*box-shadow:/s, 'the solid profile status marker must stay visually stable');
assert.match(stylesSource, /\.player-profile-avatar-wrap\[data-status="online"\]\s*\{[^}]*--player-status-color:\s*#55c85a;/s, 'online profiles must switch the shared status animation to green');
assert.match(stylesSource, /button\.player-activity-cell\.is-selected[\s\S]*box-shadow:\s*none;/, 'selected heatmap cells must not inherit the global button shadow');
assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*\.player-profile-activity > summary > div > small[\s\S]*display:\s*none;[\s\S]*\.player-activity-legend\s*\{\s*display:\s*none;/, 'mobile activity details must hide redundant labels and legend');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(serverSource, /timeZone: await getAccountTimezone\(currentUser\.id\)/, 'the profile must use the viewer account timezone');

for (const directory of ['../migrations', '../../database/migrations']) {
  const migration = fs.readFileSync(path.join(__dirname, directory, '058_player_ping.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_ping_hourly/);
  assert.match(migration, /last_ping_ms/);
}

console.log('player activity pattern tests passed');
