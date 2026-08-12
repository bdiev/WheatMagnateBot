'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createKillAuraFeature,
  normalizeMobName,
  selectBestWeapon
} = require('../features/killAura');
const { KILL_AURA_MOBS, normalizeKillAuraTargets } = require('../site/kill-aura-catalog');

const registryMobs = require('minecraft-data')('1.21.9').entitiesArray
  .filter(entity => !['other', 'projectile', 'player', 'living'].includes(entity.type))
  .map(entity => entity.name)
  .sort();
assert.deepEqual(
  KILL_AURA_MOBS.filter(target => target.id !== 'player').map(mob => mob.id).sort(),
  registryMobs,
  'the selectable catalog must contain every living mob in the bundled Java registry in addition to players'
);
assert.deepEqual(normalizeKillAuraTargets(['Zombie', 'minecraft:cow', 'player']), ['zombie', 'cow', 'player']);

assert.equal(normalizeMobName('minecraft:Wither Skeleton'), 'wither_skeleton');

const weakSword = { name: 'iron_sword', slot: 1, maxDurability: 250, durabilityUsed: 5, enchants: [] };
const strongSword = { name: 'diamond_sword', slot: 2, maxDurability: 1561, durabilityUsed: 10, enchants: [] };
assert.equal(selectBestWeapon([weakSword, strongSword], 'cow').item, strongSword);

const smiteSword = {
  name: 'iron_sword', slot: 3, maxDurability: 250, durabilityUsed: 5,
  enchants: [{ name: 'smite', lvl: 5 }]
};
assert.equal(selectBestWeapon([strongSword, smiteSword], 'zombie').item, smiteSword);

const brokenSword = { name: 'netherite_sword', slot: 4, maxDurability: 2031, durabilityUsed: 2030, enchants: [] };
assert.equal(selectBestWeapon([brokenSword, weakSword], 'cow').item, weakSword);

const bot = new EventEmitter();
bot.entity = { id: 1, position: { distanceTo: () => 2 } };
bot.entities = {};
bot.inventory = { items: () => [strongSword] };
const pathfinderGoals = [];
bot.pathfinder = { setGoal(goal) { pathfinderGoals.push(goal); }, stop() {} };
bot.setControlState = () => {};
bot.equip = async () => {};
bot.lookAt = async () => {};
bot.attack = () => {};
bot.canSeeEntity = () => true;

let creditedKill = null;
const aura = createKillAuraFeature({ onKill: kill => { creditedKill = kill; } });
aura.setTargets(['zombie', 'cow']);
aura.attachBot(bot);
aura.setEnabled(true);
assert.equal(aura.getStatus().enabled, true);
assert.deepEqual(aura.getStatus().targets, ['zombie', 'cow']);
assert.ok(pathfinderGoals.every(goal => goal == null), 'Kill Aura must never assign a walking goal');
aura.setEnabled(false);
assert.equal(aura.getStatus().active, false);
assert.equal(creditedKill, null);
aura.detachBot();

const playerAura = createKillAuraFeature();
bot.username = 'AuraBot';
bot.entities = {
  steve: { id:9, type:'player', username:'Steve', position:{ distanceTo:() => 2 } }
};
playerAura.setTargets(['player']);
playerAura.attachBot(bot);
assert.equal(playerAura.__test.isSelectedEntity(bot.entities.steve), true, 'a visible player is eligible when Player is selected');
assert.equal(
  playerAura.__test.isSelectedEntity({ id:10, type:'player', username:'AuraBot', position:{ distanceTo:() => 1 } }),
  false,
  'Kill Aura never targets its own Minecraft account'
);
playerAura.setEnabled(true);
assert.deepEqual(playerAura.getStatus().targets, ['player'], 'players can be selected as a Kill Aura target type');
playerAura.setEnabled(false);
playerAura.detachBot();

console.log('Kill Aura feature tests passed.');
