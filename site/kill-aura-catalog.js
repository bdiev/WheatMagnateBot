'use strict';

// Living entities from the newest Java entity registry shipped with the
// project's minecraft-data version. IDs are stable resource names and work
// across Mineflayer versions; unavailable mobs simply never become targets.
const KILL_AURA_MOBS = Object.freeze([
  ['allay', 'Allay', 'passive'], ['armadillo', 'Armadillo', 'passive'],
  ['axolotl', 'Axolotl', 'passive'], ['bat', 'Bat', 'passive'],
  ['bee', 'Bee', 'passive'], ['blaze', 'Blaze', 'hostile'],
  ['bogged', 'Bogged', 'hostile'], ['breeze', 'Breeze', 'hostile'],
  ['camel', 'Camel', 'passive'], ['cat', 'Cat', 'passive'],
  ['cave_spider', 'Cave Spider', 'hostile'], ['chicken', 'Chicken', 'passive'],
  ['cod', 'Cod', 'passive'], ['copper_golem', 'Copper Golem', 'passive'],
  ['cow', 'Cow', 'passive'], ['creaking', 'Creaking', 'hostile'],
  ['creeper', 'Creeper', 'hostile'], ['dolphin', 'Dolphin', 'passive'],
  ['donkey', 'Donkey', 'passive'], ['drowned', 'Drowned', 'hostile'],
  ['elder_guardian', 'Elder Guardian', 'hostile'], ['enderman', 'Enderman', 'hostile'],
  ['endermite', 'Endermite', 'hostile'], ['ender_dragon', 'Ender Dragon', 'hostile'],
  ['evoker', 'Evoker', 'hostile'], ['fox', 'Fox', 'passive'],
  ['frog', 'Frog', 'passive'], ['ghast', 'Ghast', 'hostile'],
  ['giant', 'Giant', 'hostile'], ['glow_squid', 'Glow Squid', 'passive'],
  ['goat', 'Goat', 'passive'], ['guardian', 'Guardian', 'hostile'],
  ['happy_ghast', 'Happy Ghast', 'passive'], ['hoglin', 'Hoglin', 'hostile'],
  ['horse', 'Horse', 'passive'], ['husk', 'Husk', 'hostile'],
  ['illusioner', 'Illusioner', 'hostile'], ['iron_golem', 'Iron Golem', 'passive'],
  ['llama', 'Llama', 'passive'], ['magma_cube', 'Magma Cube', 'hostile'],
  ['mooshroom', 'Mooshroom', 'passive'], ['mule', 'Mule', 'passive'],
  ['ocelot', 'Ocelot', 'passive'], ['panda', 'Panda', 'passive'],
  ['parrot', 'Parrot', 'passive'], ['phantom', 'Phantom', 'hostile'],
  ['pig', 'Pig', 'passive'], ['piglin', 'Piglin', 'hostile'],
  ['piglin_brute', 'Piglin Brute', 'hostile'], ['pillager', 'Pillager', 'hostile'],
  ['polar_bear', 'Polar Bear', 'passive'], ['pufferfish', 'Pufferfish', 'passive'],
  ['rabbit', 'Rabbit', 'passive'], ['ravager', 'Ravager', 'hostile'],
  ['salmon', 'Salmon', 'passive'], ['sheep', 'Sheep', 'passive'],
  ['shulker', 'Shulker', 'hostile'], ['silverfish', 'Silverfish', 'hostile'],
  ['skeleton', 'Skeleton', 'hostile'], ['skeleton_horse', 'Skeleton Horse', 'passive'],
  ['slime', 'Slime', 'hostile'], ['sniffer', 'Sniffer', 'passive'],
  ['snow_golem', 'Snow Golem', 'passive'], ['spider', 'Spider', 'hostile'],
  ['squid', 'Squid', 'passive'], ['stray', 'Stray', 'hostile'],
  ['strider', 'Strider', 'passive'], ['tadpole', 'Tadpole', 'passive'],
  ['trader_llama', 'Trader Llama', 'passive'], ['tropical_fish', 'Tropical Fish', 'passive'],
  ['turtle', 'Turtle', 'passive'], ['vex', 'Vex', 'hostile'],
  ['villager', 'Villager', 'passive'], ['vindicator', 'Vindicator', 'hostile'],
  ['wandering_trader', 'Wandering Trader', 'passive'], ['warden', 'Warden', 'hostile'],
  ['witch', 'Witch', 'hostile'], ['wither', 'Wither', 'hostile'],
  ['wither_skeleton', 'Wither Skeleton', 'hostile'], ['wolf', 'Wolf', 'passive'],
  ['zoglin', 'Zoglin', 'hostile'], ['zombie', 'Zombie', 'hostile'],
  ['zombie_horse', 'Zombie Horse', 'passive'], ['zombie_villager', 'Zombie Villager', 'hostile'],
  ['zombified_piglin', 'Zombified Piglin', 'hostile']
].map(([id, name, category]) => Object.freeze({ id, name, category })));

const KILL_AURA_MOB_IDS = new Set(KILL_AURA_MOBS.map(mob => mob.id));

function normalizeKillAuraTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return [...new Set(targets
    .map(value => String(value || '').trim().toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_'))
    .filter(value => KILL_AURA_MOB_IDS.has(value))
  )];
}

module.exports = { KILL_AURA_MOBS, KILL_AURA_MOB_IDS, normalizeKillAuraTargets };
