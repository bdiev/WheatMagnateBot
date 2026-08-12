'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(
  appSource,
  /obsidianResetButton\.textContent = hasCoordinates \? 'Reset Coordinates' : 'Set Coordinates'/,
  'a bot without coordinates must offer initial coordinate setup instead of a disabled reset action'
);
assert.doesNotMatch(
  appSource,
  /obsidianResetButton\.disabled = !bot\?\.obsidian\?\.config/,
  'missing coordinates must not disable the setup button'
);
assert.match(
  appSource,
  /if \(!hasCoordinates\) \{[\s\S]*?obsidianCoordinateEditorOpen = true;[\s\S]*?clearObsidianCoordinateEditor\(\)/,
  'Set Coordinates must open a clean coordinate editor without queueing a reset command'
);

console.log('Obsidian coordinate UI tests passed.');
