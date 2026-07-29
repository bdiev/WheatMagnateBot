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
  /<details class="panel admin-command-panel kill-aura-control-panel"[^>]*>[\s\S]*?<summary class="kill-aura-control-summary">/,
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
  /kill-aura-hero|kill-aura-page-intro|kill-aura-stat-mark/,
  'Kill Aura must not use a separate visual theme'
);
assert.match(
  indexSource,
  /class="stats-grid five kill-aura-stats-grid"/,
  'Kill Aura must use the same five-card metric layout as Obsidian Farm'
);
assert.match(
  indexSource,
  /class="farm-admin-grid kill-aura-admin-grid admin-only"/,
  'Kill Aura controls must reuse the Obsidian Farm control-card grid'
);
assert.match(
  indexSource,
  /class="split-grid kill-aura-data-grid"[\s\S]*?<h2>Kill Statistics<\/h2>[\s\S]*?<h2>Combat Details<\/h2>/,
  'Kill Aura data panels must reuse the Obsidian Farm split layout'
);

console.log('Kill Aura UI tests passed.');
