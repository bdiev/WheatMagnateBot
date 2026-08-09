'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(
  stylesSource,
  /\.whisper-messages\s*\{[^}]*align-content:\s*start;/s,
  'long private dialogs must start inside the reachable scroll area'
);
assert.match(
  stylesSource,
  /\.whisper-messages\s*>\s*:first-child\s*\{[^}]*margin-top:\s*auto;/s,
  'short private dialogs must remain visually aligned to the bottom'
);
assert.doesNotMatch(
  stylesSource,
  /\.whisper-messages\s*\{[^}]*align-content:\s*end;/s,
  'end grid alignment makes overflowing message history unreachable'
);
assert.match(
  appSource,
  /const shouldScrollToBottom = targetChanged \|\| !list\.childElementCount \|\| distanceFromBottom <= 48;/,
  'dialog refreshes should follow new messages only while the reader is near the bottom'
);
assert.match(
  appSource,
  /if \(shouldScrollToBottom\)[\s\S]*?list\.scrollTop = list\.scrollHeight;[\s\S]*?else \{[\s\S]*?list\.scrollTop = previousScrollTop;/,
  'dialog refreshes must preserve the reader position while viewing older messages'
);

console.log('Whisper scroll tests passed.');
