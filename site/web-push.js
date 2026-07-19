'use strict';

const webPush = require('web-push');

const EVENT_TYPES = Object.freeze([
  'bot_disconnected', 'bot_reconnected', 'bot_kicked', 'unauthorized_player_nearby',
  'low_pickaxe_durability', 'no_pickaxes', 'low_food', 'farm_stalled', 'low_tps',
  'database_unavailable', 'repeated_reconnects', 'command_failed', 'whisper_message'
]);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const SEVERITY_RANK = Object.freeze({ info: 0, warning: 1, critical: 2 });
const SAFE_EVENT_LABELS = Object.freeze({
  bot_disconnected: 'Bot disconnected', bot_reconnected: 'Bot reconnected', bot_kicked: 'Bot was kicked',
  unauthorized_player_nearby: 'Nearby player alert', low_pickaxe_durability: 'Pickaxe durability is low',
  no_pickaxes: 'No usable pickaxes', low_food: 'Food supply is low', farm_stalled: 'Obsidian farm stalled',
  low_tps: 'Server TPS is low', database_unavailable: 'Database unavailable',
  repeated_reconnects: 'Repeated reconnects', command_failed: 'A bot command failed',
  whisper_message: 'New private message'
});

function normalizeTime(value, fallback) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : fallback;
}

function timeMinutes(value) {
  const normalized = normalizeTime(value, '00:00');
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function localMinutes(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Europe/Vilnius', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isQuietHours(subscription, now = new Date()) {
  if (!subscription.quiet_hours_enabled) return false;
  let current;
  try { current = localMinutes(now, subscription.timezone); } catch { current = localMinutes(now, 'Europe/Vilnius'); }
  const start = timeMinutes(subscription.quiet_start);
  const end = timeMinutes(subscription.quiet_end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function shouldDeliverSubscription(subscription, notification, { resolved = false, now = new Date() } = {}) {
  if (!subscription.enabled || isQuietHours(subscription, now)) return false;
  if (resolved && !subscription.include_resolved) return false;
  const selected = Array.isArray(subscription.event_types) ? subscription.event_types : [];
  if (selected.length && !selected.includes(notification.event_type)) return false;
  if (notification.event_type === 'whisper_message') return true;
  if (resolved) return true;
  return (SEVERITY_RANK[notification.severity] ?? -1) >= (SEVERITY_RANK[subscription.minimum_severity] ?? 2);
}

function safeDetailedBody(notification, { resolved = false } = {}) {
  const label = SAFE_EVENT_LABELS[notification.event_type] || 'Bot status';
  if (resolved) return `${label} has been resolved.`;
  const metadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
  const number = key => metadata[key] !== null && metadata[key] !== undefined && metadata[key] !== '' && Number.isFinite(Number(metadata[key]))
    ? Number(metadata[key]) : null;
  switch (notification.event_type) {
    case 'bot_disconnected':
      return 'The Minecraft connection is offline. Automatic recovery may be in progress.';
    case 'bot_reconnected':
      return 'The Minecraft connection is online again.';
    case 'bot_kicked':
      return 'The server ended the bot connection.';
    case 'unauthorized_player_nearby': {
      const distance = number('distance');
      return distance === null ? `${label}.` : `A nearby player was detected ${Math.max(0, Math.round(distance))} blocks away.`;
    }
    case 'low_pickaxe_durability': {
      const percent = number('percent');
      return percent === null ? `${label}.` : `Pickaxe durability: ${Math.max(0, Math.min(100, Math.round(percent)))}%.`;
    }
    case 'no_pickaxes': {
      const count = number('count');
      return count === null ? `${label}.` : `Usable pickaxes: ${Math.max(0, Math.round(count))}.`;
    }
    case 'low_food': {
      const food = number('food');
      if (metadata.inventoryFood === false) return 'No food is available in the bot inventory.';
      return food === null ? `${label}.` : `Current food level: ${Math.max(0, Math.round(food))}.`;
    }
    case 'farm_stalled': {
      const seconds = number('seconds');
      return seconds === null ? `${label}.` : `The farm has been stalled for ${Math.max(0, Math.round(seconds))} seconds.`;
    }
    case 'low_tps': {
      const tps = number('tps');
      return tps === null ? `${label}.` : `Current server TPS: ${Math.max(0, tps).toFixed(1)}.`;
    }
    case 'repeated_reconnects': {
      const attempts = number('attempts');
      return attempts === null ? `${label}.` : `${Math.max(0, Math.round(attempts))} reconnect attempts were scheduled recently.`;
    }
    case 'database_unavailable':
      return 'The dashboard database connection is unavailable.';
    case 'command_failed':
      return 'A queued bot command did not complete.';
    case 'whisper_message': {
      const sender = String(metadata.sender || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
      const message = String(metadata.message || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
      return sender && message ? `${sender}: ${message}` : 'A new whisper is waiting in private messages.';
    }
    default:
      return `${label}. Open the dashboard for details.`;
  }
}

function safePushPayload(notification, { resolved = false, test = false, detailed = false } = {}) {
  const label = test ? 'Browser push test' : (SAFE_EVENT_LABELS[notification.event_type] || 'Bot status changed');
  const critical = !resolved && notification.severity === 'critical';
  const destination = test ? 'settings' : notification.event_type === 'whisper_message' ? 'whispers' : 'notifications';
  return {
    title: test ? 'WheatMagnateBot test' : critical ? 'Critical bot alert' : resolved ? 'Issue resolved' : detailed ? label : 'WheatMagnateBot alert',
    body: test ? `${label}. Open the dashboard for details.` : detailed
      ? safeDetailedBody(notification, { resolved })
      : `${label}. Open the dashboard for details.`,
    icon: '/items/Wheat.png',
    badge: '/items/Wheat.png',
    tag: test ? 'wheatmagnate-test' : `wheatmagnate-${notification.id || notification.event_type}`,
    data: { url: `/?push=${destination}` },
    requireInteraction: critical
  };
}

function normalizePreferences(input = {}) {
  const severity = Object.hasOwn(SEVERITY_RANK, input.minimumSeverity) ? input.minimumSeverity : 'critical';
  const eventTypes = [...new Set((Array.isArray(input.eventTypes) ? input.eventTypes : []).map(String).filter(type => EVENT_TYPE_SET.has(type)))];
  const detailedEventTypes = [...new Set((Array.isArray(input.detailedEventTypes) ? input.detailedEventTypes : []).map(String)
    .filter(type => EVENT_TYPE_SET.has(type) && (!eventTypes.length || eventTypes.includes(type))))];
  let timezone = String(input.timezone || 'Europe/Vilnius').trim().slice(0, 64);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { timezone = 'Europe/Vilnius'; }
  return {
    enabled: input.enabled === true,
    minimumSeverity: severity,
    eventTypes,
    detailedEventTypes,
    includeResolved: Boolean(input.includeResolved),
    quietHoursEnabled: Boolean(input.quietHoursEnabled),
    quietStart: normalizeTime(input.quietStart, '22:00'),
    quietEnd: normalizeTime(input.quietEnd, '07:00'),
    timezone
  };
}

function validateBrowserSubscription(input) {
  const endpoint = String(input?.endpoint || '').trim();
  const p256dh = String(input?.keys?.p256dh || '').trim();
  const auth = String(input?.keys?.auth || '').trim();
  let url;
  try { url = new URL(endpoint); } catch { throw Object.assign(new Error('Invalid push subscription.'), { statusCode: 400 }); }
  if (url.protocol !== 'https:' || endpoint.length > 2048 || !/^[A-Za-z0-9_-]{40,}$/.test(p256dh) || !/^[A-Za-z0-9_-]{12,}$/.test(auth)) {
    throw Object.assign(new Error('Invalid push subscription.'), { statusCode: 400 });
  }
  return { endpoint, keys: { p256dh, auth } };
}

function normalizeSubscriptionId(value) {
  const id = String(value || '');
  if (!/^\d{1,20}$/.test(id)) throw Object.assign(new Error('Invalid push device ID.'), { statusCode: 400 });
  return id;
}

async function deliverPushSubscriptions({ subscriptions, notification, resolved = false, now = new Date(), sendNotification, removeInvalid }) {
  const result = { sent: 0, skipped: 0, failed: 0, removed: 0, sentIds: [], failedIds: [], removedIds: [] };
  for (const subscription of subscriptions) {
    if (!shouldDeliverSubscription(subscription, notification, { resolved, now })) { result.skipped += 1; continue; }
    const detailed = Array.isArray(subscription.detailed_event_types) && subscription.detailed_event_types.includes(notification.event_type);
    const payload = JSON.stringify(safePushPayload(notification, { resolved, detailed }));
    try {
      await sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        TTL: 300, urgency: notification.severity === 'critical' ? 'high' : 'normal'
      });
      result.sent += 1;
      result.sentIds.push(subscription.id);
    } catch (err) {
      if ([404, 410].includes(Number(err.statusCode))) {
        await removeInvalid(subscription.id);
        result.removed += 1;
        result.removedIds.push(subscription.id);
      } else {
        result.failed += 1;
        result.failedIds.push(subscription.id);
      }
    }
  }
  return result;
}

class WebPushService {
  constructor({ pool, publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT || 'mailto:admin@localhost', sender = webPush } = {}) {
    this.pool = pool;
    this.publicKey = String(publicKey || '').trim();
    this.sender = sender;
    this.configured = false;
    if (this.publicKey && privateKey) {
      try {
        this.sender.setVapidDetails(String(subject), this.publicKey, String(privateKey));
        this.configured = true;
      } catch (err) { this.configurationError = err.message; }
    }
  }

  async listForUser(userId) {
    const result = await this.pool.query(`SELECT id,device_name,enabled,minimum_severity,event_types,detailed_event_types,include_resolved,
      quiet_hours_enabled,quiet_start::text,quiet_end::text,timezone,last_success_at,failure_count,created_at,updated_at,
      RIGHT(endpoint,18) endpoint_suffix FROM push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return result.rows.map(row => ({
      id: String(row.id), deviceName: row.device_name, enabled: row.enabled, minimumSeverity: row.minimum_severity,
      eventTypes: row.event_types || [], detailedEventTypes: row.detailed_event_types || [], includeResolved: row.include_resolved, quietHoursEnabled: row.quiet_hours_enabled,
      quietStart: normalizeTime(row.quiet_start, '22:00'), quietEnd: normalizeTime(row.quiet_end, '07:00'), timezone: row.timezone,
      endpointSuffix: row.endpoint_suffix, lastSuccessAt: row.last_success_at, failureCount: row.failure_count,
      createdAt: row.created_at, updatedAt: row.updated_at
    }));
  }

  async subscribe(userId, input) {
    if (!this.configured) throw Object.assign(new Error('Browser push is not configured.'), { statusCode: 503 });
    const subscription = validateBrowserSubscription(input.subscription);
    const preferences = normalizePreferences(input);
    const deviceName = String(input.deviceName || 'Browser').trim().slice(0, 80) || 'Browser';
    const result = await this.pool.query(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,device_name,enabled,minimum_severity,event_types,detailed_event_types,include_resolved,quiet_hours_enabled,quiet_start,quiet_end,timezone)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::time,$13::time,$14)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,device_name=EXCLUDED.device_name,
        enabled=EXCLUDED.enabled,minimum_severity=EXCLUDED.minimum_severity,event_types=EXCLUDED.event_types,detailed_event_types=EXCLUDED.detailed_event_types,include_resolved=EXCLUDED.include_resolved,
        quiet_hours_enabled=EXCLUDED.quiet_hours_enabled,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,timezone=EXCLUDED.timezone,updated_at=NOW()
      RETURNING id`, [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, deviceName, preferences.enabled,
      preferences.minimumSeverity, preferences.eventTypes, preferences.detailedEventTypes, preferences.includeResolved, preferences.quietHoursEnabled,
      preferences.quietStart, preferences.quietEnd, preferences.timezone]);
    return String(result.rows[0].id);
  }

  async update(userId, id, input) {
    id = normalizeSubscriptionId(id);
    const p = normalizePreferences(input);
    const name = String(input.deviceName || 'Browser').trim().slice(0, 80) || 'Browser';
    const result = await this.pool.query(`UPDATE push_subscriptions SET device_name=$3,enabled=$4,minimum_severity=$5,event_types=$6,
      detailed_event_types=$7,include_resolved=$8,quiet_hours_enabled=$9,quiet_start=$10::time,quiet_end=$11::time,timezone=$12,updated_at=NOW()
      WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId, name, p.enabled, p.minimumSeverity, p.eventTypes, p.detailedEventTypes, p.includeResolved,
      p.quietHoursEnabled, p.quietStart, p.quietEnd, p.timezone]);
    if (!result.rowCount) throw Object.assign(new Error('Push device not found.'), { statusCode: 404 });
  }

  async remove(userId, id) {
    id = normalizeSubscriptionId(id);
    const result = await this.pool.query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2 RETURNING id', [id, userId]);
    if (!result.rowCount) throw Object.assign(new Error('Push device not found.'), { statusCode: 404 });
  }

  async deliver(notification, { resolved = false, now = new Date() } = {}) {
    if (!this.configured || !this.pool) return { sent: 0, skipped: 0, failed: 0, removed: 0, unavailable: true };
    const rows = await this.pool.query(`SELECT ps.*,COALESCE(np.account_timezone,ps.timezone) AS timezone FROM push_subscriptions ps JOIN site_users u ON u.id=ps.user_id
      LEFT JOIN site_navigation_preferences np ON np.user_id=ps.user_id
      WHERE ps.enabled=TRUE AND u.status='approved' AND u.role='admin'`);
    const result = await deliverPushSubscriptions({
      subscriptions: rows.rows, notification, resolved, now,
      sendNotification: (...args) => this.sender.sendNotification(...args),
      removeInvalid: id => this.pool.query('DELETE FROM push_subscriptions WHERE id=$1', [id])
    });
    if (result.sentIds.length) await this.pool.query(`UPDATE push_subscriptions SET last_success_at=NOW(),failure_count=0 WHERE id=ANY($1::bigint[])`, [result.sentIds]).catch(() => {});
    if (result.failedIds.length) await this.pool.query(`UPDATE push_subscriptions SET failure_count=failure_count+1 WHERE id=ANY($1::bigint[])`, [result.failedIds]).catch(() => {});
    return result;
  }

  async deliverWhisper({ id, recipientUsername, sender, message, now = new Date() } = {}) {
    if (!this.configured || !this.pool || !recipientUsername) return { sent: 0, skipped: 0, failed: 0, removed: 0, unavailable: true };
    const rows = await this.pool.query(`SELECT ps.*,COALESCE(np.account_timezone,ps.timezone) AS timezone FROM push_subscriptions ps JOIN site_users u ON u.id=ps.user_id
      LEFT JOIN site_navigation_preferences np ON np.user_id=ps.user_id
      WHERE ps.enabled=TRUE AND u.status='approved' AND LOWER(u.username)=LOWER($1)`, [String(recipientUsername).slice(0, 64)]);
    const notification = {
      id: `whisper-${String(id || 'new').replace(/[^\d]/g, '').slice(0, 20) || 'new'}`,
      event_type: 'whisper_message', severity: 'info', metadata: { sender, message }
    };
    const result = await deliverPushSubscriptions({
      subscriptions: rows.rows, notification, now,
      sendNotification: (...args) => this.sender.sendNotification(...args),
      removeInvalid: subscriptionId => this.pool.query('DELETE FROM push_subscriptions WHERE id=$1', [subscriptionId])
    });
    if (result.sentIds.length) await this.pool.query(`UPDATE push_subscriptions SET last_success_at=NOW(),failure_count=0 WHERE id=ANY($1::bigint[])`, [result.sentIds]).catch(() => {});
    if (result.failedIds.length) await this.pool.query(`UPDATE push_subscriptions SET failure_count=failure_count+1 WHERE id=ANY($1::bigint[])`, [result.failedIds]).catch(() => {});
    return result;
  }

  async sendTest(userId, id) {
    id = normalizeSubscriptionId(id);
    if (!this.configured) throw Object.assign(new Error('Browser push is not configured.'), { statusCode: 503 });
    const result = await this.pool.query('SELECT * FROM push_subscriptions WHERE id=$1 AND user_id=$2', [id, userId]);
    const row = result.rows[0];
    if (!row) throw Object.assign(new Error('Push device not found.'), { statusCode: 404 });
    try {
      await this.sender.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(safePushPayload({ id: `test-${id}`, event_type: 'test', severity: 'info' }, { test: true })), { TTL: 60, urgency: 'normal' });
      await this.pool.query('UPDATE push_subscriptions SET last_success_at=NOW(),failure_count=0 WHERE id=$1', [id]);
      return { sent: true };
    } catch (err) {
      if ([404, 410].includes(Number(err.statusCode))) {
        await this.pool.query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2', [id, userId]);
        return { sent: false, removed: true };
      }
      await this.pool.query('UPDATE push_subscriptions SET failure_count=failure_count+1 WHERE id=$1', [id]).catch(() => {});
      throw Object.assign(new Error('Test push could not be delivered.'), { statusCode: 502 });
    }
  }
}

module.exports = {
  EVENT_TYPES, WebPushService, deliverPushSubscriptions, isQuietHours, normalizePreferences,
  safePushPayload, shouldDeliverSubscription, validateBrowserSubscription
};
