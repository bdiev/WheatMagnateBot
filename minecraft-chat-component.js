'use strict';

const MAX_COMPONENT_DEPTH = 32;
const MAX_URL_LENGTH = 2048;
const MINECRAFT_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

function safeOpenUrl(value) {
  const clean = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_URL_LENGTH);
  if (!/^https?:\/\/[^\s<>]+$/i.test(clean)) return null;
  try {
    const url = new URL(clean);
    return url.protocol === 'http:' || url.protocol === 'https:' ? clean : null;
  } catch {
    return null;
  }
}

function renderComponentFallback(component, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_COMPONENT_DEPTH || component == null) return '';
  if (typeof component === 'string' || typeof component === 'number') return String(component);
  if (Array.isArray(component)) return component.map(item => renderComponentFallback(item, depth + 1, seen)).join('');
  if (typeof component !== 'object' || seen.has(component)) return '';
  seen.add(component);

  let text = typeof component.text === 'string' || typeof component.text === 'number' ? String(component.text) : '';
  if (!text && component.content != null) text = renderComponentFallback(component.content, depth + 1, seen);
  if (!text && typeof component.translate === 'string') {
    const args = Array.isArray(component.with)
      ? component.with.map(item => renderComponentFallback(item, depth + 1, seen)).filter(Boolean)
      : [];
    text = args.length ? args.join(' ') : component.translate;
  } else if (Array.isArray(component.with)) {
    text += component.with.map(item => renderComponentFallback(item, depth + 1, seen)).join(' ');
  }
  if (Array.isArray(component.extra)) text += component.extra.map(item => renderComponentFallback(item, depth + 1, seen)).join('');
  if (!text && component.json && component.json !== component) text = renderComponentFallback(component.json, depth + 1, seen);
  return text;
}

function collectOpenUrls(component, urls = [], depth = 0, seen = new WeakSet()) {
  if (depth > MAX_COMPONENT_DEPTH || component == null) return urls;
  if (Array.isArray(component)) {
    for (const item of component) collectOpenUrls(item, urls, depth + 1, seen);
    return urls;
  }
  if (typeof component !== 'object' || seen.has(component)) return urls;
  seen.add(component);

  const clickEvent = component.clickEvent || component.click_event;
  if (clickEvent?.action === 'open_url') {
    const url = safeOpenUrl(clickEvent.value || clickEvent.url);
    if (url && !urls.includes(url)) urls.push(url);
  }
  for (const key of ['json', 'content', 'with', 'extra']) {
    if (component[key] && component[key] !== component) collectOpenUrls(component[key], urls, depth + 1, seen);
  }
  return urls;
}

function chatComponentToString(component) {
  if (typeof component === 'string' || typeof component === 'number') return String(component);
  if (!component || typeof component !== 'object') return '';

  let text = '';
  if (typeof component.toString === 'function' && component.toString !== Object.prototype.toString) {
    try {
      const rendered = component.toString();
      if (typeof rendered === 'string' && rendered !== '[object Object]') text = rendered;
    } catch {
      // Fall through to the structural renderer for malformed/custom components.
    }
  }
  if (!text) text = renderComponentFallback(component);

  for (const url of collectOpenUrls(component)) {
    if (!text.includes(url)) text += `${text ? ' (' : ''}${url}${text ? ')' : ''}`;
  }
  return text;
}

function rawComponent(component) {
  if (!component || typeof component !== 'object') return component;
  return component.json && component.json !== component ? component.json : component;
}

function isGreenColor(value) {
  const color = String(value || '').trim().toLowerCase();
  if (color === 'green' || color === 'dark_green') return true;
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  return green >= 128 && green >= red + 40 && green >= blue + 40;
}

function walkComponents(component, visitor, depth = 0, inheritedColor = null, seen = new WeakSet()) {
  if (depth > MAX_COMPONENT_DEPTH || component == null) return;
  if (Array.isArray(component)) {
    for (const item of component) walkComponents(item, visitor, depth + 1, inheritedColor, seen);
    return;
  }
  if (typeof component !== 'object' || seen.has(component)) return;
  seen.add(component);

  const effectiveColor = component.color || inheritedColor;
  visitor(component, effectiveColor);
  for (const key of ['content', 'with', 'extra']) {
    if (component[key] && component[key] !== component) {
      walkComponents(component[key], visitor, depth + 1, effectiveColor, seen);
    }
  }
}

function componentHasGreenText(component, inheritedColor = null) {
  let found = false;
  walkComponents(rawComponent(component), (node, effectiveColor) => {
    const ownText = node.text ?? (typeof node.content !== 'object' ? node.content : '');
    const text = String(ownText ?? '');
    const hasLegacyGreen = /(?:\u00a7|\u00c2\u00a7)[a2]/i.test(text);
    if ((isGreenColor(effectiveColor) || hasLegacyGreen) && (text.trim() || node.translate)) found = true;
  }, 0, inheritedColor);
  return found;
}

function normalizeUsernameCandidate(value) {
  const candidate = String(value || '').trim().replace(/^<|>$/g, '');
  return MINECRAFT_USERNAME_PATTERN.test(candidate) ? candidate : null;
}

function usernameFromCommand(value) {
  const match = String(value || '').trim().match(/^\/(?:msg|message|tell|w)\s+([A-Za-z0-9_]{1,16})(?:\s|$)/i);
  return normalizeUsernameCandidate(match?.[1]);
}

function collectSenderCandidates(component) {
  const candidates = [];
  const add = value => {
    const candidate = normalizeUsernameCandidate(value);
    if (candidate && !candidates.some(item => item.toLowerCase() === candidate.toLowerCase())) {
      candidates.push(candidate);
    }
  };

  walkComponents(rawComponent(component), node => {
    add(node.insertion);
    const clickEvent = node.clickEvent || node.click_event;
    if (['suggest_command', 'run_command'].includes(clickEvent?.action)) {
      add(usernameFromCommand(clickEvent.value || clickEvent.command));
    }
    const hoverEvent = node.hoverEvent || node.hover_event;
    if (hoverEvent?.action === 'show_entity') {
      const entity = hoverEvent.contents || hoverEvent.value;
      add(entity?.name?.text ?? entity?.name);
    }
  });
  return candidates;
}

function parseVisiblePlayerLine(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /^<([A-Za-z0-9_]{1,16})>\s+(.+)$/,
    /^\[([A-Za-z0-9_]{1,16})\]\s*[:>›»]\s+(.+)$/,
    /^([A-Za-z0-9_]{1,16})\s*(?:[:>›»])\s+(.+)$/
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[2]?.trim()) return { username: match[1], message: match[2].trim() };
  }
  return null;
}

function canonicalKnownUsername(candidate, knownUsernames) {
  const normalized = normalizeUsernameCandidate(candidate);
  if (!normalized) return null;
  const known = (knownUsernames || []).find(username =>
    String(username || '').toLowerCase() === normalized.toLowerCase()
  );
  return known ? String(known) : null;
}

function analyzeMinecraftChatComponent(component, {
  knownUsernames = [],
  senderUsername = null,
  position = ''
} = {}) {
  const json = rawComponent(component);
  const text = chatComponentToString(component).replace(/\s+/g, ' ').trim();
  const rootColor = json && typeof json === 'object' ? json.color : null;
  const green = componentHasGreenText(json, rootColor);
  const result = {
    text,
    position: String(position || ''),
    isGreenChat: green,
    isPlayerChat: false,
    username: null,
    message: null,
    evidence: []
  };
  if (!green || result.position === 'game_info') return result;
  result.evidence.push('green_component');

  let username = canonicalKnownUsername(senderUsername, knownUsernames) || normalizeUsernameCandidate(senderUsername);
  let message = null;
  if (username) result.evidence.push('signed_sender');

  if (json?.translate === 'chat.type.text' && Array.isArray(json.with) && json.with.length >= 2) {
    const translatedUsername = chatComponentToString(json.with[0]).trim();
    username = canonicalKnownUsername(translatedUsername, knownUsernames) || normalizeUsernameCandidate(translatedUsername) || username;
    message = chatComponentToString(json.with[1]).trim();
    result.evidence.push('chat_translation');
  }

  const visible = parseVisiblePlayerLine(text);
  if (visible) {
    username = canonicalKnownUsername(visible.username, knownUsernames) || normalizeUsernameCandidate(visible.username) || username;
    message = visible.message;
    result.evidence.push('visible_player_format');
  }

  const metadataCandidates = collectSenderCandidates(json);
  const metadataUsername = metadataCandidates
    .map(candidate => canonicalKnownUsername(candidate, knownUsernames))
    .find(Boolean) || null;
  if (!username && metadataUsername) {
    username = metadataUsername;
    result.evidence.push('sender_metadata');
  }

  if (!message && username) {
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const visiblePrefix = new RegExp(
      `^(?:\\[[^\\]\\r\\n]{1,24}\\]\\s*)*(?:<${escapedUsername}>|\\[${escapedUsername}\\]|${escapedUsername})\\s*[:>›»]\\s+`,
      'i'
    );
    const stripped = text.replace(visiblePrefix, '').trim();
    const textContainsUsername = new RegExp(`(?:^|[^A-Za-z0-9_])${escapedUsername}(?:$|[^A-Za-z0-9_])`, 'i').test(text);
    if (stripped !== text) {
      message = stripped;
      result.evidence.push('visible_sender_prefix');
    } else if (!textContainsUsername && (metadataUsername || result.evidence.includes('signed_sender'))) {
      // Some plugins keep the sender only in click/hover/signed metadata and
      // render just the message body (possibly without the original '>').
      message = text;
      result.evidence.push('hidden_sender_metadata');
    }
  }

  const knownUsername = canonicalKnownUsername(username, knownUsernames);
  const hasStrongSender = Boolean(knownUsername || result.evidence.includes('signed_sender'));
  if (!hasStrongSender || !message) return result;

  result.isPlayerChat = true;
  result.username = knownUsername || username;
  result.message = message;
  return result;
}

module.exports = {
  analyzeMinecraftChatComponent,
  chatComponentToString,
  isGreenColor,
  safeOpenUrl
};
