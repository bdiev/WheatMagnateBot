'use strict';

const { newCorrelationId, recordOperationalEvent } = require('../operational-events');

const SEVERITIES = new Set(['info', 'warning', 'critical']);
const CHANNELS = new Set(['discord', 'site', 'system_log']);
const METRICS = {
  unauthorized_player_nearby: ['distance', 'distance', 'lte'],
  low_pickaxe_durability: ['percent', 'percent', 'lt'],
  no_pickaxes: ['count', 'count', 'lt'],
  low_food: ['food', 'food', 'lt'],
  farm_stalled: ['seconds', 'seconds', 'gte'],
  low_tps: ['tps', 'tps', 'lt'],
  repeated_reconnects: ['attempts', 'attempts', 'gte']
};

class PostgresNotificationRepository {
  constructor(pool) { this.pool = pool; }

  async getRule(eventType) {
    const result = await this.pool.query('SELECT * FROM notification_rules WHERE event_type = $1', [eventType]);
    return result.rows[0] || null;
  }

  async getActive(eventType, dedupKey) {
    const result = await this.pool.query(
      "SELECT * FROM notifications WHERE event_type=$1 AND dedup_key=$2 AND status='active' LIMIT 1",
      [eventType, dedupKey]
    );
    return result.rows[0] || null;
  }

  async createNotification(data) {
    const result = await this.pool.query(`
      INSERT INTO notifications (event_type, dedup_key, severity, status, title, message, metadata, correlation_id, resolved_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $4='resolved' THEN NOW() ELSE NULL END)
      RETURNING *
    `, [data.eventType, data.dedupKey, data.severity, data.status, data.title, data.message, data.metadata || {}, data.correlationId]);
    const row = result.rows[0];
    await recordOperationalEvent(this.pool, {
      eventType: data.eventType, severity: data.severity, source: 'notifications', title: data.title,
      details: { status: data.status, message: data.message, ...(data.metadata || {}) }, resourceKey: data.dedupKey,
      correlationId: data.correlationId, sourceRecordType: 'notifications', sourceRecordId: row.id,
      sensitive: data.eventType === 'unauthorized_player_nearby', occurredAt: row.created_at
    });
    return row;
  }

  async touchActive(id, data) {
    const result = await this.pool.query(`
      UPDATE notifications SET message=$2, metadata=$3, severity=$4,
        occurrence_count=occurrence_count+1, last_triggered_at=NOW()
      WHERE id=$1 RETURNING *
    `, [id, data.message, data.metadata || {}, data.severity]);
    return result.rows[0];
  }

  async resolveActive(id) {
    await this.pool.query("UPDATE notifications SET status='resolved', resolved_at=NOW() WHERE id=$1", [id]);
  }

  async markRuleTriggered(eventType) {
    await this.pool.query('UPDATE notification_rules SET last_triggered_at=NOW() WHERE event_type=$1', [eventType]);
  }

  async addDelivery(notificationId, channel, status, error = null) {
    await this.pool.query(`
      INSERT INTO notification_deliveries (notification_id, channel, status, error, delivered_at)
      VALUES ($1,$2,$3,$4,CASE WHEN $3='sent' THEN NOW() ELSE NULL END)
    `, [notificationId, channel, status, error]);
  }
}

class MemoryNotificationRepository {
  constructor(rules = []) {
    this.rules = new Map(rules.map(rule => [rule.event_type, { ...rule }]));
    this.notifications = [];
    this.deliveries = [];
    this.nextId = 1;
  }
  async getRule(type) { return this.rules.get(type) || null; }
  async getActive(type, key) { return this.notifications.find(n => n.event_type === type && n.dedup_key === key && n.status === 'active') || null; }
  async createNotification(d) { const n = { id: this.nextId++, event_type:d.eventType, dedup_key:d.dedupKey, severity:d.severity, status:d.status, title:d.title, message:d.message, metadata:d.metadata||{}, correlation_id:d.correlationId, occurrence_count:1, last_triggered_at:new Date(), created_at:new Date() }; this.notifications.push(n); return n; }
  async touchActive(id,d) { const n=this.notifications.find(x=>x.id===id); Object.assign(n,{message:d.message,metadata:d.metadata||{},severity:d.severity,last_triggered_at:new Date(),occurrence_count:n.occurrence_count+1}); return n; }
  async resolveActive(id) { const n=this.notifications.find(x=>x.id===id); n.status='resolved'; n.resolved_at=new Date(); }
  async markRuleTriggered(type) { const r=this.rules.get(type); if(r) r.last_triggered_at=new Date(); }
  async addDelivery(notificationId,channel,status,error=null) { this.deliveries.push({notificationId,channel,status,error}); }
}

class NotificationService {
  constructor({ pool = null, repository = null, discordSender = null, systemLogger = null, now = () => new Date() } = {}) {
    this.repository = repository || (pool ? new PostgresNotificationRepository(pool) : null);
    this.discordSender = discordSender;
    this.systemLogger = systemLogger;
    this.now = now;
    this.pending = new Map();
  }

  async report(eventType, { key = 'default', title, message, metadata = {}, resolved = false, transient = false } = {}) {
    if (!this.repository) {
      if (eventType !== 'database_unavailable' || resolved) return { skipped: true, reason: 'repository_unavailable' };
      const notification = { id: null, event_type: eventType, dedup_key: String(key), severity: 'critical', status: 'active', title: title || 'Database unavailable', message: message || 'PostgreSQL is not configured.', metadata };
      if (this.discordSender) await this.discordSender(notification, { resolved: false }).catch(() => {});
      if (this.systemLogger) await this.systemLogger({ level: 'error', category: 'notification', message: `${notification.title}: ${notification.message}`, details: metadata }).catch(() => {});
      return { notification, ephemeral: true };
    }
    const lockKey = `${eventType}:${key}`;
    const previous = this.pending.get(lockKey) || Promise.resolve();
    const operation = previous.then(() => this._report(eventType, { key, title, message, metadata, resolved, transient }));
    const tracked = operation.catch(() => {});
    this.pending.set(lockKey, tracked);
    try { return await operation; } finally { if (this.pending.get(lockKey) === tracked) this.pending.delete(lockKey); }
  }

  async _report(eventType, event) {
    const rule = await this.repository.getRule(eventType);
    if (!rule || !rule.enabled) return { skipped: true, reason: 'disabled' };
    event.correlationId = String(event.metadata?.correlationId || event.correlationId || newCorrelationId());
    event.metadata = { ...(event.metadata || {}), correlationId: event.correlationId };
    const metric = METRICS[eventType];
    const thresholdValue = metric && rule.threshold ? Number(rule.threshold[metric[1]]) : NaN;
    const observedValue = metric ? Number(event.metadata?.[metric[0]]) : NaN;
    if (!event.resolved && Number.isFinite(thresholdValue) && Number.isFinite(observedValue)) {
      const breached = eventType === 'low_food' && event.metadata?.inventoryFood === false
        ? true
        : metric[2] === 'lt' ? observedValue < thresholdValue
          : metric[2] === 'lte' ? observedValue <= thresholdValue
            : observedValue >= thresholdValue;
      if (!breached) event.resolved = true;
    }
    if (event.transient) {
      const notification = await this.repository.createNotification({
        eventType, dedupKey: String(event.key), severity: SEVERITIES.has(rule.severity) ? rule.severity : 'info',
        status: 'resolved', title: event.title || eventType, message: event.message || eventType, metadata: event.metadata, correlationId: event.correlationId
      });
      await this._deliver(notification, rule, true);
      return { notification, transient: true };
    }
    const active = await this.repository.getActive(eventType, String(event.key));
    if (active) {
      event.correlationId = String(active.correlation_id || active.metadata?.correlationId || event.correlationId);
      event.metadata = { ...(event.metadata || {}), correlationId: event.correlationId };
    }
    if (event.resolved) {
      if (!active) return { skipped: true, reason: 'not_active' };
      await this.repository.resolveActive(active.id);
      const notification = await this.repository.createNotification({
        eventType, dedupKey: String(event.key), severity: 'info', status: 'resolved',
        title: event.title || `${active.title} resolved`,
        message: event.message || `Resolved: ${active.message}`,
        metadata: { ...event.metadata, resolvedNotificationId: active.id }, correlationId: event.correlationId
      });
      await this._deliver(notification, rule, true);
      return { notification, resolved: true };
    }

    const severity = SEVERITIES.has(rule.severity) ? rule.severity : 'warning';
    if (active) {
      const touched = await this.repository.touchActive(active.id, { ...event, severity });
      const cooldownMs = Math.max(0, Number(rule.cooldown_seconds) || 0) * 1000;
      const last = rule.last_triggered_at ? new Date(rule.last_triggered_at).getTime() : 0;
      if (this.now().getTime() - last < cooldownMs) return { notification: touched, deduplicated: true, delivered: false };
      await this._deliver(touched, rule, false);
      return { notification: touched, deduplicated: true, delivered: true };
    }

    const notification = await this.repository.createNotification({
      eventType, dedupKey: String(event.key), severity, status: 'active',
      title: event.title || eventType, message: event.message || eventType, metadata: event.metadata, correlationId: event.correlationId
    });
    await this._deliver(notification, rule, false);
    return { notification, deduplicated: false, delivered: true };
  }

  async _deliver(notification, rule, resolved) {
    const channels = (rule.delivery_channels || []).filter(channel => CHANNELS.has(channel));
    for (const channel of channels) {
      try {
        if (channel === 'discord' && this.discordSender) await this.discordSender(notification, { resolved });
        if (channel === 'system_log' && this.systemLogger) {
          const logged = await this.systemLogger({
            level: resolved ? 'info' : notification.severity === 'critical' ? 'error' : notification.severity === 'warning' ? 'warn' : 'info',
            category: 'notification', message: `${notification.title}: ${notification.message}`,
            details: { eventType: notification.event_type, dedupKey: notification.dedup_key, status: notification.status, correlationId: notification.correlation_id || notification.metadata?.correlationId }
          });
          if (logged === false) throw new Error('System log delivery failed.');
        }
        await this.repository.addDelivery(notification.id, channel, 'sent');
      } catch (err) {
        await this.repository.addDelivery(notification.id, channel, 'failed', err.message).catch(() => {});
      }
    }
    await this.repository.markRuleTriggered(notification.event_type);
  }
}

module.exports = { NotificationService, PostgresNotificationRepository, MemoryNotificationRepository, SEVERITIES, CHANNELS };
