'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');

const descriptions = [...indexSource.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)]
  .map(match => match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim())
  .filter(Boolean);

const overlongDescriptions = descriptions.filter(description => description.length > 60);
assert.deepEqual(
  overlongDescriptions,
  [],
  `visible descriptions must stay within 60 characters: ${overlongDescriptions.join(' | ')}`
);

for (const [chartId, expectedDescription, accessibleRange] of [
  ['chatHourlyChart', 'Message history.', 'hours show 7 days; days and months show full history'],
  ['killAuraKillsChart', 'Kills by hour, day, or month.', 'hours show 7 days, days show 90 days, and months show full history'],
  ['obsidianDailyChart', 'Blocks mined by hour, day, or month.', 'hours show 7 days, days show 90 days, and months aggregate those 90 days'],
  ['tpsHourlyChart', 'All recorded TPS history in one view.', 'hourly, daily, or monthly averages over full recorded history'],
  ['unwhitelistedHourlyChart', 'Full history; this hour shows players online now.', 'full history by hour, day, or month; current hour shows players online now']
]) {
  assert.ok(indexSource.includes(`<p>${expectedDescription}</p>`), `${chartId} must use concise, accurate visible copy`);
  assert.match(
    indexSource,
    new RegExp(`data-chart-controls="${chartId}"[^>]+aria-label="[^"]*${accessibleRange.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"`),
    `${chartId} must keep its exact range details available to assistive technology`
  );
}

assert.doesNotMatch(indexSource, /last 14 days/, 'Obsidian copy must not claim the old 14-day range');
assert.doesNotMatch(indexSource, /TPS over the last 24 hours/, 'TPS copy must cover every available range');

console.log('Card description UI tests passed.');
