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
assert.match(appSource, /'ArrowLeft'.*'ArrowRight'.*'ArrowUp'.*'ArrowDown'/, 'heatmap cells must support arrow-key navigation');
assert.match(appSource, /activityCellLabel:[\s\S]*selectPlayerActivityCell\(selectedCell\)/, 'the selected cell must survive background refreshes');
assert.match(appSource, /player-ping-number/, 'ping digits must use a dedicated readable style');
assert.match(appSource, /activityPatternOpen[\s\S]*pingDetailsOpen|pingDetailsOpen[\s\S]*activityPatternOpen/, 'open panels must survive background refreshes');
assert.match(stylesSource, /\.player-activity-stats\s*\{[^}]*grid-template-columns:\s*repeat\(6,/s, 'desktop activity stats must fit in one compact row');
assert.match(stylesSource, /\.player-activity-cell\s*\{[^}]*min-width:\s*0;/s, 'interactive cells must override the global button width');
assert.match(stylesSource, /\.player-ping-details\s*>\s*summary\s*\{[^}]*font-family:\s*ui-monospace/s, 'ping digits must not use the hard-to-read pixel font');
assert.match(stylesSource, /\.player-profile-avatar-wrap\s*\{[^}]*contain:\s*layout paint;[^}]*backface-visibility:\s*hidden;/s, 'the avatar must remain on a stable paint layer when ping details open');
assert.match(stylesSource, /\.player-profile-avatar-wrap\[data-status="online"\]::after\s*\{[^}]*animation:\s*player-online-pulse/s, 'the profile online status marker must keep breathing');
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
