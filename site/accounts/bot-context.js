'use strict';

const { EventEmitter } = require('node:events');

const LIFECYCLE_STATES = new Set([
  'created', 'connecting', 'online', 'disconnecting', 'offline', 'reconnecting', 'disposed'
]);

class BotContext extends EventEmitter {
  constructor({ account, isPrimary = Boolean(account?.isDefault) } = {}) {
    super();
    if (!account?.id) throw new Error('BotContext requires an account with a stable ID.');
    this.account = account;
    this.accountId = account.id;
    this.username = account.username;
    this.isPrimary = Boolean(isPrimary);
    this.bot = null;
    this.modules = Object.create(null);
    this.lifecycle = 'created';
    this.lastError = null;
  }

  setLifecycle(next) {
    if (!LIFECYCLE_STATES.has(next)) throw new Error(`Unsupported bot lifecycle state: ${next}`);
    this.lifecycle = next;
    this.emit('lifecycle', { accountId: this.accountId, lifecycle: next });
    return next;
  }

  attachBot(bot) {
    this.bot = bot || null;
    try {
      for (const module of Object.values(this.modules)) module?.attachBot?.(this.bot);
      return this.bot;
    } catch (error) {
      for (const module of Object.values(this.modules)) {
        try { module?.detachBot?.(this.bot); } catch {}
      }
      if (this.bot === bot) this.bot = null;
      throw error;
    }
  }

  async notifySpawn() {
    const results = [];
    for (const module of Object.values(this.modules)) {
      if (typeof module?.onSpawn === 'function') results.push(await module.onSpawn(this.bot));
    }
    return results;
  }

  detachBot(bot = this.bot) {
    for (const module of Object.values(this.modules)) module?.detachBot?.(bot);
    if (!bot || this.bot === bot) this.bot = null;
  }

  async disposeModules() {
    for (const module of Object.values(this.modules)) {
      await module?.dispose?.();
    }
  }
}

module.exports = { BotContext, LIFECYCLE_STATES };
