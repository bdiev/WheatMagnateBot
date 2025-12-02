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
    if (distance <= config.PLAYER_SCAN_RANGE) {
      nearby.push({ username: entity.username, distance: Math.round(distance) });
    }
  }

  return nearby.sort((a, b) => a.distance - b.distance);
}

function isDeathMessage(message) {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes('died') ||
         lowerMessage.includes('was slain') ||
         lowerMessage.includes('perished');
}

function isRestartTime() {
  const now = new Date();
  const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
  const hour = kyivTime.getHours();
  const minute = kyivTime.getMinutes();
  return hour === 9 && minute >= 0 && minute <= 30;
}

function formatTimeForConversation() {
  const now = new Date();
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function truncateConversationDescription(description, maxLength = 4096) {
  if (description.length <= maxLength) return description;

  // Truncate to fit within Discord embed limit
  const truncated = description.substring(description.length - maxLength + 100);
  return '...(truncated)\n\n' + truncated.split('\n\n').slice(1).join('\n\n');
}

module.exports = {
  loadWhitelist,
  saveStatusMessageId,
  loadStatusMessageId,
  chatComponentToString,
  getNearbyPlayers,
  isDeathMessage,
  isRestartTime,
  formatTimeForConversation,
  truncateConversationDescription
};