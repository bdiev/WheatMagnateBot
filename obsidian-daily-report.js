'use strict';

function getDailyReportSlot(settings = {}, now = new Date()) {
  const timezone = settings.timezone || 'Europe/Vilnius';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    due: Number(parts.hour) === Number(settings.daily_report_hour),
    hour: Number(parts.hour),
    timezone
  };
}

async function claimDailyReportDate(pool, dateKey) {
  const result = await pool.query(`
    UPDATE obsidian_farm_analytics_settings
    SET last_daily_report_date=$1::date, updated_at=NOW()
    WHERE id=1 AND last_daily_report_date IS DISTINCT FROM $1::date
    RETURNING id
  `, [dateKey]);
  return result.rowCount > 0;
}

module.exports = { claimDailyReportDate, getDailyReportSlot };
