'use strict';

// How to click a container precisely: which visible surface to aim at, and the
// block_place packet for it. Shared by the features that use chests and hoppers.

const { Vec3 } = require('vec3');
const { nextInteractionSequence } = require('../features/obsidianFarm/interaction-sequence');

const STORAGE_REACH = 4.5;

function positionKey(pos) {
  return `${pos.x},${pos.y},${pos.z}`;
}

function containerInteraction(current, block, reach = STORAGE_REACH) {
  const eye = current.entity.position.offset(0, current.entity.eyeHeight || 1.62, 0);
  const faces = [
    new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1),
    new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)
  ];
  if (current.world?.raycast) {
    // The centre may be covered while a side is accessible (a hopper under
    // generator stone). Try surfaces of the actual collision boxes as well.
    const points = [new Vec3(0.5, 0.5, 0.5)];
    const shapes = block.shapes?.length ? block.shapes : [[0, 0, 0, 1, 1, 1]];
    for (const shape of shapes) {
      const middle = new Vec3((shape[0] + shape[3]) / 2, (shape[1] + shape[4]) / 2, (shape[2] + shape[5]) / 2);
      for (let axis = 0; axis < 3; axis += 1) {
        for (const high of [false, true]) {
          const point = middle.clone();
          point[['x', 'y', 'z'][axis]] = high ? shape[axis + 3] - 0.001 : shape[axis] + 0.001;
          points.push(point);
        }
      }
    }
    let firstHit;
    for (const point of points) {
      const delta = block.position.plus(point).minus(eye);
      if (delta.norm() > reach) continue;
      const hit = current.world.raycast(eye, delta.unit(), delta.norm() + 0.05);
      if (firstHit === undefined) firstHit = hit;
      if (hit?.position?.equals(block.position) && faces[hit.face] && hit.intersect) {
        return { direction: faces[hit.face], cursor: hit.intersect.minus(block.position) };
      }
    }
    throw new Error(`Cannot open ${block.name} at ${positionKey(block.position)}: no visible surface; `
      + `centre ray hits ${firstHit?.name || 'no block'}${firstHit?.position ? ` at ${positionKey(firstHit.position)}` : ''}.`);
  }
  const offset = eye.minus(block.position.offset(0.5, 0.5, 0.5));
  const axis = ['x', 'y', 'z'].sort((a, b) => Math.abs(offset[b]) - Math.abs(offset[a]))[0];
  const direction = new Vec3(0, 0, 0);
  direction[axis] = Math.sign(offset[axis]) || 1;
  return { direction, cursor: new Vec3(0.5, 0.5, 0.5).plus(direction.scaled(0.5)) };
}

function sendContainerClick(current, block, direction, cursor) {
  if (!current._client?.write || typeof current.supportFeature !== 'function') return false;
  const face = direction.y < 0 ? 0 : direction.y > 0 ? 1
    : direction.z < 0 ? 2 : direction.z > 0 ? 3 : direction.x < 0 ? 4 : 5;
  const packet = {
    location: block.position, direction: face, hand: 0,
    cursorX: cursor.x, cursorY: cursor.y, cursorZ: cursor.z
  };
  if (current.supportFeature('blockPlaceHasHeldItem')) {
    const Item = require('prismarine-item')(current.registry);
    delete packet.hand;
    packet.heldItem = Item.toNotch(current.heldItem);
    packet.cursorX = Math.floor(cursor.x * 16);
    packet.cursorY = Math.floor(cursor.y * 16);
    packet.cursorZ = Math.floor(cursor.z * 16);
  } else if (current.supportFeature('blockPlaceHasHandAndIntCursor')) {
    packet.cursorX = Math.floor(cursor.x * 16);
    packet.cursorY = Math.floor(cursor.y * 16);
    packet.cursorZ = Math.floor(cursor.z * 16);
  } else if (current.supportFeature('blockPlaceHasInsideBlock')) {
    packet.insideBlock = false;
    packet.sequence = nextInteractionSequence(current);
    packet.worldBorderHit = false;
  } else if (!current.supportFeature('blockPlaceHasHandAndFloatCursor')) {
    return false;
  }
  current._client.write('block_place', packet);
  current.swingArm?.();
  return true;
}

module.exports = { STORAGE_REACH, containerInteraction, sendContainerClick };
