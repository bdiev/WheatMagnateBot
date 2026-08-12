'use strict';

class AccountRegistry {
  constructor(repository) {
    this.repository = repository;
    this.accounts = new Map();
  }

  async load() {
    const accounts = await this.repository.list();
    const primaryAccounts = accounts.filter(account => account.isDefault);
    if (primaryAccounts.length > 1) throw new Error('Only one Minecraft account can be primary.');
    this.accounts = new Map(accounts.map(account => [account.id, account]));
    return this.list();
  }

  list() { return [...this.accounts.values()].sort((a, b) => a.sortOrder - b.sortOrder); }
  get(id) { return this.accounts.get(id) || null; }
  getPrimary() { return this.list().find(account => account.isDefault) || null; }

  async add(input) {
    const account = await this.repository.create(input);
    this.accounts.set(account.id, account);
    return account;
  }

  async update(id, changes) {
    if (!this.accounts.has(id)) return null;
    const account = await this.repository.update(id, changes);
    if (account) this.accounts.set(id, account);
    return account;
  }

  async remove(id) {
    const account = await this.repository.remove(id);
    if (account) this.accounts.delete(id);
    return account;
  }
}

module.exports = { AccountRegistry };
