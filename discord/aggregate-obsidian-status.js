'use strict';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    updatedAt: null
  };

  for (const row of rows) {
    const mining = row.is_mining === true || row.isMining === true;
    const recovering = !mining && Boolean(row.account_enabled ?? row.accountEnabled) && Boolean(row.desired_enabled ?? row.desiredEnabled);
    summary.sessionMined += number(row.session_mined ?? row.sessionMined);
    summary.totalMined += number(row.total_mined ?? row.totalMined);

    if (mining) summary.miningCount += 1;
    else if (recovering) summary.recoveringCount += 1;
    else summary.stoppedCount += 1;

    if (mining) {
      const rawStartedAt = row.session_started_at ?? row.sessionStartedAt;
      const startedAt = rawStartedAt ? new Date(rawStartedAt).getTime() : Number.NaN;
      const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
      if (elapsedMs < 60_000) summary.rateReady = false;
      else summary.ratePerHour += number(row.session_mined ?? row.sessionMined) / (elapsedMs / 3_600_000);
    }

    const updatedAt = row.updated_at ?? row.updatedAt;
    if (updatedAt && (!summary.updatedAt || new Date(updatedAt) > new Date(summary.updatedAt))) summary.updatedAt = updatedAt;
  }

  return summary;
}

module.exports = { summarizeAggregateObsidianRows };
