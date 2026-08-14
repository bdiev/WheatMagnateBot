'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
const farmSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'features', 'obsidianFarm', 'index.js'), 'utf8');
const botSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'bot.js'), 'utf8');

assert.match(htmlSource, /id="farmLaunchToast"[^>]*role="alert"[\s\S]*?id="farmLaunchToastBot"[\s\S]*?id="farmLaunchToastReason"/,
  'the dashboard exposes an assertive farm launch failure notification with bot and reason fields');
assert.match(stylesSource, /\.farm-launch-toast\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:[\s\S]*?left:\s*50%;[\s\S]*?\.farm-launch-toast\.visible/,
  'the farm launch notification is a centered animated toast');
assert.match(appSource, /function syncFarmLaunchFailureToast[\s\S]*?lastErrorMessage[\s\S]*?reportFarmLaunchFailure\(reason, bot\)/,
  'runtime farm launch errors are converted into one deduplicated toast');
assert.match(appSource, /commandType === 'obsidian_toggle' && body\.payload\?\.enabled === true[\s\S]*?reportFarmLaunchFailure\(err\.message/,
  'an explicitly failed Start Farm command shows its error immediately');
assert.match(farmSource, /async function prepareStart[\s\S]*?farm\.lastErrorMessage = error\?\.message/,
  'preflight failures remain available in the farm runtime status');
assert.match(botSource, /obsidian:\s*\{[\s\S]*?desiredEnabled:[\s\S]*?lastErrorMessage:\s*farm\.getStatus\(\)\.lastErrorMessage/,
  'the primary bot snapshot sends the farm launch failure reason to the dashboard');

console.log('Farm launch toast UI tests passed.');
