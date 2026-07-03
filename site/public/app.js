'use strict';

const state = {
  timer: null
};

const $ = selector => document.querySelector(selector);

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US').format(number) : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
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
    toggle.textContent = nextTheme === 'dark' ? 'Light theme' : 'Dark theme';
    toggle.setAttribute('aria-pressed', String(nextTheme === 'dark'));
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function renderSummary(summary) {
  $('#onlinePlayers').textContent = formatNumber(summary.players?.online);
  $('#totalPlayers').textContent = `of ${formatNumber(summary.players?.total)} whitelisted`;
  $('#latestTps').textContent = summary.tps?.latest == null ? '-' : Number(summary.tps.latest).toFixed(1);
  $('#avgTps').textContent = `24h average: ${summary.tps?.average24h == null ? '-' : Number(summary.tps.average24h).toFixed(1)}`;
  $('#obsidianTotal').textContent = formatNumber(summary.obsidian?.totalMined);
  $('#obsidianSession').textContent = `session: ${formatNumber(summary.obsidian?.sessionMined)}`;
  $('#obsidianToday').textContent = formatNumber(summary.obsidian?.todayMined);
  $('#farmState').textContent = `farm: ${summary.obsidian?.desiredEnabled ? 'enabled' : 'disabled'}`;
  $('#chat24h').textContent = formatNumber(summary.chat?.messages24h);

  const nearby = summary.nearby || [];
  $('#nearbyList').innerHTML = nearby.length
    ? nearby.map(player => `
      <div class="nearby-item">
        ${playerIdentity(player.username, 28)}
        <span class="muted">${formatNumber(player.distance)} blocks · ${formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No nearby sightings yet.</div>';
}

function renderPlayers(payload) {
  const players = payload.players || [];
  $('#playersTable').innerHTML = players.length
    ? players.map(player => `
      <tr>
        <td class="player-name">${playerIdentity(player.username, 28)}</td>
        <td><span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span></td>
        <td>${escapeHtml(player.playtime || '-')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" class="empty">No whitelist players found.</td></tr>';
}

function renderChat(payload) {
  const messages = payload.messages || [];
  const list = $('#chatList');
  list.innerHTML = messages.length
    ? messages.map(message => `
      <article class="chat-message">
        <div class="chat-user">${playerIdentity(message.username, 28)}</div>
        <div class="chat-text">${escapeHtml(message.message)}</div>
        <time class="chat-time">${formatDate(message.createdAt)}</time>
      </article>
    `).join('')
    : '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>';
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
    $('#lastUpdated').textContent = `Updated ${formatDate(new Date())}`;
    setBanner('');
  } catch (err) {
    setBanner(`Could not load dashboard data: ${err.message}`);
  } finally {
    $('#refreshButton').disabled = false;
  }
}

applyTheme(localStorage.getItem('wm-theme') || 'light');
$('#themeToggle').addEventListener('click', toggleTheme);
$('#refreshButton').addEventListener('click', loadAll);

loadAll();
state.timer = setInterval(loadAll, 15000);
