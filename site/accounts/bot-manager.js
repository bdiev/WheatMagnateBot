'use strict';

class BotManager {
  constructor({ registry, runtimeFactory, maxConcurrentBots = 3, startDelayMs = 10_000, startJitterMs = 3_000, random = Math.random } = {}) {
    this.registry = registry;
    this.runtimeFactory = runtimeFactory;
    this.maxConcurrentBots = Math.max(1, Number(maxConcurrentBots) || 3);
    this.startDelayMs = Math.max(0, Number(startDelayMs) || 0);
    this.startJitterMs = Math.max(0, Number(startJitterMs) || 0);
    this.random = typeof random === 'function' ? random : Math.random;
    this.runtimes = new Map();
    this.contexts = new Map();
    this.startPromises = new Map();
    this.lastStartAt = 0;
    this.connectionQueue = Promise.resolve();
  }

  get(accountId) { return this.runtimes.get(accountId) || null; }
  getContext(accountId) { return this.contexts.get(accountId) || null; }
  getBot(accountId) { return this.getContext(accountId)?.bot || null; }
  getPrimaryContext() {
    return [...this.contexts.values()].find(context => context.isPrimary) || null;
  }
  getAllContexts() { return [...this.contexts.values()]; }
  registerContext(context) {
    if (!context?.accountId) throw new Error('BotManager context requires an account ID.');
    const existingPrimary = context.isPrimary && this.getPrimaryContext();
    if (existingPrimary && existingPrimary.accountId !== context.accountId) {
      throw new Error('Only one Minecraft account can be primary.');
    }
    this.contexts.set(context.accountId, context);
    return context;
  }
  statuses() { return this.registry.list().map(account => this.getContext(account.id)?.getStatus?.() || { accountId:account.id,status:'stopped',task:'idle',uptimeMs:0,lastError:null }); }

  withConnectionSlot(connect) {
    const queued = this.connectionQueue.catch(() => {}).then(async () => {
      const jitterMs = this.startJitterMs ? Math.floor(this.random() * (this.startJitterMs + 1)) : 0;
      while (this.lastStartAt) {
        const waitMs = this.startDelayMs - (Date.now() - this.lastStartAt);
        if (waitMs <= 0) break;
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      if (jitterMs) await new Promise(resolve => setTimeout(resolve, jitterMs));
      this.lastStartAt = Date.now();
      return connect();
    });
    this.connectionQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  noteExternalConnectionStart(startedAt = Date.now()) {
    this.lastStartAt = Math.max(this.lastStartAt, Number(startedAt) || Date.now());
  }

  async start(accountId) {
    if (this.startPromises.has(accountId)) return this.startPromises.get(accountId);
    const account = this.registry.get(accountId);
    if (!account) throw Object.assign(new Error('Minecraft account not found.'), { statusCode: 404 });
    const active = [...this.runtimes.values()].filter(runtime => !['stopped','error'].includes(runtime.status));
    if (active.length >= this.maxConcurrentBots && !this.runtimes.has(accountId)) throw Object.assign(new Error('Concurrent bot limit reached.'), { statusCode: 409 });
    let runtime = this.runtimes.get(accountId);
    if (!runtime) {
      runtime = this.runtimeFactory(account);
      runtime.connectionGate = connect => this.withConnectionSlot(connect);
      this.runtimes.set(accountId, runtime);
      this.registerContext(runtime);
    }
    const promise = runtime.start().finally(() => this.startPromises.delete(accountId));
    this.startPromises.set(accountId, promise);
    return promise;
  }

  async stop(accountId) { const runtime=this.get(accountId); return runtime ? runtime.stop() : {accountId,status:'stopped',task:'idle'}; }
  async restart(accountId) { const runtime=this.get(accountId); return runtime ? runtime.restart() : this.start(accountId); }
  async recreate(accountId) {
    const runtime = this.get(accountId);
    if (runtime) await runtime.destroy();
    this.runtimes.delete(accountId);
    this.contexts.delete(accountId);
    return this.start(accountId);
  }
  connect(accountId) { return this.start(accountId); }
  disconnect(accountId) { return this.stop(accountId); }
  reconnect(accountId) { return this.restart(accountId); }
  async reauthorize(accountId) { const runtime=this.get(accountId); if(runtime) return runtime.reauthorize(); return this.start(accountId); }
  pause(accountId) { const runtime=this.get(accountId); if (!runtime) throw Object.assign(new Error('Account runtime is not running.'),{statusCode:409}); return runtime.pause(); }
  resume(accountId) { const runtime=this.get(accountId); if (!runtime) throw Object.assign(new Error('Account runtime is not running.'),{statusCode:409}); return runtime.resume(); }
  async remove(accountId, { force = false } = {}) { const runtime=this.get(accountId); if (runtime?.isCritical() && !force) throw Object.assign(new Error('Account has a critical operation in progress.'),{statusCode:409}); if(runtime) await runtime.destroy(); this.runtimes.delete(accountId); this.contexts.delete(accountId); return this.registry.remove(accountId); }
  async prepareForShutdown({ timeoutMs = 8_000 } = {}) {
    const protectRuntime = runtime => {
      if (typeof runtime.prepareForShutdown !== 'function') return Promise.resolve(null);
      let timer = null;
      return Promise.race([
        Promise.resolve(runtime.prepareForShutdown('Process shutdown')),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Shutdown preparation timed out for ${runtime.accountId}.`)), timeoutMs);
          timer.unref?.();
        })
      ]).finally(() => clearTimeout(timer));
    };
    return Promise.allSettled([...this.runtimes.values()].map(protectRuntime));
  }
  async shutdown({ prepare = true, prepareTimeoutMs = 8_000 } = {}) {
    const runtimeIds = [...this.runtimes.keys()];
    if (prepare) await this.prepareForShutdown({ timeoutMs: prepareTimeoutMs });
    await Promise.allSettled([...this.runtimes.values()].map(runtime => runtime.destroy()));
    this.runtimes.clear();
    for (const id of runtimeIds) this.contexts.delete(id);
  }
}

module.exports = { BotManager };
