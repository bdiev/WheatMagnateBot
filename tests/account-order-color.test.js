'use strict';

const assert = require('node:assert/strict');
const { AccountRegistry } = require('../site/accounts/account-registry');
const { ACCOUNT_COLOR_PALETTE, pickUniqueAccountColor } = require('../site/accounts/account-colors');

class MemoryRepository {
  constructor(accounts) { this.accounts = accounts.map(account => ({ ...account })); }
  async list() { return this.accounts.map(account => ({ ...account })); }
  async reorder(ids) {
    const primary = this.accounts.find(account => account.isDefault);
    const byId = new Map(this.accounts.map(account => [account.id, account]));
    this.accounts = [primary, ...ids.map(id => byId.get(id))].map((account, sortOrder) => ({ ...account, sortOrder }));
    return this.list();
  }
}

async function main() {
  const primary = { id:'primary', isDefault:true, displayName:'WheatMagnate', sortOrder:99, color:'#f1c232' };
  const second = { id:'second', isDefault:false, displayName:'Second', sortOrder:1, color:'#4b91e5' };
  const third = { id:'third', isDefault:false, displayName:'Third', sortOrder:2, color:'#d26cf0' };
  const registry = new AccountRegistry(new MemoryRepository([second, third, primary]));
  await registry.load();

  assert.equal(registry.list()[0].id, primary.id, 'the primary WheatMagnate profile is pinned first regardless of stored sort order');
  await registry.reorder([third.id, second.id]);
  assert.deepEqual(registry.list().map(account => account.id), [primary.id, third.id, second.id], 'secondary profiles retain the selected order');

  const nextColor = pickUniqueAccountColor(registry.list());
  assert.equal(nextColor, ACCOUNT_COLOR_PALETTE[3], 'new accounts receive the first unused palette color');
  assert.equal(pickUniqueAccountColor(registry.list(), '#ef7373'), '#ef7373', 'an unused selected color is preserved');
  assert.notEqual(pickUniqueAccountColor(registry.list(), primary.color), primary.color, 'a duplicate creation color is replaced');

  console.log('Account order and color tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
