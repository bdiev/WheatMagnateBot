'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.doesNotMatch(
  appSource,
  /setObsidianDigitNumber\('#retiredPickaxes'/,
  'the retired-pickaxe count must not use the Minecraft digit renderer'
);
assert.equal(
  (appSource.match(/\$\('#retiredPickaxes'\)\.textContent = `retired pickaxes: \$\{formatNumber\(farm\.retiredPickaxes\)\}`;/g) || []).length,
  2,
  'full and live Obsidian renders must use ordinary text for retired pickaxes'
);

console.log('Retired pickaxes font UI tests passed.');
