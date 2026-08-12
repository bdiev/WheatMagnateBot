'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'site', 'server.js'), 'utf8');
const startFunction = botSource.match(
  /async function startConfiguredObsidianFarm\(\) \{[\s\S]*?\n\}/
)?.[0] || '';

assert.doesNotMatch(
  startFunction,
  /await farm\.prepareStart\(bot\)/,
  'the command handler must not wait indefinitely for a barrel window'
);
assert.ok(
  startFunction.indexOf('await beginObsidianFarmSession()') <
    startFunction.indexOf('ensureObsidianFarmRunning(startingBot'),
  'desired farm state must be persisted before background preparation begins'
);
assert.doesNotMatch(
  botSource,
  /async function ensureObsidianFarmRunning[\s\S]*?farm\.inspectSupplies\(createdBot\)/,
  'background startup must not poison the farm interaction queue with a barrel wait'
);
assert.match(
  botSource,
  /if \(botCommandWorkerRunning\) return;[\s\S]*?await processBotCommandsOnce\(\)/,
  'the command worker must not overlap itself'
);
assert.doesNotMatch(
  serverSource,
  /commandType\.startsWith\('obsidian_'\)[\s\S]*?DEFAULT_MINECRAFT_ACCOUNT_ID/,
  'Obsidian controls must retain the explicitly selected account ID'
);
assert.doesNotMatch(
  botSource,
  /type\.startsWith\('obsidian_'\)[\s\S]*?executeBotCommand\(\{ \.\.\.command, account_id: DEFAULT_ACCOUNT_ID \}\)/,
  'managed-account Obsidian commands must never be forwarded to the primary farm'
);
assert.match(botSource, /if \(type === 'obsidian_set_coordinates'\)/, 'managed runtimes configure their own farm');
assert.match(botSource, /if \(type === 'obsidian_toggle'\)/, 'managed runtimes start and stop their own farm');

console.log('Obsidian command control tests passed.');
