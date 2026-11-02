'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(html, /data-tab="obsidian"[^>]*>Obsidian Farm<\/button>\s*<button class="tab-button" type="button" data-tab="stone-miner"/,
  'Stone Miner has its own navigation tab after Obsidian Farm');
assert.match(html, /<section id="tab-stone-miner" class="tab-panel" data-panel="stone-miner"[^>]*>/);
for (const id of ["stoneMinerLine", "stoneMinerLineSummary", "stoneMinerPickaxe", "stoneMinerFood", "stoneMinerCarried"]) {
  assert.ok(html.includes(`id="${id}"`), `the Generator panel shows ${id}`);
}
for (const id of ['stoneMinerTotal', 'stoneMinerState', 'stoneMinerToday', 'stoneMinerRate', 'stoneMinerPickaxeAverage', 'stoneMinerChart']) {
  assert.ok(html.includes(`id="${id}"`), `the Stone Miner tab shows ${id}`);
}
assert.match(html, /id="stoneMinerAdminCarousel" class="farm-admin-grid stone-miner-admin-grid admin-only"/, 'only admins see the miner controls');
assert.equal((html.match(/data-bot-command="stone_miner_/g) || []).length, 3, 'the controls live on the tab only');
assert.match(app, /'stone-miner': \['Stone Miner', /);
assert.match(app, /NAV_DEFAULT_ORDER = Object\.freeze\(\[[^\]]*'obsidian', 'stone-miner'/);
assert.match(app, /stoneMinerChart: 'stone-miner'/, 'the chart is drawn when its tab is open');
assert.match(app, /if \(tab === 'stone-miner'\) loadStoneMiner\(\)/);
assert.match(server, /url\.pathname === '\/api\/stone-miner' && req\.method === 'GET'/);
assert.match(server, /NAVIGATION_SECTION_ORDER = Object\.freeze\(\[[^\]]*'obsidian', 'stone-miner'/);

// Rate is the last 60 minutes from the stored hours, not a session average
const lastHourSource = server.match(/function stoneMinerLastHour[\s\S]*?\n}\n/)[0];
const toInt = value => Number.parseInt(value, 10) || 0;
const stoneMinerLastHour = new Function('toInt', `${lastHourSource}; return stoneMinerLastHour;`)(toInt);
const hourStart = Date.parse('2026-11-02T12:00:00Z');
const hourRows = [
  { bucket: new Date(hourStart - 3_600_000), blocks: '600' },
  { bucket: new Date(hourStart), blocks: '150' }
];
assert.equal(stoneMinerLastHour(hourRows, hourStart + 15 * 60_000), 600,
  'a quarter into the hour: three quarters of the previous hour plus this one');
assert.equal(stoneMinerLastHour([], hourStart), 0);
assert.match(app, /now - \(state\.stoneMinerRateShownAt \|\| 0\) >= 60_000\) \{[\s\S]{0,200}\$\('#stoneMinerRate'\)\.textContent = `\$\{formatNumber\(payload\.lastHourMined/,
  'Rate changes at most once a minute');
assert.match(html, /blocks in the last 60 minutes/);

console.log('Stone Miner UI tests passed.');
