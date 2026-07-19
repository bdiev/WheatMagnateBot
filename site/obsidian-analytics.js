'use strict';

const HOUR = 3_600_000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function confidence(sampleHours, extra = '') {
  const hours = Math.max(0, number(sampleHours));
  let level = 'insufficient';
  let score = 0;
  if (hours >= 72) { level = 'high'; score = 90; }
  else if (hours >= 24) { level = 'medium'; score = 70; }
  else if (hours >= 6) { level = 'low'; score = 40; }
  const explanation = level === 'insufficient'
    ? 'Недостаточно данных: нужно не менее 6 часов наблюдений.'
    : `Расчёт основан на ${round(hours, 1)} ч наблюдений${extra ? `; ${extra}` : ''}.`;
  return { level, score, sampleHours: round(hours, 1), explanation };
}

function summarizeLocation(location) {
  const items = Array.isArray(location?.items) ? location.items : [];
  const foodCount = location?.foodCount == null
    ? items.filter(item => /bread|apple|beef|steak|porkchop|carrot|potato/.test(item.name || '')).reduce((s, i) => s + number(i.count), 0)
    : number(location.foodCount);
  const pickaxes = items.filter(item => /pickaxe/.test(item.name || '') && item.usable !== false);
  return { foodCount, pickaxes };
}

function summarizeSupplies(supplies) {
  const inventory = summarizeLocation(supplies?.inventory);
  const barrel = summarizeLocation(supplies?.barrel);
  const pickaxes = [...inventory.pickaxes, ...barrel.pickaxes];
  const maxDurability = { diamond_pickaxe: 1561, netherite_pickaxe: 2031 };
  return {
    food: inventory.foodCount + barrel.foodCount,
    pickaxes: pickaxes.length,
    durabilityUnits: pickaxes.reduce((sum, item) => {
      const maximum = maxDurability[item.name] || 0;
      return sum + maximum * Math.max(0, Math.min(100, number(item.remainingPercent ?? 100))) / 100;
    }, 0)
  };
}

function calculateDowntime(annotations, fromMs, toMs) {
  const startTypes = new Set(['farm_stalled', 'pause', 'bot_disconnected']);
  const endTypes = new Set(['farm_resumed', 'resume', 'bot_reconnected']);
  const events = (annotations || []).map(row => ({ ...row, at: new Date(row.occurredAt || row.occurred_at).getTime() }))
    .filter(row => Number.isFinite(row.at) && row.at <= toMs).sort((a, b) => a.at - b.at);
  let openAt = null;
  let downMs = 0;
  const stops = [];
  for (const event of events) {
    const type = event.eventType || event.event_type;
    if (startTypes.has(type) && openAt == null) {
      openAt = Math.max(fromMs, event.at);
      if (event.at >= fromMs) stops.push(event.at);
    } else if (endTypes.has(type) && openAt != null) {
      downMs += Math.max(0, Math.min(toMs, event.at) - openAt);
      openAt = null;
    }
  }
  if (openAt != null) downMs += Math.max(0, toMs - openAt);
  const gaps = stops.slice(1).map((at, i) => at - stops[i]);
  return {
    percent: round((downMs / Math.max(1, toMs - fromMs)) * 100, 1),
    stopCount: stops.length,
    meanHoursBetweenStops: gaps.length ? round(gaps.reduce((a, b) => a + b, 0) / gaps.length / HOUR, 1) : null
  };
}

function supplyConsumptionPerHour(history, key, nowMs) {
  const points = (history || []).map(row => {
    const supplies = row.supplies || row;
    const at = new Date(row.observedAt || row.observed_at || supplies.observedAt).getTime();
    return { at, value: summarizeSupplies(supplies)[key] };
  }).filter(point => Number.isFinite(point.at) && nowMs - point.at <= 7 * 24 * HOUR).sort((a, b) => a.at - b.at);
  let consumed = 0;
  let observedMs = 0;
  for (let i = 1; i < points.length; i++) {
    const elapsed = points[i].at - points[i - 1].at;
    if (elapsed <= 0 || elapsed > 12 * HOUR) continue;
    observedMs += elapsed;
    const drop = points[i - 1].value - points[i].value;
    if (drop > 0) consumed += drop; // refills are deliberately ignored
  }
  return { rate: observedMs >= 6 * HOUR ? consumed / (observedMs / HOUR) : 0, sampleHours: observedMs / HOUR };
}

function calculateAnalytics(input = {}) {
  const nowMs = new Date(input.now || Date.now()).getTime();
  const hourly = (input.hourly || []).map(row => ({
    at: new Date(row.bucket).getTime(), value: number(row.value ?? row.mined), observed: row.observed !== false && (row.observed === true || number(row.value ?? row.mined) > 0)
  })).filter(row => Number.isFinite(row.at) && row.at <= nowMs).sort((a, b) => a.at - b.at);
  const firstObserved = hourly.find(row => row.observed)?.at;
  const completed = firstObserved == null ? [] : hourly.filter(row => row.at >= firstObserved && row.at + HOUR <= nowMs && row.at >= nowMs - 7 * 24 * HOUR);
  const activeHours = completed.length;
  const mined = completed.reduce((sum, row) => sum + row.value, 0);
  const rawRate = activeHours ? mined / activeHours : 0;
  const downtime = calculateDowntime(input.annotations, nowMs - 7 * 24 * HOUR, nowMs);
  const uptime = Math.max(0, 1 - downtime.percent / 100);
  const adjustedRate = rawRate * uptime;
  const forecastConfidence = confidence(activeHours, 'учтён зафиксированный простой');
  const state = input.farm || {};
  const blocksPerPickaxe = number(state.blocksPerPickaxe) || (number(state.retiredPickaxes) > 0
    ? number(state.retiredPickaxeBlocks) / number(state.retiredPickaxes) : 0);
  const toolUsage = (input.toolUsage || []).filter(row => number(row.durabilityUsed ?? row.durability_used) > 0);
  const usedDurability = toolUsage.reduce((sum, row) => sum + number(row.durabilityUsed ?? row.durability_used), 0);
  const durabilityBlocks = toolUsage.reduce((sum, row) => sum + number(row.blocksMined ?? row.blocks_mined), 0);
  const blocksPerDurability = usedDurability > 0 ? durabilityBlocks / usedDurability : 0;
  const supplies = summarizeSupplies(input.supplies || {});
  const pickHours = blocksPerDurability > 0 && adjustedRate > 0
    ? supplies.durabilityUnits * blocksPerDurability / adjustedRate : null;
  const foodConsumption = supplyConsumptionPerHour(input.supplyHistory, 'food', nowMs);
  const foodHours = foodConsumption.rate > 0 ? supplies.food / foodConsumption.rate : null;
  const goal = (input.goals || []).find(item => item.active !== false && number(item.targetTotal ?? item.target_total) > number(state.totalMined));
  const remainingGoal = goal ? number(goal.targetTotal ?? goal.target_total) - number(state.totalMined) : null;

  const recent = completed.slice(-3);
  const baseline = completed.slice(-15, -3);
  const recentRate = recent.length ? recent.reduce((s, r) => s + r.value, 0) / recent.length : 0;
  const baselineRate = baseline.length ? baseline.reduce((s, r) => s + r.value, 0) / baseline.length : 0;
  const tps = (input.tps || []).map(row => number(row.tps)).filter(Boolean);
  const tpsAvg = tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : 0;
  const tpsDeviation = tps.length ? Math.sqrt(tps.reduce((sum, value) => sum + (value - tpsAvg) ** 2, 0) / tps.length) : 0;
  const recentPickaxeChanges = (input.annotations || []).filter(item => {
    const type = item.eventType || item.event_type;
    const at = new Date(item.occurredAt || item.occurred_at).getTime();
    return type === 'pickaxe_changed' && at >= nowMs - 24 * HOUR;
  });
  const recentPickaxeBlocks = recentPickaxeChanges.map(item => number(item.details?.blocksMined)).filter(value => value > 0);
  const recentBlocksPerPickaxe = recentPickaxeBlocks.length ? recentPickaxeBlocks.reduce((a, b) => a + b, 0) / recentPickaxeBlocks.length : 0;
  const anomalies = [];
  if (recent.length >= 3 && baseline.length >= 6 && baselineRate > 0 && recentRate < baselineRate * 0.5) anomalies.push({ type: 'rate_drop', severity: 'warning', message: `Скорость упала на ${round((1 - recentRate / baselineRate) * 100)}%.` });
  const enabledWithoutDataHours = state.sessionStartedAt ? (nowMs - new Date(state.sessionStartedAt).getTime()) / HOUR : 0;
  if (state.desiredEnabled && ((recent.length && recent.every(row => row.value === 0)) || (!completed.length && enabledWithoutDataHours >= 1))) anomalies.push({ type: 'zero_production', severity: 'critical', message: 'Ферма включена, но добыча за последние завершённые часы равна нулю.' });
  if (tps.length >= 6 && (tpsDeviation > 2 || tps.filter(value => value < 15).length / tps.length > 0.2)) anomalies.push({ type: 'unstable_tps', severity: 'warning', message: `TPS нестабилен (σ ${round(tpsDeviation, 1)}).` });
  if (recentPickaxeBlocks.length >= 2 && blocksPerPickaxe > 0 && recentBlocksPerPickaxe < blocksPerPickaxe * 0.5) anomalies.push({ type: 'pickaxe_consumption', severity: 'warning', message: 'Расход кирок выше исторического: добыча на смену упала более чем вдвое.' });

  const today = number(input.comparison?.today);
  const yesterdayComparable = number(input.comparison?.yesterdayComparable ?? input.comparison?.yesterday);
  const week = number(input.comparison?.week);
  const previousWeek = number(input.comparison?.previousWeek);
  const compare = (current, previous) => ({ current, previous, percent: previous > 0 ? round((current - previous) / previous * 100, 1) : null });

  return {
    efficiency: {
      obsidianPerHour: round(rawRate, 1), obsidianPerPickaxe: blocksPerPickaxe ? round(blocksPerPickaxe, 1) : null,
      obsidianPerDurabilityUnit: blocksPerDurability ? round(blocksPerDurability, 2) : null,
      downtimePercent: downtime.percent, meanHoursBetweenStops: downtime.meanHoursBetweenStops,
      stopCount: downtime.stopCount
    },
    forecast: {
      confidence: forecastConfidence,
      pickaxes: { hours: pickHours == null ? null : round(pickHours, 1), at: pickHours == null ? null : new Date(nowMs + pickHours * HOUR).toISOString(), explanation: blocksPerDurability ? 'Оставшиеся единицы durability × фактическая добыча на потраченную единицу.' : 'Нет статистики фактически потраченной прочности.' },
      food: { hours: foodHours == null ? null : round(foodHours, 1), at: foodHours == null ? null : new Date(nowMs + foodHours * HOUR).toISOString(), confidence: confidence(foodConsumption.sampleHours), explanation: foodHours == null ? 'Нужно минимум 6 часов истории snapshots с наблюдаемым расходом еды.' : 'По фактическому снижению количества еды между snapshots; пополнения исключены.' },
      expected24h: forecastConfidence.level === 'insufficient' ? null : Math.round(adjustedRate * 24),
      expected7d: forecastConfidence.level === 'insufficient' ? null : Math.round(adjustedRate * 168),
      goal: goal ? { id: goal.id, name: goal.name, targetTotal: number(goal.targetTotal ?? goal.target_total), remaining: remainingGoal, at: adjustedRate > 0 && forecastConfidence.level !== 'insufficient' ? new Date(nowMs + remainingGoal / adjustedRate * HOUR).toISOString() : null } : null
    },
    comparisons: { today: compare(today, yesterdayComparable), week: compare(week, previousWeek) },
    anomalies
  };
}

module.exports = { calculateAnalytics, calculateDowntime, summarizeSupplies, confidence };
