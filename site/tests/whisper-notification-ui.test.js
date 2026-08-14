'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');

assert.match(htmlSource, /id="whisperToast"[^>]*role="status"[\s\S]*?id="whisperToastOpen"[\s\S]*?id="whisperToastPlayer"[\s\S]*?id="whisperToastClose"/,
  'the dashboard must expose a clickable, dismissible private-message toast');
assert.match(stylesSource, /\.whisper-toast\s*\{[\s\S]*?bottom:[\s\S]*?\.whisper-toast-open/,
  'the private-message toast must have a visible non-blocking layout');
assert.match(appSource, /function showWhisperToast\(payload = \{\}\)[\s\S]*?payload\.direction !== 'incoming'[\s\S]*?whisperToastPlayer[\s\S]*?classList\.add\('visible'\)/,
  'only incoming whisper SSE events should display the toast');
assert.match(appSource, /async function openWhisperToast\(\)[\s\S]*?openPushDestination\('whispers', payload\.player, payload\.accountId\)/,
  'clicking the toast must reuse the account-aware private-dialog deep link');
assert.match(appSource, /type === 'whisper_message'[\s\S]*?showWhisperToast\(eventPayload\)[\s\S]*?queueRealtimeRefresh\('whisper'/,
  'whisper SSE handling must notify immediately and still refresh conversation state');

assert.match(appSource, /function pushSubscriptionUsesServerKey[\s\S]*?applicationServerKey\(publicKey\)[\s\S]*?actualKey\.every/,
  'the browser must compare its subscription key with the current VAPID public key');
assert.match(appSource, /subscription && !pushSubscriptionUsesServerKey[\s\S]*?subscription\.unsubscribe\(\)[\s\S]*?pushManager\.subscribe/,
  'a stale VAPID subscription must be replaced before registering the device');

console.log('Whisper notification UI tests passed.');
