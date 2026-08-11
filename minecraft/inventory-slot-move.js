'use strict';

const MOVABLE_INVENTORY_SLOTS = new Set([
  5, 6, 7, 8,
  ...Array.from({ length: 36 }, (_, index) => index + 9),
  45
]);

function normalizeInventorySlot(value, label) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || !MOVABLE_INVENTORY_SLOTS.has(slot)) {
    throw new Error(`${label} is not a movable player inventory slot.`);
  }
  return slot;
}

function itemSnapshot(item) {
  if (!item) return null;
  return {
    name: String(item.name || ''),
    displayName: item.displayName || item.name || 'Item',
    count: Number(item.count) || 1,
    slot: Number(item.slot)
  };
}

function itemStateSnapshot(item) {
  if (!item) return null;
  return {
    name: String(item.name || ''),
    type: Number(item.type),
    metadata: Number(item.metadata),
    count: Number(item.count) || 1,
    slot: Number(item.slot),
    durabilityUsed: Number.isFinite(Number(item.durabilityUsed)) ? Number(item.durabilityUsed) : null,
    nbt: item.nbt || null
  };
}

function assertExpectedItem(actual, expected, label) {
  if (expected == null) {
    if (actual) throw new Error(`${label} changed before the move. Refresh the inventory and try again.`);
    return;
  }

  const expectedName = String(expected.name || '');
  const expectedCount = Number(expected.count);
  const expectedDurability = Number(expected.durabilityUsed);
  if (
    !actual ||
    actual.name !== expectedName ||
    (Number.isFinite(expectedCount) && actual.count !== expectedCount) ||
    (expected.durabilityUsed != null && Number(actual.durabilityUsed) !== expectedDurability)
  ) {
    throw new Error(`${label} changed before the move. Refresh the inventory and try again.`);
  }
}

function slotsAreUnchanged(sourceBefore, targetBefore, sourceAfter, targetAfter) {
  return JSON.stringify([sourceBefore, targetBefore]) === JSON.stringify([sourceAfter, targetAfter]);
}

async function moveInventorySlot(bot, payload = {}) {
  if (!bot?.entity) throw new Error('Minecraft bot is offline.');
  if (!bot.inventory?.slots || typeof bot.moveSlotItem !== 'function') {
    throw new Error('Minecraft inventory controls are unavailable.');
  }
  if (bot.currentWindow && bot.currentWindow !== bot.inventory) {
    throw new Error('Close the currently open container before moving inventory items.');
  }

  const sourceSlot = normalizeInventorySlot(payload.sourceSlot, 'Source slot');
  const targetSlot = normalizeInventorySlot(payload.targetSlot, 'Target slot');
  if (sourceSlot === targetSlot) throw new Error('Source and target slots must be different.');

  const sourceBefore = bot.inventory.slots[sourceSlot] || null;
  const targetBefore = bot.inventory.slots[targetSlot] || null;
  if (!sourceBefore) throw new Error('The source inventory slot is empty.');
  assertExpectedItem(sourceBefore, payload.expectedSource, 'The source slot');
  assertExpectedItem(targetBefore, payload.expectedTarget, 'The target slot');
  const sourceBeforeSnapshot = itemStateSnapshot(sourceBefore);
  const targetBeforeSnapshot = itemStateSnapshot(targetBefore);

  try {
    await bot.moveSlotItem(sourceSlot, targetSlot);
  } catch (error) {
    if (bot.inventory.selectedItem && typeof bot.clickWindow === 'function') {
      await bot.clickWindow(sourceSlot, 0, 0).catch(() => {});
    }
    throw error;
  }

  const sourceAfter = bot.inventory.slots[sourceSlot] || null;
  const targetAfter = bot.inventory.slots[targetSlot] || null;
  if (slotsAreUnchanged(sourceBeforeSnapshot, targetBeforeSnapshot, itemStateSnapshot(sourceAfter), itemStateSnapshot(targetAfter))) {
    throw new Error('The server rejected this inventory move. The item may not fit that slot.');
  }

  return {
    sourceSlot,
    targetSlot,
    source: itemSnapshot(sourceAfter),
    target: itemSnapshot(targetAfter)
  };
}

module.exports = {
  MOVABLE_INVENTORY_SLOTS,
  itemSnapshot,
  itemStateSnapshot,
  moveInventorySlot,
  normalizeInventorySlot
};
