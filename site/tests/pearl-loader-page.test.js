'use strict';

process.env.DATABASE_URL ||= 'postgres://localhost/pearl-loader-page-test';
const assert = require('node:assert/strict');
const { getPearlLoaderState } = require('../server');

const admin = { id:1, username:'admin', role:'admin' };

function fakeDatabase() {
  return {
    async query(sql) {
      if (/FROM bot_status_snapshots/.test(sql)) {
        return { rows:[{ observed_at:'2026-11-25T10:00:00.000Z', pearl_loader:{
          active:true, username:'Alice', mode:'load', stage:'awaiting_yes', startedAt:'2026-11-25T09:59:00.000Z',
          hatch:{ x:123, y:64, z:-456 },
          queue:[{ username:'Bob', position:1, requestedAt:'2026-11-25T09:59:30.000Z', expiresAt:'2026-11-25T10:14:30.000Z' }]
        } }] };
      }
      if (/FROM bot_accounts account/.test(sql)) {
        return { rows:[{ username:'PearlBot', display_name:'Pearl Bot', runtime_status:'connected', last_connected_at:'2026-11-25T09:59:10.000Z' }] };
      }
      if (/AS recent_total/.test(sql)) {
        return { rows:[{ completed:8, today:2, total:10, recent_total:10, recent_completed:8, recent_failed:1, average_ms:42_000 }] };
      }
      if (/ORDER BY finished_at DESC/.test(sql)) {
        return { rows:[{ username:'Carol', outcome:'completed', finished_at:'2026-11-25T09:00:00.000Z', duration_ms:40_000 }] };
      }
      if (/generate_series/.test(sql)) return { rows:[{ day:'2026-11-25', completed:2, total:3 }] };
      if (/DISTINCT ON/.test(sql)) {
        return { rows:[
          { username:'Zed', player_uuid:null, is_online:false, pearl_hatch_x:1, pearl_hatch_y:2, pearl_hatch_z:3 },
          { username:'alice', player_uuid:null, is_online:true, pearl_hatch_x:123, pearl_hatch_y:64, pearl_hatch_z:-456 }
        ] };
      }
      if (/FROM UNNEST/.test(sql)) {
        return { rows:[{ hatch_x:123, hatch_y:64, hatch_z:-456, pearl_present:true, hatch_found:true, block_name:'oak_trapdoor', checked_at:'2026-11-25T09:58:00.000Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

(async () => {
  await assert.rejects(getPearlLoaderState({ id:2, username:'guest', role:'user' }, fakeDatabase()));
  const state = await getPearlLoaderState(admin, fakeDatabase());
  assert.deepEqual(state.loader.displayName, 'Pearl Bot');
  assert.equal(state.live.active, true);
  assert.equal(state.live.stage, 'awaiting_yes');
  assert.deepEqual(state.live.queue.map(entry => entry.username), ['Bob']);
  assert.equal(state.totals.completed, 8);
  assert.equal(state.totals.averageMs, 42_000);
  assert.deepEqual(state.chambers.map(chamber => [chamber.username, chamber.status]), [['alice','set'], ['Zed','unknown']],
    'chambers are sorted by name and carry their state');
  const text = JSON.stringify(state);
  assert.doesNotMatch(text, /123|-456|"hatch"|"x":|"z":/, 'the Pearl Loader page never receives chamber coordinates');
  console.log('Pearl Loader page tests passed.');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
