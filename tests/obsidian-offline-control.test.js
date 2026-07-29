'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
const startFunction = botSource.match(
  /async function startConfiguredObsidianFarm\(\) \{[\s\S]*?\n\}/
)?.[0] || '';

assert.match(
  startFunction,
  /if \(!bot\?\.entity\) \{[\s\S]*?await beginObsidianFarmSession\(\);[\s\S]*?queued: true/,
  'an offline farm start must persist the desired state for the next spawn'
);
assert.ok(
  startFunction.indexOf('if (!bot?.entity)') < startFunction.indexOf('await farm.prepareStart(bot)'),
  'the offline queue path must run before Mineflayer-only preparation'
);
assert.match(
  botSource,
  /if \(obsidianStats\.desiredEnabled\) \{[\s\S]*?ensureObsidianFarmRunning\(createdBot\)/,
  'the spawn handler must resume a farm queued while offline'
);

console.log('Obsidian offline control tests passed.');
