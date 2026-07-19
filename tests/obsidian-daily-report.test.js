'use strict';

const assert = require('node:assert/strict');
const { buildDailyObsidianReport, claimDailyReportDate, getDailyReportSlot } = require('../obsidian-daily-report');

async function run() {
  const due = getDailyReportSlot({ timezone: 'Europe/Vilnius', daily_report_hour: 12 }, new Date('2026-07-19T09:15:00Z'));
  assert.deepEqual(due, { dateKey: '2026-07-19', due: true, hour: 12, timezone: 'Europe/Vilnius' });

  const notDue = getDailyReportSlot({ timezone: 'Europe/Vilnius', daily_report_hour: 13 }, new Date('2026-07-19T09:15:00Z'));
  assert.equal(notDue.due, false);

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
    mined24h: 29419, changePercent: 5, averageRate: 1225.8, pickaxes: 8, food: 100, timezone: 'Europe/Vilnius'
  });
  assert.match(report.discordMessage, /Daily Obsidian Farm Report/);
  assert.match(report.discordMessage, /29.?419/);

  console.log('Obsidian daily report tests passed.');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
