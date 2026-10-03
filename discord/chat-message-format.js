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

// Embed edge colours by player status, so a bot or a newcomer stands out in
// the chat channel at a glance.
const CHAT_PLAYER_COLOR = 0x3498DB;
const CHAT_WHITELISTED_COLOR = 0x2ECC71;
const CHAT_NEW_PLAYER_COLOR = 0xF1C40F;
const CHAT_BOT_COLOR = 0x9B59B6;

function getChatPlayerColor({ isBot = false, isWhitelisted = false, isNewPlayer = false } = {}) {
  if (isBot) return CHAT_BOT_COLOR;
  if (isWhitelisted) return CHAT_WHITELISTED_COLOR;
  if (isNewPlayer) return CHAT_NEW_PLAYER_COLOR;
  return CHAT_PLAYER_COLOR;
}

module.exports = {
  CHAT_BOT_COLOR,
  CHAT_NEW_PLAYER_COLOR,
  CHAT_PLAYER_COLOR,
  CHAT_WHITELISTED_COLOR,
  getChatPlayerColor,
  flattenMarkdownLinks,
  formatDiscordBridgeMessage,
  neutralizeDiscordInviteLinks,
  restoreDiscordInviteLinks
};
