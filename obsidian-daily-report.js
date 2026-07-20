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
    due: Number(parts.hour) >= Number(settings.daily_report_hour),
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

function buildDailyObsidianReport(row = {}, slot = {}) {
  const current = Number(row.mined_24h) || 0;
  const previous = Number(row.previous_24h) || 0;
  const changePercent = previous > 0 ? Math.round((current - previous) / previous * 100) : null;
  const change = changePercent === null ? 'no comparison data' : `${changePercent}%`;
  const supplies = row.supplies || {};
  const food = Number(supplies.inventory?.foodCount || 0) + Number(supplies.barrel?.foodCount || 0);
  const pickaxes = Number(supplies.inventory?.usablePickaxeCount || 0) + Number(supplies.barrel?.usablePickaxeCount || 0);
  const averageRate = Number(row.rate) || 0;
  const timezone = String(slot.timezone || 'Europe/Vilnius');
  const dateKey = String(slot.dateKey || new Date().toISOString().slice(0, 10));
  return {
    discordMessage: `**Daily Obsidian Farm Report**\nMined in 24 hours: **${current.toLocaleString()}** (${change})\nAverage rate: **${averageRate.toFixed(1)}/h**\nSupplies: **${pickaxes}** pickaxes, **${food}** food items\nTimezone: \`${timezone}\``,
    notification: {
      id: `daily-obsidian-${dateKey}`,
      event_type: 'daily_obsidian_report',
      severity: 'info',
      metadata: { mined24h: current, changePercent, averageRate, pickaxes, food, timezone }
    }
  };
}

module.exports = { buildDailyObsidianReport, claimDailyReportDate, getDailyReportSlot };
