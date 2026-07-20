'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const TASKS = new Set(['obsidian','observe','follow','chat','idle','paused']);

class MinecraftBotRuntime extends EventEmitter {
  constructor({ account, botFactory, authCacheRoot = path.join('data', 'auth-cache'), reconnectBackoffMs } = {}) {
    super();
    if (!account?.id) throw new Error('Runtime requires an account.');
    if (typeof botFactory !== 'function') throw new Error('Runtime requires a Mineflayer factory.');
    this.account = account;
    this.botFactory = botFactory;
    this.authCacheRoot = path.resolve(authCacheRoot);
    this.authCachePath = path.resolve(this.authCacheRoot, account.id);
    this.reconnectBackoffMs = reconnectBackoffMs || account.reconnectBackoffMs || 5000;
    this.bot = null;
    this.status = 'stopped';
    this.task = 'idle';
    this.lastError = null;
    this.startedAt = null;
    this.reconnectTimer = null;
    this.intervals = new Set();
    this.destroyed = false;
    this.startPromise = null;
  }

  async start() {
    if (this.destroyed) throw new Error('Runtime has been destroyed.');
    if (this.startPromise) return this.startPromise;
    if (this.bot) return this.getStatus();
    this.status = 'connecting';
    this.emit('status', this.getStatus());
    this.startPromise = Promise.resolve().then(() => this.botFactory({
      username: this.account.username,
      host: this.account.host,
      port: this.account.port,
      version: this.account.minecraftVersion || false,
      auth: this.account.authType,
      profilesFolder: this.authCachePath,
      onMsaCode: code => this.emit('device-code', { accountId: this.account.id, ...code })
    })).then(bot => {
      this.bot = bot;
      this.startedAt = new Date();
      this.status = 'connecting';
      bot.once?.('spawn', () => {
        const actualUsername = String(bot.username || '');
        if (actualUsername && actualUsername.toLowerCase() !== String(this.account.username).toLowerCase()) {
          this.lastError = `Authenticated Minecraft profile ${actualUsername} does not match configured account ${this.account.username}. Reauthorize this account.`;
          this.status = 'error';
          this.emit('status', this.getStatus());
          try { bot.quit?.('Authenticated Minecraft profile mismatch'); } catch { bot.end?.('Authenticated Minecraft profile mismatch'); }
          return;
        }
        this.status = this.task === 'paused' ? 'paused' : 'connected';
        this.emit('status', this.getStatus());
      });
      bot.on?.('error', error => { this.lastError = error?.message || String(error); this.status = 'error'; this.emit('status', this.getStatus()); });
      bot.once?.('end', reason => { this.bot = null; if (!this.destroyed && this.status !== 'stopped') this.status = 'stopped'; this.emit('end', reason); });
      return this.getStatus();
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async stop(reason = 'Account stopped') {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const timer of this.intervals) clearInterval(timer);
    this.intervals.clear();
    const bot = this.bot;
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
      nearbyPlayers:[],authCachePath:undefined
    };
  }
  async destroy() { this.destroyed = true; await this.stop('Account removed'); this.removeAllListeners(); }
}

module.exports = { MinecraftBotRuntime, TASKS };
