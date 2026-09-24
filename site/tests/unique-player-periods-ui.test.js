'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(siteDirectory, 'public', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(siteDirectory, 'public', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(siteDirectory, 'public', 'styles.css'), 'utf8');

assert.match(serverSource, /COUNT\(DISTINCT LOWER\(username\)\)[\s\S]*AS seen_today[\s\S]*AS seen_week[\s\S]*AS seen_month/,
  'player statistics must count unique case-insensitive names for all three calendar periods');
assert.match(serverSource, /date_trunc\('day',[\s\S]*date_trunc\('week',[\s\S]*date_trunc\('month'/,
  'today, week, and month counts must use calendar boundaries');
assert.match(serverSource, /AT TIME ZONE settings\.timezone[\s\S]*obsidian_farm_analytics_settings/,
  'calendar boundaries must follow the configured account timezone');
assert.match(serverSource, /'seenToday',[\s\S]*'seenPreviousDay',[\s\S]*'seenPreviousWeek',[\s\S]*'seenPreviousMonth'/,
  'persisted player-stat caches from the previous card schema must be ignored');
assert.match(appSource, /#uniquePlayersToday[\s\S]*players\?\.seenToday[\s\S]*#uniquePlayersWeek[\s\S]*players\?\.seenWeek[\s\S]*#uniquePlayersMonth[\s\S]*players\?\.seenMonth/,
  'the player cards must render each unique-player period');
assert.match(serverSource, /AS seen_previous_day[\s\S]*AS seen_previous_week[\s\S]*AS seen_previous_month/,
  'player statistics must include each previous calendar period');
assert.match(serverSource, /FROM player_session_events[\s\S]*event_type = 'player_joined'/,
  'previous-period comparisons must use preserved session history');
assert.match(appSource, /function renderPeriodTrend[\s\S]*seenPreviousDay[\s\S]*seenPreviousWeek[\s\S]*seenPreviousMonth/,
  'the player cards must render discreet percentage trends');
for (const trendId of ['uniquePlayersTodayTrend', 'uniquePlayersWeekTrend', 'uniquePlayersMonthTrend']) {
  assert.ok(indexSource.includes(`id="${trendId}"`), `player statistics must expose trend element: ${trendId}`);
}
assert.match(indexSource, /class="stat-value-row">\s*<span id="uniquePlayersTodayTrend"[\s\S]*?<strong id="uniquePlayersToday"/,
  'the period trend must appear to the left of its primary value');
assert.match(stylesSource, /\.stat-value-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;/s,
  'the period trend and primary value must share one baseline');
for (const copy of [
  'Unique Players Today',
  'unique players since midnight',
  'Unique Players This Week',
  'unique players since Monday',
  'Unique Players This Month',
  'unique players since month start'
]) {
  assert.ok(indexSource.includes(copy), `player statistics must include: ${copy}`);
}
assert.doesNotMatch(indexSource, /Online Players Not Whitelisted|players active in 24 hours|players active in 7 days/,
  'the old whitelist and rolling-period cards must be removed');

console.log('Unique player period UI tests passed.');
