'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const { createPlaytimeFeature } = require('../features/playtime');

async function run() {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/SELECT w\.username/.test(sql)) {
        return { rows: [{ username: 'Player', total_seconds: 120 }] };
      }
      if (/FROM player_playtime pt/.test(sql)) {
        return { rows: [{ username: 'Visitor', total_seconds: 3600 }] };
      }
      return { rows: [] };
    }
  };
  const feature = createPlaytimeFeature({
    pool,
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: '🔄', search: '🔍' }
  });

  const result = await feature.getWhitelistPlaytime();
  const searchResult = await feature.searchNonWhitelistPlaytime('vis', 100);
  const componentIds = feature.buildPlaytimeComponents()[0].components.map(component => component.data.custom_id);

  assert.deepStrictEqual(result.players, [{ username: 'Player', total_seconds: 120 }]);
  assert.deepStrictEqual(searchResult.players, [{ username: 'Visitor', total_seconds: 3600 }]);
  assert.match(queries[0].sql, /ON CONFLICT \(LOWER\(username\)\) DO NOTHING/);
  assert.match(
    queries[1].sql,
    /LEFT JOIN player_playtime pt ON LOWER\(pt\.username\) = LOWER\(w\.username\)/
  );
  assert.match(queries[2].sql, /NOT EXISTS[\s\S]*FROM whitelist w/, 'non-whitelist search must exclude whitelist members');
  assert.deepStrictEqual(queries[2].params, ['%vis%', 25], 'search must use a parameterized query and cap results at 25');
  assert.deepStrictEqual(componentIds, ['playtime_refresh_button', 'playtime_non_whitelist_search']);

  const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
  assert.match(botSource, /playtime_non_whitelist_search_modal[\s\S]*playtime_search_query/, 'the search button must open a nickname modal');
  assert.match(botSource, /searchNonWhitelistPlaytime\(query, 25\)/, 'the modal must run the non-whitelist playtime search');
  assert.match(botSource, /buildNonWhitelistPlaytimeSearchEmbed\(query, result\)/, 'search results must render in the playtime message');
  console.log('playtime feature tests passed');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
