'use strict';

function normalizeGreenChatMessage(value) {
  return String(value || '').trim().replace(/^>\s+/, '').trim();
}

module.exports = { normalizeGreenChatMessage };
