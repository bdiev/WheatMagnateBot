'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = appSource.indexOf('function countSupplyItems(');
const end = appSource.indexOf('function renderObsidian(', start);
assert.ok(start >= 0 && end > start, 'refill estimator source must remain extractable');

const context = vm.createContext({
  state:{ accountTimezone:'UTC' },
  formatNumber:value => new Intl.NumberFormat('en-US').format(Number(value) || 0)
});
vm.runInContext(appSource.slice(start, end), context);

const accountId = 'secondary-bot';
const leadingEmptyHours = Array.from({ length:48 }, (_, index) => ({
  value:index === 47 ? 1200 : 0,
  segments:index === 47 ? [{ accountId, value:1200 }] : []
}));
assert.equal(
  context.recentObsidianRatePerDay({ hourly:leadingEmptyHours }, accountId, {}),
  28_800,
  'generated hours from before a secondary bot was observed must not dilute its production rate'
);

const freshSupplies = {
  hasSnapshot:true,
  observedAt:new Date().toISOString(),
  inventory:{
    foodCount:700,
    items:[{ name:'diamond_pickaxe', count:10, usable:true }]
  },
  barrel:{ foodCount:0, items:[] },
  barrelError:null
};

{
  const estimate = context.calculateSupplyRefill({}, {
    supplies:freshSupplies,
    farm:{ running:false },
    name:'Spare Bot'
  });
  assert.equal(estimate.available, false);
  assert.equal(estimate.reason, 'inactive');
  assert.equal(context.formatSupplyRefillEstimate(estimate), 'Farm is not running');
}

{
  const estimate = context.calculateSupplyRefill({}, {
    supplies:{ ...freshSupplies, barrel:null, barrelError:'Barrel is out of range' },
    farm:{ running:true }
  });
  assert.equal(estimate.available, false);
  assert.equal(estimate.reason, 'barrel');
  assert.equal(context.formatSupplyRefillEstimate(estimate), 'Barrel snapshot unavailable');
}

{
  const estimate = context.calculateSupplyRefill({}, {
    supplies:{ ...freshSupplies, observedAt:new Date(Date.now() - 31 * 60_000).toISOString() },
    farm:{ running:true }
  });
  assert.equal(estimate.available, false);
  assert.equal(estimate.reason, 'stale');
  assert.equal(context.formatSupplyRefillEstimate(estimate), 'Supply snapshot is stale');
}

{
  const estimate = context.calculateSupplyRefill({}, {
    supplies:freshSupplies,
    farm:{ running:true, sessionSeconds:3600, sessionPerHour:1200 }
  });
  assert.equal(estimate.available, true);
  assert.ok(Math.abs(estimate.days - (15_000 / 28_800)) < 1e-9);
  assert.equal(estimate.limitingSupply, 'pickaxes');
}

{
  const label = context.estimateSupplyRefill({
    scope:'all',
    supplyAccounts:[{
      accountId,
      name:'Spare Bot',
      supplies:freshSupplies,
      farm:{ running:false }
    }]
  });
  assert.equal(label, 'Farm is not running · Spare Bot');
}

console.log('Obsidian refill UI tests passed.');
