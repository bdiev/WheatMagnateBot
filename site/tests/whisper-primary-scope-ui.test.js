'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
const { assertModuleAvailable } = require('../accounts/module-policy');

// Every bot has its own private messages; only the Pearl Loader has none
assert.match(source, /function activeAccountHasWhispers\(\) \{[\s\S]*?account\.role !== 'pearl_loader';/,
  'every account except the Pearl Loader has private messages');
assert.match(source, /async function loadWhisperOnlinePlayers[\s\S]*?if \(!activeAccountHasWhispers\(\)\) \{[\s\S]*?return false;[\s\S]*?fetchJson\('\/api\/whisper\/online'\)/,
  'the Pearl Loader account returns before requesting the whisper list');
assert.match(source, /async function loadWhisperDialog\(\) \{[\s\S]*?if \(!activeAccountHasWhispers\(\)\) return false;/,
  'the Pearl Loader account does not request whisper dialogs');
assert.match(source, /if \(state\.realtimeRefreshTimers\.whisper\) clearTimeout[\s\S]*?delete state\.realtimeRefreshTimers\.whisper/,
  'switching accounts must cancel a queued whisper refresh');
assert.match(source, /async function refreshWhispersFromEvent\(\) \{[\s\S]*?if \(!activeAccountHasWhispers\(\)\) return;/,
  'whisper SSE refreshes are ignored for the Pearl Loader account');
assert.doesNotMatch(serverSource, /url\.pathname === '\/api\/whisper\/online'[\s\S]{0,120}scopedAccountRuntime/,
  'a secondary account gets its own whisper list');
assert.match(serverSource, /async function whisperAccountId[\s\S]*?role === 'pearl_loader'[\s\S]*?statusCode:403/,
  'the Pearl Loader account is refused private messages on the server');
assert.equal(assertModuleAvailable({ id:'secondary', isDefault:false }, 'whisper'), true,
  'private messages are a per-bot module');

console.log('Whisper account scope UI tests passed.');
