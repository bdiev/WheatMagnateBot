'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BotContext } = require('../site/accounts/bot-context');
const { createModulesForBot } = require('../site/accounts/module-registry');
const { assertModuleAvailable } = require('../site/accounts/module-policy');

function account(id, username, isDefault = false) {
  return { id, username, displayName: username, isDefault };
}

function createFollowStub() {
  let targetUsername = null;
  return {
    start(_bot, username) { targetUsername = username; return { targetUsername:username, targetEntityId:1 }; },
    stop() { targetUsername = null; },
    getStatus() { return { enabled:Boolean(targetUsername), targetUsername }; },
    findPlayerEntity() { return null; }
  };
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wheat-bot-context-'));
  try {
    const primary = new BotContext({ account: account('00000000-0000-4000-8000-000000000001', 'WheatMagnate', true) });
    const secondary = new BotContext({ account: account('00000000-0000-4000-8000-000000000002', 'AltBot1') });
    const primaryOnly = {
      growingChild: () => ({ name: 'growingChild' }),
      whisper: () => ({ name: 'whisper' }),
      globalObservers: () => ({ name: 'globalObservers' })
    };
    primary.modules = createModulesForBot(primary, { dataRoot, primaryFactories: primaryOnly, followFactory:createFollowStub });
    secondary.modules = createModulesForBot(secondary, { dataRoot, primaryFactories: primaryOnly, followFactory:createFollowStub });

    assert.ok(primary.modules.growingChild, 'Growing Child exists for primary');
    assert.ok(primary.modules.whisper, 'Whisper exists for primary');
    assert.ok(primary.modules.globalObservers, 'global observers exist for primary');
    assert.equal(secondary.modules.growingChild, undefined, 'Growing Child is absent for secondary');
    assert.equal(secondary.modules.whisper, undefined, 'Whisper is absent for secondary');
    assert.equal(secondary.modules.globalObservers, undefined, 'global observers are absent for secondary');
    assert.equal(assertModuleAvailable(primary.account, 'growingChild'), true);
    assert.throws(
      () => assertModuleAvailable(secondary.account, 'growingChild'),
      error => error.statusCode === 403 && /primary bot/i.test(error.message),
      'primary-only API policy rejects a secondary account'
    );
    assert.throws(
      () => assertModuleAvailable(null, 'obsidianFarm'),
      error => error.statusCode === 404,
      'unknown account IDs are rejected cleanly'
    );

    primary.modules.obsidianFarm.configure(1, 2, 3, { maxCauldronDist: 4 });
    secondary.modules.obsidianFarm.configure(10, 20, 30, { maxCauldronDist: 6 });
    secondary.modules.obsidianFarm.configure(40, 50, 60, { maxCauldronDist: 5 });
    assert.deepEqual(primary.modules.obsidianFarm.getStatus().config, { x:1, y:2, z:3, maxCauldronDist:4 });
    assert.deepEqual(secondary.modules.obsidianFarm.getStatus().config, { x:40, y:50, z:60, maxCauldronDist:5 });
    const primaryFarmRuntime = primary.modules.obsidianFarm.__test.getIsolationState();
    const secondaryFarmRuntime = secondary.modules.obsidianFarm.__test.getIsolationState();
    assert.notEqual(primaryFarmRuntime.worldInteractionQueue, secondaryFarmRuntime.worldInteractionQueue, 'world locks are isolated');
    assert.notEqual(primaryFarmRuntime.pickaxeBlocksMined, secondaryFarmRuntime.pickaxeBlocksMined, 'farm statistics are isolated');
    assert.notEqual(primaryFarmRuntime.cauldronFailures, secondaryFarmRuntime.cauldronFailures, 'failure memory is isolated');

    const farmBot = username => ({
      username,
      pathfinder: { setGoal() {}, stop() {} },
      clearControlStates() {},
      entity: { position:{ x:0, y:64, z:0, distanceTo:() => 100 } },
      inventory: { items:() => [] },
      findBlocks: () => [],
      blockAt: () => null
    });
    primary.attachBot(farmBot('WheatMagnate'));
    secondary.attachBot(farmBot('AltBot1'));
    primary.modules.obsidianFarm.start();
    secondary.modules.obsidianFarm.start();
    await new Promise(resolve => setTimeout(resolve, 10));
    const runningPrimaryFarm = primary.modules.obsidianFarm.__test.getIsolationState();
    const runningSecondaryFarm = secondary.modules.obsidianFarm.__test.getIsolationState();
    assert.equal(primary.modules.obsidianFarm.getStatus().enabled, true);
    assert.equal(secondary.modules.obsidianFarm.getStatus().enabled, true);
    assert.ok(runningPrimaryFarm.loopHandle, 'primary has its own farm loop');
    assert.ok(runningSecondaryFarm.loopHandle, 'secondary has its own farm loop');
    assert.notEqual(runningPrimaryFarm.loopHandle, runningSecondaryFarm.loopHandle, 'farm loop handles are isolated');
    primary.modules.obsidianFarm.suspend();
    secondary.modules.obsidianFarm.suspend();

    primary.modules.killAura.setTargets(['zombie']);
    secondary.modules.killAura.setTargets(['skeleton']);
    primary.modules.killAura.setEnabled(true);
    assert.equal(primary.modules.killAura.getStatus().enabled, true);
    assert.equal(secondary.modules.killAura.getStatus().enabled, false);
    assert.deepEqual(secondary.modules.killAura.getStatus().targets, ['skeleton']);

    primary.attachBot({ username:'WheatMagnate', entity:{} });
    secondary.attachBot({ username:'AltBot1', entity:{} });
    primary.modules.follow.start('PlayerA', { distance: 2 });
    secondary.modules.follow.start('PlayerB', { distance: 4 });
    assert.equal(primary.modules.follow.getStatus().targetUsername, 'PlayerA');
    assert.equal(secondary.modules.follow.getStatus().targetUsername, 'PlayerB');
    assert.equal(primary.modules.follow.getStatus().distance, 2);
    assert.equal(secondary.modules.follow.getStatus().distance, 4);

    const reloadedPrimary = new BotContext({ account: primary.account });
    const reloadedSecondary = new BotContext({ account: secondary.account });
    reloadedPrimary.modules = createModulesForBot(reloadedPrimary, { dataRoot, followFactory:createFollowStub });
    reloadedSecondary.modules = createModulesForBot(reloadedSecondary, { dataRoot, followFactory:createFollowStub });
    assert.deepEqual(reloadedPrimary.modules.obsidianFarm.getStatus().config, { x:1, y:2, z:3, maxCauldronDist:4 });
    assert.deepEqual(reloadedSecondary.modules.obsidianFarm.getStatus().config, { x:40, y:50, z:60, maxCauldronDist:5 });
    assert.equal(reloadedPrimary.modules.follow.getStatus().desiredEnabled, true);
    assert.equal(reloadedSecondary.modules.follow.getStatus().desiredEnabled, true);

    console.log('BotContext isolation tests passed.');
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
