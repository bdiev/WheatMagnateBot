'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const publicDirectory = path.join(siteDirectory, 'public');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.doesNotMatch(
  serverSource,
  /FROM nearby_player_sightings\s+ORDER BY last_seen DESC\s+LIMIT 5/,
  'nearby sighting feeds must return the complete historical table'
);
assert.doesNotMatch(serverSource, /if \(nearby\.length >= 5\) break;/, 'live nearby merging must not truncate history to five players');
assert.match(indexSource, /All players ever detected near the bot\./, 'the panel must describe its complete historical scope');
assert.match(stylesSource, /\.player-nearby-panel \.rank-list\s*\{[^}]*overflow:\s*auto;/s, 'the complete nearby history must remain inside a scrollable panel');

console.log('Nearby sightings UI tests passed.');
