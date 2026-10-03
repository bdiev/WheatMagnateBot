'use strict';

function neutralizeDiscordInviteLinks(message) {
  return String(message || '')
    .replace(/\b(discord\.gg|discord(?:app)?\.com\/invite)\//gi, match =>
      match.replace(/\./g, '[.]')
    );
}

function restoreDiscordInviteLinks(message) {
  return String(message || '').replace(
    /\bdiscord(?:\[\.\]|\/\[\.[\/]?\])gg\//gi,
    'discord.gg/'
  );
}

function flattenMarkdownLinks(message) {
  // Minecraft chat components may already display an invite as discord[.]gg.
  // Accept a short nested bracket group in the label so it does not leave a
  // broken "[label](url)" construct in the Discord embed.
  const markdownLink = /\[((?:\\.|[^\[\]\r\n]|\[[^\]\r\n]{0,32}\]){1,300})\]\((https?:\/\/[^\s)<>]{1,500})\)/gi;
  return String(message || '').replace(markdownLink, (match, label, url) => {
    const cleanLabel = String(label || '').trim();
    const cleanUrl = String(url || '').trim();
    if (!cleanLabel || !cleanUrl) return match;
    if (cleanLabel === cleanUrl || /^https?:\/\/\S+$/i.test(cleanLabel)) return cleanUrl;
    return `${cleanLabel} (${cleanUrl})`;
  });
}

function formatDiscordBridgeMessage(message, { allowDiscordInvites = false } = {}) {
  const flattened = flattenMarkdownLinks(message);
  const linkSafeMessage = allowDiscordInvites
    ? restoreDiscordInviteLinks(flattened)
    : neutralizeDiscordInviteLinks(flattened);
  return linkSafeMessage
    .replace(/([*_`~|>\\])/g, '\\$1')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// Muted hues that stay readable on both Discord themes. Each player keeps the
// same colour, so a conversation can be followed by the embed edge alone.
const CHAT_PLAYER_COLORS = [
  0x5865F2, 0x3BA55D, 0xFAA61A, 0xED4245, 0xEB459E, 0x1ABC9C,
  0xE67E22, 0x9B59B6, 0x3498DB, 0xF1C40F, 0x2ECC71, 0xE91E63
];
const CHAT_BOT_COLOR = 0x95A5A6;

function getChatPlayerColor(username, { isBot = false } = {}) {
  if (isBot) return CHAT_BOT_COLOR;
  const key = String(username || '').toLowerCase();
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CHAT_PLAYER_COLORS[hash % CHAT_PLAYER_COLORS.length];
}

module.exports = {
  CHAT_BOT_COLOR,
  CHAT_PLAYER_COLORS,
  getChatPlayerColor,
  flattenMarkdownLinks,
  formatDiscordBridgeMessage,
  neutralizeDiscordInviteLinks,
  restoreDiscordInviteLinks
};
