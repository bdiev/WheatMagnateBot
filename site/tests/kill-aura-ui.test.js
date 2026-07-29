'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(
  indexSource,
  /<details class="panel kill-aura-control-panel admin-only"[^>]*>[\s\S]*?<summary class="panel-head kill-aura-control-summary">/,
  'Kill Aura Control must be a collapsible dropdown'
);
assert.match(
  indexSource,
  /id="killAuraMobDropdownToggle"[\s\S]*?aria-controls="killAuraMobDropdown"/,
  'the mob multiselect must expose an accessible dropdown trigger'
);
assert.match(
  indexSource,
  /id="killAuraMobDropdown" class="kill-aura-select-menu" hidden/,
  'the mob options must start collapsed'
);
assert.match(appSource, /function setKillAuraMobDropdownOpen\(open\)/);
assert.match(appSource, /event\.key === 'Escape'/, 'the dropdown must support keyboard dismissal');
assert.match(stylesSource, /\.kill-aura-select-menu\s*\{[^}]*position:\s*absolute;/s);
assert.doesNotMatch(
  indexSource,
  /kill-aura-hero|kill-aura-stat-mark/,
  'Kill Aura must use the standard dashboard cards without a separate visual theme'
);

console.log('Kill Aura UI tests passed.');
