'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Vec3 = require('vec3');
const { RaycastIterator } = require('prismarine-world').iterators;
const { BotContext } = require('../site/accounts/bot-context');
const { createModulesForBot } = require('../site/accounts/module-registry');
const { MinecraftBotRuntime } = require('../site/accounts/minecraft-bot-runtime');
const { createProtectionLeverController } = require('../features/obsidianFarm/protection-lever');

const SECONDARY_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_ID = '00000000-0000-4000-8000-000000000003';

function account(id, username, isDefault = false) {
  return { id, username, displayName:username, host:'example.test', port:25565, authType:'offline', isDefault };
}

function farmBot(username, { online = true } = {}) {
  const bot = new EventEmitter();
  bot.username = username;
  const botPosition = new Vec3(0, 64, 0);
  const leverPosition = new Vec3(1, 64, 0);
  const leverShapeCenter = leverPosition.offset(0.5, 0.5, 0.8125);
  const barrelPosition = new Vec3(-1, 64, 0);
  const inventoryItems = [
    { name:'diamond_pickaxe', type:100, count:1, slot:9, maxDurability:1561, durabilityUsed:0 },
    { name:'bread', type:101, count:8, slot:10 },
    { name:'bucket', type:102, count:1, slot:11 }
  ];
  let leverPowered = true;
  bot.entity = online ? { position:botPosition, effects:{} } : null;
  bot.inventory = { items:() => inventoryItems, slots:[], inventoryStart:9, hotbarStart:36 };
  bot.registry = { blocksByName:{ barrel:{ id:1 }, lava_cauldron:{ id:2 } }, itemsByName:{} };
  bot.entities = {};
  bot.food = 20;
  bot.clearControlStates = () => {};
  bot.equip = async item => { bot.heldItem = item; };
  bot.unequip = async () => { bot.heldItem = null; };
  bot.lookAt = async target => { bot.lastLookAt = target; bot.lookActions = (bot.lookActions || 0) + 1; };
  bot.findBlocks = options => options?.matching === 1 ? [barrelPosition] : [];
  bot.blockAt = position => {
    if (position?.equals?.(leverPosition)) return {
      name:'lever', position:leverPosition,
      shapes:[],
      getProperties:() => ({ face:'wall', facing:'north', powered:leverPowered })
    };
    if (position?.equals?.(barrelPosition)) return { name:'barrel', type:1, position:barrelPosition };
    return null;
  };
  bot.blockAtCursor = (maxDistance = 4.75, matcher = null) => {
    const leverAim = bot.lastLookAt?.minus?.(leverPosition);
    const aimsInsideLeverOutline = leverAim &&
      leverAim.x >= 5 / 16 && leverAim.x <= 11 / 16 &&
      leverAim.y >= 4 / 16 && leverAim.y <= 12 / 16 &&
      leverAim.z >= 10 / 16 && leverAim.z <= 1;
    if (aimsInsideLeverOutline) {
      const lever = bot.blockAt(leverPosition);
      if (matcher) {
        const eye = bot.entity.position.offset(0, 1.62, 0);
        const direction = bot.lastLookAt.minus(eye).normalize();
        const iterator = new RaycastIterator(eye, direction, maxDistance);
        if (matcher(lever, iterator)) return lever;
      }
      return { name:'stone_bricks', position:leverPosition.offset(0, 0, 1) };
    }
    // A wall lever's block center may be behind its small visible shape.
    if (bot.lastLookAt?.equals?.(leverPosition.offset(0.5, 0.5, 0.5))) {
      return { name:'smooth_stone', position:leverPosition.offset(0, 0, 1) };
    }
    if (bot.lastLookAt?.equals?.(barrelPosition.offset(0.5, 0.5, 0.5))) {
      const barrel = bot.blockAt(barrelPosition);
      barrel.face = 5;
      barrel.intersect = barrelPosition.offset(1, 0.4, 0.6);
      return barrel;
    }
    return null;
  };
  bot.activateBlock = async (block, direction, cursorPos) => {
    if (block?.name === 'lever') {
      leverPowered = !leverPowered;
      bot.leverActions = (bot.leverActions || 0) + 1;
      bot.leverInteraction = { direction, cursorPos };
    } else if (block?.name === 'barrel') {
      bot.barrelOpens = (bot.barrelOpens || 0) + 1;
      bot.barrelInteraction = { direction, cursorPos };
      bot.emit('windowOpen', { containerItems:() => [], close() {} });
    }
  };
  bot.quit = () => {};
  bot.loadPlugin = () => {
    bot.pluginLoads = (bot.pluginLoads || 0) + 1;
    bot.pathfinder = { setGoal() {}, stop() {} };
  };
  return bot;
}

function nextTurn() { return new Promise(resolve => setImmediate(resolve)); }

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return predicate();
}

async function readDebugEvents(file, expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 25));
    let records = [];
    try {
      records = fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
        try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
      });
    } catch {}
    if (expected.every(event => records.some(record => record.event === event))) return records;
  }
  return [];
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wheat-secondary-farm-'));
  try {
    const systemLogs = [];
    const secondary = new BotContext({ account:account(SECONDARY_ID, 'bdiev_') });
    secondary.modules = createModulesForBot(secondary, {
      dataRoot,
      obsidianDebugLoggingEnabled:true,
      systemLogger: entry => { systemLogs.push(entry); }
    });
    const bot = farmBot('bdiev_');
    secondary.attachBot(bot);
    assert.ok(bot.pathfinder, 'Pathfinder is installed when a secondary bot is attached');
    assert.equal(bot.pluginLoads, 1, 'Pathfinder is installed exactly once per fresh bot instance');
    assert.throws(
      () => secondary.modules.obsidianFarm.loadPlugin({ loadPlugin() { throw new Error('broken plugin'); } }),
      /cannot initialize Pathfinder: broken plugin/i,
      'Pathfinder initialization errors are not swallowed'
    );

    const queuedContext = new BotContext({ account:account(OTHER_ID, 'QueuedAlt') });
    queuedContext.modules = createModulesForBot(queuedContext, { dataRoot });
    let queuedPlugin = null;
    const queuedBot = farmBot('QueuedAlt');
    delete queuedBot.pathfinder;
    queuedBot.loadPlugin = plugin => { queuedPlugin = plugin; };
    queuedBot.hasPlugin = plugin => queuedPlugin === plugin;
    queuedContext.attachBot(queuedBot);
    assert.ok(queuedPlugin, 'Pathfinder may be queued before Mineflayer allows plugin injection');
    assert.equal(queuedBot.pathfinder, undefined, 'queued Pathfinder is not mistaken for a failed initialization');
    queuedBot.pathfinder = { setGoal() {}, stop() {} };
    await queuedContext.notifySpawn();

    secondary.modules.obsidianFarm.configure(3404567, 39, 674998, { maxCauldronDist:5 });
    const storedConfig = JSON.parse(fs.readFileSync(path.join(dataRoot, SECONDARY_ID, 'obsidian-farm.json'), 'utf8'));
    assert.deepEqual(storedConfig, { x:3404567, y:39, z:674998, maxCauldronDist:5 });

    const configuredTarget = new Vec3(3404567, 39, 674998);
    const placementFace = new Vec3(-1, 0, 0);
    const placementAnchor = {
      name:'smooth_stone', type:3, boundingBox:'block',
      position:configuredTarget.offset(1, 0, 0)
    };
    const originalBlockAt = bot.blockAt;
    const originalBlockAtCursor = bot.blockAtCursor;
    const originalActivateBlock = bot.activateBlock;
    const originalActivateItem = bot.activateItem;
    const originalBotPosition = bot.entity.position;
    const originalClient = bot._client;
    const originalSupportFeature = bot.supportFeature;
    const originalSwingArm = bot.swingArm;

    const rotatedAnchor = {
      name:'smooth_stone', type:3, boundingBox:'block',
      position:configuredTarget.offset(0, 0, 1)
    };
    bot.entity.position = configuredTarget.offset(0, 0, -2);
    bot.blockAt = position => position?.equals?.(rotatedAnchor.position) ? rotatedAnchor : null;
    bot.blockAtCursor = () => ({ ...rotatedAnchor, face:2 });
    const selectedRotatedAnchor = await secondary.modules.obsidianFarm.__test.findLavaPlacementAnchor(
      bot,
      configuredTarget,
      { test:'rotated_secondary_farm' }
    );
    assert.equal(selectedRotatedAnchor.label, 'south', 'rotated farm discovers its south-side placement anchor');
    assert.ok(selectedRotatedAnchor.face.equals(new Vec3(0, 0, -1)), 'rotated anchor face still points exactly into target');
    assert.ok(
      bot.lastLookAt.equals(rotatedAnchor.position.offset(0.5, 0.5, 0)),
      'secondary turns away from the lever and barrel toward the rotated placement face'
    );

    bot.entity.position = originalBotPosition;
    let placementInteraction = null;
    bot.heldItem = { name:'lava_bucket' };
    bot.blockAt = position => position?.equals?.(placementAnchor.position)
      ? placementAnchor
      : originalBlockAt(position);
    bot.blockAtCursor = () => ({ ...placementAnchor, face:4 });
    bot.activateBlock = async (block, direction, cursorPos) => {
      placementInteraction = { block, direction, cursorPos };
    };
    let secondaryItemActivations = 0;
    let secondaryActivationAim = null;
    bot.activateItem = () => {
      secondaryItemActivations += 1;
      secondaryActivationAim = bot.lastLookAt.clone();
    };
    const placementPackets = [];
    bot._client = { write:(name, data) => { placementPackets.push({ name, data }); } };
    bot.supportFeature = feature => feature === 'blockPlaceHasInsideBlock';
    bot.swingArm = () => { bot.swingActions = (bot.swingActions || 0) + 1; };
    await secondary.modules.obsidianFarm.__test.useBucketOnFace(
      bot,
      placementAnchor,
      placementFace,
      configuredTarget
    );
    assert.equal(secondaryItemActivations, 1, 'Secondary lava placement uses the server-compatible use-item packet');
    assert.ok(
      secondaryActivationAim.equals(placementAnchor.position.offset(0, 0.5, 0.5)),
      'Secondary use-item action preserves the dynamically selected anchor face aim'
    );
    assert.equal(placementInteraction, null, 'Secondary lava placement does not let Mineflayer reset the verified aim');
    assert.equal(placementPackets.length, 0, 'Secondary lava placement does not send the rejected handcrafted block packet');
    await secondary.modules.obsidianFarm.__test.useBucketOnFace(
      bot,
      placementAnchor,
      placementFace,
      configuredTarget
    );
    assert.equal(secondaryItemActivations, 2, 'Repeated placements still send exactly one use-item action each');

    const retryBot = farmBot('LeverRetryAlt');
    const retryActivateBlock = retryBot.activateBlock;
    const retryAimPoints = [];
    retryBot.activateBlock = async (...args) => {
      retryAimPoints.push(retryBot.lastLookAt.clone());
      if (retryAimPoints.length > 1) await retryActivateBlock(...args);
    };
    const retryController = createProtectionLeverController({ preciseInteraction:true });
    assert.equal(await retryController.setState(retryBot, false), true);
    assert.equal(retryAimPoints.length, 2, 'Lever retry succeeds after an unconfirmed first click');
    assert.ok(!retryAimPoints[0].equals(retryAimPoints[1]), 'Lever retries use different safe points inside its outline');

    const primary = new BotContext({ account:account('00000000-0000-4000-8000-000000000001', 'WheatMagnate', true) });
    primary.modules = createModulesForBot(primary, { dataRoot });
    primary.modules.obsidianFarm.configure(3404567, 39, 674998, { maxCauldronDist:5 });
    let primaryItemActivations = 0;
    placementInteraction = null;
    bot.activateItem = () => { primaryItemActivations += 1; };
    await primary.modules.obsidianFarm.__test.useBucketOnFace(
      bot,
      placementAnchor,
      placementFace,
      configuredTarget
    );
    assert.equal(primaryItemActivations, 1, 'Primary lava placement uses the server-compatible use-item packet');
    assert.equal(placementInteraction, null, 'Primary lava placement does not also send the managed-account packet');

    const primaryLeverBot = farmBot('WheatMagnate');
    await primary.modules.obsidianFarm.setProtectionLeverState(false, primaryLeverBot);
    assert.equal(primaryLeverBot.leverActions, 1, 'Primary startup switches its protection lever OFF');
    assert.deepEqual(
      primaryLeverBot.leverInteraction.direction,
      new Vec3(-1, 0, 0),
      'Primary uses the same visible ray-traced lever face as secondary farms'
    );
    const primaryLeverCursor = primaryLeverBot.leverInteraction.cursorPos;
    assert.ok(
      primaryLeverCursor.x >= 5 / 16 - 0.0001 && primaryLeverCursor.x <= 11 / 16 + 0.0001 &&
      primaryLeverCursor.y >= 4 / 16 - 0.0001 && primaryLeverCursor.y <= 12 / 16 + 0.0001 &&
      primaryLeverCursor.z >= 10 / 16 - 0.0001 && primaryLeverCursor.z <= 1 + 0.0001,
      'Primary preserves a visible lever hit point inside the rotated wall outline'
    );

    bot.blockAt = originalBlockAt;
    bot.blockAtCursor = originalBlockAtCursor;
    bot.activateBlock = originalActivateBlock;
    bot.activateItem = originalActivateItem;
    bot._client = originalClient;
    bot.supportFeature = originalSupportFeature;
    bot.swingArm = originalSwingArm;
    bot.heldItem = null;

    let releaseWorldInteraction;
    const occupiedInteraction = secondary.modules.obsidianFarm.__test.withWorldInteractionLock(
      () => new Promise(resolve => { releaseWorldInteraction = resolve; })
    );
    await nextTurn();
    const queuedLeverChange = secondary.modules.obsidianFarm.setProtectionLeverState(false, bot);
    await nextTurn();
    assert.equal(bot.leverActions || 0, 0, 'Protection lever waits while another farm interaction is active');
    releaseWorldInteraction();
    await occupiedInteraction;
    await queuedLeverChange;
    assert.equal(bot.leverActions, 1, 'Protection lever runs after the active farm interaction finishes');

    secondary.modules.obsidianFarm.configureRuntime({ onSuppliesChanged:() => undefined });
    const preparedSupplies = await secondary.modules.obsidianFarm.prepareStart(bot);
    assert.ok(preparedSupplies.barrel, 'Mandatory preflight accepts a synchronous supply callback');
    assert.equal(bot.barrelOpens, 1, 'Mandatory preflight opens the supply barrel');
    const started = secondary.modules.obsidianFarm.start();
    assert.equal(started.enabled, true);
    assert.equal(started.desiredEnabled, true);
    assert.equal(started.accountId, SECONDARY_ID);
    await nextTurn();
    secondary.modules.obsidianFarm.suspend();

    const expectedDebugEvents = ['farm_started', 'cycle_started', 'cycle_action_start', 'farm_click_trace'];
    const debugLines = await readDebugEvents(
      secondary.modules.obsidianFarm.getDebugLogFile(),
      expectedDebugEvents
    );
    for (const event of expectedDebugEvents) {
      const record = debugLines.find(line => line.event === event);
      assert.ok(record, `${event} is written to the per-account debug log`);
      assert.equal(record.botId, SECONDARY_ID);
      assert.equal(record.username, 'bdiev_');
    }
    const placementTrace = debugLines.find(line =>
      line.event === 'farm_click_trace' &&
      line.action === 'lava_placement' &&
      line.stage === 'sent'
    );
    assert.equal(placementTrace?.method, 'activate_item', 'Temporary click trace records the server-compatible secondary lava action');
    const clickSystemLog = systemLogs.find(entry =>
      entry.category === 'obsidian_click' &&
      entry.details?.event === 'farm_click_trace' &&
      entry.details?.action === 'lava_placement' &&
      entry.details?.stage === 'sent'
    );
    assert.equal(clickSystemLog, undefined, 'Successful packet traces are not duplicated in PostgreSQL');

    secondary.modules.obsidianFarm.resetConfig();
    assert.throws(() => secondary.modules.obsidianFarm.start(), /coordinates are not configured/i);
    secondary.modules.obsidianFarm.configure(1, 2, 3, { maxCauldronDist:4 });
    bot.entity = null;
    assert.throws(() => secondary.modules.obsidianFarm.start(), /offline/i);
    bot.entity = { position:{ x:0, y:64, z:0, distanceTo:() => 100 } };
    delete bot.pathfinder;
    assert.throws(() => secondary.modules.obsidianFarm.start(), /Pathfinder plugin is not loaded/i);
    assert.equal(secondary.modules.obsidianFarm.getStatus().enabled, false);

    const other = new BotContext({ account:account(OTHER_ID, 'OtherAlt') });
    other.modules = createModulesForBot(other, { dataRoot });
    other.modules.obsidianFarm.configure(-9, 70, 12, { maxCauldronDist:6 });
    assert.deepEqual(secondary.modules.obsidianFarm.getStatus().config, { x:1, y:2, z:3, maxCauldronDist:4 });
    assert.deepEqual(other.modules.obsidianFarm.getStatus().config, { x:-9, y:70, z:12, maxCauldronDist:6 });

    let auraStops = 0;
    let followStops = 0;
    const failingRuntime = new MinecraftBotRuntime({
      account:account(OTHER_ID, 'PreflightAlt'),
      botFactory:() => farmBot('PreflightAlt'),
      moduleFactory:() => ({
        obsidianFarm:{
          attachBot() {}, onSpawn() {}, suspend() {},
          validateStart() { throw new Error('Obsidian Farm cannot start: Pathfinder plugin is not loaded.'); },
          setProtectionLeverState() {}, prepareStart() {},
          start() { throw new Error('start must not be reached'); },
          getStatus() { return { enabled:false, desiredEnabled:false, config:{ x:1, y:2, z:3 } }; }
        },
        killAura:{ attachBot() {}, setEnabled(value) { if (!value) auraStops += 1; }, getStatus() { return { enabled:true }; } },
        follow:{ stop() { followStops += 1; }, getStatus() { return { enabled:true }; } }
      })
    });
    failingRuntime.bot = farmBot('PreflightAlt');
    failingRuntime.status = 'connected';
    await assert.rejects(failingRuntime.setObsidianEnabled(true), /Pathfinder plugin is not loaded/i);

    const originalPreflightError = new Error('Supply barrel preflight failed after opening.');
    const recoveryRuntime = new MinecraftBotRuntime({
      account:account(OTHER_ID, 'RecoveryAlt'),
      botFactory:() => farmBot('RecoveryAlt'),
      moduleFactory:() => ({
        obsidianFarm:{
          attachBot() {}, onSpawn() {}, suspend() {},
          validateStart() { return { accountId:OTHER_ID }; },
          setProtectionLeverState() {},
          prepareStart() { throw originalPreflightError; },
          getStatus() { return { enabled:false, desiredEnabled:false, config:{ x:1, y:2, z:3 } }; }
        },
        killAura:{ attachBot() {}, setEnabled() {}, getStatus() { return { enabled:false }; } },
        follow:{ stop() {}, getStatus() { return { enabled:false }; } }
      })
    });
    recoveryRuntime.bot = farmBot('RecoveryAlt');
    recoveryRuntime.status = 'connected';
    await assert.rejects(
      recoveryRuntime.setObsidianEnabled(true),
      error => error === originalPreflightError,
      'Synchronous lever recovery must preserve the original startup failure'
    );
    assert.equal(failingRuntime.task, 'idle');
    assert.equal(auraStops, 0, 'failed farm preflight does not stop Kill Aura');
    assert.equal(followStops, 0, 'failed farm preflight does not stop Follow');
    assert.match(failingRuntime.getStatus().lastError, /Pathfinder plugin is not loaded/i);

    const reconnectBots = [];
    let runtimeNow = new Date('2026-08-14T05:00:00.000Z'); // 08:00 in Kyiv
    const reconnectRuntime = new MinecraftBotRuntime({
      account:account(SECONDARY_ID, 'bdiev_'),
      moduleOptions:{ dataRoot },
      obsidianResumeRetryMs:50,
      now:() => runtimeNow,
      botFactory:() => {
        const created = farmBot('bdiev_');
        reconnectBots.push(created);
        return created;
      }
    });
    await reconnectRuntime.start();
    reconnectBots[0].emit('spawn');
    await nextTurn();
    reconnectRuntime.configureObsidian(3404567, 39, 674998, { maxCauldronDist:5 });
    await reconnectRuntime.setObsidianEnabled(true);
    assert.equal(reconnectRuntime.task, 'obsidian');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, true);
    assert.equal(reconnectBots[0].leverActions, 1, 'secondary startup switches its protection lever OFF');
    assert.deepEqual(reconnectBots[0].leverInteraction.direction, new Vec3(-1, 0, 0), 'wall lever uses its visible ray-traced face');
    const leverCursor = reconnectBots[0].leverInteraction.cursorPos;
    const outlineTolerance = 0.0001;
    assert.ok(leverCursor.x >= 5 / 16 - outlineTolerance && leverCursor.x <= 11 / 16 + outlineTolerance);
    assert.ok(leverCursor.y >= 4 / 16 - outlineTolerance && leverCursor.y <= 12 / 16 + outlineTolerance);
    assert.ok(leverCursor.z >= 10 / 16 - outlineTolerance && leverCursor.z <= 1 + outlineTolerance);
    assert.equal(reconnectBots[0].barrelOpens, 1, 'secondary startup always opens its supply barrel');
    assert.deepEqual(reconnectBots[0].barrelInteraction.direction, new Vec3(0, 1, 0), 'barrel below the bot is clicked through its top face');
    assert.ok(
      reconnectBots[0].barrelInteraction.cursorPos.distanceTo(new Vec3(0.5, 0.999, 0.5)) < 0.0001,
      'barrel click uses a point on the top surface'
    );
    assert.ok(reconnectBots[0].lookActions >= 2, 'secondary startup turns toward both the lever and the barrel');

    await reconnectRuntime.restart();
    assert.equal(reconnectBots.length, 2);
    assert.ok(reconnectBots[1].pathfinder, 'a replacement bot receives Pathfinder before spawn');
    const restoredBlockAtCursor = reconnectBots[1].blockAtCursor;
    reconnectBots[1].blockAtCursor = () => null;
    reconnectBots[1].emit('spawn');
    await waitFor(() => /line of sight/i.test(reconnectRuntime.getStatus().lastError || ''), 3_000);
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, false, 'a transient reconnect preflight failure leaves the farm waiting');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, true, 'a transient reconnect failure preserves the requested farm state');
    reconnectBots[1].blockAtCursor = restoredBlockAtCursor;
    await waitFor(() => reconnectRuntime.obsidianFarm.getStatus().enabled, 4_000);
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, true, 'desired farm state resumes after reconnect');
    assert.equal(reconnectRuntime.task, 'obsidian');
    assert.equal(reconnectRuntime.getStatus().lastError, null);

    runtimeNow = new Date('2026-08-14T05:59:00.000Z'); // 08:59 in Kyiv
    await reconnectRuntime.runAfkChecks();
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, false, 'secondary farm pauses before the scheduled restart');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, true, 'restart protection preserves Start Farm intent');
    assert.equal(reconnectRuntime.task, 'obsidian', 'secondary keeps waiting on its assigned farm task');
    assert.equal(reconnectBots[1].leverActions, 2, 'secondary switches its protection lever ON before restart');
    await reconnectRuntime.runAfkChecks();
    assert.equal(reconnectBots[1].leverActions, 2, 'restart protection is applied only once per Kyiv calendar day');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, false, 'watchdog does not resume the farm inside the restart window');

    runtimeNow = new Date('2026-08-14T06:05:00.000Z'); // 09:05 in Kyiv, after server reconnect
    await reconnectRuntime.restart();
    assert.equal(reconnectBots.length, 3);
    reconnectBots[2].emit('spawn');
    await waitFor(() => reconnectRuntime.obsidianFarm.getStatus().enabled);
    assert.equal(reconnectBots[2].leverActions, 1, 'reconnected secondary switches protection OFF before resuming');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, true, 'reconnected secondary retains farm intent');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, true, 'reconnected secondary resumes the farm');
    let immediateStopStatus = null;
    reconnectRuntime.once('status', status => { immediateStopStatus = status; });
    const stoppingFarm = reconnectRuntime.setObsidianEnabled(false);
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, false, 'Stop Farm immediately disables reconnect intent');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, false, 'Stop Farm immediately suspends the active loop');
    assert.equal(reconnectRuntime.task, 'idle', 'Stop Farm immediately releases the runtime task');
    assert.equal(immediateStopStatus?.modules?.obsidianFarm?.desiredEnabled, false, 'the stopped state is published before lever protection completes');
    await stoppingFarm;
    await reconnectRuntime.destroy();

    const redeployBots = [];
    const redeployRuntime = new MinecraftBotRuntime({
      account:account(SECONDARY_ID, 'bdiev_'),
      moduleOptions:{
        dataRoot:path.join(dataRoot, 'fresh-redeploy'),
        obsidianState:{
          desiredEnabled:true,
          config:{ x:3404567, y:39, z:674998, maxCauldronDist:5 }
        }
      },
      botFactory:() => {
        const created = farmBot('bdiev_');
        redeployBots.push(created);
        return created;
      }
    });
    assert.equal(redeployRuntime.obsidianFarm.getStatus().desiredEnabled, true, 'database state restores auto-resume on a fresh deploy');
    assert.deepEqual(
      redeployRuntime.obsidianFarm.getStatus().config,
      { x:3404567, y:39, z:674998, maxCauldronDist:5 },
      'database state restores managed farm coordinates on a fresh deploy'
    );
    await redeployRuntime.start();
    redeployBots[0].emit('spawn');
    await waitFor(() => redeployRuntime.obsidianFarm.getStatus().enabled);
    assert.equal(redeployBots[0].leverActions, 1, 'fresh deploy verifies and switches the protection lever OFF');
    assert.equal(redeployBots[0].barrelOpens, 1, 'fresh deploy inspects the supply barrel before resuming');
    assert.equal(redeployRuntime.obsidianFarm.getStatus().enabled, true, 'fresh deploy resumes farming only after preflight');
    await redeployRuntime.destroy();

    const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
    const farmSource = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'obsidianFarm', 'index.js'), 'utf8');
    assert.match(botSource, /SET status='failed',error=\$2/, 'managed command failures persist their reason');
    assert.match(botSource, /primaryProtectionLever\.setState\(bot, powered\)/, 'primary farm uses the shared protection-lever controller');
    assert.match(botSource, /primaryProtectionLever = createProtectionLeverController\(\{[\s\S]*?preciseInteraction: true[\s\S]*?\}\)/, 'legacy primary runtime enables rotated-farm lever interaction');
    assert.match(farmSource, /protectionLeverController\.setState\(bot, powered\)/, 'secondary farms use the same protection-lever controller');
    console.log('Secondary Obsidian runtime tests passed.');
  } finally {
    fs.rmSync(dataRoot, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
