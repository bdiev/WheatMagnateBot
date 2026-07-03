'use strict';

const state = {
  timer: null,
  activeTab: 'chat',
  charts: {},
  chartMeta: {},
  seenSearchTimer: null,
  seenPlayers: [],
  chatMessageIds: new Set(),
  chatInitialized: false
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
  return `
    <span class="player-identity">
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
  const response = await fetch(path, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
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
  state.activeTab = tab;
  $$('.tab-button').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
  redrawCharts();
}

function getCssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawBarChart(canvas, data, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height || canvas.height));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const chartData = Array.isArray(data) ? data : [];
  const values = chartData.map(item => Number(item.value)).filter(Number.isFinite);
  const maxValue = Math.max(options.max || 0, ...values, 1);
  const padding = { top: 22, right: 14, bottom: 34, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.fillStyle = panelSoft;
  ctx.fillRect(0, 0, width, height);
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
    ctx.fillText(Math.round((maxValue * i) / 4), padding.left - 8, y + 4);
  }

  const gap = 4;
  const barWidth = chartData.length > 0
    ? Math.max(3, (chartWidth - gap * (chartData.length - 1)) / chartData.length)
    : 0;
  const hitboxes = [];

  chartData.forEach((item, index) => {
    const value = Number(item.value);
    if (!Number.isFinite(value)) return;
    const x = padding.left + index * (barWidth + gap);
    const barHeight = Math.max(1, (value / maxValue) * chartHeight);
    const y = padding.top + chartHeight - barHeight;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, barWidth, barHeight);
    hitboxes.push({
      x,
      y: padding.top,
      width: barWidth,
      height: chartHeight,
      label: item.label,
      value,
      tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatNumber(value)}`
    });
  });
  state.chartMeta[canvas.id] = { hitboxes };

  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.ceil(chartData.length / 8));
  chartData.forEach((item, index) => {
    if (index % labelStep !== 0 && index !== chartData.length - 1) return;
    const x = padding.left + index * (barWidth + gap) + barWidth / 2;
    ctx.fillText(String(item.label || ''), x, height - 12);
  });
}

function drawLineChart(canvas, data) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height || canvas.height));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const chartData = Array.isArray(data) ? data : [];
  const maxValue = 20;
  const padding = { top: 22, right: 14, bottom: 34, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.fillStyle = panelSoft;
  ctx.fillRect(0, 0, width, height);
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
    ctx.fillText(String((maxValue * i) / 4), padding.left - 8, y + 4);
  }

  const points = chartData
    .map((item, index) => {
      const value = Number(item.value);
      if (!Number.isFinite(value)) return null;
      const x = padding.left + (chartWidth * index) / Math.max(1, chartData.length - 1);
      const y = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, value)) / maxValue) * chartHeight;
      return { x, y, value, label: item.label };
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
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.ceil(chartData.length / 8));
  chartData.forEach((item, index) => {
    if (index % labelStep !== 0 && index !== chartData.length - 1) return;
    const x = padding.left + (chartWidth * index) / Math.max(1, chartData.length - 1);
    ctx.fillText(String(item.label || ''), x, height - 12);
  });
}

function redrawCharts() {
  requestAnimationFrame(() => {
    drawBarChart($('#chatHourlyChart'), state.charts.chatHourly);
    drawBarChart($('#obsidianDailyChart'), state.charts.obsidianDaily, {
      tooltip: item => `${item.label}: ${formatNumber(item.value)} blocks`
    });
    drawLineChart($('#tpsHourlyChart'), state.charts.tpsHourly);
  });
}

function showChartTooltip(canvas, event) {
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
    tooltip.hidden = true;
    return;
  }

  tooltip.textContent = hit.tooltip;
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

function hideChartTooltip() {
  const tooltip = $('#chartTooltip');
  if (tooltip) tooltip.hidden = true;
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
  if (input) input.value = '';
  if (suggestions) suggestions.hidden = true;
  state.seenPlayers = [];
  renderSeenResult(null);
  if (collapse) setSeenSearchOpen(false);
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
  $('#seenSuggestions').hidden = true;
  renderSeenResult(player);
}

function renderChat(payload) {
  $('#chat24h').textContent = formatNumber(payload.totals?.last24h);
  $('#activeChatters').textContent = formatNumber(payload.totals?.activeChatters24h);
  $('#chatAllTime').textContent = formatNumber(payload.totals?.allTime);

  const messages = [...(payload.messages || [])].reverse();
  $('#chatList').innerHTML = messages.length
    ? messages.map(message => `
      <article class="chat-message ${state.chatInitialized && !state.chatMessageIds.has(String(message.id)) ? 'new-message' : ''}">
        <div class="chat-user">${playerIdentity(message.username, 28)}</div>
        <div class="chat-text">${escapeHtml(message.message)}</div>
        <time class="chat-time">${formatChatTime(message.createdAt)}</time>
      </article>
    `).join('')
    : '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>';
  state.chatMessageIds = new Set(messages.map(message => String(message.id)));
  state.chatInitialized = true;

  const topChatters = payload.topChatters || [];
  $('#topChatters').innerHTML = topChatters.length
    ? topChatters.map((player, index) => `
      <div class="rank-item">
        <span class="rank-index">${index + 1}</span>
        ${playerIdentity(player.username, 28)}
        <strong>${formatNumber(player.count)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No chat activity in the last 24 hours.</div>';

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
  $('#playtimeLeaderboard').innerHTML = leaderboard.length
    ? leaderboard.map((player, index) => `
      <div class="rank-item leaderboard-item">
        <span class="rank-index">${index + 1}</span>
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <strong>${escapeHtml(player.playtime)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No whitelist playtime data found.</div>';

  const activity = payload.recentActivity || [];
  $('#recentActivity').innerHTML = activity.length
    ? activity.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No recent activity records found.</div>';
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
  state.charts.obsidianDaily = payload.daily || [];
  redrawCharts();
}

function renderSupplies(selector, supplies, error = null) {
  const target = $(selector);
  if (!target) return;
  if (!supplies) {
    target.innerHTML = `<div class="empty">${escapeHtml(error || 'No supply snapshot available.')}</div>`;
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

  target.innerHTML = `${summary}<div class="supply-items">${itemList}</div>`;
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
  $('#nearbyList').innerHTML = nearby.length
    ? nearby.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <strong>${formatNumber(player.distance)} blocks</strong>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No nearby sightings yet.</div>';

  const players = payload.recentPlayers || [];
  $('#serverRecentPlayers').innerHTML = players.length
    ? players.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span>
        <span class="muted">${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No server activity records found.</div>';

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

async function loadAll() {
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
$$('.tab-button').forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});
$('#themeToggle').addEventListener('click', toggleTheme);
window.addEventListener('resize', redrawCharts);
$('#obsidianDailyChart').addEventListener('mousemove', event => showChartTooltip(event.currentTarget, event));
$('#obsidianDailyChart').addEventListener('mouseleave', hideChartTooltip);
$('#seenSearchToggle').addEventListener('click', toggleSeenSearch);
$('#seenSearchClose').addEventListener('click', () => clearSeenSearch({ collapse: true }));
$('#seenSearchInput').addEventListener('input', handleSeenInput);
$('#seenSuggestions').addEventListener('click', handleSeenSuggestionClick);
document.addEventListener('click', event => {
  if (!event.target.closest('.seen-search')) {
    $('#seenSuggestions').hidden = true;
    if ($('#seenSearch')?.classList.contains('open')) {
      clearSeenSearch({ collapse: true });
    }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#seenSearch')?.classList.contains('open')) {
    clearSeenSearch({ collapse: true });
  }
});

setActiveTab('chat');
loadAll();
state.timer = setInterval(loadAll, 5000);
