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
assert.match(styles, /\.topbar-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?\.topbar-actions #themeToggle\s*\{[\s\S]*?flex:\s*0 0 74px;[\s\S]*?\.topbar-actions #logoutButton\s*\{[\s\S]*?flex:\s*1 1 0;/,
  'the phone header lets Log out grow before the fixed-width theme toggle');
assert.match(source, /whisperPanel\.classList\.toggle\('account-scope-hidden', restricted\)/,
  'secondary accounts must collapse the primary-only dialogs control');
assert.match(styles, /\.whisper-panel\.account-scope-hidden\s*\{[\s\S]*?flex-basis:\s*0;[\s\S]*?margin-right:\s*-10px;[\s\S]*?opacity:\s*0;/,
  'the dialogs slot must animate closed without leaving the flex gap behind');
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
assert.match(source, /const connected = account\.status === 'connected' && account\.statusPayload\?\.connected === true;/,
  'an account status dot must require a confirmed live runtime payload');

console.log('Account switching race UI tests passed.');
