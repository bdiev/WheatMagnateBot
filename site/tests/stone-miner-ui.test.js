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
assert.match(html, /<section id="tab-stone-miner" class="tab-panel" data-panel="stone-miner">/);
for (const id of ['stoneMinerTotal', 'stoneMinerState', 'stoneMinerToday', 'stoneMinerRate', 'stoneMinerPickaxeAverage', 'stoneMinerChart']) {
  assert.ok(html.includes(`id="${id}"`), `the Stone Miner tab shows ${id}`);
}
assert.match(html, /id="stoneMinerAdminCarousel" class="farm-admin-grid admin-only"/, 'only admins see the miner controls');
assert.equal((html.match(/data-bot-command="stone_miner_/g) || []).length, 3, 'the controls live on the tab only');
assert.match(app, /'stone-miner': \['Stone Miner', /);
assert.match(app, /NAV_DEFAULT_ORDER = Object\.freeze\(\[[^\]]*'obsidian', 'stone-miner'/);
assert.match(app, /stoneMinerChart: 'stone-miner'/, 'the chart is drawn when its tab is open');
assert.match(app, /if \(tab === 'stone-miner'\) loadStoneMiner\(\)/);
assert.match(server, /url\.pathname === '\/api\/stone-miner' && req\.method === 'GET'/);
assert.match(server, /NAVIGATION_SECTION_ORDER = Object\.freeze\(\[[^\]]*'obsidian', 'stone-miner'/);

console.log('Stone Miner UI tests passed.');
