'use strict';

const assert = require('node:assert/strict');
const { createLogSwitches, logTagOf } = require('../features/logSwitches');

assert.equal(logTagOf('[Trader] Started. [StoneMagnate]'), 'Trader');
assert.equal(logTagOf('[Obsidian Farm] Mining.'), 'Obsidian Farm');
assert.equal(logTagOf('no tag here'), null);
assert.equal(logTagOf(42), null);

const seen = [];
const switches = createLogSwitches({ onTagsChanged: tags => seen.push(tags) });
assert.equal(switches.allows('[Trader] Started.'), true);
assert.deepEqual(switches.listTags(), ['Trader'], 'a tag is learned from the first line');
assert.equal(seen.length, 1);
switches.allows('[Trader] again');
assert.equal(seen.length, 1, 'a known tag is not announced twice');

assert.deepEqual(switches.setMuted('trader', true), ['Trader'], 'tags match without case');
assert.equal(switches.allows('[Trader] Crafted 1 emerald block.'), false, 'info lines of a muted tag are dropped');
assert.equal(switches.allows('[Trader] Crafted.', 'debug'), false);
assert.equal(switches.allows('[Trader] The output chest is full.', 'warn'), true, 'warnings always pass');
assert.equal(switches.allows('[Trader] Loop crashed.', 'error'), true, 'errors always pass');
assert.equal(switches.allows('Untagged line'), true);
assert.equal(switches.allows('[Kill Aura] hit'), true, 'other tags are untouched');

switches.setMuted('Trader', false);
assert.equal(switches.allows('[Trader] Started.'), true);

switches.loadMuted(['Kill Aura']);
assert.equal(switches.isMuted('kill aura'), true);
assert.equal(switches.isMuted('Trader'), false, 'loading replaces the muted list');

console.log('log-switches tests passed');
