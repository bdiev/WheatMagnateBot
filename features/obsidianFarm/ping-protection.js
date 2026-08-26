'use strict';

const MAX_FARM_PING_MS = 150;

function botPingMs(bot) {
  const ping = Number(bot?.player?.ping);
  return Number.isFinite(ping) && ping >= 0 ? ping : null;
}

function isFarmPingTooHigh(ping, maximum = MAX_FARM_PING_MS) {
  return Number.isFinite(ping) && ping > maximum;
}

module.exports = { MAX_FARM_PING_MS, botPingMs, isFarmPingTooHigh };
