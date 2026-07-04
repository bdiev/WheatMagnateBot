'use strict';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const state = {
  timer: null,
  activeTab: 'chat',
  charts: {},
  chartMeta: {},
  seenSearchTimer: null,
  chartTooltipTimer: null,
  chartTooltipPinned: false,
  seenPlayers: [],
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
  const url = ccvaultsIconUrl(item);
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
  if (tab === 'admin') loadAdminUsers();
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
    const barHeight = Math.max(1, (value / maxValue) * chartHeight);
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
      const y = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, value)) / maxValue) * chartHeight;
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

function redrawCharts() {
  requestAnimationFrame(() => {
    const chatRange = getChartRange('chatHourlyChart');
    const obsidianRange = getChartRange('obsidianDailyChart');
    const tpsRange = getChartRange('tpsHourlyChart');
    drawBarChart($('#chatHourlyChart'), aggregateSeries(state.charts.chatHourly, chatRange), {
      tooltip: item => `${item.label}: ${formatNumber(item.value)} messages`
    });
    const obsidianData = obsidianRange === 'hours'
      ? state.charts.obsidianHourly
      : aggregateSeries(state.charts.obsidianDaily, obsidianRange);
    drawBarChart($('#obsidianDailyChart'), obsidianData, {
      tooltip: item => `${item.label}: ${formatNumber(item.value)} blocks`
    });
    drawLineChart($('#tpsHourlyChart'), aggregateSeries(state.charts.tpsHourly, tpsRange, 'avg'), {
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
  state.chartRanges[chartId] = button.dataset.chartRange;
  delete state.chartScrollInitialized[chartId];
  controls.querySelectorAll('[data-chart-range]').forEach(item => {
    item.classList.toggle('active', item === button);
  });
  redrawCharts();
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
  const desktopSearchFocus = window.matchMedia('(min-width: 701px)').matches;
  document.body.classList.toggle('search-focus-active', open && desktopSearchFocus);
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
  renderSeenResult(null);
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

function renderSeenResult(player) {
  const result = $('#seenResult');
  if (!result) return;

  if (!player) {
    result.hidden = true;
    result.innerHTML = '';
    return;
  }

  result.hidden = false;
  result.innerHTML = `
    <div class="seen-card">
      ${playerIdentity(player.username, 32)}
      <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
      <div><span>Last seen</span><strong>${player.lastSeen ? formatDate(player.lastSeen) : 'Never'}</strong></div>
      <div><span>Last online</span><strong>${player.lastOnline ? formatDate(player.lastOnline) : 'Unknown'}</strong></div>
      <div><span>Playtime</span><strong>${escapeHtml(player.playtime || '-')}</strong></div>
      <div><span>Whitelist</span><strong>${player.isWhitelisted ? 'Yes' : 'No'}</strong></div>
    </div>
  `;
}

async function runSeenSearch(query) {
  const cleanQuery = query.trim();
  const suggestions = $('#seenSuggestions');
  if (cleanQuery.length < 1) {
    if (suggestions) suggestions.hidden = true;
    state.seenPlayers = [];
    renderSeenResult(null);
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
  renderSeenResult(player);
  setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 80);
}

function renderChat(payload) {
  $('#chat24h').textContent = formatNumber(payload.totals?.last24h);
  $('#activeChatters').textContent = formatNumber(payload.totals?.activeChatters24h);
  $('#chatAllTime').textContent = formatNumber(payload.totals?.allTime);

  const messages = [...(payload.messages || [])].reverse();
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
    requestAnimationFrame(() => {
      const chatList = $('#chatList');
      if (chatList) chatList.scrollTop = 0;
    });
  }
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

function renderBotStats(payload) {
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
    ? activity.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No recent activity records found.</div>',
    activity.map(player => [player.username, player.isOnline, player.lastSeen])
  );
}

function renderObsidian(payload) {
  const farm = payload.farm || {};
  $('#farmState').textContent = farm.desiredEnabled ? 'Enabled' : 'Disabled';
  $('#farmUpdated').textContent = `last update: ${formatDate(farm.updatedAt)}`;
  $('#obsidianTotal').textContent = formatNumber(farm.totalMined);
  $('#obsidianToday').textContent = formatNumber(farm.todayMined);
  $('#obsidianSession').textContent = formatNumber(farm.sessionMined);
  $('#sessionRate').textContent = `rate: ${formatNumber(farm.sessionPerHour)}/h`;
  $('#pickaxeAverage').textContent = farm.blocksPerPickaxe == null ? '-' : formatNumber(farm.blocksPerPickaxe);
  $('#retiredPickaxes').textContent = `retired pickaxes: ${formatNumber(farm.retiredPickaxes)}`;

  $('#farmDetails').innerHTML = `
    <div><span>Session duration</span><strong>${escapeHtml(farm.sessionDuration || '-')}</strong></div>
    <div><span>Last 7 days</span><strong>${formatNumber(farm.last7Days)} blocks</strong></div>
    <div><span>Retired pickaxe blocks</span><strong>${formatNumber(farm.retiredPickaxeBlocks)}</strong></div>
    <div><span>Supplies snapshot</span><strong>${formatDate(payload.supplies?.updatedAt)}</strong></div>
  `;

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
  const summary = `
    <div class="supply-summary">
      <div><span>Food</span><strong>${formatNumber(supplies.foodCount)}</strong></div>
      <div><span>Pickaxes</span><strong>${formatNumber(supplies.pickaxeCount)}</strong></div>
      <div><span>Usable Pickaxes</span><strong>${formatNumber(supplies.usablePickaxeCount)}</strong></div>
      <div><span>Total Items</span><strong>${formatNumber(supplies.totalItems)}</strong></div>
    </div>
  `;

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

  renderStable(selector, `${summary}<div class="supply-items">${itemList}</div>`, {
    foodCount: supplies.foodCount,
    pickaxeCount: supplies.pickaxeCount,
    usablePickaxeCount: supplies.usablePickaxeCount,
    totalItems: supplies.totalItems,
    items: items.map(item => [
      item.name,
      item.label,
      item.count,
      item.remainingPercent,
      item.usable
    ])
  });
}

function renderServerStats(payload) {
  const tps = payload.tps || {};
  $('#latestTps').textContent = formatTps(tps.latest);
  $('#latestTpsAt').textContent = `sampled: ${formatDate(tps.latestAt)}`;
  $('#avgTps').textContent = formatTps(tps.average24h);
  $('#minTps').textContent = formatTps(tps.min24h);
  $('#maxTps').textContent = formatTps(tps.max24h);
  $('#tpsSamples').textContent = formatNumber(tps.samples24h);

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

  const players = payload.recentPlayers || [];
  renderStable('#serverRecentPlayers', players.length
    ? players.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No server activity records found.</div>',
    players.map(player => [player.username, player.isOnline, player.lastSeen])
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
document.addEventListener('click', event => {
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

  if (!event.target.closest('.nav-menu')) {
    setNavMenuOpen(false);
  }
});
document.addEventListener('keydown', event => {
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
