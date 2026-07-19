'use strict';

const { compactDetails } = require('./operational-events');

const PERIOD_MS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
const SEVERITIES = new Set(['info', 'warning', 'critical']);

function assertTimelineAccess(user) {
  if (user?.role !== 'admin') {
    const err = new Error('Admin access required.'); err.statusCode = 403; throw err;
  }
}

function cleanFilter(value, max = 128) {
  return String(value || '').trim().slice(0, max);
}

function normalizeTimelineFilters(searchParams, now = Date.now()) {
  const period = PERIOD_MS[searchParams.get('period')] ? searchParams.get('period') : '24h';
  const parsedFrom = Date.parse(searchParams.get('from') || '');
  const parsedTo = Date.parse(searchParams.get('to') || '');
  const to = Number.isFinite(parsedTo) ? new Date(parsedTo) : new Date(now);
  const from = Number.isFinite(parsedFrom) ? new Date(parsedFrom) : new Date(to.getTime() - PERIOD_MS[period]);
  if (from > to || to.getTime() - from.getTime() > 3650 * 86400000) {
    const err = new Error('Invalid timeline period.'); err.statusCode = 400; throw err;
  }
  const severity = cleanFilter(searchParams.get('severity'), 16);
  return {
    period, from, to, severity: SEVERITIES.has(severity) ? severity : '', source: cleanFilter(searchParams.get('source'), 64),
    eventType: cleanFilter(searchParams.get('eventType'), 80), player: cleanFilter(searchParams.get('player'), 64),
    correlationId: cleanFilter(searchParams.get('correlationId'), 64), eventId: cleanFilter(searchParams.get('eventId'), 160),
    limit: Math.min(250, Math.max(1, Number(searchParams.get('limit')) || 100))
  };
}

const TIMELINE_CTE = `
  WITH timeline AS (
    SELECT 'op:'||e.id AS event_id,e.id AS operational_id,e.event_type,e.severity,e.source,e.title,e.details,e.actor,e.resource_key,e.correlation_id,e.source_record_type,e.source_record_id,e.sensitive,e.occurred_at,FALSE AS archived
    FROM operational_events e
    UNION ALL
    SELECT 'archive:'||e.id,NULL::bigint,e.event_type,e.severity,e.source,e.title,e.details,e.actor,e.resource_key,e.correlation_id,e.source_record_type,e.source_record_id,e.sensitive,e.occurred_at,TRUE
    FROM operational_events_archive e
    UNION ALL
    SELECT 'log:'||l.id,NULL::bigint,LOWER(REGEXP_REPLACE(l.category,'[^a-zA-Z0-9]+','_','g')),
      CASE l.level WHEN 'error' THEN 'critical' WHEN 'warn' THEN 'warning' ELSE 'info' END,
      'system_log',LEFT(l.message,255),COALESCE(l.details,'{}'::jsonb),l.actor_username,
      COALESCE(l.details->>'username',l.details->>'targetUsername',l.details->>'commandId'),'legacy-log-'||l.id,'site_system_logs',l.id::text,
      l.category IN ('security','admin_users','admin_data','command_bus'),l.created_at,FALSE
    FROM site_system_logs l WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.source_record_type='site_system_logs' AND e.source_record_id=l.id::text)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.source_record_type='site_system_logs' AND e.source_record_id=l.id::text)
    UNION ALL
    SELECT 'notification:'||n.id,NULL::bigint,n.event_type,n.severity,'notifications',n.title,
      jsonb_build_object('status',n.status,'message',n.message,'occurrenceCount',n.occurrence_count)||COALESCE(n.metadata,'{}'::jsonb),NULL,n.dedup_key,
      COALESCE(n.correlation_id,n.metadata->>'correlationId','legacy-notification-'||n.id),'notifications',n.id::text,n.event_type='unauthorized_player_nearby',n.created_at,FALSE
    FROM notifications n WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.source_record_type='notifications' AND e.source_record_id=n.id::text)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.source_record_type='notifications' AND e.source_record_id=n.id::text)
    UNION ALL
    SELECT 'command:'||c.id,NULL::bigint,'bot_command_'||c.status,
      CASE WHEN c.status='failed' THEN 'critical' WHEN c.status='processing' THEN 'warning' ELSE 'info' END,
      'bot_commands','Bot command: '||c.command_type,
      jsonb_build_object('commandId',c.id::text,'commandType',c.command_type,'status',c.status,'payload',c.payload,'result',c.result,'error',c.error),
      c.requested_by,'command:'||c.id,COALESCE(c.correlation_id,'legacy-command-'||c.id),'bot_commands',c.id::text,TRUE,c.created_at,FALSE
    FROM bot_commands c WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.source_record_type='bot_commands' AND e.source_record_id=c.id::text)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.source_record_type='bot_commands' AND e.source_record_id=c.id::text)
    UNION ALL
    SELECT 'annotation:'||a.id,NULL::bigint,a.event_type,
      CASE WHEN a.event_type IN ('farm_stalled','player_detected') THEN 'warning' ELSE 'info' END,
      'farm_annotations',LEFT(a.title,255),a.details,a.details->>'actor','obsidian_farm',COALESCE(a.correlation_id,a.details->>'correlationId','legacy-annotation-'||a.id),
      'obsidian_farm_annotations',a.id::text,a.event_type='settings_changed',a.occurred_at,FALSE
    FROM obsidian_farm_annotations a WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.source_record_type='obsidian_farm_annotations' AND e.source_record_id=a.id::text)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.source_record_type='obsidian_farm_annotations' AND e.source_record_id=a.id::text)
    UNION ALL
    SELECT 'nearby:'||LOWER(s.username),NULL::bigint,'nearby_player_sighting','info','nearby_sightings',s.username||' detected near the bot',
      jsonb_build_object('username',s.username,'distance',s.distance),s.username,'player:'||LOWER(s.username),'nearby-'||LOWER(s.username)||'-'||EXTRACT(EPOCH FROM s.last_seen)::bigint,
      'nearby_player_sightings',LOWER(s.username),TRUE,s.last_seen,FALSE FROM nearby_player_sightings s
      WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.event_type='nearby_player_sighting' AND e.resource_key='player:'||LOWER(s.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-s.last_seen)))<61)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.event_type='nearby_player_sighting' AND e.resource_key='player:'||LOWER(s.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-s.last_seen)))<61)
    UNION ALL
    SELECT 'status:1',NULL::bigint,'bot_status_snapshot',CASE WHEN COALESCE(b.status->>'status','offline')='online' THEN 'info' ELSE 'warning' END,
      'bot_status','Bot status: '||COALESCE(b.status->>'status','unknown'),b.status,NULL,'bot:minecraft','bot-status-'||EXTRACT(EPOCH FROM b.observed_at)::bigint,
      'bot_status_snapshots','1',TRUE,b.observed_at,FALSE FROM bot_status_snapshots b WHERE NOT EXISTS(
        SELECT 1 FROM operational_events e WHERE e.event_type='bot_status_snapshot' AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-b.observed_at)))<2)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.event_type='bot_status_snapshot' AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-b.observed_at)))<2)
    UNION ALL
    SELECT 'tps:'||t.id,NULL::bigint,'tps_sample',CASE WHEN t.tps<10 THEN 'critical' WHEN t.tps<15 THEN 'warning' ELSE 'info' END,
      'tps','TPS sampled at '||t.tps::text,jsonb_build_object('tps',t.tps),NULL,'server:tps','tps-'||t.id,'bot_tps_samples',t.id::text,FALSE,t.sampled_at,FALSE
      FROM bot_tps_samples t WHERE NOT EXISTS(SELECT 1 FROM operational_events e WHERE e.source_record_type='bot_tps_samples' AND e.source_record_id=t.id::text)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.source_record_type='bot_tps_samples' AND e.source_record_id=t.id::text)
    UNION ALL
    SELECT 'player-join:'||p.id,NULL::bigint,'player_joined','info','player_activity',p.username||' joined the server',jsonb_build_object('username',p.username),p.username,
      'player:'||LOWER(p.username),'legacy-player-join-'||p.id,'player_activity',p.id::text,FALSE,p.last_online,FALSE
      FROM player_activity p WHERE p.last_online IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM operational_events e WHERE e.event_type='player_joined' AND e.resource_key='player:'||LOWER(p.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-p.last_online)))<2)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.event_type='player_joined' AND e.resource_key='player:'||LOWER(p.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-p.last_online)))<2)
    UNION ALL
    SELECT 'player-left:'||p.id,NULL::bigint,'player_left','info','player_activity',p.username||' left the server',jsonb_build_object('username',p.username),p.username,
      'player:'||LOWER(p.username),'legacy-player-left-'||p.id,'player_activity',p.id::text,FALSE,p.last_seen,FALSE
      FROM player_activity p WHERE p.last_seen IS NOT NULL AND p.is_online IS DISTINCT FROM TRUE AND NOT EXISTS(
        SELECT 1 FROM operational_events e WHERE e.event_type='player_left' AND e.resource_key='player:'||LOWER(p.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-p.last_seen)))<2)
      AND NOT EXISTS(SELECT 1 FROM operational_events_archive e WHERE e.event_type='player_left' AND e.resource_key='player:'||LOWER(p.username) AND ABS(EXTRACT(EPOCH FROM(e.occurred_at-p.last_seen)))<2)
  )`;

async function queryTimeline(pool, filters) {
  const values = [filters.from, filters.to];
  const where = ['occurred_at >= $1', 'occurred_at <= $2'];
  const add = (sql, value) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (filters.severity) add('severity=?', filters.severity);
  if (filters.source) add('source=?', filters.source);
  if (filters.eventType) add('event_type=?', filters.eventType);
  if (filters.correlationId) add('correlation_id=?', filters.correlationId);
  if (filters.eventId) add('event_id=?', filters.eventId);
  if (filters.player) {
    values.push(`%${filters.player.toLowerCase()}%`);
    where.push(`(LOWER(COALESCE(actor,'')) LIKE $${values.length} OR LOWER(COALESCE(resource_key,'')) LIKE $${values.length} OR LOWER(details::text) LIKE $${values.length})`);
  }
  values.push(filters.limit);
  const result = await pool.query(`${TIMELINE_CTE}
    SELECT event_id,operational_id,event_type,severity,source,title,details,actor,resource_key,correlation_id,source_record_type,source_record_id,sensitive,occurred_at,archived
    FROM timeline WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC,event_id DESC LIMIT $${values.length}`, values);
  return result.rows.map(row => ({
    id: row.event_id, operationalId: row.operational_id == null ? null : String(row.operational_id), eventType: row.event_type,
    severity: row.severity, source: row.source, title: row.title, details: compactDetails(row.details), actor: row.actor,
    resourceKey: row.resource_key, correlationId: row.correlation_id, sourceRecordType: row.source_record_type,
    sourceRecordId: row.source_record_id, sensitive: row.sensitive, occurredAt: row.occurred_at, archived: row.archived
  }));
}

module.exports = { PERIOD_MS, TIMELINE_CTE, assertTimelineAccess, normalizeTimelineFilters, queryTimeline };
