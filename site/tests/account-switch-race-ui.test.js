'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(source, /const switchGeneration = \+\+state\.accountSwitchGeneration;[\s\S]*?loadAll\(\{ force:true, switchGeneration \}\)/,
  'every account selection must force a new full synchronization');
assert.match(source, /const syncToken = Symbol\('dashboard-sync'\)[\s\S]*?state\.fullSyncToken === syncToken[\s\S]*?state\.activeAccountId === accountId/,
  'dashboard responses must be guarded by synchronization token and account ID');
assert.match(source, /accountIdAtStart !== state\.activeAccountId[\s\S]*?staleError\.name = 'AbortError'/,
  'account-scoped GET responses must be rejected after the account changes');
assert.match(source, /if \(error\?\.name === 'AbortError'\) throw error;/,
  'aborted account requests must never be retried against the next account');
assert.match(source, /state\.adminControlToken = null;[\s\S]*?state\.adminControlLoading = false;/,
  'switching accounts must release the previous admin-control request lock');
assert.match(source, /const token = Symbol\('admin-control'\)[\s\S]*?state\.adminControlToken !== token \|\| state\.activeAccountId !== accountId/,
  'stale admin controls must not render for the newly selected account');

console.log('Account switching race UI tests passed.');
