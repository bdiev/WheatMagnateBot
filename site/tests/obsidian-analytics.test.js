'use strict';

const assert = require('node:assert/strict');
const { calculateAnalytics, calculateDowntime } = require('../obsidian-analytics');

const HOUR = 3_600_000;
const now = new Date('2026-07-19T12:30:00Z');
const bucket = hoursAgo => new Date(now.getTime() - hoursAgo * HOUR).toISOString();

{
  const result = calculateAnalytics({ now, hourly: [], farm: { desiredEnabled: true } });
  assert.equal(result.forecast.confidence.level, 'insufficient');
  assert.equal(result.forecast.expected24h, null);
  assert.equal(result.forecast.pickaxes.at, null);
  assert.ok(result.anomalies.every(item => item.type !== 'zero_production'), 'missing data must not be reported as zero production');
}

{
  const hourly = Array.from({ length: 25 }, (_, index) => ({ bucket: bucket(index), value: index === 0 ? 10_000 : 100, observed: true }));
  const result = calculateAnalytics({ now, hourly, farm: {} });
  assert.equal(result.efficiency.obsidianPerHour, 100, 'partial current hour must be excluded');
  assert.equal(result.forecast.confidence.level, 'medium');
  assert.equal(result.forecast.expected24h, 2400);
}

{
  const result = calculateAnalytics({
    now,
    hourly: Array.from({ length: 12 }, (_, index) => ({ bucket: bucket(index + 1), value: index < 3 ? 20 : 100, observed: true })),
    farm: { desiredEnabled: true }
  });
  assert.ok(result.anomalies.some(item => item.type === 'rate_drop'));
}

{
  const end = now.getTime();
  const result = calculateDowntime([
    { eventType: 'farm_stalled', occurredAt: new Date(end - 10 * HOUR) },
    { eventType: 'farm_resumed', occurredAt: new Date(end - 8 * HOUR) },
    { eventType: 'pause', occurredAt: new Date(end - 4 * HOUR) },
    { eventType: 'resume', occurredAt: new Date(end - 3 * HOUR) }
  ], end - 12 * HOUR, end);
  assert.equal(result.percent, 25);
  assert.equal(result.meanHoursBetweenStops, 6);
}

{
  const result = calculateAnalytics({
    now,
    hourly: Array.from({ length: 30 }, (_, index) => ({ bucket: bucket(index + 1), value: 100, observed: true })),
    farm: { retiredPickaxes: 2, retiredPickaxeBlocks: 4000, totalMined: 1000 },
    supplies: { inventory: { items: [{ name: 'diamond_pickaxe', remainingPercent: 50, usable: true }] } },
    toolUsage: [{ blocks_mined: 4000, durability_used: 2000 }],
    goals: [{ id: 1, name: '10k', targetTotal: 10000, active: true }],
    comparison: { today: 100, yesterday: 80, week: 700, previousWeek: 1000 }
  });
  assert.equal(result.efficiency.obsidianPerPickaxe, 2000);
  assert.equal(result.efficiency.obsidianPerDurabilityUnit, 2);
  assert.equal(result.comparisons.today.percent, 25);
  assert.ok(result.forecast.pickaxes.at);
  assert.ok(result.forecast.goal.at);
}

{
  const result = calculateAnalytics({
    now,
    hourly: Array.from({ length: 12 }, (_, index) => ({ bucket: bucket(index + 1), value: 50, observed: true })),
    supplies: { inventory: { foodCount: 6, items: [] } },
    supplyHistory: [
      { observed_at: new Date(now.getTime() - 8 * HOUR), supplies: { inventory: { foodCount: 14 } } },
      { observed_at: new Date(now.getTime() - 4 * HOUR), supplies: { inventory: { foodCount: 10 } } },
      { observed_at: now, supplies: { inventory: { foodCount: 6 } } }
    ]
  });
  assert.equal(result.forecast.food.hours, 6);
  assert.equal(result.forecast.food.confidence.level, 'low');
}

console.log('Obsidian analytics tests passed.');
