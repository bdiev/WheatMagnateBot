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
assert.match(
  serverSource,
  /const accountId = commandType\.startsWith\('obsidian_'\)[\s\S]*?DEFAULT_MINECRAFT_ACCOUNT_ID/,
  'global obsidian controls must be routed to the runtime that owns the farm'
);
assert.match(
  botSource,
  /if \(type\.startsWith\('obsidian_'\)\) \{[\s\S]*?executeBotCommand\(\{ \.\.\.command, account_id: DEFAULT_ACCOUNT_ID \}\)/,
  'previously queued managed-account obsidian commands must be forwarded to the real farm runtime'
);

console.log('Obsidian command control tests passed.');
