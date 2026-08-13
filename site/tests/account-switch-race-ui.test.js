'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');

assert.doesNotMatch(source, /dataset\.accountLabel/, 'the header does not render a redundant selected-account label');
assert.doesNotMatch(styles, /data-account-label/, 'the selected-account header badge styling is removed');
assert.match(source, /const accountId=avatar\.dataset\.accountId;[\s\S]*?selectAccount\(accountId\);[\s\S]*?setMobileAccountSwitcherOpen\(false\);/,
  'mobile profile taps capture and select the account before collapsing the switcher');
assert.match(styles, /grid-template-columns:\s*var\(--button-height\) var\(--button-height\) var\(--button-height\) minmax\(0, 1fr\) 74px;[\s\S]*?#themeToggle\s*\{[\s\S]*?grid-column:\s*5;[\s\S]*?#logoutButton\s*\{[\s\S]*?grid-column:\s*4;/,
  'the phone header gives Log out the wide slot before the theme toggle');
assert.match(styles, /body\.account-switcher-open \.topbar\s*\{\s*z-index:\s*180;\s*\}[\s\S]*?\.account-switcher-backdrop\s*\{[^}]*z-index:\s*150;/,
  'the expanded phone account menu stays above its blurred backdrop');

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
