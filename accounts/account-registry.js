'use strict';

class AccountRegistry {
  constructor(repository) {
    this.repository = repository;
    this.accounts = new Map();
  }

  async load() {
    this.accounts = new Map((await this.repository.list()).map(account => [account.id, account]));
    return this.list();
  }

  list() { return [...this.accounts.values()].sort((a, b) => a.sortOrder - b.sortOrder); }
  get(id) { return this.accounts.get(id) || null; }

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
