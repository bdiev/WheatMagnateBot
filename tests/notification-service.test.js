'use strict';

const assert = require('assert');
const { NotificationService, MemoryNotificationRepository } = require('../notifications');

function rule(overrides = {}) {
  return {
    event_type: 'low_tps', enabled: true, severity: 'warning', threshold: { tps: 15 },
    cooldown_seconds: 300, delivery_channels: ['site'], last_triggered_at: null, ...overrides
  };
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
  const farmRecovered = await farmService.report('farm_stalled', {
    key: 'obsidian-farm', resolved: true, title: 'Farm resumed', message: 'Cycle completed'
  });
  assert.equal(farmRecovered.resolved, true, 'a real active stall must create one recovery transition');

  console.log('NotificationService tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
