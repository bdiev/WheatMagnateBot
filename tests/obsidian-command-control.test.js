'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'site', 'server.js'), 'utf8');
const startFunction = botSource.match(
  /async function startConfiguredObsidianFarm\(\) \{[\s\S]*?\n\}/
)?.[0] || '';

assert.match(
  botSource,
  /async function ensureObsidianFarmRunning[\s\S]*?await farm\.prepareStart\(createdBot\)[\s\S]*?farm\.(?:start|resume)\(createdBot/,
  'the primary runtime must complete the shared barrel preparation before starting its farm loop'
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
assert.match(
  botSource,
  /if \(type === 'obsidian_set_coordinates'\)[\s\S]*?syncManagedFarmState\(pool, command\.account_id, status\)/,
  'managed coordinates are persisted for redeploy recovery'
);
assert.match(botSource, /if \(type === 'obsidian_toggle'\)/, 'managed runtimes start and stop their own farm');
assert.match(
  botSource,
  /type === 'obsidian_toggle'[\s\S]*?typeof payload\.enabled === 'boolean'[\s\S]*?runtime\.setObsidianEnabled\(enabled\)[\s\S]*?syncManagedFarmState\(pool, command\.account_id, runtime\.obsidianFarm\.getStatus\(\)\)/,
  'managed farm controls honor the explicit Start or Stop action selected on the site'
);
assert.match(
  serverSource,
  /commandType === 'obsidian_toggle'[\s\S]*?typeof payload\.enabled !== 'boolean'[\s\S]*?delete payload\.enabled/,
  'the command API validates an explicit Obsidian farm state'
);

console.log('Obsidian command control tests passed.');
