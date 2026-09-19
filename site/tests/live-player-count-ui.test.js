'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'site', 'accounts', 'minecraft-bot-runtime.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');

assert.match(botSource, /playerCount: connected \? Object\.keys\(bot\.players \|\| \{\}\)\.length : null/,
  'the primary bot snapshot must expose the live server player count');
assert.match(runtimeSource, /playerCount:this\.bot\?\.entity \? Object\.keys\(this\.bot\?\.players \|\| \{\}\)\.length : null/,
  'secondary account snapshots must expose the live server player count');
assert.match(appSource, /function renderBotStats\(payload\)[\s\S]*bot\?\.playerCount[\s\S]*\$\('#onlinePlayers'\)\.textContent[\s\S]*live server total/,
  'the live bot refresh must render the total server population');
assert.doesNotMatch(
  appSource.match(/function renderPlayerStats\(payload = \{\}, nearbyPlayers = null\) \{[\s\S]*?\n\}/)?.[0] || '',
  /#onlinePlayers|#totalPlayers/,
  'cached whitelist statistics must not overwrite the live server population'
);
assert.match(indexSource, /<span class="stat-label">Players Online Now<\/span>[\s\S]*id="totalPlayers">live server total<\/small>/,
  'the card must describe the number as the live total, not a whitelist count');

console.log('Live player count UI tests passed.');
