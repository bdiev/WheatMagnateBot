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
    for (const module of Object.values(this.modules)) module?.attachBot?.(this.bot);
    return this.bot;
  }

  notifySpawn() {
    for (const module of Object.values(this.modules)) module?.onSpawn?.(this.bot);
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
