'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { BotContext } = require('../site/accounts/bot-context');
const { createModulesForBot } = require('../site/accounts/module-registry');
const { MinecraftBotRuntime } = require('../site/accounts/minecraft-bot-runtime');

const SECONDARY_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_ID = '00000000-0000-4000-8000-000000000003';

function account(id, username) {
  return { id, username, displayName:username, host:'example.test', port:25565, authType:'offline', isDefault:false };
}

function farmBot(username, { online = true } = {}) {
  const bot = new EventEmitter();
  bot.username = username;
  bot.entity = online ? { position:{ x:0, y:64, z:0, distanceTo:() => 100 } } : null;
  bot.inventory = { items:() => [], slots:[] };
  bot.entities = {};
  bot.food = 20;
  bot.clearControlStates = () => {};
  bot.findBlocks = () => [];
  bot.blockAt = () => null;
  bot.quit = () => {};
  bot.loadPlugin = () => {
    bot.pluginLoads = (bot.pluginLoads || 0) + 1;
    bot.pathfinder = { setGoal() {}, stop() {} };
  };
  return bot;
}

function nextTurn() { return new Promise(resolve => setImmediate(resolve)); }

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
    const secondary = new BotContext({ account:account(SECONDARY_ID, 'bdiev_') });
    secondary.modules = createModulesForBot(secondary, { dataRoot });
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
    const started = secondary.modules.obsidianFarm.start();
    assert.equal(started.enabled, true);
    assert.equal(started.desiredEnabled, true);
    assert.equal(started.accountId, SECONDARY_ID);
    await nextTurn();
    secondary.modules.obsidianFarm.suspend();

    const expectedDebugEvents = ['farm_started', 'cycle_started', 'cycle_action_start'];
    const debugLines = await readDebugEvents(
      path.join(dataRoot, SECONDARY_ID, 'obsidian-farm-debug.log'),
      expectedDebugEvents
    );
    for (const event of expectedDebugEvents) {
      const record = debugLines.find(line => line.event === event);
      assert.ok(record, `${event} is written to the per-account debug log`);
      assert.equal(record.botId, SECONDARY_ID);
      assert.equal(record.username, 'bdiev_');
    }

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
          start() { throw new Error('start must not be reached'); },
          getStatus() { return { enabled:false, desiredEnabled:false, config:{ x:1, y:2, z:3 } }; }
        },
        killAura:{ attachBot() {}, setEnabled(value) { if (!value) auraStops += 1; }, getStatus() { return { enabled:true }; } },
        follow:{ stop() { followStops += 1; }, getStatus() { return { enabled:true }; } }
      })
    });
    failingRuntime.bot = farmBot('PreflightAlt');
    failingRuntime.status = 'connected';
    assert.throws(() => failingRuntime.setObsidianEnabled(true), /Pathfinder plugin is not loaded/i);
    assert.equal(failingRuntime.task, 'idle');
    assert.equal(auraStops, 0, 'failed farm preflight does not stop Kill Aura');
    assert.equal(followStops, 0, 'failed farm preflight does not stop Follow');
    assert.match(failingRuntime.getStatus().lastError, /Pathfinder plugin is not loaded/i);

    const reconnectBots = [];
    const reconnectRuntime = new MinecraftBotRuntime({
      account:account(SECONDARY_ID, 'bdiev_'),
      moduleOptions:{ dataRoot },
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
    reconnectRuntime.setObsidianEnabled(true);
    assert.equal(reconnectRuntime.task, 'obsidian');
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().desiredEnabled, true);

    await reconnectRuntime.restart();
    assert.equal(reconnectBots.length, 2);
    assert.ok(reconnectBots[1].pathfinder, 'a replacement bot receives Pathfinder before spawn');
    reconnectBots[1].emit('spawn');
    await nextTurn();
    assert.equal(reconnectRuntime.obsidianFarm.getStatus().enabled, true, 'desired farm state resumes after reconnect');
    assert.equal(reconnectRuntime.task, 'obsidian');
    assert.equal(reconnectRuntime.getStatus().lastError, null);
    await reconnectRuntime.destroy();

    const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
    assert.match(botSource, /SET status='failed',error=\$2/, 'managed command failures persist their reason');
    console.log('Secondary Obsidian runtime tests passed.');
  } finally {
    fs.rmSync(dataRoot, { recursive:true, force:true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
