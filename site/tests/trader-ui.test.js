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
assert.match(setup, /escapeHtml\(group\.key\)/);
assert.match(setup, /escapeHtml\(traderItemName\(group\.input1\)\)/);
assert.match(setup, /escapeHtml\(label\)/);

// Unsaved choices survive the bot's status updates, and a start waits for Save
assert.match(app, /state\.traderDraft\?\.choices\?\.\[offer\.key\]/);
assert.match(app, /toggle\.disabled = !trader\.enabled && \(!ready \|\| hasDraft \|\| !connected\)/);
assert.match(app, /commandType === 'trader_scan' \? 120_000 : undefined/, 'a scan may take longer than other commands');

// The source chests have a priority: their order, shown and changed on the tab
assert.ok(html.includes('id="traderPriorityNote"'));
assert.match(setup, /data-trader-move="\$\{escapeHtml\(key\)\}"/);
assert.match(setup, /class="trader-priority"/);
assert.match(app, /document\.addEventListener\('click', handleTraderMove\)/);
const traderSourceKeys = new Function(`${app.match(/function traderSourceKeys[\s\S]*?\r?\n}\r?\n/)[0]}; return traderSourceKeys;`)();
assert.deepEqual(traderSourceKeys({ '3,0,0': 'source', '1,0,0': 'output', '2,0,0': 'source' }), ['3,0,0', '2,0,0'], 'keeps the order, not sorted by position');
assert.match(app.match(/function traderConfigurePayload[\s\S]*?\r?\n}\r?\n/)[0], /entries\.filter\(\(\[, role\]\) => role === 'source'\)/, 'the order is what gets saved');

// A trade can have a price limit, checked on the server and saved with the setup
assert.match(setup, /data-trader-limit="\$\{escapeHtml\(group\.key\)\}"/);
assert.match(app, /priceLimits: draft\.limits/);
assert.match(app, /waiting_price: /);
assert.match(server, /settings\.priceLimits\[key\] = limit/);
assert.match(server, /limit < 1 \|\| limit > 9999/);

// The same trade at twelve villagers is one row, with its range of prices and the
// uses added up; selling for emeralds is apart from everything else
const traderTradeGroups = new Function(`${app.match(/function traderTradeGroups[\s\S]*?\r?\n}\r?\n/)[0]}; return traderTradeGroups;`)();
const offer = (key, input1, price1, output, uses, extra = {}) => ({ key, input1, price1, input2: null, price2: 0, output, outputCount: 1, uses, maxUses: 16, enabled: output === 'emerald', priceLimit: null, plain: true, ...extra });
const groups = traderTradeGroups([
  { offers: [offer('stone+>emerald', 'stone', 64, 'emerald', 14), offer('emerald+>brick', 'emerald', 1, 'brick', 0)] },
  { offers: [offer('stone+>emerald', 'stone', 19, 'emerald', 3), offer('emerald+book>enchanted_book', 'emerald', 22, 'enchanted_book', 0, { plain: false })] },
  { offers: [] }
]);
assert.equal(groups.length, 3);
const stone = groups.find(group => group.key === 'stone+>emerald');
assert.deepEqual([stone.price1, stone.uses, stone.maxUses, stone.offers.length, stone.selling], [[19, 64], 17, 32, 2, true]);
assert.equal(groups.find(group => group.key === 'emerald+>brick').selling, false);
assert.equal(groups.find(group => group.input2 === null && group.plain === false).plain, false);
assert.match(setup, /id="traderOtherTrades"/);
assert.match(app, /state\.traderOtherTradesOpen = event\.target\.open/);

// A limit is chosen from the prices the bot has seen, not typed in
assert.match(setup, /<select data-trader-limit="/);
assert.doesNotMatch(setup, /type="number"/);
const traderLimitOptions = new Function('formatNumber', `${app.match(/function traderLimitOptions[\s\S]*?\r?\n}\r?\n/)[0]}; return traderLimitOptions;`)(String);
const limitGroup = { key: 'stone+>emerald', offers: [{ price1: 64 }, { price1: 19 }] };
const optionValues = html => [...html.matchAll(/<option value="(\d*)"/g)].map(match => match[1]);
assert.deepEqual(optionValues(traderLimitOptions({ priceHistory: { 'stone+>emerald': [20, 30, 64] } }, limitGroup, null)), ['', '19', '20', '30', '64'], 'seen and current prices, lowest first');
assert.deepEqual(optionValues(traderLimitOptions({}, limitGroup, 25)), ['', '19', '25', '64'], 'a limit set earlier stays selectable');
assert.match(traderLimitOptions({}, limitGroup, 25), /<option value="25" selected>/);
assert.match(traderLimitOptions({}, limitGroup, null), /<option value="" selected>Any/);
assert.match(app, /document\.activeElement\?\.matches\?\.\('#tab-trader select'\)/, 'status updates do not close an open dropdown');

// The current prices are on the row, and choosing from a dropdown lets updates through
assert.match(setup, /now \$\{currentPrices\.map\(formatNumber\)\.join\(', '\)\}/);
assert.match(app, /document\.activeElement\?\.matches\?\.\('#tab-trader select'\)\) document\.activeElement\.blur\(\)/);

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
