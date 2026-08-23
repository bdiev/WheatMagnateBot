'use strict';

const assert = require('node:assert/strict');
const {
  DAILY_OBSIDIAN_REPORT_QUERY,
  buildDailyObsidianReport,
  claimDailyReportDate,
  getDailyReportChannels,
  getDailyReportSlot
} = require('../obsidian-daily-report');

async function run() {
  const due = getDailyReportSlot({ timezone: 'Europe/Vilnius', daily_report_hour: 12 }, new Date('2026-07-19T09:15:00Z'));
  assert.deepEqual(due, { dateKey: '2026-07-19', due: true, hour: 12, timezone: 'Europe/Vilnius' });

  const notDue = getDailyReportSlot({ timezone: 'Europe/Vilnius', daily_report_hour: 13 }, new Date('2026-07-19T09:15:00Z'));
  assert.equal(notDue.due, false);
  const late = getDailyReportSlot({ timezone: 'Europe/Vilnius', daily_report_hour: 9 }, new Date('2026-07-19T12:15:00Z'));
  assert.equal(late.due,true,'a missed report remains due later on the same local day');
  assert.deepEqual(
    getDailyReportChannels({ daily_report_enabled: false }),
    { discord: false, push: true },
    'phone push reports must remain enabled when Discord reports are disabled'
  );

  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: calls.length === 1 ? 1 : 0 };
    }
  };
  assert.equal(await claimDailyReportDate(pool, '2026-07-19'), true);
  assert.equal(await claimDailyReportDate(pool, '2026-07-19'), false);
  assert.match(calls[0].sql, /IS DISTINCT FROM \$1::date/);
  assert.deepEqual(calls[0].params, ['2026-07-19']);

  const report = buildDailyObsidianReport({
    mined_24h: '29419', previous_24h: '28000', rate: '1225.8',
    supplies: { inventory: { foodCount: 12, usablePickaxeCount: 2 }, barrel: { foodCount: 88, usablePickaxeCount: 6 } }
  }, due);
  assert.equal(report.notification.id, 'daily-obsidian-2026-07-19');
  assert.equal(report.notification.event_type, 'daily_obsidian_report');
  assert.deepEqual(report.notification.metadata, {
    mined24h: 29419, changePercent: 5, averageRate: 1225.8, pickaxes: 8, food: 100,
    pickaxeDaysByBot: [], timezone: 'Europe/Vilnius'
  });
  assert.match(report.discordMessage, /Daily Obsidian Farm Report/);
  assert.match(report.discordMessage, /29.?419/);

  const aggregateReport = buildDailyObsidianReport({
    mined_24h: '75000', previous_24h: '60000', rate: '3125', food: '240', pickaxes: '17',
    pickaxe_days_by_bot: [
      { accountId: 'primary', name: 'WheatMagnate', hasSnapshot: true, pickaxes: '10', days: '4.25' },
      { accountId: 'secondary', name: 'Obsidian Alt', hasSnapshot: true, pickaxes: '7', days: '2.04' }
    ]
  }, due);
  assert.deepEqual(aggregateReport.notification.metadata, {
    mined24h: 75000,
    changePercent: 25,
    averageRate: 3125,
    pickaxes: 17,
    food: 240,
    pickaxeDaysByBot: [
      { accountId: 'primary', name: 'WheatMagnate', hasSnapshot: true, pickaxes: 10, days: 4.3 },
      { accountId: 'secondary', name: 'Obsidian Alt', hasSnapshot: true, pickaxes: 7, days: 2 }
    ],
    timezone: 'Europe/Vilnius'
  });
  assert.match(aggregateReport.discordMessage, /WheatMagnate: 4\.3 days/);
  assert.match(aggregateReport.discordMessage, /Obsidian Alt: 2\.0 days/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /obsidian_farm_hourly[\s\S]*UNION ALL[\s\S]*obsidian_account_farm_hourly/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /hourly_totals[\s\S]*GROUP BY bucket/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /obsidian_farm_supply_snapshot[\s\S]*UNION ALL[\s\S]*obsidian_account_farm_supply_snapshot/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /accounts\.is_default=FALSE/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /jsonb_agg[\s\S]*pickaxe_days_by_bot/);
  assert.match(DAILY_OBSIDIAN_REPORT_QUERY, /retired_pickaxe_blocks[\s\S]*rate_per_day/);

  console.log('Obsidian daily report tests passed.');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
