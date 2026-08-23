'use strict';

const DAILY_OBSIDIAN_REPORT_QUERY = `
  WITH account_catalog AS (
    SELECT id,COALESCE(NULLIF(display_name,''),username) AS name,sort_order,is_default,deleted_at
    FROM bot_accounts
  ), hourly_rows AS (
    SELECT accounts.id AS account_id,legacy.bucket,legacy.mined
    FROM obsidian_farm_hourly legacy
    JOIN account_catalog accounts ON accounts.is_default=TRUE
    WHERE legacy.bucket>=NOW()-INTERVAL '48 hours'
    UNION ALL
    SELECT managed.account_id,managed.bucket,managed.mined
    FROM obsidian_account_farm_hourly managed
    JOIN account_catalog accounts ON accounts.id=managed.account_id
    WHERE accounts.is_default=FALSE
      AND managed.bucket>=NOW()-INTERVAL '48 hours'
  ), hourly_totals AS (
    SELECT bucket,SUM(mined)::bigint AS mined
    FROM hourly_rows
    GROUP BY bucket
  ), first_productive AS (
    SELECT account_id,MIN(bucket) FILTER(WHERE mined>0) AS first_bucket
    FROM hourly_rows
    GROUP BY account_id
  ), account_recent AS (
    SELECT hourly.account_id,
           SUM(hourly.mined) FILTER(WHERE hourly.bucket>=first.first_bucket)::numeric AS recent_mined,
           GREATEST(1,LEAST(48,
             FLOOR(EXTRACT(EPOCH FROM (date_trunc('hour',NOW())-first.first_bucket))/3600)+1
           ))::numeric AS observed_hours
    FROM hourly_rows hourly
    JOIN first_productive first ON first.account_id=hourly.account_id
    WHERE first.first_bucket IS NOT NULL
    GROUP BY hourly.account_id,first.first_bucket
  ), account_rates AS (
    SELECT account_id,recent_mined*24/observed_hours AS rate_per_day
    FROM account_recent
  ), supply_rows AS (
    SELECT accounts.id AS account_id,legacy.supplies
    FROM obsidian_farm_supply_snapshot legacy
    JOIN account_catalog accounts ON accounts.is_default=TRUE
    WHERE legacy.id=1 AND accounts.deleted_at IS NULL
    UNION ALL
    SELECT managed.account_id,managed.supplies
    FROM obsidian_account_farm_supply_snapshot managed
    JOIN account_catalog accounts ON accounts.id=managed.account_id
    WHERE accounts.is_default=FALSE AND accounts.deleted_at IS NULL
  ), supply_counts AS (
    SELECT account_id,supplies,
      COALESCE(NULLIF(supplies#>>'{inventory,foodCount}','')::bigint,0) +
        COALESCE(NULLIF(supplies#>>'{barrel,foodCount}','')::bigint,0) AS food,
      COALESCE(NULLIF(supplies#>>'{inventory,usablePickaxeCount}','')::bigint,0) +
        COALESCE(NULLIF(supplies#>>'{barrel,usablePickaxeCount}','')::bigint,0) AS pickaxes
    FROM supply_rows
  ), supply_totals AS (
    SELECT COALESCE(SUM(food),0)::bigint AS food,
           COALESCE(SUM(pickaxes),0)::bigint AS pickaxes
    FROM supply_counts
  ), farm_states AS (
    SELECT accounts.id AS account_id,legacy.session_mined,legacy.session_started_at,
           legacy.retired_pickaxes,legacy.retired_pickaxe_blocks
    FROM obsidian_farm_state legacy
    JOIN account_catalog accounts ON accounts.is_default=TRUE
    WHERE legacy.id=1
    UNION ALL
    SELECT managed.account_id,managed.session_mined,managed.session_started_at,
           managed.retired_pickaxes,managed.retired_pickaxe_blocks
    FROM obsidian_account_farm_state managed
    JOIN account_catalog accounts ON accounts.id=managed.account_id
    WHERE accounts.is_default=FALSE
  ), estimate_inputs AS (
    SELECT accounts.id AS account_id,accounts.name,accounts.sort_order,
           (supplies.account_id IS NOT NULL) AS has_snapshot,
           COALESCE(supplies.pickaxes,0)::bigint AS pickaxes,
           CASE WHEN COALESCE(states.retired_pickaxes,0)>0
             THEN states.retired_pickaxe_blocks::numeric/states.retired_pickaxes
             ELSE 1500::numeric
           END AS blocks_per_pickaxe,
           CASE WHEN runtime.status='connected'
                  AND runtime.current_task='obsidian'
                  AND runtime.updated_at>=NOW()-INTERVAL '15 seconds'
                  AND runtime.status_payload->>'connected'='true'
                  AND states.session_started_at<=NOW()-INTERVAL '15 minutes'
                  AND states.session_mined>0
             THEN states.session_mined::numeric*86400 /
               GREATEST(1,EXTRACT(EPOCH FROM (NOW()-states.session_started_at)))
             ELSE rates.rate_per_day
           END AS rate_per_day
    FROM account_catalog accounts
    LEFT JOIN supply_counts supplies ON supplies.account_id=accounts.id
    LEFT JOIN farm_states states ON states.account_id=accounts.id
    LEFT JOIN account_rates rates ON rates.account_id=accounts.id
    LEFT JOIN bot_account_runtime_state runtime ON runtime.account_id=accounts.id
    WHERE accounts.deleted_at IS NULL
      AND (supplies.account_id IS NOT NULL OR states.account_id IS NOT NULL OR rates.account_id IS NOT NULL)
  ), pickaxe_estimates AS (
    SELECT account_id,name,sort_order,has_snapshot,pickaxes,
           CASE WHEN rate_per_day>0
             THEN ROUND(pickaxes*blocks_per_pickaxe/rate_per_day,1)
             ELSE NULL
           END AS days
    FROM estimate_inputs
  )
  SELECT
    COALESCE(SUM(mined) FILTER(
      WHERE bucket>=NOW()-INTERVAL '24 hours'
    ),0)::bigint AS mined_24h,
    COALESCE(SUM(mined) FILTER(
      WHERE bucket>=NOW()-INTERVAL '48 hours'
        AND bucket<NOW()-INTERVAL '24 hours'
    ),0)::bigint AS previous_24h,
    COALESCE(AVG(mined) FILTER(
      WHERE bucket>=NOW()-INTERVAL '24 hours'
    ),0)::numeric AS rate,
    (SELECT food FROM supply_totals) AS food,
    (SELECT pickaxes FROM supply_totals) AS pickaxes,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'accountId',account_id,
       'name',name,
       'hasSnapshot',has_snapshot,
       'pickaxes',pickaxes,
       'days',days
     ) ORDER BY sort_order,name),'[]'::jsonb) FROM pickaxe_estimates) AS pickaxe_days_by_bot
  FROM hourly_totals
`;

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

function getDailyReportChannels(settings = {}) {
  return {
    discord: Boolean(settings.daily_report_enabled),
    push: true
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
  const food = row.food == null
    ? Number(supplies.inventory?.foodCount || 0) + Number(supplies.barrel?.foodCount || 0)
    : Number(row.food) || 0;
  const pickaxes = row.pickaxes == null
    ? Number(supplies.inventory?.usablePickaxeCount || 0) + Number(supplies.barrel?.usablePickaxeCount || 0)
    : Number(row.pickaxes) || 0;
  const averageRate = Number(row.rate) || 0;
  let rawPickaxeDaysByBot = row.pickaxe_days_by_bot || [];
  if (typeof rawPickaxeDaysByBot === 'string') {
    try { rawPickaxeDaysByBot = JSON.parse(rawPickaxeDaysByBot); } catch { rawPickaxeDaysByBot = []; }
  }
  const pickaxeDaysByBot = (Array.isArray(rawPickaxeDaysByBot) ? rawPickaxeDaysByBot : [])
    .map(item => {
      const days = item?.days == null ? null : Number(item.days);
      return {
        accountId: String(item?.accountId || '').slice(0, 64),
        name: String(item?.name || 'Unknown bot').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64),
        hasSnapshot: item?.hasSnapshot !== false,
        pickaxes: Math.max(0, Math.round(Number(item?.pickaxes) || 0)),
        days: Number.isFinite(days) ? Math.max(0, Math.round(days * 10) / 10) : null
      };
    });
  const timezone = String(slot.timezone || 'Europe/Vilnius');
  const dateKey = String(slot.dateKey || new Date().toISOString().slice(0, 10));
  const pickaxeReserve = pickaxeDaysByBot.length
    ? `\nPickaxe reserve:\n${pickaxeDaysByBot.map(item => `- ${item.name}: ${item.hasSnapshot ? (item.days == null ? 'estimate unavailable' : `${item.days.toFixed(1)} days`) : 'no supply snapshot'} (${item.pickaxes} pickaxes)`).join('\n')}`
    : '';
  return {
    discordMessage: `**Daily Obsidian Farm Report**\nMined in 24 hours: **${current.toLocaleString()}** (${change})\nAverage rate: **${averageRate.toFixed(1)}/h**\nSupplies: **${pickaxes}** pickaxes, **${food}** food items${pickaxeReserve}\nTimezone: \`${timezone}\``,
    notification: {
      id: `daily-obsidian-${dateKey}`,
      event_type: 'daily_obsidian_report',
      severity: 'info',
      metadata: { mined24h: current, changePercent, averageRate, pickaxes, food, pickaxeDaysByBot, timezone }
    }
  };
}

module.exports = {
  DAILY_OBSIDIAN_REPORT_QUERY,
  buildDailyObsidianReport,
  claimDailyReportDate,
  getDailyReportChannels,
  getDailyReportSlot
};
