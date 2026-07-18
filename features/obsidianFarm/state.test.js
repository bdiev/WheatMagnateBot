'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FARM_PHASES, transitionFarmPhase } = require('./state');

test('obsidian farm follows operational state transitions', () => {
  const cycle = ['idle', 'seeking', 'filling', 'navigating', 'pouring', 'waiting', 'mining', 'idle'];
  for (let index = 1; index < cycle.length; index++) {
    assert.equal(transitionFarmPhase(cycle[index - 1], cycle[index]), cycle[index]);
  }
  assert.deepEqual(FARM_PHASES, ['idle', 'seeking', 'filling', 'navigating', 'pouring', 'waiting', 'mining']);
});

test('obsidian farm permits retry and stop but rejects unknown phases', () => {
  assert.equal(transitionFarmPhase('mining', 'seeking'), 'seeking');
  assert.equal(transitionFarmPhase('waiting', 'idle'), 'idle');
  assert.equal(transitionFarmPhase('pouring', 'navigating'), 'navigating');
  assert.throws(() => transitionFarmPhase('teleporting', 'idle'), /Unknown current farm phase/);
  assert.throws(() => transitionFarmPhase('idle', 'teleporting'), /Unknown next farm phase/);
});
