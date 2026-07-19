'use strict';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const state = {
  timer: null,
  liveChatTimer: null,
  liveChatLoading: false,
  fullSyncLoading: false,
  eventSource: null,
  sseWasConnected: false,
  sseNeedsFullSync: false,
  realtimeRefreshTimers: {},
  pollingMode: null,
  lastRealtimeChartRefreshAt: 0,
  activeTab: 'chat',
  charts: {},
  chartMeta: {},
  rollingNumbers: {},
  seenSearchTimer: null,
  whisperSearchTimer: null,
  whitelistSearchTimer: null,
  ignoreChatSearchTimer: null,
  chartTooltipTimer: null,
  chartTooltipPinned: false,
  chartScrollRedrawFrame: null,
  chartAnimations: {},
  chartAnimationFrames: {},
  chartAnimationDurations: {},
  chartHover: {},
  seenPlayers: [],
  whisperPlayers: [],
  whisperTarget: null,
  whisperPlayersSignature: '',
  whisperMessagesSignature: '',
  whisperLastSeenId: null,
  whisperDialogReadIds: {},
  whisperReadStateSynced: false,
  whisperUnreadCount: 0,
  playerProfileRegistrationAgeMode: false,
  playerProfileLastPayload: null,
  whisperSearchPlayers: [],
  playerProfileUsername: null,
  playerProfileSignature: '',
  whitelistSearchPlayers: [],
  ignoreChatSearchPlayers: [],
  adminPlayerSearchRequests: {},
  adminControlState: null,
  adminControlLoading: false,
  adminLogsLoading: false,
  adminOpenLogDetails: new Set(),
  notificationRules: [],
  obsidianCoordinateEditorOpen: false,
  supplyTooltipItems: {},
  itemIcons: {},
  itemIconsLoading: null,
  chatReply: null,
  chatReplyActiveMessageId: null,
  chatReplyHideTimer: null,
  chatMessageIds: new Set(),
  chatInitialized: false,
  chatLatestId: null,
  authMode: 'login',
  currentUser: null,
  chartRanges: {
    chatHourlyChart: 'hours',
    obsidianDailyChart: 'days',
    tpsHourlyChart: 'hours',
    unwhitelistedHourlyChart: 'hours'
  },
  chartScrollInitialized: {},
  renderSignatures: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => registration.update().catch(() => {}))
      .catch(() => {});
  });
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US').format(number) : '-';
}

function setRollingNumber(selector, value, {
  prefix = '',
  suffix = '',
  duration = 680,
  decimals = 0
} = {}) {
  const element = $(selector);
  if (!element) return;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    element.textContent = `${prefix}-${suffix}`;
    element.classList.remove('rolling-number');
    delete state.rollingNumbers[selector];
    return;
  }

  const previous = state.rollingNumbers[selector];
  const startValue = previous?.value;
  if (startValue === numericValue) {
    element.textContent = `${prefix}${formatNumber(numericValue.toFixed(decimals))}${suffix}`;
    return;
  }

  if (previous?.frame) cancelAnimationFrame(previous.frame);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = `${prefix}${formatNumber(numericValue.toFixed(decimals))}${suffix}`;
    state.rollingNumbers[selector] = { value: numericValue, frame: null };
    return;
  }
  const from = Number.isFinite(startValue) ? startValue : numericValue;
  const to = numericValue;
  const startedAt = performance.now();
  element.classList.add('rolling-number', 'rolling-number-active');

  const renderValue = current => {
    const rounded = decimals > 0 ? Number(current).toFixed(decimals) : Math.round(current);
    element.textContent = `${prefix}${formatNumber(rounded)}${suffix}`;
  };

  if (from === to) {
    renderValue(to);
    state.rollingNumbers[selector] = { value: to, frame: null };
    setTimeout(() => element.classList.remove('rolling-number-active'), 180);
    return;
  }

  const tick = now => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    renderValue(from + (to - from) * eased);
    if (progress < 1) {
      state.rollingNumbers[selector] = {
        value: to,
        frame: requestAnimationFrame(tick)
      };
      return;
    }
    renderValue(to);
    state.rollingNumbers[selector] = { value: to, frame: null };
    setTimeout(() => element.classList.remove('rolling-number-active'), 180);
  };

  state.rollingNumbers[selector] = {
    value: to,
    frame: requestAnimationFrame(tick)
  };
}

function formatTps(value) {
  return value == null || !Number.isFinite(Number(value)) ? '-' : Number(value).toFixed(1);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatChatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatAgo(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatRecentDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - date.getTime();
  return ageMs >= 0 && ageMs < weekMs ? formatAgo(value) : formatDate(value);
}

function formatDurationMs(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) / 1000));
  if (!Number.isFinite(totalSeconds)) return '-';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function playerHeadUrl(username, size = 32) {
  const safeUsername = encodeURIComponent(String(username || 'Steve').trim() || 'Steve');
  return `https://minotar.net/avatar/${safeUsername}/${size}`;
}

function playerIdentity(username, size = 28, { status = null } = {}) {
  const safeName = escapeHtml(username || 'Unknown');
  const safeUsername = escapeHtml(username || '');
  const statusClass = status === 'online' ? ' online' : status === 'offline' ? ' offline' : '';
  const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : '';
  return `
    <span class="player-identity${statusClass}" role="button" tabindex="0" data-player="${safeUsername}" title="Open player profile"${statusLabel ? ` aria-label="${safeName}: ${statusLabel}"` : ''}>
      <img class="player-head" src="${playerHeadUrl(username, size)}" alt="" loading="eager" decoding="async" width="${size}" height="${size}">
      <span>${safeName}</span>
    </span>
  `;
}

const CCVAULTS_BASE_URL = 'https://ccvaults.com';
const CCVAULTS_EXACT_ITEMS = {
  obsidian: { category: '20. Blocks', subcategory: '37. Nether' },
  crying_obsidian: { category: '20. Blocks', subcategory: '37. Nether' },
  barrel: { category: '20. Blocks', subcategory: '33. Workplaces' },
  chest: { category: '20. Blocks', subcategory: '33. Workplaces' },
  ender_chest: { category: '20. Blocks', subcategory: '33. Workplaces' },
  cobblestone: { category: '20. Blocks', subcategory: '18. Decoration' },
  stone: { category: '20. Blocks', subcategory: '18. Decoration' },
  smooth_stone: { category: '20. Blocks', subcategory: '18. Decoration' },
  blackstone: { category: '20. Blocks', subcategory: '37. Nether' },
  netherrack: { category: '20. Blocks', subcategory: '37. Nether' },
  glowstone: { category: '20. Blocks', subcategory: '37. Nether' },
  end_stone: { category: '20. Blocks', subcategory: '36. End' }
};
const LOCAL_ITEM_ICONS = {
  firework_rocket: '/items/Firework_Rocket.png',
  lead: '/items/Lead.png'
};
const CCVAULTS_ITEM_CATEGORIES = [
  { pattern: /_pickaxe$/, category: '10. Items', subcategory: '2. Pickaxes' },
  { pattern: /_axe$/, category: '10. Items', subcategory: '3. Axes' },
  { pattern: /_shovel$/, category: '10. Items', subcategory: '4. Shovels' },
  { pattern: /_hoe$/, category: '10. Items', subcategory: '5. Hoes' },
  { pattern: /_sword$|^trident$|^mace$/, category: '10. Items', subcategory: '1. Swords' },
  { pattern: /bucket$/, category: '10. Items', subcategory: '19. Buckets' },
  {
    pattern: /apple|bread|carrot|potato|beef|chicken|cod|mutton|porkchop|rabbit|salmon|stew|soup|cake|cookie|kelp|berries|flesh|pie|honey_bottle|spider_eye/,
    category: '10. Items',
    subcategory: '10. Food'
  },
  { pattern: /golden_apple|totem_of_undying|potion|splash_potion|lingering_potion/, category: '10. Items', subcategory: '18. Consumables' },
  { pattern: /obsidian|cobblestone|stone|dirt|sand|gravel|netherrack|basalt|blackstone|deepslate|ore|log|wood|planks|leaves|glass|wool|terracotta|concrete|brick|block$/, category: '20. Blocks', subcategory: null }
];

function toCcvaultsFileName(item) {
  const raw = String(item?.name || item?.label || '').trim();
  if (!raw) return '';
  return raw
    .replace(/[^a-zA-Z0-9_ -]/g, '')
    .replace(/[-\s]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_') + '.png';
}

function ccvaultsIconUrl(item) {
  const name = normalizeItemIconKey(item?.name || item?.label);
  const file = toCcvaultsFileName(item);
  if (!name || !file) return '';
  const match = CCVAULTS_EXACT_ITEMS[name] || CCVAULTS_ITEM_CATEGORIES.find(entry => entry.pattern.test(name));
  if (!match) return `${CCVAULTS_BASE_URL}/thumbnails/${encodeURIComponent('10. Items')}/${encodeURIComponent(file)}`;

  const parts = [CCVAULTS_BASE_URL, 'thumbnails', match.category];
  if (match.subcategory) parts.push(match.subcategory);
  parts.push(file);
  return parts.map((part, index) => index < 2 ? part : encodeURIComponent(part)).join('/');
}

function normalizeItemIconKey(value) {
  return String(value || '')
    .replace(/^minecraft:/i, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function localItemIconUrl(item) {
  const iconKey = normalizeItemIconKey(item?.name || item?.label);
  return state.itemIcons[iconKey] || LOCAL_ITEM_ICONS[iconKey] || '';
}

function itemIcon(item) {
  const label = item?.label || item?.name || 'Item';
  const fallback = escapeHtml(label.slice(0, 2).toUpperCase());
  const url = localItemIconUrl(item) || ccvaultsIconUrl(item);
  if (!url) return `<span class="item-icon fallback">${fallback}</span>`;
  return `
    <span class="item-icon">
      <img src="${url}" alt="" loading="lazy" onerror="this.closest('.item-icon').classList.add('fallback'); this.remove();">
      <span>${fallback}</span>
    </span>
  `;
}

function stableSignature(value) {
  return JSON.stringify(value ?? null);
}

function renderStable(selector, html, signatureParts) {
  const target = $(selector);
  if (!target) return false;
  const signature = stableSignature(signatureParts);
  if (state.renderSignatures[selector] === signature) return false;

  const scrollTop = target.scrollTop;
  const scrollLeft = target.scrollLeft;
  const distanceFromBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
  const keepBottom = distanceFromBottom >= 0 && distanceFromBottom < 12;

  target.innerHTML = html;
  state.renderSignatures[selector] = signature;

  requestAnimationFrame(() => {
    if (keepBottom) {
      target.scrollTop = Math.max(0, target.scrollHeight - target.clientHeight - distanceFromBottom);
    } else {
      target.scrollTop = scrollTop;
    }
    target.scrollLeft = scrollLeft;
  });
  return true;
}

function updateChatScrollButton() {
  const list = $('#chatList');
  const button = $('#chatScrollBottom');
  if (!list || !button) return;
  const distanceFromBottom = list.scrollHeight - list.clientHeight - list.scrollTop;
  button.classList.toggle('hidden', distanceFromBottom < 16);
}

function scrollToBottom(selector, { smooth = false } = {}) {
  const scroll = () => {
    const target = $(selector);
    if (!target) return;
    if (smooth && typeof target.scrollTo === 'function') {
      target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
      setTimeout(updateChatScrollButton, 380);
    } else {
      target.scrollTop = target.scrollHeight;
    }
    if (selector === '#chatList') updateChatScrollButton();
  };

  requestAnimationFrame(() => {
    scroll();
    if (!smooth) requestAnimationFrame(scroll);
  });
  if (!smooth) setTimeout(scroll, 80);
}

function setBanner(message) {
  const banner = $('#statusBanner');
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      showAuthScreen('Please sign in to continue.');
    }
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function postJson(path, body = {}) {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function putJson(path, body = {}) {
  const response = await fetch(path, {
    method: 'PUT', cache: 'no-store', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function showAuthScreen(message = '') {
  const authScreen = $('#authScreen');
  const shell = $('.shell');
  if (authScreen) authScreen.hidden = false;
  if (shell) shell.classList.add('app-locked');
  if (message) {
    const error = $('#authError');
    error.textContent = message;
    error.hidden = false;
  }
}

function hideAuthScreen() {
  $('#authScreen').hidden = true;
  $('.shell')?.classList.remove('app-locked');
  $('#authError').hidden = true;
}

function setAuthMode(mode) {
  state.authMode = mode === 'register' ? 'register' : 'login';
  const isRegister = state.authMode === 'register';
  $('#authTitle').textContent = isRegister ? 'Create account' : 'Sign in';
  $('#authIntro').textContent = isRegister
    ? 'New accounts wait for admin approval before they can open the dashboard.'
    : 'Enter your approved account credentials to open the dashboard.';
  $('#authSubmit').textContent = isRegister ? 'Create account' : 'Sign in';
  $('#authModeToggle').textContent = isRegister ? 'Already have an account?' : 'Create a new account';
  $('#authPassword').setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
  $('#authError').hidden = true;
}

function applyCurrentUser(user) {
  state.currentUser = user || null;
  loadWhisperLastSeenId();
  const isAdmin = state.currentUser?.role === 'admin';
  $$('.admin-only').forEach(element => {
    element.hidden = !isAdmin;
  });
  const logoutButton = $('#logoutButton');
  if (logoutButton) logoutButton.hidden = !state.currentUser;
  if (!isAdmin && ['admin', 'notifications'].includes(state.activeTab)) setActiveTab('chat');
  if (state.currentUser) startRealtimeUpdates();
  else stopRealtimeUpdates();
}

function setNavMenuOpen(open) {
  const menu = $('#navMenu');
  const toggle = $('#navMenuToggle');
  if (!menu || !toggle) return;
  const isOpen = Boolean(open);
  menu.classList.toggle('open', isOpen);
  document.body.classList.toggle('nav-focus-active', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
}

function toggleNavMenu() {
  setNavMenuOpen(!$('#navMenu')?.classList.contains('open'));
}

function updateNavLabel(tab) {
  const activeButton = $(`.tab-button[data-tab="${tab}"]`);
  const label = $('.nav-menu-label');
  if (activeButton && label) label.textContent = activeButton.textContent.trim();
}

function getStoredTab() {
  const storedTab = localStorage.getItem('wm-active-tab');
  return $(`.tab-button[data-tab="${storedTab}"]`) ? storedTab : 'chat';
}

function restoreActiveTab() {
  const tab = getStoredTab();
  setActiveTab(['admin', 'notifications'].includes(tab) && state.currentUser?.role !== 'admin' ? 'chat' : tab);
}

async function handleLogout() {
  try {
    await postJson('/api/auth/logout');
  } catch {
    // The local session state should still be cleared if the network request fails.
  }
  applyCurrentUser(null);
  setNavMenuOpen(false);
  setActiveTab('chat');
  showAuthScreen('You have been logged out.');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const username = $('#authUsername').value.trim();
  const password = $('#authPassword').value;
  const button = $('#authSubmit');
  const error = $('#authError');
  button.disabled = true;
  error.hidden = true;

  try {
    const payload = await postJson(`/api/auth/${state.authMode === 'register' ? 'register' : 'login'}`, { username, password });
    if (payload.pendingApproval) {
      setAuthMode('login');
      showAuthScreen(payload.message || 'Registration received. Wait for admin approval.');
      return;
    }
    applyCurrentUser(payload.user);
    hideAuthScreen();
    restoreActiveTab();
    await loadAll();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function initAuth() {
  try {
    const payload = await fetchJson('/api/auth/me');
    if (payload.authenticated) {
      applyCurrentUser(payload.user);
      hideAuthScreen();
      restoreActiveTab();
      await loadAll();
      return;
    }
  } catch (err) {
    $('#authError').textContent = err.message;
    $('#authError').hidden = false;
  }
  applyCurrentUser(null);
  showAuthScreen();
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('wm-theme', nextTheme);
  const toggle = $('#themeToggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(nextTheme === 'dark'));
    toggle.setAttribute('aria-label', nextTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  redrawCharts();
  setTimeout(redrawCharts, 280);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function setActiveTab(tab) {
  if (['admin', 'notifications'].includes(tab) && state.currentUser?.role !== 'admin') return;
  state.activeTab = tab;
  localStorage.setItem('wm-active-tab', tab);
  $$('.tab-button').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
  updateNavLabel(tab);
  setNavMenuOpen(false);
  if (tab === 'admin') {
    loadAdminUsers();
    loadAdminControlState();
    loadAdminSystemLogs();
  }
  if (tab === 'notifications') loadNotifications();
  requestAnimationFrame(updateCarousels);
  redrawCharts();
}

function carouselItems(carousel) {
  return Array.from(carousel.children).filter(item => item.matches('.stat, .panel'));
}

function carouselStep(carousel) {
  const item = carouselItems(carousel)[0];
  if (!item) return 0;
  const styles = getComputedStyle(carousel);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
  return item.getBoundingClientRect().width + gap;
}

function updateCarousels() {
  if (!window.matchMedia?.('(max-width: 700px)').matches) return;
  $$('[data-loop-carousel]').forEach(carousel => {
    updateCarouselActiveItem(carousel);
  });
}

function updateCarouselActiveItem(carousel) {
  const items = carouselItems(carousel);
  if (!items.length) return;
  const center = carousel.scrollLeft + carousel.clientWidth / 2;
  let activeItem = items[0];
  let activeDistance = Infinity;

  items.forEach(item => {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2;
    const distance = Math.abs(center - itemCenter);
    if (distance < activeDistance) {
      activeDistance = distance;
      activeItem = item;
    }
  });

  items.forEach(item => item.classList.toggle('carousel-active', item === activeItem));
}

function initLoopingCarousels() {
  $$('[data-loop-carousel]').forEach(carousel => {
    const originals = carouselItems(carousel);
    if (originals.length < 2 || carousel.dataset.loopReady === 'true') return;

    carousel.dataset.loopReady = 'true';

    let animationFrame = null;
    carousel.addEventListener('scroll', () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => updateCarouselActiveItem(carousel));
    }, { passive: true });
  });

  updateCarousels();
}

function getCssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prepareChartCanvas(canvas, data, options = {}) {
  const viewport = canvas.closest('.chart-scroll');
  const ratio = window.devicePixelRatio || 1;
  const pointWidth = options.pointWidth || 44;
  const minWidth = viewport ? viewport.clientWidth : canvas.getBoundingClientRect().width;
  const cssWidth = Math.max(minWidth || 320, (Array.isArray(data) ? data.length : 0) * pointWidth + 92);
  const cssHeight = Math.max(1, Math.floor(canvas.getBoundingClientRect().height || canvas.height || 260));
  canvas.style.width = `${cssWidth}px`;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const hasData = Array.isArray(data) && data.length > 0;
  if (hasData && viewport && viewport.clientWidth > 0 && !state.chartScrollInitialized[canvas.id]) {
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      scheduleChartViewportRedraw();
    });
    state.chartScrollInitialized[canvas.id] = true;
  }
  return { ctx, width: cssWidth, height: cssHeight };
}

function getChartAnimationProgress(canvas, options = {}) {
  if (!canvas) return 1;
  const duration = options.animate ? options.duration || 360 : 0;
  if (!duration) return 1;
  const startedAt = state.chartAnimations[canvas.id] || performance.now();
  const progress = Math.min(1, Math.max(0, (performance.now() - startedAt) / duration));
  return 1 - Math.pow(1 - progress, 3);
}

function animateChart(chartId, duration = 360) {
  state.chartAnimations[chartId] = performance.now();
  state.chartAnimationDurations[chartId] = duration;
  if (state.chartAnimationFrames[chartId]) cancelAnimationFrame(state.chartAnimationFrames[chartId]);

  const tick = () => {
    redrawCharts({ animate: true });
    if (performance.now() - state.chartAnimations[chartId] < duration) {
      state.chartAnimationFrames[chartId] = requestAnimationFrame(tick);
    } else {
      delete state.chartAnimations[chartId];
      delete state.chartAnimationDurations[chartId];
      delete state.chartAnimationFrames[chartId];
      redrawCharts();
    }
  };

  state.chartAnimationFrames[chartId] = requestAnimationFrame(tick);
}

function shortChartLabel(label, index, total) {
  const value = String(label || '').replace(/^\d{4}-/, '');
  if (total > 48 && index % 6 !== 0 && index !== total - 1) return '';
  if (total > 24 && index % 3 !== 0 && index !== total - 1) return '';
  return value;
}

function drawNoData(ctx, width, height, muted) {
  ctx.fillStyle = muted;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('No chart data', width / 2, height / 2);
}

function renderStickyChartAxis(canvas, labels, padding, height) {
  const viewport = canvas?.closest('.chart-scroll');
  if (!viewport) return;
  let axis = viewport.querySelector('.chart-y-axis');
  if (!axis) {
    axis = document.createElement('div');
    axis.className = 'chart-y-axis';
    viewport.prepend(axis);
  }

  axis.style.height = `${height}px`;
  const chartHeight = height - padding.top - padding.bottom;
  axis.innerHTML = labels.map((label, index) => {
    const y = padding.top + chartHeight - (chartHeight * index) / Math.max(1, labels.length - 1);
    return `<span style="top:${y}px">${escapeHtml(label)}</span>`;
  }).join('');
}

function visibleChartValues(canvas, chartData, padding, chartWidth, mode = 'bar') {
  const viewport = canvas?.closest('.chart-scroll');
  const values = [];
  if (!viewport || viewport.clientWidth <= 0) {
    return chartData.map(item => Number(item.value)).filter(Number.isFinite);
  }

  const canvasLeft = canvas.offsetLeft || 0;
  const visibleLeft = viewport.scrollLeft - canvasLeft;
  const visibleRight = visibleLeft + viewport.clientWidth;
  if (mode === 'line') {
    const lastIndex = Math.max(1, chartData.length - 1);
    chartData.forEach((item, index) => {
      const x = padding.left + (chartWidth * index) / lastIndex;
      if (x < visibleLeft || x > visibleRight) return;
      const value = Number(item.value);
      if (Number.isFinite(value)) values.push(value);
    });
  } else {
    const slotWidth = chartData.length > 0 ? chartWidth / chartData.length : 0;
    chartData.forEach((item, index) => {
      const slotLeft = padding.left + index * slotWidth;
      const slotRight = slotLeft + slotWidth;
      if (slotRight < visibleLeft || slotLeft > visibleRight) return;
      const value = Number(item.value);
      if (Number.isFinite(value)) values.push(value);
    });
  }

  return values.length
    ? values
    : chartData.map(item => Number(item.value)).filter(Number.isFinite);
}

function drawBarChart(canvas, data, options = {}) {
  if (!canvas) return;
  const chartData = Array.isArray(data) ? data : [];
  const { ctx, width, height } = prepareChartCanvas(canvas, chartData, options);

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const isDarkTheme = document.documentElement.dataset.theme === 'dark';
  const hoverFill = isDarkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.34)';
  const hoverStroke = isDarkTheme ? 'rgba(255, 255, 255, 0.46)' : 'rgba(255, 255, 255, 0.72)';
  const padding = { top: 24, right: 18, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = visibleChartValues(canvas, chartData, padding, chartWidth, 'bar');
  const maxValue = Math.max(options.max || 0, ...values, 1);
  const animationProgress = getChartAnimationProgress(canvas, options.animation);
  renderStickyChartAxis(
    canvas,
    Array.from({ length: 5 }, (_, index) => formatNumber(Math.round((maxValue * index) / 4))),
    padding,
    height
  );

  ctx.fillStyle = panelSoft;
  ctx.fillRect(0, 0, width, height);
  if (!chartData.length) {
    drawNoData(ctx, width, height, muted);
    state.chartMeta[canvas.id] = { hitboxes: [] };
    return;
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (chartHeight * i) / 4;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(Math.round((maxValue * i) / 4)), padding.left - 10, y + 4);
  }

  const slotWidth = chartData.length > 0 ? chartWidth / chartData.length : 0;
  const barWidth = chartData.length > 0 ? Math.max(6, Math.min(28, slotWidth * 0.72)) : 0;
  const hitboxes = [];
  const hoveredIndex = Number.isInteger(state.chartHover[canvas.id]) ? state.chartHover[canvas.id] : -1;

  chartData.forEach((item, index) => {
    const value = Number(item.value);
    if (!Number.isFinite(value)) return;
    const slotX = padding.left + index * slotWidth;
    const x = slotX + (slotWidth - barWidth) / 2;
    const barHeight = Math.max(1, (value / maxValue) * chartHeight * animationProgress);
    const y = padding.top + chartHeight - barHeight;
    const isHovered = index === hoveredIndex;
    if (isHovered) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.restore();
      ctx.fillStyle = hoverFill;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.strokeStyle = hoverStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 0.5, y - 0.5, barWidth + 1, barHeight + 1);
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    hitboxes.push({
      x: slotX,
      y: padding.top,
      width: slotWidth,
      height: chartHeight,
      index,
      label: item.label,
      value,
      tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatNumber(value)}`
    });
  });
  state.chartMeta[canvas.id] = { hitboxes };

  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  chartData.forEach((item, index) => {
    const label = shortChartLabel(item.label, index, chartData.length);
    if (!label) return;
    const x = padding.left + index * slotWidth + slotWidth / 2;
    ctx.fillText(label, x, height - 16);
  });
}

function drawLineChart(canvas, data, options = {}) {
  if (!canvas) return;
  const chartData = Array.isArray(data) ? data : [];
  const { ctx, width, height } = prepareChartCanvas(canvas, chartData, { pointWidth: options.pointWidth || 42 });

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const padding = { top: 24, right: 18, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const numericValues = visibleChartValues(canvas, chartData, padding, chartWidth, 'line');
  const maxValue = Math.max(options.max || 0, ...numericValues, 1);
  const animationProgress = getChartAnimationProgress(canvas, options.animation);
  renderStickyChartAxis(
    canvas,
    Array.from({ length: 5 }, (_, index) => formatTps((maxValue * index) / 4)),
    padding,
    height
  );

  ctx.fillStyle = panelSoft;
  ctx.fillRect(0, 0, width, height);
  if (!chartData.length || !numericValues.length) {
    drawNoData(ctx, width, height, muted);
    state.chartMeta[canvas.id] = { hitboxes: [] };
    return;
  }
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (chartHeight * i) / 4;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatTps((maxValue * i) / 4), padding.left - 10, y + 4);
  }

  const points = chartData
    .map((item, index) => {
      const value = Number(item.value);
      if (!Number.isFinite(value)) return null;
      const x = padding.left + (chartWidth * index) / Math.max(1, chartData.length - 1);
      const y = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, value)) / maxValue) * chartHeight * animationProgress;
      return {
        x,
        y,
        value,
        label: item.label,
        tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatTps(value)}`
      };
    })
    .filter(Boolean);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach(point => {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  state.chartMeta[canvas.id] = {
    hitboxes: points.map(point => ({
      x: point.x - 12,
      y: point.y - 18,
      width: 24,
      height: 36,
      tooltip: point.tooltip
    }))
  };

  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  chartData.forEach((item, index) => {
    const label = shortChartLabel(item.label, index, chartData.length);
    if (!label) return;
    const x = padding.left + (chartWidth * index) / Math.max(1, chartData.length - 1);
    ctx.fillText(label, x, height - 16);
  });
}

function aggregateSeries(data, range, reducer = 'sum') {
  const items = Array.isArray(data) ? data : [];
  if (range === 'hours') return items;
  const groups = new Map();
  items.forEach(item => {
    const bucketSource = item.bucket || item.label;
    const date = new Date(bucketSource);
    let key = String(item.label || bucketSource || '');
    let label = key;
    if (!Number.isNaN(date.getTime())) {
      if (range === 'months') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        label = key;
      } else {
        key = date.toISOString().slice(0, 10);
        label = key.slice(5);
      }
    } else if (range === 'months') {
      key = String(key).slice(0, 7);
      label = key;
    }
    if (!groups.has(key)) groups.set(key, { label, values: [] });
    const value = Number(item.value);
    if (Number.isFinite(value)) groups.get(key).values.push(value);
  });
  return Array.from(groups.values()).map(group => ({
    label: group.label,
    value: reducer === 'avg'
      ? group.values.reduce((sum, value) => sum + value, 0) / Math.max(1, group.values.length)
      : group.values.reduce((sum, value) => sum + value, 0)
  }));
}

function getChartRange(id) {
  return state.chartRanges[id] || 'hours';
}

function redrawCharts({ animate = false } = {}) {
  requestAnimationFrame(() => {
    const chatRange = getChartRange('chatHourlyChart');
    const obsidianRange = getChartRange('obsidianDailyChart');
    const tpsRange = getChartRange('tpsHourlyChart');
    const unwhitelistedRange = getChartRange('unwhitelistedHourlyChart');
    drawBarChart($('#chatHourlyChart'), aggregateSeries(state.charts.chatHourly, chatRange), {
      animation: {
        animate: animate && Boolean(state.chartAnimations.chatHourlyChart),
        duration: state.chartAnimationDurations.chatHourlyChart
      },
      tooltip: item => `${item.label}: ${formatNumber(item.value)} messages`
    });
    const obsidianData = obsidianRange === 'hours'
      ? state.charts.obsidianHourly
      : aggregateSeries(state.charts.obsidianDaily, obsidianRange);
    drawBarChart($('#obsidianDailyChart'), obsidianData, {
      animation: {
        animate: animate && Boolean(state.chartAnimations.obsidianDailyChart),
        duration: state.chartAnimationDurations.obsidianDailyChart
      },
      tooltip: item => `${item.label}: ${formatNumber(item.value)} blocks`
    });
    drawLineChart($('#tpsHourlyChart'), aggregateSeries(state.charts.tpsHourly, tpsRange, 'avg'), {
      animation: {
        animate: animate && Boolean(state.chartAnimations.tpsHourlyChart),
        duration: state.chartAnimationDurations.tpsHourlyChart
      },
      max: 20,
      tooltip: item => `${item.label}: ${formatTps(item.value)} TPS`
    });
    drawBarChart($('#unwhitelistedHourlyChart'), aggregateSeries(state.charts.unwhitelistedHourly, unwhitelistedRange), {
      animation: {
        animate: animate && Boolean(state.chartAnimations.unwhitelistedHourlyChart),
        duration: state.chartAnimationDurations.unwhitelistedHourlyChart
      },
      tooltip: item => `${item.label}: ${formatNumber(item.value)} players`
    });
  });
}

function scheduleChartViewportRedraw() {
  if (state.chartScrollRedrawFrame) cancelAnimationFrame(state.chartScrollRedrawFrame);
  state.chartScrollRedrawFrame = requestAnimationFrame(() => {
    state.chartScrollRedrawFrame = null;
    redrawCharts();
  });
}

function showChartTooltip(canvas, event, { pin = false } = {}) {
  const tooltip = $('#chartTooltip');
  const meta = state.chartMeta[canvas.id];
  if (!tooltip || !meta) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = meta.hitboxes.find(box =>
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height
  );
  const nextHoverIndex = hit && Number.isInteger(hit.index) ? hit.index : null;
  if (state.chartHover[canvas.id] !== nextHoverIndex) {
    state.chartHover[canvas.id] = nextHoverIndex;
    redrawCharts();
  }

  if (!hit) {
    canvas.style.cursor = '';
    if (!state.chartTooltipPinned) tooltip.hidden = true;
    return;
  }

  canvas.style.cursor = Number.isInteger(hit.index) ? 'pointer' : '';
  tooltip.textContent = hit.tooltip;
  tooltip.hidden = false;
  clearTimeout(state.chartTooltipTimer);
  state.chartTooltipPinned = Boolean(pin || event.pointerType === 'touch');
  const tooltipWidth = Math.max(160, tooltip.offsetWidth || 0);
  const left = Math.min(window.innerWidth - tooltipWidth - 10, event.clientX + 12);
  const top = Math.min(window.innerHeight - 46, event.clientY + 12);
  tooltip.style.left = `${Math.max(10, left)}px`;
  tooltip.style.top = `${Math.max(10, top)}px`;
  if (state.chartTooltipPinned) {
    state.chartTooltipTimer = setTimeout(hideChartTooltip, 3200);
  }
}

function hideChartTooltip() {
  const tooltip = $('#chartTooltip');
  clearTimeout(state.chartTooltipTimer);
  state.chartTooltipPinned = false;
  if (tooltip) tooltip.hidden = true;
}

function hideChartTooltipIfNotPinned(event) {
  const canvas = event?.currentTarget;
  if (canvas?.id && state.chartHover[canvas.id] != null) {
    state.chartHover[canvas.id] = null;
    canvas.style.cursor = '';
    redrawCharts();
  }
  if (!state.chartTooltipPinned) hideChartTooltip();
}

function handleChartRangeClick(event) {
  const button = event.target.closest('[data-chart-range]');
  if (!button) return;
  const controls = button.closest('[data-chart-controls]');
  const chartId = controls?.dataset.chartControls;
  if (!chartId) return;
  if (state.chartRanges[chartId] === button.dataset.chartRange) return;
  state.chartRanges[chartId] = button.dataset.chartRange;
  delete state.chartScrollInitialized[chartId];
  controls.querySelectorAll('[data-chart-range]').forEach(item => {
    item.classList.toggle('active', item === button);
  });
  button.classList.remove('pressed');
  void button.offsetWidth;
  button.classList.add('pressed');
  animateChart(chartId);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatRegistrationAge(value) {
  if (!value) return 'Unknown';
  const start = new Date(value);
  const end = new Date();
  if (Number.isNaN(start.getTime())) return 'Unknown';
  if (start > end) return '0 days';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = (end.getMonth() + 11) % 12;
    const previousMonthYear = previousMonth === 11 ? end.getFullYear() - 1 : end.getFullYear();
    days += daysInMonth(previousMonthYear, previousMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months || years) parts.push(`${months}m`);
  parts.push(`${days}d`);
  return parts.join(' ');
}

function formatMilestoneWhen(daysUntil) {
  const days = Number(daysUntil);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return Number.isFinite(days) ? `in ${formatNumber(days)} days` : 'Soon';
}

function formatMilestoneYears(years) {
  const value = Number(years);
  return Number.isFinite(value) ? `${formatNumber(value)} ${value === 1 ? 'year' : 'years'}` : '-';
}

function registrationProfileValue(profile) {
  const dateText = profile.registrationDisplay || (profile.registrationAt ? formatDate(profile.registrationAt) : 'Unknown');
  return state.playerProfileRegistrationAgeMode ? formatRegistrationAge(profile.registrationAt) : dateText;
}

function renderPlayerProfile(profile) {
  const recentMessages = profile.chat?.recentMessages || [];
  const nearby = profile.nearby;
  const profileUsername = String(profile.username || '');
  const registrationTitle = state.playerProfileRegistrationAgeMode
    ? 'Show registration date'
    : 'Show time since registration';
  const ignoreAction = profile.isIgnored ? 'unignore_chat' : 'ignore_chat';
  const ignoreLabel = profile.isIgnored ? 'Unignore' : 'Ignore';
  const ignoreIcon = profile.isIgnored ? 'Unmuted.png' : 'Muted.png';
  const ignoreButton = state.currentUser?.role === 'admin'
    ? `
          <button class="player-profile-message-action player-profile-ignore-action" type="button" data-player-ignore-action="${ignoreAction}" aria-label="${ignoreLabel} ${escapeHtml(profileUsername)}" title="${ignoreLabel}" aria-pressed="${profile.isIgnored}">
            <img src="/items/${ignoreIcon}" alt="" aria-hidden="true">
            <span>${ignoreLabel}</span>
          </button>`
    : '';
  return `
    <header class="player-profile-head">
      <span class="player-profile-avatar-wrap" data-status="${profile.isOnline ? 'online' : 'offline'}" aria-label="${profile.isOnline ? 'Online' : 'Offline'}">
        <img class="player-profile-avatar" src="${playerHeadUrl(profile.username, 96)}" alt="" loading="lazy">
      </span>
      <div>
        <h2 id="playerProfileName">${escapeHtml(profile.username)}</h2>
        <div class="player-profile-badges">
          <span class="pill">${profile.isWhitelisted ? 'whitelisted' : 'not whitelisted'}</span>
          ${profile.isIgnored ? '<span class="pill ignored">ignored</span>' : ''}
        </div>
        <div class="player-profile-actions">
          <button class="player-profile-message-action" type="button" data-whisper-player="${escapeHtml(profileUsername)}">
            <img src="/items/Writable_Book.png" alt="" aria-hidden="true">
            <span>Message</span>
          </button>
          <a class="player-profile-message-action player-profile-namemc-action" href="https://namemc.com/profile/${encodeURIComponent(profileUsername)}" target="_blank" rel="noopener noreferrer">
            <img src="/logos/namemc_dark.png" alt="" aria-hidden="true">
            <span>NameMC</span>
          </a>
          ${ignoreButton}
        </div>
      </div>
    </header>
    <section class="player-profile-grid">
      <div><span>Playtime</span><strong>${escapeHtml(profile.playtime || '-')}</strong></div>
      <div>
        <span>Registered</span>
        <button class="player-profile-value-button" type="button" data-profile-toggle="registration-age" title="${registrationTitle}">
          ${escapeHtml(registrationProfileValue(profile))}
        </button>
      </div>
      <div><span>Last Seen</span><strong>${profile.lastSeen ? formatRecentDate(profile.lastSeen) : 'Never'}</strong></div>
      <div><span>Chat Messages</span><strong>${formatNumber(profile.chat?.totalMessages)}</strong></div>
      <div><span>Messages 24h</span><strong>${formatNumber(profile.chat?.last24h)}</strong></div>
      <div><span>Last Message</span><strong>${profile.chat?.lastMessageAt ? formatRecentDate(profile.chat.lastMessageAt) : 'None'}</strong></div>
      <div><span>Nearby</span><strong>${nearby ? `${formatNumber(nearby.distance)} blocks` : 'No sighting'}</strong></div>
      <div><span>Nearby Seen</span><strong>${nearby?.lastSeen ? formatDate(nearby.lastSeen) : '-'}</strong></div>
    </section>
    <section class="player-profile-chat">
      <h3>Recent Chat</h3>
      ${recentMessages.length
        ? recentMessages.map(message => `
          <div class="player-profile-message">
            <p>${escapeHtml(message.message)}</p>
            <time>${formatDate(message.createdAt)}</time>
          </div>
        `).join('')
        : '<div class="empty">No recorded chat messages for this player.</div>'}
    </section>
  `;
}

function playerProfileSignature(profile) {
  return JSON.stringify([
    profile.username,
    profile.isOnline,
    profile.isWhitelisted,
    profile.isIgnored,
    profile.playtime,
    profile.registrationAt,
    profile.registrationDisplay,
    state.playerProfileRegistrationAgeMode,
    profile.lastSeen,
    profile.lastOnline,
    profile.chat?.totalMessages,
    profile.chat?.last24h,
    profile.chat?.lastMessageAt,
    profile.nearby?.distance,
    profile.nearby?.lastSeen,
    ...(profile.chat?.recentMessages || []).map(message => [message.message, message.createdAt])
  ]);
}

async function loadPlayerProfile(username, { showLoading = false } = {}) {
  const overlay = $('#playerProfileOverlay');
  const content = $('#playerProfileContent');
  if (!overlay || !content || !username) return;

  overlay.hidden = false;
  document.body.classList.add('profile-open');
  state.playerProfileUsername = username;
  if (showLoading) {
    content.innerHTML = `
    <div class="player-profile-loading">
      ${playerIdentity(username, 40)}
      <span>Loading player profile...</span>
    </div>
  `;
  }

  try {
    const profile = await fetchJson(`/api/player?username=${encodeURIComponent(username)}`);
    state.playerProfileLastPayload = profile;
    const signature = playerProfileSignature(profile);
    if (state.playerProfileSignature !== signature) {
      content.innerHTML = renderPlayerProfile(profile);
      state.playerProfileSignature = signature;
      state.playerProfileUsername = profile.username || username;
    }
  } catch (err) {
    content.innerHTML = `<div class="empty">Could not load player profile: ${escapeHtml(err.message)}</div>`;
  }
}

async function openPlayerProfile(username) {
  state.playerProfileSignature = '';
  state.playerProfileRegistrationAgeMode = false;
  state.playerProfileLastPayload = null;
  await loadPlayerProfile(username, { showLoading: true });
}

function closePlayerProfile() {
  const overlay = $('#playerProfileOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('profile-open');
  state.playerProfileUsername = null;
  state.playerProfileSignature = '';
  state.playerProfileRegistrationAgeMode = false;
  state.playerProfileLastPayload = null;
}

async function handlePlayerProfileClick(event) {
  const ignoreButton = event.target.closest('[data-player-ignore-action]');
  if (ignoreButton) {
    event.preventDefault();
    if (state.currentUser?.role !== 'admin' || !state.playerProfileLastPayload) return;

    const action = ignoreButton.dataset.playerIgnoreAction;
    const username = state.playerProfileLastPayload.username;
    ignoreButton.disabled = true;
    try {
      await postJson('/api/admin/bot-command', {
        commandType: action,
        payload: { username }
      });
      state.playerProfileLastPayload.isIgnored = action === 'ignore_chat';
      state.playerProfileSignature = '';
      const content = $('#playerProfileContent');
      if (content) content.innerHTML = renderPlayerProfile(state.playerProfileLastPayload);
      scheduleAdminControlRefresh();
    } catch (err) {
      ignoreButton.disabled = false;
      console.error(`Could not ${action === 'ignore_chat' ? 'ignore' : 'unignore'} ${username}:`, err);
    }
    return;
  }

  const toggle = event.target.closest('[data-profile-toggle="registration-age"]');
  if (!toggle) return;
  event.preventDefault();
  state.playerProfileRegistrationAgeMode = !state.playerProfileRegistrationAgeMode;
  state.playerProfileSignature = '';
  if (state.playerProfileLastPayload) {
    const content = $('#playerProfileContent');
    if (content) content.innerHTML = renderPlayerProfile(state.playerProfileLastPayload);
  }
}

function openWhisperFromProfile(username) {
  closePlayerProfile();
  setWhisperOpen(true);
  openWhisperDialog(username).catch(err => setBanner(`Could not open dialog: ${err.message}`));
}

function setSeenSearchOpen(open) {
  const search = $('#seenSearch');
  const toggle = $('#seenSearchToggle');
  if (!search || !toggle) return;
  if (open) {
    const rect = toggle.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    const targetTop = isMobile ? 82 : 88;
    const targetCenterX = window.innerWidth / 2;
    const targetCenterY = targetTop + rect.height / 2;
    search.style.setProperty('--seen-search-origin-x', `${rect.left + rect.width / 2 - targetCenterX}px`);
    search.style.setProperty('--seen-search-origin-y', `${rect.top + rect.height / 2 - targetCenterY}px`);
  } else {
    search.style.removeProperty('--seen-search-origin-x');
    search.style.removeProperty('--seen-search-origin-y');
  }
  search.classList.toggle('open', open);
  document.body.classList.toggle('search-focus-active', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close seen search' : 'Open seen search');
  if (open) {
    setTimeout(() => $('#seenSearchInput')?.focus(), 80);
  }
}

function clearSeenSearch({ collapse = false } = {}) {
  const input = $('#seenSearchInput');
  const suggestions = $('#seenSuggestions');
  if (input) {
    input.value = '';
    if (collapse) input.blur();
  }
  if (suggestions) suggestions.hidden = true;
  state.seenPlayers = [];
  if (collapse) setSeenSearchOpen(false);
  if (collapse) {
    setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 80);
  }
}

function toggleSeenSearch() {
  const isOpen = $('#seenSearch')?.classList.contains('open');
  if (isOpen) clearSeenSearch({ collapse: true });
  else setSeenSearchOpen(true);
}

function renderSeenSuggestions(players) {
  const suggestions = $('#seenSuggestions');
  state.seenPlayers = players || [];

  if (!suggestions) return;
  if (state.seenPlayers.length === 0) {
    suggestions.innerHTML = '<div class="seen-empty">No players found.</div>';
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = state.seenPlayers.map((player, index) => `
    <button class="seen-option" type="button" data-index="${index}">
      ${playerIdentity(player.username, 24, { status: player.isOnline ? 'online' : 'offline' })}
      <span class="muted">${player.lastSeen ? formatAgo(player.lastSeen) : 'never seen'}</span>
    </button>
  `).join('');
  suggestions.hidden = false;
}

async function runSeenSearch(query) {
  const cleanQuery = query.trim();
  const suggestions = $('#seenSuggestions');
  if (cleanQuery.length < 1) {
    if (suggestions) suggestions.hidden = true;
    state.seenPlayers = [];
    return;
  }

  try {
    const payload = await fetchJson(`/api/seen-search?query=${encodeURIComponent(cleanQuery)}`);
    renderSeenSuggestions(payload.players || []);
  } catch (err) {
    if (suggestions) {
      suggestions.innerHTML = `<div class="seen-empty">Search failed: ${escapeHtml(err.message)}</div>`;
      suggestions.hidden = false;
    }
  }
}

function handleSeenInput(event) {
  clearTimeout(state.seenSearchTimer);
  const query = event.currentTarget.value;
  state.seenSearchTimer = setTimeout(() => runSeenSearch(query), 180);
}

function handleSeenSuggestionClick(event) {
  const option = event.target.closest('.seen-option');
  if (!option) return;
  const player = state.seenPlayers[Number(option.dataset.index)];
  if (!player) return;
  $('#seenSearchInput').value = player.username;
  $('#seenSearchInput').blur();
  $('#seenSuggestions').hidden = true;
  clearSeenSearch({ collapse: true });
  openPlayerProfile(player.username);
  setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 80);
}

function setWhisperOpen(open) {
  const panel = $('#whisperPanel');
  const toggle = $('#whisperToggle');
  const popover = $('#whisperPopover');
  if (!panel || !toggle || !popover) return;
  panel.classList.toggle('open', open);
  document.body.classList.toggle('whisper-focus-active', Boolean(open));
  panel.classList.toggle('has-dialog', Boolean(state.whisperTarget));
  popover.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close private messages' : 'Open private messages');
  if (!open) clearWhisperSearch();
  if (open) {
    loadWhisperOnlinePlayers().catch(err => setBanner(`Could not load private message list: ${err.message}`));
    if (state.whisperTarget) {
      loadWhisperDialog().catch(() => {});
    }
  }
}

function toggleWhisperPanel() {
  setWhisperOpen(!$('#whisperPanel')?.classList.contains('open'));
}

function renderWhisperBadge() {
  const badge = $('#whisperBadge');
  if (!badge) return;
  const count = Number(state.whisperUnreadCount) || 0;
  badge.hidden = count <= 0;
  badge.textContent = count > 99 ? '99+' : String(count);
}

function whisperLastSeenStorageKey() {
  const username = String(state.currentUser?.username || 'anonymous').toLowerCase();
  return `wm-whisper-last-seen-id:${username}`;
}

function whisperDialogReadStorageKey() {
  const username = String(state.currentUser?.username || 'anonymous').toLowerCase();
  return `wm-whisper-dialog-read-ids:${username}`;
}

function loadWhisperLastSeenId() {
  state.whisperLastSeenId = localStorage.getItem(whisperLastSeenStorageKey()) || null;
  try {
    state.whisperDialogReadIds = JSON.parse(localStorage.getItem(whisperDialogReadStorageKey()) || '{}') || {};
  } catch (_) {
    state.whisperDialogReadIds = {};
  }
  state.whisperReadStateSynced = false;
  state.whisperUnreadCount = 0;
  renderWhisperBadge();
}

async function syncLegacyWhisperReadState() {
  if (state.whisperReadStateSynced || !state.currentUser) return;
  state.whisperReadStateSynced = true;
  if (Object.keys(state.whisperDialogReadIds || {}).length === 0) return;
  try {
    const payload = await postJson('/api/whisper/read', {
      readState: state.whisperDialogReadIds
    });
    state.whisperUnreadCount = payload.unreadCount || 0;
    renderWhisperBadge();
  } catch (_) {
    state.whisperReadStateSynced = false;
  }
}

function markWhisperDialogRead(username, maxId) {
  const key = String(username || '').toLowerCase();
  const nextId = Number(maxId);
  if (!key || !Number.isFinite(nextId)) return;
  const currentId = Number(state.whisperDialogReadIds[key] || 0);
  if (nextId <= currentId) return;
  state.whisperDialogReadIds[key] = String(nextId);
  localStorage.setItem(whisperDialogReadStorageKey(), JSON.stringify(state.whisperDialogReadIds));
  postJson('/api/whisper/read', {
    username,
    messageId: String(nextId)
  }).then(payload => {
    state.whisperUnreadCount = payload.unreadCount || 0;
    renderWhisperBadge();
  }).catch(() => {});
  state.whisperPlayers = state.whisperPlayers.map(player =>
    String(player.username || '').toLowerCase() === key
      ? { ...player, unreadCount: 0 }
      : player
  );
  state.whisperUnreadCount = state.whisperPlayers.reduce((sum, player) => sum + (Number(player.unreadCount) || 0), 0);
  renderWhisperBadge();
  renderWhisperPlayers();
}

async function loadWhisperNotifications({ markRead = false } = {}) {
  await syncLegacyWhisperReadState();
  const payload = await fetchJson('/api/whisper/notifications');
  state.whisperUnreadCount = payload.unreadCount || 0;
  renderWhisperBadge();
}

function closeWhisperDialog() {
  state.whisperTarget = null;
  state.whisperMessagesSignature = '';
  $('#whisperPanel')?.classList.remove('has-dialog');
  const dialog = $('#whisperDialog');
  const messages = $('#whisperMessages');
  const input = $('#whisperInput');
  if (dialog) dialog.hidden = true;
  if (messages) messages.innerHTML = '';
  if (input) input.value = '';
  renderWhisperPlayers();
}

function clearWhisperSearch() {
  clearTimeout(state.whisperSearchTimer);
  const input = $('#whisperSearchInput');
  if (input) input.value = '';
  state.whisperSearchPlayers = [];
  state.whisperPlayersSignature = '';
  renderWhisperPlayers();
}

function renderWhisperSearchResults(players) {
  state.whisperSearchPlayers = players || [];
  const signature = `search:${JSON.stringify([
    state.whisperTarget || '',
    ...state.whisperSearchPlayers.map(player => [
      player.username || '',
      Boolean(player.isOnline),
      player.lastSeen || ''
    ])
  ])}`;
  if (state.whisperPlayersSignature === signature && $('#whisperPlayers .whisper-player[data-mode="search"]')) {
    return;
  }
  state.whisperPlayersSignature = signature;

  renderWhisperPlayerList(state.whisperSearchPlayers, { search: true, emptyText: 'No players found.' });
}

async function runWhisperSearch(query) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 1) {
    clearWhisperSearch();
    return;
  }

  try {
    const payload = await fetchJson(`/api/seen-search?query=${encodeURIComponent(cleanQuery)}`);
    renderWhisperSearchResults(payload.players || []);
  } catch (err) {
    const list = $('#whisperPlayers');
    if (list) {
      list.innerHTML = `<div class="seen-empty">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }
}

async function refreshActiveWhisperSearch() {
  const query = $('#whisperSearchInput')?.value.trim();
  if (!query) return false;
  await runWhisperSearch(query);
  return true;
}

function handleWhisperSearchInput(event) {
  clearTimeout(state.whisperSearchTimer);
  const query = event.currentTarget.value;
  state.whisperSearchTimer = setTimeout(() => runWhisperSearch(query), 180);
}

function renderWhisperPlayerList(players, { search = false, emptyText = 'No players or dialogs.' } = {}) {
  const list = $('#whisperPlayers');
  if (!list) return;

  if (!players.length) {
    list.innerHTML = `<div class="seen-empty">${emptyText}</div>`;
    return;
  }

  list.querySelectorAll('.seen-empty').forEach(node => node.remove());
  const existing = new Map(Array.from(list.querySelectorAll('.whisper-player')).map(button => [
    `${button.dataset.mode || 'list'}:${button.dataset.key || ''}`,
    button
  ]));
  const used = new Set();
  const active = String(state.whisperTarget || '').toLowerCase();

  players.forEach((player, index) => {
    const username = player.username || '';
    const key = username.toLowerCase();
    const mode = search ? 'search' : 'list';
    const mapKey = `${mode}:${key}`;
    let button = existing.get(mapKey);

    if (!button) {
      button = document.createElement('button');
      button.className = 'whisper-player';
      button.type = 'button';
      button.dataset.key = key;
      button.dataset.mode = mode;
    }

    const isActive = key === active;
    const isOnline = Boolean(player.isOnline);
    const unreadCount = Number(player.unreadCount) || 0;
    const messageBadge = !search && unreadCount > 0
      ? `<span class="whisper-message-count" aria-label="${formatNumber(unreadCount)} unread messages">${formatNumber(unreadCount)}</span>`
      : '';
    const contentSignature = JSON.stringify([username, isOnline, unreadCount, isActive, search]);
    if (button.dataset.renderSignature !== contentSignature) {
      button.innerHTML = `
        <span class="whisper-player-identity">${playerIdentity(username, 24, { status: isOnline ? 'online' : 'offline' })}${messageBadge}</span>
      `;
      button.dataset.renderSignature = contentSignature;
    }

    if (button.classList.contains('active') !== isActive) {
      button.classList.toggle('active', isActive);
    }
    if (button.style.getPropertyValue('--item-index') !== String(index)) {
      button.style.setProperty('--item-index', index);
    }
    if (search) {
      delete button.dataset.index;
      button.dataset.searchIndex = String(index);
    } else {
      delete button.dataset.searchIndex;
      button.dataset.index = String(index);
    }
    const currentNode = list.children[index];
    if (currentNode !== button) {
      list.insertBefore(button, currentNode || null);
    }
    used.add(mapKey);
  });

  for (const [key, button] of existing.entries()) {
    if (!used.has(key)) button.remove();
  }
}

function mergeWhisperPlayerStatus(player) {
  if (!player?.username) return;
  const key = String(player.username).toLowerCase();
  const targetKey = String(state.whisperTarget || '').toLowerCase();
  const patchPlayer = entry =>
    String(entry.username || '').toLowerCase() === key
      ? {
          ...entry,
          username: player.username || entry.username,
          isOnline: Boolean(player.isOnline),
          lastSeen: player.lastSeen ?? entry.lastSeen,
          lastOnline: player.lastOnline ?? entry.lastOnline
        }
      : entry;

  let foundInList = false;
  state.whisperPlayers = state.whisperPlayers.map(entry => {
    if (String(entry.username || '').toLowerCase() === key) foundInList = true;
    return patchPlayer(entry);
  });
  state.whisperSearchPlayers = state.whisperSearchPlayers.map(patchPlayer);

  if (!foundInList && key && key === targetKey) {
    state.whisperPlayers = [{
      username: player.username,
      isOnline: Boolean(player.isOnline),
      isWhitelisted: false,
      lastSeen: player.lastSeen || null,
      lastOnline: player.lastOnline || null,
      lastMessageAt: null,
      messageCount: 0,
      unreadCount: 0
    }, ...state.whisperPlayers];
  }
}

function renderWhisperPlayers() {
  const list = $('#whisperPlayers');
  if (!list) return;
  const searchInput = $('#whisperSearchInput');
  if (searchInput?.value.trim()) {
    renderWhisperSearchResults(state.whisperSearchPlayers);
    return;
  }
  const signature = JSON.stringify([
    state.whisperTarget || '',
    ...state.whisperPlayers.map(player => [
      player.username || '',
      Boolean(player.isOnline),
      Boolean(player.isWhitelisted),
      player.lastMessageAt || '',
      player.messageCount || 0,
      player.unreadCount || 0
    ])
  ]);
  if (signature === state.whisperPlayersSignature) return;
  state.whisperPlayersSignature = signature;

  if (!state.whisperPlayers.length) {
    renderWhisperPlayerList([], { emptyText: 'No players or dialogs.' });
    return;
  }

  renderWhisperPlayerList(state.whisperPlayers);
}

function updateWhisperDialogTitle() {
  const title = $('#whisperTargetTitle');
  if (!title || !state.whisperTarget) return;
  const player = state.whisperPlayers.find(entry =>
    String(entry.username || '').toLowerCase() === String(state.whisperTarget || '').toLowerCase()
  );
  const isOnline = Boolean(player?.isOnline);
  const signature = JSON.stringify([state.whisperTarget, isOnline]);
  if (title.dataset.renderSignature === signature) return;
  title.innerHTML = `
    ${playerIdentity(state.whisperTarget, 26, { status: isOnline ? 'online' : 'offline' })}
  `;
  title.dataset.renderSignature = signature;
}

async function loadWhisperOnlinePlayers({ force = false } = {}) {
  if (!force && !$('#whisperPanel')?.classList.contains('open')) return;
  await syncLegacyWhisperReadState();
  const payload = await fetchJson('/api/whisper/online');
  state.whisperPlayers = payload.players || [];
  state.whisperUnreadCount = state.whisperPlayers.reduce((sum, player) => sum + (Number(player.unreadCount) || 0), 0);
  renderWhisperBadge();
  if (!(await refreshActiveWhisperSearch())) {
    renderWhisperPlayers();
  }
  updateWhisperDialogTitle();
}

function renderWhisperMessages(messages) {
  const list = $('#whisperMessages');
  if (!list) return;
  if ($('#whisperPanel')?.classList.contains('open')) {
    const latestId = (messages || []).reduce((max, message) => {
      const id = Number(message.id);
      return Number.isFinite(id) && id > max ? id : max;
    }, 0);
    markWhisperDialogRead(state.whisperTarget, latestId);
  }
  const signature = JSON.stringify((messages || []).map(message => [
    message.id,
    message.direction,
    message.message,
    message.deliveryStatus || '',
    message.createdAt
  ]));
  if (signature === state.whisperMessagesSignature) return;
  state.whisperMessagesSignature = signature;

  list.innerHTML = messages.length
    ? messages.map(message => `
      <div class="whisper-message ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}">
        <p>${escapeHtml(message.message)}</p>
        <time>
          ${message.direction === 'outgoing' ? 'You' : escapeHtml(message.playerUsername || state.whisperTarget)}
          &middot; ${formatChatTime(message.createdAt)}
          ${message.direction === 'outgoing' ? `&middot; ${escapeHtml(message.deliveryStatus || 'sent')}` : ''}
        </time>
      </div>
    `).join('')
    : '<div class="empty">No private messages yet.</div>';
  list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
}

async function loadWhisperDialog() {
  if (!state.whisperTarget || !$('#whisperPanel')?.classList.contains('open')) return;
  const payload = await fetchJson(`/api/whisper/dialog?username=${encodeURIComponent(state.whisperTarget)}&limit=80`);
  mergeWhisperPlayerStatus(payload.player);
  renderWhisperPlayers();
  updateWhisperDialogTitle();
  renderWhisperMessages(payload.messages || []);
}

async function openWhisperDialog(username) {
  clearWhisperSearch();
  state.whisperTarget = username;
  state.whisperMessagesSignature = '';
  $('#whisperPanel')?.classList.add('has-dialog');
  const dialog = $('#whisperDialog');
  if (dialog) dialog.hidden = false;
  updateWhisperDialogTitle();
  renderWhisperPlayers();
  await loadWhisperDialog();
  setTimeout(() => $('#whisperInput')?.focus(), 60);
}

function handleWhisperPlayerClick(event) {
  event.preventDefault();
  event.stopPropagation();
  const button = event.target.closest('.whisper-player');
  if (!button) return;
  const player = button.dataset.searchIndex !== undefined
    ? state.whisperSearchPlayers[Number(button.dataset.searchIndex)]
    : state.whisperPlayers[Number(button.dataset.index)];
  if (!player?.username) return;
  clearWhisperSearch();
  openWhisperDialog(player.username).catch(err => setBanner(`Could not open dialog: ${err.message}`));
}

async function handleWhisperSubmit(event) {
  event.preventDefault();
  const input = $('#whisperInput');
  const button = $('#whisperSend');
  const message = input?.value.trim();
  if (!state.whisperTarget || !message) return;

  button.disabled = true;
  $('#whisperForm')?.classList.add('sending');
  try {
    await postJson('/api/whisper/send', {
      username: state.whisperTarget,
      message
    });
    input.value = '';
    await loadWhisperDialog();
  } catch (err) {
    setBanner(`Could not send private message: ${err.message}`);
  } finally {
    button.disabled = false;
    $('#whisperForm')?.classList.remove('sending');
    input?.focus();
  }
}

async function handleWhisperDeleteDialog() {
  const username = state.whisperTarget;
  if (!username) return;
  if (!window.confirm(`Delete private chat with ${username}?`)) return;

  const button = $('#whisperDeleteDialog');
  if (button) button.disabled = true;
  try {
    await postJson('/api/whisper/dialog/delete', { username });
    closeWhisperDialog();
    await loadWhisperOnlinePlayers();
  } catch (err) {
    setBanner(`Could not delete private chat: ${err.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderChatMessages(messages) {
  const list = $('#chatList');
  if (!list) return;
  const safeMessages = Array.isArray(messages) ? messages.filter(message => message?.id != null) : [];
  const listSignature = stableSignature(safeMessages.map(message => [
    message.id,
    message.type,
    message.username,
    message.message,
    message.event,
    message.createdAt
  ]));

  if (!safeMessages.length) {
    if (state.renderSignatures['#chatList'] === listSignature) return;
    if (list.dataset.empty !== 'true') {
      list.innerHTML = '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>';
      list.dataset.empty = 'true';
    }
    state.renderSignatures['#chatList'] = listSignature;
    return;
  }

  if (state.renderSignatures['#chatList'] === listSignature) return;
  state.renderSignatures['#chatList'] = listSignature;

  const distanceFromBottom = list.scrollHeight - list.clientHeight - list.scrollTop;
  const keepBottom = distanceFromBottom < 48;
  const previousScrollTop = list.scrollTop;
  const previousIds = state.chatMessageIds;
  const fragment = document.createDocumentFragment();

  safeMessages.forEach(message => {
    const id = String(message.id);
    const isActivity = message.type === 'activity';
    const isNew = state.chatInitialized && !previousIds.has(id);
    const article = document.createElement('article');
    article.dataset.messageId = id;
    article.className = `chat-message${isActivity ? ' chat-activity' : ''}${isNew ? ' new-message' : ''}`;
    article.classList.toggle('reply-active', !isActivity && state.chatReplyActiveMessageId === id);
    const username = String(message.username || 'Minecraft');
    const text = isActivity
      ? (message.event === 'join' ? 'joined the game' : 'left the game')
      : String(message.message || '');
    article.innerHTML = `
      <div class="chat-user">${playerIdentity(username, isActivity ? 24 : 28)}</div>
      <div class="chat-text"></div>
      <div class="chat-meta">
        <time class="chat-time">${formatChatTime(message.createdAt)}</time>
        ${isActivity ? '' : `<button class="chat-reply-button" type="button" aria-label="Reply to ${escapeHtml(username)}" title="Reply"><img src="/logos/reply.png" alt="" aria-hidden="true"></button>`}
      </div>`;
    article.querySelector('.chat-text').textContent = text;
    const replyButton = article.querySelector('.chat-reply-button');
    if (replyButton) {
      replyButton.dataset.chatReply = username;
      replyButton.dataset.chatReplyText = text;
    }
    fragment.append(article);
  });

  delete list.dataset.empty;
  list.replaceChildren(fragment);

  requestAnimationFrame(() => {
    if (keepBottom) {
      list.scrollTop = list.scrollHeight;
    } else {
      list.scrollTop = previousScrollTop;
    }
  });
}

function renderChat(payload) {
  setRollingNumber('#chat24h', payload.totals?.last24h);
  setRollingNumber('#activeChatters', payload.totals?.activeChatters24h);
  setRollingNumber('#chatAllTime', payload.totals?.allTime);

  const messages = payload.messages || [];
  const firstChatRender = !state.chatInitialized;
  renderChatMessages(messages);
  if (firstChatRender) {
    scrollToBottom('#chatList');
  }
  updateChatScrollButton();
  state.chatMessageIds = new Set(messages.map(message => String(message.id)));
  state.chatLatestId = String(payload.latestId ?? state.chatLatestId ?? '0');
  state.chatInitialized = true;

  const topChatters = payload.topChatters || [];
  renderStable('#topChatters', topChatters.length
    ? topChatters.map((player, index) => `
      <div class="rank-item top-chatter-item">
        <span class="rank-index">${index + 1}</span>
        ${playerIdentity(player.username, 28)}
        <strong>${formatNumber(player.count)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No chat activity in the last 24 hours.</div>',
    topChatters.map(player => [player.username, player.count])
  );

  state.charts.chatHourly = payload.hourly || [];
  redrawCharts();
}

function handleChatReplyClick(event) {
  const button = event.target.closest('[data-chat-reply]');
  if (!button) return;

  const username = String(button.dataset.chatReply || '').trim();
  if (!username) return;
  state.chatReply = {
    username,
    message: String(button.dataset.chatReplyText || '').trim()
  };
  renderGameChatReplyPreview();
  $('#gameChatInput')?.focus();
}

function handleChatMessagePointerDown(event) {
  if (event.pointerType === 'mouse') return;
  const message = event.target.closest('.chat-message:not(.chat-activity)');
  const list = event.currentTarget;
  if (!message || !list.contains(message)) return;

  state.chatReplyActiveMessageId = message.dataset.messageId || null;
  list.querySelectorAll('.chat-message.reply-active').forEach(node => {
    if (node !== message) node.classList.remove('reply-active');
  });
  message.classList.add('reply-active');
}

function clearGameChatReply() {
  state.chatReply = null;
  renderGameChatReplyPreview();
  $('#gameChatInput')?.focus();
}

function renderGameChatReplyPreview() {
  const preview = $('#gameChatReplyPreview');
  if (!preview) return;
  const reply = state.chatReply;

  if (state.chatReplyHideTimer) {
    clearTimeout(state.chatReplyHideTimer);
    state.chatReplyHideTimer = null;
  }

  if (!reply) {
    preview.classList.remove('visible');
    state.chatReplyHideTimer = setTimeout(() => {
      if (!state.chatReply) preview.hidden = true;
      state.chatReplyHideTimer = null;
    }, 180);
    return;
  }

  preview.hidden = false;
  $('#gameChatReplyPlayer').textContent = reply.username;
  $('#gameChatReplyText').textContent = reply.message || 'Replying to this player';
  requestAnimationFrame(() => preview.classList.add('visible'));
}

function appendReplyTarget(message, username) {
  const cleanMessage = String(message || '').trim();
  const cleanUsername = String(username || '').trim();
  if (!cleanMessage || !cleanUsername) return cleanMessage;
  return `${cleanMessage}${/\s$/.test(cleanMessage) ? '' : ' '}${cleanUsername}`;
}

function normalizeInventoryItem(item) {
  if (!item) return null;
  return {
    ...item,
    label: item.label || item.displayName || item.name || 'Item',
    count: item.count || 1
  };
}

function equipmentBySlot(armor = []) {
  const bySlot = new Map();
  armor.map(normalizeInventoryItem).filter(Boolean).forEach(item => {
    const slot = Number(item.slot);
    if (Number.isFinite(slot)) bySlot.set(slot, item);
  });
  return bySlot;
}

function renderEquipmentSlot(label, slot, item, tooltipPrefix) {
  return `
    <div class="equipment-slot">
      <span class="inventory-slot-label">${escapeHtml(label)}</span>
      ${renderInventorySlot(slot, item, { label: `${label} slot`, tooltipPrefix })}
    </div>
  `;
}

function renderBotInventory(selector, bot, connected) {
  const inventory = (bot?.inventory || []).map(normalizeInventoryItem).filter(Boolean);
  const armor = equipmentBySlot(bot?.armor || []);
  const heldItem = normalizeInventoryItem(bot?.heldItem);
  const offhandItem = inventory.find(item => Number(item.slot) === 45);
  const slots = inventoryGridSlots(inventory);

  state.supplyTooltipItems = Object.fromEntries(Object.entries(state.supplyTooltipItems).filter(([key]) => (
    !key.startsWith('bot-inventory:') &&
    !key.startsWith('bot-equipment:') &&
    !key.startsWith('bot-held:')
  )));

  if (!connected && !inventory.length && !armor.size && !heldItem) {
    renderStable(selector, '<div class="empty">No live bot inventory snapshot yet.</div>', ['bot-inventory-empty']);
    return;
  }

  const html = `
    <div class="bot-inventory-layout">
      <div class="bot-equipment-panel" aria-label="Bot equipment">
        ${renderEquipmentSlot('Helmet', 5, armor.get(5), 'bot-equipment')}
        ${renderEquipmentSlot('Chest / Elytra', 6, armor.get(6), 'bot-equipment')}
        ${renderEquipmentSlot('Leggings', 7, armor.get(7), 'bot-equipment')}
        ${renderEquipmentSlot('Boots', 8, armor.get(8), 'bot-equipment')}
      </div>
      <div class="bot-hand-panel" aria-label="Bot hands">
        <div class="inventory-offhand">
          <span class="inventory-slot-label">Offhand</span>
          ${renderInventorySlot(45, offhandItem, { tooltipPrefix: 'bot-inventory', label: 'Offhand slot' })}
        </div>
        ${renderEquipmentSlot('Held', 'held', heldItem, 'bot-held')}
      </div>
      <div class="inventory-layout bot-main-inventory">
        <div class="inventory-grid" aria-label="Bot inventory slots">
          ${slots.map(({ slot, item, fallback }) => renderInventorySlot(slot, item, { fallback, tooltipPrefix: 'bot-inventory' })).join('')}
        </div>
      </div>
    </div>
  `;

  renderStable(selector, html, {
    inventory: inventory.map(item => [item.name, item.displayName, item.label, item.count, item.slot, item.remainingPercent]),
    armor: (bot?.armor || []).map(item => [item.name, item.displayName, item.count, item.slot, item.remainingPercent]),
    heldItem: heldItem ? [heldItem.name, heldItem.displayName, heldItem.count, heldItem.slot, heldItem.remainingPercent] : null
  });
}

function renderBotStats(payload) {
  const bot = payload.bot || null;
  const connected = Boolean(bot?.connected);
  $('#botConnectionState').textContent = bot?.status ? bot.status : 'unknown';
  $('#botStatusUpdated').textContent = `updated: ${formatDate(payload.observedAt || bot?.observedAt)}`;
  $('#botHealth').textContent = bot?.health == null ? '-' : bot.health;
  $('#botFood').textContent = bot?.food == null ? '-' : bot.food;
  $('#botUptime').textContent = connected ? formatDurationMs(bot.uptimeMs) : '-';
  $('#botReconnect').textContent = !bot
    ? 'waiting for bot snapshot'
    : bot.reconnectInMs
      ? `reconnect in ${formatDurationMs(bot.reconnectInMs)}`
      : 'current session';
  const pauseResumeButton = $('#botPauseResumeButton');
  if (pauseResumeButton) {
    const isPaused = bot?.status === 'paused';
    pauseResumeButton.dataset.botCommand = isPaused ? 'resume' : 'pause';
    pauseResumeButton.textContent = isPaused ? 'Resume' : 'Pause';
    pauseResumeButton.classList.toggle('ghost-button', isPaused);
  }

  renderBotInventory('#botInventory', bot, connected);

  $('#botDetails').innerHTML = `
    <div><span>Username</span><strong>${escapeHtml(bot?.username || '-')}</strong></div>
    <div><span>Server</span><strong>${escapeHtml(bot?.server || '-')}</strong></div>
    <div><span>Ping</span><strong>${bot?.ping == null ? '-' : `${formatNumber(bot.ping)} ms`}</strong></div>
    <div><span>Dimension</span><strong>${escapeHtml(bot?.dimension || '-')}</strong></div>
    <div><span>Game mode</span><strong>${escapeHtml(bot?.gameMode || '-')}</strong></div>
    <div><span>XP level</span><strong>${bot?.xpLevel == null ? '-' : formatNumber(bot.xpLevel)}</strong></div>
    <div><span>Following</span><strong>${escapeHtml(bot?.followTarget || 'None')}</strong></div>
    <div><span>Last offline reason</span><strong>${escapeHtml(bot?.lastOfflineReason || bot?.lastDisconnectReason || '-')}</strong></div>
  `;
}

function renderPlayerStats(payload = {}, nearbyPlayers = []) {
  $('#onlinePlayers').textContent = formatNumber(payload.players?.online);
  $('#totalPlayers').textContent = `of ${formatNumber(payload.players?.total)} whitelisted`;
  $('#onlineUnwhitelistedPlayers').textContent = formatNumber(payload.players?.onlineUnwhitelisted);
  $('#seen24h').textContent = formatNumber(payload.players?.seen24h);
  $('#seen7d').textContent = formatNumber(payload.players?.seen7d);
  state.charts.unwhitelistedHourly = payload.hourlyUnwhitelisted || [];

  const leaderboard = payload.playtimeLeaderboard || [];
  renderStable('#playtimeLeaderboard', leaderboard.length
    ? leaderboard.map((player, index) => `
      <div class="rank-item leaderboard-item">
        <span class="rank-index">${index + 1}</span>
        <span class="leaderboard-player">
          ${playerIdentity(player.username, 28, { status: player.isOnline ? 'online' : 'offline' })}
        </span>
        <strong>${escapeHtml(player.playtime)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No whitelist playtime data found.</div>',
    leaderboard.map(player => [player.username, player.isOnline, player.playtime])
  );

  const nearby = nearbyPlayers || [];
  renderStable('#nearbyList', nearby.length
    ? nearby.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <strong>${formatNumber(player.distance)} blocks</strong>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No nearby sightings yet.</div>',
    nearby.map(player => [player.username, player.distance, player.lastSeen])
  );

  const milestones = payload.milestones || [];
  renderStable('#playerMilestones', milestones.length
    ? milestones.map(milestone => `
      <div class="milestone-card${milestone.isRound ? ' round' : ''}">
        <div class="milestone-card-top">
          ${playerIdentity(milestone.username, 28)}
          <span class="milestone-when">${escapeHtml(formatMilestoneWhen(milestone.daysUntil))}</span>
        </div>
        <div class="milestone-main">
          <strong>${escapeHtml(formatMilestoneYears(milestone.years))}</strong>
          <span>on server</span>
        </div>
        <time>${formatDate(milestone.milestoneAt)}</time>
      </div>
    `).join('')
    : '<div class="empty">No player milestones in the next 60 days.</div>',
    milestones.map(milestone => [
      milestone.username,
      milestone.years,
      milestone.daysUntil,
      milestone.milestoneAt,
      milestone.isRound
    ])
  );
}

function countSupplyItems(supplies, predicate) {
  return (supplies?.items || []).reduce((sum, item) => {
    if (!predicate(item)) return sum;
    return sum + Math.max(1, Number(item.count) || 1);
  }, 0);
}

function usablePickaxeCount(...locations) {
  return locations.reduce((sum, supplies) => sum + countSupplyItems(
    supplies,
    item => /_pickaxe$/i.test(String(item.name || '')) && item.usable !== false
  ), 0);
}

function foodItemCount(...locations) {
  return locations.reduce((sum, supplies) => {
    const foodCount = Number(supplies?.foodCount);
    if (Number.isFinite(foodCount)) return sum + foodCount;
    return sum + countSupplyItems(
      supplies,
      item => item.remainingPercent == null && !/_pickaxe$/i.test(String(item.name || ''))
        && /apple|beef|porkchop|chicken|mutton|rabbit|cod|salmon|bread|carrot|potato|beetroot|melon|berries|cookie|stew|soup|pie|kelp/i.test(String(item.name || ''))
    );
  }, 0);
}

function recentObsidianRatePerDay(payload = {}) {
  const hourly = Array.isArray(payload.hourly) ? payload.hourly : [];
  const recentHours = hourly.slice(-48);
  const recentHourlyTotal = recentHours.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  if (recentHourlyTotal > 0) return recentHourlyTotal / Math.max(1, recentHours.length / 24);

  const daily = Array.isArray(payload.daily) ? payload.daily : [];
  const recentDays = daily.slice(-7).filter(item => (Number(item.value) || 0) > 0);
  if (recentDays.length > 0) {
    return recentDays.reduce((sum, item) => sum + (Number(item.value) || 0), 0) / recentDays.length;
  }

  const sessionRate = Number(payload.farm?.sessionPerHour) || 0;
  return sessionRate > 0 ? sessionRate * 24 : 0;
}

function formatSupplyNeededDate(daysUntilNeeded) {
  if (!Number.isFinite(daysUntilNeeded)) return '-';
  if (daysUntilNeeded <= 0.25) return 'today';
  const date = new Date(Date.now() + daysUntilNeeded * 86400000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit'
  }).format(date);
}

function estimateSupplyRefill(payload = {}) {
  const farm = payload.farm || {};
  const supplies = payload.supplies || {};
  const inventory = supplies.inventory;
  const barrel = supplies.barrel;
  const pickaxes = usablePickaxeCount(inventory, barrel);
  const food = foodItemCount(inventory, barrel);
  const blocksPerPickaxe = Number(farm.blocksPerPickaxe) > 0 ? Number(farm.blocksPerPickaxe) : 1500;
  const foodPerDay = 7;
  const ratePerDay = recentObsidianRatePerDay(payload);

  if (!supplies.hasSnapshot) {
    return 'No supply snapshot';
  }
  if (ratePerDay <= 0) {
    return `Need rate data (${formatNumber(pickaxes)} picks, ${formatNumber(food)} food)`;
  }

  const pickaxeDays = pickaxes > 0 ? (pickaxes * blocksPerPickaxe) / ratePerDay : 0;
  const foodDays = food > 0 ? food / foodPerDay : 0;
  const limitingDays = Math.min(pickaxeDays, foodDays);
  const limitingSupply = pickaxeDays <= foodDays ? 'pickaxes' : 'food est.';
  const approxDate = formatSupplyNeededDate(limitingDays);

  return `${approxDate} (${Math.max(0, Math.round(limitingDays))}d, ${limitingSupply})`;
}

function renderObsidian(payload) {
  const farm = payload.farm || {};
  $('#farmState').textContent = farm.desiredEnabled ? 'Enabled' : 'Disabled';
  $('#farmUpdated').textContent = `last update: ${formatDate(farm.updatedAt)}`;
  setRollingNumber('#obsidianTotal', farm.totalMined);
  setRollingNumber('#obsidianToday', farm.todayMined);
  setRollingNumber('#sessionRate', farm.sessionPerHour, { suffix: '/h' });
  setRollingNumber('#pickaxeAverage', farm.blocksPerPickaxe);
  setRollingNumber('#retiredPickaxes', farm.retiredPickaxes, { prefix: 'retired pickaxes: ' });

  $('#farmDetails').innerHTML = `
    <div><span>Last 7 days</span><strong id="farmLast7Days">- blocks</strong></div>
    <div><span>Retired pickaxe blocks</span><strong id="farmRetiredPickaxeBlocks">-</strong></div>
    <div><span>Supplies snapshot</span><strong>${formatDate(payload.supplies?.updatedAt)}</strong></div>
    <div><span>Refill around</span><strong>${escapeHtml(estimateSupplyRefill(payload))}</strong></div>
  `;
  setRollingNumber('#farmLast7Days', farm.last7Days, { suffix: ' blocks' });
  setRollingNumber('#farmRetiredPickaxeBlocks', farm.retiredPickaxeBlocks);

  renderSupplies('#inventorySupplies', payload.supplies?.inventory);
  renderSupplies('#barrelSupplies', payload.supplies?.barrel, payload.supplies?.barrelError);
  state.charts.obsidianHourly = payload.hourly || [];
  state.charts.obsidianDaily = payload.daily || [];
  redrawCharts();
}

function renderSupplies(selector, supplies, error = null) {
  const target = $(selector);
  if (!target) return;
  if (!supplies) {
    renderStable(selector, `<div class="empty">${escapeHtml(error || 'No supply snapshot available.')}</div>`, ['empty', error]);
    return;
  }

  const items = supplies.items || [];
  if (selector === '#inventorySupplies') {
    renderInventorySupplies(selector, items);
    return;
  }
  if (selector === '#barrelSupplies') {
    renderContainerSupplies(selector, items);
    return;
  }

  const itemList = items.length
    ? items.map(item => {
        const durability = item.remainingPercent == null
          ? ''
          : `<span class="muted">${Number(item.remainingPercent).toFixed(1)}%</span>`;
        const low = item.usable === false ? '<span class="pill low">low</span>' : '';
        return `
          <div class="supply-item">
            <span class="supply-name">${itemIcon(item)}<span>${escapeHtml(item.label)}</span></span>
            <strong>x${formatNumber(item.count)}</strong>
            ${durability}
            ${low}
          </div>
        `;
      }).join('')
    : '<div class="empty">No items recorded.</div>';

  renderStable(selector, `<div class="supply-items">${itemList}</div>`, {
    items: items.map(item => [
      item.name,
      item.label,
      item.count,
      item.remainingPercent,
      item.usable,
      item.enchantments
    ])
  });
}

function registerSupplyTooltipItem(key, item) {
  state.supplyTooltipItems[key] = item;
  return key;
}

function supplyTooltipKey(prefix, slot, item) {
  return registerSupplyTooltipItem(`${prefix}:${slot}`, item);
}

function inventoryGridSlots(items) {
  const bySlot = new Map();
  const unplacedItems = [];
  for (const item of items || []) {
    const slot = Number(item.slot);
    if (Number.isFinite(slot) && slot >= 9 && slot <= 44) {
      bySlot.set(slot, item);
    } else if (slot === 45) {
      // Offhand is rendered separately from the 9x4 inventory grid.
      continue;
    } else if (String(item.name || '').toLowerCase() === 'totem_of_undying') {
      // Older snapshots missed the offhand slot; don't place the totem in the first inventory cell.
      continue;
    } else {
      unplacedItems.push(item);
    }
  }
  const slots = [
    ...Array.from({ length: 27 }, (_, index) => 9 + index),
    ...Array.from({ length: 9 }, (_, index) => 36 + index)
  ].map(slot => ({ slot, item: bySlot.get(slot) || null }));

  let nextUnplaced = 0;
  for (const entry of slots) {
    if (entry.item || nextUnplaced >= unplacedItems.length) continue;
    entry.item = unplacedItems[nextUnplaced];
    entry.fallback = true;
    nextUnplaced += 1;
  }

  return slots;
}

function containerGridSlots(items, size = 27) {
  const bySlot = new Map();
  const unplacedItems = [];
  for (const item of items || []) {
    const slot = Number(item.slot);
    if (Number.isFinite(slot) && slot >= 0 && slot < size) {
      bySlot.set(slot, item);
    } else {
      unplacedItems.push(item);
    }
  }
  const slots = Array.from({ length: size }, (_, slot) => ({ slot, item: bySlot.get(slot) || null }));
  let nextUnplaced = 0;
  for (const entry of slots) {
    if (entry.item || nextUnplaced >= unplacedItems.length) continue;
    entry.item = unplacedItems[nextUnplaced];
    entry.fallback = true;
    nextUnplaced += 1;
  }
  return slots;
}

function renderInventorySupplies(selector, items) {
  state.supplyTooltipItems = Object.fromEntries(Object.entries(state.supplyTooltipItems).filter(([key]) => !key.startsWith('inventory:')));
  const slots = inventoryGridSlots(items);
  const offhandItem = items.find(item => Number(item.slot) === 45) ||
    items.find(item => item.slot == null && String(item.name || '').toLowerCase() === 'totem_of_undying');
  if (!items.length) {
    renderStable(selector, '<div class="empty">No items recorded.</div>', ['inventory-empty']);
    return;
  }

  const html = `
    <div class="inventory-layout">
      <div class="inventory-offhand">
        <span class="inventory-slot-label">Offhand</span>
        ${renderInventorySlot(45, offhandItem, { tooltipPrefix: 'inventory', label: 'Offhand slot' })}
      </div>
      <div class="inventory-grid" aria-label="Bot inventory slots">
        ${slots.map(({ slot, item, fallback }) => renderInventorySlot(slot, item, { fallback, tooltipPrefix: 'inventory' })).join('')}
      </div>
    </div>
  `;

  renderStable(selector, html, {
    items: items.map(item => [
      item.name,
      item.label,
      item.count,
      item.slot,
      item.remainingPercent,
      item.usable,
      item.enchantments
    ])
  });
}

function renderContainerSupplies(selector, items) {
  state.supplyTooltipItems = Object.fromEntries(Object.entries(state.supplyTooltipItems).filter(([key]) => !key.startsWith('barrel:')));
  if (!items.length) {
    renderStable(selector, '<div class="empty">No items recorded.</div>', ['barrel-empty']);
    return;
  }
  const slots = containerGridSlots(items, 27);
  const html = `
    <div class="inventory-layout barrel-layout">
      <div class="inventory-grid barrel-grid" aria-label="Supply barrel slots">
        ${slots.map(({ slot, item, fallback }) => renderInventorySlot(slot, item, { fallback, tooltipPrefix: 'barrel' })).join('')}
      </div>
    </div>
  `;
  renderStable(selector, html, {
    items: items.map(item => [
      item.name,
      item.label,
      item.count,
      item.slot,
      item.remainingPercent,
      item.usable,
      item.enchantments
    ])
  });
}

function renderInventorySlot(slot, item, { fallback = false, label = 'Empty slot', tooltipPrefix = 'inventory' } = {}) {
  if (!item) return `<div class="inventory-slot" data-slot="${slot}" aria-label="${escapeHtml(label)}"></div>`;
  const itemLabel = item.displayName || item.label || item.name || 'Item';
  const durability = item.remainingPercent == null
    ? ''
    : `<span class="inventory-durability">${Number(item.remainingPercent).toFixed(0)}%</span>`;
  const low = item.usable === false ? ' low' : '';
  const tooltipKey = supplyTooltipKey(tooltipPrefix, slot, item);
  return `
    <div class="inventory-slot filled${low}${fallback ? ' fallback-position' : ''}" role="button" tabindex="0" data-slot="${slot}" data-supply-tooltip="${escapeHtml(tooltipKey)}" title="${escapeHtml(itemLabel)} x${formatNumber(item.count)}">
      ${itemIcon(item)}
      <span class="inventory-count">${formatNumber(item.count)}</span>
      ${durability}
    </div>
  `;
}

const ENCHANTMENT_ID_NAMES = {
  0: 'aqua_affinity',
  1: 'bane_of_arthropods',
  2: 'binding_curse',
  3: 'blast_protection',
  4: 'breach',
  5: 'channeling',
  6: 'density',
  7: 'depth_strider',
  8: 'efficiency',
  9: 'feather_falling',
  10: 'fire_aspect',
  11: 'fire_protection',
  12: 'flame',
  13: 'fortune',
  14: 'frost_walker',
  15: 'impaling',
  16: 'infinity',
  17: 'knockback',
  18: 'looting',
  19: 'loyalty',
  20: 'luck_of_the_sea',
  21: 'lure',
  22: 'mending',
  23: 'multishot',
  24: 'piercing',
  25: 'power',
  26: 'projectile_protection',
  27: 'protection',
  28: 'punch',
  29: 'quick_charge',
  30: 'respiration',
  31: 'riptide',
  32: 'sharpness',
  33: 'silk_touch',
  34: 'smite',
  35: 'soul_speed',
  36: 'sweeping_edge',
  37: 'swift_sneak',
  38: 'thorns',
  39: 'unbreaking',
  40: 'vanishing_curse',
  41: 'wind_burst',
  48: 'power',
  49: 'punch',
  50: 'flame',
  51: 'infinity',
  61: 'luck_of_the_sea',
  62: 'lure',
  65: 'loyalty',
  66: 'impaling',
  67: 'riptide',
  68: 'channeling',
  70: 'mending',
  71: 'vanishing_curse'
};

function formatEnchantmentName(name) {
  const normalized = ENCHANTMENT_ID_NAMES[String(name)] || name;
  return String(normalized || '')
    .replace(/^minecraft:/, '')
    .replace(/^block_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatEnchantmentLevel(level) {
  const roman = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V'
  };
  const numeric = Number(level);
  return roman[numeric] || formatNumber(level);
}

function hideSupplyTooltip() {
  const tooltip = $('#supplyTooltip');
  if (tooltip) tooltip.hidden = true;
}

function showSupplyTooltip(key, anchor) {
  const item = state.supplyTooltipItems[key];
  if (!item || !anchor) return;
  let tooltip = $('#supplyTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'supplyTooltip';
    tooltip.className = 'supply-tooltip';
    document.body.appendChild(tooltip);
  }
  const canDrop = state.currentUser?.role === 'admin' && (
    key.startsWith('bot-inventory:') ||
    key.startsWith('bot-equipment:') ||
    key.startsWith('bot-held:')
  );
  const dropPayload = canDrop
    ? escapeHtml(JSON.stringify({ slot: item.slot, name: item.name }))
    : '';
  tooltip.innerHTML = `
    <strong>${escapeHtml(item.displayName || item.label || item.name || 'Item')}</strong>
    <span>Count: ${formatNumber(item.count)}</span>
    ${item.slot == null ? '' : `<span>Slot: ${formatNumber(item.slot)}</span>`}
    ${item.remainingPercent == null ? '' : `<span>Durability: ${Number(item.remainingPercent).toFixed(1)}%</span>`}
    ${canDrop ? `<button class="tooltip-drop-button danger-button" type="button" data-tooltip-drop="${dropPayload}">Drop</button>` : ''}
  `;
  tooltip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 10, Math.max(10, rect.left + rect.width / 2 - tooltipRect.width / 2));
  const top = rect.top > tooltipRect.height + 14
    ? rect.top - tooltipRect.height - 8
    : rect.bottom + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - tooltipRect.height - 10, Math.max(10, top))}px`;
}

async function handleTooltipDrop(button) {
  const payload = JSON.parse(button.dataset.tooltipDrop || '{}');
  if (payload.slot == null && !payload.name) {
    throw new Error('Item cannot be dropped from this snapshot.');
  }
  button.disabled = true;
  button.textContent = 'Dropping...';
  await queueAdminCommand('drop_item', payload);
  scheduleAdminControlRefresh();
  hideSupplyTooltip();
}

function renderServerStats(payload) {
  renderPlayerStats(payload.playerStats || {}, payload.nearby || []);

  const tps = payload.tps || {};
  $('#latestTps').textContent = formatTps(tps.latest);
  $('#latestTpsAt').textContent = `sampled: ${formatDate(tps.latestAt)}`;
  $('#minTps').textContent = formatTps(tps.min24h);
  $('#maxTps').textContent = formatTps(tps.max24h);

  state.charts.tpsHourly = payload.hourlyTps || [];
  redrawCharts();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAdminUsers(users = []) {
  const list = $('#adminUsersList');
  if (!list) return;
  if (!users.length) {
    list.innerHTML = '<div class="empty">No registered users yet.</div>';
    return;
  }

  const currentUsername = state.currentUser?.username?.toLowerCase();
  list.innerHTML = users.map(user => {
    const username = escapeHtml(user.username);
    const status = escapeHtml(user.status);
    const role = escapeHtml(user.role);
    const lower = String(user.username || '').toLowerCase();
    const isSelf = lower === currentUsername;
    const isPrimaryAdmin = lower === 'bdiev_';
    const actions = [];

    if (user.status !== 'approved') {
      actions.push(`<button type="button" data-admin-action="approve" data-username="${username}">Approve</button>`);
    }
    if (!isPrimaryAdmin && !isSelf) {
      actions.push(`<button class="danger-button" type="button" data-admin-action="reject" data-username="${username}">Reject</button>`);
    }
    if (user.role !== 'admin' && user.status === 'approved') {
      actions.push(`<button class="ghost-button" type="button" data-admin-action="make_admin" data-username="${username}">Make admin</button>`);
    }
    if (user.role === 'admin' && !isPrimaryAdmin && !isSelf) {
      actions.push(`<button class="ghost-button" type="button" data-admin-action="remove_admin" data-username="${username}">Remove admin</button>`);
    }

    return `
      <article class="admin-user">
        <div>
          <strong>${username}</strong>
          <span class="muted">Registered ${formatDate(user.createdAt)}</span>
        </div>
        <span class="pill ${status}">${status}</span>
        <span class="pill">${role}</span>
        <div class="admin-user-actions">${actions.join('')}</div>
      </article>
    `;
  }).join('');
}

function renderLogDetails(details) {
  if (!details || typeof details !== 'object') return '';
  const text = JSON.stringify(details, null, 2);
  if (!text || text === '{}') return '';
  return `<pre>${escapeHtml(text)}</pre>`;
}

function renderAdminSystemLogs(logs = []) {
  const list = $('#adminSystemLogs');
  if (!list) return;
  list.querySelectorAll('.admin-log-details[data-log-id]').forEach(details => {
    if (details.open) state.adminOpenLogDetails.add(details.dataset.logId);
    else state.adminOpenLogDetails.delete(details.dataset.logId);
  });
  if (!logs.length) {
    list.innerHTML = '<div class="empty">No system log entries yet.</div>';
    state.adminOpenLogDetails.clear();
    return;
  }

  const visibleIds = new Set(logs.map(entry => String(entry.id || '')).filter(Boolean));
  state.adminOpenLogDetails.forEach(id => {
    if (!visibleIds.has(id)) state.adminOpenLogDetails.delete(id);
  });

  list.innerHTML = logs.map(entry => {
    const logId = String(entry.id || '');
    const level = escapeHtml(entry.level || 'info');
    const category = escapeHtml(entry.category || entry.kind || 'system');
    const actor = entry.actor ? `<span class="admin-log-actor">${escapeHtml(entry.actor)}</span>` : '';
    const kind = escapeHtml(entry.kind || 'system');
    const details = renderLogDetails(entry.details);
    const detailsOpen = logId && state.adminOpenLogDetails.has(logId) ? ' open' : '';
    const detailsId = logId ? ` data-log-id="${escapeHtml(logId)}"` : '';
    return `
      <article class="admin-log-entry ${level}" data-kind="${kind}">
        <div class="admin-log-main">
          <span class="admin-log-time">${formatDate(entry.createdAt)}</span>
          <span class="pill ${level}">${level}</span>
          <span class="admin-log-category">${category}</span>
          ${actor}
        </div>
        <p>${escapeHtml(entry.message || '')}</p>
        ${details ? `<details class="admin-log-details"${detailsId}${detailsOpen}><summary>Details</summary>${details}</details>` : ''}
      </article>
    `;
  }).join('');

  list.querySelectorAll('.admin-log-details[data-log-id]').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) state.adminOpenLogDetails.add(details.dataset.logId);
      else state.adminOpenLogDetails.delete(details.dataset.logId);
    });
  });
}

async function loadAdminSystemLogs() {
  if (state.currentUser?.role !== 'admin') return;
  if (state.adminLogsLoading) return;
  const list = $('#adminSystemLogs');
  const level = $('#adminLogLevel')?.value || 'all';
  state.adminLogsLoading = true;
  try {
    if (list && !list.children.length) list.innerHTML = '<div class="empty">Loading system log...</div>';
    const payload = await fetchJson(`/api/admin/system-logs?limit=160&level=${encodeURIComponent(level)}`);
    renderAdminSystemLogs(payload.logs || []);
  } catch (err) {
    if (list) list.innerHTML = `<div class="empty">Could not load system log: ${escapeHtml(err.message)}</div>`;
  } finally {
    state.adminLogsLoading = false;
  }
}

async function loadAdminUsers() {
  if (state.currentUser?.role !== 'admin') return;
  const list = $('#adminUsersList');
  try {
    if (list) list.innerHTML = '<div class="empty">Loading users...</div>';
    const payload = await fetchJson('/api/admin/users');
    renderAdminUsers(payload.users || []);
  } catch (err) {
    if (list) list.innerHTML = `<div class="empty">Could not load users: ${escapeHtml(err.message)}</div>`;
  }
}

function setSelectOptions(selector, values = [], { placeholder = 'Select...', valueFor = value => value, labelFor = value => value } = {}) {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...values.map(value => `<option value="${escapeHtml(valueFor(value))}">${escapeHtml(labelFor(value))}</option>`)
  ].join('');
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function normalizePlayerInput(value) {
  return String(value || '').trim();
}

function hasPlayer(list = [], username = '') {
  const normalized = normalizePlayerInput(username).toLowerCase();
  return Boolean(normalized) && list.some(entry => String(entry || '').toLowerCase() === normalized);
}

function uniquePlayers(...lists) {
  const seen = new Set();
  const players = [];
  for (const list of lists) {
    for (const value of list || []) {
      const username = typeof value === 'string' ? value : value?.username;
      const normalized = normalizePlayerInput(username);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      players.push(normalized);
    }
  }
  return players.sort((a, b) => a.localeCompare(b));
}

function setDatalistOptions(selector, values = []) {
  const datalist = $(selector);
  if (!datalist) return;
  datalist.innerHTML = values
    .map(username => `<option value="${escapeHtml(username)}"></option>`)
    .join('');
}

function setToggleActionButton(button, enabled, onConfig, offConfig) {
  if (!button) return;
  const config = enabled ? onConfig : offConfig;
  button.textContent = config.label;
  button.dataset.adminControlAction = config.action;
  button.classList.toggle('danger-button', Boolean(config.danger));
  button.classList.toggle('ghost-button', Boolean(config.ghost));
}

function updateFollowControl() {
  const button = $('#adminFollowButton');
  const selected = normalizePlayerInput($('#adminFollowTarget')?.value);
  const current = normalizePlayerInput(state.adminControlState?.bot?.followTarget);
  const stoppingCurrent = selected && current && selected.toLowerCase() === current.toLowerCase();
  setToggleActionButton(button, stoppingCurrent, {
    label: 'Stop Follow',
    action: 'follow_stop',
    danger: true
  }, {
    label: selected && current ? 'Switch Follow' : 'Follow',
    action: 'follow',
    ghost: !selected
  });
}

function updateWhitelistControl() {
  const button = $('#adminWhitelistButton');
  const username = normalizePlayerInput($('#adminWhitelistPlayer')?.value);
  const whitelisted = hasPlayer(state.adminControlState?.whitelist, username);
  setToggleActionButton(button, whitelisted, {
    label: 'Remove from Whitelist',
    action: 'whitelist_remove',
    danger: true
  }, {
    label: 'Add to Whitelist',
    action: 'whitelist_add',
    ghost: !username
  });
}

function hideAdminPlayerSuggestions(suggestionsSelector, stateKey) {
  const suggestions = $(suggestionsSelector);
  if (suggestions) suggestions.hidden = true;
  state[stateKey] = [];
  state.adminPlayerSearchRequests[stateKey] = (state.adminPlayerSearchRequests[stateKey] || 0) + 1;
}

function renderAdminPlayerSuggestions({ suggestionsSelector, stateKey, players, statusFor }) {
  const suggestions = $(suggestionsSelector);
  state[stateKey] = players || [];

  if (!suggestions) return;
  if (state[stateKey].length === 0) {
    suggestions.innerHTML = '<div class="seen-empty">No players found.</div>';
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = state[stateKey].map((player, index) => {
    const status = statusFor(player);
    return `
      <button class="seen-option" type="button" data-index="${index}">
        ${playerIdentity(player.username, 24, { status: player.isOnline ? 'online' : 'offline' })}
        <span class="pill ${status.className || ''}">${status.label}</span>
      </button>
    `;
  }).join('');
  suggestions.hidden = false;
}

async function runAdminPlayerSearch({ query, suggestionsSelector, stateKey, render }) {
  const cleanQuery = normalizePlayerInput(query);
  const requestId = (state.adminPlayerSearchRequests[stateKey] || 0) + 1;
  state.adminPlayerSearchRequests[stateKey] = requestId;

  if (cleanQuery.length < 1) {
    hideAdminPlayerSuggestions(suggestionsSelector, stateKey);
    return;
  }

  try {
    const payload = await fetchJson(`/api/seen-search?query=${encodeURIComponent(cleanQuery)}`);
    if (state.adminPlayerSearchRequests[stateKey] !== requestId) return;
    render(payload.players || []);
  } catch (err) {
    if (state.adminPlayerSearchRequests[stateKey] !== requestId) return;
    const suggestions = $(suggestionsSelector);
    if (suggestions) {
      suggestions.innerHTML = `<div class="seen-empty">Search failed: ${escapeHtml(err.message)}</div>`;
      suggestions.hidden = false;
    }
  }
}

function hideWhitelistSuggestions() {
  hideAdminPlayerSuggestions('#adminWhitelistSuggestions', 'whitelistSearchPlayers');
}

function renderWhitelistSuggestions(players) {
  renderAdminPlayerSuggestions({
    suggestionsSelector: '#adminWhitelistSuggestions',
    stateKey: 'whitelistSearchPlayers',
    players,
    statusFor: player => ({
      label: player.isWhitelisted ? 'whitelisted' : 'not whitelisted'
    })
  });
}

function runWhitelistSearch(query) {
  return runAdminPlayerSearch({
    query,
    suggestionsSelector: '#adminWhitelistSuggestions',
    stateKey: 'whitelistSearchPlayers',
    render: renderWhitelistSuggestions
  });
}

function handleWhitelistPlayerInput(event) {
  updateWhitelistControl();
  clearTimeout(state.whitelistSearchTimer);
  runWhitelistSearch(event.currentTarget.value);
}

function handleWhitelistSuggestionClick(event) {
  const option = event.target.closest('.seen-option');
  if (!option) return;
  const player = state.whitelistSearchPlayers[Number(option.dataset.index)];
  if (!player) return;
  const input = $('#adminWhitelistPlayer');
  if (input) {
    input.value = player.username;
    input.focus();
  }
  hideWhitelistSuggestions();
  updateWhitelistControl();
}

function updateIgnoreChatControl() {
  const button = $('#adminIgnoreChatButton');
  const username = normalizePlayerInput($('#adminIgnoreChatPlayer')?.value);
  const ignored = hasPlayer(state.adminControlState?.ignoredChatUsers, username);
  setToggleActionButton(button, ignored, {
    label: 'Unignore',
    action: 'unignore_chat',
    ghost: true
  }, {
    label: 'Ignore',
    action: 'ignore_chat',
    danger: Boolean(username)
  });
}

function hideIgnoreChatSuggestions() {
  hideAdminPlayerSuggestions('#adminIgnoreChatSuggestions', 'ignoreChatSearchPlayers');
}

function renderIgnoreChatSuggestions(players) {
  renderAdminPlayerSuggestions({
    suggestionsSelector: '#adminIgnoreChatSuggestions',
    stateKey: 'ignoreChatSearchPlayers',
    players,
    statusFor: player => {
      const ignored = hasPlayer(state.adminControlState?.ignoredChatUsers, player.username);
      return { label: ignored ? 'ignored' : 'not ignored' };
    }
  });
}

function runIgnoreChatSearch(query) {
  return runAdminPlayerSearch({
    query,
    suggestionsSelector: '#adminIgnoreChatSuggestions',
    stateKey: 'ignoreChatSearchPlayers',
    render: renderIgnoreChatSuggestions
  });
}

function handleIgnoreChatPlayerInput(event) {
  updateIgnoreChatControl();
  clearTimeout(state.ignoreChatSearchTimer);
  runIgnoreChatSearch(event.currentTarget.value);
}

function handleIgnoreChatSuggestionClick(event) {
  const option = event.target.closest('.seen-option');
  if (!option) return;
  const player = state.ignoreChatSearchPlayers[Number(option.dataset.index)];
  if (!player) return;
  const input = $('#adminIgnoreChatPlayer');
  if (input) {
    input.value = player.username;
    input.focus();
  }
  hideIgnoreChatSuggestions();
  updateIgnoreChatControl();
}

function renderAdminControlState(payload = {}) {
  state.adminControlState = payload;
  const settings = payload.settings || {};
  const bot = payload.bot || {};
  setRollingNumber('#adminDatabasePlayers', payload.playerTotals?.allTime);

  const obsidianButton = $('#obsidianToggleButton');
  if (obsidianButton) {
    const enabled = Boolean(bot?.obsidian?.desiredEnabled || bot?.obsidian?.enabled);
    obsidianButton.textContent = enabled ? 'Stop Farm' : 'Start Farm';
    obsidianButton.classList.add('ghost-button');
    obsidianButton.classList.remove('danger-button');
  }
  const obsidianRadiusButton = $('#obsidianRadiusButton');
  if (obsidianRadiusButton) {
    const radius = bot?.obsidian?.config?.maxCauldronDist;
    obsidianRadiusButton.textContent = radius ? `Radius: ${radius}` : 'Radius: -';
    obsidianRadiusButton.disabled = !radius;
  }
  const obsidianResetButton = $('#obsidianResetButton');
  if (obsidianResetButton) {
    obsidianResetButton.disabled = !bot?.obsidian?.config;
  }
  const obsidianConfig = bot?.obsidian?.config || null;
  const coordX = $('#obsidianCoordX');
  const coordY = $('#obsidianCoordY');
  const coordZ = $('#obsidianCoordZ');
  const coordRadius = $('#obsidianCoordRadius');
  if (!state.obsidianCoordinateEditorOpen) {
    if (coordX && document.activeElement !== coordX) coordX.value = obsidianConfig?.x ?? '';
    if (coordY && document.activeElement !== coordY) coordY.value = obsidianConfig?.y ?? '';
    if (coordZ && document.activeElement !== coordZ) coordZ.value = obsidianConfig?.z ?? '';
    if (coordRadius && document.activeElement !== coordRadius) coordRadius.value = String(obsidianConfig?.maxCauldronDist || 5);
  }
  const coordinateEditor = $('#obsidianCoordinateEditor');
  if (coordinateEditor) {
    coordinateEditor.hidden = state.currentUser?.role !== 'admin' || !state.obsidianCoordinateEditorOpen;
  }
  const child = bot.child || {};
  const childButton = $('#childToggleButton');
  if (childButton) {
    childButton.textContent = child.enabled ? 'Disable Child' : 'Enable Child';
    childButton.classList.toggle('danger-button', Boolean(child.enabled));
  }
  const geminiButton = $('#geminiToggleButton');
  if (geminiButton) {
    const enabled = child.geminiEnabled ?? settings.geminiEnabled;
    geminiButton.textContent = `Gemini: ${enabled ? 'On' : 'Off'}`;
    geminiButton.classList.toggle('ghost-button', !enabled);
  }
  const publicButton = $('#childPublicToggleButton');
  if (publicButton) {
    const enabled = child.publicSpeech ?? settings.childPublicSpeech;
    publicButton.textContent = `Public Chat: ${enabled ? 'On' : 'Off'}`;
    publicButton.classList.toggle('ghost-button', !enabled);
  }

  const nearbyPlayers = Array.isArray(payload.nearbyPlayers) ? [...payload.nearbyPlayers] : [];
  const currentFollowTarget = normalizePlayerInput(bot.followTarget);
  if (currentFollowTarget && !hasPlayer(nearbyPlayers.map(player => player.username), currentFollowTarget)) {
    nearbyPlayers.unshift({ username: currentFollowTarget, distance: 'current target' });
  }
  setSelectOptions('#adminFollowTarget', nearbyPlayers, {
    placeholder: 'Choose nearby player',
    valueFor: player => player.username,
    labelFor: player => Number.isFinite(Number(player.distance))
      ? `${player.username} (${player.distance} blocks)`
      : `${player.username} (${player.distance})`
  });
  const followSelect = $('#adminFollowTarget');
  if (followSelect && currentFollowTarget && !followSelect.value && [...followSelect.options].some(option => option.value.toLowerCase() === currentFollowTarget.toLowerCase())) {
    followSelect.value = [...followSelect.options].find(option => option.value.toLowerCase() === currentFollowTarget.toLowerCase()).value;
  }
  setSelectOptions('#adminDropItem', payload.inventory || [], {
    placeholder: 'Choose item',
    valueFor: item => JSON.stringify({ slot: item.slot, name: item.name }),
    labelFor: item => `${item.displayName || item.name} x${item.count || 1}`
  });
  updateFollowControl();
  updateWhitelistControl();
  updateIgnoreChatControl();
}

function clearObsidianCoordinateEditor() {
  const coordX = $('#obsidianCoordX');
  const coordY = $('#obsidianCoordY');
  const coordZ = $('#obsidianCoordZ');
  const coordRadius = $('#obsidianCoordRadius');
  if (coordX) coordX.value = '';
  if (coordY) coordY.value = '';
  if (coordZ) coordZ.value = '';
  if (coordRadius) coordRadius.value = '5';
}

function setButtonBusyState(commandType) {
  if (commandType === 'obsidian_toggle') {
    const button = $('#obsidianToggleButton');
    if (button) {
      const stopping = button.textContent.toLowerCase().includes('stop');
      button.textContent = stopping ? 'Stopping Farm...' : 'Starting Farm...';
    }
  } else if (commandType === 'obsidian_radius_toggle') {
    const button = $('#obsidianRadiusButton');
    if (button) button.textContent = 'Changing radius...';
  } else if (commandType === 'obsidian_reset_coordinates') {
    const button = $('#obsidianResetButton');
    if (button) button.textContent = 'Resetting...';
  } else if (commandType === 'pause' || commandType === 'resume') {
    const button = $('#botPauseResumeButton');
    if (button) button.textContent = commandType === 'pause' ? 'Pausing...' : 'Resuming...';
  } else if (commandType === 'child_toggle') {
    const button = $('#childToggleButton');
    if (button) button.textContent = button.textContent.toLowerCase().includes('disable') ? 'Disabling Child...' : 'Enabling Child...';
  }
}

function scheduleAdminControlRefresh(delayMs = 1800) {
  setTimeout(() => {
    if (state.currentUser?.role === 'admin') {
      Promise.all([loadAll(), loadAdminControlState()]).catch(() => {});
    }
  }, delayMs);
}

async function loadAdminControlState() {
  if (state.currentUser?.role !== 'admin') return;
  if (state.adminControlLoading) return;
  state.adminControlLoading = true;
  try {
    const payload = await fetchJson('/api/admin/control-state');
    renderAdminControlState(payload);
  } catch (err) {
    setBanner(`Could not load bot controls: ${err.message}`);
  } finally {
    state.adminControlLoading = false;
  }
}

async function handleAdminUserAction(event) {
  const button = event.target.closest('[data-admin-action]');
  if (!button) return;
  button.disabled = true;
  try {
    const payload = await postJson('/api/admin/users', {
      action: button.dataset.adminAction,
      username: button.dataset.username
    });
    renderAdminUsers(payload.users || []);
    await loadAdminSystemLogs();
  } catch (err) {
    setBanner(`Could not update user: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function handleAdminBotCommand(event) {
  const button = event.target.closest('[data-bot-command]');
  if (!button) return;
  if (state.currentUser?.role !== 'admin') return;

  const commandType = button.dataset.botCommand;
  const body = { commandType };
  if (commandType === 'obsidian_reset_coordinates' && !confirm('Reset Obsidian Farm coordinates? The farm will stop and ask for new coordinates next time.')) {
    return;
  }

  button.disabled = true;
  try {
    setButtonBusyState(commandType);
    await postJson('/api/admin/bot-command', body);
    if (commandType === 'obsidian_reset_coordinates') {
      state.obsidianCoordinateEditorOpen = true;
      clearObsidianCoordinateEditor();
    }
    await Promise.all([loadAll(), loadAdminControlState()]);
    await loadAdminSystemLogs();
    scheduleAdminControlRefresh();
  } catch (err) {
    console.error(`Could not queue bot command ${commandType}:`, err);
  } finally {
    button.disabled = false;
  }
}

async function queueAdminCommand(commandType, payload = {}) {
  await postJson('/api/admin/bot-command', { commandType, payload });
  await Promise.all([loadAll(), loadAdminControlState(), loadAdminSystemLogs()]);
}

async function handleAdminControlAction(event) {
  const button = event.target.closest('[data-admin-control-action]');
  if (!button) return;
  if (state.currentUser?.role !== 'admin') return;

  const action = button.dataset.adminControlAction;
  const payload = {};

  try {
    if (action === 'follow') {
      payload.username = $('#adminFollowTarget')?.value;
    } else if (action === 'follow_stop') {
      payload.username = $('#adminFollowTarget')?.value;
    } else if (action === 'drop_item') {
      Object.assign(payload, JSON.parse($('#adminDropItem')?.value || '{}'));
    } else if (action === 'whitelist_add') {
      payload.username = normalizePlayerInput($('#adminWhitelistPlayer')?.value);
    } else if (action === 'whitelist_remove') {
      payload.username = normalizePlayerInput($('#adminWhitelistPlayer')?.value);
    } else if (action === 'ignore_chat') {
      payload.username = normalizePlayerInput($('#adminIgnoreChatPlayer')?.value);
    } else if (action === 'unignore_chat') {
      payload.username = normalizePlayerInput($('#adminIgnoreChatPlayer')?.value);
    } else if (action === 'playtime_set') {
      payload.line = $('#adminPlaytimeInput')?.value.trim();
    } else if (action === 'registration_date_set') {
      payload.line = $('#adminRegistrationDateInput')?.value.trim();
    } else if (action === 'obsidian_set_coordinates') {
      payload.x = Number($('#obsidianCoordX')?.value);
      payload.y = Number($('#obsidianCoordY')?.value);
      payload.z = Number($('#obsidianCoordZ')?.value);
      payload.radius = Number($('#obsidianCoordRadius')?.value);
    }

    if (['follow', 'whitelist_add', 'whitelist_remove', 'ignore_chat', 'unignore_chat'].includes(action) && !payload.username) {
      throw new Error('Choose or enter a username first.');
    }
    if (action === 'drop_item' && payload.slot == null && !payload.name) {
      throw new Error('Choose an inventory item first.');
    }
    if (action === 'playtime_set' && !payload.line) {
      throw new Error('Enter a playtime line first.');
    }
    if (action === 'registration_date_set' && !payload.line) {
      throw new Error('Enter a registration date line first.');
    }
    if (action === 'obsidian_set_coordinates' && ![payload.x, payload.y, payload.z].every(Number.isFinite)) {
      throw new Error('Enter valid X, Y and Z coordinates first.');
    }

    button.disabled = true;
    if (action === 'playtime_set') {
      const result = await postJson('/api/admin/playtime', payload);
      setBanner(`Updated ${result.username} playtime to ${result.playtime}.`);
      $('#adminPlaytimeInput').value = '';
      await Promise.all([loadAll(), loadAdminSystemLogs()]);
      return;
    }
    if (action === 'registration_date_set') {
      const result = await postJson('/api/admin/registration-date', payload);
      setBanner(`Updated ${result.username} registration date to ${result.registrationDisplay}.`);
      $('#adminRegistrationDateInput').value = '';
      await Promise.all([loadAll(), loadAdminSystemLogs()]);
      return;
    }
    await queueAdminCommand(action, payload);
    if (action === 'obsidian_set_coordinates') {
      state.obsidianCoordinateEditorOpen = false;
      const coordinateEditor = $('#obsidianCoordinateEditor');
      if (coordinateEditor) coordinateEditor.hidden = true;
    }
    scheduleAdminControlRefresh();
    if (['whitelist_add', 'whitelist_remove'].includes(action)) {
      $('#adminWhitelistPlayer').value = '';
      updateWhitelistControl();
    }
    if (['ignore_chat', 'unignore_chat'].includes(action)) {
      $('#adminIgnoreChatPlayer').value = '';
      updateIgnoreChatControl();
    }
  } catch (err) {
    if (['playtime_set', 'registration_date_set'].includes(action)) {
      setBanner(`Could not update player data: ${err.message}`);
    } else {
      console.error(`Could not queue bot command ${action}:`, err);
    }
  } finally {
    button.disabled = false;
  }
}

async function handleGameChatSubmit(event) {
  event.preventDefault();
  const input = $('#gameChatInput');
  const button = $('#gameChatSend');
  const message = input?.value.trim();
  if (!message) return;
  const outgoingMessage = state.chatReply
    ? appendReplyTarget(message, state.chatReply.username)
    : message;

  button.disabled = true;
  try {
    await postJson('/api/chat/send', { message: outgoingMessage });
    input.value = '';
    state.chatReply = null;
    renderGameChatReplyPreview();
    setBanner('Message queued for game chat.');
    await loadAll();
  } catch (err) {
    setBanner(`Could not send game chat message: ${err.message}`);
  } finally {
    button.disabled = false;
    input?.focus();
  }
}

function updateNotificationBadge(count) {
  const badge = $('#notificationBadge');
  if (!badge) return;
  const value = Math.max(0, Number(count) || 0);
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.hidden = value === 0;
}

function notificationCard(item) {
  const unread = !item.readAt;
  return `<article class="notification-card ${escapeHtml(item.severity)} ${unread ? 'unread' : ''}">
    <div class="notification-card-head"><strong>${escapeHtml(item.title)}</strong><span class="notification-severity">${escapeHtml(item.severity)}</span></div>
    <p>${escapeHtml(item.message)}</p>
    <small>${escapeHtml(item.eventType)} · ${formatDate(item.createdAt)}${item.occurrenceCount > 1 ? ` · repeated ${item.occurrenceCount}x` : ''}</small>
    ${unread ? `<button class="ghost-button" type="button" data-notification-read="${item.id}">Mark read</button>` : ''}
  </article>`;
}

function renderNotifications(payload) {
  updateNotificationBadge(payload.unreadCount);
  const active = payload.notifications.filter(item => item.status === 'active');
  const history = payload.notifications.filter(item => item.status === 'resolved');
  $('#activeNotifications').innerHTML = active.length ? active.map(notificationCard).join('') : '<p class="muted">No active problems.</p>';
  $('#notificationHistory').innerHTML = history.length ? history.map(notificationCard).join('') : '<p class="muted">No history for this filter.</p>';
}

function renderNotificationRules(rules) {
  const target = $('#notificationRules');
  if (!target) return;
  const labels = {
    bot_disconnected: 'Bot disconnected', bot_reconnected: 'Bot reconnected', bot_kicked: 'Bot kicked',
    unauthorized_player_nearby: 'Unauthorized player nearby', low_pickaxe_durability: 'Low pickaxe durability',
    no_pickaxes: 'No pickaxes', low_food: 'Low food', farm_stalled: 'Farm stalled', low_tps: 'Low TPS',
    database_unavailable: 'Database unavailable', repeated_reconnects: 'Repeated reconnects', command_failed: 'Command failed'
  };
  target.innerHTML = rules.map(rule => {
    const thresholdEntries = Object.entries(rule.threshold || {});
    const [thresholdKey, thresholdValue] = thresholdEntries[0] || [];
    const thresholdLabel = thresholdKey ? thresholdKey.replaceAll('_', ' ') : 'Not used';
    return `<form class="notification-rule" data-rule="${escapeHtml(rule.eventType)}" data-threshold="${escapeHtml(JSON.stringify(rule.threshold))}">
      <div class="notification-rule-head">
        <div><strong>${escapeHtml(labels[rule.eventType] || rule.eventType)}</strong><small>${escapeHtml(rule.eventType)}</small></div>
        <label class="notification-enabled"><input name="enabled" type="checkbox" ${rule.enabled ? 'checked' : ''}> Enabled</label>
      </div>
      <div class="notification-rule-fields">
        <label class="auth-field"><span>Severity</span><select name="severity"><option value="info" ${rule.severity === 'info' ? 'selected' : ''}>Info</option><option value="warning" ${rule.severity === 'warning' ? 'selected' : ''}>Warning</option><option value="critical" ${rule.severity === 'critical' ? 'selected' : ''}>Critical</option></select></label>
        <label class="auth-field"><span>Threshold · ${escapeHtml(thresholdLabel)}</span><input name="thresholdValue" type="number" step="any" value="${thresholdValue ?? ''}" ${thresholdKey ? '' : 'disabled'}></label>
        <label class="auth-field"><span>Cooldown · seconds</span><input name="cooldown" type="number" min="0" value="${rule.cooldownSeconds}"></label>
        <fieldset class="notification-channels"><legend>Delivery</legend><label><input name="discord" type="checkbox" ${rule.deliveryChannels.includes('discord') ? 'checked' : ''}> Discord</label><label><input name="site" type="checkbox" ${rule.deliveryChannels.includes('site') ? 'checked' : ''}> Site</label><label><input name="system_log" type="checkbox" ${rule.deliveryChannels.includes('system_log') ? 'checked' : ''}> System log</label></fieldset>
      </div>
      <div class="notification-rule-footer"><small>Last triggered: ${rule.lastTriggeredAt ? formatDate(rule.lastTriggeredAt) : 'never'}</small><button type="submit">Save rule</button></div>
    </form>`;
  }).join('');
}

async function loadNotificationCount() {
  if (state.currentUser?.role !== 'admin') {
    updateNotificationBadge(0);
    return;
  }
  const payload = await fetchJson('/api/notifications?unread=true&limit=1');
  updateNotificationBadge(payload.unreadCount);
}

async function loadNotifications() {
  if (state.currentUser?.role !== 'admin') return;
  const params = new URLSearchParams({
    status: $('#notificationStatusFilter')?.value || 'all',
    severity: $('#notificationSeverityFilter')?.value || 'all',
    eventType: $('#notificationEventFilter')?.value || 'all'
  });
  if ($('#notificationUnreadFilter')?.checked) params.set('unread', 'true');
  const payload = await fetchJson(`/api/notifications?${params}`);
  renderNotifications(payload);
  if (state.currentUser.role === 'admin') {
    const rules = await fetchJson('/api/admin/notification-rules');
    state.notificationRules = rules.rules;
    renderNotificationRules(rules.rules);
  }
}

async function markNotificationRead(event) {
  const button = event.target.closest('[data-notification-read]');
  if (!button) return;
  await postJson('/api/notifications/read', { ids: [button.dataset.notificationRead] });
  await loadNotifications();
}

async function saveNotificationRule(event) {
  const form = event.target.closest('.notification-rule');
  if (!form) return;
  event.preventDefault();
  const channels = ['discord', 'site', 'system_log'].filter(name => form.elements[name].checked);
  const threshold = JSON.parse(form.dataset.threshold || 'null');
  if (threshold && form.elements.thresholdValue) {
    const key = Object.keys(threshold)[0];
    threshold[key] = Number(form.elements.thresholdValue.value);
  }
  try {
    await putJson('/api/admin/notification-rules', {
      eventType: form.dataset.rule, enabled: form.elements.enabled.checked,
      severity: form.elements.severity.value, threshold,
      cooldownSeconds: Number(form.elements.cooldown.value), deliveryChannels: channels
    });
    setBanner(`Notification rule ${form.dataset.rule} saved.`);
    await loadNotifications();
  } catch (err) {
    setBanner(`Could not save notification rule: ${err.message}`);
  }
}

function setRealtimeStatus(mode) {
  const indicator = $('#realtimeStatus');
  if (!indicator) return;
  if (mode === 'connected') {
    indicator.hidden = true;
    return;
  }
  indicator.hidden = false;
  const label = mode === 'unsupported' ? 'Live updates unavailable · polling' : 'Reconnecting live updates…';
  indicator.innerHTML = `<span aria-hidden="true"></span>${label}`;
}

function clearDashboardPolling() {
  clearInterval(state.timer);
  clearInterval(state.liveChatTimer);
  state.timer = null;
  state.liveChatTimer = null;
  state.pollingMode = null;
}

function startSlowPolling() {
  if (state.pollingMode === 'slow') return;
  clearDashboardPolling();
  state.pollingMode = 'slow';
  state.timer = setInterval(loadAll, 60_000);
  state.liveChatTimer = setInterval(checkChatVersion, 750);
}

function startFallbackPolling() {
  if (state.pollingMode === 'fallback') return;
  clearDashboardPolling();
  state.pollingMode = 'fallback';
  state.timer = setInterval(loadAll, 15_000);
  state.liveChatTimer = setInterval(loadLiveChats, 2_000);
}

function queueRealtimeRefresh(key, callback, delay = 180) {
  clearTimeout(state.realtimeRefreshTimers[key]);
  state.realtimeRefreshTimers[key] = setTimeout(async () => {
    delete state.realtimeRefreshTimers[key];
    if (!state.currentUser) return;
    try { await callback(); } catch { /* slow polling remains the consistency fallback */ }
  }, delay);
}

async function refreshChatFromEvent() {
  if (state.liveChatLoading) return;
  state.liveChatLoading = true;
  try {
    renderChat(await fetchJson('/api/chat?limit=160'));
    if (state.playerProfileUsername && !$('#playerProfileOverlay')?.hidden) {
      await loadPlayerProfile(state.playerProfileUsername);
    }
  } finally {
    state.liveChatLoading = false;
  }
}

async function checkChatVersion() {
  if (!state.currentUser || state.liveChatLoading) return;
  try {
    const payload = await fetchJson('/api/chat/version');
    const latestId = String(payload.latestId ?? '0');
    if (state.chatLatestId == null) {
      state.chatLatestId = latestId;
      return;
    }
    if (latestId !== state.chatLatestId) await refreshChatFromEvent();
  } catch {
    // EventSource and the periodic full synchronization remain available.
  }
}

async function refreshBotFromEvent() {
  renderBotStats(await fetchJson('/api/bot-stats'));
}

async function refreshFarmFromEvent() {
  renderObsidian(await fetchJson('/api/obsidian'));
}

async function refreshPlayersFromEvent() {
  renderServerStats(await fetchJson('/api/server-stats'));
}

function scheduleRealtimeChartRefresh() {
  const now = Date.now();
  if (now - state.lastRealtimeChartRefreshAt < 15_000) return;
  state.lastRealtimeChartRefreshAt = now;
  queueRealtimeRefresh('charts', refreshPlayersFromEvent, 500);
}

async function refreshWhispersFromEvent() {
  await loadWhisperOnlinePlayers({ force: true });
  if ($('#whisperPanel')?.classList.contains('open')) await loadWhisperDialog();
}

function handleRealtimeEvent(event) {
  const type = event.type;
  if (type === 'chat_message') queueRealtimeRefresh('chat', refreshChatFromEvent, 30);
  else if (type === 'whisper_message') queueRealtimeRefresh('whisper', refreshWhispersFromEvent);
  else if (type === 'bot_status_updated') {
    queueRealtimeRefresh('bot', refreshBotFromEvent);
    scheduleRealtimeChartRefresh();
  }
  else if (type === 'farm_status_updated') queueRealtimeRefresh('farm', refreshFarmFromEvent);
  else if (type === 'player_joined' || type === 'player_left') {
    queueRealtimeRefresh('players', refreshPlayersFromEvent);
    queueRealtimeRefresh('chat-activity', refreshChatFromEvent, 30);
  }
  else if (type === 'notification_created' && state.currentUser?.role === 'admin') {
    queueRealtimeRefresh('notifications', async () => {
      await loadNotificationCount();
      if (state.activeTab === 'notifications') await loadNotifications();
    });
  } else if (type === 'admin_control_updated' && state.currentUser?.role === 'admin') {
    queueRealtimeRefresh('admin-control', async () => {
      await loadAdminControlState();
      if (state.activeTab === 'admin') await loadAdminSystemLogs();
    }, 300);
  }
}

function stopRealtimeUpdates() {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  clearDashboardPolling();
  for (const timer of Object.values(state.realtimeRefreshTimers)) clearTimeout(timer);
  state.realtimeRefreshTimers = {};
  state.sseWasConnected = false;
  state.sseNeedsFullSync = false;
  setRealtimeStatus('connected');
}

function startRealtimeUpdates() {
  if (!state.currentUser) return;
  if (state.eventSource) state.eventSource.close();
  if (typeof EventSource !== 'function') {
    state.eventSource = null;
    setRealtimeStatus('unsupported');
    startFallbackPolling();
    return;
  }

  setRealtimeStatus('connecting');
  const source = new EventSource('/api/events');
  state.eventSource = source;
  const eventTypes = [
    'bot_status_updated', 'player_joined', 'player_left', 'chat_message',
    'whisper_message', 'farm_status_updated', 'notification_created', 'admin_control_updated'
  ];
  eventTypes.forEach(type => source.addEventListener(type, handleRealtimeEvent));
  source.onopen = () => {
    if (state.eventSource !== source) return;
    const needsFullSync = state.sseNeedsFullSync;
    state.sseWasConnected = true;
    state.sseNeedsFullSync = false;
    setRealtimeStatus('connected');
    startSlowPolling();
    if (needsFullSync) loadAll();
  };
  source.onerror = () => {
    if (state.eventSource !== source) return;
    state.sseNeedsFullSync = true;
    setRealtimeStatus('reconnecting');
    startFallbackPolling();
  };
}

async function loadAll() {
  if (!state.currentUser || state.fullSyncLoading) return;
  state.fullSyncLoading = true;
  try {
    const [chat, botStats, obsidian, serverStats] = await Promise.all([
      ensureItemIcons(),
      fetchJson('/api/chat?limit=160'),
      fetchJson('/api/bot-stats'),
      fetchJson('/api/obsidian'),
      fetchJson('/api/server-stats')
    ]).then(([_, chat, botStats, obsidian, serverStats]) => [chat, botStats, obsidian, serverStats]);
    renderChat(chat);
    renderBotStats(botStats);
    renderObsidian(obsidian);
    renderServerStats(serverStats);
    if (state.currentUser?.role === 'admin') await loadNotificationCount();
    if (state.currentUser?.role === 'admin') {
      await loadAdminControlState();
      if (state.activeTab === 'admin') await loadAdminSystemLogs();
    }
    if ($('#whisperPanel')?.classList.contains('open')) {
      await loadWhisperOnlinePlayers();
      await loadWhisperDialog();
    } else {
      await loadWhisperOnlinePlayers({ force: true });
    }
    setBanner('');
  } catch (err) {
    setBanner(`Could not load dashboard data: ${err.message}`);
  } finally {
    state.fullSyncLoading = false;
  }
}

async function ensureItemIcons() {
  if (Object.keys(state.itemIcons).length) return state.itemIcons;
  if (!state.itemIconsLoading) {
    state.itemIconsLoading = fetchJson('/api/item-icons')
      .then(payload => {
        state.itemIcons = payload?.icons && typeof payload.icons === 'object' ? payload.icons : {};
        return state.itemIcons;
      })
      .finally(() => {
        state.itemIconsLoading = null;
      });
  }
  return state.itemIconsLoading;
}

async function loadLiveChats() {
  if (!state.currentUser || state.liveChatLoading) return;
  state.liveChatLoading = true;
  try {
    const chat = await fetchJson('/api/chat?limit=160');
    renderChat(chat);
    if ($('#whisperPanel')?.classList.contains('open')) {
      await loadWhisperOnlinePlayers();
      await loadWhisperDialog();
    } else {
      await loadWhisperOnlinePlayers({ force: true });
    }
    if (state.playerProfileUsername && !$('#playerProfileOverlay')?.hidden) {
      await loadPlayerProfile(state.playerProfileUsername);
    }
  } catch {
    // The full dashboard refresh still owns user-visible load errors.
  } finally {
    state.liveChatLoading = false;
  }
}

applyTheme(localStorage.getItem('wm-theme') || 'light');
setAuthMode('login');
$$('.tab-button').forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});
$('#authForm').addEventListener('submit', handleAuthSubmit);
$('#authModeToggle').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
$('#navMenuToggle')?.addEventListener('click', toggleNavMenu);
$('#logoutButton')?.addEventListener('click', handleLogout);
$('#adminUsersRefresh')?.addEventListener('click', loadAdminUsers);
$('#adminLogsRefresh')?.addEventListener('click', loadAdminSystemLogs);
$('#adminLogLevel')?.addEventListener('change', loadAdminSystemLogs);
$('#notificationsRefresh')?.addEventListener('click', loadNotifications);
$('#notificationStatusFilter')?.addEventListener('change', loadNotifications);
$('#notificationSeverityFilter')?.addEventListener('change', loadNotifications);
$('#notificationEventFilter')?.addEventListener('change', loadNotifications);
$('#notificationUnreadFilter')?.addEventListener('change', loadNotifications);
$('#activeNotifications')?.addEventListener('click', markNotificationRead);
$('#notificationHistory')?.addEventListener('click', markNotificationRead);
$('#notificationRules')?.addEventListener('submit', saveNotificationRule);
$('#notificationsMarkAllRead')?.addEventListener('click', async () => {
  await postJson('/api/notifications/read', { all: true });
  await loadNotifications();
});
$('#adminUsersList')?.addEventListener('click', handleAdminUserAction);
document.addEventListener('click', handleAdminBotCommand);
document.addEventListener('click', handleAdminControlAction);
$('#adminFollowTarget')?.addEventListener('change', updateFollowControl);
$('#adminWhitelistPlayer')?.addEventListener('input', handleWhitelistPlayerInput);
$('#adminWhitelistPlayer')?.addEventListener('focus', event => runWhitelistSearch(event.currentTarget.value));
$('#adminWhitelistSuggestions')?.addEventListener('click', handleWhitelistSuggestionClick);
$('#adminIgnoreChatPlayer')?.addEventListener('input', handleIgnoreChatPlayerInput);
$('#adminIgnoreChatPlayer')?.addEventListener('focus', event => runIgnoreChatSearch(event.currentTarget.value));
$('#adminIgnoreChatSuggestions')?.addEventListener('click', handleIgnoreChatSuggestionClick);
$('#gameChatForm')?.addEventListener('submit', handleGameChatSubmit);
$('#chatScrollBottom')?.addEventListener('click', () => scrollToBottom('#chatList', { smooth: true }));
$('#chatList')?.addEventListener('scroll', updateChatScrollButton);
$('#chatList')?.addEventListener('pointerdown', handleChatMessagePointerDown);
$('#chatList')?.addEventListener('click', handleChatReplyClick);
$('#gameChatReplyCancel')?.addEventListener('click', clearGameChatReply);
$$('.chart-controls').forEach(controls => controls.addEventListener('click', handleChartRangeClick));
$$('.chart-scroll').forEach(scroll => {
  scroll.addEventListener('scroll', scheduleChartViewportRedraw, { passive: true });
});
$('#themeToggle').addEventListener('click', toggleTheme);
window.addEventListener('resize', () => {
  redrawCharts();
  updateCarousels();
});
$$('.chart').forEach(chart => {
  chart.addEventListener('pointerdown', event => showChartTooltip(event.currentTarget, event, { pin: true }));
  chart.addEventListener('pointermove', event => showChartTooltip(event.currentTarget, event));
  chart.addEventListener('pointerleave', hideChartTooltipIfNotPinned);
});
$('#seenSearchToggle').addEventListener('click', toggleSeenSearch);
$('#seenSearchClose').addEventListener('click', () => clearSeenSearch({ collapse: true }));
$('#seenSearchInput').addEventListener('input', handleSeenInput);
$('#seenSuggestions').addEventListener('click', handleSeenSuggestionClick);
$('#whisperToggle')?.addEventListener('click', toggleWhisperPanel);
$('#whisperSearchInput')?.addEventListener('input', handleWhisperSearchInput);
$('#whisperPlayers')?.addEventListener('click', handleWhisperPlayerClick);
$('#whisperForm')?.addEventListener('submit', handleWhisperSubmit);
$('#whisperDeleteDialog')?.addEventListener('click', handleWhisperDeleteDialog);
$('#whisperCloseDialog')?.addEventListener('click', closeWhisperDialog);
$('#playerProfileContent')?.addEventListener('click', handlePlayerProfileClick);
document.addEventListener('click', event => {
  const tooltipDrop = event.target.closest('[data-tooltip-drop]');
  if (tooltipDrop) {
    event.preventDefault();
    event.stopPropagation();
    handleTooltipDrop(tooltipDrop).catch(err => {
      console.error('Could not queue drop item command:', err);
      tooltipDrop.disabled = false;
      tooltipDrop.textContent = 'Drop';
    });
    return;
  }

  const supplySlot = event.target.closest('[data-supply-tooltip]');
  if (supplySlot) {
    event.preventDefault();
    event.stopPropagation();
    showSupplyTooltip(supplySlot.dataset.supplyTooltip, supplySlot);
    return;
  }

  if (!event.target.closest('.supply-tooltip')) {
    hideSupplyTooltip();
  }

  const whisperPlayer = event.target.closest('[data-whisper-player]');
  if (whisperPlayer) {
    event.preventDefault();
    event.stopPropagation();
    openWhisperFromProfile(whisperPlayer.dataset.whisperPlayer);
    return;
  }

  const player = event.target.closest('[data-player]');
  if (player) {
    event.preventDefault();
    event.stopPropagation();
    openPlayerProfile(player.dataset.player);
    return;
  }

  if (!event.target.closest('.seen-search')) {
    $('#seenSuggestions').hidden = true;
    if ($('#seenSearch')?.classList.contains('open')) {
      clearSeenSearch({ collapse: true });
    }
  }

  if (!event.target.closest('.whisper-panel')) {
    setWhisperOpen(false);
  }

  if (!event.target.closest('.admin-player-picker')) {
    hideWhitelistSuggestions();
    hideIgnoreChatSuggestions();
  }

  if (!event.target.closest('.nav-menu')) {
    setNavMenuOpen(false);
  }
});
document.addEventListener('keydown', event => {
  const supplySlot = event.target.closest?.('[data-supply-tooltip]');
  if (supplySlot && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    showSupplyTooltip(supplySlot.dataset.supplyTooltip, supplySlot);
    return;
  }

  if (event.key === 'Escape' && !$('#supplyTooltip')?.hidden) {
    hideSupplyTooltip();
    return;
  }

  const player = event.target.closest?.('[data-player]');
  if (player && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openPlayerProfile(player.dataset.player);
    return;
  }

  if (event.key === 'Escape' && !$('#playerProfileOverlay')?.hidden) {
    closePlayerProfile();
    return;
  }

  if (event.key === 'Escape' && $('#seenSearch')?.classList.contains('open')) {
    clearSeenSearch({ collapse: true });
    return;
  }

  if (event.key === 'Escape' && $('#whisperPanel')?.classList.contains('open')) {
    setWhisperOpen(false);
    return;
  }

  if (event.key === 'Escape' && !$('#adminWhitelistSuggestions')?.hidden) {
    hideWhitelistSuggestions();
    return;
  }

  if (event.key === 'Escape' && !$('#adminIgnoreChatSuggestions')?.hidden) {
    hideIgnoreChatSuggestions();
    return;
  }

  if (event.key === 'Escape' && $('#navMenu')?.classList.contains('open')) {
    setNavMenuOpen(false);
  }
});
$('#playerProfileClose').addEventListener('click', closePlayerProfile);
$('#playerProfileOverlay').addEventListener('click', event => {
  if (event.target.id === 'playerProfileOverlay') closePlayerProfile();
});

updateNavLabel('chat');
initLoopingCarousels();
initAuth();
