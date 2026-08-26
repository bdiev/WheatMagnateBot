'use strict';

const {
  DEFAULT_KILL_AURA_RANGE,
  normalizeKillAuraRange
} = require('./range');
const TARGET_CREDIT_MS = 15_000;
const IDLE_TICK_MS = 250;
const PROJECTILE_ATTACK_COOLDOWN_MS = 100;
const PACKET_CRITICAL_HEIGHT = 0.0625;

const MATERIAL_DAMAGE = Object.freeze({
  wooden: { sword: 4, axe: 7 },
  golden: { sword: 4, axe: 7 },
  stone: { sword: 5, axe: 9 },
  iron: { sword: 6, axe: 9 },
  diamond: { sword: 7, axe: 9 },
  netherite: { sword: 8, axe: 10 }
});

const ATTACK_SPEED = Object.freeze({
  sword: 1.6,
  axe: 1,
  trident: 1.1,
  mace: 0.6
});
const AXE_ATTACK_SPEED = Object.freeze({
  wooden: 0.8,
  golden: 1,
  stone: 0.8,
  iron: 0.9,
  diamond: 1,
  netherite: 1
});

const UNDEAD_MOBS = new Set([
  'bogged', 'drowned', 'giant', 'husk', 'phantom', 'skeleton', 'skeleton_horse',
  'stray', 'wither', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_horse',
  'zombie_villager', 'zombified_piglin'
]);
const ARTHROPOD_MOBS = new Set(['bee', 'cave_spider', 'endermite', 'silverfish', 'spider']);

function normalizeMobName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, '')
    .replace(/[\s-]+/g, '_');
}

function itemEnchantments(item) {
  try {
    return Array.isArray(item?.enchants) ? item.enchants : [];
  } catch {
    return [];
  }
}

function enchantmentLevel(item, name) {
  const enchantment = itemEnchantments(item).find(entry =>
    normalizeMobName(entry?.name).replace(/^.*:/, '') === name
  );
  return Math.max(0, Number(enchantment?.lvl ?? enchantment?.level) || 0);
}

function weaponProfile(item, targetMobName = '') {
  const name = normalizeMobName(item?.name);
  let kind = null;
  let damage = 0;

  const materialMatch = name.match(/^(wooden|golden|stone|iron|diamond|netherite)_(sword|axe)$/);
  let material = null;
  if (materialMatch) {
    material = materialMatch[1];
    kind = materialMatch[2];
    damage = MATERIAL_DAMAGE[material][kind];
  } else if (name === 'trident') {
    kind = 'trident';
    damage = 9;
  } else if (name === 'mace') {
    kind = 'mace';
    damage = 6;
  } else {
    return null;
  }

  const maxDurability = Number(item?.maxDurability);
  const durabilityUsed = Number(item?.durabilityUsed);
  const remainingDurability = maxDurability > 0 && Number.isFinite(durabilityUsed)
    ? maxDurability - durabilityUsed
    : Number.POSITIVE_INFINITY;
  if (remainingDurability <= 1) return null;

  const target = normalizeMobName(targetMobName);
  const sharpness = enchantmentLevel(item, 'sharpness');
  const smite = UNDEAD_MOBS.has(target) ? enchantmentLevel(item, 'smite') : 0;
  const bane = ARTHROPOD_MOBS.has(target) ? enchantmentLevel(item, 'bane_of_arthropods') : 0;
  const enchantDamage = (sharpness ? 0.5 * sharpness + 0.5 : 0) + 2.5 * Math.max(smite, bane);
  const attackSpeed = kind === 'axe' ? AXE_ATTACK_SPEED[material] : ATTACK_SPEED[kind];
  const looting = enchantmentLevel(item, 'looting');

  return {
    item,
    kind,
    damage: damage + enchantDamage,
    attackSpeed,
    score: (damage + enchantDamage) * attackSpeed + looting * 0.01,
    cooldownMs: Math.ceil(1000 / attackSpeed),
    remainingDurability
  };
}

function selectBestWeapon(items, targetMobName = '') {
  return (Array.isArray(items) ? items : [])
    .map(item => weaponProfile(item, targetMobName))
    .filter(Boolean)
    .sort((first, second) =>
      second.score - first.score ||
      second.remainingDurability - first.remainingDurability ||
      Number(first.item?.slot ?? 0) - Number(second.item?.slot ?? 0)
    )[0] || null;
}

function entityMobName(entity) {
  if (entity?.type === 'player') return 'player';
  return normalizeMobName(entity?.name || entity?.mobType || entity?.displayName);
}

function isDeflectableProjectile(entity) {
  return entity?.type === 'projectile' && entityMobName(entity) === 'shulker_bullet';
}

function canPacketCritical(bot, target) {
  const entity = bot?.entity;
  return Boolean(
    bot?._client?.write &&
    target &&
    !isDeflectableProjectile(target) &&
    entity?.onGround &&
    !entity.isInWater &&
    !entity.isInLava &&
    !entity.isInWeb &&
    Number.isFinite(entity.position?.x) &&
    Number.isFinite(entity.position?.y) &&
    Number.isFinite(entity.position?.z)
  );
}

function writeCriticalPosition(bot, yOffset) {
  const { x, y, z } = bot.entity.position;
  bot._client.write('position', {
    x,
    y: y + yOffset,
    z,
    onGround: false,
    flags: { onGround: false, hasHorizontalCollision: false }
  });
}

function stopMovement(bot) {
  if (!bot) return;
  try { bot.pathfinder?.setGoal?.(null); } catch {}
  try { bot.pathfinder?.stop?.(); } catch {}
  for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sprint']) {
    try { bot.setControlState?.(control, false); } catch {}
  }
}

function createKillAuraFeature({
  attackRange = DEFAULT_KILL_AURA_RANGE,
  criticalsEnabled = false,
  onKill = () => {},
  onStatus = () => {}
} = {}) {
  const state = {
    desiredEnabled: false,
    active: false,
    targets: new Set(),
    bot: null,
    timer: null,
    busy: false,
    currentTarget: null,
    currentWeapon: null,
    lastAttackAt: 0,
    sessionKills: 0,
    sessionKillsByMob: new Map(),
    recentlyAttacked: new Map(),
    lastError: null,
    sessionStartedAt: null,
    lastStatusEmitAt: 0,
    attackRange: normalizeKillAuraRange(attackRange),
    criticalsEnabled: Boolean(criticalsEnabled),
    lastAttackWasCritical: false
  };

  function emitStatus(force = false) {
    if (!force && Date.now() - state.lastStatusEmitAt < 1_000) return;
    state.lastStatusEmitAt = Date.now();
    try { onStatus(getStatus()); } catch {}
  }

  function clearTimer() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  function schedule(delay = IDLE_TICK_MS) {
    clearTimer();
    if (!state.desiredEnabled || !state.bot?.entity) return;
    state.timer = setTimeout(() => tick().catch(error => {
      state.lastError = error?.message || String(error);
      emitStatus();
      schedule(750);
    }), Math.max(25, Number(delay) || IDLE_TICK_MS));
    state.timer.unref?.();
  }

  function isSelectedEntity(entity) {
    if (!entity?.position || entity === state.bot?.entity) return false;
    if (entity.type === 'player') {
      if (!state.targets.has('player')) return false;
      return !entity.username || entity.username.toLowerCase() !== String(state.bot?.username || '').toLowerCase();
    }
    const name = entityMobName(entity);
    return Boolean(name && state.targets.has(name));
  }

  function nearestTarget() {
    const botPosition = state.bot?.entity?.position;
    if (!botPosition) return null;
    return Object.values(state.bot.entities || {})
      .filter(isSelectedEntity)
      .map(entity => ({ entity, distance: botPosition.distanceTo(entity.position) }))
      .filter(candidate => Number.isFinite(candidate.distance) && candidate.distance <= state.attackRange)
      .sort((first, second) =>
        Number(isDeflectableProjectile(second.entity)) - Number(isDeflectableProjectile(first.entity)) ||
        first.distance - second.distance
      )[0] || null;
  }

  async function equipBestWeapon(targetName) {
    const bot = state.bot;
    const profile = selectBestWeapon(bot?.inventory?.items?.() || [], targetName);
    if (!profile) {
      state.currentWeapon = null;
      return { cooldownMs: 625, item: null };
    }
    state.currentWeapon = profile.item.name;
    if (bot.heldItem?.slot !== profile.item.slot) await bot.equip(profile.item, 'hand');
    return profile;
  }

  async function tick() {
    if (state.busy || !state.desiredEnabled || !state.bot?.entity) return;
    state.busy = true;
    let nextDelay = IDLE_TICK_MS;
    try {
      const bot = state.bot;
      // Kill Aura is deliberately stationary. Clear any stale movement left by
      // a previous task on every cycle and only rotate the view to attack.
      stopMovement(bot);
      const candidate = nearestTarget();
      if (!candidate) {
        if (state.currentTarget) stopMovement(bot);
        state.currentTarget = null;
        state.currentWeapon = bot.heldItem?.name || null;
        state.active = true;
        state.lastError = null;
        return;
      }

      const { entity, distance } = candidate;
      if (state.currentTarget?.id !== entity.id) {
        state.currentTarget = entity;
      }

      if (distance > state.attackRange) return;
      if (typeof bot.canSeeEntity === 'function' && !bot.canSeeEntity(entity)) return;

      const projectile = isDeflectableProjectile(entity);
      const profile = projectile
        ? { cooldownMs: PROJECTILE_ATTACK_COOLDOWN_MS, item: null }
        : await equipBestWeapon(entityMobName(entity));
      const cooldownMs = projectile
        ? PROJECTILE_ATTACK_COOLDOWN_MS
        : Math.max(250, profile.cooldownMs || 625);
      const waitMs = cooldownMs - (Date.now() - state.lastAttackAt);
      if (waitMs > 0) {
        nextDelay = Math.min(waitMs, 150);
        return;
      }

      const lookPosition = entity.position.offset(0, Math.max(0.2, Number(entity.height || 1) * 0.55), 0);
      await bot.lookAt?.(lookPosition, true);
      if (!state.desiredEnabled || state.bot !== bot || !bot.entity || !isSelectedEntity(entity)) return;
      state.lastAttackWasCritical = performPacketCritical(entity);
      bot.attack(entity);
      state.lastAttackAt = Date.now();
      state.recentlyAttacked.set(entity.id, { name: entityMobName(entity), attackedAt: state.lastAttackAt });
      state.lastError = null;
      nextDelay = Math.min(cooldownMs, 200);
    } finally {
      state.busy = false;
      emitStatus();
      schedule(nextDelay);
    }
  }

  function handleEntityDead(entity) {
    const credit = state.recentlyAttacked.get(entity?.id);
    state.recentlyAttacked.delete(entity?.id);
    if (!credit || Date.now() - credit.attackedAt > TARGET_CREDIT_MS) return;
    const name = entityMobName(entity) || credit.name;
    if (!name || !state.targets.has(name)) return;

    state.sessionKills += 1;
    state.sessionKillsByMob.set(name, (state.sessionKillsByMob.get(name) || 0) + 1);
    if (state.currentTarget?.id === entity.id) state.currentTarget = null;
    Promise.resolve(onKill({ mobName: name, entity, status: getStatus() })).catch(() => {});
    emitStatus(true);
  }

  function handleEntityGone(entity) {
    state.recentlyAttacked.delete(entity?.id);
    if (state.currentTarget?.id === entity?.id) state.currentTarget = null;
  }

  function attachBot(bot) {
    if (state.bot === bot) {
      if (state.desiredEnabled) schedule(25);
      return getStatus();
    }
    detachBot();
    state.bot = bot || null;
    if (state.bot) {
      state.bot.on?.('entityDead', handleEntityDead);
      state.bot.on?.('entityGone', handleEntityGone);
      if (state.desiredEnabled && state.bot.entity) {
        state.active = true;
        schedule(25);
      }
    }
    emitStatus(true);
    return getStatus();
  }

  function detachBot() {
    const previousBot = state.bot;
    clearTimer();
    if (previousBot) {
      previousBot.removeListener?.('entityDead', handleEntityDead);
      previousBot.removeListener?.('entityGone', handleEntityGone);
      if (state.active) stopMovement(previousBot);
    }
    state.bot = null;
    state.active = false;
    state.busy = false;
    state.currentTarget = null;
    state.currentWeapon = null;
    state.recentlyAttacked.clear();
    emitStatus(true);
    return getStatus();
  }

  function setTargets(targets) {
    state.targets = new Set((Array.isArray(targets) ? targets : []).map(normalizeMobName).filter(Boolean));
    if (!state.targets.has(entityMobName(state.currentTarget))) state.currentTarget = null;
    emitStatus(true);
    return getStatus();
  }

  function setAttackRange(value) {
    state.attackRange = normalizeKillAuraRange(value, state.attackRange);
    const targetDistance = state.currentTarget?.position && state.bot?.entity?.position
      ? state.bot.entity.position.distanceTo(state.currentTarget.position)
      : null;
    if (Number.isFinite(targetDistance) && targetDistance > state.attackRange) {
      state.currentTarget = null;
    }
    if (state.desiredEnabled) schedule(25);
    emitStatus(true);
    return getStatus();
  }

  function performPacketCritical(target) {
    if (!state.criticalsEnabled || !canPacketCritical(state.bot, target)) return false;
    try {
      writeCriticalPosition(state.bot, PACKET_CRITICAL_HEIGHT);
      writeCriticalPosition(state.bot, 0);
      return true;
    } catch {
      return false;
    }
  }

  function setCriticalsEnabled(enabled) {
    state.criticalsEnabled = Boolean(enabled);
    emitStatus(true);
    return getStatus();
  }

  function setEnabled(enabled, bot = state.bot) {
    const nextEnabled = Boolean(enabled);
    if (nextEnabled && !state.targets.size) throw new Error('Select at least one mob before enabling Kill Aura.');
    if (bot && bot !== state.bot) attachBot(bot);
    if (nextEnabled && !state.desiredEnabled) {
      state.sessionKills = 0;
      state.sessionKillsByMob.clear();
      state.sessionStartedAt = new Date().toISOString();
    }
    state.desiredEnabled = nextEnabled;
    state.active = Boolean(nextEnabled && state.bot?.entity);
    state.lastError = null;
    if (state.active) {
      stopMovement(state.bot);
      schedule(25);
    }
    else {
      clearTimer();
      stopMovement(state.bot);
      state.currentTarget = null;
      state.currentWeapon = null;
    }
    emitStatus(true);
    return getStatus();
  }

  function getStatus() {
    const target = state.currentTarget;
    const distance = target?.position && state.bot?.entity?.position
      ? state.bot.entity.position.distanceTo(target.position)
      : null;
    return {
      enabled: state.desiredEnabled,
      active: state.active,
      targets: [...state.targets],
      currentTarget: target ? {
        id: target.id,
        name: entityMobName(target),
        username: target.type === 'player' ? target.username || null : null,
        displayName: typeof target.displayName === 'string'
          ? target.displayName
          : String(target.mobType || entityMobName(target)),
        distance: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null
      } : null,
      currentWeapon: state.currentWeapon,
      sessionKills: state.sessionKills,
      sessionKillsByMob: Object.fromEntries(state.sessionKillsByMob),
      sessionStartedAt: state.sessionStartedAt,
      searchRange: state.attackRange,
      attackRange: state.attackRange,
      criticalsEnabled: state.criticalsEnabled,
      lastAttackWasCritical: state.lastAttackWasCritical,
      lastError: state.lastError
    };
  }

  return {
    attachBot,
    detachBot,
    setAttackRange,
    setCriticalsEnabled,
    setTargets,
    setEnabled,
    getStatus,
    __test: { isSelectedEntity, nearestTarget, performPacketCritical }
  };
}

module.exports = {
  createKillAuraFeature,
  entityMobName,
  isDeflectableProjectile,
  normalizeMobName,
  selectBestWeapon,
  weaponProfile
};
