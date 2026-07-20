'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const TASKS = new Set(['obsidian','observe','follow','chat','idle','paused']);
const FOOD_NAMES = ['bread','apple','beef','porkchop','chicken','mutton','rabbit','potato','carrot','melon_slice','cookie','pumpkin_pie','mushroom_stew','rabbit_stew'];

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
  }

  clearRuntimeIntervals() { for (const timer of this.intervals) clearInterval(timer); this.intervals.clear(); }
  scheduleReconnect(delay = this.reconnectBackoffMs) {
    if (this.destroyed || this.intentionalStop || this.reconnectTimer) return;
    this.status = 'connecting';
    this.emit('status',this.getStatus());
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.intentionalStop && !this.bot) this.start().catch(error => {
        this.lastError = error?.message || String(error);
        this.status = 'error';
        this.emit('status',this.getStatus());
        this.scheduleReconnect();
      });
    },Math.max(1000,Number(delay) || this.reconnectBackoffMs));
  }

  nearbyPlayers() {
    if (!this.bot?.entity?.position) return [];
    return Object.values(this.bot.entities || {}).filter(entity => entity?.type === 'player' && entity.username && entity.username !== this.bot.username && entity.position)
      .map(entity => ({username:entity.username,distance:Number(this.bot.entity.position.distanceTo(entity.position).toFixed(1))}))
      .sort((a,b) => a.distance-b.distance);
  }

  startAfkMonitors() {
    this.clearRuntimeIntervals();
    const timer = setInterval(() => this.runAfkChecks().catch(error => this.emit('monitor-error',error)),1000);
    this.intervals.add(timer);
  }

  async runAfkChecks() {
    const bot = this.bot;
    if (!bot?.entity) return;
    if (Date.now()-this.lastMonitorStatusAt >= 5000) {
      this.lastMonitorStatusAt = Date.now();
      this.emit('status',this.getStatus());
    }
    const threat = this.nearbyPlayers().find(player => player.distance <= this.dangerRadius && !this.isWhitelisted(player.username));
    if (threat) {
      this.lastThreat = {...threat,detectedAt:new Date().toISOString()};
      this.lastError = `Non-whitelisted player nearby: ${threat.username} (${threat.distance} blocks)`;
      this.securityDisconnectPending = true;
      this.status = 'stopped';
      this.clearRuntimeIntervals();
      try { bot.quit?.(`Non-whitelisted player nearby: ${threat.username}`); } catch { bot.end?.('Safety disconnect'); }
      return;
    }
    if (bot.food >= 18 || this.eating) return;
    const food = bot.inventory?.items?.().find(item => FOOD_NAMES.some(name => item.name === name || item.name?.endsWith(`_${name}`)));
    if (!food || typeof bot.equip !== 'function' || typeof bot.consume !== 'function') return;
    this.eating = true;
    try { await bot.equip(food,'hand'); await bot.consume(); }
    finally { this.eating = false; }
  }

  async start() {
    if (this.destroyed) throw new Error('Runtime has been destroyed.');
    if (this.startPromise) return this.startPromise;
    if (this.bot) return this.getStatus();
    this.intentionalStop = false;
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
        this.status = this.task === 'paused' ? 'paused' : 'connected';
        this.emit('status', this.getStatus());
        this.startAfkMonitors();
        if (this.authCacheStore) setTimeout(() => this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error)),1000);
      });
      bot.on?.('error', error => { this.lastError = error?.message || String(error); this.status = 'error'; this.emit('status', this.getStatus()); });
      bot.once?.('end', reason => {
        const securityDisconnect = this.securityDisconnectPending;
        this.securityDisconnectPending = false;
        if (this.bot === bot) this.bot = null;
        this.clearRuntimeIntervals();
        if (!this.destroyed && !this.intentionalStop) {
          this.status = 'connecting';
          this.scheduleReconnect(securityDisconnect ? Math.max(30000,this.reconnectBackoffMs) : this.reconnectBackoffMs);
        } else this.status = 'stopped';
        this.emit('end', reason);
      });
      return this.getStatus();
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async stop(reason = 'Account stopped') {
    this.intentionalStop = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearRuntimeIntervals();
    const bot = this.bot;
    if (this.authCacheStore) await this.authCacheStore.persist(this.account.id,this.authCachePath).catch(error => this.emit('auth-cache-error',error));
    this.bot = null;
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
      nearbyPlayers:this.nearbyPlayers(),lastThreat:this.lastThreat,authCachePath:undefined
    };
  }
  async destroy() { this.destroyed = true; await this.stop('Account removed'); this.removeAllListeners(); }
}

module.exports = { MinecraftBotRuntime, TASKS };
