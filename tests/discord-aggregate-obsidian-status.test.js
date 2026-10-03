'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarizeAggregateObsidianRows, getTpsIndicator } = require('../discord/aggregate-obsidian-status');

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

const withArchived = summarizeAggregateObsidianRows([
  { session_mined:500,total_mined:5000,account_archived:true,desired_enabled:true,account_enabled:false,is_mining:false },
  { session_mined:100,total_mined:1000,account_archived:false,desired_enabled:true,account_enabled:true,session_started_at:new Date(now - 3_600_000),is_mining:true }
], now);
assert.equal(withArchived.totalMined, 6000, 'archived bot totals remain in the aggregate Discord status');
assert.equal(withArchived.sessionMined, 600, 'archived session production remains historical statistics');
assert.equal(withArchived.accountCount, 1, 'archived bots are not counted as live farms');
assert.equal(withArchived.miningCount, 1);
assert.equal(withArchived.stoppedCount, 0, 'an archived bot is not shown as a stopped live farm');

const detailed = summarizeAggregateObsidianRows([
  { username:'WheatMagnate',session_mined:9000,total_mined:9000,desired_enabled:true,account_enabled:true,
    session_started_at:new Date(now - 3 * 3_600_000),is_mining:true,recent_mined:4500,recent_window_ms:90 * 60_000 },
  { username:'Alt1',display_name:'Alt One',session_mined:600,total_mined:600,desired_enabled:true,account_enabled:true,
    session_started_at:new Date(now - 30 * 60_000),is_mining:true,recent_mined:5000,recent_window_ms:90 * 60_000 },
  { username:'Alt2',desired_enabled:true,account_enabled:true,is_mining:false,runtime_status:'connecting',runtime_last_error:'Timed out' },
  { username:'Alt3',desired_enabled:true,account_enabled:false,is_mining:false },
  { username:'Alt4',desired_enabled:false,account_enabled:true,is_mining:false }
], now);
assert.deepEqual(detailed.farms.map(farm => [farm.name, farm.state]), [
  ['WheatMagnate', 'mining'], ['Alt One', 'mining'], ['Alt2', 'recovering'], ['Alt3', 'stopped'], ['Alt4', 'stopped']
], 'farms are listed by name with their live state');
assert.equal(detailed.farms[0].ratePerHour, 3000, 'a long session uses the recent hourly window');
assert.equal(detailed.farms[1].ratePerHour, 1200, 'a session younger than the window ignores blocks mined before the restart');
assert.equal(detailed.recentRatePerHour, 4200, 'the current combined rate sums per-farm recent rates');
assert.equal(detailed.sessionStartedAt, now - 3 * 3_600_000, 'the session span starts at the oldest live session');
assert.equal(detailed.farms[2].reason, 'Timed out', 'a recovering farm shows its last runtime error');
assert.equal(detailed.farms[3].reason, 'account disabled');
assert.equal(detailed.farms[4].reason, 'farm turned off');

assert.equal(getTpsIndicator(19.9), '🟢');
assert.equal(getTpsIndicator(15.4), '🟡');
assert.equal(getTpsIndicator(8), '🔴');
assert.equal(getTpsIndicator(null), '', 'no indicator while TPS is still calculating');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
const statusBlock = botSource.match(/function getObsidianStatusLines\(\)[\s\S]*?async function refreshAggregateObsidianStatus/)?.[0] || '';
assert.doesNotMatch(statusBlock, /Phase:/, 'Server Status no longer presents one bot phase as a combined farm phase');
assert.match(statusBlock, /Rate:[\s\S]*?\/h\*\* avg[\s\S]*?\/30d[\s\S]*?Farms:/, 'Server Status presents aggregate rate and farm counts');
assert.match(statusBlock, /Recovering:[\s\S]*?Stopped:/, 'Server Status names recovering and stopped farms');
assert.match(botSource, /refreshAggregateObsidianStatus[\s\S]*?obsidian_farm_state[\s\S]*?UNION ALL[\s\S]*?obsidian_account_farm_state/,
  'Server Status loads primary and managed farm totals in one aggregate');
assert.match(botSource, /account\.deleted_at IS NOT NULL[\s\S]*?WHERE account\.is_default=FALSE(?! AND account\.deleted_at IS NULL)/,
  'Server Status retains archived bot production while marking it as non-live');

console.log('Discord aggregate Obsidian status tests passed.');
