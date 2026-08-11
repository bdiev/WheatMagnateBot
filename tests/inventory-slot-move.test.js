'use strict';

const assert = require('node:assert/strict');
const { moveInventorySlot, normalizeInventorySlot } = require('../minecraft/inventory-slot-move');

function item(name, count, slot, stackSize = 64) {
  return { name, displayName: name, count, slot, stackSize };
}

function createBot(slots) {
  return {
    entity: {},
    inventory: { slots, selectedItem: null },
    async moveSlotItem(sourceSlot, targetSlot) {
      const source = this.inventory.slots[sourceSlot] || null;
      const target = this.inventory.slots[targetSlot] || null;
      this.inventory.slots[targetSlot] = source ? { ...source, slot: targetSlot } : null;
      this.inventory.slots[sourceSlot] = target ? { ...target, slot: sourceSlot } : null;
    }
  };
}

async function main() {
  assert.equal(normalizeInventorySlot(9, 'Slot'), 9);
  assert.equal(normalizeInventorySlot(45, 'Slot'), 45);
  assert.throws(() => normalizeInventorySlot(4, 'Slot'), /not a movable/);
  assert.throws(() => normalizeInventorySlot(46, 'Slot'), /not a movable/);

  const slots = [];
  slots[9] = item('stone', 32, 9);
  const bot = createBot(slots);
  const moved = await moveInventorySlot(bot, {
    sourceSlot: 9,
    targetSlot: 10,
    expectedSource: { name: 'stone', count: 32 },
    expectedTarget: null
  });
  assert.equal(moved.target.name, 'stone');
  assert.equal(bot.inventory.slots[9], null);
  assert.equal(bot.inventory.slots[10].slot, 10);

  slots[11] = item('bread', 4, 11);
  slots[12] = item('diamond_pickaxe', 1, 12, 1);
  await moveInventorySlot(bot, {
    sourceSlot: 11,
    targetSlot: 12,
    expectedSource: { name: 'bread', count: 4 },
    expectedTarget: { name: 'diamond_pickaxe', count: 1 }
  });
  assert.equal(slots[11].name, 'diamond_pickaxe', 'occupied slots are swapped');
  assert.equal(slots[12].name, 'bread');

  slots[13] = { ...item('diamond_pickaxe', 1, 13, 1), durabilityUsed: 120 };
  slots[14] = { ...item('diamond_pickaxe', 1, 14, 1), durabilityUsed: 700 };
  await moveInventorySlot(bot, {
    sourceSlot: 13,
    targetSlot: 14,
    expectedSource: { name: 'diamond_pickaxe', count: 1, durabilityUsed: 120 },
    expectedTarget: { name: 'diamond_pickaxe', count: 1, durabilityUsed: 700 }
  });
  assert.equal(slots[13].durabilityUsed, 700, 'same-name tools with different durability can be swapped');
  assert.equal(slots[14].durabilityUsed, 120);

  await assert.rejects(
    moveInventorySlot(bot, {
      sourceSlot: 12,
      targetSlot: 13,
      expectedSource: { name: 'stone', count: 4 },
      expectedTarget: null
    }),
    /source slot changed/,
    'stale UI state must not move an unexpected item'
  );

  const rejectedBot = createBot([]);
  rejectedBot.inventory.slots[9] = item('stone', 1, 9);
  rejectedBot.moveSlotItem = async () => {};
  await assert.rejects(
    moveInventorySlot(rejectedBot, {
      sourceSlot: 9,
      targetSlot: 5,
      expectedSource: { name: 'stone', count: 1 },
      expectedTarget: null
    }),
    /server rejected/,
    'an invalid equipment move must not be reported as successful'
  );

  console.log('Inventory slot move tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
