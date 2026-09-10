'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const {
  NotificationService,
  MemoryNotificationRepository,
  PostgresNotificationRepository
} = require('../notifications');

function rule(overrides = {}) {
  return {
    event_type: 'low_tps', enabled: true, severity: 'warning', threshold: { tps: 15 },
    cooldown_seconds: 300, delivery_channels: ['site'], last_triggered_at: null, ...overrides
  };
}

async function verifyFarmAccountIsolation(repository) {
  const deliveries = [];
  const createService = () => new NotificationService({
    repository,
    discordSender: async (notification, options) => deliveries.push({ ...notification, ...options })
  });
  let service = createService();
  const key = 'account-isolation-test';
  const pearlId = '72280407-99d8-4695-b69c-9bd4c5ee4ca1';
  const obbyId = '11111111-1111-4111-8111-111111111111';
  const failure = (accountId, seconds = 180) => service.report('farm_stalled', {
    key, title: 'Farm stalled', message: 'Still retrying', metadata: { accountId, seconds }
  });
  const recovery = accountId => service.report('farm_stalled', {
    key, resolved: true, title: 'Farm recovered', message: 'Cycle completed', metadata: { accountId }
  });
  const [pearl, obby, primary] = await Promise.all([
    failure(pearlId), failure(obbyId), failure(null)
  ]);
  assert.equal(new Set([pearl, obby, primary].map(result => result.notification.id)).size, 3,
    'each account, including the legacy primary, must own a separate active alert');
  assert.equal(deliveries.length, 3);
  const obbyRecovery = await recovery(obbyId);
  assert.equal(String(obbyRecovery.notification.metadata.resolvedNotificationId), String(obby.notification.id));
  assert.ok(await repository.getActive('farm_stalled', key, pearlId), 'Obby recovery must leave Pearl stalled');
  assert.ok(await repository.getActive('farm_stalled', key), 'Obby recovery must leave the primary stalled');

  await Promise.all([failure(pearlId), failure(pearlId), failure(null)]);
  assert.equal(deliveries.length, 4, 'other farms recovering must not cause repeated stall delivery');
  service = createService();
  const startupFailure = await failure(pearlId, 0);
  assert.equal(startupFailure.reason, 'below_threshold');
  assert.ok(await repository.getActive('farm_stalled', key, pearlId), 'a reset timer after redeploy must not resolve the persisted alert');
  await failure(pearlId);
  assert.equal(deliveries.length, 4, 'redeploy must preserve persisted alert deduplication and cooldown');

  await recovery(null);
  assert.ok(await repository.getActive('farm_stalled', key, pearlId), 'primary recovery must leave Pearl stalled');
  await recovery(pearlId);
  const repeatedRecovery = await recovery(pearlId);
  assert.equal(repeatedRecovery.reason, 'not_active');
  assert.equal(deliveries.length, 6, 'each farm must deliver exactly one recovery for its own alert');
}

async function run() {
  const repository = new MemoryNotificationRepository([rule()]);
  const service = new NotificationService({ repository });

  const first = await service.report('low_tps', {
    key: 'minecraft', title: 'Low TPS', message: 'TPS 10', metadata: { tps: 10 }
  });
  assert.equal(first.notification.severity, 'warning', 'severity must come from the rule');
  assert.equal(repository.notifications.length, 1);
  assert.equal(repository.deliveries.length, 1);

  const duplicate = await service.report('low_tps', {
    key: 'minecraft', title: 'Low TPS', message: 'TPS 9', metadata: { tps: 9 }
  });
  assert.equal(duplicate.deduplicated, true, 'same active issue must be deduplicated');
  assert.equal(duplicate.delivered, false, 'cooldown must suppress repeated delivery');
  assert.equal(repository.notifications.length, 1);
  assert.equal(repository.notifications[0].occurrence_count, 2);

  repository.rules.get('low_tps').last_triggered_at = new Date(Date.now() - 301_000);
  const afterCooldown = await service.report('low_tps', {
    key: 'minecraft', title: 'Low TPS', message: 'TPS 8', metadata: { tps: 8 }
  });
  assert.equal(afterCooldown.delivered, true, 'delivery must resume after cooldown');
  assert.equal(repository.deliveries.length, 2);

  const recovered = await service.report('low_tps', {
    key: 'minecraft', title: 'TPS restored', message: 'TPS 20', metadata: { tps: 20 }
  });
  assert.equal(recovered.resolved, true, 'a recovered metric must resolve the active issue');
  assert.equal(repository.notifications[0].status, 'resolved');
  assert.equal(repository.notifications[1].status, 'resolved', 'recovery must create a separate resolved notification');
  assert.equal(repository.notifications[1].severity, 'info');

  const farmRepository = new MemoryNotificationRepository([rule({
    event_type: 'farm_stalled', severity: 'critical', threshold: { seconds: 120 }, cooldown_seconds: 600
  })]);
  const farmService = new NotificationService({ repository: farmRepository });
  const shortFailure = await farmService.report('farm_stalled', {
    key: 'obsidian-farm', title: 'Farm stalled', message: 'Retrying', metadata: { seconds: 10 }
  });
  assert.equal(shortFailure.skipped, true, 'short farm failures must not become alerts or annotations');
  assert.equal(farmRepository.notifications.length, 0);
  const stalled = await farmService.report('farm_stalled', {
    key: 'obsidian-farm', title: 'Farm stalled', message: 'Still retrying', metadata: { seconds: 120 }
  });
  assert.equal(stalled.deduplicated, false, 'threshold crossing must create one stall transition');
  const stalledAgain = await farmService.report('farm_stalled', {
    key: 'obsidian-farm', title: 'Farm stalled', message: 'Still retrying', metadata: { seconds: 180 }
  });
  assert.equal(stalledAgain.deduplicated, true, 'continued stalls must not create new transitions');
  await farmService.report('farm_stalled', {
    key: 'obsidian-farm', message: 'Retrying after redeploy', metadata: { seconds: 0 }
  });
  assert.equal(farmRepository.notifications[0].status, 'active', 'resetting the failure timer must not imply recovery');
  assert.equal(farmRepository.notifications.length, 1, 'a short failure must not create a recovery notification');
  const farmRecovered = await farmService.report('farm_stalled', {
    key: 'obsidian-farm', resolved: true, title: 'Farm resumed', message: 'Cycle completed'
  });
  assert.equal(farmRecovered.resolved, true, 'a real active stall must create one recovery transition');

  await verifyFarmAccountIsolation(new MemoryNotificationRepository([rule({
    event_type: 'farm_stalled', threshold: { seconds: 120 }, cooldown_seconds: 600,
    delivery_channels: ['discord', 'site']
  })]));

  const migrationName = '049_notification_account_scope.sql';
  const migration = fs.readFileSync(path.join(__dirname, '../database/migrations', migrationName), 'utf8');
  assert.equal(migration, fs.readFileSync(path.join(__dirname, '../site/migrations', migrationName), 'utf8'));
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../database/migrations/001_notification_center.sql'), 'utf8'));
    const persistedRepository = new PostgresNotificationRepository(db);
    const legacy = await persistedRepository.createNotification({
      eventType: 'farm_stalled', dedupKey: 'obsidian-farm', severity: 'critical', status: 'active',
      title: 'PearlMagnate — Obsidian farm stalled', message: 'Server kept obsidian',
      metadata: { accountId: '72280407-99d8-4695-b69c-9bd4c5ee4ca1' }
    });
    await persistedRepository.addDelivery(legacy.id, 'discord', 'sent');
    const before = await db.query('SELECT * FROM notifications');
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM notifications')).rows, before.rows,
      'migration must preserve persisted alerts without creating or resolving notifications');
    assert.equal((await db.query('SELECT * FROM notification_deliveries')).rows.length, 1);
    assert.equal(await persistedRepository.getActive('farm_stalled', 'obsidian-farm'), null,
      'legacy managed alerts must no longer match the primary farm');
    await assert.rejects(() => persistedRepository.createNotification({
      eventType: 'farm_stalled', dedupKey: 'obsidian-farm', severity: 'critical', status: 'active',
      title: 'Duplicate', message: 'Duplicate', metadata: legacy.metadata
    }), /duplicate key/, 'the database must still prevent duplicate active alerts within one account');
    await verifyFarmAccountIsolation(persistedRepository);
  } finally {
    await db.close();
  }

  let pushCalls = 0;
  const pushRepository = new MemoryNotificationRepository([rule()]);
  const pushService = new NotificationService({
    repository: pushRepository,
    pushSender: async () => { pushCalls += 1; return { sent: 1, failed: 0 }; }
  });
  await pushService.report('low_tps', { key: 'push', metadata: { tps: 10 } });
  await pushService.report('low_tps', { key: 'push', metadata: { tps: 9 } });
  assert.equal(pushCalls, 1, 'deduplication within cooldown must suppress repeated push delivery');

  const accountId = '11111111-1111-4111-8111-111111111111';
  const systemLogEntries = [];
  const systemLogService = new NotificationService({
    repository: new MemoryNotificationRepository([rule({ delivery_channels: ['system_log'] })]),
    systemLogger: async entry => { systemLogEntries.push(entry); return true; }
  });
  await systemLogService.report('low_tps', {
    key: 'managed-bot',
    metadata: { tps: 10, accountId, debugLogId: '4aa70a35-a073-477a-975b-9d02e9032e0a' }
  });
  assert.equal(systemLogEntries[0]?.accountId, accountId, 'notification system logs must retain the Minecraft account scope');
  assert.equal(
    systemLogEntries[0]?.details?.debugLogId,
    '4aa70a35-a073-477a-975b-9d02e9032e0a',
    'notification system logs must expose the exact Obsidian debug record ID'
  );

  const postgresQueries = [];
  const postgresRepository = new PostgresNotificationRepository({
    async query(sql, params) {
      postgresQueries.push({ sql, params });
      if (sql.includes('INSERT INTO notifications')) {
        return {
          rows: [{
            id: 1,
            event_type: 'command_failed',
            dedup_key: 'command-1',
            severity: 'warning',
            status: 'resolved',
            title: 'Command failed',
            message: 'Failure',
            metadata: {},
            created_at: new Date()
          }]
        };
      }
      return { rows: [] };
    }
  });
  await postgresRepository.createNotification({
    eventType: 'command_failed',
    dedupKey: 'command-1',
    severity: 'warning',
    status: 'resolved',
    title: 'Command failed',
    message: 'Failure',
    metadata: {}
  });
  await postgresRepository.addDelivery(1, 'site', 'sent');
  assert.match(
    postgresQueries[0].sql,
    /\$4::varchar[\s\S]*CASE WHEN \$4::varchar='resolved'/,
    'notification status parameters must use one explicit PostgreSQL type'
  );
  assert.match(
    postgresQueries.at(-1).sql,
    /\$3::varchar[\s\S]*CASE WHEN \$3::varchar='sent'/,
    'delivery status parameters must use one explicit PostgreSQL type'
  );

  console.log('NotificationService tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
