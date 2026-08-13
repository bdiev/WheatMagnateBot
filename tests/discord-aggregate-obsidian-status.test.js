'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarizeAggregateObsidianRows } = require('../discord/aggregate-obsidian-status');

const now = Date.parse('2026-08-13T15:00:00.000Z');
const summary = summarizeAggregateObsidianRows([
  {
    session_mined: 1000,
    total_mined: 10000,
    desired_enabled: true,
    account_enabled: true,
    session_started_at: new Date(now - 3_600_000),
    is_mining: true
  },
  {
    session_mined: 1200,
    total_mined: 20000,
    desired_enabled: true,
    account_enabled: true,
    session_started_at: new Date(now - 2 * 3_600_000),
    is_mining: true
  }
], now);

assert.equal(summary.sessionMined, 2200, 'session totals are summed across bots');
assert.equal(summary.totalMined, 30000, 'all-time totals are summed across bots');
assert.equal(summary.ratePerHour, 1600, 'combined rate is the sum of each bot session rate');
assert.equal(summary.miningCount, 2);
assert.equal(summary.recoveringCount, 0);
assert.equal(summary.stoppedCount, 0);

const mixed = summarizeAggregateObsidianRows([
  { desired_enabled:true,account_enabled:true,is_mining:false },
  { desired_enabled:true,account_enabled:false,is_mining:false }
], now);
assert.equal(mixed.recoveringCount, 1, 'an enabled desired farm is recovering while disconnected');
assert.equal(mixed.stoppedCount, 1, 'a disabled account is stopped even if its farm desire was persisted');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
const statusBlock = botSource.match(/function getObsidianStatusLines\(\)[\s\S]*?async function refreshAggregateObsidianStatus/)?.[0] || '';
assert.doesNotMatch(statusBlock, /Phase:/, 'Server Status no longer presents one bot phase as a combined farm phase');
assert.match(statusBlock, /Combined average:[\s\S]*?Farms:/, 'Server Status presents aggregate rate and farm counts');
assert.match(botSource, /refreshAggregateObsidianStatus[\s\S]*?obsidian_farm_state[\s\S]*?UNION ALL[\s\S]*?obsidian_account_farm_state/,
  'Server Status loads primary and managed farm totals in one aggregate');

console.log('Discord aggregate Obsidian status tests passed.');
