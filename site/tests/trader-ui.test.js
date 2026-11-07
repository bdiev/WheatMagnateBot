'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('site/public/index.html');
const app = read('site/public/app.js');
const server = read('site/server.js');
const botSource = read('bot.js');
const runtime = read('site/accounts/minecraft-bot-runtime.js');
const registry = read('site/accounts/module-registry.js');

// The tab sits after Stone Miner and only administrators get it
assert.match(html, /data-tab="stone-miner"[^>]*>Stone Miner<\/button>\s*<button class="tab-button admin-only" type="button" data-tab="trader"/);
assert.match(html, /<section id="tab-trader" class="tab-panel" data-panel="trader"/);
for (const id of ['traderToggleButton', 'traderScanButton', 'traderSaveButton', 'traderContainers', 'traderVillagers', 'traderTotalBlocks', 'traderState']) {
  assert.ok(html.includes(`id="${id}"`), `the Trader tab shows ${id}`);
}
for (const command of ['trader_toggle', 'trader_scan', 'trader_configure']) {
  assert.ok(html.includes(`data-bot-command="${command}"`), `${command} has a button`);
  assert.ok(server.includes(`'${command}',`) || server.includes(`'${command}'\n`) || server.includes(`'${command}'\r\n`), `the server accepts ${command}`);
  assert.ok(botSource.includes(`'${command}'`), `the bot handles ${command}`);
}
assert.match(app, /if \(tab === 'trader'\) loadTrader\(\)/);
assert.match(app, /NAV_DEFAULT_ORDER = Object\.freeze\(\[[^\]]*'stone-miner', 'trader'/);
assert.match(server, /NAVIGATION_SECTION_ORDER = Object\.freeze\(\[[^\]]*'stone-miner', 'trader'/);

// Its state holds coordinates: administrators only, and the settings are checked
assert.match(server, /url\.pathname === '\/api\/trader' && req\.method === 'GET'/);
assert.match(server, /async function getTraderState\(currentUser, url\) \{\s*assertDatabase\(\);\s*assertAdminUser\(currentUser\);/);
assert.match(server, /commandType === 'trader_configure' \? normalizeTraderSettings\(payload\) : payload/);

// Whatever a site user or a chest holds is only ever put on the page escaped
const setup = app.match(/function renderTraderSetup[\s\S]*?\nfunction renderTraderControl/)[0];
assert.match(setup, /escapeHtml\(offer\.key\)/);
assert.match(setup, /escapeHtml\(traderItemName\(offer\.input1\)\)/);
assert.match(setup, /escapeHtml\(label\)/);

// Unsaved choices survive the bot's status updates, and a start waits for Save
assert.match(app, /state\.traderDraft\?\.choices\?\.\[offer\.key\]/);
assert.match(app, /toggle\.disabled = !trader\.enabled && \(!ready \|\| hasDraft \|\| !connected\)/);
assert.match(app, /commandType === 'trader_scan' \? 120_000 : undefined/, 'a scan may take longer than other commands');

// The bot stays out of the game chat: the Trader speaks through the system log only
for (const [name, source] of [['features/trader/index.js', read('features/trader/index.js')], ['minecraft/container-interaction.js', read('minecraft/container-interaction.js')]]) {
  assert.doesNotMatch(source, /\.chat\(|\.whisper\(|sendMinecraftChat|'chat_message'|'chat_command'|'chat_message'/, `${name} never writes to the chat`);
}
const handlers = [...botSource.matchAll(/if \(type === 'trader_scan' \|\| type === 'trader_toggle'\) \{[\s\S]*?if \(type === 'stone_miner_clear'\)/g)];
assert.equal(handlers.length, 2, 'the main bot and the other accounts both handle the Trader');
for (const [handler] of handlers) {
  assert.doesNotMatch(handler, /\.chat\(|sendMinecraftChat/, 'the Trader commands never write to the chat');
}
const traderSetup = botSource.match(/const trader = createTrader\(\{[\s\S]*?\n\}\);/)[0];
assert.match(traderSetup, /recordSystemLog\(\{ level, category: 'trader', message/, 'the main bot logs the Trader to the system log');
assert.doesNotMatch(traderSetup, /\.chat\(|sendMinecraftChat/);
assert.match(registry, /systemLogger\(\{ level, category: 'trader', message:/, 'the other accounts log the Trader to the system log too');

// The modules take turns: starting another one stops the Trader without touching its window
assert.match(runtime, /this\.trader\?\.stop\?\.\(\{ flush:false \}\);\s*const status = this\.stoneMiner\.start\(\);/);
assert.match(runtime, /Stop the Obsidian Farm before using the Trader/);

console.log('Trader UI tests passed.');
