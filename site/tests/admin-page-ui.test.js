'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');

assert.match(indexSource, /class="admin-hero"[\s\S]*Admin workspace[\s\S]*Control center[\s\S]*class="admin-hero-stats"/,
  'Admin must open with a structured workspace overview');
assert.match(indexSource, /id="adminUsersTotal"[\s\S]*id="adminUsersOnline"[\s\S]*id="adminUsersAdmins"[\s\S]*id="adminUsersPending"/,
  'Admin overview must expose user access summary metrics');
assert.ok(indexSource.indexOf('class="panel admin-access-panel"') < indexSource.indexOf('class="panel admin-players-panel"'),
  'User Access must appear before the long Minecraft player directory');
assert.ok(indexSource.indexOf('class="panel admin-players-panel"') < indexSource.indexOf('class="panel admin-log-panel"'),
  'System Log must follow Minecraft data in the page hierarchy');

assert.match(appSource, /const onlineCount = users\.filter[\s\S]*const pendingCount = users\.filter[\s\S]*const adminCount = users\.filter/,
  'User Access must calculate its live overview counts from the rendered payload');
assert.match(appSource, /class="admin-user" data-status="\$\{status\}" data-role="\$\{role\}"[\s\S]*admin-user-avatar[\s\S]*admin-user-badges[\s\S]*admin-user-actions/,
  'User cards must expose identity, role, status and action regions');

assert.match(stylesSource, /\.admin-hero\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1[\s\S]*radial-gradient/,
  'Admin hero must span the workspace and use the dashboard visual language');
assert.match(stylesSource, /\.admin-users-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*\.admin-user\s*\{[\s\S]*grid-template-columns:/,
  'User Access must use responsive cards rather than the previous table-like rows');
assert.match(stylesSource, /@media \(max-width:\s*760px\)[\s\S]*\.admin-hero-stats[\s\S]*repeat\(2,[\s\S]*\.admin-user-state[\s\S]*justify-items:\s*start/,
  'Admin workspace must adapt its overview and user cards for phones');

console.log('Admin page UI tests passed.');
