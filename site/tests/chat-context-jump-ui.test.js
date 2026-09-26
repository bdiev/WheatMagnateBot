'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

const openChatContext = appSource.match(/async function openChatContext\(messageId\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(openChatContext, 'openChatContext must exist');

assert.match(openChatContext, /state\.chatInitialScrollDone = true;[\s\S]*?setActiveTab\('chat'\)/,
  'a context jump must count as the chat tab initial scroll before the tab opens, so no delayed scroll-to-bottom overrides it');
assert.match(openChatContext, /const request = \+\+state\.chatContextRequest;[\s\S]*?await fetchJson[\s\S]*?if \(request !== state\.chatContextRequest\) return;/,
  'a slower context response must not replace a newer jump');
assert.doesNotMatch(openChatContext, /target\?\.scrollIntoView\(\{ block: 'center' \}\)/,
  'the jump must not rely on a single scrollIntoView that later scroll passes can undo');
assert.match(openChatContext, /anchorChatContextTarget\(String\(messageId\), request\)/,
  'the jump must keep the target anchored while the list settles');

assert.match(appSource, /function centerChatContextTarget\(messageId\)[\s\S]*?list\.scrollTop \+= targetRect\.top - listRect\.top/,
  'the target must be centred inside the chat list scroller');
assert.match(appSource, /function anchorChatContextTarget[\s\S]*?\['wheel', 'touchstart', 'pointerdown', 'keydown'\][\s\S]*?addEventListener\('load', recenter, true\)|function anchorChatContextTarget[\s\S]*?addEventListener\('load', recenter, true\)[\s\S]*?\['wheel', 'touchstart', 'pointerdown', 'keydown'\]/,
  'anchoring must follow late image loads and stop when the user scrolls');
assert.match(appSource, /function anchorChatContextTarget[\s\S]*?setChatArchiveStatus\('This message is no longer in the chat archive\.'\)/,
  'a missing target must be reported instead of silently leaving the user elsewhere');

for (const name of ['returnToLiveChat', 'searchGameChat']) {
  assert.match(appSource, new RegExp(`async function ${name}\\([^)]*\\) \\{[\\s\\S]*?state\\.chatContextRequest \\+= 1;`),
    `${name} must cancel an in-flight context jump`);
}

console.log('Chat context jump UI tests passed.');
