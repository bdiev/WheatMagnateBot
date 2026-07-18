'use strict';

const FARM_PHASES = Object.freeze(['idle', 'seeking', 'filling', 'navigating', 'pouring', 'waiting', 'mining']);

function transitionFarmPhase(current, next) {
  if (!FARM_PHASES.includes(current)) throw new Error(`Unknown current farm phase: ${current}`);
  if (!FARM_PHASES.includes(next)) throw new Error(`Unknown next farm phase: ${next}`);
  // Retries can legitimately re-enter an earlier operational phase depending
  // on the block and inventory state observed after a server response.
  return next;
}

module.exports = { FARM_PHASES, transitionFarmPhase };
