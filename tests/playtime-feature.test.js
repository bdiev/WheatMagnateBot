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
      if (/FROM deduplicated/.test(sql)) {
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
  const setResult = await feature.setPlayerPlaytime('OldPlayerName', 42);
  const componentIds = feature.buildPlaytimeComponents()[0].components.map(component => component.data.custom_id);

  assert.equal(
    feature.parsePlaytime('20 days 15 hours 19 minutes 30 seconds. [329/50368]'),
    1_783_170,
    'rank metadata in a live !pt response must not prevent synchronization'
  );
  assert.equal(
    feature.parsePlaytime('20 days 15 hours unexpected text'),
    null,
    'arbitrary trailing text must remain invalid'
  );

  assert.deepStrictEqual(result.players, [{ username: 'Player', total_seconds: 120 }]);
  assert.deepStrictEqual(searchResult.players, [{ username: 'Visitor', total_seconds: 3600 }]);
  assert.deepStrictEqual(setResult, { username: 'OldPlayerName' });
  assert.match(
    queries[0].sql,
    /pt\.player_uuid = pa\.player_uuid/,
    'whitelist playtime must join the profile by UUID'
  );
  assert.match(queries[1].sql, /player_name_history searched_name/, 'old nicknames must find the current UUID-owned playtime row');
  assert.match(queries[1].sql, /NOT EXISTS[\s\S]*FROM whitelist w/, 'non-whitelist search must exclude whitelist members');
  assert.deepStrictEqual(queries[1].params, ['%vis%', 25], 'search must use a parameterized query and cap results at 25');
  assert.match(queries[2].sql, /player_name_history pnh/, 'setting PT by an old nickname must resolve its UUID');
  assert.match(queries[2].sql, /WHERE pt\.player_uuid = \(SELECT player_uuid FROM identity\)/);
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
