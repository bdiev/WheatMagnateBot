'use strict';

const RATE_WARMUP_MS = 60_000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getFarmName(row) {
  const name = String(row.display_name ?? row.displayName ?? row.username ?? '').trim();
  return name || 'Farm';
}

function getStoppedReason(row) {
  if (!(row.account_enabled ?? row.accountEnabled)) return 'account disabled';
  return 'farm turned off';
}

function getRecoveringReason(row) {
  const error = String(row.runtime_last_error ?? row.runtimeLastError ?? '').replace(/\s+/g, ' ').trim();
  if (error) return error.length > 60 ? `${error.slice(0, 57)}...` : error;
  const status = String(row.runtime_status ?? row.runtimeStatus ?? '').trim();
  if (status && status !== 'connected') return status;
  return 'reconnecting';
}

function summarizeAggregateObsidianRows(rows = [], now = Date.now()) {
  const summary = {
    accountCount: rows.length,
    miningCount: 0,
    recoveringCount: 0,
    stoppedCount: 0,
    sessionMined: 0,
    totalMined: 0,
    ratePerHour: 0,
    rateReady: true,
    recentRatePerHour: 0,
    recentRateReady: false,
    sessionStartedAt: null,
    farms: [],
    updatedAt: null
  };

  for (const row of rows) {
    const archived = row.account_archived === true || row.accountArchived === true;
    const mining = row.is_mining === true || row.isMining === true;
    const recovering = !mining && Boolean(row.account_enabled ?? row.accountEnabled) && Boolean(row.desired_enabled ?? row.desiredEnabled);
    const sessionMined = number(row.session_mined ?? row.sessionMined);
    summary.sessionMined += sessionMined;
    summary.totalMined += number(row.total_mined ?? row.totalMined);

    // Archived accounts retain their mined totals but are no longer farms that
    // can be mining, recovering, or stopped in the live status summary.
    if (archived) {
      summary.accountCount -= 1;
      continue;
    }

    const farm = {
      name: getFarmName(row),
      username: String(row.username ?? '').trim() || null,
      state: mining ? 'mining' : recovering ? 'recovering' : 'stopped',
      ratePerHour: 0,
      rateReady: false,
      reason: null
    };
    if (mining) summary.miningCount += 1;
    else if (recovering) {
      summary.recoveringCount += 1;
      farm.reason = getRecoveringReason(row);
    } else {
      summary.stoppedCount += 1;
      farm.reason = getStoppedReason(row);
    }

    const startedAt = timestamp(row.session_started_at ?? row.sessionStartedAt);
    if (Number.isFinite(startedAt) && (sessionMined > 0 || mining)
      && (!summary.sessionStartedAt || startedAt < summary.sessionStartedAt)) {
      summary.sessionStartedAt = startedAt;
    }

    if (mining) {
      const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
      if (elapsedMs < RATE_WARMUP_MS) summary.rateReady = false;
      else summary.ratePerHour += sessionMined / (elapsedMs / 3_600_000);

      // Recent production comes from hourly buckets covering the previous and
      // current hour. A session younger than that window is the recent rate
      // itself, which keeps blocks mined before a restart out of the figure.
      const windowMs = number(row.recent_window_ms ?? row.recentWindowMs);
      if (windowMs > 0 && elapsedMs >= windowMs) {
        farm.ratePerHour = number(row.recent_mined ?? row.recentMined) / (windowMs / 3_600_000);
        farm.rateReady = true;
      } else if (elapsedMs >= RATE_WARMUP_MS) {
        farm.ratePerHour = sessionMined / (elapsedMs / 3_600_000);
        farm.rateReady = true;
      }
      if (farm.rateReady) {
        summary.recentRatePerHour += farm.ratePerHour;
        summary.recentRateReady = true;
      }
    }

    summary.farms.push(farm);

    const updatedAt = row.updated_at ?? row.updatedAt;
    if (updatedAt && (!summary.updatedAt || new Date(updatedAt) > new Date(summary.updatedAt))) summary.updatedAt = updatedAt;
  }

  return summary;
}

function getTpsIndicator(tps) {
  if (tps === null || tps === undefined || !Number.isFinite(Number(tps))) return '';
  if (tps >= 18) return '🟢';
  if (tps >= 12) return '🟡';
  return '🔴';
}

module.exports = { summarizeAggregateObsidianRows, getTpsIndicator };
