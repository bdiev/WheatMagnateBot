'use strict';

const MAX_COMPONENT_DEPTH = 32;
const MAX_URL_LENGTH = 2048;

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

module.exports = { chatComponentToString, safeOpenUrl };
