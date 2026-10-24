'use strict';

// One bot at a time watches the server for everyone (player joins and leaves,
// playtime, ping, TPS, public chat, the Discord status), so nothing is counted
// twice. A bot that has just come into the world is "settled" only after its
// player list has filled in.
const OBSERVER_SETTLE_MS = 5_000;

// candidates: bots in game, the primary first, then in account order:
// [{ accountId, bot, isPrimary, spawnedAt }]
function chooseObserver({ candidates = [], currentBot = null, now = Date.now(), settleMs = OBSERVER_SETTLE_MS } = {}) {
  const settled = candidate => now - candidate.spawnedAt >= settleMs;
  const current = candidates.find(candidate => candidate.bot === currentBot) || null;
  const primary = candidates.find(candidate => candidate.isPrimary) || null;
  // The primary takes the watch back once its own player list is complete
  if (current) return primary && primary !== current && settled(primary) ? primary : current;
  return candidates.find(settled) || candidates[0] || null;
}

module.exports = { OBSERVER_SETTLE_MS, chooseObserver };
