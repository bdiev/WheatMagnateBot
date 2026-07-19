'use strict';

const crypto = require('node:crypto');

function newCorrelationId() {
  return crypto.randomUUID();
}

function severityFromLevel(level) {
  if (level === 'error') return 'critical';
  if (level === 'warn') return 'warning';
  return 'info';
}

function eventTypeFromLog(category, message) {
  const text = `${category || ''} ${message || ''}`.toLowerCase();
  if (/kick/.test(text)) return 'bot_kicked';
  if (/reconnect|spawned|connected to minecraft/.test(text)) return 'bot_reconnected';
  if (/disconnect|connection lost|connection ended/.test(text)) return 'bot_disconnected';
  if (/command/.test(text) && /fail/.test(text)) return 'command_failed';
  if (/admin|setting|whitelist|notification_rules/.test(text)) return 'admin_setting_changed';
  if (/farm/.test(text) && /stall|suspend/.test(text)) return 'farm_stalled';
  return String(category || 'system_log').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
}

function compactDetails(details) {
  if (!details || typeof details !== 'object') return {};
  try {
    const serialized = JSON.stringify(details);
    if (Buffer.byteLength(serialized) <= 4096) return details;
  } catch {
    return { truncated: true };
  }
  const compact = { truncated: true };
  for (const [key, value] of Object.entries(details)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      compact[key] = typeof value === 'string' ? value.slice(0, 512) : value;
    }
    if (Object.keys(compact).length >= 20) break;
  }
  return compact;
}

async function recordOperationalEvent(pool, event = {}) {
  if (!pool) return null;
  const correlationId = String(event.correlationId || event.details?.correlationId || newCorrelationId()).slice(0, 64);
  try {
    const result = await pool.query(`
      INSERT INTO operational_events(event_type,severity,source,title,details,actor,resource_key,correlation_id,source_record_type,source_record_id,sensitive,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,NOW()))
      ON CONFLICT (source_record_type,source_record_id) WHERE source_record_type IS NOT NULL AND source_record_id IS NOT NULL
      DO UPDATE SET correlation_id=COALESCE(operational_events.correlation_id,EXCLUDED.correlation_id)
      RETURNING *
    `, [
      String(event.eventType || 'system_event').slice(0, 80),
      ['info', 'warning', 'critical'].includes(event.severity) ? event.severity : 'info',
      String(event.source || 'system').slice(0, 64),
      String(event.title || event.eventType || 'System event').slice(0, 255),
      compactDetails(event.details),
      event.actor ? String(event.actor).slice(0, 128) : null,
      event.resourceKey ? String(event.resourceKey).slice(0, 255) : null,
      correlationId,
      event.sourceRecordType ? String(event.sourceRecordType).slice(0, 64) : null,
      event.sourceRecordId == null ? null : String(event.sourceRecordId).slice(0, 128),
      Boolean(event.sensitive),
      event.occurredAt || null
    ]);
    return result.rows[0] || null;
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('[OperationalEvents] Failed to record event:', err.message);
    }
    return null;
  }
}

module.exports = {
  compactDetails,
  eventTypeFromLog,
  newCorrelationId,
  recordOperationalEvent,
  severityFromLevel
};
