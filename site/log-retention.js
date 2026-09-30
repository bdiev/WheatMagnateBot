'use strict';

const VERBOSE_LOG_CATEGORIES = Object.freeze(['bot_console', 'obsidian_click']);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function getLogRetentionConfig(env = process.env) {
  return {
    verboseDays: boundedInteger(env.VERBOSE_LOG_RETENTION_DAYS, 7, 1, 90),
    systemDays: boundedInteger(env.SYSTEM_LOG_RETENTION_DAYS, 90, 7, 3650),
    batchSize: boundedInteger(env.LOG_RETENTION_BATCH_SIZE, 10_000, 100, 50_000),
    maxBatches: boundedInteger(env.LOG_RETENTION_MAX_BATCHES, 20, 1, 500),
    summaryHours: boundedInteger(env.LOG_RETENTION_SUMMARY_HOURS, 24, 1, 168),
    intervalMinutes: boundedInteger(env.LOG_RETENTION_INTERVAL_MINUTES, 60, 5, 1440)
  };
}

async function pruneExpiredLogs(pool, config = getLogRetentionConfig()) {
  if (!pool) return { systemLogs: 0, batches: 0, total: 0 };

  // One batch per run cannot keep up when verbose categories grow faster than
  // batchSize per interval, so drain the backlog in bounded batches.
  const maxBatches = Math.max(1, Number(config.maxBatches) || 1);
  let systemLogs = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const batch = await pool.query(`WITH candidates AS (
        SELECT l.id
        FROM site_system_logs l
        WHERE (
            l.category = ANY($1::text[])
            AND l.created_at < NOW()-($2::int*INTERVAL '1 day')
          ) OR (
            NOT (l.category = ANY($1::text[]))
            AND l.created_at < NOW()-($3::int*INTERVAL '1 day')
          )
        ORDER BY l.created_at,l.id
        LIMIT $4
      )
      DELETE FROM site_system_logs l
      USING candidates c
      WHERE l.id=c.id`, [VERBOSE_LOG_CATEGORIES, config.verboseDays, config.systemDays, config.batchSize]);

    batches += 1;
    const deleted = batch.rowCount || 0;
    systemLogs += deleted;
    if (deleted < config.batchSize) break;
  }

  const result = {
    systemLogs,
    batches
  };
  result.total = result.systemLogs;
  return result;
}

module.exports = {
  VERBOSE_LOG_CATEGORIES,
  getLogRetentionConfig,
  pruneExpiredLogs
};
