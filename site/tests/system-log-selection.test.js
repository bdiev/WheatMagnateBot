'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(
  appSource,
  /function hasActiveTextSelectionWithin\(container\)[\s\S]*container\.contains\(node\)/,
  'the UI must detect selections specifically inside a live-rendered container'
);
assert.match(
  appSource,
  /details\?\.debugLogId[\s\S]*Debug Log ID:[\s\S]*admin-log-record-id[^\n]*ID \$\{escapeHtml\(logId\)\}/,
  'system logs must visibly expose both their site record ID and exact Obsidian debug-log ID'
);
assert.match(
  appSource,
  /async function loadAdminSystemLogs\(\)[\s\S]*hasActiveTextSelectionWithin\(list\)[\s\S]*admin-log-selection[\s\S]*await fetchJson[\s\S]*hasActiveTextSelectionWithin\(list\)/,
  'system logs must defer replacement both before and after their asynchronous fetch while text is selected'
);
assert.match(
  appSource,
  /function renderAdminSystemLogs\(logs = \[\]\)[\s\S]*#adminSystemLogs'\] === renderSignature[\s\S]*#adminSystemLogs'\] = renderSignature/,
  'unchanged system logs must not replace their DOM'
);

console.log('System log selection tests passed.');
