'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(siteDirectory, 'public', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(siteDirectory, 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(siteDirectory, 'public', 'styles.css'), 'utf8');

for (const id of ['playerMilestones', 'playtimeLeaderboard', 'newPlayersList', 'nearbyList']) {
  assert.match(
    indexSource,
    new RegExp(`id="${id}"[^>]*player-list-loading[^>]*aria-busy="true"`),
    `${id} must expose its structural loading state immediately`
  );
}

assert.match(indexSource, /id="averageOnlineChartShell"[^>]*player-chart-loading[^>]*aria-busy="true"[\s\S]*player-chart-skeleton/,
  'the average-online chart must have a structural skeleton');
assert.match(appSource, /chartShell\?\.classList\.remove\('player-chart-loading'\)[\s\S]*requestAnimationFrame\(redrawCharts\)/,
  'the chart skeleton must be removed and the newly available series redrawn');
assert.match(appSource, /for \(const selector of \['#playerMilestones', '#playtimeLeaderboard', '#newPlayersList'\]\)[\s\S]*remove\('player-list-loading'\)/,
  'Player Stats lists must leave their loading states after rendering');
assert.match(appSource, /function renderNearbySightings[\s\S]*remove\('player-list-loading'\)/,
  'Nearby Sightings must leave its independent loading state after rendering');
assert.match(stylesSource, /\.player-chart-skeleton[\s\S]*\.player-row-skeleton[\s\S]*skeleton-value-shimmer/,
  'chart and list skeletons must share a visible shimmer treatment');

for (const chartId of ['chatHourlyChart', 'killAuraKillsChart', 'obsidianDailyChart', 'tpsHourlyChart']) {
  assert.match(
    indexSource,
    new RegExp(`class="chart-scroll player-chart-loading" aria-busy="true"><div class="player-chart-skeleton"[^>]*>(?:<span></span>){8}</div><canvas id="${chartId}"`),
    `${chartId} must render a structural skeleton until its data arrives`
  );
  assert.match(appSource, new RegExp(`setChartLoading\\('${chartId}', false\\);[\\s\\S]*?redrawCharts\\(\\)`),
    `${chartId} must leave its loading state before redrawing with real data`);
}
assert.match(appSource, /function setChartLoading\(chartId, loading\)[\s\S]*?closest\('\.chart-scroll'\)[\s\S]*?toggle\('player-chart-loading', loading\)/,
  'chart loading states must toggle the shared skeleton class on the chart container');
assert.match(appSource, /async function selectAccount[\s\S]*?\['killAuraKillsChart', 'obsidianDailyChart', 'tpsHourlyChart'\]\.forEach\(chartId => setChartLoading\(chartId, true\)\)/,
  'switching accounts must show chart skeletons until the new account data arrives');
assert.match(stylesSource, /\.player-chart-loading \.chart,\s*\.player-chart-loading \.chart-y-axis\s*\{[^}]*opacity:\s*0;/,
  'the sticky chart axis must stay hidden behind the skeleton');
assert.match(stylesSource, /\.chart-scroll:not\(\.player-chart-loading\) > \.player-chart-skeleton\s*\{[^}]*display:\s*none;/,
  'loaded charts that fit their width (TPS) must not stay covered by the skeleton');

console.log('Player Stats loading UI tests passed.');
