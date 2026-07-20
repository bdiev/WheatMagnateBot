'use strict';

class ActiveAccountContext {
  constructor(registry) {
    this.registry = registry;
    this.accountId = null;
  }

  select(accountId) {
    const account = this.registry.get(accountId);
    if (!account) {
      const error = new Error('Minecraft account not found.');
      error.statusCode = 404;
      throw error;
    }
    this.accountId = account.id;
    return account;
  }

  current() {
    const selected = this.accountId && this.registry.get(this.accountId);
    return selected || this.registry.list()[0] || null;
  }
}

module.exports = { ActiveAccountContext };
