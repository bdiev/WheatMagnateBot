'use strict';

const FLOOD_SUMMARY_COLOR = 0xFFA500;

// Viewer-facing wording for each summary reason from the forward queue.
const FLOOD_REASON_LABELS = {
  duplicate: 'repeated the same message',
  rate: 'sent too fast',
  stale: 'chat backlog'
};

function normalizeFloodSummaryReasons(reasons, fallbackCount = 0) {
  const normalized = {};
  for (const key of Object.keys(FLOOD_REASON_LABELS)) {
    normalized[key] = Math.max(0, Number.parseInt(reasons?.[key], 10) || 0);
  }
  // Legacy queue items carry only a total; attribute it to the rate limit.
  if (!countFloodSummaryReasons(normalized)) {
    normalized.rate = Math.max(1, Number.parseInt(fallbackCount, 10) || 1);
  }
  return normalized;
}

function countFloodSummaryReasons(reasons) {
  return Object.keys(FLOOD_REASON_LABELS).reduce((total, key) => total + (reasons?.[key] || 0), 0);
}

function mergeFloodSummaryReasons(left, right) {
  const merged = {};
  for (const key of Object.keys(FLOOD_REASON_LABELS)) {
    merged[key] = (left?.[key] || 0) + (right?.[key] || 0);
  }
  return merged;
}

function formatFloodSummaryDescription(reasons) {
  const total = countFloodSummaryReasons(reasons);
  const present = Object.keys(FLOOD_REASON_LABELS).filter(key => reasons[key] > 0);
  const details = present.length === 1
    ? FLOOD_REASON_LABELS[present[0]]
    : present.map(key => `${FLOOD_REASON_LABELS[key]} ×${reasons[key]}`).join(', ');
  return `🛡️ **${total} ${total === 1 ? 'message' : 'messages'} skipped** — ${details}`;
}

function buildFloodSummaryEmbed({ username, reasons, createdAt = Date.now() }) {
  const encodedName = encodeURIComponent(username);
  return {
    author: {
      name: username,
      url: `https://namemc.com/profile/${encodedName}`,
      icon_url: `https://render.namemc.com/skin/2d/face.png?skin=${encodedName}&scale=4`
    },
    description: formatFloodSummaryDescription(reasons),
    color: FLOOD_SUMMARY_COLOR,
    timestamp: new Date(createdAt)
  };
}

// Posts one compact summary per player and, while that player keeps flooding
// within the edit window, updates its counters in place instead of posting a
// new Discord message each time.
function createFloodSummaryPublisher({ editWindowMs = 60_000, maxEntries = 200, now = () => Date.now() } = {}) {
  const recent = new Map();

  return async function publishFloodSummary(channel, { username, createdAt = now(), summaryCount, summaryReasons }) {
    const key = `${channel?.id || ''}:${String(username).toLowerCase()}`;
    const reasons = normalizeFloodSummaryReasons(summaryReasons, summaryCount);
    const current = now();
    for (const [entryKey, entry] of recent) {
      if (current - entry.updatedAt > editWindowMs) recent.delete(entryKey);
    }

    const previous = recent.get(key);
    recent.delete(key);
    if (previous) {
      const merged = mergeFloodSummaryReasons(previous.reasons, reasons);
      try {
        await previous.message.edit({ embeds: [buildFloodSummaryEmbed({ username, reasons: merged, createdAt })] });
        recent.set(key, { message: previous.message, reasons: merged, updatedAt: current });
        return true;
      } catch {
        // The earlier summary was deleted or is no longer editable; post anew.
      }
    }

    const message = await channel.send({ embeds: [buildFloodSummaryEmbed({ username, reasons, createdAt })] });
    if (message && typeof message.edit === 'function') {
      recent.set(key, { message, reasons, updatedAt: current });
      while (recent.size > maxEntries) recent.delete(recent.keys().next().value);
    }
    return true;
  };
}

module.exports = {
  FLOOD_SUMMARY_COLOR,
  buildFloodSummaryEmbed,
  countFloodSummaryReasons,
  createFloodSummaryPublisher,
  formatFloodSummaryDescription,
  mergeFloodSummaryReasons,
  normalizeFloodSummaryReasons
};
