const fs = require('fs');
const config = require('./config');

function loadWhitelist() {
  try {
    const data = fs.readFileSync('whitelist.txt', 'utf8');
    return data
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch (err) {
    console.log('Error loading whitelist:', err.message);
    return [];
  }
}

function saveStatusMessageId(id) {
  try {
    fs.writeFileSync('status_message_id.txt', id);
  } catch (e) {
    console.error('[Bot] Failed to save status message ID:', e.message);
  }
}

function loadStatusMessageId() {
  try {
    return fs.readFileSync('status_message_id.txt', 'utf8').trim();
  } catch (e) {
    return null;
  }
}

function chatComponentToString(component) {
  if (typeof component === 'string') return component;
  if (!component || typeof component !== 'object') return '';

  let text = component.text || '';

  if (component.extra) {
    for (const extra of component.extra) {
      text += chatComponentToString(extra);
    }
  }

  return text;
}

function getNearbyPlayers(bot) {
  if (!bot || !bot.entity) return [];

  const nearby = [];
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity.type !== 'player') continue;
    if (!entity.username || entity.username === bot.username) continue;
    if (!entity.position || !bot.entity.position) continue;

    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance <= 300) {
      nearby.push({ username: entity.username, distance: Math.round(distance) });
    }
  }

  return nearby.sort((a, b) => a.distance - b.distance);
}

module.exports = {
  loadWhitelist,
  saveStatusMessageId,
  loadStatusMessageId,
  chatComponentToString,
  getNearbyPlayers
};