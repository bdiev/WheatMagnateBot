'use strict';

// On/off switches for log lines, by the tag they start with: "[Trader] ...",
// "[Obsidian Farm] ...". A muted tag silences its info and debug lines in the
// console and the system log; warnings and errors always get through, so a
// muted module can still say that something went wrong.

const TAG_PATTERN = /^\s*\[([A-Za-z][A-Za-z0-9 _.\-]{0,31})\]/;
const MAX_TAGS = 80;
const QUIET_LEVELS = new Set(['info', 'debug']);

function normalizeTag(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
}

function tagKey(value) {
  return normalizeTag(value).toLowerCase();
}

function logTagOf(message) {
  const match = TAG_PATTERN.exec(typeof message === 'string' ? message : '');
  return match ? normalizeTag(match[1]) : null;
}

function createLogSwitches({ onTagsChanged = () => {} } = {}) {
  const muted = new Set();
  const tags = new Map(); // key -> display name

  function remember(tag) {
    const key = tagKey(tag);
    if (!key || tags.has(key) || tags.size >= MAX_TAGS) return;
    tags.set(key, tag);
    try { onTagsChanged(listTags()); } catch {}
  }

  function allows(message, level = 'info') {
    const tag = logTagOf(message);
    if (!tag) return true;
    remember(tag);
    return !QUIET_LEVELS.has(level) || !muted.has(tagKey(tag));
  }

  function setMuted(tag, value) {
    const name = normalizeTag(tag);
    if (!name) throw new Error('A log tag is required.');
    remember(name);
    if (value) muted.add(tagKey(name));
    else muted.delete(tagKey(name));
    return mutedTags();
  }

  function loadMuted(list) {
    muted.clear();
    for (const tag of Array.isArray(list) ? list : []) {
      const name = normalizeTag(tag);
      if (!name) continue;
      muted.add(tagKey(name));
      remember(name);
    }
  }

  function loadTags(list) {
    for (const tag of Array.isArray(list) ? list : []) {
      const name = normalizeTag(tag);
      const key = tagKey(name);
      if (key && !tags.has(key) && tags.size < MAX_TAGS) tags.set(key, name);
    }
  }

  function mutedTags() {
    return [...muted].map(key => tags.get(key) || key).sort((a, b) => a.localeCompare(b));
  }

  function listTags() {
    return [...tags.values()].sort((a, b) => a.localeCompare(b));
  }

  return { allows, setMuted, loadMuted, loadTags, mutedTags, listTags, isMuted: tag => muted.has(tagKey(tag)) };
}

module.exports = { createLogSwitches, logTagOf, normalizeTag };
