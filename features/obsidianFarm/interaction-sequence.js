'use strict';

// Modern block-interaction packets carry a client sequence number. Mineflayer
// currently writes zero for activateBlock(), but stricter servers may discard
// repeated custom packets with the same sequence. Keep one counter shared by
// every precise Obsidian Farm interaction on a bot connection.
const sequences = new WeakMap();

function nextInteractionSequence(bot) {
  const client = bot?._client || bot;
  if (!client || (typeof client !== 'object' && typeof client !== 'function')) return 0;
  const previous = sequences.get(client) || 0;
  const next = previous >= 0x7ffffffe ? 1 : previous + 1;
  sequences.set(client, next);
  return next;
}

module.exports = { nextInteractionSequence };
