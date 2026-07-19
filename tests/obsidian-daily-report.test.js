'use strict';

const assert = require('node:assert/strict');
const { claimDailyReportDate, getDailyReportSlot } = require('../obsidian-daily-report');

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

  console.log('Obsidian daily report tests passed.');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
