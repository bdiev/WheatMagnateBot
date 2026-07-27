'use strict';

function utcDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function anniversaryUtcDate(startDate, year) {
  const month = startDate.getUTCMonth();
  const day = startDate.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function buildPlayerMilestones(rows, { daysAhead = 365, limit = 12, now = new Date() } = {}) {
  const today = utcDateOnly(now);
  if (!today) return [];
  const dayMs = 24 * 60 * 60 * 1000;

  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const registeredAt = utcDateOnly(row.registration_at);
      if (!registeredAt || registeredAt > today) return null;

      let targetYear = today.getUTCFullYear();
      let milestoneAt = anniversaryUtcDate(registeredAt, targetYear);
      if (milestoneAt < today) {
        targetYear += 1;
        milestoneAt = anniversaryUtcDate(registeredAt, targetYear);
      }

      const years = targetYear - registeredAt.getUTCFullYear();
      const daysUntil = Math.round((milestoneAt - today) / dayMs);
      if (years < 1 || daysUntil < 0 || daysUntil > daysAhead) return null;

      return {
        username: row.username,
        years,
        daysUntil,
        milestoneAt: milestoneAt.toISOString(),
        registeredAt: row.registration_at,
        isRound: years % 5 === 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.daysUntil - b.daysUntil) || (b.years - a.years) || a.username.localeCompare(b.username))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function buildPlayerMilestonePush(milestones, dateKey) {
  const safeMilestones = (Array.isArray(milestones) ? milestones : []).map(milestone => ({
    username: String(milestone.username || '').slice(0, 64),
    years: Math.max(1, Math.round(Number(milestone.years) || 1)),
    isRound: Boolean(milestone.isRound)
  })).filter(milestone => milestone.username);

  if (!safeMilestones.length) return null;
  return {
    id: `player-milestones-${String(dateKey || '').replace(/[^0-9-]/g, '').slice(0, 10) || 'today'}`,
    event_type: 'player_milestone',
    severity: 'info',
    metadata: {
      dateKey: String(dateKey || '').slice(0, 10),
      milestones: safeMilestones
    }
  };
}

module.exports = { anniversaryUtcDate, buildPlayerMilestonePush, buildPlayerMilestones, utcDateOnly };
