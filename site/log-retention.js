'use strict';

const VERBOSE_LOG_CATEGORIES = Object.freeze(['bot_console', 'obsidian_click']);
const VERBOSE_EVENT_TYPES = Object.freeze(['bot_console', 'obsidian_click']);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function getLogRetentionConfig(env = process.env) {
  return {
    verboseDays: boundedInteger(env.VERBOSE_LOG_RETENTION_DAYS, 7, 1, 90),
    systemDays: boundedInteger(env.SYSTEM_LOG_RETENTION_DAYS, 90, 7, 3650),
    archiveDays: boundedInteger(env.OPERATIONAL_EVENT_ARCHIVE_RETENTION_DAYS, 365, 30, 3650),
    batchSize: boundedInteger(env.LOG_RETENTION_BATCH_SIZE, 10_000, 100, 50_000),
    intervalMinutes: boundedInteger(env.LOG_RETENTION_INTERVAL_MINUTES, 60, 5, 1440)
  };
}

async function pruneExpiredLogs(pool, config = getLogRetentionConfig()) {
  if (!pool) return { operationalEvents: 0, systemLogs: 0, archivedEvents: 0, total: 0 };

  // Remove verbose normalized events first. Incident-linked events remain
  // protected by the foreign-key relationship and by this explicit filter.
  const operationalEvents = await pool.query(`WITH candidates AS (
      SELECT e.id
      FROM operational_events e
      WHERE e.event_type = ANY($1::text[])
        AND e.occurred_at < NOW()-($2::int*INTERVAL '1 day')
        AND NOT EXISTS (
          SELECT 1 FROM incident_events ie WHERE ie.operational_event_id=e.id
        )
      ORDER BY e.occurred_at,e.id
      LIMIT $3
    )
    DELETE FROM operational_events e
    USING candidates c
    WHERE e.id=c.id`, [VERBOSE_EVENT_TYPES, config.verboseDays, config.batchSize]);

  const systemLogs = await pool.query(`WITH candidates AS (
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

  const archivedEvents = await pool.query(`WITH candidates AS (
      SELECT e.id
      FROM operational_events_archive e
      WHERE (
          e.event_type = ANY($1::text[])
          AND e.occurred_at < NOW()-($2::int*INTERVAL '1 day')
        ) OR (
          NOT (e.event_type = ANY($1::text[]))
          AND e.occurred_at < NOW()-($3::int*INTERVAL '1 day')
        )
      ORDER BY e.occurred_at,e.id
      LIMIT $4
    )
    DELETE FROM operational_events_archive e
    USING candidates c
    WHERE e.id=c.id`, [VERBOSE_EVENT_TYPES, config.verboseDays, config.archiveDays, config.batchSize]);

  const result = {
    operationalEvents: operationalEvents.rowCount || 0,
    systemLogs: systemLogs.rowCount || 0,
    archivedEvents: archivedEvents.rowCount || 0
  };
  result.total = result.operationalEvents + result.systemLogs + result.archivedEvents;
  return result;
}

module.exports = {
  VERBOSE_EVENT_TYPES,
  VERBOSE_LOG_CATEGORIES,
  getLogRetentionConfig,
  pruneExpiredLogs
};
