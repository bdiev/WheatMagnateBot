'use strict';

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

class DiscordChatForwardQueue {
  constructor({
    send,
    maxQueueSize = 20,
    maxAgeMs = 15_000,
    perUserBurst = 8,
    perUserWindowMs = 10_000,
    summaryDelayMs = 5_000,
    minSendIntervalMs = 250,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onError = error => console.error('[Discord Chat Queue]', error)
  } = {}) {
    if (typeof send !== 'function') throw new TypeError('DiscordChatForwardQueue requires a send function.');

    this.send = send;
    this.maxQueueSize = positiveInteger(maxQueueSize, 20);
    this.maxAgeMs = positiveInteger(maxAgeMs, 15_000);
    this.perUserBurst = positiveInteger(perUserBurst, 8);
    this.perUserWindowMs = positiveInteger(perUserWindowMs, 10_000);
    this.summaryDelayMs = positiveInteger(summaryDelayMs, 5_000);
    this.minSendIntervalMs = positiveInteger(minSendIntervalMs, 250, { min: 0 });
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onError = onError;

    this.queue = [];
    this.userStates = new Map();
    this.processing = false;
    this.lastSendStartedAt = 0;
  }

  enqueue({ username, message, allowMentions = true, createdAt = this.now() }) {
    const safeUsername = String(username || 'Minecraft');
    const state = this._getUserState(safeUsername);
    const cutoff = createdAt - this.perUserWindowMs;
    state.acceptedAt = state.acceptedAt.filter(timestamp => timestamp > cutoff);

    if (state.acceptedAt.length >= this.perUserBurst) {
      this._recordSuppressed(safeUsername, 1);
      return Promise.resolve(true);
    }

    state.acceptedAt.push(createdAt);
    const queued = this._tryQueue({ safeUsername, message, allowMentions, createdAt, isSummary: false });
    if (queued) return queued;

    this._recordSuppressed(safeUsername, 1);
    return Promise.resolve(true);
  }

  get pendingCount() {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  _getUserState(username) {
    const key = username.toLowerCase();
    let state = this.userStates.get(key);
    if (!state) {
      state = { username, acceptedAt: [], suppressed: 0, summaryTimer: null };
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
      isSummary: true,
      summaryCount: count
    });

    if (!queued) this._recordSuppressed(state.username, count);
  }

  _tryQueue(item) {
    if (this.queue.length >= this.maxQueueSize) return null;

    const promise = new Promise(resolve => {
      this.queue.push({ ...item, resolve });
    });
    this._process().catch(error => this.onError(error));
    return promise;
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
          if (item.isSummary) this._recordSuppressed(item.safeUsername, item.summaryCount || 0);
          else this._recordSuppressed(item.safeUsername, 1);
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
            isSummary: item.isSummary
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

module.exports = { DiscordChatForwardQueue, positiveInteger };
