'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(htmlSource, /id="obsidianStatsScope"[\s\S]*?data-obsidian-scope="personal"[\s\S]*?data-obsidian-scope="all"/,
  'the primary Obsidian page exposes Personal and All Bots choices');
assert.match(appSource, /function obsidianStatsPath\(\)[\s\S]*?scope=/,
  'every Obsidian statistics refresh uses the selected scope');
assert.match(appSource, /state\.charts\.obsidianHourly = payload\.hourly[\s\S]*?state\.charts\.obsidianDaily = payload\.daily/,
  'scope payloads replace both Obsidian chart series');
assert.match(serverSource, /requestedScope === 'all'[\s\S]*?assertAdminUser\(currentUser\)/,
  'all-bot statistics require administrator access');
assert.match(serverSource, /obsidian_account_farm_daily[\s\S]*?SUM\(mined\)/,
  'the API aggregates account-scoped farm buckets on the server');
assert.doesNotMatch(serverSource, /totalMined:localFarm\.cyclesCompleted/,
  'secondary accounts no longer expose session-only placeholder totals');

console.log('Obsidian statistics scope UI tests passed.');
