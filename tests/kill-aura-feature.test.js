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
  .filter(entity => !['other', 'projectile', 'player', 'living'].includes(entity.type) || entity.name === 'shulker_bullet')
  .map(entity => entity.name)
  .sort();
assert.deepEqual(
  KILL_AURA_MOBS.filter(target => target.id !== 'player').map(mob => mob.id).sort(),
  registryMobs,
  'the selectable catalog must contain every living mob plus Shulker Bullet in addition to players'
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
bot.entity = { id: 1, onGround: true, position: { x: 10, y: 64, z: 20, distanceTo: () => 2 } };
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

const rangedAura = createKillAuraFeature({ attackRange: 1.4 });
bot.entity.position.distanceTo = position => position.distance;
bot.entities = {
  close: { id:11, name:'zombie', position:{ distance:1.4 } },
  far: { id:12, name:'zombie', position:{ distance:1.5 } }
};
rangedAura.setTargets(['zombie']);
rangedAura.attachBot(bot);
assert.equal(rangedAura.getStatus().attackRange, 1.4, 'the configured attack range is exposed in status');
assert.equal(rangedAura.__test.nearestTarget()?.entity.id, 11, 'targets outside the configured range are ignored');
assert.equal(rangedAura.setAttackRange(0.1).attackRange, 0.5, 'attack range is clamped to the slider minimum');
assert.equal(rangedAura.setAttackRange(9).attackRange, 3, 'attack range is clamped to the slider maximum');
assert.equal(rangedAura.setAttackRange(1.26).attackRange, 1.3, 'attack range follows the slider step');
rangedAura.detachBot();

const defenseAura = createKillAuraFeature({ attackRange: 3, criticalsEnabled: true });
const criticalPackets = [];
bot._client = { write: (name, packet) => criticalPackets.push({ name, packet }) };
bot.entity.position.distanceTo = position => position.distance;
const shulkerBullet = { id:13, type:'projectile', name:'shulker_bullet', height:0.3125, position:{ distance:2.5 } };
const closerZombie = { id:14, type:'hostile', name:'zombie', position:{ distance:1 } };
bot.entities = { shulkerBullet, closerZombie };
defenseAura.setTargets(['shulker_bullet', 'zombie']);
defenseAura.attachBot(bot);
assert.equal(defenseAura.__test.nearestTarget()?.entity.id, shulkerBullet.id, 'Shulker Bullets are deflected before closer living targets');
assert.equal(defenseAura.__test.performPacketCritical(shulkerBullet), false, 'projectiles never trigger Criticals packets');
assert.equal(defenseAura.__test.performPacketCritical(closerZombie), true, 'grounded living-target attacks use Packet Criticals');
assert.deepEqual(criticalPackets.map(entry => [entry.name, entry.packet.y, entry.packet.onGround]), [
  ['position', 64.0625, false],
  ['position', 64, false]
]);
defenseAura.setCriticalsEnabled(false);
assert.equal(defenseAura.getStatus().criticalsEnabled, false);
assert.equal(defenseAura.__test.performPacketCritical(closerZombie), false, 'disabled Criticals send no movement packets');
defenseAura.detachBot();

console.log('Kill Aura feature tests passed.');
