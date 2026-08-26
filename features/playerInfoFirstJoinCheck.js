'use strict';

const DEFAULT_INITIAL_DELAY_MIN_MS = 10_000;
const DEFAULT_INITIAL_DELAY_MAX_MS = 15_000;
const DEFAULT_COMMAND_DELAY_MIN_MS = 12_000;
const DEFAULT_COMMAND_DELAY_MAX_MS = 45_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 25_000;
const MIN_PLAYTIME_SECONDS = 10 * 60;
const MIN_MESSAGES = 5;
const MIN_ACCOUNT_AGE_MS = 10 * 60 * 1000;

const METRICS = Object.freeze([
  { metric: 'playtime', command: '!pt' },
  { metric: 'messages', command: '!msgs' },
  { metric: 'joinDate', command: '!jd' }
]);

function normalizeUsername(value) {
  const username = String(value || '').trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : '';
}

function milliseconds(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function randomMilliseconds(minimum, maximum, random = Math.random) {
  const safeMinimum = Math.max(0, Math.floor(Number(minimum) || 0));
  const safeMaximum = Math.max(safeMinimum, Math.floor(Number(maximum) || safeMinimum));
  const sample = Math.max(0, Math.min(0.9999999999999999, Number(random()) || 0));
  return safeMinimum + Math.floor(sample * (safeMaximum - safeMinimum + 1));
}

function passesFirstJoinThreshold(metric, observedValue, now = Date.now(), { observedAgeMs } = {}) {
  if (metric === 'playtime') {
    return Number.isFinite(observedValue) && observedValue >= MIN_PLAYTIME_SECONDS;
  }
  if (metric === 'messages') {
    return Number.isSafeInteger(observedValue) && observedValue >= MIN_MESSAGES;
  }
  if (metric === 'joinDate') {
    if (Number.isFinite(observedAgeMs)) return observedAgeMs >= MIN_ACCOUNT_AGE_MS;
    const observedAt = observedValue instanceof Date
      ? observedValue.getTime()
      : new Date(observedValue).getTime();
    return Number.isFinite(observedAt) && now - observedAt >= MIN_ACCOUNT_AGE_MS;
  }
  return false;
}

function createPlayerInfoFirstJoinCheck({
  isReady = () => false,
  selectSender = () => null,
  prepareLookup = async () => true,
  sendCommand = () => false,
  initialDelayMinMs,
  initialDelayMaxMs,
  commandDelayMinMs,
  commandDelayMaxMs,
  responseTimeoutMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
  random = Math.random,
  onLog = message => console.log(message),
  onError = error => console.error('[PlayerInfo] First-join check failed:', error?.message || error)
} = {}) {
  const safeInitialDelayMinMs = milliseconds(
    initialDelayMinMs,
    DEFAULT_INITIAL_DELAY_MIN_MS
  );
  const safeInitialDelayMaxMs = Math.max(safeInitialDelayMinMs, milliseconds(
    initialDelayMaxMs,
    DEFAULT_INITIAL_DELAY_MAX_MS
  ));
  const safeCommandDelayMinMs = milliseconds(
    commandDelayMinMs,
    DEFAULT_COMMAND_DELAY_MIN_MS
  );
  const safeCommandDelayMaxMs = Math.max(safeCommandDelayMinMs, milliseconds(
    commandDelayMaxMs,
    DEFAULT_COMMAND_DELAY_MAX_MS
  ));
  const safeResponseTimeoutMs = milliseconds(
    responseTimeoutMs,
    DEFAULT_RESPONSE_TIMEOUT_MS,
    1
  );
  const jobs = new Map();
  let enabled = true;

  function clearJobTimer(job, field) {
    if (job[field] != null) clearTimer(job[field]);
    job[field] = null;
  }

  function finish(job, message) {
    clearJobTimer(job, 'timer');
    clearJobTimer(job, 'responseTimer');
    jobs.delete(job.key);
    if (message) onLog(message);
  }

  function schedule(job, minimum, maximum) {
    if (!enabled || jobs.get(job.key) !== job) return;
    clearJobTimer(job, 'timer');
    job.timer = setTimer(() => {
      job.timer = null;
      sendNext(job).catch(error => {
        onError(error);
        finish(job);
      });
    }, randomMilliseconds(minimum, maximum, random));
    job.timer?.unref?.();
  }

  async function sendNext(job) {
    if (!enabled || jobs.get(job.key) !== job || job.pendingMetric || job.waitingForLeave) return;
    if (!isReady()) {
      finish(job, `[PlayerInfo] Stopped first-join check for ${job.username}: no connected command sender.`);
      return;
    }

    const remaining = METRICS.filter(definition => job.remaining.has(definition.metric));
    if (remaining.length === 0) {
      finish(job, `[PlayerInfo] Completed first-join check for ${job.username}.`);
      return;
    }
    const definition = remaining[randomMilliseconds(0, remaining.length - 1, random)];
    const item = {
      metric: definition.metric,
      username: job.username,
      command: `${definition.command} ${job.username}`
    };
    const prepared = await prepareLookup(item);
    if (prepared === false) throw new Error(`Could not prepare ${item.command}.`);

    if (!job.sender) job.sender = await selectSender(item, job);
    if (job.waitingForLeave) return;
    if (!sendCommand(item.command, item, job.sender)) {
      finish(job, `[PlayerInfo] Stopped first-join check for ${job.username}: command could not be sent.`);
      return;
    }

    job.pendingMetric = item.metric;
    job.hasSentCommand = true;
    onLog(`[PlayerInfo] First-join check sent ${item.command}.`);
    job.responseTimer = setTimer(() => {
      job.responseTimer = null;
      finish(job, `[PlayerInfo] Stopped first-join check for ${job.username}: ${item.metric} response timed out.`);
    }, safeResponseTimeoutMs);
    job.responseTimer?.unref?.();
  }

  function enqueue(targetUsername) {
    const username = normalizeUsername(targetUsername);
    if (!enabled || !username) return false;
    const key = username.toLowerCase();
    if (jobs.has(key)) return false;

    const queuedAt = now();
    const job = {
      key,
      username,
      remaining: new Set(METRICS.map(definition => definition.metric)),
      pendingMetric: null,
      sender: null,
      waitingForLeave: true,
      hasSentCommand: false,
      queuedAt,
      onlineSince: queuedAt,
      accumulatedOnlineMs: 0,
      observedMessages: 0,
      timer: null,
      responseTimer: null
    };
    jobs.set(key, job);
    onLog(`[PlayerInfo] Queued first-join check for ${username} until the player leaves.`);
    return true;
  }

  function playerJoined(targetUsername) {
    const username = normalizeUsername(targetUsername);
    const job = jobs.get(username.toLowerCase());
    if (!job) return false;
    job.waitingForLeave = true;
    if (job.onlineSince == null) job.onlineSince = now();
    clearJobTimer(job, 'timer');
    return true;
  }

  function playerLeft(targetUsername) {
    const username = normalizeUsername(targetUsername);
    const job = jobs.get(username.toLowerCase());
    if (!job || !job.waitingForLeave) return false;
    if (job.onlineSince != null) {
      job.accumulatedOnlineMs += Math.max(0, now() - job.onlineSince);
      job.onlineSince = null;
    }
    job.waitingForLeave = false;
    if (!job.pendingMetric) {
      schedule(
        job,
        job.hasSentCommand ? safeCommandDelayMinMs : safeInitialDelayMinMs,
        job.hasSentCommand ? safeCommandDelayMaxMs : safeInitialDelayMaxMs
      );
    }
    onLog(`[PlayerInfo] Player ${job.username} left; first-join check will continue after a delay.`);
    return true;
  }

  function observePlayerMessage(targetUsername) {
    const username = normalizeUsername(targetUsername);
    const job = jobs.get(username.toLowerCase());
    if (!job) return false;
    job.observedMessages += 1;
    return true;
  }

  function thresholdObservationAtFirstJoin(job, metric, observedValue, observedAgeMs) {
    if (metric === 'playtime' && Number.isFinite(observedValue)) {
      return {
        observedValue: Math.max(0, observedValue - Math.floor(job.accumulatedOnlineMs / 1000)),
        observedAgeMs
      };
    }
    if (metric === 'messages' && Number.isSafeInteger(observedValue)) {
      return {
        observedValue: Math.max(0, observedValue - job.observedMessages),
        observedAgeMs
      };
    }
    if (metric === 'joinDate' && Number.isFinite(observedAgeMs)) {
      return {
        observedValue,
        observedAgeMs: Math.max(0, observedAgeMs - Math.max(0, now() - job.queuedAt))
      };
    }
    return { observedValue, observedAgeMs };
  }

  function observe({ metric, targetUsername, observedValue, observedAgeMs, reason } = {}) {
    if (reason !== 'first-join') return false;
    const username = normalizeUsername(targetUsername);
    const job = jobs.get(username.toLowerCase());
    if (!job || job.pendingMetric !== metric) return false;

    clearJobTimer(job, 'responseTimer');
    job.pendingMetric = null;
    const initialObservation = thresholdObservationAtFirstJoin(
      job,
      metric,
      observedValue,
      observedAgeMs
    );
    if (!passesFirstJoinThreshold(
      metric,
      initialObservation.observedValue,
      job.queuedAt,
      { observedAgeMs: initialObservation.observedAgeMs }
    )) {
      finish(job, `[PlayerInfo] Stopped first-join check for ${job.username}: ${metric} is below the minimum threshold.`);
      return true;
    }

    job.remaining.delete(metric);
    if (job.remaining.size === 0) {
      finish(job, `[PlayerInfo] Completed first-join check for ${job.username}.`);
    } else if (job.waitingForLeave) {
      onLog(`[PlayerInfo] Paused first-join check for ${job.username} until the player leaves again.`);
    } else {
      schedule(job, safeCommandDelayMinMs, safeCommandDelayMaxMs);
    }
    return true;
  }

  function stop() {
    enabled = false;
    for (const job of jobs.values()) finish(job);
  }

  return {
    enqueue,
    observe,
    observePlayerMessage,
    playerJoined,
    playerLeft,
    stop,
    getStatus: () => ({
      enabled,
      pendingPlayers: jobs.size,
      waitingForLeave: [...jobs.values()].filter(job => job.waitingForLeave).length
    })
  };
}

module.exports = {
  DEFAULT_COMMAND_DELAY_MAX_MS,
  DEFAULT_COMMAND_DELAY_MIN_MS,
  DEFAULT_INITIAL_DELAY_MAX_MS,
  DEFAULT_INITIAL_DELAY_MIN_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  MIN_ACCOUNT_AGE_MS,
  MIN_MESSAGES,
  MIN_PLAYTIME_SECONDS,
  createPlayerInfoFirstJoinCheck,
  passesFirstJoinThreshold
};
