'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const TASKS = new Set(['obsidian','observe','follow','chat','idle','paused']);
// Keep this list deliberately conservative. Raw meat, spider eyes and poisonous
// potatoes are technically consumable, but are a poor choice for an unattended bot.
const SAFE_FOOD_PRIORITY = [
  'golden_carrot','cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
  'cooked_rabbit','bread','baked_potato','pumpkin_pie','rabbit_stew','mushroom_stew',
  'apple','carrot','melon_slice','cookie','dried_kelp'
];

class MinecraftBotRuntime extends EventEmitter {
  constructor({ account, botFactory, authCacheRoot = path.join('data', 'auth-cache'), authCacheStore = null, reconnectBackoffMs, isWhitelisted = () => false, dangerRadius = 32 } = {}) {
    super();
    if (!account?.id) throw new Error('Runtime requires an account.');
    if (typeof botFactory !== 'function') throw new Error('Runtime requires a Mineflayer factory.');
    this.account = account;
    this.botFactory = botFactory;
    this.authCacheRoot = path.resolve(authCacheRoot);
    this.authCachePath = path.resolve(this.authCacheRoot, account.id);
    this.authCacheStore = authCacheStore;
    this.reconnectBackoffMs = reconnectBackoffMs || account.reconnectBackoffMs || 5000;
    this.isWhitelisted = isWhitelisted;
    this.dangerRadius = Math.max(1,Number(dangerRadius) || 32);
    this.bot = null;
    this.status = 'stopped';
    this.task = 'idle';
    this.lastError = null;
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
    this.safetyLockout = false;
    this.lastEatErrorAt = 0;
  }

  clearRuntimeIntervals() { for (const timer of this.intervals) clearInterval(timer); this.intervals.clear(); }
  scheduleReconnect(delay = this.reconnectBackoffMs) {
    if (this.destroyed || this.intentionalStop || this.safetyLockout || this.reconnectTimer) return;
    this.status = 'connecting';
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

  async runAfkChecks() {
    const bot = this.bot;
    if (!bot?.entity) return;
    this.nearbySnapshot = this.nearbyPlayers();
    if (Date.now()-this.lastMonitorStatusAt >= 10000) {
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

  async start() {
    if (this.destroyed) throw new Error('Runtime has been destroyed.');
    if (this.startPromise) return this.startPromise;
    if (this.bot) return this.getStatus();
    // start() is an explicit operator action unless invoked by the reconnect
    // timer, which never runs while safetyLockout is set.
    this.safetyLockout = false;
    this.intentionalStop = false;
    this.nearbySnapshot = [];
    this.status = 'connecting';
    this.emit('status', this.getStatus());
    this.startPromise = Promise.resolve().then(async () => {
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
      this.bot = bot;
      this.startedAt = new Date();
      this.status = 'connecting';
      bot.once?.('spawn', () => {
        const actualUsername = String(bot.username || '');
        if (actualUsername && actualUsername.toLowerCase() !== String(this.account.username).toLowerCase()) {
          const previousUsername = this.account.username;
          this.account.username = actualUsername;
          this.emit('profile-resolved', { accountId:this.account.id,previousUsername,username:actualUsername });
          if (this.status === 'error') return;
        }
        this.lastError = null;
        this.reconnectAttempts = 0;
        this.status = this.task === 'paused' ? 'paused' : 'connected';
        this.emit('status', this.getStatus());
        this.startAfkMonitors();
        if (this.authCacheStore) setTimeout(() => this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error)),1000);
      });
      bot.on?.('error', error => { this.lastError = error?.message || String(error); this.status = 'error'; this.emit('status', this.getStatus()); });
      bot.on?.('whisper',(username,message) => this.emit('whisper',{accountId:this.account.id,username,message}));
      bot.once?.('end', reason => {
        const securityDisconnect = this.securityDisconnectPending;
        this.securityDisconnectPending = false;
        if (this.bot === bot) this.bot = null;
        this.nearbySnapshot = [];
        this.clearRuntimeIntervals();
        if (!this.destroyed && !this.intentionalStop && !securityDisconnect && !this.safetyLockout) {
          this.status = 'connecting';
          this.scheduleReconnect(this.reconnectBackoffMs);
        } else this.status = 'stopped';
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

  async stop(reason = 'Account stopped') {
    this.intentionalStop = true;
    this.safetyLockout = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearRuntimeIntervals();
    const bot = this.bot;
    if (this.authCacheStore) await this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error));
    this.bot = null;
    this.nearbySnapshot = [];
    this.status = 'stopped';
    if (bot) {
      bot.removeAllListeners?.();
      try { bot.quit?.(reason); } catch { bot.end?.(reason); }
    }
    this.emit('status', this.getStatus());
    return this.getStatus();
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
  pause() { this.task = 'paused'; this.status = this.bot ? 'paused' : 'stopped'; return this.getStatus(); }
  resume() { this.task = 'idle'; this.status = this.bot ? 'connected' : 'stopped'; return this.getStatus(); }
  assignTask(task) { if (!TASKS.has(task)) throw new Error('Unsupported account task.'); this.task = task; return this.getStatus(); }
  cancelTask() { return this.assignTask('idle'); }
  isCritical() { return Boolean(this.criticalOperation); }
  getStatus() {
    const items = this.bot?.inventory?.items?.() || [];
    return {
      accountId:this.account.id,username:this.bot?.username || this.account.username,server:`${this.account.host}:${this.account.port}`,
      connected:Boolean(this.bot?.entity),status:this.status,task:this.task,lastError:this.lastError,startedAt:this.startedAt,
      uptimeMs:this.startedAt ? Date.now()-this.startedAt.getTime() : 0,health:this.bot?.health ?? null,food:this.bot?.food ?? null,
      ping:this.bot?.player?.ping ?? null,dimension:this.bot?.game?.dimension || null,gameMode:this.bot?.game?.gameMode || null,
      xpLevel:this.bot?.experience?.level ?? null,inventory:items.map(item=>({name:item.name,displayName:item.displayName,count:item.count,slot:item.slot})),
      nearbyPlayers:this.nearbySnapshot,lastThreat:this.lastThreat,authCachePath:undefined
    };
  }
  async destroy() { this.destroyed = true; await this.stop('Account removed'); this.removeAllListeners(); }
}

module.exports = { MinecraftBotRuntime, TASKS };
