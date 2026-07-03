'use strict';

const state = {
  timer: null
};

const $ = selector => document.querySelector(selector);

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('ru-RU').format(number) : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatAgo(value) {
  if (!value) return '-';
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h назад`;
  return `${Math.floor(hours / 24)}d назад`;
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

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function loadConfig() {
  try {
    const config = await fetchJson('/api/config');
    const status = $('#databaseStatus');
    status.textContent = config.databaseConfigured
      ? `Database connected (${config.databaseSource || 'configured'})`
      : 'Database is not connected';
  } catch (err) {
    $('#databaseStatus').textContent = `Config unavailable: ${err.message}`;
  }
}

async function saveDatabaseUrl(event) {
  event.preventDefault();
  const input = $('#databaseUrl');
  const button = $('#saveDatabaseButton');
  const databaseUrl = input.value.trim();

  if (!databaseUrl) {
    setBanner('Paste a PostgreSQL Database URL first.');
    return;
  }

  button.disabled = true;
  $('#databaseStatus').textContent = 'Connecting...';
  try {
    await postJson('/api/config/database-url', { databaseUrl });
    input.value = '';
    $('#databaseStatus').textContent = 'Database connected (site config)';
    setBanner('');
    await loadAll();
  } catch (err) {
    $('#databaseStatus').textContent = 'Database is not connected';
    setBanner(`Could not connect database: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

function renderSummary(summary) {
  $('#onlinePlayers').textContent = formatNumber(summary.players?.online);
  $('#totalPlayers').textContent = `из ${formatNumber(summary.players?.total)} в whitelist`;
  $('#totalPlaytime').textContent = summary.playtime?.formatted || '-';
  $('#latestTps').textContent = summary.tps?.latest == null ? '-' : Number(summary.tps.latest).toFixed(1);
  $('#avgTps').textContent = `24ч avg: ${summary.tps?.average24h == null ? '-' : Number(summary.tps.average24h).toFixed(1)}`;
  $('#obsidianTotal').textContent = formatNumber(summary.obsidian?.totalMined);
  $('#obsidianSession').textContent = `session: ${formatNumber(summary.obsidian?.sessionMined)}`;
  $('#obsidianToday').textContent = formatNumber(summary.obsidian?.todayMined);
  $('#farmState').textContent = `farm: ${summary.obsidian?.desiredEnabled ? 'enabled' : 'disabled'}`;
  $('#chat24h').textContent = formatNumber(summary.chat?.messages24h);

  const nearby = summary.nearby || [];
  $('#nearbyList').innerHTML = nearby.length
    ? nearby.map(player => `
      <div class="nearby-item">
        <strong>${escapeHtml(player.username)}</strong>
        <span class="muted">${formatNumber(player.distance)} blocks · ${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">Пока нет записей.</div>';
}

function renderPlayers(payload) {
  const players = payload.players || [];
  $('#playersTable').innerHTML = players.length
    ? players.map(player => `
      <tr>
        <td class="player-name">${escapeHtml(player.username)}</td>
        <td><span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span></td>
        <td>${escapeHtml(player.playtime || '-')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" class="empty">Whitelist пуст или база недоступна.</td></tr>';
}

function renderChat(payload) {
  const messages = payload.messages || [];
  const list = $('#chatList');
  list.innerHTML = messages.length
    ? messages.map(message => `
      <article class="chat-message">
        <div class="chat-user">${escapeHtml(message.username)}</div>
        <div class="chat-text">${escapeHtml(message.message)}</div>
        <time class="chat-time">${formatDate(message.createdAt)}</time>
      </article>
    `).join('')
    : '<div class="empty">Сообщений пока нет. Новые появятся после запуска бота с обновленной таблицей чата.</div>';
  list.scrollTop = list.scrollHeight;
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
  $('#refreshButton').disabled = true;
  try {
    const [summary, players, chat] = await Promise.all([
      fetchJson('/api/summary'),
      fetchJson('/api/players'),
      fetchJson('/api/chat?limit=120')
    ]);
    renderSummary(summary);
    renderPlayers(players);
    renderChat(chat);
    $('#lastUpdated').textContent = `Обновлено ${formatDate(new Date())}`;
    setBanner('');
  } catch (err) {
    setBanner(`Не удалось загрузить данные: ${err.message}`);
  } finally {
    $('#refreshButton').disabled = false;
  }
}

$('#refreshButton').addEventListener('click', loadAll);
$('#databaseForm').addEventListener('submit', saveDatabaseUrl);

loadConfig();
loadAll();
state.timer = setInterval(loadAll, 15000);
