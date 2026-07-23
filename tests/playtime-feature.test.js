'use strict';

const assert = require('assert');
const { createPlaytimeFeature } = require('../features/playtime');

async function run() {
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(sql);
      if (/SELECT w\.username/.test(sql)) {
        return { rows: [{ username: 'Player', total_seconds: 120 }] };
      }
      return { rows: [] };
    }
  };
  const feature = createPlaytimeFeature({
    pool,
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: '1' }
  });

  const result = await feature.getWhitelistPlaytime();

  assert.deepStrictEqual(result.players, [{ username: 'Player', total_seconds: 120 }]);
  assert.match(queries[0], /ON CONFLICT \(LOWER\(username\)\) DO NOTHING/);
  assert.match(
    queries[1],
    /LEFT JOIN player_playtime pt ON LOWER\(pt\.username\) = LOWER\(w\.username\)/
  );
  console.log('playtime feature tests passed');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
