'use strict';

// All clicks use authoritative window snapshots. Never call Mineflayer's
// putAway/transfer/craft helpers here: their cursor recovery can drop leftovers.
function inventoryError(message) {
  return Object.assign(new Error(message), { code: 'TRADER_INVENTORY_UNSAFE' });
}

function isPlain(item) {
  return item && !item.nbt && !item.components?.length && !(item.durabilityUsed > 0);
}

async function click(current, window, slot, mouseButton, mode, timeoutMs = 5000) {
  if (!current._client?.write || !(current.supportFeature?.('stateIdUsed') || current.registry?.supportFeature?.('stateIdUsed'))) {
    throw inventoryError('Safe gold crafting requires server-confirmed inventory clicks.');
  }
  if ((current.currentWindow || current.inventory) !== window) throw inventoryError('The gold inventory window changed.');
  if (slot < 0 && !(slot === -999 && mode === 5 && mouseButton === 2)) throw inventoryError('Dropping gold is forbidden.');
  const Item = require('prismarine-item')(current.registry);
  await new Promise((resolve, reject) => {
    const event = `setWindowItems:${window.id}`;
    const finish = error => {
      clearTimeout(timer);
      current.removeListener(event, onSnapshot);
      if (error) reject(error); else resolve();
    };
    const onSnapshot = () => finish();
    const timer = setTimeout(() => finish(Object.assign(inventoryError('The server did not confirm the gold inventory; Trader stopped to preserve items.'), { inventoryUnconfirmed: true })), timeoutMs);
    current.on(event, onSnapshot);
    try {
      current._client.write('window_click', {
        windowId: window.id, stateId: -1, slot, mouseButton, mode,
        changedSlots: [], cursorItem: Item.toNotch(window.selectedItem)
      });
    } catch (error) { finish(Object.assign(inventoryError(error.message), { inventoryUnconfirmed: true })); }
  });
}

const sync = (current, window) => click(current, window, -999, 2, 5);

function destination(window, item, preferred = null, { start = window.inventoryStart, end = window.inventoryEnd, exclude = [] } = {}) {
  const slots = [];
  if (preferred !== null) slots.push(preferred);
  for (let slot = start; slot < end; slot += 1) slots.push(slot);
  return slots.find(slot => {
    if (exclude.includes(slot)) return false;
    const held = window.slots[slot];
    return !held || (isPlain(item) && isPlain(held) && held.type === item.type && held.count < held.stackSize);
  });
}

async function parkCursor(current, window, preferred = null, options = {}) {
  while (window.selectedItem) {
    const slot = destination(window, window.selectedItem, preferred, options);
    if (slot === undefined) throw inventoryError('Gold remains on the cursor: no safe slot is free. Trader stopped without dropping it.');
    const before = window.selectedItem.count;
    await click(current, window, slot, 0, 0);
    if (window.selectedItem && window.selectedItem.count >= before) throw inventoryError('The server did not return the gold cursor to a safe slot.');
  }
}

async function moveItems(current, window, sourceSlot, targetSlot, count, active = () => true) {
  await sync(current, window);
  if (window.selectedItem) throw inventoryError('The cursor must be empty before moving gold.');
  const source = window.slots[sourceSlot];
  const target = window.slots[targetSlot];
  if (sourceSlot === targetSlot || !isPlain(source) || !Number.isInteger(count) || count < 1 || count > source.count
    || (target && (!isPlain(target) || target.type !== source.type || target.count + count > target.stackSize))) {
    throw inventoryError('The gold stack changed before moving it.');
  }
  const type = source.type;
  const before = source.count;
  const targetBefore = target?.count || 0;
  const sourceContainer = String(window.type).startsWith('minecraft:generic') && sourceSlot < window.inventoryStart;
  // Hoppers can refill the source slot between any two snapshots. Return
  // leftovers within that chest, never by adding them to the requested batch.
  const returnSlots = sourceContainer
    ? { start: 0, end: window.inventoryStart, exclude: [targetSlot] } : { exclude: [targetSlot] };
  let confirmed = true;
  try {
    if (!active()) throw inventoryError('Gold movement was cancelled.');
    await click(current, window, sourceSlot, 0, 0);
    if (window.selectedItem?.type !== type || window.selectedItem.count !== before || (!sourceContainer && window.slots[sourceSlot])) {
      throw inventoryError('The server did not confirm picking up the gold stack.');
    }
    if (count === before) {
      if (!active()) throw inventoryError('Gold movement was cancelled.');
      await click(current, window, targetSlot, 0, 0);
    } else {
      for (let placed = 0; placed < count; placed += 1) {
        if (!active()) throw inventoryError('Gold movement was cancelled.');
        await click(current, window, targetSlot, 1, 0);
        if (window.selectedItem?.type !== type || window.selectedItem.count !== before - placed - 1
          || window.slots[targetSlot]?.type !== type || window.slots[targetSlot].count !== targetBefore + placed + 1) {
          throw inventoryError('The server did not confirm placing the gold batch.');
        }
      }
    }
    await parkCursor(current, window, sourceSlot, returnSlots);
    if (window.slots[targetSlot]?.type !== type || window.slots[targetSlot].count !== targetBefore + count
      || (!sourceContainer && (window.slots[sourceSlot]?.count || 0) !== before - count)) {
      const targetState = window.slots[targetSlot];
      const sourceState = window.slots[sourceSlot];
      throw inventoryError(`The server returned an inconsistent gold transfer (${window.type}, slot ${sourceSlot} -> ${targetSlot}; `
        + `target expected ${targetBefore + count} ${source.name}, got ${targetState?.count || 0} ${targetState?.name || 'empty'}; `
        + `source ${sourceState?.count || 0} ${sourceState?.name || 'empty'}).`);
    }
  } catch (error) {
    if (error.inventoryUnconfirmed) confirmed = false;
    throw error;
  } finally {
    // Even on cancellation, return the cursor before any caller closes a chest.
    if (confirmed && window.selectedItem) await parkCursor(current, window, sourceSlot, returnSlots);
  }
}

async function clearCrafting(current) {
  const window = current.inventory;
  if (!window?.slots) throw inventoryError('Inventory is not ready for safe gold crafting.');
  if (current.currentWindow) throw inventoryError('Close the current container before recovering the crafting grid.');
  await sync(current, window);
  await parkCursor(current, window);
  for (let slot = 1; slot <= 4; slot += 1) {
    while (window.slots[slot]) {
      const item = window.slots[slot];
      const target = destination(window, item);
      if (target === undefined) throw inventoryError('Crafting grid still contains items; free an inventory slot. Trader stopped without dropping them.');
      const held = window.slots[target];
      const count = Math.min(item.count, (held?.stackSize || item.stackSize) - (held?.count || 0));
      await moveItems(current, window, slot, target, count);
    }
  }
}

async function unpackGold(current, count, active = () => true) {
  await clearCrafting(current);
  const window = current.inventory;
  const source = current.inventory.items().filter(item => item.name === 'gold_block' && isPlain(item))
    .sort((a, b) => b.count - a.count)[0];
  if (!source) throw inventoryError('The gold blocks are no longer in the inventory.');
  const amount = Math.min(count, source.count);
  const countItem = name => current.inventory.items().filter(item => item.name === name && isPlain(item)).reduce((sum, item) => sum + item.count, 0);
  const blocksBefore = countItem('gold_block');
  const ingotsBefore = countItem('gold_ingot');
  const nuggetsBefore = countItem('gold_nugget');
  let confirmed = true;
  try {
    await moveItems(current, window, source.slot, 1, amount, active);
    if (!active()) throw inventoryError('Gold crafting was cancelled.');
    if (window.selectedItem || window.slots[1]?.name !== 'gold_block' || window.slots[1].count !== amount
      || [2, 3, 4].some(slot => window.slots[slot]) || window.slots[0]?.name !== 'gold_ingot' || window.slots[0].count !== 9) {
      throw inventoryError('Unexpected gold recipe: only a gold block producing 9 ingots is allowed. Trader stopped.');
    }
    // One server-side shift click consumes only the blocks placed in the grid.
    // It never picks the result up onto the cursor or crafts ingots into nuggets.
    await click(current, window, 0, 0, 1);
    if (window.selectedItem || [1, 2, 3, 4].some(slot => window.slots[slot])
      || blocksBefore - countItem('gold_block') !== amount
      || countItem('gold_ingot') - ingotsBefore !== amount * 9 || countItem('gold_nugget') !== nuggetsBefore) {
      throw inventoryError('The server returned an inconsistent gold craft. Trader stopped to preserve the remaining items.');
    }
    return amount;
  } catch (error) {
    if (error.inventoryUnconfirmed) confirmed = false;
    throw error;
  } finally {
    // Never close inventory with ingredients or a cursor stack still in flight.
    if (confirmed) await clearCrafting(current);
  }
}

async function recoverInventory(current) {
  const window = current.currentWindow;
  if (window) {
    await sync(current, window);
    // A source chest may have just released its original gold slot.
    const empty = String(window.type).startsWith('minecraft:generic')
      ? window.slots.slice(0, window.inventoryStart).findIndex(item => !item) : -1;
    await parkCursor(current, window, empty >= 0 ? empty : null);
    current.closeWindow(window);
  }
  await clearCrafting(current);
}

module.exports = { clearCrafting, moveItems, recoverInventory, unpackGold };
