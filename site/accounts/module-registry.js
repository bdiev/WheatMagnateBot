'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createObsidianFarm } = require('../../features/obsidianFarm');
const { createKillAuraFeature } = require('../../features/killAura');
const { createFollowFeature } = require('../../features/follow');
const { PEARL_LOADER_ROLE } = require('../../features/pearlLoader');

function pearlLoaderOnlyModules() {
  const restricted = feature => {
    throw new Error(`${feature} is disabled for the Pearl Loader account.`);
  };
  const obsidianStatus = () => ({ enabled:false,desiredEnabled:false,running:false,configured:false });
  const killAuraStatus = () => ({ enabled:false,desiredEnabled:false,selectedMobs:[] });
  const followStatus = () => ({ enabled:false,desiredEnabled:false,targetUsername:null });
  return {
    obsidianFarm: {
      attachBot() {}, detachBot() {}, onSpawn() {}, dispose() {}, suspend:obsidianStatus,
      pauseForServerRestart:obsidianStatus, pauseForHighPing:obsidianStatus, stop:obsidianStatus,
      getStatus:obsidianStatus, configureRuntime() {}, configure:() => restricted('Obsidian Farm'),
      setProtectionLeverState:() => restricted('Obsidian Farm'), prepareStart:() => restricted('Obsidian Farm'),
      validateStart:() => restricted('Obsidian Farm'), resetConfig:() => restricted('Obsidian Farm'),
      cycleCauldronRadius:() => restricted('Obsidian Farm')
    },
    killAura: {
      attachBot() {}, detachBot() {}, dispose() {}, setTargets:killAuraStatus,
      setAttackRange:killAuraStatus, setCriticalsEnabled:killAuraStatus,
      setEnabled:enabled => enabled ? restricted('Kill Aura') : killAuraStatus(), getStatus:killAuraStatus
    },
    follow: {
      attachBot() {}, detachBot() {}, onSpawn() {}, dispose() {}, stop:followStatus,
      start:() => restricted('Follow'), getStatus:followStatus, findPlayerEntity:() => null
    }
  };
}

function ownObsidianFarm(context, farm, settingsFile, notify = null, initialState = null) {
  let desiredEnabled = false;
  try { desiredEnabled = Boolean(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))?.enabled); } catch {}
  if (typeof initialState?.desiredEnabled === 'boolean') {
    desiredEnabled = initialState.desiredEnabled;
  }
  const persist = () => {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({ enabled: desiredEnabled }, null, 2), 'utf8');
  };
  const waitForFarmChunks = async bot => {
    if (typeof bot?.waitForChunksToLoad !== 'function') return;
    let timer = null;
    try {
      await Promise.race([
        bot.waitForChunksToLoad(),
        new Promise(resolve => { timer = setTimeout(resolve, 15_000); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    attachBot: bot => bot ? farm.loadPlugin(bot) : null,
    detachBot: () => farm.suspend(),
    onSpawn: async spawnedBot => {
      const targetBot = spawnedBot || context.bot;
      const assertCurrentConnection = () => {
        if (context.bot !== targetBot || !targetBot?.entity) {
          throw new Error('Obsidian Farm cannot resume: Minecraft connection changed during startup.');
        }
        if (!desiredEnabled) {
          throw new Error('Obsidian Farm resume was cancelled during startup.');
        }
      };
      farm.assertPathfinderReady(targetBot);
      if (!desiredEnabled) return false;
      assertCurrentConnection();
      await waitForFarmChunks(targetBot);
      assertCurrentConnection();
      await farm.setProtectionLeverState(targetBot, false);
      assertCurrentConnection();
      await farm.prepareStart(targetBot);
      assertCurrentConnection();
      return farm.resume(targetBot, notify);
    },
    start: notificationHandler => {
      const previousDesired = desiredEnabled;
      try {
        const status = farm.start(context.bot, notificationHandler || notify);
        if (!status?.enabled) throw new Error('Obsidian Farm cannot start: farm loop is not enabled.');
        desiredEnabled = true;
        persist();
        return { ...status, desiredEnabled };
      } catch (error) {
        desiredEnabled = previousDesired;
        persist();
        throw error;
      }
    },
    resume: notificationHandler => {
      const status = farm.resume(context.bot, notificationHandler || notify);
      if (!status?.enabled) throw new Error('Obsidian Farm cannot resume: farm loop is not enabled.');
      desiredEnabled = true;
      persist();
      return { ...status, desiredEnabled };
    },
    suspend: () => {
      desiredEnabled = false;
      persist();
      return farm.suspend();
    },
    // Scheduled restart protection must stop the physical loop without
    // changing the operator's persisted Start Farm intent. onSpawn can then
    // resume this account normally after the server comes back.
    pauseForServerRestart: () => farm.suspend(),
    pauseForHighPing: () => farm.suspend(),
    stop: notify => {
      desiredEnabled = false;
      persist();
      return farm.stop(notify);
    },
    dispose: () => farm.suspend(),
    configure: (...args) => farm.configure(...args),
    setCauldronRadius: radius => farm.setCauldronRadius(radius),
    cycleCauldronRadius: () => farm.cycleCauldronRadius(),
    resetConfig: () => farm.resetConfig(),
    configureRuntime: hooks => farm.configureRuntime(hooks),
    validateStart: () => farm.validateStart(context.bot),
    setProtectionLeverState: (powered, targetBot = context.bot) => farm.setProtectionLeverState(targetBot, powered),
    prepareStart: (targetBot = context.bot, ...args) => farm.prepareStart(targetBot, ...args),
    inspectSupplies: () => farm.inspectSupplies(context.bot),
    getStatus: () => ({ ...farm.getStatus(), desiredEnabled }),
    getDetailedStatus: options => farm.getDetailedStatus(context.bot, options),
    getDebugLoggingEnabled: () => farm.getDebugLoggingEnabled(),
    setDebugLoggingEnabled: enabled => farm.setDebugLoggingEnabled(enabled),
    getDebugLogFile: date => farm.getDebugLogFile(date),
    loadPlugin: bot => farm.loadPlugin(bot || context.bot),
    __test: farm.__test
  };
}

function ownFollow(context, follow, settingsFile) {
  let desired = { enabled: false, targetUsername: null, distance: 2 };
  try {
    const stored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    desired = {
      enabled: Boolean(stored?.enabled && stored?.targetUsername),
      targetUsername: stored?.targetUsername ? String(stored.targetUsername) : null,
      distance: Math.max(1, Number(stored?.distance) || 2)
    };
  } catch {}
  const persist = () => {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(desired, null, 2), 'utf8');
  };
  return {
    attachBot: () => {},
    detachBot: () => follow.stop(),
    onSpawn: () => {
      if (!desired.enabled || !desired.targetUsername) return null;
      try { return follow.start(context.bot, desired.targetUsername, { distance: desired.distance }); }
      catch { return null; }
    },
    start: (username, options = {}) => {
      const result = follow.start(context.bot, username, options);
      desired = {
        enabled: true,
        targetUsername: result.targetUsername,
        distance: Math.max(1, Number(options.distance) || 2)
      };
      persist();
      return result;
    },
    stop: () => {
      desired = { ...desired, enabled: false, targetUsername: null };
      persist();
      return follow.stop();
    },
    dispose: () => follow.stop(),
    getStatus: () => ({ ...follow.getStatus(), desiredEnabled: desired.enabled, distance: desired.distance }),
    findPlayerEntity: username => follow.findPlayerEntity(context.bot, username)
  };
}

function createModulesForBot(context, {
  dataRoot = path.join('data', 'bots'),
  obsidianFarmFactory = createObsidianFarm,
  killAuraFactory = createKillAuraFeature,
  followFactory = createFollowFeature,
  notify = null,
  systemLogger = null,
  obsidianState = null,
  obsidianDebugLoggingEnabled = false,
  primaryFactories = {}
} = {}) {
  if (!context?.accountId) throw new Error('Module registry requires a BotContext.');
  if (context.account?.role === PEARL_LOADER_ROLE) return pearlLoaderOnlyModules();
  const accountRoot = path.resolve(dataRoot, context.accountId);
  const rawFarm = obsidianFarmFactory({
    accountId: context.accountId,
    username: context.username,
    isPrimary: context.isPrimary,
    configFile: path.join(accountRoot, 'obsidian-farm.json'),
    debugLogFile: path.join(accountRoot, 'obsidian-farm-debug.log'),
    debugLoggingEnabled: obsidianDebugLoggingEnabled,
    systemLogger
  });
  if (obsidianState?.config) {
    rawFarm.configure(
      obsidianState.config.x,
      obsidianState.config.y,
      obsidianState.config.z,
      { maxCauldronDist:obsidianState.config.maxCauldronDist }
    );
  }
  const killAura = killAuraFactory(context.account);
  const follow = followFactory(context.account);
  const modules = {
    obsidianFarm: ownObsidianFarm(
      context,
      rawFarm,
      path.join(accountRoot, 'obsidian-runtime.json'),
      notify,
      obsidianState
    ),
    killAura,
    follow: ownFollow(context, follow, path.join(accountRoot, 'follow.json'))
  };

  if (context.isPrimary) {
    for (const [name, factory] of Object.entries(primaryFactories)) {
      if (typeof factory === 'function') modules[name] = factory(context);
    }
  }
  return modules;
}

module.exports = { createModulesForBot, pearlLoaderOnlyModules };
