'use strict';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const state = {
  timer: null,
  activeTab: 'chat',
  charts: {},
  chartMeta: {},
  rollingNumbers: {},
  seenSearchTimer: null,
  whitelistSearchTimer: null,
  ignoreChatSearchTimer: null,
  chartTooltipTimer: null,
  chartTooltipPinned: false,
  chartAnimations: {},
  chartAnimationFrames: {},
  chartAnimationDurations: {},
  seenPlayers: [],
  whisperPlayers: [],
  whisperTarget: null,
  whisperPlayersSignature: '',
  whisperMessagesSignature: '',
  whisperLastSeenId: null,
  whisperUnreadCount: 0,
  whitelistSearchPlayers: [],
  ignoreChatSearchPlayers: [],
  adminPlayerSearchRequests: {},
  adminControlState: null,
  adminControlLoading: false,
  supplyTooltipItems: {},
  chatMessageIds: new Set(),
  chatInitialized: false,
  authMode: 'login',
  currentUser: null,
  chartRanges: {
    chatHourlyChart: 'hours',
    obsidianDailyChart: 'days',
    tpsHourlyChart: 'hours'
  },
  chartScrollInitialized: {},
  renderSignatures: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

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
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

function playerIdentity(username, size = 28) {
  const safeName = escapeHtml(username || 'Unknown');
  const safeUsername = escapeHtml(username || '');
  return `
    <span class="player-identity" role="button" tabindex="0" data-player="${safeUsername}" title="Open player profile">
      <img class="player-head" src="${playerHeadUrl(username, size)}" alt="" loading="lazy">
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
  firework_rocket: '/Firework_Rocket.png'
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
  const name = String(item?.name || item?.label || '').toLowerCase().replace(/[\s-]+/g, '_');
  const file = toCcvaultsFileName(item);
  if (!name || !file) return '';
  const match = CCVAULTS_EXACT_ITEMS[name] || CCVAULTS_ITEM_CATEGORIES.find(entry => entry.pattern.test(name));
  if (!match) return `${CCVAULTS_BASE_URL}/thumbnails/${encodeURIComponent('10. Items')}/${encodeURIComponent(file)}`;

  const parts = [CCVAULTS_BASE_URL, 'thumbnails', match.category];
  if (match.subcategory) parts.push(match.subcategory);
  parts.push(file);
  return parts.map((part, index) => index < 2 ? part : encodeURIComponent(part)).join('/');
}

function itemIcon(item) {
  const label = item?.label || item?.name || 'Item';
  const fallback = escapeHtml(label.slice(0, 2).toUpperCase());
  const iconKey = String(item?.name || item?.label || '').toLowerCase().replace(/[\s-]+/g, '_');
  const url = LOCAL_ITEM_ICONS[iconKey] || ccvaultsIconUrl(item);
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
  if (!isAdmin && state.activeTab === 'admin') setActiveTab('chat');
}

function setNavMenuOpen(open) {
  const menu = $('#navMenu');
  const toggle = $('#navMenuToggle');
  if (!menu || !toggle) return;
  menu.classList.toggle('open', Boolean(open));
  toggle.setAttribute('aria-expanded', String(Boolean(open)));
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
  setActiveTab(tab === 'admin' && state.currentUser?.role !== 'admin' ? 'chat' : tab);
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
  if (tab === 'admin' && state.currentUser?.role !== 'admin') return;
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
  }
  redrawCharts();
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

function drawBarChart(canvas, data, options = {}) {
  if (!canvas) return;
  const chartData = Array.isArray(data) ? data : [];
  const { ctx, width, height } = prepareChartCanvas(canvas, chartData, options);

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const values = chartData.map(item => Number(item.value)).filter(Number.isFinite);
  const maxValue = Math.max(options.max || 0, ...values, 1);
  const padding = { top: 24, right: 18, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
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

  chartData.forEach((item, index) => {
    const value = Number(item.value);
    if (!Number.isFinite(value)) return;
    const slotX = padding.left + index * slotWidth;
    const x = slotX + (slotWidth - barWidth) / 2;
    const barHeight = Math.max(1, (value / maxValue) * chartHeight * animationProgress);
    const y = padding.top + chartHeight - barHeight;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, barWidth, barHeight);
    hitboxes.push({
      x: slotX,
      y: padding.top,
      width: slotWidth,
      height: chartHeight,
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
  const numericValues = chartData.map(item => Number(item.value)).filter(Number.isFinite);
  const maxValue = Math.max(options.max || 0, ...numericValues, 1);
  const padding = { top: 24, right: 18, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
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

  if (!hit) {
    if (!state.chartTooltipPinned) tooltip.hidden = true;
    return;
  }

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

function hideChartTooltipIfNotPinned() {
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

function renderPlayerProfile(profile) {
  const recentMessages = profile.chat?.recentMessages || [];
  const nearby = profile.nearby;
  return `
    <header class="player-profile-head">
      <img class="player-profile-avatar" src="${playerHeadUrl(profile.username, 96)}" alt="" loading="lazy">
      <div>
        <h2 id="playerProfileName">${escapeHtml(profile.username)}</h2>
        <div class="player-profile-badges">
          <span class="pill ${profile.isOnline ? 'online' : ''}">${profile.isOnline ? 'online' : 'offline'}</span>
          <span class="pill">${profile.isWhitelisted ? 'whitelisted' : 'not whitelisted'}</span>
        </div>
      </div>
    </header>
    <section class="player-profile-grid">
      <div><span>Playtime</span><strong>${escapeHtml(profile.playtime || '-')}</strong></div>
      <div><span>Last Seen</span><strong>${profile.lastSeen ? formatDate(profile.lastSeen) : 'Never'}</strong></div>
      <div><span>Last Online</span><strong>${profile.lastOnline ? formatDate(profile.lastOnline) : 'Unknown'}</strong></div>
      <div><span>Chat Messages</span><strong>${formatNumber(profile.chat?.totalMessages)}</strong></div>
      <div><span>Messages 24h</span><strong>${formatNumber(profile.chat?.last24h)}</strong></div>
      <div><span>Last Message</span><strong>${profile.chat?.lastMessageAt ? formatDate(profile.chat.lastMessageAt) : 'None'}</strong></div>
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

async function openPlayerProfile(username) {
  const overlay = $('#playerProfileOverlay');
  const content = $('#playerProfileContent');
  if (!overlay || !content || !username) return;

  overlay.hidden = false;
  document.body.classList.add('profile-open');
  content.innerHTML = `
    <div class="player-profile-loading">
      ${playerIdentity(username, 40)}
      <span>Loading player profile...</span>
    </div>
  `;

  try {
    const profile = await fetchJson(`/api/player?username=${encodeURIComponent(username)}`);
    content.innerHTML = renderPlayerProfile(profile);
  } catch (err) {
    content.innerHTML = `<div class="empty">Could not load player profile: ${escapeHtml(err.message)}</div>`;
  }
}

function closePlayerProfile() {
  const overlay = $('#playerProfileOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('profile-open');
}

function setSeenSearchOpen(open) {
  const search = $('#seenSearch');
  const toggle = $('#seenSearchToggle');
  if (!search || !toggle) return;
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
      ${playerIdentity(player.username, 24)}
      <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
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
  panel.classList.toggle('has-dialog', Boolean(state.whisperTarget));
  popover.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close private messages' : 'Open private messages');
  if (open) {
    loadWhisperNotifications({ markRead: true }).catch(() => {});
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

function loadWhisperLastSeenId() {
  state.whisperLastSeenId = localStorage.getItem(whisperLastSeenStorageKey()) || null;
  state.whisperUnreadCount = 0;
  renderWhisperBadge();
}

function markWhisperNotificationsRead(maxId) {
  const nextId = String(maxId || state.whisperLastSeenId || '0');
  state.whisperLastSeenId = nextId;
  state.whisperUnreadCount = 0;
  localStorage.setItem(whisperLastSeenStorageKey(), nextId);
  renderWhisperBadge();
}

async function loadWhisperNotifications({ markRead = false } = {}) {
  const afterId = state.whisperLastSeenId || '0';
  const payload = await fetchJson(`/api/whisper/notifications?afterId=${encodeURIComponent(afterId)}`);
  if (!state.whisperLastSeenId) {
    markWhisperNotificationsRead(payload.maxId);
    return;
  }
  if (markRead || $('#whisperPanel')?.classList.contains('open')) {
    markWhisperNotificationsRead(payload.maxId);
    return;
  }
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

function renderWhisperPlayers() {
  const list = $('#whisperPlayers');
  if (!list) return;
  const signature = JSON.stringify([
    state.whisperTarget || '',
    ...state.whisperPlayers.map(player => [
      player.username || '',
      Boolean(player.isOnline),
      player.lastMessageAt || '',
      player.messageCount || 0
    ])
  ]);
  if (signature === state.whisperPlayersSignature) return;
  state.whisperPlayersSignature = signature;

  if (!state.whisperPlayers.length) {
    list.innerHTML = '<div class="seen-empty">No players or dialogs.</div>';
    return;
  }

  const active = String(state.whisperTarget || '').toLowerCase();
  list.innerHTML = state.whisperPlayers.map((player, index) => {
    const username = player.username || '';
    const isActive = username.toLowerCase() === active;
    const isOnline = Boolean(player.isOnline);
    return `
      <button class="whisper-player ${isActive ? 'active' : ''}" type="button" data-index="${index}" style="--item-index: ${index}">
        ${playerIdentity(username, 24)}
        <span class="pill ${isOnline ? 'online' : ''}">${isOnline ? 'online' : 'offline'}</span>
      </button>
    `;
  }).join('');
}

async function loadWhisperOnlinePlayers() {
  if (!$('#whisperPanel')?.classList.contains('open')) return;
  const payload = await fetchJson('/api/whisper/online');
  state.whisperPlayers = payload.players || [];
  renderWhisperPlayers();
}

function renderWhisperMessages(messages) {
  const list = $('#whisperMessages');
  if (!list) return;
  if ($('#whisperPanel')?.classList.contains('open')) {
    const latestId = (messages || []).reduce((max, message) => {
      const id = Number(message.id);
      return Number.isFinite(id) && id > max ? id : max;
    }, Number(state.whisperLastSeenId || 0));
    markWhisperNotificationsRead(String(latestId));
  }
  const signature = JSON.stringify((messages || []).map(message => [
    message.id,
    message.direction,
    message.message,
    message.createdAt
  ]));
  if (signature === state.whisperMessagesSignature) return;
  state.whisperMessagesSignature = signature;

  list.innerHTML = messages.length
    ? messages.map(message => `
      <div class="whisper-message ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}">
        <p>${escapeHtml(message.message)}</p>
        <time>${message.direction === 'outgoing' ? 'You' : escapeHtml(message.playerUsername || state.whisperTarget)} &middot; ${formatChatTime(message.createdAt)}</time>
      </div>
    `).join('')
    : '<div class="empty">No private messages yet.</div>';
  list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
}

async function loadWhisperDialog() {
  if (!state.whisperTarget || !$('#whisperPanel')?.classList.contains('open')) return;
  const payload = await fetchJson(`/api/whisper/dialog?username=${encodeURIComponent(state.whisperTarget)}&limit=80`);
  renderWhisperMessages(payload.messages || []);
}

async function openWhisperDialog(username) {
  state.whisperTarget = username;
  state.whisperMessagesSignature = '';
  $('#whisperPanel')?.classList.add('has-dialog');
  const dialog = $('#whisperDialog');
  const title = $('#whisperTargetTitle');
  const player = state.whisperPlayers.find(entry => String(entry.username || '').toLowerCase() === String(username || '').toLowerCase());
  const isOnline = Boolean(player?.isOnline);
  if (dialog) dialog.hidden = false;
  if (title) {
    title.innerHTML = `
      ${playerIdentity(username, 26)}
      <span class="pill ${isOnline ? 'online' : ''}">${isOnline ? 'online' : 'offline'}</span>
    `;
  }
  renderWhisperPlayers();
  await loadWhisperDialog();
  setTimeout(() => $('#whisperInput')?.focus(), 60);
}

function handleWhisperPlayerClick(event) {
  event.preventDefault();
  event.stopPropagation();
  const button = event.target.closest('.whisper-player');
  if (!button) return;
  const player = state.whisperPlayers[Number(button.dataset.index)];
  if (!player?.username) return;
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
    setBanner('Private chat deleted.');
  } catch (err) {
    setBanner(`Could not delete private chat: ${err.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderChat(payload) {
  setRollingNumber('#chat24h', payload.totals?.last24h);
  setRollingNumber('#activeChatters', payload.totals?.activeChatters24h);
  setRollingNumber('#chatAllTime', payload.totals?.allTime);

  const messages = payload.messages || [];
  const firstChatRender = !state.chatInitialized;
  renderStable('#chatList', messages.length
    ? messages.map(message => `
      <article class="chat-message ${state.chatInitialized && !state.chatMessageIds.has(String(message.id)) ? 'new-message' : ''}">
        <div class="chat-user">${playerIdentity(message.username, 28)}</div>
        <div class="chat-text">${escapeHtml(message.message)}</div>
        <time class="chat-time">${formatChatTime(message.createdAt)}</time>
      </article>
    `).join('')
    : '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>',
    messages.map(message => [message.id, message.username, message.message, message.createdAt])
  );
  if (firstChatRender) {
    scrollToBottom('#chatList');
  }
  updateChatScrollButton();
  state.chatMessageIds = new Set(messages.map(message => String(message.id)));
  state.chatInitialized = true;

  const topChatters = payload.topChatters || [];
  renderStable('#topChatters', topChatters.length
    ? topChatters.map((player, index) => `
      <div class="rank-item">
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

function renderBotItemList(selector, items = [], emptyText = 'No items recorded.') {
  renderStable(selector, items.length
    ? `<div class="supply-items">${items.map(item => {
      const label = item.displayName || item.label || item.name || 'Item';
      return `
        <div class="supply-item bot-item">
          <span class="supply-name">${itemIcon({ name: item.name, label })}<span>${escapeHtml(label)}</span></span>
          <strong>${formatNumber(item.count || 1)}</strong>
        </div>
      `;
    }).join('')}</div>`
    : `<div class="empty">${emptyText}</div>`,
    items.map(item => [item.name, item.displayName, item.count, item.slot])
  );
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

  renderBotItemList('#botInventory', bot?.inventory || [], connected ? 'Inventory is empty.' : 'No live bot inventory snapshot yet.');

  const heldItem = bot?.heldItem?.displayName || bot?.heldItem?.name || 'None';
  const armor = bot?.armor?.length
    ? bot.armor.map(item => escapeHtml(item.displayName || item.name)).join(', ')
    : 'None';
  $('#botDetails').innerHTML = `
    <div><span>Username</span><strong>${escapeHtml(bot?.username || '-')}</strong></div>
    <div><span>Server</span><strong>${escapeHtml(bot?.server || '-')}</strong></div>
    <div><span>Ping</span><strong>${bot?.ping == null ? '-' : `${formatNumber(bot.ping)} ms`}</strong></div>
    <div><span>Dimension</span><strong>${escapeHtml(bot?.dimension || '-')}</strong></div>
    <div><span>Game mode</span><strong>${escapeHtml(bot?.gameMode || '-')}</strong></div>
    <div><span>Held item</span><strong>${escapeHtml(heldItem)}</strong></div>
    <div><span>Armor</span><strong>${armor}</strong></div>
    <div><span>XP level</span><strong>${bot?.xpLevel == null ? '-' : formatNumber(bot.xpLevel)}</strong></div>
    <div><span>Following</span><strong>${escapeHtml(bot?.followTarget || 'None')}</strong></div>
    <div><span>Last offline reason</span><strong>${escapeHtml(bot?.lastDisconnectReason || '-')}</strong></div>
  `;
}

function renderPlayerStats(payload = {}) {
  $('#onlinePlayers').textContent = formatNumber(payload.players?.online);
  $('#totalPlayers').textContent = `of ${formatNumber(payload.players?.total)} whitelisted`;
  $('#offlinePlayers').textContent = formatNumber(payload.players?.offline);
  $('#seen24h').textContent = formatNumber(payload.players?.seen24h);
  $('#seen7d').textContent = formatNumber(payload.players?.seen7d);

  const leaderboard = payload.playtimeLeaderboard || [];
  renderStable('#playtimeLeaderboard', leaderboard.length
    ? leaderboard.map((player, index) => `
      <div class="rank-item leaderboard-item">
        <span class="rank-index">${index + 1}</span>
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <strong>${escapeHtml(player.playtime)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No whitelist playtime data found.</div>',
    leaderboard.map(player => [player.username, player.isOnline, player.playtime])
  );

  const activity = payload.recentActivity || [];
  renderStable('#recentActivity', activity.length
    ? activity.map(player => {
      const eventLabel = player.isOnline ? 'Joined the game' : 'Left the game';
      return `
        <div class="rank-item activity-item">
          ${playerIdentity(player.username, 28)}
          <span class="pill ${player.isOnline ? 'online' : ''}">${eventLabel}</span>
          <span class="muted">${formatAgo(player.lastSeen)}</span>
        </div>
      `;
    }).join('')
    : '<div class="empty">No recent activity records found.</div>',
    activity.map(player => [player.username, player.isOnline, player.lastSeen])
  );
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
  const offhandItem = items.find(item => Number(item.slot) === 45);
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
  const durability = item.remainingPercent == null
    ? ''
    : `<span class="inventory-durability">${Number(item.remainingPercent).toFixed(0)}%</span>`;
  const low = item.usable === false ? ' low' : '';
  const tooltipKey = supplyTooltipKey(tooltipPrefix, slot, item);
  return `
    <div class="inventory-slot filled${low}${fallback ? ' fallback-position' : ''}" role="button" tabindex="0" data-slot="${slot}" data-supply-tooltip="${escapeHtml(tooltipKey)}" title="${escapeHtml(item.label)} x${formatNumber(item.count)}">
      ${itemIcon(item)}
      <span class="inventory-count">${formatNumber(item.count)}</span>
      ${durability}
    </div>
  `;
}

function formatEnchantmentName(name) {
  return String(name || '')
    .replace(/^minecraft:/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
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
  const enchantments = Array.isArray(item.enchantments) ? item.enchantments : [];
  tooltip.innerHTML = `
    <strong>${escapeHtml(item.displayName || item.label || item.name || 'Item')}</strong>
    <span>Count: ${formatNumber(item.count)}</span>
    ${item.slot == null ? '' : `<span>Slot: ${formatNumber(item.slot)}</span>`}
    ${item.remainingPercent == null ? '' : `<span>Durability: ${Number(item.remainingPercent).toFixed(1)}%</span>`}
    <div class="supply-tooltip-enchants">
      ${enchantments.length
        ? enchantments.map(enchant => `<span>${escapeHtml(formatEnchantmentName(enchant.name))} ${formatNumber(enchant.level)}</span>`).join('')
        : '<span class="muted">No enchantments</span>'}
    </div>
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

function renderServerStats(payload) {
  renderPlayerStats(payload.playerStats || {});

  const tps = payload.tps || {};
  $('#latestTps').textContent = formatTps(tps.latest);
  $('#latestTpsAt').textContent = `sampled: ${formatDate(tps.latestAt)}`;
  $('#minTps').textContent = formatTps(tps.min24h);
  $('#maxTps').textContent = formatTps(tps.max24h);

  const nearby = payload.nearby || [];
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
        ${playerIdentity(player.username, 24)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
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

  const obsidianButton = $('#obsidianToggleButton');
  if (obsidianButton) {
    const enabled = Boolean(bot?.obsidian?.desiredEnabled || bot?.obsidian?.enabled);
    obsidianButton.textContent = enabled ? 'Stop Farm' : 'Start Farm';
    obsidianButton.classList.toggle('danger-button', enabled);
    obsidianButton.classList.toggle('ghost-button', !enabled);
  }
  const obsidianRadiusButton = $('#obsidianRadiusButton');
  if (obsidianRadiusButton) {
    const radius = bot?.obsidian?.config?.maxCauldronDist;
    obsidianRadiusButton.textContent = radius ? `Radius: ${radius}` : 'Radius: -';
    obsidianRadiusButton.disabled = !radius;
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
    if (state.activeTab === 'admin') {
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
  } catch (err) {
    setBanner(`Could not update user: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function handleAdminBotCommand(event) {
  const button = event.target.closest('[data-bot-command]');
  if (!button) return;

  const commandType = button.dataset.botCommand;
  const body = { commandType };

  button.disabled = true;
  try {
    setButtonBusyState(commandType);
    const payload = await postJson('/api/admin/bot-command', body);
    setBanner(`Bot command queued: ${payload.command?.commandType || commandType} #${payload.command?.id || '-'}.`);
    await Promise.all([loadAll(), loadAdminControlState()]);
    scheduleAdminControlRefresh();
  } catch (err) {
    setBanner(`Could not queue bot command: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function queueAdminCommand(commandType, payload = {}) {
  const response = await postJson('/api/admin/bot-command', { commandType, payload });
  setBanner(`Bot command queued: ${response.command?.commandType || commandType} #${response.command?.id || '-'}.`);
  await Promise.all([loadAll(), loadAdminControlState()]);
}

async function handleAdminControlAction(event) {
  const button = event.target.closest('[data-admin-control-action]');
  if (!button) return;

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
    }

    if (['follow', 'whitelist_add', 'whitelist_remove', 'ignore_chat', 'unignore_chat'].includes(action) && !payload.username) {
      throw new Error('Choose or enter a username first.');
    }
    if (action === 'drop_item' && payload.slot == null && !payload.name) {
      throw new Error('Choose an inventory item first.');
    }

    button.disabled = true;
    await queueAdminCommand(action, payload);
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
    setBanner(`Could not queue bot command: ${err.message}`);
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

  button.disabled = true;
  try {
    await postJson('/api/chat/send', { message });
    input.value = '';
    setBanner('Message queued for game chat.');
    await loadAll();
  } catch (err) {
    setBanner(`Could not send game chat message: ${err.message}`);
  } finally {
    button.disabled = false;
    input?.focus();
  }
}

async function loadAll() {
  if (!state.currentUser) return;
  try {
    const [chat, botStats, obsidian, serverStats] = await Promise.all([
      fetchJson('/api/chat?limit=160'),
      fetchJson('/api/bot-stats'),
      fetchJson('/api/obsidian'),
      fetchJson('/api/server-stats')
    ]);
    renderChat(chat);
    renderBotStats(botStats);
    renderObsidian(obsidian);
    renderServerStats(serverStats);
    if (state.activeTab === 'admin' && state.currentUser?.role === 'admin') {
      await loadAdminControlState();
    }
    if ($('#whisperPanel')?.classList.contains('open')) {
      await loadWhisperOnlinePlayers();
      await loadWhisperDialog();
    } else {
      await loadWhisperNotifications();
    }
    setBanner('');
  } catch (err) {
    setBanner(`Could not load dashboard data: ${err.message}`);
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
$('#adminUsersList')?.addEventListener('click', handleAdminUserAction);
document.querySelector('[data-panel="admin"]')?.addEventListener('click', handleAdminBotCommand);
document.querySelector('[data-panel="admin"]')?.addEventListener('click', handleAdminControlAction);
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
$$('.chart-controls').forEach(controls => controls.addEventListener('click', handleChartRangeClick));
$('#themeToggle').addEventListener('click', toggleTheme);
window.addEventListener('resize', redrawCharts);
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
$('#whisperPlayers')?.addEventListener('click', handleWhisperPlayerClick);
$('#whisperForm')?.addEventListener('submit', handleWhisperSubmit);
$('#whisperDeleteDialog')?.addEventListener('click', handleWhisperDeleteDialog);
$('#whisperCloseDialog')?.addEventListener('click', closeWhisperDialog);
document.addEventListener('click', event => {
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
initAuth();
state.timer = setInterval(loadAll, 5000);
