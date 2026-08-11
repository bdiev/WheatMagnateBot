'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');

assert.match(serverSource, /'inventory_move'/, 'the admin command API must allow inventory moves');
assert.match(botSource, /if \(type === 'inventory_move'\)[\s\S]*?moveInventorySlot\(bot, payload\)/,
  'the default Minecraft runtime must execute inventory moves');
assert.match(botSource, /executeManagedAccountCommand[\s\S]*?if \(type === 'inventory_move'\)[\s\S]*?moveInventorySlot\(runtime\.bot, payload\)/,
  'the selected managed account must execute its own inventory moves');
assert.match(appSource, /draggable="true" data-inventory-slot=/,
  'live bot inventory items must expose native drag data');
assert.match(appSource, /handleBotInventoryDragStart[\s\S]*handleBotInventoryDrop/,
  'the inventory UI must support drag and drop');
assert.match(appSource, /handleBotInventoryKeydown/,
  'the inventory UI must retain a keyboard and tap alternative');
assert.match(appSource, /commandType: 'inventory_move'[\s\S]*expectedSource:[\s\S]*expectedTarget/,
  'inventory commands must include optimistic concurrency checks');
assert.match(appSource, /command\.status === 'completed' \|\| command\.status === 'done'/,
  'the UI must recognize completed database commands');
assert.match(stylesSource, /\.inventory-slot\.inventory-selected/,
  'the selected source slot must have visible feedback');
assert.match(stylesSource, /\.inventory-slot\.inventory-drag-over/,
  'the current drop target must have visible feedback');
assert.match(indexSource, /id="botInventoryHint"/,
  'the inventory panel must expose move progress and errors');

console.log('Inventory drag UI tests passed.');
