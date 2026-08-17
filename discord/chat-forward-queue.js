'use strict';

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeFloodMessage(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

class DiscordChatForwardQueue {
  constructor({
    send,
    maxQueueSize = 20,
    maxAgeMs = 15_000,
    perUserBurst = 8,
    perUserWindowMs = 10_000,
    duplicateWindowMs = 5_000,
    summaryDelayMs = 5_000,
    minSendIntervalMs = 250,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onSuppressed = () => {},
    onError = error => console.error('[Discord Chat Queue]', error)
  } = {}) {
    if (typeof send !== 'function') throw new TypeError('DiscordChatForwardQueue requires a send function.');

    this.send = send;
    this.maxQueueSize = positiveInteger(maxQueueSize, 20);
    this.maxAgeMs = positiveInteger(maxAgeMs, 15_000);
    this.perUserBurst = positiveInteger(perUserBurst, 8);
    this.perUserWindowMs = positiveInteger(perUserWindowMs, 10_000);
    this.duplicateWindowMs = positiveInteger(duplicateWindowMs, 5_000, { min: 0 });
    this.summaryDelayMs = positiveInteger(summaryDelayMs, 5_000);
    this.minSendIntervalMs = positiveInteger(minSendIntervalMs, 250, { min: 0 });
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onSuppressed = onSuppressed;
    this.onError = onError;

    this.queue = [];
    this.userStates = new Map();
    this.processing = false;
    this.lastSendStartedAt = 0;
  }

  enqueue({
    username,
    message,
    allowMentions = true,
    createdAt = this.now(),
    source = 'unspecified',
    bypassFloodProtection = false
  }) {
    const safeUsername = String(username || 'Minecraft');
    const bypassFlood = Boolean(bypassFloodProtection);
    const state = this._getUserState(safeUsername);
    const cutoff = createdAt - this.perUserWindowMs;
    state.acceptedAt = state.acceptedAt.filter(timestamp => timestamp > cutoff);

    const normalizedMessage = normalizeFloodMessage(message);
    const duplicateCutoff = createdAt - this.duplicateWindowMs;
    for (const [key, timestamp] of state.recentMessages) {
      if (timestamp <= duplicateCutoff) state.recentMessages.delete(key);
    }

    if (
      this.duplicateWindowMs > 0 &&
      normalizedMessage &&
      state.recentMessages.has(normalizedMessage)
    ) {
      state.recentMessages.set(normalizedMessage, createdAt);
      this._notifySuppressed({ username: safeUsername, message, source, reason: 'duplicate-message' });
      // System messages retain duplicate collapsing, but a duplicate is not a
      // server flood and must not generate a flood-protection summary.
      if (!bypassFlood) this._recordSuppressed(safeUsername, 1);
      return Promise.resolve(true);
    }

    if (!bypassFlood && state.acceptedAt.length >= this.perUserBurst) {
      this._notifySuppressed({ username: safeUsername, message, source, reason: 'per-user-burst' });
      this._recordSuppressed(safeUsername, 1);
      return Promise.resolve(true);
    }

    if (!bypassFlood) state.acceptedAt.push(createdAt);
    if (this.duplicateWindowMs > 0 && normalizedMessage) {
      state.recentMessages.set(normalizedMessage, createdAt);
    }
    const queued = this._tryQueue({
      safeUsername,
      message,
      allowMentions,
      createdAt,
      source,
      isSummary: false,
      bypassFloodProtection: bypassFlood
    });
    if (queued) return queued;

    this._notifySuppressed({ username: safeUsername, message, source, reason: 'queue-capacity' });
    if (!bypassFlood) this._recordSuppressed(safeUsername, 1);
    return Promise.resolve(true);
  }

  get pendingCount() {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  _getUserState(username) {
    const key = username.toLowerCase();
    let state = this.userStates.get(key);
    if (!state) {
      state = { username, acceptedAt: [], recentMessages: new Map(), suppressed: 0, summaryTimer: null };
      this.userStates.set(key, state);
    } else {
      state.username = username;
    }
    return state;
  }

  _recordSuppressed(username, count) {
    const state = this._getUserState(username);
    state.suppressed += count;
    if (state.summaryTimer) this.clearTimer(state.summaryTimer);
    state.summaryTimer = this.setTimer(() => {
      state.summaryTimer = null;
      this._flushSummary(state);
    }, this.summaryDelayMs);
    state.summaryTimer?.unref?.();
  }

  _notifySuppressed(event) {
    try {
      this.onSuppressed(event);
    } catch (error) {
      this.onError(error);
    }
  }

  _flushSummary(state) {
    const count = state.suppressed;
    if (!count) return;

    state.suppressed = 0;
    const message = `Skipped ${count} ${count === 1 ? 'message' : 'messages'} due to chat flooding.`;
    const queued = this._tryQueue({
      safeUsername: state.username,
      message,
      allowMentions: false,
      createdAt: this.now(),
      source: 'discord-flood-summary',
      isSummary: true,
      summaryCount: count
    });

    if (!queued) this._recordSuppressed(state.username, count);
  }

  _tryQueue(item) {
    if (this.queue.length >= this.maxQueueSize && !this._makeFairQueueRoom(item)) return null;

    const promise = new Promise(resolve => {
      this.queue.push({ ...item, resolve });
    });
    this._process().catch(error => this.onError(error));
    return promise;
  }

  _makeFairQueueRoom(incoming) {
    if (incoming.isSummary) return false;

    const incomingKey = incoming.safeUsername.toLowerCase();
    const queuedByUser = new Map();
    for (const item of this.queue) {
      if (item.isSummary) continue;
      const key = item.safeUsername.toLowerCase();
      queuedByUser.set(key, (queuedByUser.get(key) || 0) + 1);
    }

    const incomingCount = queuedByUser.get(incomingKey) || 0;
    let crowdedKey = null;
    let crowdedCount = incomingCount;
    for (const [key, count] of queuedByUser) {
      if (key !== incomingKey && count >= incomingCount + 2 && count > crowdedCount) {
        crowdedKey = key;
        crowdedCount = count;
      }
    }
    if (!crowdedKey) return false;

    const evictedIndex = this.queue.findLastIndex(item =>
      !item.isSummary && item.safeUsername.toLowerCase() === crowdedKey
    );
    if (evictedIndex < 0) return false;

    const [evicted] = this.queue.splice(evictedIndex, 1);
    this._notifySuppressed({
      username: evicted.safeUsername,
      message: evicted.message,
      source: evicted.source,
      reason: 'queue-fairness'
    });
    if (!evicted.bypassFloodProtection) this._recordSuppressed(evicted.safeUsername, 1);
    evicted.resolve(true);
    return true;
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        const delay = Math.max(0, this.lastSendStartedAt + this.minSendIntervalMs - this.now());
        if (delay) await new Promise(resolve => this.setTimer(resolve, delay));

        if (this.now() - item.createdAt > this.maxAgeMs) {
          this._notifySuppressed({
            username: item.safeUsername,
            message: item.message,
            source: item.source,
            reason: 'stale'
          });
          if (item.isSummary) this._recordSuppressed(item.safeUsername, item.summaryCount || 0);
          else if (!item.bypassFloodProtection) this._recordSuppressed(item.safeUsername, 1);
          item.resolve(true);
          continue;
        }

        try {
          this.lastSendStartedAt = this.now();
          item.resolve(Boolean(await this.send({
            username: item.safeUsername,
            message: item.message,
            allowMentions: item.allowMentions,
            createdAt: item.createdAt,
            source: item.source,
            isSummary: item.isSummary,
            summaryCount: item.summaryCount
          })));
        } catch (error) {
          this.onError(error);
          item.resolve(false);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length) this._process().catch(error => this.onError(error));
    }
  }
}

module.exports = { DiscordChatForwardQueue, normalizeFloodMessage, positiveInteger };
