'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BotContext } = require('./bot-context');
const { createModulesForBot } = require('./module-registry');
const {
  getServerRestartDateParts,
  isRestartPreparationWindow,
  isPostRestartStartupWindow
} = require('../../features/obsidianFarm/restart-schedule');
const { MAX_FARM_PING_MS, botPingMs, isFarmPingTooHigh } = require('../../features/obsidianFarm/ping-protection');

const TASKS = new Set(['obsidian','observe','follow','kill_aura','pearl_loader','chat','idle','paused']);
const STABLE_CONNECTION_RESET_MS = 60_000;
// Keep this list deliberately conservative. Raw meat, spider eyes and poisonous
// potatoes are technically consumable, but are a poor choice for an unattended bot.
const SAFE_FOOD_PRIORITY = [
  'golden_carrot','cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
  'cooked_rabbit','bread','baked_potato','pumpkin_pie','rabbit_stew','mushroom_stew',
  'apple','carrot','melon_slice','cookie','dried_kelp'
];

function compactInventoryItem(item) {
  if (!item) return null;
  const maxDurability = Number(item.maxDurability);
  const durabilityUsed = Number(item.durabilityUsed);
  return {
    name:item.name,displayName:item.displayName || item.name,count:item.count,slot:item.slot,
    maxDurability:maxDurability>0?maxDurability:null,
    durabilityUsed:Number.isFinite(durabilityUsed)?durabilityUsed:null,
    remainingPercent:maxDurability>0&&Number.isFinite(durabilityUsed)
      ?Math.max(0,Math.min(100,((maxDurability-durabilityUsed)/maxDurability)*100))
      :null
  };
}

class MinecraftBotRuntime extends BotContext {
  constructor({ account, botFactory, moduleFactory = createModulesForBot, moduleOptions = {}, killAuraFactory = null, authCacheRoot = path.join('data', 'auth-cache'), authCacheStore = null, reconnectBackoffMs, obsidianResumeRetryMs = 5000, isWhitelisted = () => false, dangerRadius = 32, now = () => new Date() } = {}) {
    super({ account });
    if (!account?.id) throw new Error('Runtime requires an account.');
    if (typeof botFactory !== 'function') throw new Error('Runtime requires a Mineflayer factory.');
    this.botFactory = botFactory;
    this.authCacheRoot = path.resolve(authCacheRoot);
    this.authCachePath = path.resolve(this.authCacheRoot, account.id);
    this.authCacheStore = authCacheStore;
    this.reconnectBackoffMs = reconnectBackoffMs || account.reconnectBackoffMs || 5000;
    this.isWhitelisted = isWhitelisted;
    this.dangerRadius = Math.max(1,Number(dangerRadius) || 32);
    this.status = 'stopped';
    this.task = 'idle';
    this.startedAt = null;
    this.reconnectTimer = null;
    this.intervals = new Set();
    this.destroyed = false;
    this.startPromise = null;
    this.intentionalStop = false;
    this.eating = false;
    this.lastThreat = null;
    this.securityDisconnectPending = false;
    this.lastMonitorStatusAt = 0;
    this.nearbySnapshot = [];
    this.reconnectAttempts = 0;
    this.obsidianResumeRetryMs = Math.max(25, Number(obsidianResumeRetryMs) || 5000);
    this.obsidianResumePromise = null;
    this.nextObsidianResumeAt = 0;
    this.safetyLockout = false;
    this.lastEatErrorAt = 0;
    this.now = typeof now === 'function' ? now : () => new Date();
    this.restartProtectionDateKey = null;
    this.restartProtectionPromise = null;
    this.farmPausedForHighPing = false;
    this.connectionGate = connect => connect();
    const resolvedModuleOptions = { ...moduleOptions };
    if (typeof killAuraFactory === 'function') resolvedModuleOptions.killAuraFactory = killAuraFactory;
    this.modules = moduleFactory(this, resolvedModuleOptions);
    // Compatibility aliases for existing callers while ownership now lives in
    // context.modules and every value is account-local.
    this.obsidianFarm = this.modules.obsidianFarm;
    this.killAura = this.modules.killAura;
    this.follow = this.modules.follow;
  }

  clearRuntimeIntervals() { for (const timer of this.intervals) clearInterval(timer); this.intervals.clear(); }
  scheduleReconnect(delay = this.reconnectBackoffMs) {
    if (this.destroyed || this.intentionalStop || this.safetyLockout || this.reconnectTimer) return;
    this.status = 'connecting';
    this.setLifecycle('reconnecting');
    this.emit('status',this.getStatus());
    const requestedDelay = Math.max(1000,Number(delay) || this.reconnectBackoffMs);
    const reconnectDelay = requestedDelay >= 30000 ? requestedDelay : Math.min(60000,requestedDelay*(2**Math.min(this.reconnectAttempts,4)));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.intentionalStop && !this.bot) this.start().catch(error => {
        this.lastError = error?.message || String(error);
        this.status = 'error';
        this.emit('status',this.getStatus());
        this.scheduleReconnect();
      });
    },reconnectDelay+Math.floor(Math.random()*750));
  }

  nearbyPlayers() {
    const bot = this.bot;
    if (!bot?.entity?.position) return [];
    return Object.values(bot.entities || {}).filter(entity => entity?.type === 'player' && entity.username && entity.username !== bot.username && entity.position)
      .map(entity => ({username:entity.username,distance:Number(this.bot.entity.position.distanceTo(entity.position).toFixed(1))}))
      .sort((a,b) => a.distance-b.distance);
  }

  startAfkMonitors() {
    this.clearRuntimeIntervals();
    const timer = setInterval(() => this.runAfkChecks().catch(error => this.emit('monitor-error',error)),1500);
    this.intervals.add(timer);
  }

  protectFarmForScheduledRestart(bot = this.bot, date = this.now()) {
    const farmStatus = this.obsidianFarm?.getStatus?.();
    const dateParts = getServerRestartDateParts(date);
    if (
      bot !== this.bot ||
      !bot?.entity ||
      !farmStatus?.desiredEnabled ||
      !isRestartPreparationWindow(dateParts) ||
      this.restartProtectionDateKey === dateParts.dateKey
    ) return Promise.resolve(false);

    // Mark the date before starting world interactions so overlapping monitor
    // ticks cannot queue the lever action more than once.
    this.restartProtectionDateKey = dateParts.dateKey;
    this.obsidianFarm.pauseForServerRestart?.();
    this.emit('status', this.getStatus());

    const attempt = Promise.resolve()
      .then(() => this.obsidianFarm.setProtectionLeverState(true, bot))
      .then(() => {
        if (this.bot === bot) {
          this.emit('status', this.getStatus());
          this.emit('restart-protection', { accountId:this.account.id,dateKey:dateParts.dateKey,protected:true });
        }
        return true;
      })
      .catch(error => {
        if (this.bot === bot) {
          this.lastError = `Scheduled restart protection failed: ${error?.message || String(error)}`;
          this.emit('status', this.getStatus());
          this.emit('restart-protection', { accountId:this.account.id,dateKey:dateParts.dateKey,protected:false,error:this.lastError });
        }
        return false;
      })
      .finally(() => {
        if (this.restartProtectionPromise === attempt) this.restartProtectionPromise = null;
      });
    this.restartProtectionPromise = attempt;
    return attempt;
  }

  async runAfkChecks() {
    const bot = this.bot;
    if (!bot?.entity) return;
    this.nearbySnapshot = this.nearbyPlayers();
    if (Date.now()-this.lastMonitorStatusAt >= 5000) {
      this.lastMonitorStatusAt = Date.now();
      this.emit('status',this.getStatus());
    }
    const threat = this.nearbySnapshot.find(player => player.distance <= this.dangerRadius && !this.isWhitelisted(player.username));
    if (threat) {
      this.lastThreat = {...threat,detectedAt:new Date().toISOString()};
      this.lastError = `Non-whitelisted player nearby: ${threat.username} (${threat.distance} blocks)`;
      this.securityDisconnectPending = true;
      // Do not repeatedly reconnect into the same player. A deliberate Start or
      // Restart from the control panel clears this lockout.
      this.safetyLockout = true;
      this.status = 'stopped';
      this.clearRuntimeIntervals();
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.emit('security-disconnect',{accountId:this.account.id,...this.lastThreat});
      this.emit('status',this.getStatus());
      try { bot.quit?.(`Non-whitelisted player nearby: ${threat.username}`); } catch { bot.end?.('Safety disconnect'); }
      return;
    }
    const ping = botPingMs(bot);
    const farmBeforePingCheck = this.obsidianFarm?.getStatus?.() || {};
    if (isFarmPingTooHigh(ping)) {
      if (farmBeforePingCheck.desiredEnabled) {
        if (farmBeforePingCheck.enabled) this.obsidianFarm.pauseForHighPing?.();
        if (!this.farmPausedForHighPing) {
          this.farmPausedForHighPing = true;
          this.lastError = `Obsidian Farm paused: ping ${Math.round(ping)} ms exceeds ${MAX_FARM_PING_MS} ms.`;
          this.emit('status', this.getStatus());
        }
      } else {
        this.farmPausedForHighPing = false;
      }
      return;
    }
    if (this.farmPausedForHighPing && ping == null) return;
    if (this.farmPausedForHighPing) {
      const recoveryDateParts = getServerRestartDateParts(this.now());
      if (isRestartPreparationWindow(recoveryDateParts)) return;
      this.farmPausedForHighPing = false;
      if (/Obsidian Farm paused: ping/i.test(this.lastError || '')) this.lastError = null;
      this.nextObsidianResumeAt = 0;
      this.emit('status', this.getStatus());
      this.retryDesiredObsidian(bot);
      return;
    }
    const restartNow = this.now();
    const restartDateParts = getServerRestartDateParts(restartNow);
    await this.protectFarmForScheduledRestart(bot, restartNow);
    const farmStatus = this.obsidianFarm?.getStatus?.();
    if (
      farmStatus?.desiredEnabled &&
      !farmStatus.enabled &&
      this.task !== 'paused' &&
      !isRestartPreparationWindow(restartDateParts) &&
      Date.now() >= this.nextObsidianResumeAt
    ) {
      this.retryDesiredObsidian(bot);
    }
    if (!Number.isFinite(bot.food) || bot.food >= 18 || this.eating) return;
    const items = bot.inventory?.items?.() || [];
    const food = SAFE_FOOD_PRIORITY
      .map(name => items.find(item => item?.name === name))
      .find(Boolean);
    if (!food || typeof bot.equip !== 'function' || typeof bot.consume !== 'function') return;
    this.eating = true;
    try {
      await bot.equip(food,'hand');
      // The connection or hunger level may have changed while equip was pending.
      if (this.bot !== bot || !bot.entity || bot.food >= 20) return;
      await bot.consume();
    } catch (error) {
      // Consumption failures are normally transient (movement, lag, inventory
      // update). Surface them without taking the whole AFK monitor down.
      this.lastError = `Auto-eat failed: ${error?.message || String(error)}`;
      if (Date.now()-this.lastEatErrorAt >= 10000) {
        this.lastEatErrorAt = Date.now();
        this.emit('monitor-error',error);
        this.emit('status',this.getStatus());
      }
    }
    finally { this.eating = false; }
  }

  retryDesiredObsidian(bot = this.bot) {
    if (this.obsidianResumePromise) return this.obsidianResumePromise;
    const farmStatus = this.obsidianFarm?.getStatus?.();
    if (
      bot !== this.bot ||
      !bot?.entity ||
      !farmStatus?.desiredEnabled ||
      farmStatus.enabled ||
      this.task === 'paused'
    ) return Promise.resolve(farmStatus || null);

    this.nextObsidianResumeAt = Date.now() + this.obsidianResumeRetryMs;
    const attempt = Promise.resolve()
      .then(() => this.obsidianFarm.onSpawn(bot))
      .then(status => {
        if (this.bot !== bot || !bot.entity) return status;
        const current = this.obsidianFarm.getStatus();
        if (!current.desiredEnabled) return current;
        if (!current.enabled) throw new Error('Obsidian Farm cannot resume: farm loop is not enabled.');
        this.task = 'obsidian';
        this.status = 'connected';
        this.lastError = null;
        this.nextObsidianResumeAt = 0;
        this.emit('status', this.getStatus());
        return current;
      })
      .catch(error => {
        if (this.bot === bot && bot.entity && this.obsidianFarm?.getStatus?.().desiredEnabled) {
          this.lastError = error?.message || String(error);
          this.status = 'connected';
          this.nextObsidianResumeAt = Date.now() + this.obsidianResumeRetryMs;
          this.emit('status', this.getStatus());
        }
        return null;
      })
      .finally(() => {
        if (this.obsidianResumePromise === attempt) this.obsidianResumePromise = null;
      });
    this.obsidianResumePromise = attempt;
    return attempt;
  }

  async start() {
    if (this.destroyed) throw new Error('Runtime has been destroyed.');
    if (this.startPromise) return this.startPromise;
    if (this.bot) return this.getStatus();
    // start() is an explicit operator action unless invoked by the reconnect
    // timer, which never runs while safetyLockout is set.
    this.safetyLockout = false;
    this.intentionalStop = false;
    this.nearbySnapshot = [];
    this.farmPausedForHighPing = false;
    this.status = 'connecting';
    this.setLifecycle(this.lifecycle === 'offline' ? 'reconnecting' : 'connecting');
    this.emit('status', this.getStatus());
    this.startPromise = this.connectionGate(async () => {
      await this.authCacheStore?.hydrate(this.account.id,this.authCachePath);
      return this.botFactory({
      username: this.account.username,
      host: this.account.host,
      port: this.account.port,
      version: this.account.minecraftVersion || false,
      auth: this.account.authType,
      profilesFolder: this.authCachePath,
      onMsaCode: code => this.emit('device-code', { accountId: this.account.id, ...code })
      });
    }).then(bot => {
      this.attachBot(bot);
      this.startedAt = new Date();
      this.status = 'connecting';
      bot.once?.('spawn', async () => {
        const actualUsername = String(bot.username || '');
        if (actualUsername && actualUsername.toLowerCase() !== String(this.account.username).toLowerCase()) {
          const previousUsername = this.account.username;
          this.account.username = actualUsername;
          this.emit('profile-resolved', { accountId:this.account.id,previousUsername,username:actualUsername });
          if (this.status === 'error') return;
        }
        this.lastError = null;
        const restartDateParts = getServerRestartDateParts(this.now());
        if (
          this.obsidianFarm?.getStatus?.().desiredEnabled &&
          isPostRestartStartupWindow(restartDateParts)
        ) {
          this.restartProtectionDateKey = restartDateParts.dateKey;
        }
        this.status = this.task === 'paused' ? 'paused' : 'connected';
        this.setLifecycle('online');
        if (this.bot !== bot) return;
        this.killAura?.attachBot(bot);
        try {
          await this.notifySpawn();
        } catch (error) {
          if (this.bot === bot) {
            this.lastError = error?.message || String(error);
            this.nextObsidianResumeAt = Date.now() + this.obsidianResumeRetryMs;
            this.emit('module-error', error);
          }
        }
        // A reconnect/stop may replace this Mineflayer instance while an
        // asynchronous module onSpawn hook is running. Never let the stale
        // spawn handler alter task state or create monitor intervals.
        if (this.bot !== bot) return;
        if (this.task !== 'paused') {
          this.task = this.obsidianFarm?.getStatus?.().enabled
            ? 'obsidian'
            : this.killAura?.getStatus?.().enabled
              ? 'kill_aura'
              : this.follow?.getStatus?.().enabled ? 'follow' : 'idle';
        }
        this.emit('status', this.getStatus());
        this.startAfkMonitors();
        if (this.authCacheStore) setTimeout(() => this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error)),1000);
      });
      bot.on?.('error', error => { this.lastError = error?.message || String(error); this.status = 'error'; this.emit('status', this.getStatus()); });
      bot.on?.('chat', (username, message) => {
        this.emit('chat', { accountId:this.account.id,username,message });
      });
      if (this.isPrimary || this.account.role === 'pearl_loader') {
        bot.on?.('whisper',(username,message) => this.emit('whisper',{accountId:this.account.id,username,message}));
      }
      bot.once?.('end', reason => {
        const securityDisconnect = this.securityDisconnectPending;
        this.securityDisconnectPending = false;
        const connectedForMs = this.startedAt ? Math.max(0, Date.now()-this.startedAt.getTime()) : 0;
        if (connectedForMs >= STABLE_CONNECTION_RESET_MS) this.reconnectAttempts = 0;
        this.detachBot(bot);
        this.nearbySnapshot = [];
        this.clearRuntimeIntervals();
        bot.removeAllListeners?.();
        if (!this.destroyed && !this.intentionalStop && !securityDisconnect && !this.safetyLockout) {
          this.lastError = `Disconnected: ${String(reason || 'Connection closed')}`;
          this.status = 'connecting';
          this.setLifecycle('reconnecting');
          this.scheduleReconnect(this.reconnectBackoffMs);
        } else {
          this.status = 'stopped';
          this.setLifecycle('offline');
        }
        this.emit('status',this.getStatus());
        this.emit('end', reason);
      });
      return this.getStatus();
    }).catch(error => {
      this.lastError = error?.message || String(error);
      this.status = 'error';
      this.emit('status', this.getStatus());
      // A connection can fail before Mineflayer returns a bot instance (for
      // example while restoring the Microsoft auth cache). In that case no
      // `end` event will arrive to schedule the normal reconnect path.
      this.scheduleReconnect();
      throw error;
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async stop(reason = 'Account stopped', { finalStatus = 'stopped', finalTask = this.task } = {}) {
    this.setLifecycle('disconnecting');
    this.intentionalStop = true;
    this.safetyLockout = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.clearRuntimeIntervals();
    const bot = this.bot;
    this.detachBot(bot);
    if (this.authCacheStore) await this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error));
    this.bot = null;
    this.nearbySnapshot = [];
    this.status = finalStatus;
    this.task = finalTask;
    if (bot) {
      bot.removeAllListeners?.();
      try { bot.quit?.(reason); } catch { bot.end?.(reason); }
    }
    this.setLifecycle('offline');
    this.emit('status', this.getStatus());
    return this.getStatus();
  }

  async prepareForShutdown(reason = 'Process shutdown') {
    const bot = this.bot;
    const farmStatus = this.obsidianFarm?.getStatus?.() || {};
    const shouldProtectFarm = Boolean(bot?.entity && (farmStatus.enabled || farmStatus.desiredEnabled));

    this.clearRuntimeIntervals();
    this.killAura?.setEnabled?.(false);
    this.follow?.stop?.();
    // Stop only the physical loop. Keep desiredEnabled intact so the
    // replacement process can reopen the protection lever and resume the farm
    // after its Minecraft connection and chunks are ready.
    this.obsidianFarm?.pauseForServerRestart?.();
    this.task = 'idle';
    this.emit('status', this.getStatus());

    let leverProtected = null;
    if (shouldProtectFarm) {
      try {
        leverProtected = Boolean(await this.obsidianFarm.setProtectionLeverState(true, bot));
      } catch (error) {
        leverProtected = false;
        this.lastError = `${reason}: could not protect Obsidian Farm lever: ${error?.message || String(error)}`;
        this.emit('status', this.getStatus());
      }
    }
    return { accountId: this.account.id, farmStopped: Boolean(farmStatus.enabled), leverProtected };
  }

  async restart() { await this.stop('Account restarting'); return this.start(); }
  async reauthorize() {
    await this.stop('Account reauthorization requested');
    const expectedParent = `${this.authCacheRoot}${path.sep}`;
    if (!this.authCachePath.startsWith(expectedParent) || path.basename(this.authCachePath) !== this.account.id) {
      throw new Error('Unsafe account auth-cache path.');
    }
    await fs.promises.rm(this.authCachePath, { recursive:true, force:true });
    await this.authCacheStore?.remove(this.account.id);
    this.lastError = null;
    return this.start();
  }
  async pause() {
    return this.stop('Account paused', { finalStatus:'paused', finalTask:'paused' });
  }
  async resume() {
    this.task = 'idle';
    if (!this.bot) return this.start();
    this.status = this.bot ? 'connected' : 'stopped';
    this.killAura?.attachBot(this.bot);
    if (this.bot?.entity) {
      try {
        await this.notifySpawn();
      } catch (error) {
        this.lastError = error?.message || String(error);
        this.emit('module-error', error);
      }
    }
    this.task = this.killAura?.getStatus?.().enabled
      ? 'kill_aura'
      : this.obsidianFarm?.getStatus?.().enabled
        ? 'obsidian'
        : this.follow?.getStatus?.().enabled ? 'follow' : 'idle';
    const status = this.getStatus();
    this.emit('status', status);
    return status;
  }
  assignTask(task) { if (!TASKS.has(task)) throw new Error('Unsupported account task.'); this.task = task; return this.getStatus(); }
  setKillAuraTargets(targets) {
    if (!this.killAura) throw new Error('Kill Aura is unavailable for this runtime.');
    return this.killAura.setTargets(targets);
  }
  setKillAuraAttackRange(value) {
    if (!this.killAura) throw new Error('Kill Aura is unavailable for this runtime.');
    const status = this.killAura.setAttackRange(value);
    this.emit('status', this.getStatus());
    return status;
  }
  setKillAuraCriticalsEnabled(enabled) {
    if (!this.killAura) throw new Error('Kill Aura is unavailable for this runtime.');
    const status = this.killAura.setCriticalsEnabled(enabled);
    this.emit('status', this.getStatus());
    return status;
  }
  setKillAuraEnabled(enabled) {
    if (!this.killAura) throw new Error('Kill Aura is unavailable for this runtime.');
    if (enabled) {
      this.obsidianFarm?.suspend?.();
      this.follow?.stop?.();
    }
    const status = this.killAura.setEnabled(enabled, this.bot);
    this.task = status.enabled ? 'kill_aura' : 'idle';
    this.status = this.bot ? 'connected' : 'stopped';
    this.emit('status', this.getStatus());
    return status;
  }
  cancelTask() { return this.assignTask('idle'); }
  configureObsidian(x, y, z, options) {
    this.obsidianFarm.configure(x, y, z, options);
    return this.obsidianFarm.getStatus();
  }
  async setObsidianEnabled(enabled) {
    if (enabled) {
      let leverDisabled = false;
      const startingBot = this.bot;
      try {
        const preflight = this.obsidianFarm.validateStart();
        if (preflight?.accountId && preflight.accountId !== this.account.id) {
          throw new Error('Obsidian Farm module belongs to another account.');
        }
        await this.obsidianFarm.setProtectionLeverState(false, startingBot);
        leverDisabled = true;
        if (this.bot !== startingBot || !startingBot?.entity) {
          throw new Error('Obsidian Farm cannot start: Minecraft connection changed during lever preparation.');
        }
        await this.obsidianFarm.prepareStart(startingBot);
        if (this.bot !== startingBot || !startingBot?.entity) {
          throw new Error('Obsidian Farm cannot start: Minecraft connection changed during barrel preparation.');
        }
        this.killAura?.setEnabled(false);
        this.follow?.stop?.();
        const farmStatus = this.obsidianFarm.start();
        if (!farmStatus?.enabled) throw new Error('Obsidian Farm cannot start: farm loop is not enabled.');
        this.task = 'obsidian';
        this.lastError = null;
        this.nextObsidianResumeAt = 0;
      } catch (error) {
        if (leverDisabled) {
          await Promise.resolve()
            .then(() => this.obsidianFarm.setProtectionLeverState(true, startingBot))
            .catch(() => {});
        }
        this.lastError = error?.message || String(error);
        this.status = this.bot?.entity ? 'connected' : 'stopped';
        this.emit('status', this.getStatus());
        throw error;
      }
    } else {
      this.obsidianFarm.suspend();
      this.nextObsidianResumeAt = 0;
      this.task = this.killAura?.getStatus?.().enabled
        ? 'kill_aura'
        : this.follow?.getStatus?.().enabled ? 'follow' : 'idle';
      this.status = this.bot?.entity ? 'connected' : 'stopped';
      this.lastError = null;
      // The farm loop and reconnect intent are already disabled. Publish that
      // before a queued barrel/lever interaction delays physical protection.
      this.emit('status', this.getStatus());
      const leverProtected = await Promise.resolve()
        .then(() => this.obsidianFarm.setProtectionLeverState(true))
        .then(() => true)
        .catch(error => {
          this.lastError = error?.message || String(error);
          return false;
        });
      this.status = this.bot?.entity ? 'connected' : 'stopped';
      this.emit('status', this.getStatus());
      return { ...this.obsidianFarm.getStatus(), leverProtected };
    }
    this.status = this.bot?.entity ? 'connected' : 'stopped';
    this.emit('status', this.getStatus());
    return this.obsidianFarm.getStatus();
  }
  startFollowing(username, options) {
    this.obsidianFarm?.suspend?.();
    this.killAura?.setEnabled(false);
    const result = this.follow.start(username, options);
    this.task = 'follow';
    this.emit('status', this.getStatus());
    return result;
  }
  stopFollowing() {
    this.follow.stop();
    if (this.task === 'follow') this.task = 'idle';
    this.emit('status', this.getStatus());
    return this.follow.getStatus();
  }
  isCritical() { return Boolean(this.criticalOperation); }
  getStatus() {
    const inventorySlots = this.bot?.inventory?.slots;
    const items = Array.isArray(inventorySlots)
      ? inventorySlots.filter(item => item && Number(item.slot) >= 9 && Number(item.slot) <= 45)
      : (this.bot?.inventory?.items?.() || []);
    const armor = Array.isArray(inventorySlots)
      ? inventorySlots.slice(5,9).filter(Boolean).map(compactInventoryItem)
      : [];
    return {
      accountId:this.account.id,username:this.bot?.username || this.account.username,server:`${this.account.host}:${this.account.port}`,
      isPrimary:this.isPrimary,lifecycle:this.lifecycle,
      connected:Boolean(this.bot?.entity),status:this.status,task:this.task,lastError:this.lastError,startedAt:this.startedAt,
      uptimeMs:this.startedAt ? Date.now()-this.startedAt.getTime() : 0,health:this.bot?.health ?? null,food:this.bot?.food ?? null,
      ping:this.bot?.player?.ping ?? null,dimension:this.bot?.game?.dimension || null,gameMode:this.bot?.game?.gameMode || null,
      xpLevel:this.bot?.experience?.level ?? null,inventory:items.map(compactInventoryItem),armor,armorCount:armor.length,
      heldItem:compactInventoryItem(this.bot?.heldItem),
      position:this.bot?.entity?.position ? {
        x:this.bot.entity.position.x,y:this.bot.entity.position.y,z:this.bot.entity.position.z
      } : null,
      nearbyPlayers:this.nearbySnapshot,lastThreat:this.lastThreat,
      farmPausedForHighPing:this.farmPausedForHighPing,
      modules:{
        obsidianFarm:this.obsidianFarm?.getStatus?.() || null,
        killAura:this.killAura?.getStatus?.() || null,
        follow:this.follow?.getStatus?.() || null
      },
      obsidian:this.obsidianFarm?.getStatus?.() || null,
      killAura:this.killAura?.getStatus?.() || null,
      followTarget:this.follow?.getStatus?.().targetUsername || null,
      authCachePath:undefined
    };
  }
  async destroy() {
    this.destroyed = true;
    this.killAura?.setEnabled(false);
    await this.stop('Account removed');
    await this.disposeModules();
    this.setLifecycle('disposed');
    this.removeAllListeners();
  }
}

module.exports = { MinecraftBotRuntime, TASKS };
