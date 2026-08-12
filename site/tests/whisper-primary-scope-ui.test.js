'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(source, /async function loadWhisperOnlinePlayers[\s\S]*?if \(!activeAccountIsPrimary\(\)\) \{[\s\S]*?return false;[\s\S]*?fetchJson\('\/api\/whisper\/online'\)/,
  'secondary accounts must return before requesting the primary-only whisper list');
assert.match(source, /async function loadWhisperDialog\(\) \{[\s\S]*?if \(!activeAccountIsPrimary\(\)\) return false;/,
  'secondary accounts must not request whisper dialogs');
assert.match(source, /if \(state\.realtimeRefreshTimers\.whisper\) clearTimeout[\s\S]*?delete state\.realtimeRefreshTimers\.whisper/,
  'switching accounts must cancel a queued whisper refresh');
assert.match(source, /async function refreshWhispersFromEvent\(\) \{[\s\S]*?if \(!activeAccountIsPrimary\(\)\) return;/,
  'whisper SSE refreshes must be ignored for secondary accounts');
assert.match(serverSource, /url\.pathname === '\/api\/whisper\/online'[\s\S]*?scopedAccountRuntime\(url, currentUser\)[\s\S]*?players:\[\], available:false/,
  'old dashboard clients receive an empty compatible response instead of logging a secondary-account 403');

console.log('Whisper primary scope UI tests passed.');
