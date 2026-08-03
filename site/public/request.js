'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const state = { session: null, csrfToken: null, requests: [], adminRequests: [] };
const $ = selector => document.querySelector(selector);

const STATUS_LABELS = {
  pending: 'Новая', preparing: 'Собирается', ready: 'Ждёт входа',
  notified: 'Координаты отправлены', completed: 'Завершена', cancelled: 'Отменена'
};

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('wm-theme', nextTheme);
  const toggle = $('#themeToggle');
  toggle?.setAttribute('aria-pressed', String(nextTheme === 'dark'));
  toggle?.setAttribute('aria-label', nextTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}), ...(options.headers || {}) };
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch { /* Empty response. */ }
  if (!response.ok) throw new Error(payload.error || `Ошибка ${response.status}`);
  return payload;
}

function showMessage(message, error = false) {
  const target = $('#pageMessage');
  target.textContent = message;
  target.classList.toggle('error', error);
  target.hidden = false;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => { target.hidden = true; }, 6500);
}

function renderAccount() {
  const session = state.session;
  if (session?.requester) {
    const avatar = session.requester.avatarUrl
      ? `<img src="${escapeHtml(session.requester.avatarUrl)}" alt="">`
      : '<span class="account-avatar"></span>';
    $('#accountArea').innerHTML = `<div class="account-chip">${avatar}<span>${escapeHtml(session.requester.displayName)}</span></div><button id="requestLogout" class="text-button" type="button">Выйти</button>`;
    $('#requestLogout').addEventListener('click', logout);
  } else if (session?.admin) {
    $('#accountArea').innerHTML = `<div class="account-chip"><span>Администратор: ${escapeHtml(session.admin.username)}</span></div>`;
  } else {
    $('#accountArea').innerHTML = '<a class="text-button" href="/api/request/auth/start">Войти</a>';
  }
}

function requestCard(request) {
  const delivery = request.deliveryCoordinates
    ? `<div class="delivery-result"><small>КООРДИНАТЫ ДОСТАВКИ</small><strong>${escapeHtml(request.deliveryCoordinates)}</strong></div>`
    : '';
  const note = request.adminNote ? `<div class="request-meta"><span>Комментарий: ${escapeHtml(request.adminNote)}</span></div>` : '';
  return `<article class="request-card">
    <div class="request-card-head"><span class="request-id">Заявка #${escapeHtml(request.id)}</span><span class="status status-${escapeHtml(request.status)}">${escapeHtml(STATUS_LABELS[request.status] || request.status)}</span></div>
    <p class="request-resources">${escapeHtml(request.resources)}</p>
    ${delivery}${note}
    <div class="request-meta"><span>Ник: ${escapeHtml(request.minecraftUsername)}</span><span>${escapeHtml(formatDate(request.createdAt))}</span></div>
  </article>`;
}

function renderRequests() {
  $('#requestList').innerHTML = state.requests.length
    ? state.requests.map(requestCard).join('')
    : '<div class="empty-state">Здесь появятся ваши заявки.</div>';
}

function adminRequestCard(request) {
  const requester = request.requester || {};
  const avatar = requester.avatarUrl ? `<img src="${escapeHtml(requester.avatarUrl)}" alt="">` : '';
  const locked = ['ready', 'notified', 'completed', 'cancelled'].includes(request.status);
  return `<article class="admin-request" data-request-id="${escapeHtml(request.id)}">
    <div>
      <div class="request-card-head"><span class="request-id">Заявка #${escapeHtml(request.id)}</span><span class="status status-${escapeHtml(request.status)}">${escapeHtml(STATUS_LABELS[request.status] || request.status)}</span></div>
      <div class="requester-line">${avatar}<span><strong>${escapeHtml(request.minecraftUsername)}</strong> · ${escapeHtml(requester.displayName || requester.discordUsername || 'Discord')}</span></div>
      <p class="request-resources">${escapeHtml(request.resources)}</p>
      <div class="request-meta"><span>Создана ${escapeHtml(formatDate(request.createdAt))}</span>${request.notifiedAt ? `<span>Отправлено ${escapeHtml(formatDate(request.notifiedAt))}</span>` : ''}</div>
    </div>
    <form class="admin-form">
      <label><span>Координаты доставки</span><input name="deliveryCoordinates" maxlength="160" placeholder="Overworld: X 120, Y 64, Z -840" value="${escapeHtml(request.deliveryCoordinates || '')}" ${locked ? 'readonly' : ''}></label>
      <label><span>Комментарий игроку</span><textarea name="adminNote" maxlength="500" ${locked ? 'readonly' : ''}>${escapeHtml(request.adminNote || '')}</textarea></label>
      <div class="admin-actions">
        ${request.status === 'pending' ? '<button class="small-action" type="button" data-status="preparing">Начать сбор</button>' : ''}
        ${['pending', 'preparing'].includes(request.status) ? '<button class="small-action ready" type="button" data-status="ready">Готово и отправить</button><button class="small-action danger" type="button" data-status="cancelled">Отменить</button>' : ''}
        ${request.status === 'ready' && !request.deliveryQueued ? '<button class="small-action ready" type="button" data-status="ready">Повторить постановку в очередь</button>' : ''}
        ${request.status === 'notified' ? '<button class="small-action ready" type="button" data-status="completed">Завершить</button>' : ''}
      </div>
    </form>
  </article>`;
}

function renderAdminRequests() {
  $('#adminRequestList').innerHTML = state.adminRequests.length
    ? state.adminRequests.map(adminRequestCard).join('')
    : '<div class="empty-state">Заявок с таким статусом нет.</div>';
}

async function loadRequests() {
  if (!state.session?.requester) return;
  const payload = await api('/api/request/requests');
  state.requests = payload.requests || [];
  renderRequests();
}

async function loadAdminRequests() {
  if (!state.session?.admin) return;
  const filter = $('#adminStatusFilter').value;
  const payload = await api(`/api/request/requests${filter ? `?status=${encodeURIComponent(filter)}` : ''}`);
  state.adminRequests = payload.requests || [];
  renderAdminRequests();
}

async function submitRequest(event) {
  event.preventDefault();
  const button = $('#requestSubmit');
  button.disabled = true;
  try {
    const payload = await api('/api/request/requests', {
      method: 'POST',
      body: JSON.stringify({ minecraftUsername: $('#minecraftUsername').value, resources: $('#resources').value })
    });
    $('#resources').value = '';
    state.requests.unshift(payload.request);
    renderRequests();
    showMessage(`Заявка #${payload.request.id} принята.`);
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; }
}

async function updateAdminRequest(card, status) {
  const requestId = card.dataset.requestId;
  const button = card.querySelector(`[data-status="${status}"]`);
  if (button) button.disabled = true;
  try {
    await api(`/api/request/requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        deliveryCoordinates: card.querySelector('[name="deliveryCoordinates"]').value,
        adminNote: card.querySelector('[name="adminNote"]').value
      })
    });
    await loadAdminRequests();
    showMessage(status === 'ready' ? `Координаты для заявки #${requestId} поставлены в очередь.` : `Статус заявки #${requestId} обновлён.`);
  } catch (error) {
    await loadAdminRequests().catch(() => {});
    showMessage(error.message, true);
    if (button?.isConnected) button.disabled = false;
  }
}

async function logout() {
  try { await api('/api/request/auth/logout', { method: 'POST' }); }
  catch (error) { showMessage(error.message, true); return; }
  window.location.assign('/request');
}

async function init() {
  applyTheme(localStorage.getItem('wm-theme') || 'light');
  const query = new URLSearchParams(window.location.search);
  if (query.has('auth_error')) showMessage('Не удалось войти через Discord. Попробуйте ещё раз.', true);
  try {
    state.session = await api('/api/request/session');
    state.csrfToken = state.session.csrfToken || null;
  } catch (error) {
    showMessage(error.message, true);
    return;
  }
  renderAccount();
  const requester = state.session.requester;
  $('#requesterApp').hidden = !requester;
  $('#loginPrompt').hidden = Boolean(requester) || Boolean(state.session.admin);
  $('#adminApp').hidden = !state.session.admin;
  if (requester) {
    $('#minecraftUsername').value = requester.minecraftUsername || '';
    $('#heroAction').textContent = 'Создать заявку';
    $('#heroAction').href = '#requesterApp';
    $('#authHint').textContent = `Вы вошли как ${requester.displayName}.`;
    await loadRequests().catch(error => showMessage(error.message, true));
  } else if (!state.session.discordConfigured) {
    $('#heroAction').classList.add('disabled');
    $('#heroAction').href = '#';
    $('#authHint').textContent = 'Вход через Discord пока не настроен администратором.';
  }
  if (state.session.admin) await loadAdminRequests().catch(error => showMessage(error.message, true));
  if (query.has('auth') || query.has('auth_error')) window.history.replaceState({}, '', '/request');
}

$('#requestForm').addEventListener('submit', submitRequest);
$('#themeToggle').addEventListener('click', toggleTheme);
$('#refreshRequests').addEventListener('click', () => loadRequests().catch(error => showMessage(error.message, true)));
$('#refreshAdmin').addEventListener('click', () => loadAdminRequests().catch(error => showMessage(error.message, true)));
$('#adminStatusFilter').addEventListener('change', () => loadAdminRequests().catch(error => showMessage(error.message, true)));
$('#adminRequestList').addEventListener('click', event => {
  const button = event.target.closest('[data-status]');
  if (!button) return;
  const card = button.closest('[data-request-id]');
  updateAdminRequest(card, button.dataset.status);
});

init();
