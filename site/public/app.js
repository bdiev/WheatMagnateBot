'use strict';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const state = {
  timer: null,
  liveChatTimer: null,
  liveChatLoading: false,
  liveDashboardTimer: null,
  liveDashboardLoading: false,
  fullSyncLoading: false,
  fullSyncToken: null,
  fullSyncPromise: null,
  accountSwitchGeneration: 0,
  eventSource: null,
  sseWasConnected: false,
  sseNeedsFullSync: false,
  realtimeRefreshTimers: {},
  pollingMode: null,
  realtimeStatusTimer: null,
  realtimeHideTimer: null,
  lastRealtimeChartRefreshAt: 0,
  activeTab: 'chat',
  charts: {
    chatDaily: [],
    chatHourly: [],
    chatMonthly: [],
    killAuraDaily: [],
    killAuraHourly: [],
    killAuraMonthly: [],
    obsidianAccounts: [],
    obsidianAnnotations: [],
    obsidianDaily: [],
    obsidianHourly: [],
    tpsHourly: [],
    tpsHistoryCache: null,
    hourlyAverageOnline: []
  },
  chartMeta: {},
  rollingNumbers: {},
  obsidianDigitNumbers: {},
  seenSearchTimer: null,
  seenOnlineTimer: null,
  whisperSearchTimer: null,
  whitelistSearchTimer: null,
  chartTooltipTimer: null,
  chartTooltipPinned: false,
  chartRedrawFrame: null,
  chartRedrawGeneration: 0,
  chartScrollRedrawFrames: {},
  chartAnimations: {},
  chartGrowthAnimations: {},
  chartProgress: {},
  chartGrownOnce: new Set(),
  chartHover: {},
  chartPointer: null,
  seenPlayers: [],
  whisperPlayers: [],
  whisperTarget: null,
  whisperPlayersSignature: '',
  whisperMessagesSignature: '',
  whisperLastSeenId: null,
  whisperDialogReadIds: {},
  whisperReadStateSynced: false,
  whisperClaimedPlayers: new Set(),
  whisperUnreadCount: 0,
  playerProfileRegistrationDateMode: false,
  playerProfileLastSeenDateMode: false,
  playerProfileLastPayload: null,
  playerProfileSessionTimer: null,
  playerProfileRevealTimer: null,
  playerProfileRefreshTimers: [],
  playerProfileMessageRefreshes: new Set(),
  playerProfileAccentCache: new Map(),
  playerProfileSeenSearchReturn: null,
  playerProfileSeenSearchRestoreTimer: null,
  playerSkinViewer: null,
  playerSelectedSkin: null,
  playerSelectedCape: null,
  playerSkinsRequestId: 0,
  playerSkinBackgroundIndex: -1,
  whisperAccentCache: new Map(),
  playtimeLeaderboardScope: 'global',
  playtimeLeaderboardSort: 'playtime',
  playtimeLeaderboardDirection: 'desc',
  playtimeLeaderboards: { global: [], whitelisted: [] },
  playtimeLeaderboardVisibleCount: 24,
  playerStatsLoading: false,
  playerStatsLoadedAt: 0,
  playerStatsAccountId: null,
  playerStatsPromise: null,
  newPlayers: [],
  newPlayersInitialized: false,
  newPlayersLoading: false,
  newPlayersHasMore: false,
  newPlayersNextOffset: 0,
  newPlayersFirstPageSize: 0,
  newPlayersAccountId: null,
  whisperSearchPlayers: [],
  playerProfileUsername: null,
  playerProfileSignature: '',
  chatContextMessageId: null,
  chatContextRequest: 0,
  chatSearchQuery: '',
  chatMessages: [],
  chatHasMore: false,
  chatNextBeforeId: null,
  chatOlderLoading: false,
  chatArchiveStatusTimer: null,
  whitelistSearchPlayers: [],
  adminPlayerSearchRequests: {},
  adminControlState: null,
  adminControlLoading: false,
  adminControlRefreshedAt: 0,
  adminPlayers: [],
  adminPlayersLoading: false,
  adminPlayersAppending: false,
  adminPlayersPendingLoad: null,
  adminPlayersRetryTimer: null,
  adminPlayersRequestId: 0,
  adminPlayersSort: 'playtime',
  adminPlayersDirection: 'asc',
  adminPlayersLimit: 12,
  adminPlayersOffset: 0,
  adminPlayersNextOffset: 0,
  adminPlayersHasMore: false,
  adminPlayerSearchTimer: null,
  adminPlayerInfoCollectionLoading: false,
  adminPlayerInfoCollectionAttemptedAt: 0,
  adminPlayerInfoCollectionPending: false,
  adminPlayerInfoCollectionTimer: null,
  adminPlayerInfoAwaitingCommands: new Map(),
  liveNearbyPlayers: [],
  adminPlayerInfoAwaitTimer: null,
  adminPlayerInfoCollectionRendered: false,
  adminPlayerEditTarget: null,
  adminPlayerDeleteTarget: null,
  requestCountLoading: false,
  adminLogsLoading: false,
  adminLogsReloadQueued: false,
  childAiLoading: false,
  childAiPlayerStyles: [],
  childAiStyleVisibleLimit: 40,
  childAiStyleRenderFrame: null,
  childAiImportState: null,
  adminOpenLogDetails: new Set(),
  notificationRules: [],
  pushSettings: null,
  currentPushSubscriptionId: null,
  navigationPreferences: null,
  navigationSettingsLoading: null,
  navigationSavePromise: Promise.resolve(),
  navigationRevision: 0,
  timezones: [],
  accountTimezone: 'Europe/Vilnius',
  accountSettingsLoading: null,
  obsidianCoordinateEditorOpen: false,
  farmLaunchToastTimer: null,
  farmLaunchToastHideTimer: null,
  farmLaunchFailureSignatures: {},
  adminDataToastTimer: null,
  adminDataToastHideTimer: null,
  whisperToastTimer: null,
  whisperToastHideTimer: null,
  whisperToastPayload: null,
  lastWhisperToastEventId: null,
  pushSubscriptionKeyMismatch: false,
  pushSubscriptionNeedsRepair: false,
  pushRepairDevice: null,
  killAuraData: null,
  killAuraSelectedMobs: new Set(),
  killAuraModalSelectionSnapshot: new Set(),
  killAuraTargetsDirty: false,
  killAuraRangeDirty: false,
  killAuraRangeSaveTimer: null,
  killAuraRangeSaving: false,
  killAuraRangeSaveQueued: false,
  killAuraRangeGeneration: 0,
  supplyTooltipItems: {},
  inventoryMoveSelection: null,
  inventoryMovePending: false,
  inventoryDragConsumedUntil: 0,
  itemIcons: {},
  itemNameIds: {},
  itemIconsLoading: null,
  chatReply: null,
  chatReplyActiveMessageId: null,
  chatReplyHideTimer: null,
  chatPlayerTap: null,
  chatPlayerClickSuppression: null,
  chatMessageIds: new Set(),
  chatInitialized: false,
  chatLatestId: null,
  chatInitialScrollDone: false,
  authMode: 'login',
  csrfToken: null,
  bootstrapAvailable: false,
  currentUser: null,
  accounts: [],
  activeAccountId: null,
  obsidianStatsScope: localStorage.getItem('wm-obsidian-stats-scope') === 'all' ? 'all' : 'personal',
  accountAbortController: null,
  adminControlToken: null,
  accountsRefreshedAt: 0,
  editingAccountId: null,
  lastSuggestedAccountColor: null,
  accountDragId: null,
  accountDragConsumedUntil: 0,
  accountReorderPending: false,
  pendingPushDestination: null,
  chartRanges: {
    chatHourlyChart: 'hours',
    killAuraKillsChart: 'hours',
    obsidianDailyChart: 'days',
    tpsHourlyChart: 'hours',
    averageOnlineChart: 'hours'
  },
  chartScrollInitialized: {},
  chartZoom: {},
  chatDateIndicatorFrame: null,
  chatDateIndicatorShowPending: false,
  chatDateIndicatorHideTimer: null,
  chatDateIndicatorHiddenTimer: null,
  renderSignatures: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const PLAYER_SKIN_BACKGROUNDS = Object.freeze(
  Array.from({ length:8 }, (_,index) => `/backgrounds/player-skin-scene-${String(index + 1).padStart(2,'0')}.webp`)
);
const CHAT_HISTORY_LIMIT = 500;
const CHILD_AI_MOBILE_STYLE_BATCH = 40;
const NEW_PLAYERS_PAGE_SIZE = 24;
const dateTimeFormatters = new Map();
const ACCOUNT_COLOR_PALETTE = Object.freeze([
  '#f1c232', '#4b91e5', '#d26cf0', '#55c9ba', '#ef7373', '#f28c48',
  '#8c78e8', '#7cc242', '#e56aa6', '#41b6d7', '#b78b59', '#8dbb61'
]);
const NAV_SECTION_INFO = Object.freeze({
  chat: ['Chat', 'Minecraft chat archive and messaging'],
  bot: ['Bot Stats', 'Connection, health, gear and inventory'],
  'kill-aura': ['Kill Aura', 'Mob targets and combat statistics'],
  obsidian: ['Obsidian Farm', 'Farm controls and analytics'],
  server: ['Server Stats', 'TPS and server activity'],
  players: ['Player Stats', 'Profiles and activity'],
  'area-explorer': ['Area Explorer', 'Bases, loot and signs the explorer mod found'],
  settings: ['Settings', 'Timezone, security and navigation'],
  notifications: ['Notifications', 'Alerts and notification rules'],
  'child-ai': ['Child AI', 'Learning and memory administration'],
  admin: ['Admin', 'Administrative controls']
});
const NAV_DEFAULT_ORDER = Object.freeze(['chat', 'bot', 'kill-aura', 'obsidian', 'server', 'players', 'area-explorer', 'settings', 'notifications', 'child-ai', 'admin']);
let dashboardBrandLastScrollY = Math.max(0, window.scrollY);
let dashboardBrandScrollFrame = null;

function updateDashboardBrandVisibility() {
  dashboardBrandScrollFrame = null;
  if (document.documentElement.classList.contains('admin-player-actions-open')) return;
  const brand = $('.dashboard-brand');
  if (!brand) return;

  const scrollY = Math.max(0, window.scrollY);
  const delta = scrollY - dashboardBrandLastScrollY;
  const topbar = brand.closest('.topbar');
  topbar?.classList.toggle('topbar-stuck', scrollY > 20);
  if (scrollY <= 64) {
    brand.classList.remove('dashboard-brand-hidden');
  } else if (delta > 2 && scrollY > 96) {
    brand.classList.add('dashboard-brand-hidden');
  } else if (delta < -2 && scrollY < 88) {
    brand.classList.remove('dashboard-brand-hidden');
  }
  topbar?.classList.toggle('topbar-compact', brand.classList.contains('dashboard-brand-hidden'));
  dashboardBrandLastScrollY = scrollY;
}

function scheduleDashboardBrandVisibility() {
  if (dashboardBrandScrollFrame != null) return;
  dashboardBrandScrollFrame = requestAnimationFrame(updateDashboardBrandVisibility);
}

function initializeDashboardBrandVisibility() {
  const brand = $('.dashboard-brand');
  if (!brand) return;
  const scrollY = Math.max(0, window.scrollY);
  const hidden = scrollY > 96;
  brand.classList.toggle('dashboard-brand-hidden', hidden);
  brand.closest('.topbar')?.classList.toggle('topbar-stuck', scrollY > 20);
  brand.closest('.topbar')?.classList.toggle('topbar-compact', hidden);
  window.addEventListener('scroll', scheduleDashboardBrandVisibility, { passive: true });
}

function fallbackTimezones() {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...supported, 'UTC', 'Europe/Vilnius', Intl.DateTimeFormat().resolvedOptions().timeZone].filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
}

function timezoneValues(selected = 'Europe/Vilnius') {
  const zones = [...new Set([...(state.timezones.length ? state.timezones : fallbackTimezones()), selected].filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  return zones;
}

function populateTimezoneInput(input, selected = 'Europe/Vilnius') {
  if (!input) return;
  const datalist = $('#accountTimezoneOptions');
  if (datalist) datalist.innerHTML = timezoneValues(selected).map(zone => `<option value="${escapeHtml(zone)}"></option>`).join('');
  input.value = selected;
}

function resolveTimezoneInput(value) {
  const entered = String(value || '').trim();
  const normalized = entered.replace(/\s+/g, '_').toLowerCase();
  const zones = timezoneValues(state.accountTimezone);
  const exact = zones.find(zone => zone.toLowerCase() === normalized);
  if (exact) return exact;
  const cityMatches = zones.filter(zone => zone.split('/').pop().toLowerCase() === normalized);
  return cityMatches.length === 1 ? cityMatches[0] : entered;
}

async function loadTimezones() {
  if (state.timezones.length || !state.currentUser) return;
  try {
    const payload = await fetchJson('/api/timezones');
    state.timezones = Array.isArray(payload.timezones) ? payload.timezones.map(String).filter(Boolean) : fallbackTimezones();
  } catch {
    state.timezones = fallbackTimezones();
  }
  populateTimezoneInput($('#accountTimezone'), state.accountTimezone);
}

async function loadAccountSettings({ refreshDashboard = false } = {}) {
  if (!state.currentUser) return;
  if (state.accountSettingsLoading) return state.accountSettingsLoading;
  state.accountSettingsLoading = (async () => {
    const payload = await fetchJson('/api/settings/account');
    state.accountTimezone = String(payload.timezone || 'Europe/Vilnius');
    populateTimezoneInput($('#accountTimezone'), state.accountTimezone);
    redrawCharts();
    if (refreshDashboard) await loadAll();
  })().catch(err => setBanner(`Could not load account settings: ${err.message}`)).finally(() => {
    state.accountSettingsLoading = null;
  });
  return state.accountSettingsLoading;
}

async function saveAccountSettings(event) {
  event.preventDefault();
  const timezone = resolveTimezoneInput($('#accountTimezone')?.value || 'Europe/Vilnius');
  const button = $('#accountTimezoneSave');
  const label = button?.querySelector('.button-label');
  const originalLabel = 'Save timezone';
  if (button) {
    button.disabled = true;
    button.classList.remove('save-success', 'save-error');
    button.classList.add('is-saving');
  }
  if (label) label.textContent = 'Saving…';
  try {
    const payload = await putJson('/api/settings/account', { timezone });
    state.accountTimezone = String(payload.timezone || timezone);
    populateTimezoneInput($('#accountTimezone'), state.accountTimezone);

    // Render signatures describe server data, which does not change when only
    // its display timezone changes. Invalidate them so every cached timestamp
    // (chat, whispers, admin lists and charts) is formatted again.
    state.renderSignatures = {};
    state.whisperMessagesSignature = '';
    state.playerProfileSignature = '';
    state.chartScrollInitialized = {};
    if (state.playerProfileLastPayload && !$('#playerProfileOverlay')?.hidden) {
      replacePlayerProfileContent(state.playerProfileLastPayload);
      state.playerProfileSignature = playerProfileSignature(state.playerProfileLastPayload);
    }
    await loadAll();
    if (button) {
      button.classList.remove('is-saving');
      button.classList.add('save-success');
    }
    if (label) label.textContent = 'Saved ✓';
  } catch (err) {
    if (button) {
      button.classList.remove('is-saving');
      button.classList.add('save-error');
    }
    if (label) label.textContent = 'Not saved';
    setBanner(`Could not save account timezone: ${err.message}`);
  } finally {
    window.setTimeout(() => {
      if (!button) return;
      button.disabled = false;
      button.classList.remove('is-saving', 'save-success', 'save-error');
      if (label) label.textContent = originalLabel;
    }, 1600);
  }
}

function assessPasswordStrength(value) {
  const password = String(value || '');
  if (!password) {
    return { score: 0, label: 'Not set', hint: 'Use 12 or more characters for a strong password.' };
  }
  if (password.length < 6) {
    return { score: 1, label: 'Weak', hint: 'At least 6 characters are required.' };
  }

  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
    .filter(pattern => pattern.test(password)).length;
  const uniqueRatio = new Set(password).size / password.length;
  let points = 1;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (characterGroups >= 2) points += 1;
  if (characterGroups >= 3) points += 1;
  if (characterGroups === 4) points += 1;
  if (uniqueRatio >= 0.6) points += 1;
  if (password.length >= 18 && characterGroups >= 2) points += 2;
  if (uniqueRatio < 0.35 || /(.)\1{3}/.test(password)) points -= 2;

  let score = points <= 2 ? 1 : points <= 4 ? 2 : points <= 6 ? 3 : 4;
  if (password.length < 8) score = Math.min(score, 1);
  else if (password.length < 10) score = Math.min(score, 2);
  else if (password.length < 12) score = Math.min(score, 3);

  const feedback = {
    1: { label: 'Weak', hint: 'Add length and mix different character types.' },
    2: { label: 'Fair', hint: 'Use 12 or more characters for a stronger password.' },
    3: { label: 'Good', hint: 'Almost strong — add length or another character type.' },
    4: { label: 'Strong', hint: 'Strong password.' }
  }[score];
  return { score, ...feedback };
}

function updatePasswordStrength(selector, value) {
  const meter = $(selector);
  if (!meter) return;
  const password = String(value || '');
  const canShow = meter.id !== 'authPasswordStrength' || ['register', 'bootstrap'].includes(state.authMode);
  const shouldShow = canShow && password.length > 0;
  const strength = assessPasswordStrength(canShow ? password : '');
  const previousScore = Number(meter.dataset.score) || 0;
  const input = meter.id === 'authPasswordStrength' ? $('#authPassword') : $('#accountNewPassword');
  meter.dataset.score = String(strength.score);
  if (input) input.dataset.passwordStrengthScore = String(strength.score);
  const progress = meter.querySelector('[role="progressbar"]');
  const label = meter.querySelector('[data-password-strength-label]');
  const hint = meter.querySelector('[data-password-strength-hint]');
  if (progress) {
    progress.setAttribute('aria-valuenow', String(strength.score));
    progress.setAttribute('aria-valuetext', strength.label);
  }
  if (label) label.textContent = strength.label;
  if (hint) hint.textContent = strength.hint;

  window.clearTimeout(meter.passwordStrengthVisibilityTimer);
  if (shouldShow) {
    const wasHidden = meter.hidden;
    meter.hidden = false;
    meter.setAttribute('aria-hidden', 'false');
    if (wasHidden) void meter.offsetHeight;
    meter.classList.add('is-visible');
  } else {
    meter.setAttribute('aria-hidden', 'true');
    meter.classList.remove('is-visible', 'is-updating', 'is-strong-celebration');
    input?.classList.remove('is-strength-updating', 'is-strong-celebration');
    if (!meter.hidden) {
      meter.passwordStrengthVisibilityTimer = window.setTimeout(() => {
        if (!meter.classList.contains('is-visible')) meter.hidden = true;
      }, 280);
    }
    return;
  }

  if (previousScore === strength.score) return;
  window.clearTimeout(meter.passwordStrengthUpdateTimer);
  window.clearTimeout(meter.passwordStrengthCelebrationTimer);
  meter.classList.remove('is-updating', 'is-strong-celebration');
  input?.classList.remove('is-strength-updating', 'is-strong-celebration');
  void meter.offsetWidth;
  meter.classList.add('is-updating');
  input?.classList.add('is-strength-updating');
  meter.passwordStrengthUpdateTimer = window.setTimeout(() => {
    meter.classList.remove('is-updating');
    input?.classList.remove('is-strength-updating');
  }, 380);

  if (strength.score === 4) {
    meter.classList.add('is-strong-celebration');
    input?.classList.add('is-strong-celebration');
    meter.passwordStrengthCelebrationTimer = window.setTimeout(() => {
      meter.classList.remove('is-strong-celebration');
      input?.classList.remove('is-strong-celebration');
    }, 1250);
  }
}

async function changeAccountPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#accountPasswordSave');
  const status = $('#accountPasswordStatus');
  const currentPassword = $('#accountCurrentPassword')?.value || '';
  const newPassword = $('#accountNewPassword')?.value || '';
  const confirmPassword = $('#accountConfirmPassword')?.value || '';
  const showStatus = (message, type) => {
    if (!status) return;
    status.textContent = message;
    status.className = `account-password-status ${type}`;
    status.hidden = false;
  };
  if (newPassword !== confirmPassword) {
    showStatus('New password confirmation does not match.', 'error');
    $('#accountConfirmPassword')?.focus();
    return;
  }
  if (button) button.disabled = true;
  if (status) status.hidden = true;
  try {
    const payload = await putJson('/api/settings/password', { currentPassword, newPassword, confirmPassword });
    form.reset();
    updatePasswordStrength('#accountNewPasswordStrength', '');
    const signedOut = Number(payload.signedOutSessions) || 0;
    showStatus(signedOut
      ? `Password changed. ${signedOut} other signed-in ${signedOut === 1 ? 'session was' : 'sessions were'} logged out.`
      : 'Password changed successfully.', 'success');
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US').format(number) : '-';
}

function renderPeriodTrend(selector, currentValue, previousValue, previousPeriodLabel) {
  const element = $(selector);
  if (!element) return;
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    element.hidden = true;
    return;
  }

  let direction = 'flat';
  let copy = '→ 0%';
  if (previous === 0 && current > 0) {
    direction = 'up';
    copy = '↑ New';
  } else if (previous > 0 && current !== previous) {
    const percent = Math.round(Math.abs(((current - previous) / previous) * 100));
    direction = current > previous ? 'up' : 'down';
    copy = `${direction === 'up' ? '↑' : '↓'} ${formatNumber(percent)}%`;
  }

  element.hidden = false;
  element.dataset.direction = direction;
  element.textContent = copy;
  element.title = `${copy} vs ${previousPeriodLabel} (${formatNumber(previous)} players)`;
  element.setAttribute('aria-label', element.title);
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

// Aligns two strings from their right edge so digits that shift left when a
// number grows a column (999 -> 1,000) are still compared against the digit
// that visually occupies the same place value, not the same string index.
function diffDigitsFromRight(oldChars, newChars) {
  const offset = newChars.length - oldChars.length;
  return newChars.map((char, index) => {
    const oldIndex = index - offset;
    const oldChar = oldIndex >= 0 && oldIndex < oldChars.length ? oldChars[oldIndex] : null;
    return { char, changed: oldChar !== char };
  });
}

// Minecraft/Hypixel-style counter: changed digits are updated directly to the
// real value and receive a brief gold "impact" flash. Showing intermediate
// digits here makes monotonically increasing farm totals look like they are
// randomly jumping, even though the persisted value is correct.
function setObsidianDigitNumber(selector, value, {
  prefix = '',
  suffix = '',
  decimals = 0
} = {}) {
  const element = $(selector);
  if (!element) return;
  const numericValue = Number(value);
  const previous = state.obsidianDigitNumbers[selector];

  const clearPendingTimers = () => {
    (previous?.timers || []).forEach(id => clearTimeout(id));
  };

  if (!Number.isFinite(numericValue)) {
    clearPendingTimers();
    element.textContent = `${prefix}-${suffix}`;
    element.classList.remove('mc-number', 'mc-number-impact');
    delete state.obsidianDigitNumbers[selector];
    return;
  }

  const digitsText = formatNumber(numericValue.toFixed(decimals));
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // First paint for this element, or its structure was reset: render the
  // target instantly with no spin so the tile never opens on a rolling blur.
  if (!previous || element.dataset.mcBuilt !== '1') {
    clearPendingTimers();
    element.classList.add('mc-number');
    element.innerHTML = '';
    if (prefix) element.appendChild(Object.assign(document.createElement('span'), { className: 'mc-number-prefix', textContent: prefix }));
    const digitsHost = document.createElement('span');
    digitsHost.className = 'mc-number-digits';
    Array.from(digitsText).forEach(char => {
      const cell = document.createElement('span');
      cell.className = 'mc-digit';
      cell.textContent = char;
      digitsHost.appendChild(cell);
    });
    element.appendChild(digitsHost);
    if (suffix) element.appendChild(Object.assign(document.createElement('span'), { className: 'mc-number-suffix', textContent: suffix }));
    element.dataset.mcBuilt = '1';
    state.obsidianDigitNumbers[selector] = { value: numericValue, text: digitsText, timers: [] };
    return;
  }

  if (previous.value === numericValue) return;

  clearPendingTimers();
  const digitsHost = element.querySelector('.mc-number-digits');
  if (!digitsHost) {
    delete element.dataset.mcBuilt;
    setObsidianDigitNumber(selector, value, { prefix, suffix, decimals });
    return;
  }

  const oldChars = Array.from(previous.text || digitsHost.textContent);
  const newChars = Array.from(digitsText);
  const diff = diffDigitsFromRight(oldChars, newChars);

  // Rebuild digit cells to match the new length before animating; cells
  // whose character is unchanged are left untouched visually.
  const cells = newChars.map((char, index) => {
    let cell = digitsHost.children[index];
    if (!cell) {
      cell = document.createElement('span');
      cell.className = 'mc-digit';
      digitsHost.appendChild(cell);
    }
    return cell;
  });
  while (digitsHost.children.length > newChars.length) {
    digitsHost.removeChild(digitsHost.lastElementChild);
  }

  const timers = [];
  const changedDigitCount = diff.filter(entry => entry.changed && /\d/.test(entry.char)).length;

  diff.forEach((entry, index) => {
    const cell = cells[index];
    cell.textContent = entry.char;
    cell.classList.remove('mc-digit-spin', 'mc-digit-landed');
    if (!entry.changed || !/\d/.test(entry.char) || reduceMotion) return;
    cell.classList.add('mc-digit-landed');
    const landedTimer = setTimeout(() => cell.classList.remove('mc-digit-landed'), 260);
    timers.push(landedTimer);
  });

  if (changedDigitCount > 0 && !reduceMotion) {
    element.classList.remove('mc-number-impact');
    // Force a reflow so retriggering the class restarts the CSS animation
    // when two updates land close together.
    void element.offsetWidth;
    element.classList.add('mc-number-impact');
    const impactTimer = setTimeout(() => element.classList.remove('mc-number-impact'), 320);
    timers.push(impactTimer);
  }

  state.obsidianDigitNumbers[selector] = { value: numericValue, text: digitsText, timers };
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
    minute: '2-digit',
    timeZone: state.accountTimezone
  }).format(date);
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: state.accountTimezone
  }).format(date);
}

function formatChatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: state.accountTimezone
  }).format(date);
}

function formatFullDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const cacheKey = `full:${state.accountTimezone}`;
  if (!dateTimeFormatters.has(cacheKey)) dateTimeFormatters.set(cacheKey, new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: state.accountTimezone
  }));
  return dateTimeFormatters.get(cacheKey).format(date);
}

function formatPlayerProfileChatTimestamp(value) {
  return formatFullDateTime(value);
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

async function writeClipboardText(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('Nothing to copy.');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // The textarea fallback also works when clipboard permissions are denied.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard access is unavailable.');
}

function showCopyToast(message) {
  let toast = $('#copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.className = 'copy-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
  }
  window.clearTimeout(toast.hideTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toast.hideTimer = window.setTimeout(() => toast.classList.remove('visible'), 1500);
}

async function copyUuid(target) {
  const uuid = String(target?.dataset?.copyUuid || '').trim();
  if (!uuid) return;
  await writeClipboardText(uuid);
  target.classList.add('uuid-copy-confirmed');
  window.setTimeout(() => target.classList.remove('uuid-copy-confirmed'), 900);
  showCopyToast('UUID copied');
}

function playerHeadUrl(username, size = 32, { uuid = null, skinHash = null } = {}) {
  const safeUsername = encodeURIComponent(String(username || 'Steve').trim() || 'Steve');
  const compactUuid = String(uuid || '').replaceAll('-', '').trim().toLowerCase();
  const uuidQuery = /^[0-9a-f]{32}$/.test(compactUuid) ? `&uuid=${encodeURIComponent(compactUuid)}` : '';
  const normalizedSkinHash = String(skinHash || '').trim().toLowerCase();
  const skinQuery = /^[a-z0-9_-]{1,128}$/.test(normalizedSkinHash) ? `&skin=${encodeURIComponent(normalizedSkinHash)}` : '';
  return `/api/minecraft-avatar?username=${safeUsername}${uuidQuery}${skinQuery}&v=5`;
}

function playerProfileAccentKey(profile) {
  const uuid = String(profile?.uuid || '').replaceAll('-', '').trim().toLowerCase();
  return uuid || String(profile?.username || '').trim().toLowerCase();
}

const PLAYER_ACCENT_PROPERTY_NAMES = [
    '--player-accent-light',
    '--player-accent-light-strong',
    '--player-accent-light-contrast',
    '--player-accent-light-contrast-shadow',
    '--player-accent-dark',
    '--player-accent-dark-strong',
    '--player-accent-dark-contrast',
    '--player-accent-dark-contrast-shadow'
];

function setPlayerAccentProperties(element, theme = null) {
  if (!element) return;
  element.classList.toggle('has-player-accent', Boolean(theme));
  for (const propertyName of PLAYER_ACCENT_PROPERTY_NAMES) {
    if (theme?.[propertyName]) element.style.setProperty(propertyName, theme[propertyName]);
    else element.style.removeProperty(propertyName);
  }
}

function setPlayerProfileAccent(theme = null) {
  setPlayerAccentProperties($('#playerProfileOverlay')?.querySelector('.player-profile-card'), theme);
}

function setWhisperAccent(theme = null) {
  setPlayerAccentProperties($('#whisperPanel'), theme);
}

function whisperAccentKey(username = state.whisperTarget) {
  return String(username || '').trim().toLowerCase();
}

function applyWhisperAccent(username = state.whisperTarget) {
  const accentApi = globalThis.PlayerAccent;
  const key = whisperAccentKey(username);
  const image = $('#whisperTargetTitle')?.querySelector('.player-head');
  if (!accentApi || !key || !image) return;

  const cachedTheme = state.whisperAccentCache.get(key);
  if (cachedTheme) setWhisperAccent(cachedTheme);

  const resolveAccent = () => {
    if (whisperAccentKey() !== key) return;
    let accent;
    try {
      accent = accentApi.accentFromImage(image, key);
    } catch {
      accent = accentApi.pickPlayerAccent([], key);
    }
    const theme = accentApi.createPlayerAccentTheme(accent);
    state.whisperAccentCache.set(key, theme);
    if (whisperAccentKey() === key) setWhisperAccent(theme);
  };

  if (image.complete) resolveAccent();
  else {
    image.addEventListener('load', resolveAccent, { once: true });
    image.addEventListener('error', resolveAccent, { once: true });
  }
}

function setPlayerProfileLoading(isLoading) {
  $('#playerProfileOverlay')?.querySelector('.player-profile-card')
    ?.classList.toggle('profile-loading', Boolean(isLoading));
}

function applyPlayerProfileAccent(profile) {
  const accentApi = globalThis.PlayerAccent;
  const key = playerProfileAccentKey(profile);
  const image = $('#playerProfileContent')?.querySelector('.player-profile-avatar');
  if (!accentApi || !key || !image) {
    setPlayerProfileLoading(false);
    return;
  }

  const cachedTheme = state.playerProfileAccentCache.get(key);
  if (cachedTheme) {
    setPlayerProfileAccent(cachedTheme);
    setPlayerProfileLoading(false);
  }

  const resolveAccent = () => {
    if (playerProfileAccentKey(state.playerProfileLastPayload) !== key) return;
    let accent;
    try {
      accent = accentApi.accentFromImage(image, key);
    } catch {
      accent = accentApi.pickPlayerAccent([], key);
    }
    const theme = accentApi.createPlayerAccentTheme(accent);
    state.playerProfileAccentCache.set(key, theme);
    if (playerProfileAccentKey(state.playerProfileLastPayload) === key) {
      setPlayerProfileAccent(theme);
      setPlayerProfileLoading(false);
    }
  };

  if (image.complete && image.naturalWidth > 0) resolveAccent();
  else {
    image.addEventListener('load', resolveAccent, { once: true });
    image.addEventListener('error', resolveAccent, { once: true });
  }
}

function playerIdentity(username, size = 28, { status = null, uuid = null, loading = 'eager' } = {}) {
  const safeName = escapeHtml(username || 'Unknown');
  const safeUsername = escapeHtml(username || '');
  const statusClass = status === 'online' ? ' online' : status === 'offline' ? ' offline' : '';
  const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : '';
  return `
    <span class="player-identity${statusClass}" role="button" tabindex="0" data-player="${safeUsername}" title="Open player profile"${statusLabel ? ` aria-label="${safeName}: ${statusLabel}"` : ''}>
      <img class="player-head" src="${playerHeadUrl(username, size, { uuid })}" alt="" loading="${loading === 'lazy' ? 'lazy' : 'eager'}" decoding="async" width="${size}" height="${size}" onerror="this.style.visibility='hidden'">
      <span>${safeName}</span>
    </span>
  `;
}

const LOCAL_ITEM_ICONS = {
  firework_rocket: '/items/Firework_Rocket.png',
  lead: '/items/Lead.png'
};

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

/** An item's id from its name as the game shows it: "Ward Armor Trim" is ward_armor_trim_smithing_template, "Map" filled_map. */
function itemIdForName(value) {
  // Without colour codes some packs put in names: "Golden Apple §f(§f§f)"
  const key = normalizeItemIconKey(String(value || '').replace(/§.?/g, '').replace(/\(\s*\)|\[\s*\]/g, '').trim());
  return state.itemNameIds[key] || key;
}

function minecraftIconUrl(type, value) {
  const iconKey = type === 'item' ? itemIdForName(value) : normalizeItemIconKey(value);
  if (!['mob', 'item'].includes(type) || !/^[a-z0-9_]{1,80}$/.test(iconKey)) return '';
  return `/api/minecraft-icon/${type}/${encodeURIComponent(iconKey)}.png`;
}

function itemIcon(item) {
  const label = item?.label || item?.name || 'Item';
  const fallback = escapeHtml(label.slice(0, 2).toUpperCase());
  const url = localItemIconUrl(item) || minecraftIconUrl('item', item?.name || item?.label);
  if (!url) return `<span class="item-icon fallback">${fallback}</span>`;
  return `
    <span class="item-icon">
      <img src="${url}" alt="" loading="lazy" data-item-icon-image>
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
  updateChatDateIndicator();
}

function chatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const keyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: state.accountTimezone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateKey = keyFormatter.format(date);
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: state.accountTimezone, month: 'short', day: 'numeric', year: 'numeric'
  }).format(date);
  if (dateKey === keyFormatter.format(today)) return `Today · ${formatted}`;
  if (dateKey === keyFormatter.format(yesterday)) return `Yesterday · ${formatted}`;
  return formatted;
}

function updateChatDateIndicator({ show = false } = {}) {
  if (show) state.chatDateIndicatorShowPending = true;
  if (state.chatDateIndicatorFrame) return;
  state.chatDateIndicatorFrame = requestAnimationFrame(() => {
    state.chatDateIndicatorFrame = null;
    const shouldShow = state.chatDateIndicatorShowPending;
    state.chatDateIndicatorShowPending = false;
    const list = $('#chatList');
    const indicator = $('#chatDateIndicator');
    if (!list || !indicator) return;
    const visibleTop = list.scrollTop + 8;
    // Rows are in vertical order, so a binary search reads a handful of
    // offsets per scroll frame instead of measuring every message.
    const rows = list.children;
    let low = 0;
    let high = rows.length - 1;
    let message = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const row = rows[middle];
      if (row.offsetTop + row.offsetHeight >= visibleTop) {
        message = row;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    if (message && !message.matches('.chat-message[data-created-at]')) message = null;
    const label = message ? chatDateLabel(message.dataset.createdAt) : '';
    if (!label) {
      indicator.classList.remove('visible');
      indicator.hidden = true;
      return;
    }
    if (indicator.textContent !== label) indicator.textContent = label;
    if (!shouldShow) return;

    clearTimeout(state.chatDateIndicatorHideTimer);
    clearTimeout(state.chatDateIndicatorHiddenTimer);
    indicator.hidden = false;
    requestAnimationFrame(() => indicator.classList.add('visible'));
    state.chatDateIndicatorHideTimer = setTimeout(() => {
      indicator.classList.remove('visible');
      state.chatDateIndicatorHiddenTimer = setTimeout(() => {
        if (!indicator.classList.contains('visible')) indicator.hidden = true;
      }, 220);
    }, 900);
  });
}

function handleChatListScroll() {
  updateChatScrollButton();
  updateChatDateIndicator({ show: true });
  const list = $('#chatList');
  if (list && list.scrollTop <= 120) {
    loadOlderChatMessages().catch(err => setBanner(`Could not load older chat: ${err.message}`));
  }
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
  if (message) console.warn('[Dashboard]',message);
}

function farmLaunchBotName(bot = null) {
  const account = state.accounts.find(item => item.id === state.activeAccountId);
  return String(account?.displayName || bot?.username || account?.username || 'Bot').trim() || 'Bot';
}

function normalizeFarmLaunchFailureReason(reason) {
  return String(reason || 'Unknown error.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360) || 'Unknown error.';
}

function hideFarmLaunchFailureToast({ immediate = false } = {}) {
  const toast = $('#farmLaunchToast');
  clearTimeout(state.farmLaunchToastTimer);
  clearTimeout(state.farmLaunchToastHideTimer);
  state.farmLaunchToastTimer = null;
  state.farmLaunchToastHideTimer = null;
  if (!toast) return;
  toast.classList.remove('visible');
  if (immediate) {
    toast.hidden = true;
    return;
  }
  state.farmLaunchToastHideTimer = setTimeout(() => {
    if (!toast.classList.contains('visible')) toast.hidden = true;
    state.farmLaunchToastHideTimer = null;
  }, 260);
}

function reportFarmLaunchFailure(reason, bot = null, { force = false } = {}) {
  const toast = $('#farmLaunchToast');
  if (!toast) return;
  const accountKey = state.activeAccountId || 'default';
  const safeReason = normalizeFarmLaunchFailureReason(reason);
  const signature = `${accountKey}:${safeReason}`;
  if (!force && state.farmLaunchFailureSignatures[accountKey] === signature) return;
  state.farmLaunchFailureSignatures[accountKey] = signature;

  clearTimeout(state.farmLaunchToastTimer);
  clearTimeout(state.farmLaunchToastHideTimer);
  state.farmLaunchToastHideTimer = null;
  $('#farmLaunchToastBot').textContent = farmLaunchBotName(bot);
  $('#farmLaunchToastReason').textContent = safeReason;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('visible'));
  state.farmLaunchToastTimer = setTimeout(() => hideFarmLaunchFailureToast(), 10_000);
}

function syncFarmLaunchFailureToast(bot = null) {
  if (!bot) return;
  const farm = bot.modules?.obsidianFarm || bot.obsidian || {};
  const accountKey = state.activeAccountId || 'default';
  if (farm.enabled) {
    delete state.farmLaunchFailureSignatures[accountKey];
    return;
  }

  const moduleError = String(farm.lastErrorMessage || '').trim();
  const runtimeError = String(bot.lastError || '').trim();
  const desired = farm.desiredEnabled === true;
  const runtimeLooksFarmRelated = /obsidian|farm|barrel|lever|pickaxe|bucket|pathfinder|coordinates/i.test(runtimeError);
  const reason = desired ? (moduleError || runtimeError) : (runtimeLooksFarmRelated ? runtimeError : '');
  if (reason) reportFarmLaunchFailure(reason, bot);
}

function hideAdminDataToast({ immediate = false } = {}) {
  const toast = $('#adminDataToast');
  clearTimeout(state.adminDataToastTimer);
  clearTimeout(state.adminDataToastHideTimer);
  state.adminDataToastTimer = null;
  state.adminDataToastHideTimer = null;
  if (!toast) return;
  toast.classList.remove('visible');
  if (immediate) {
    toast.hidden = true;
    return;
  }
  state.adminDataToastHideTimer = setTimeout(() => {
    if (!toast.classList.contains('visible')) toast.hidden = true;
    state.adminDataToastHideTimer = null;
  }, 260);
}

function showAdminDataToast({ kind = 'success', title, message }) {
  const toast = $('#adminDataToast');
  if (!toast) return;
  const isError = kind === 'error';
  const durationMs = isError ? 9_000 : 6_000;
  clearTimeout(state.adminDataToastTimer);
  clearTimeout(state.adminDataToastHideTimer);
  state.adminDataToastHideTimer = null;
  toast.dataset.kind = isError ? 'error' : 'success';
  toast.setAttribute('role', isError ? 'alert' : 'status');
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  $('#adminDataToastIcon').textContent = isError ? '!' : '✓';
  $('#adminDataToastTitle').textContent = String(title || (isError ? 'Update failed' : 'Player data updated'));
  $('#adminDataToastMessage').textContent = String(message || '');
  toast.style.setProperty('--admin-data-toast-duration', `${durationMs}ms`);
  toast.classList.remove('visible');
  toast.hidden = false;
  void toast.offsetWidth;
  requestAnimationFrame(() => toast.classList.add('visible'));
  state.adminDataToastTimer = setTimeout(() => hideAdminDataToast(), durationMs);
}

function hideWhisperToast({ immediate = false } = {}) {
  const toast = $('#whisperToast');
  clearTimeout(state.whisperToastTimer);
  clearTimeout(state.whisperToastHideTimer);
  state.whisperToastTimer = null;
  state.whisperToastHideTimer = null;
  if (!toast) return;
  toast.classList.remove('visible');
  if (immediate) {
    toast.hidden = true;
    state.whisperToastPayload = null;
    return;
  }
  state.whisperToastHideTimer = setTimeout(() => {
    if (!toast.classList.contains('visible')) {
      toast.hidden = true;
      state.whisperToastPayload = null;
    }
    state.whisperToastHideTimer = null;
  }, 260);
}

function showWhisperToast(payload = {}) {
  if (payload.direction !== 'incoming') return;
  const eventId = String(payload.id || '');
  if (eventId && eventId === state.lastWhisperToastEventId) return;
  const player = String(payload.playerUsername || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
  if (!player) return;
  state.lastWhisperToastEventId = eventId || null;
  state.whisperToastPayload = { player, accountId: String(payload.accountId || '') || null };
  const toast = $('#whisperToast');
  if (!toast) return;
  clearTimeout(state.whisperToastTimer);
  clearTimeout(state.whisperToastHideTimer);
  state.whisperToastHideTimer = null;
  $('#whisperToastPlayer').textContent = player;
  const avatarFrame = $('#whisperToastAvatarFrame');
  const avatar = $('#whisperToastAvatar');
  const avatarFallback = $('#whisperToastAvatarFallback');
  if (avatarFrame && avatar && avatarFallback) {
    avatarFrame.classList.remove('is-loaded');
    avatarFallback.textContent = player.charAt(0).toUpperCase() || '?';
    avatar.hidden = false;
    avatar.onload = () => avatarFrame.classList.add('is-loaded');
    avatar.onerror = () => {
      avatarFrame.classList.remove('is-loaded');
      avatar.hidden = true;
    };
    avatar.src = playerHeadUrl(player, 64);
    if (avatar.complete && avatar.naturalWidth > 0) avatarFrame.classList.add('is-loaded');
  }
  toast.classList.remove('visible');
  toast.hidden = false;
  void toast.offsetWidth;
  requestAnimationFrame(() => toast.classList.add('visible'));
  state.whisperToastTimer = setTimeout(() => hideWhisperToast(), 10_000);
}

async function openWhisperToast() {
  const payload = state.whisperToastPayload;
  if (!payload) return;
  hideWhisperToast({ immediate: true });
  await openPushDestination('whispers', payload.player, payload.accountId);
}

async function fetchJson(path, { transientRetries = 0, signal = null } = {}) {
  const accountIdAtStart = state.activeAccountId;
  const scopedToActiveAccount = path.startsWith('/api/')
    && !path.startsWith('/api/auth/')
    && !path.startsWith('/api/accounts');
  let attempt = 0;
  while (true) {
    try {
      let requestPath = path;
      if (state.activeAccountId && path.startsWith('/api/') && !path.startsWith('/api/auth/') && !path.startsWith('/api/accounts')) {
        const requestUrl = new URL(path, window.location.origin);
        requestUrl.searchParams.set('accountId', state.activeAccountId);
        requestPath = `${requestUrl.pathname}${requestUrl.search}`;
      }
      const response = await fetch(requestPath, { cache: 'no-store', credentials: 'same-origin', signal: signal || state.accountAbortController?.signal });
      const payload = await response.json().catch(() => ({}));
      if (scopedToActiveAccount && accountIdAtStart !== state.activeAccountId) {
        const staleError = new Error('The active Minecraft account changed while loading data.');
        staleError.name = 'AbortError';
        throw staleError;
      }
      if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/api/auth/')) {
          showAuthScreen('Please sign in to continue.');
        }
        const error = new Error(payload.error || `HTTP ${response.status}`);
        error.status = response.status;
        const retryAfterSeconds = Number.parseInt(response.headers.get('Retry-After'), 10);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          error.retryAfterSeconds = retryAfterSeconds;
        }
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const isTransient = error?.status == null || [502, 503, 504].includes(error.status);
      if (!isTransient || attempt >= transientRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 350 * (2 ** attempt)));
      attempt += 1;
    }
  }
}

function accountHeadUrl(username, uuid = null) {
  return playerHeadUrl(username, 64, { uuid });
}

function accountStatusClass(account) {
  const connected = account.status === 'connected' && account.statusPayload?.connected === true;
  if (connected && account.task === 'obsidian') return 'mining';
  if (connected) return 'online';
  if (['connecting','authorizing'].includes(account.status)) return 'connecting';
  if (account.status === 'error') return 'error';
  return 'offline';
}

function randomUniqueAccountColor() {
  const used = new Set(state.accounts.map(account => String(account.color || '').toLowerCase()));
  const previous = String(state.lastSuggestedAccountColor || '').toLowerCase();
  const candidates = ACCOUNT_COLOR_PALETTE.filter(color => !used.has(color) && color !== previous);
  let color = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : null;

  for (let attempt = 0; !color && attempt < 128; attempt += 1) {
    const value = Math.floor(Math.random() * 0x1000000);
    const candidate = `#${value.toString(16).padStart(6, '0')}`;
    if (!used.has(candidate) && candidate !== previous) color = candidate;
  }
  for (let index = 0; !color && index < 0xffffff; index += 1) {
    const value = (0x4b91e5 + index * 0x9e3779) & 0xffffff;
    const candidate = `#${value.toString(16).padStart(6, '0')}`;
    if (!used.has(candidate) && candidate !== previous) color = candidate;
  }
  color ||= ACCOUNT_COLOR_PALETTE.find(candidate => candidate !== previous) || '#f1c232';
  state.lastSuggestedAccountColor = color;
  return color;
}

function applyAccountTabScope(account) {
  const restricted = Boolean(account && !account.isDefault);
  const allowed = new Set(['chat','bot','kill-aura','obsidian','area-explorer','admin']);
  $$('.tab-button[data-tab]').forEach(button => button.classList.toggle('account-tab-restricted',restricted && !allowed.has(button.dataset.tab)));
  // Role and the user's Navigation choices decide which tabs are shown.
  applyNavigationVisibility();
  $$('[data-primary-only]').forEach(element => { element.hidden = restricted; });
  const whisperPanel = $('#whisperPanel');
  if (restricted) setWhisperOpen(false);
  if (whisperPanel) {
    whisperPanel.classList.toggle('account-scope-hidden', restricted);
    whisperPanel.setAttribute('aria-hidden', String(restricted));
    whisperPanel.inert = restricted;
    const whisperToggle = $('#whisperToggle');
    if (whisperToggle) whisperToggle.disabled = restricted;
  }
  document.body.classList.toggle('secondary-account-active', restricted);
  updateObsidianStatsScopeVisibility();
  updateObsidianFarmControlsVisibility();
  if (restricted && !allowed.has(state.activeTab)) setActiveTab('chat');
}

function renderAccountSwitcher() {
  const list = $('#accountSwitcherList');
  if (!list) return;
  const canSwitch = state.currentUser?.role === 'admin';
  const switcher = $('#accountSwitcher');
  if (switcher) switcher.hidden = !canSwitch;
  document.body.classList.toggle('account-switching-disabled',!canSwitch);
  const accountButtons = state.accounts.map(account => {
    const active = account.id === state.activeAccountId;
    const uptime = account.startedAt ? formatDurationMs(Math.max(0, Date.now() - new Date(account.startedAt).getTime())) : 'not running';
    const roleLabel = account.role === 'pearl_loader' ? 'Pearl Loader' : 'General bot';
    const tooltip = `${account.username} · ${roleLabel} · ${account.status} · ${account.host}:${account.port} · ${account.task || 'idle'} · ${uptime}`;
    const avatarUsername = account.statusPayload?.username || account.username;
    const pinned = Boolean(account.isDefault);
    const orderHint = pinned ? 'Primary account is pinned first' : 'Drag to reorder; open menu for Move left/right';
    return `<button class="account-avatar${active ? ' active' : ''}${pinned ? ' account-avatar-pinned' : ' account-avatar-reorderable'}" type="button" role="listitem" data-account-id="${escapeHtml(account.id)}" data-account-primary="${pinned}" draggable="${!pinned}" data-initial="${escapeHtml(String(account.displayName || avatarUsername || '?').charAt(0))}" style="--account-color:${escapeHtml(account.color || '#f1c232')}" aria-label="Switch to ${escapeHtml(account.displayName)}" aria-pressed="${active}" title="${escapeHtml(`${tooltip} · ${orderHint}`)}"><img src="${accountHeadUrl(avatarUsername)}" draggable="false" data-account-avatar-username="${escapeHtml(avatarUsername)}" alt=""><span class="account-status-dot ${accountStatusClass(account)}" aria-hidden="true"></span></button>`;
  }).join('');
  const addButton = state.currentUser?.role === 'admin'
    ? '<button id="accountAddButton" class="account-avatar account-add admin-only" type="button" aria-label="Add Minecraft account">+</button>'
    : '';
  list.innerHTML = accountButtons + addButton;
  const current = state.accounts.find(account => account.id === state.activeAccountId);
  applyAccountTabScope(current);
}

async function loadAccounts() {
  const payload = await fetchJson('/api/accounts', { signal: null });
  state.accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const canSwitch = state.currentUser?.role === 'admin';
  const saved = canSwitch ? localStorage.getItem('wm-active-account') : null;
  const defaultAccount = state.accounts.find(account => account.isDefault) || state.accounts[0];
  state.activeAccountId = canSwitch && state.accounts.some(account => account.id === saved) ? saved : defaultAccount?.id || null;
  if (state.activeAccountId) localStorage.setItem('wm-active-account', state.activeAccountId);
  renderAccountSwitcher();
  state.accountsRefreshedAt = Date.now();
  const active = state.accounts.find(account => account.id === state.activeAccountId);
  if (active?.statusPayload?.authState === 'waiting' && active.statusPayload.deviceCode) {
    setBanner(`Authorize ${active.displayName}: open ${active.statusPayload.verificationUri || 'https://microsoft.com/link'} and enter code ${active.statusPayload.deviceCode}.`);
  }
}

async function selectAccount(accountId) {
  if (accountId === state.activeAccountId || !state.accounts.some(account => account.id === accountId)) return;
  if (state.inventoryMovePending) {
    setInventoryMoveHint('Wait for the current inventory move to finish.');
    return;
  }
  clearInventoryMoveSelection();
  const switchGeneration = ++state.accountSwitchGeneration;
  state.accountAbortController?.abort();
  state.accountAbortController = new AbortController();
  if (state.realtimeRefreshTimers.whisper) clearTimeout(state.realtimeRefreshTimers.whisper);
  delete state.realtimeRefreshTimers.whisper;
  state.activeAccountId = accountId;
  hideFarmLaunchFailureToast({ immediate: true });
  hideAdminDataToast({ immediate: true });
  hideWhisperToast({ immediate: true });
  localStorage.setItem('wm-active-account', accountId);
  state.renderSignatures = {};
  state.adminControlState = null;
  state.adminControlRefreshedAt = 0;
  state.adminControlToken = null;
  state.adminControlLoading = false;
  state.killAuraData = null;
  state.killAuraSelectedMobs = new Set();
  state.killAuraTargetsDirty = false;
  resetKillAuraRangeEditor();
  state.obsidianCoordinateEditorOpen = false;
  ['killAuraKillsChart', 'obsidianDailyChart', 'tpsHourlyChart'].forEach(chartId => setChartLoading(chartId, true));
  if (!state.chatContextMessageId && !state.chatSearchQuery) setChartLoading('chatHourlyChart', true);
  closeWhisperDialog();
  state.whisperPlayers = [];
  state.whisperMessagesSignature = '';
  loadWhisperLastSeenId();
  renderAccountSwitcher();
  setBanner(`Loading ${state.accounts.find(account => account.id === accountId)?.displayName || 'account'}…`);
  try {
    const loaded = await loadAll({ force:true, switchGeneration });
    if (loaded && switchGeneration === state.accountSwitchGeneration && accountId === state.activeAccountId) setBanner('');
  } catch (error) {
    if (error.name !== 'AbortError' && switchGeneration === state.accountSwitchGeneration) setBanner(error.message);
  }
}

function setAccountModalOpen(open, account = null) {
  const overlay = $('#accountModal');
  if (!overlay) return;
  const form = $('#accountForm');
  if (open && form) {
    state.editingAccountId = account?.id || null;
    form.reset();
    form.elements.displayName.value = account?.displayName || '';
    form.elements.username.value = account?.username || '';
    form.elements.authType.value = account?.authType || 'microsoft';
    form.elements.role.value = account?.role || 'general';
    form.elements.host.value = account?.host || '';
    form.elements.port.value = account?.port || '';
    form.elements.minecraftVersion.value = account?.minecraftVersion || '';
    form.elements.color.value = account?.color || randomUniqueAccountColor();
    form.elements.enabled.checked = account ? Boolean(account.enabled) : true;
    $('#accountModalTitle').textContent = account ? 'Edit account' : 'Add account';
    $('#accountModalSubmit').textContent = account ? 'Save changes' : 'Add account';
    $('#accountEnabledText').textContent = account ? 'Account enabled' : 'Enable after adding';
    $('#accountFormError').hidden = true;
  }
  overlay.hidden = !open;
  if (!open) state.editingAccountId = null;
  if (open) $('#accountForm')?.elements.displayName?.focus();
}

async function submitAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('#accountFormError');
  error.hidden = true;
  const data = new FormData(form);
  try {
    const portValue = String(data.get('port') || '').trim();
    const body = { displayName:data.get('displayName'),username:data.get('username'),authType:data.get('authType'),role:data.get('role'),host:data.get('host'),port:portValue ? Number(portValue) : null,minecraftVersion:data.get('minecraftVersion') || null,color:data.get('color') || null,enabled:data.get('enabled') === 'on' };
    const editingId = state.editingAccountId;
    const payload = editingId
      ? await patchJson(`/api/accounts/${editingId}`, body)
      : await postJson('/api/accounts', body);
    form.reset(); setAccountModalOpen(false); await loadAccounts();
    if (!editingId) await selectAccount(payload.account.id);
  } catch (err) { error.textContent=err.message; error.hidden=false; }
}

async function runAccountAction(accountId, action) {
  const account = state.accounts.find(item => item.id === accountId);
  if (!account) return;
  if (action === 'delete') {
    if (!confirm(`Delete ${account.displayName}? Its runtime will stop; statistics and auth-cache will be preserved.`)) return;
    const response = await fetch(`/api/accounts/${accountId}`, {method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrfToken},body:JSON.stringify({confirm:account.displayName})});
    const payload = await response.json().catch(() => ({})); if(!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  } else {
    if (action === 'reauthorize' && !confirm(`Reauthorize ${account.displayName}? Its local auth cache will be cleared and a new Microsoft device code will be requested.`)) return;
    await postJson(`/api/accounts/${accountId}/${action}`, {});
  }
  await loadAccounts();
}

async function persistAccountOrder(orderedSecondaryIds) {
  if (state.accountReorderPending) return;
  const primary = state.accounts.find(account => account.isDefault);
  const byId = new Map(state.accounts.map(account => [account.id, account]));
  const previous = [...state.accounts];
  state.accounts = [primary, ...orderedSecondaryIds.map(id => byId.get(id))].filter(Boolean)
    .map((account, index) => ({ ...account, sortOrder:index }));
  state.accountReorderPending = true;
  renderAccountSwitcher();
  try {
    const payload = await patchJson('/api/accounts/reorder', { accountIds:orderedSecondaryIds });
    state.accounts = Array.isArray(payload.accounts) ? payload.accounts : state.accounts;
    renderAccountSwitcher();
  } catch (error) {
    state.accounts = previous;
    renderAccountSwitcher();
    throw error;
  } finally {
    state.accountReorderPending = false;
  }
}

async function moveAccountInOrder(accountId, direction) {
  const secondaryIds = state.accounts.filter(account => !account.isDefault).map(account => account.id);
  const index = secondaryIds.indexOf(accountId);
  const nextIndex = direction === 'left' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= secondaryIds.length) return;
  [secondaryIds[index], secondaryIds[nextIndex]] = [secondaryIds[nextIndex], secondaryIds[index]];
  await persistAccountOrder(secondaryIds);
}

function openAccountMenu(accountId, anchor) {
  document.querySelector('.account-context-menu')?.remove();
  const account=state.accounts.find(item => item.id === accountId);
  if (!account) return;
  const menu=document.createElement('div'); menu.className='account-context-menu';
  const paused=account.status === 'paused' || account.task === 'paused';
  const running=['connected','connecting','authorizing'].includes(account.status);
  const secondaryAccounts=state.accounts.filter(item => !item.isDefault);
  const secondaryIndex=secondaryAccounts.findIndex(item => item.id === accountId);
  const orderActions=account.isDefault ? [] : [
    ...(secondaryIndex > 0 ? ['move-left'] : []),
    ...(secondaryIndex >= 0 && secondaryIndex < secondaryAccounts.length - 1 ? ['move-right'] : [])
  ];
  const actions=[...orderActions,'edit',...(paused?['resume','stop']:running?['stop','restart']:['start']),'reauthorize',...(account.isDefault?[]:['delete'])];
  const labels={ 'move-left':'Move left', 'move-right':'Move right' };
  for (const action of actions) { const button=document.createElement('button'); button.type='button'; button.dataset.action=action; button.textContent=labels[action] || action[0].toUpperCase()+action.slice(1); menu.append(button); }
  const rect=anchor.getBoundingClientRect(); menu.style.left=`${Math.min(innerWidth-180,rect.left)}px`; menu.style.top=`${rect.bottom+6}px`; document.body.append(menu);
  menu.addEventListener('click', event => { const action=event.target.dataset.action; if (!action) return; if (action === 'edit') setAccountModalOpen(true,state.accounts.find(item => item.id === accountId)); else if (action === 'move-left' || action === 'move-right') moveAccountInOrder(accountId,action.slice(5)).catch(err=>setBanner(err.message)); else runAccountAction(accountId,action).catch(err=>setBanner(err.message)); menu.remove(); });
}

let accountLongPressTimer = null;
let accountLongPressConsumedUntil = 0;
function cancelAccountLongPress() { clearTimeout(accountLongPressTimer); accountLongPressTimer=null; }

function setMobileAccountSwitcherOpen(open) {
  const switcher = $('#accountSwitcher');
  if (!switcher) return;
  if (open) {
    setNavMenuOpen(false);
    clearSeenSearch({ collapse: true });
    setWhisperOpen(false);
  }
  switcher.classList.toggle('expanded',Boolean(open));
  switcher.setAttribute('aria-expanded',String(Boolean(open)));
  document.body.classList.toggle('account-switcher-open',Boolean(open));
  const backdrop = $('#accountSwitcherBackdrop');
  if (backdrop) backdrop.hidden = !open;
}

async function refreshCsrfToken() {
  const response = await fetch('/api/auth/me', {
    cache: 'no-store',
    credentials: 'same-origin'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.authenticated || !payload.csrfToken) {
    throw new Error(payload.error || 'Your session has expired. Please sign in again.');
  }
  state.csrfToken = payload.csrfToken;
}

async function postJson(path, body = {}, retryInvalidCsrf = true) {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (retryInvalidCsrf && response.status === 403 && payload.error === 'Invalid CSRF token.') {
    await refreshCsrfToken();
    return postJson(path, body, false);
  }
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function patchJson(path, body = {}) {
  const response = await fetch(path, {
    method:'PATCH', cache:'no-store', credentials:'same-origin',
    headers:{'Content-Type':'application/json', ...(state.csrfToken ? {'X-CSRF-Token':state.csrfToken} : {})},
    body:JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function ensureInitialChatScroll(attempt = 0) {
  if (state.chatInitialScrollDone || state.activeTab !== 'chat') return;
  const list = $('#chatList');
  if (list && list.clientHeight > 0 && list.childElementCount > 0) {
    scrollToBottom('#chatList');
    state.chatInitialScrollDone = true;
    return;
  }
  if (attempt < 12) setTimeout(() => ensureInitialChatScroll(attempt + 1), 80);
}

async function putJson(path, body = {}) {
  const response = await fetch(path, {
    method: 'PUT', cache: 'no-store', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) }, body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function deleteJson(path) {
  const response = await fetch(path, {
    method: 'DELETE', cache: 'no-store', credentials: 'same-origin',
    headers: state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}
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
  hideAdminDataToast({ immediate: true });
  hideWhisperToast({ immediate: true });
  dismissAppLoader();
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
  dismissAppLoader();
}

function dismissAppLoader() {
  const loader = $('#appLoader');
  if (!loader || loader.hidden || loader.classList.contains('app-loader-leaving')) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    loader.hidden = true;
    return;
  }
  loader.classList.add('app-loader-leaving');
  window.setTimeout(() => {
    loader.hidden = true;
  }, 240);
}

function setAuthMode(mode) {
  state.authMode = ['register', 'bootstrap'].includes(mode) ? mode : 'login';
  const isRegister = state.authMode === 'register';
  const isBootstrap = state.authMode === 'bootstrap';
  $('#authTitle').textContent = isBootstrap ? 'Bootstrap administrator' : isRegister ? 'Create account' : 'Sign in';
  $('#authIntro').textContent = isBootstrap ? 'Use the one-time token configured by the site operator.' : isRegister
    ? 'New accounts wait for admin approval before they can open the dashboard.'
    : 'Enter your approved account credentials to open the dashboard.';
  $('#authSubmit').textContent = isBootstrap ? 'Create administrator' : isRegister ? 'Create account' : 'Sign in';
  $('#authModeToggle').textContent = state.authMode === 'login' ? 'Create a new account' : 'Back to sign in';
  $('#authPassword').setAttribute('autocomplete', isRegister || isBootstrap ? 'new-password' : 'current-password');
  $('#authPassword').minLength = isBootstrap ? 12 : 6;
  if (!(isRegister || isBootstrap)) $('#authPasswordStrength').hidden = true;
  updatePasswordStrength('#authPasswordStrength', $('#authPassword').value);
  $('#authBootstrapTokenField').hidden = !isBootstrap;
  $('#authBootstrapToken').required = isBootstrap;
  $('#authBootstrapToggle').hidden = !state.bootstrapAvailable || isBootstrap;
  $('#authError').hidden = true;
}

function transitionAuthMode(mode) {
  const nextMode = ['register', 'bootstrap'].includes(mode) ? mode : 'login';
  const form = $('#authForm');
  if (!form || nextMode === state.authMode) return;

  window.clearTimeout(form.authModeSwapTimer);
  window.clearTimeout(form.authModeEnterTimer);
  form.authModeTarget = nextMode;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    form.classList.remove('auth-mode-exit', 'auth-mode-enter');
    form.removeAttribute('aria-busy');
    setAuthMode(nextMode);
    form.authModeTarget = null;
    return;
  }

  form.classList.remove('auth-mode-enter');
  void form.offsetWidth;
  form.classList.add('auth-mode-exit');
  form.setAttribute('aria-busy', 'true');
  form.authModeSwapTimer = window.setTimeout(() => {
    setAuthMode(form.authModeTarget);
    form.authModeTarget = null;
    form.classList.remove('auth-mode-exit');
    void form.offsetWidth;
    form.classList.add('auth-mode-enter');
    form.authModeEnterTimer = window.setTimeout(() => {
      form.classList.remove('auth-mode-enter');
      form.removeAttribute('aria-busy');
    }, 380);
  }, 140);
}

function applyCurrentUser(user) {
  const previousUserId = state.currentUser?.id;
  state.currentUser = user || null;
  if (String(previousUserId || '') !== String(state.currentUser?.id || '')) {
    state.navigationPreferences = null;
    state.accountTimezone = 'Europe/Vilnius';
    state.adminControlState = null;
    state.adminControlRefreshedAt = 0;
    state.killAuraData = null;
    state.killAuraSelectedMobs = new Set();
    state.killAuraTargetsDirty = false;
    resetKillAuraRangeEditor();
  }
  if (String(previousUserId || '') !== String(state.currentUser?.id || '')) state.whisperClaimedPlayers = new Set();
  if (!state.currentUser) state.chatInitialScrollDone = false;
  loadWhisperLastSeenId();
  const isAdmin = state.currentUser?.role === 'admin';
  $$('.admin-only').forEach(element => {
    element.hidden = !isAdmin;
  });
  updateObsidianStatsScopeVisibility();
  updateObsidianFarmControlsVisibility();
  applyNavigationOrder();
  applyNavigationVisibility();
  const logoutButton = $('#logoutButton');
  if (logoutButton) logoutButton.hidden = !state.currentUser;
  if (!isAdmin && ['admin', 'notifications', 'child-ai'].includes(state.activeTab)) setActiveTab('chat');
  if (state.currentUser) startRealtimeUpdates();
  else stopRealtimeUpdates();
}

function setNavMenuOpen(open) {
  const menu = $('#navMenu');
  const toggle = $('#navMenuToggle');
  if (!menu || !toggle) return;
  const isOpen = Boolean(open);
  if (isOpen) {
    clearSeenSearch({ collapse: true });
    setWhisperOpen(false);
    setMobileAccountSwitcherOpen(false);
  }
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
  if (!activeButton || !label) return;
  // textContent would also pick up the unread-count badge's digits (e.g. a
  // "5" span inside the button), producing an unstyled "Notifications 5"
  // instead of the plain tab name. Strip badge nodes before reading it.
  const clone = activeButton.cloneNode(true);
  clone.querySelectorAll('.notification-badge').forEach(badge => badge.remove());
  label.textContent = clone.textContent.trim();
}

function navigationVisibilityStorageKey() {
  return `wm-nav-sections:${String(state.currentUser?.id || 'anonymous')}`;
}

function navigationOrderStorageKey() {
  return `wm-nav-order:${String(state.currentUser?.id || 'anonymous')}`;
}

function loadNavigationVisibility() {
  if (state.navigationPreferences) return { ...state.navigationPreferences.visibility };
  try {
    const value = JSON.parse(localStorage.getItem(navigationVisibilityStorageKey()) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function loadNavigationOrder() {
  if (state.navigationPreferences) return [...state.navigationPreferences.order];
  try {
    const saved = JSON.parse(localStorage.getItem(navigationOrderStorageKey()) || '[]');
    const valid = Array.isArray(saved) ? saved.filter((tab, index) => NAV_DEFAULT_ORDER.includes(tab) && saved.indexOf(tab) === index) : [];
    return [...valid, ...NAV_DEFAULT_ORDER.filter(tab => !valid.includes(tab))];
  } catch {
    return [...NAV_DEFAULT_ORDER];
  }
}

function cacheNavigationPreferences(visibility, order) {
  const safeVisibility = visibility && typeof visibility === 'object' && !Array.isArray(visibility) ? { ...visibility } : {};
  const requestedOrder = Array.isArray(order) ? order : [];
  const safeOrder = requestedOrder.filter((tab, index) => NAV_DEFAULT_ORDER.includes(tab) && requestedOrder.indexOf(tab) === index);
  for (const tab of NAV_DEFAULT_ORDER) if (!safeOrder.includes(tab)) safeOrder.push(tab);
  state.navigationPreferences = { visibility: safeVisibility, order: safeOrder };
  localStorage.setItem(navigationVisibilityStorageKey(), JSON.stringify(safeVisibility));
  localStorage.setItem(navigationOrderStorageKey(), JSON.stringify(safeOrder));
}

async function loadNavigationSettings({ migrateLocal = false } = {}) {
  if (!state.currentUser) return;
  if (state.navigationSettingsLoading) return state.navigationSettingsLoading;
  state.navigationSettingsLoading = (async () => {
    // Let queued saves land first, and drop a response that predates a local
    // change: otherwise the echo of an earlier save re-shows a section that
    // was just unchecked. The newer save's own update event reloads again.
    await state.navigationSavePromise;
    const revision = state.navigationRevision;
    const localVisibility = loadNavigationVisibility();
    const localOrder = loadNavigationOrder();
    let payload = await fetchJson('/api/settings/navigation');
    const hasLocalSettings = localStorage.getItem(navigationVisibilityStorageKey()) !== null || localStorage.getItem(navigationOrderStorageKey()) !== null;
    if (migrateLocal && !payload.exists && hasLocalSettings) {
      payload = await putJson('/api/settings/navigation', { visibility: localVisibility, order: localOrder });
    }
    if (revision !== state.navigationRevision) return;
    cacheNavigationPreferences(payload.visibility, payload.order);
    applyNavigationOrder();
    applyNavigationVisibility();
    if (state.activeTab === 'settings') renderNavigationSettings();
  })().catch(err => {
    setBanner(`Could not synchronize navigation settings: ${err.message}`);
  }).finally(() => {
    state.navigationSettingsLoading = null;
  });
  return state.navigationSettingsLoading;
}

function queueNavigationSettingsSave() {
  if (!state.currentUser || !state.navigationPreferences) return;
  state.navigationRevision += 1;
  const snapshot = {
    visibility: { ...state.navigationPreferences.visibility },
    order: [...state.navigationPreferences.order]
  };
  state.navigationSavePromise = state.navigationSavePromise.catch(() => {}).then(async () => {
    await putJson('/api/settings/navigation', snapshot);
  }).catch(err => {
    setBanner(`Could not save navigation settings: ${err.message}`);
  });
}

function applyNavigationOrder() {
  const panel = $('#navMenuPanel');
  if (!panel) return;
  const buttons = new Map($$('.tab-button[data-tab]').map(button => [button.dataset.tab, button]));
  loadNavigationOrder().forEach(tab => {
    const button = buttons.get(tab);
    if (button) panel.append(button);
  });
  const requestsLink = panel.querySelector('.requests-nav-link');
  const adminButton = panel.querySelector('.tab-button[data-tab="admin"]');
  if (requestsLink) panel.insertBefore(requestsLink, adminButton || null);
}

function navigationTabAllowed(button) {
  return Boolean(button) && (!button.classList.contains('admin-only') || state.currentUser?.role === 'admin');
}

function applyNavigationVisibility() {
  const preferences = loadNavigationVisibility();
  const isAdmin = state.currentUser?.role === 'admin';
  $$('.tab-button[data-tab]').forEach(button => {
    const tab = button.dataset.tab;
    if (tab === 'settings') {
      button.hidden = false;
      return;
    }
    const roleAllowsTab = !button.classList.contains('admin-only') || isAdmin;
    button.hidden = !roleAllowsTab || preferences[tab] === false;
  });
  ensureActiveTabAvailable();
}

function ensureActiveTabAvailable() {
  const activeButton = $(`.tab-button[data-tab="${state.activeTab}"]`);
  if (activeButton && !activeButton.hidden && !activeButton.classList.contains('account-tab-restricted')) return;
  const fallback = $$('.tab-button[data-tab]').find(button =>
    !button.hidden && !button.classList.contains('account-tab-restricted')
  );
  if (fallback) setActiveTab(fallback.dataset.tab);
}

function renderNavigationSettings() {
  const container = $('#navSectionsList');
  if (!container) return;
  const preferences = loadNavigationVisibility();
  const buttons = new Map($$('.tab-button[data-tab]').map(button => [button.dataset.tab, button]));
  const availableTabs = loadNavigationOrder().map(tab => buttons.get(tab)).filter(navigationTabAllowed);
  container.innerHTML = availableTabs.map((button, index) => {
    const tab = button.dataset.tab;
    const [title, description] = NAV_SECTION_INFO[tab] || [button.textContent.trim(), 'Dashboard section'];
    const isSettings = tab === 'settings';
    return `<div class="nav-section-toggle" data-nav-section-row="${escapeHtml(tab)}">
      <label class="nav-section-identity">
        <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
        <input type="checkbox" data-nav-section="${escapeHtml(tab)}" ${isSettings || preferences[tab] !== false ? 'checked' : ''} ${isSettings ? 'disabled' : ''}>
      </label>
      <div class="nav-order-actions" aria-label="Change ${escapeHtml(title)} position">
        <button class="ghost-button" type="button" data-nav-move="up" data-nav-tab="${escapeHtml(tab)}" aria-label="Move ${escapeHtml(title)} up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="ghost-button" type="button" data-nav-move="down" data-nav-tab="${escapeHtml(tab)}" aria-label="Move ${escapeHtml(title)} down" ${index === availableTabs.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>`;
  }).join('');
}

function saveNavigationVisibility(event) {
  const input = event.target.closest('[data-nav-section]');
  if (!input) return;
  const preferences = loadNavigationVisibility();
  preferences[input.dataset.navSection] = input.checked;
  cacheNavigationPreferences(preferences, loadNavigationOrder());
  applyNavigationVisibility();
  queueNavigationSettingsSave();
}

function moveNavigationSection(event) {
  const button = event.target.closest('[data-nav-move][data-nav-tab]');
  if (!button) return;
  const order = loadNavigationOrder();
  const navButtons = new Map($$('.tab-button[data-tab]').map(item => [item.dataset.tab, item]));
  const available = order.filter(tab => navigationTabAllowed(navButtons.get(tab)));
  const index = available.indexOf(button.dataset.navTab);
  const targetIndex = button.dataset.navMove === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= available.length) return;
  [available[index], available[targetIndex]] = [available[targetIndex], available[index]];
  let availableIndex = 0;
  const nextOrder = order.map(tab => navigationTabAllowed(navButtons.get(tab)) ? available[availableIndex++] : tab);
  cacheNavigationPreferences(loadNavigationVisibility(), nextOrder);
  applyNavigationOrder();
  applyNavigationVisibility();
  renderNavigationSettings();
  queueNavigationSettingsSave();
}

function resetNavigationVisibility() {
  localStorage.removeItem(navigationVisibilityStorageKey());
  localStorage.removeItem(navigationOrderStorageKey());
  cacheNavigationPreferences({}, NAV_DEFAULT_ORDER);
  applyNavigationOrder();
  applyNavigationVisibility();
  renderNavigationSettings();
  queueNavigationSettingsSave();
  setBanner('Navigation sections restored.');
}

function setSettingsView(view) {
  const nextView = ['navigation', 'account'].includes(view) ? view : 'push';
  $$('.settings-tab[data-settings-view]').forEach(button => {
    const active = button.dataset.settingsView === nextView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('[data-settings-panel]').forEach(panel => {
    panel.hidden = panel.dataset.settingsPanel !== nextView;
  });
  if (nextView === 'navigation') {
    renderNavigationSettings();
    loadNavigationSettings();
  }
  else if (nextView === 'account') {
    populateTimezoneInput($('#accountTimezone'), state.accountTimezone);
    loadAccountSettings();
  }
  else loadPushSettings();
}

function getStoredTab() {
  const storedTab = localStorage.getItem('wm-active-tab');
  const storedButton = $$('.tab-button[data-tab]').find(button => button.dataset.tab === storedTab);
  if (storedButton && !storedButton.hidden) return storedTab;
  return $('.tab-button[data-tab]:not([hidden])')?.dataset.tab || 'settings';
}

function restoreActiveTab() {
  const tab = getStoredTab();
  setActiveTab(['admin', 'notifications', 'child-ai'].includes(tab) && state.currentUser?.role !== 'admin' ? 'chat' : tab);
}

async function handleLogout() {
  try {
    await postJson('/api/auth/logout');
  } catch {
    // The local session state should still be cleared if the network request fails.
  }
  applyCurrentUser(null);
  state.csrfToken = null;
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
    const body = { username, password };
    if (state.authMode === 'bootstrap') body.token = $('#authBootstrapToken').value;
    const payload = await postJson(`/api/auth/${state.authMode}`, body);
    if (payload.pendingApproval) {
      setAuthMode('login');
      showAuthScreen(payload.message || 'Registration received. Wait for admin approval.');
      return;
    }
    state.csrfToken = payload.csrfToken || null;
    applyCurrentUser(payload.user);
    hideAuthScreen();
    await Promise.all([
      loadNavigationSettings({ migrateLocal: true }),
      loadTimezones(),
      loadAccountSettings(),
      loadAccounts()
    ]);
    restoreActiveTab();
    openPushDestination();
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
    state.bootstrapAvailable = Boolean(payload.bootstrapAvailable);
    state.csrfToken = payload.csrfToken || null;
    $('#authBootstrapToggle').hidden = !state.bootstrapAvailable;
    if (payload.authenticated) {
      applyCurrentUser(payload.user);
      hideAuthScreen();
      await Promise.all([
        loadNavigationSettings({ migrateLocal: true }),
        loadTimezones(),
        loadAccountSettings(),
        loadAccounts()
      ]);
      restoreActiveTab();
      openPushDestination();
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
  if (tab !== 'kill-aura' && $('#killAuraTargetModal')?.classList.contains('is-open')) {
    setKillAuraTargetModalOpen(false, { restoreSelection: true, restoreFocus: false });
  }
  if (['admin', 'notifications', 'child-ai'].includes(tab) && state.currentUser?.role !== 'admin') return;
  const requestedButton = $(`.tab-button[data-tab="${tab}"]`);
  if (!requestedButton || requestedButton.hidden || requestedButton.classList.contains('account-tab-restricted')) {
    const fallback = $$('.tab-button[data-tab]').find(button =>
      !button.hidden && !button.classList.contains('account-tab-restricted')
    );
    if (!fallback) return;
    tab = fallback.dataset.tab;
  }
  state.activeTab = tab;
  updateObsidianStatsScopeVisibility();
  localStorage.setItem('wm-active-tab', tab);
  $$('.tab-button').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
  releaseInactiveChartCanvases();
  updateNavLabel(tab);
  setNavMenuOpen(false);
  if (tab === 'admin') {
    loadAdminUsers();
    loadAdminPlayers();
    loadAdminPlayerInfoCollection({ force: true });
    loadAdminControlState();
    loadAdminSystemLogs();
  }
  if (tab === 'notifications') loadNotifications();
  if (tab === 'settings') {
    renderNavigationSettings();
    if ($('.settings-tab.active')?.dataset.settingsView !== 'navigation') loadPushSettings();
  }
  if (tab === 'child-ai') loadChildAiAdmin();
  if (tab === 'kill-aura') loadKillAura();
  if (tab === 'area-explorer') loadAreaExplorer().catch(error => setBanner(`Could not load Area Explorer: ${error.message}`));
  if (tab === 'chat') ensureInitialChatScroll();
  if (tab === 'players') {
    resetPlaytimeLeaderboardScroll($('#playtimeLeaderboard'), state.playtimeLeaderboardScope);
    loadPlayerStats().catch(error => setBanner(`Could not load player statistics: ${error.message}`));
  }
  requestAnimationFrame(updateCarousels);
  const tabChartId = Object.keys(CHART_TAB_BY_ID).find(id => CHART_TAB_BY_ID[id] === tab);
  if (tabChartId && !state.chartGrownOnce.has(tabChartId)) {
    state.chartGrownOnce.add(tabChartId);
    animateChartGrowth(tabChartId);
  } else {
    redrawCharts();
  }
  watchPanelSkeletons($(`.tab-panel[data-panel="${tab}"]`));
}

let panelSkeletonObserver = null;

// Stat/detail values render "-" until their data request resolves. Rather
// than instrumenting every tab's separate load function, watch the active
// panel for its placeholder text disappearing and shimmer it meanwhile.
function scanPanelSkeletons(panel) {
  panel.querySelectorAll('.stat strong, .detail-list strong').forEach(el => {
    el.classList.toggle('is-loading-value', el.textContent.trim() === '-');
  });
}

function watchPanelSkeletons(panel) {
  panelSkeletonObserver?.disconnect();
  if (!panel) return;
  scanPanelSkeletons(panel);
  panelSkeletonObserver = new MutationObserver(() => scanPanelSkeletons(panel));
  panelSkeletonObserver.observe(panel, { subtree: true, childList: true, characterData: true });
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

function annotationKind(annotation = {}) {
  const eventType = String(annotation.eventType || '').toLowerCase();
  const title = String(annotation.title || '').trim().toLowerCase();
  if (eventType === 'bot_reconnected') return 'connected';
  if (eventType === 'bot_disconnected') return 'disconnected';
  if (eventType === 'farm_resumed' || eventType === 'resume') return 'resumed';
  if (eventType === 'farm_stalled') return 'stalled';
  if (eventType === 'pause') return 'paused';
  if (eventType === 'pickaxe_changed') return 'pickaxe';
  if (eventType === 'player_detected') return 'player';
  if (eventType === 'settings_changed' && title === 'analytics settings changed') return 'analytics-settings';
  if (eventType === 'settings_changed' && title === 'production goal deleted') return 'goal-deleted';
  if (eventType === 'settings_changed' && title === 'production goal changed') return 'goal-changed';
  if (eventType === 'settings_changed' && title === 'production goal state changed') return 'goal-state';
  if (eventType === 'settings_changed') return 'settings';
  if (eventType === 'goal_reached') return 'goal';
  return 'default';
}

function annotationColor(annotation) {
  return getCssColor(`--annotation-${annotationKind(annotation)}`) || getCssColor('--annotation-default');
}

function clusteredChartAnnotations(annotations, chartData, paddingLeft, chartWidth) {
  const times = chartData.map(item => new Date(item.bucket || item.label).getTime());
  if (!times.length || times.some(time => !Number.isFinite(time))) return [];
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter(interval => interval > 0).sort((a, b) => a - b);
  const interval = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 60 * 60_000;
  const rangeStart = times[0];
  const rangeEnd = times[times.length - 1] + interval;
  if (!(rangeEnd > rangeStart)) return [];

  const markers = (annotations || []).map(annotation => ({ annotation, at: new Date(annotation.occurredAt).getTime() }))
    .filter(marker => Number.isFinite(marker.at) && marker.at >= rangeStart && marker.at < rangeEnd)
    .map(marker => ({
      ...marker,
      x: paddingLeft + ((marker.at - rangeStart) / (rangeEnd - rangeStart)) * chartWidth
    }))
    .sort((first, second) => first.at - second.at);

  const clusters = new Map();
  const individualMarkers = [];
  const showEveryOccurrence = new Set(['pickaxe', 'paused', 'resumed']);
  for (const marker of markers) {
    const kind = annotationKind(marker.annotation);
    if (showEveryOccurrence.has(kind)) {
      individualMarkers.push({ x: marker.x, at: marker.at, annotation: marker.annotation, items: [marker] });
      continue;
    }
    const key = `${kind}:${String(marker.annotation.title || '').trim().toLowerCase()}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.items.push(marker);
      // Markers are chronological: always move the grouped line to the latest occurrence.
      existing.x = marker.x;
      existing.at = marker.at;
      existing.annotation = marker.annotation;
    } else {
      clusters.set(key, { x: marker.x, at: marker.at, annotation: marker.annotation, items: [marker] });
    }
  }
  return [...clusters.values(), ...individualMarkers].sort((first, second) => first.at - second.at);
}

function compactRecentAnnotations(annotations, { limit = 10, groupWindowMs = 6 * 60 * 60_000 } = {}) {
  const sorted = [...(annotations || [])]
    .filter(annotation => Number.isFinite(new Date(annotation.occurredAt).getTime()))
    .sort((first, second) => new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime());
  const clusters = [];
  for (const annotation of sorted) {
    const occurredAt = new Date(annotation.occurredAt).getTime();
    const key = `${annotationKind(annotation)}:${String(annotation.title || '').trim().toLowerCase()}`;
    const existing = clusters.find(cluster => cluster.key === key && cluster.oldestAt - occurredAt < groupWindowMs);
    if (existing) {
      existing.count += 1;
      existing.oldestAt = occurredAt;
      continue;
    }
    clusters.push({ key, annotation, newestAt: occurredAt, oldestAt: occurredAt, count: 1 });
    if (clusters.length >= limit && sorted.length > 100) break;
  }
  return clusters.sort((first, second) => second.newestAt - first.newestAt).slice(0, limit);
}

function prepareChartCanvas(canvas, data, options = {}) {
  const viewport = canvas.closest('.chart-scroll');
  const mobile = window.matchMedia?.('(max-width: 700px)').matches;
  // Retina iPhones can report a DPR of 3. A long chart rendered at that ratio
  // can consume tens of megabytes in a single canvas backing store. Text and
  // lines stay crisp at 1.5x on a phone while keeping the bitmap comfortably
  // below WebKit's practical GPU-memory limits.
  const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  const pointWidth = options.pointWidth || 44;
  const minWidth = viewport ? viewport.clientWidth : canvas.getBoundingClientRect().width;
  // Long-lived series can contain many thousands of hourly points. Keep the
  // backing bitmap below common browser/GPU canvas limits while retaining the
  // complete dataset and horizontal navigation through its history.
  const maxBackingWidth = mobile ? 8_192 : 12_288;
  const safeCanvasWidth = Math.max(2_048, Math.floor(maxBackingWidth / ratio));
  const zoom = Number(options.zoom);
  const maxZoom = Number(options.maxZoom);
  // Reserve backing-store headroom for zooming in. Without a zoom-aware cap,
  // a long hourly series reaches safeCanvasWidth at every zoom level, making
  // zoom out appear to do nothing.
  const canvasWidthLimit = Number.isFinite(zoom) && zoom > 0 && Number.isFinite(maxZoom) && maxZoom >= zoom
    ? Math.max(320, Math.floor(safeCanvasWidth * zoom / maxZoom))
    : safeCanvasWidth;
  const requestedWidth = options.fitWidth
    ? (minWidth || 320)
    : (Array.isArray(data) ? data.length : 0) * pointWidth + 92;
  const cssWidth = Math.max(minWidth || 320, Math.min(canvasWidthLimit, requestedWidth));
  const cssHeight = Math.max(1, Math.floor(canvas.getBoundingClientRect().height || canvas.height || 260));
  const pixelWidth = Math.floor(cssWidth * ratio);
  const pixelHeight = Math.floor(cssHeight * ratio);
  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const hasData = Array.isArray(data) && data.length > 0;
  if (hasData && viewport && viewport.clientWidth > 0 && !state.chartScrollInitialized[canvas.id]) {
    viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    state.chartScrollInitialized[canvas.id] = true;
  }
  return { ctx, width: cssWidth, height: cssHeight };
}

function animateChart(chartId, duration = 220) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  state.chartAnimations[chartId]?.cancel?.();
  animateChartGrowth(chartId);
  const surface = canvas.closest('.chart-scroll') || canvas;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof surface.animate !== 'function') {
    delete state.chartAnimations[chartId];
    return;
  }

  const animation = surface.animate(
    [
      { opacity: 0.48, transform: 'translateY(3px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ],
    { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
  state.chartAnimations[chartId] = animation;
  animation.finished.catch(() => {}).finally(() => {
    if (state.chartAnimations[chartId] === animation) delete state.chartAnimations[chartId];
  });
}

// Bars grow up from the baseline and lines sweep in left-to-right instead of
// snapping straight to their final shape - see the `growth` reads in
// drawBarChart()/drawLineChart(). Hitboxes always use the final geometry so
// hovering works immediately even mid-animation.
function animateChartGrowth(chartId, duration = 420) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  state.chartGrowthAnimations[chartId]?.cancel?.();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    delete state.chartProgress[chartId];
    drawChartById(chartId);
    return;
  }
  const ease = t => 1 - Math.pow(1 - t, 3);
  const start = performance.now();
  const entry = { cancelled: false };
  const step = now => {
    if (entry.cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    state.chartProgress[chartId] = ease(t);
    drawChartById(chartId);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      delete state.chartProgress[chartId];
      if (state.chartGrowthAnimations[chartId] === entry) delete state.chartGrowthAnimations[chartId];
    }
  };
  entry.cancel = () => { entry.cancelled = true; delete state.chartProgress[chartId]; };
  state.chartGrowthAnimations[chartId] = entry;
  requestAnimationFrame(step);
}

function shortChartLabel(label, index, total) {
  const value = String(label || '').replace(/^\d{4}-/, '');
  const step = total > 48 ? 6 : total > 24 ? 3 : total > 12 ? 2 : 1;
  const lastIndex = total - 1;
  if (index === lastIndex) return value;
  if (index % step !== 0) return '';
  // The final label is always useful, but it can sit only one point after a
  // regular interval label. Suppress that neighbour so both remain readable.
  if (lastIndex - index < step) return '';
  return value;
}

function chartAxisLabelFitsViewport(canvas, ctx, label, x) {
  const viewport = canvas?.closest('.chart-scroll');
  if (!viewport || viewport.clientWidth <= 0) return true;
  const canvasLeft = canvas.offsetLeft || 0;
  const visibleLeft = viewport.scrollLeft - canvasLeft;
  const visibleRight = visibleLeft + viewport.clientWidth;
  const halfWidth = ctx.measureText(label).width / 2;
  const stickyAxisClearance = 64;
  const edgeClearance = 8;
  return x - halfWidth >= visibleLeft + stickyAxisClearance
    && x + halfWidth <= visibleRight - edgeClearance;
}

function drawChartAxisLabels(canvas, ctx, chartData, xForIndex, labelForItem, y) {
  const minimumGap = 8;
  const candidates = chartData.map((item, index) => {
    const label = shortChartLabel(labelForItem(item), index, chartData.length);
    if (!label) return null;
    const x = xForIndex(index);
    if (!chartAxisLabelFitsViewport(canvas, ctx, label, x)) return null;
    const halfWidth = ctx.measureText(label).width / 2;
    return { label, x, left: x - halfWidth, right: x + halfWidth };
  }).filter(Boolean);

  // Select labels from right to left so the newest visible date wins when a
  // narrow mobile viewport cannot fit two neighbouring labels.
  const visibleLabels = [];
  let nextLabelLeft = Infinity;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate.right + minimumGap > nextLabelLeft) continue;
    visibleLabels.push(candidate);
    nextLabelLeft = candidate.left;
  }

  visibleLabels.reverse().forEach(({ label, x }) => ctx.fillText(label, x, y));
}

function drawNoData(ctx, width, height, muted) {
  ctx.fillStyle = muted;
  ctx.font = `13px ${CHART_TICK_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('No chart data', width / 2, height / 2);
}

// Minecraft-style canvas chart primitives: blocky beveled bars, square pixel
// markers and a monospace "terminal" tick font instead of smooth/soft charts.
const CHART_TICK_FONT = 'ui-monospace, "Cascadia Code", "SFMono-Regular", "Courier New", monospace';

function chartColorChannels(colorStr) {
  const value = String(colorStr || '').trim();
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(part => parseFloat(part.trim()));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
  }
  const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const int = parseInt(hexMatch[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }
  return { r: 128, g: 128, b: 128 };
}

function shadeChartColor(colorStr, amount) {
  const { r, g, b } = chartColorChannels(colorStr);
  const mix = amount >= 0
    ? channel => Math.round(channel + (255 - channel) * amount)
    : channel => Math.round(channel * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function drawPixelBlock(ctx, x, y, w, h, baseColor) {
  if (h <= 0 || w <= 0) return;
  const px = Math.round(x);
  const py = Math.round(y);
  const pw = Math.max(1, Math.round(w));
  const ph = Math.max(1, Math.round(h));
  const bevel = Math.max(1, Math.min(4, Math.round(Math.min(pw, ph) * 0.24)));
  ctx.fillStyle = baseColor;
  ctx.fillRect(px, py, pw, ph);
  // Too thin for a bevel and outline: they would cover the whole bar.
  if (pw < 4) return;
  ctx.fillStyle = shadeChartColor(baseColor, 0.3);
  ctx.fillRect(px, py, pw, bevel);
  ctx.fillRect(px, py, bevel, ph);
  ctx.fillStyle = shadeChartColor(baseColor, -0.32);
  ctx.fillRect(px, py + ph - bevel, pw, bevel);
  ctx.fillRect(px + pw - bevel, py, bevel, ph);
  ctx.strokeStyle = shadeChartColor(baseColor, -0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
}

function drawPixelGridLine(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
  ctx.restore();
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

  if (axis.style.height !== `${height}px`) axis.style.height = `${height}px`;
  const chartHeight = height - padding.top - padding.bottom;
  const markup = labels.map((label, index) => {
    const y = padding.top + chartHeight - (chartHeight * index) / Math.max(1, labels.length - 1);
    return `<span style="top:${y}px">${escapeHtml(label)}</span>`;
  }).join('');
  if (axis.dataset.markup !== markup) {
    axis.innerHTML = markup;
    axis.dataset.markup = markup;
  }
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
  const growth = Math.min(1, Math.max(0, options.progress ?? state.chartProgress[canvas.id] ?? 1));
  const padding = { top: 24, right: 52, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const scaleData = Array.isArray(options.scaleData) ? options.scaleData : chartData;
  const values = options.scaleToVisible === false
    ? scaleData.map(item => Number(item.value)).filter(Number.isFinite)
    : visibleChartValues(canvas, chartData, padding, chartWidth, 'bar');
  const maxValue = Math.max(options.max || 0, ...values, 1);
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

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (chartHeight * i) / 4;
    drawPixelGridLine(ctx, padding.left, y, padding.left + chartWidth, y, line);
    ctx.fillStyle = muted;
    ctx.font = `11px ${CHART_TICK_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(Math.round((maxValue * i) / 4)), padding.left - 10, y + 4);
  }

  ctx.strokeStyle = text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.round(padding.left) + 0.5, padding.top);
  ctx.lineTo(Math.round(padding.left) + 0.5, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, Math.round(padding.top + chartHeight) + 0.5);
  ctx.stroke();

  const slotWidth = chartData.length > 0 ? chartWidth / chartData.length : 0;
  // Always leave a visible gap between neighbours: a fixed minimum width made
  // bars overlap once a long series was squeezed into narrow slots.
  const barWidth = chartData.length > 0 ? Math.max(1, Math.min(28, slotWidth * 0.72, slotWidth - 2)) : 0;
  const hitboxes = [];

  chartData.forEach((item, index) => {
    const value = Number(item.value);
    if (!Number.isFinite(value)) return;
    const slotX = padding.left + index * slotWidth;
    const x = slotX + (slotWidth - barWidth) / 2;
    const barHeight = Math.max(1, (value / maxValue) * chartHeight);
    const y = padding.top + chartHeight - barHeight;
    const segments = options.stacked && Array.isArray(item.segments) ? item.segments : [];
    if (segments.length) {
      let segmentBottom = padding.top + chartHeight;
      segments.forEach(segment => {
        const segmentValue = Math.max(0, Number(segment.value) || 0);
        if (!segmentValue) return;
        const segmentHeight = (segmentValue / maxValue) * chartHeight;
        segmentBottom -= segmentHeight;
        const segmentColor = /^#[0-9a-f]{6}$/i.test(String(segment.color || '')) ? segment.color : accent;
        const drawnHeight = Math.max(growth > 0 ? 1 : 0, segmentHeight * growth);
        drawPixelBlock(ctx, x, segmentBottom + segmentHeight - drawnHeight, barWidth, drawnHeight, segmentColor);
      });
    } else {
      const drawnHeight = Math.max(growth > 0 ? 1 : 0, barHeight * growth);
      drawPixelBlock(ctx, x, y + barHeight - drawnHeight, barWidth, drawnHeight, accent);
    }
    hitboxes.push({
      x: slotX,
      y: padding.top,
      width: slotWidth,
      height: chartHeight,
      index,
      highlight: { x, y, width: barWidth, height: barHeight },
      label: item.label,
      value,
      tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatNumber(value)}`
    });
  });
  clusteredChartAnnotations(options.annotations, chartData, padding.left, chartWidth).forEach(cluster => {
    const x = Math.max(padding.left + 3, Math.min(padding.left + chartWidth - 3, cluster.x));
    ctx.save(); ctx.strokeStyle = annotationColor(cluster.annotation); ctx.globalAlpha = 0.82; ctx.lineWidth = cluster.items.length > 1 ? 2.5 : 2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + chartHeight); ctx.stroke(); ctx.restore();
    ctx.save();
    ctx.fillStyle = annotationColor(cluster.annotation);
    const markerSize = cluster.items.length > 1 ? 9 : 7;
    ctx.fillRect(Math.round(x - markerSize / 2), padding.top + 1, markerSize, markerSize);
    ctx.restore();
  });
  state.chartMeta[canvas.id] = { hitboxes };

  ctx.fillStyle = text;
  ctx.font = `11px ${CHART_TICK_FONT}`;
  ctx.textAlign = 'center';
  drawChartAxisLabels(
    canvas,
    ctx,
    chartData,
    index => padding.left + index * slotWidth + slotWidth / 2,
    item => item.label,
    height - 16
  );
}

function drawLineChart(canvas, data, options = {}) {
  if (!canvas) return;
  const sourceData = Array.isArray(data) ? data : [];
  const { ctx, width, height } = prepareChartCanvas(canvas, sourceData, {
    pointWidth: options.pointWidth || 42,
    fitWidth: options.fitWidth
  });

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const growth = Math.min(1, Math.max(0, options.progress ?? state.chartProgress[canvas.id] ?? 1));
  const padding = { top: 24, right: 52, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const chartData = options.fitWidth && options.compact !== false
    ? compactLineSeries(sourceData, Math.max(80, Math.floor(chartWidth / 3)))
    : sourceData;
  const numericValues = visibleChartValues(canvas, chartData, padding, chartWidth, 'line');
  const maxValue = Math.max(options.max || 0, ...numericValues, 1);
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
    drawPixelGridLine(ctx, padding.left, y, padding.left + chartWidth, y, line);
    ctx.fillStyle = muted;
    ctx.font = `11px ${CHART_TICK_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(formatTps((maxValue * i) / 4), padding.left - 10, y + 4);
  }

  ctx.strokeStyle = text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.round(padding.left) + 0.5, padding.top);
  ctx.lineTo(Math.round(padding.left) + 0.5, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, Math.round(padding.top + chartHeight) + 0.5);
  ctx.stroke();

  const sourceNumericValues = sourceData.map(item => Number(item.value)).filter(Number.isFinite);
  const average = sourceNumericValues.reduce((sum, value) => sum + value, 0) / sourceNumericValues.length;
  const averageY = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, average)) / maxValue) * chartHeight;
  ctx.save();
  ctx.strokeStyle = muted;
  ctx.globalAlpha = 0.72;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, Math.round(averageY) + 0.5);
  ctx.lineTo(padding.left + chartWidth, Math.round(averageY) + 0.5);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = muted;
  ctx.font = `10px ${CHART_TICK_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`Avg ${formatTps(average)}`, padding.left + chartWidth - 4, Math.max(padding.top + 11, averageY - 6));

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
        minValue: Number.isFinite(Number(item.minValue)) ? Number(item.minValue) : value,
        maxValue: Number.isFinite(Number(item.maxValue)) ? Number(item.maxValue) : value,
        label: item.label,
        tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatTps(value)}`
      };
    })
    .filter(Boolean);

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top - 6, chartWidth * growth, chartHeight + 12);
  ctx.clip();

  if (points.some(point => point.minValue !== point.maxValue)) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    points.forEach((point, index) => {
      const y = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, point.maxValue)) / maxValue) * chartHeight;
      if (index === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    [...points].reverse().forEach(point => {
      const y = padding.top + chartHeight - (Math.min(maxValue, Math.max(0, point.minValue)) / maxValue) * chartHeight;
      ctx.lineTo(point.x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
      return;
    }
    const prev = points[index - 1];
    const midX = prev.x + (point.x - prev.x) / 2;
    ctx.lineTo(midX, prev.y);
    ctx.lineTo(midX, point.y);
    ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  if (points.length <= Math.max(24, Math.floor(chartWidth / 12))) {
    points.forEach(point => {
      drawPixelBlock(ctx, point.x - 4, point.y - 4, 8, 8, accent);
    });
  }
  ctx.restore();
  const pointSlotWidth = chartWidth / Math.max(1, points.length - 1);
  state.chartMeta[canvas.id] = {
    hitboxes: points.map((point, index) => ({
      x: Math.max(padding.left, point.x - pointSlotWidth / 2),
      y: padding.top,
      width: Math.max(3, Math.min(pointSlotWidth, padding.left + chartWidth - Math.max(padding.left, point.x - pointSlotWidth / 2))),
      height: chartHeight,
      index,
      highlight: {
        x: point.x - Math.max(1.5, Math.min(5, pointSlotWidth / 2)),
        y: padding.top,
        width: Math.max(3, Math.min(10, pointSlotWidth)),
        height: chartHeight
      },
      tooltip: point.tooltip
    }))
  };

  ctx.fillStyle = text;
  ctx.font = `11px ${CHART_TICK_FONT}`;
  ctx.textAlign = 'center';
  drawChartAxisLabels(
    canvas,
    ctx,
    chartData,
    index => padding.left + (chartWidth * index) / Math.max(1, chartData.length - 1),
    item => options.axisLabel ? options.axisLabel(item) : item.label,
    height - 16
  );
}

function chartDateParts(date) {
  const cacheKey = `chart-parts:${state.accountTimezone}`;
  if (!dateTimeFormatters.has(cacheKey)) dateTimeFormatters.set(cacheKey, new Intl.DateTimeFormat('en-US', {
    timeZone: state.accountTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }));
  return Object.fromEntries(dateTimeFormatters.get(cacheKey).formatToParts(date)
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function localizedChartItem(item) {
  const bucket = item?.bucket;
  if (!bucket) return item;
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return item;
  const parts = chartDateParts(date);
  return { ...item, label: `${parts.month}-${parts.day} ${parts.hour}:00` };
}

const AVERAGE_ONLINE_VISIBLE_HOURS = 24;

function virtualChartWindow(canvas, data, visiblePoints) {
  const items = Array.isArray(data) ? data : [];
  const viewport = canvas?.closest('.chart-scroll');
  if (!viewport || viewport.clientWidth <= 0) return items;
  if (items.length <= visiblePoints) {
    disableVirtualChart(canvas);
    return items;
  }

  viewport.classList.add('chart-virtualized');
  let spacer = viewport.querySelector('.chart-virtual-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'chart-virtual-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    viewport.append(spacer);
  }

  const totalWidth = Math.ceil((items.length / visiblePoints) * viewport.clientWidth);
  spacer.style.width = `${totalWidth}px`;
  const maxScroll = Math.max(0, totalWidth - viewport.clientWidth);
  if (!state.chartScrollInitialized[canvas.id]) viewport.scrollLeft = maxScroll;
  const maxStart = items.length - visiblePoints;
  const start = maxScroll > 0
    ? Math.max(0, Math.min(maxStart, Math.round((viewport.scrollLeft / maxScroll) * maxStart)))
    : maxStart;
  return items.slice(start, start + visiblePoints);
}

function disableVirtualChart(canvas) {
  const viewport = canvas?.closest('.chart-scroll');
  if (!viewport) return;
  viewport.classList.remove('chart-virtualized');
  viewport.querySelector('.chart-virtual-spacer')?.remove();
}

function aggregateSeries(data, range, reducer = 'sum') {
  const items = Array.isArray(data) ? data : [];
  if (range === 'hours') return items.map(localizedChartItem);
  const groups = new Map();
  items.forEach(item => {
    const bucketSource = item.bucket || item.label;
    const date = new Date(bucketSource);
    let key = String(item.label || bucketSource || '');
    let label = key;
    if (!Number.isNaN(date.getTime())) {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(bucketSource));
      const parts = dateOnly
        ? { year: String(bucketSource).slice(0, 4), month: String(bucketSource).slice(5, 7), day: String(bucketSource).slice(8, 10) }
        : chartDateParts(date);
      if (range === 'months') {
        key = `${parts.year}-${parts.month}`;
        label = key;
      } else {
        key = `${parts.year}-${parts.month}-${parts.day}`;
        label = `${parts.month}-${parts.day}`;
      }
    } else if (range === 'months') {
      key = String(key).slice(0, 7);
      label = key;
    }
    if (!groups.has(key)) groups.set(key, { label, values: [], weightedValues: [], segments: new Map(), startBucket: null, endBucket: null });
    if (!Number.isNaN(date.getTime())) {
      const timestamp = date.toISOString();
      if (!groups.get(key).startBucket || timestamp < groups.get(key).startBucket) groups.get(key).startBucket = timestamp;
      if (!groups.get(key).endBucket || timestamp > groups.get(key).endBucket) groups.get(key).endBucket = timestamp;
    }
    const value = Number(item.value);
    if (Number.isFinite(value)) {
      groups.get(key).values.push(value);
      const weight = Number(item.weight);
      if (Number.isFinite(weight) && weight > 0) groups.get(key).weightedValues.push({ value, weight });
    }
    if (Array.isArray(item.segments)) {
      item.segments.forEach(segment => {
        const accountId = String(segment.accountId || segment.name || '');
        if (!accountId) return;
        const existing = groups.get(key).segments.get(accountId) || { ...segment, value: 0 };
        existing.value += Number(segment.value) || 0;
        groups.get(key).segments.set(accountId, existing);
      });
    }
  });
  return Array.from(groups.values()).map(group => ({
    label: group.label,
    bucket: group.startBucket,
    startBucket: group.startBucket,
    endBucket: group.endBucket,
    value: reducer === 'avg'
      ? group.weightedValues.length === group.values.length && group.weightedValues.length > 0
        ? group.weightedValues.reduce((sum, item) => sum + item.value * item.weight, 0)
          / group.weightedValues.reduce((sum, item) => sum + item.weight, 0)
        : group.values.reduce((sum, value) => sum + value, 0) / Math.max(1, group.values.length)
      : group.values.reduce((sum, value) => sum + value, 0),
    segments: Array.from(group.segments.values())
  }));
}

function compactLineSeries(data, maxPoints) {
  const items = Array.isArray(data) ? data : [];
  const limit = Math.max(1, Math.floor(maxPoints) || 1);
  const groupSize = Math.max(1, Math.ceil(items.length / limit));
  const compacted = [];

  for (let start = 0; start < items.length; start += groupSize) {
    const group = items.slice(start, start + groupSize);
    const values = group.map(item => Number(item.value)).filter(Number.isFinite);
    if (!values.length) continue;
    const first = group[0];
    const last = group[group.length - 1];
    const middle = group[Math.floor((group.length - 1) / 2)];
    compacted.push({
      ...middle,
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      sampleCount: values.length,
      startBucket: first.startBucket || first.bucket || null,
      endBucket: last.endBucket || last.bucket || null,
      fromLabel: first.label,
      toLabel: last.label
    });
  }
  return compacted;
}

function getTpsHistory(range) {
  const source = Array.isArray(state.charts.tpsHourly) ? state.charts.tpsHourly : [];
  const timezone = state.accountTimezone;
  let cache = state.charts.tpsHistoryCache;
  if (!cache || cache.source !== source || cache.timezone !== timezone) {
    cache = { source, timezone, ranges: {} };
    state.charts.tpsHistoryCache = cache;
  }
  if (!cache.ranges[range]) {
    const rangeSource = range === 'hours' ? source.slice(-168) : source;
    cache.ranges[range] = aggregateSeries(rangeSource, range, 'avg');
  }
  return cache.ranges[range];
}

function tpsSeriesSpan(data) {
  const items = Array.isArray(data) ? data : [];
  const first = items.find(item => item.startBucket || item.bucket);
  const last = [...items].reverse().find(item => item.endBucket || item.bucket);
  const start = new Date(first?.startBucket || first?.bucket || 0);
  const end = new Date(last?.endBucket || last?.bucket || 0);
  return {
    start,
    end,
    milliseconds: Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? 0 : Math.max(0, end - start)
  };
}

function tpsAxisLabel(item, range, spanMilliseconds) {
  const date = new Date(item.bucket || item.startBucket || 0);
  if (Number.isNaN(date.getTime())) return String(item.label || '');
  let options;
  if (range === 'months' || spanMilliseconds >= 366 * 86_400_000) {
    options = { month: 'short', year: '2-digit' };
  } else if (range === 'days' || spanMilliseconds >= 3 * 86_400_000) {
    options = { month: 'short', day: 'numeric' };
  } else {
    options = { hour: '2-digit', minute: '2-digit' };
  }
  const cacheKey = `tps-axis:${range}:${spanMilliseconds >= 366 * 86_400_000 ? 'year' : spanMilliseconds >= 3 * 86_400_000 ? 'day' : 'time'}:${state.accountTimezone}`;
  if (!dateTimeFormatters.has(cacheKey)) {
    dateTimeFormatters.set(cacheKey, new Intl.DateTimeFormat('en-US', { ...options, timeZone: state.accountTimezone }));
  }
  return dateTimeFormatters.get(cacheKey).format(date);
}

function tpsTooltip(item, range) {
  const count = Math.max(1, Number(item.sampleCount) || 1);
  const unit = range === 'months' ? 'monthly' : range === 'days' ? 'daily' : 'hourly';
  const start = item.startBucket || item.bucket;
  const end = item.endBucket || item.bucket;
  if (count === 1 || !start || !end || start === end) {
    return `${start ? formatFullDateTime(start) : item.label}\n${formatTps(item.value)} TPS`;
  }
  return `${formatFullDateTime(start)} – ${formatFullDateTime(end)}\nAverage ${formatTps(item.value)} TPS\nLow ${formatTps(item.minValue)} · High ${formatTps(item.maxValue)}\n${formatNumber(count)} ${unit} averages`;
}

function updateTpsChartCoverage(data, range) {
  const coverage = $('#tpsChartCoverage');
  if (!coverage) return;
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    coverage.textContent = 'No TPS history recorded yet';
    return;
  }
  const span = tpsSeriesSpan(items);
  const unit = range === 'months' ? 'monthly' : range === 'days' ? 'daily' : 'hourly';
  const cacheKey = `tps-coverage:${state.accountTimezone}`;
  if (!dateTimeFormatters.has(cacheKey)) dateTimeFormatters.set(cacheKey, new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: state.accountTimezone
  }));
  const formatter = dateTimeFormatters.get(cacheKey);
  const dates = span.milliseconds > 0
    ? `${formatter.format(span.start)} – ${formatter.format(span.end)}`
    : formatter.format(span.start);
  coverage.textContent = `${formatNumber(items.length)} ${unit} averages · ${dates}`;
}

function obsidianChartTooltip(item) {
  const total = `${item.label}: ${formatNumber(item.value)} blocks`;
  if (!Array.isArray(item.segments)) return total;
  const breakdown = item.segments
    .filter(segment => Number(segment.value) > 0)
    .map(segment => `${segment.name}: ${formatNumber(segment.value)}`);
  return breakdown.length ? `${total}\n${breakdown.join('\n')}` : total;
}

function getChartRange(id) {
  return state.chartRanges[id] || 'hours';
}

const CHART_ZOOM_MIN = 0.5;
const CHART_ZOOM_MAX = 2.5;
const CHART_ZOOM_STEP = 1.25;

function getChartZoom(id) {
  return state.chartZoom[id] || 1;
}

const CHART_TAB_BY_ID = Object.freeze({
  chatHourlyChart: 'chat',
  killAuraKillsChart: 'kill-aura',
  obsidianDailyChart: 'obsidian',
  tpsHourlyChart: 'server',
  averageOnlineChart: 'players'
});

function chartIsActive(chartId) {
  return document.visibilityState !== 'hidden'
    && CHART_TAB_BY_ID[chartId] === state.activeTab
    && document.getElementById(chartId)?.closest('.tab-panel')?.classList.contains('active');
}

function releaseInactiveChartCanvases() {
  Object.entries(CHART_TAB_BY_ID).forEach(([chartId, tab]) => {
    if (tab === state.activeTab) return;
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    // Assigning either dimension releases the old backing bitmap immediately.
    // This prevents hidden tabs from retaining several full Retina canvases.
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '';
    // Shrinking the canvas also clamps its scroll container back to zero.
    // Re-initialize the position when this tab opens again so it shows newest.
    delete state.chartScrollInitialized[chartId];
    delete state.chartMeta[chartId];
    state.chartAnimations[chartId]?.cancel?.();
    delete state.chartAnimations[chartId];
  });
}

// Chart canvases stay hidden behind a bar skeleton until their first series
// for the active account arrives, so an empty axis never flashes as "no data".
function setChartLoading(chartId, loading) {
  const shell = document.getElementById(chartId)?.closest('.chart-scroll');
  if (!shell) return;
  shell.classList.toggle('player-chart-loading', loading);
  if (loading) shell.setAttribute('aria-busy', 'true');
  else shell.removeAttribute('aria-busy');
}

function drawChartById(chartId) {
  if (!chartIsActive(chartId)) return;
  const range = getChartRange(chartId);
  switch (chartId) {
    case 'chatHourlyChart':
      drawBarChart($('#chatHourlyChart'), range === 'hours'
        ? state.charts.chatHourly.map(localizedChartItem)
        : range === 'months'
          ? aggregateSeries(state.charts.chatMonthly, 'months')
          : aggregateSeries(state.charts.chatDaily, 'days'), {
        tooltip: item => `${item.label}: ${formatNumber(item.value)} messages`
      });
      break;
    case 'obsidianDailyChart': {
      const obsidianData = range === 'hours'
        ? state.charts.obsidianHourly.map(localizedChartItem)
        : aggregateSeries(state.charts.obsidianDaily, range);
      drawBarChart($('#obsidianDailyChart'), obsidianData, {
        stacked: state.obsidianStatsScope === 'all',
        tooltip: obsidianChartTooltip,
        annotations: range === 'hours' ? state.charts.obsidianAnnotations || [] : []
      });
      break;
    }
    case 'killAuraKillsChart': {
      const hourlyKills = state.charts.killAuraHourly || [];
      const dailyKills = state.charts.killAuraDaily || [];
      const monthlyKills = state.charts.killAuraMonthly || [];
      const killHistory = range === 'months'
        ? monthlyKills
        : range === 'days'
          ? dailyKills
          : hourlyKills.map(localizedChartItem);
      drawBarChart($('#killAuraKillsChart'), killHistory, {
        tooltip: item => `${item.label}: ${formatNumber(item.value)} ${Number(item.value) === 1 ? 'kill' : 'kills'}`
      });
      break;
    }
    case 'tpsHourlyChart': {
      const tpsHistory = getTpsHistory(range);
      const span = tpsSeriesSpan(tpsHistory);
      updateTpsChartCoverage(tpsHistory, range);
      drawLineChart($('#tpsHourlyChart'), tpsHistory, {
        max: 20,
        fitWidth: range !== 'hours',
        compact: true,
        axisLabel: item => tpsAxisLabel(item, range, span.milliseconds),
        tooltip: item => tpsTooltip(item, range)
      });
      break;
    }
    case 'averageOnlineChart': {
      const zoom = getChartZoom('averageOnlineChart');
      const canvas = $('#averageOnlineChart');
      const completeHistory = state.charts.hourlyAverageOnline;
      const visibleHours = Math.max(1, Math.round(AVERAGE_ONLINE_VISIBLE_HOURS / zoom));
      const history = range === 'hours'
        ? virtualChartWindow(canvas, completeHistory, visibleHours)
        : completeHistory;
      if (range !== 'hours') disableVirtualChart(canvas);
      drawBarChart(canvas, aggregateSeries(history, range, 'avg'), {
        fitWidth: range === 'hours',
        pointWidth: 44 * zoom,
        zoom,
        maxZoom: CHART_ZOOM_MAX,
        // Keep one scale across the whole hourly history. Re-scaling to the
        // visible bars made their heights jump while scrolling or redrawing.
        scaleToVisible: false,
        scaleData: range === 'hours' ? completeHistory : null,
        tooltip: item => `${item.label}: ${formatNumber(Math.round(item.value))} players on average`
      });
      break;
    }
    default:
      break;
  }
  refreshChartHover(chartId);
}

// A redraw (data refresh, grow animation, scroll or zoom) replaces the
// hitboxes under a pointer that has not moved. Re-resolve the tooltip against
// the new geometry so it never describes a bar from an earlier draw.
function refreshChartHover(chartId) {
  const pointer = state.chartPointer;
  const tooltip = $('#chartTooltip');
  if (!pointer || pointer.chartId !== chartId || !tooltip || tooltip.hidden) return;
  const canvas = document.getElementById(chartId);
  if (canvas) showChartTooltip(canvas, pointer, { refresh: true });
}

function redrawCharts() {
  if (state.chartRedrawFrame) cancelAnimationFrame(state.chartRedrawFrame);
  const generation = ++state.chartRedrawGeneration;
  const chartIds = Object.keys(CHART_TAB_BY_ID).filter(chartIsActive);
  if (!chartIds.length || document.visibilityState === 'hidden') {
    state.chartRedrawFrame = null;
    return;
  }
  let index = 0;

  // Canvas resizing and drawing is synchronous. Keep the frame-by-frame queue
  // so this remains safe if a tab gains more than one chart later.
  const drawNext = () => {
    if (generation !== state.chartRedrawGeneration) return;
    drawChartById(chartIds[index]);
    index += 1;
    if (index < chartIds.length) {
      state.chartRedrawFrame = requestAnimationFrame(drawNext);
    } else {
      state.chartRedrawFrame = null;
    }
  };
  state.chartRedrawFrame = requestAnimationFrame(drawNext);
}

function scheduleChartViewportRedraw(target) {
  const viewport = target?.currentTarget || target;
  const chartId = viewport?.querySelector?.('canvas.chart')?.id;
  if (!chartId || !chartIsActive(chartId) || document.visibilityState === 'hidden') return;
  if (state.chartScrollRedrawFrames[chartId]) cancelAnimationFrame(state.chartScrollRedrawFrames[chartId]);
  state.chartScrollRedrawFrames[chartId] = requestAnimationFrame(() => {
    delete state.chartScrollRedrawFrames[chartId];
    drawChartById(chartId);
  });
}

function setChartHoverHighlight(canvas, hit) {
  const viewport = canvas?.closest('.chart-scroll');
  if (!viewport) return;
  let highlight = viewport.querySelector('.chart-hover-highlight');

  if (!hit?.highlight) {
    if (highlight) {
      highlight.hidden = true;
      delete highlight.dataset.geometry;
    }
    return;
  }

  if (!highlight) {
    highlight = document.createElement('div');
    highlight.className = 'chart-hover-highlight';
    viewport.append(highlight);
  }

  const box = hit.highlight;
  const virtualOffset = viewport.classList.contains('chart-virtualized') ? viewport.scrollLeft : 0;
  const geometry = `${virtualOffset}:${hit.index}:${box.x}:${box.y}:${box.width}:${box.height}`;
  if (highlight.dataset.geometry !== geometry) {
    highlight.style.width = `${Math.max(1, box.width)}px`;
    highlight.style.height = `${Math.max(1, box.height)}px`;
    highlight.style.transform = `translate3d(${virtualOffset + canvas.offsetLeft + box.x}px, ${canvas.offsetTop + box.y}px, 0)`;
    highlight.dataset.geometry = geometry;
  }
  highlight.hidden = false;
}

function showChartTooltip(canvas, event, { pin = false, refresh = false } = {}) {
  const tooltip = $('#chartTooltip');
  const meta = state.chartMeta[canvas.id];
  if (!tooltip || !meta) return;
  state.chartPointer = {
    chartId: canvas.id,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType
  };

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
  }
  setChartHoverHighlight(canvas, hit);

  if (!hit) {
    canvas.style.cursor = '';
    if (!state.chartTooltipPinned || refresh) hideChartTooltip();
    return;
  }

  canvas.style.cursor = Number.isInteger(hit.index) ? 'pointer' : '';
  const tooltipChanged = tooltip.textContent !== hit.tooltip;
  if (tooltipChanged) tooltip.textContent = hit.tooltip;
  tooltip.hidden = false;
  const isTouch = event.pointerType === 'touch';
  if (!refresh) {
    clearTimeout(state.chartTooltipTimer);
    state.chartTooltipPinned = Boolean(pin || isTouch);
  }
  let tooltipWidth = Number(tooltip.dataset.measuredWidth);
  if (tooltipChanged || !Number.isFinite(tooltipWidth)) {
    tooltipWidth = Math.max(160, tooltip.offsetWidth || 0);
    tooltip.dataset.measuredWidth = String(tooltipWidth);
  }
  let tooltipHeight = Number(tooltip.dataset.measuredHeight);
  if (tooltipChanged || !Number.isFinite(tooltipHeight)) {
    tooltipHeight = Math.max(30, tooltip.offsetHeight || 0);
    tooltip.dataset.measuredHeight = String(tooltipHeight);
  }
  let left;
  let top;
  if (isTouch) {
    // A finger covers the point it touches (and everything just below/right
    // of it), unlike a mouse cursor. Center the tooltip over the touch and
    // put it above the fingertip; only drop it below when there isn't room.
    left = event.clientX - tooltipWidth / 2;
    const fingerClearance = 36;
    top = event.clientY - tooltipHeight - fingerClearance;
    if (top < 10) top = event.clientY + fingerClearance;
  } else {
    left = event.clientX + 12;
    top = event.clientY + 12;
  }
  left = Math.max(10, Math.min(window.innerWidth - tooltipWidth - 10, left));
  top = Math.max(10, Math.min(window.innerHeight - tooltipHeight - 10, top));
  tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  if (state.chartTooltipPinned && !refresh) {
    state.chartTooltipTimer = setTimeout(hideChartTooltip, 3200);
  }
}

function hideChartTooltip() {
  const tooltip = $('#chartTooltip');
  clearTimeout(state.chartTooltipTimer);
  state.chartTooltipPinned = false;
  state.chartPointer = null;
  if (tooltip) tooltip.hidden = true;
}

function hideChartTooltipIfNotPinned(event) {
  const canvas = event?.currentTarget;
  if (canvas?.id && state.chartHover[canvas.id] != null) {
    state.chartHover[canvas.id] = null;
    canvas.style.cursor = '';
  }
  setChartHoverHighlight(canvas, null);
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

function handleChartZoomClick(event) {
  const button = event.target.closest('[data-chart-zoom]');
  if (!button) return;
  const controls = button.closest('[data-chart-controls]');
  const chartId = controls?.dataset.chartControls;
  if (!chartId) return;
  const action = button.dataset.chartZoom;
  const currentZoom = getChartZoom(chartId);
  const nextZoom = action === 'in'
    ? Math.min(CHART_ZOOM_MAX, currentZoom * CHART_ZOOM_STEP)
    : action === 'out'
      ? Math.max(CHART_ZOOM_MIN, currentZoom / CHART_ZOOM_STEP)
      : 1;
  if (nextZoom === currentZoom) return;

  const canvas = document.getElementById(chartId);
  const viewport = canvas?.closest('.chart-scroll');
  const centerFraction = viewport && viewport.scrollWidth > 0
    ? (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth
    : 0.5;

  state.chartZoom[chartId] = nextZoom;
  state.chartScrollInitialized[chartId] = true;
  button.classList.remove('pressed');
  void button.offsetWidth;
  button.classList.add('pressed');
  drawChartById(chartId);
  updateChartZoomControls(chartId);

  if (viewport) {
    const targetLeft = centerFraction * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, targetLeft));
    // The first draw resizes the canvas. Repaint once more after restoring the
    // viewport center so the visible-value Y scale and axis labels match the
    // newly visible portion even when assigning scrollLeft emits no event.
    scheduleChartViewportRedraw(viewport);
  }
}

function updateChartZoomControls(chartId) {
  const controls = document.querySelector(`[data-chart-controls="${chartId}"][data-chart-zoom-group]`);
  if (!controls) return;
  const zoom = getChartZoom(chartId);
  const zoomOutButton = controls.querySelector('[data-chart-zoom="out"]');
  const zoomInButton = controls.querySelector('[data-chart-zoom="in"]');
  if (zoomOutButton) zoomOutButton.disabled = zoom <= CHART_ZOOM_MIN + 0.001;
  if (zoomInButton) zoomInButton.disabled = zoom >= CHART_ZOOM_MAX - 0.001;
  const resetButton = controls.querySelector('[data-chart-zoom="reset"]');
  if (resetButton) resetButton.textContent = `${Math.round(zoom * 100)}%`;
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
  let hours = end.getHours() - start.getHours();
  let minutes = end.getMinutes() - start.getMinutes();

  if (minutes < 0) {
    hours -= 1;
    minutes += 60;
  }
  if (hours < 0) {
    days -= 1;
    hours += 24;
  }

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

  const parts = [
    [years, 'y'],
    [months, 'm'],
    [days, 'd'],
    [hours, 'h'],
    [minutes, 'm']
  ]
    .filter(([amount]) => amount > 0)
    .slice(0, 3)
    .map(([amount, suffix]) => `${amount}${suffix}`);
  return parts.join(' ') || 'Just now';
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
  const dateText = profile.registrationAt ? formatFullDateTime(profile.registrationAt) : (profile.registrationDisplay || 'Unknown');
  return state.playerProfileRegistrationDateMode ? dateText : formatRegistrationAge(profile.registrationAt);
}

function lastSeenProfileValue(profile) {
  if (profile.isOnline) return 'Online now';
  if (!profile.lastSeen) return 'Never';
  return state.playerProfileLastSeenDateMode
    ? formatFullDateTime(profile.lastSeen)
    : `${formatRegistrationAge(profile.lastSeen)} ago`;
}

function renderPlayerProfileSkeleton() {
  const metricCards = Array.from({ length: 8 }, () => `
    <div class="player-profile-skeleton-card">
      <span class="profile-skeleton-line short"></span>
      <span class="profile-skeleton-line value"></span>
    </div>`).join('');
  const sessionRows = Array.from({ length: 3 }, () => `
    <div class="player-profile-skeleton-session">
      <span class="profile-skeleton-dot"></span>
      <span class="profile-skeleton-line"></span>
      <span class="profile-skeleton-line duration"></span>
    </div>`).join('');
  return `
    <div class="player-profile-skeleton" aria-hidden="true">
      <header class="player-profile-skeleton-head">
        <span class="profile-skeleton-avatar"></span>
        <div>
          <span class="profile-skeleton-line title"></span>
          <span class="profile-skeleton-line badge"></span>
          <span class="profile-skeleton-line meta"></span>
        </div>
        <div class="player-profile-skeleton-actions">
          <span></span><span></span><span></span><span></span>
        </div>
      </header>
      <section class="player-profile-skeleton-grid">${metricCards}</section>
      <section class="player-profile-skeleton-section">
        <span class="profile-skeleton-line heading"></span>
        <div class="player-profile-skeleton-sessions">${sessionRows}</div>
      </section>
      <section class="player-profile-skeleton-section chat">
        <span class="profile-skeleton-line heading"></span>
        <span class="profile-skeleton-chat-row"></span>
        <span class="profile-skeleton-chat-row"></span>
      </section>
    </div>
    <span class="visually-hidden" role="status">Loading player profile...</span>`;
}

const PLAYER_ACTIVITY_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PLAYER_ACTIVITY_WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const PLAYER_PING_FRESH_MS = 3 * 60 * 1000;

function formatPing(value) {
  return value == null ? '-' : `${formatNumber(value)} ms`;
}

function playerPingQuality(value) {
  if (value == null) return '';
  if (value < 80) return 'good';
  if (value < 180) return 'fair';
  return 'poor';
}

function formatActivityHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatActivityHourRange(hour) {
  return `${formatActivityHour(hour)}–${formatActivityHour((hour + 1) % 24)}`;
}

function formatActivitySince(value, timeZone) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const cacheKey = `activity-since:${timeZone}`;
  if (!dateTimeFormatters.has(cacheKey)) dateTimeFormatters.set(cacheKey, new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone
  }));
  return dateTimeFormatters.get(cacheKey).format(date);
}

// "Online on 3 of 8 Mondays": how regular the hour is, which a raw total
// hides when one long session dominates the cell.
function playerActivityCellSummary(pattern, weekday, hour) {
  const seconds = Number(pattern.heatmap?.[weekday]?.[hour]) || 0;
  if (seconds <= 0) return 'No activity';
  const days = Number(pattern.heatmapDays?.[weekday]?.[hour]) || 0;
  const weeks = Number(pattern.weekdayCounts?.[weekday]) || 0;
  const total = `${formatDurationMs(seconds * 1000)} total`;
  if (!days || !weeks) return total;
  return `${total} · ${formatNumber(days)} of ${formatNumber(Math.max(days, weeks))} ${PLAYER_ACTIVITY_WEEKDAY_NAMES[weekday]}`;
}

function formatStreakDays(days) {
  const count = Number(days) || 0;
  return `${formatNumber(count)} ${count === 1 ? 'day' : 'days'}`;
}

const PLAYER_PING_CHART_DAYS = 14;
const PLAYER_PING_QUALITY_LABELS = { good: 'Good', fair: 'Fair', poor: 'Poor' };

function playerPingDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatPlayerPingDay(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A fixed calendar window keeps gaps visible: days without samples stay as
// empty slots instead of silently collapsing the chart.
function renderPlayerPingBars(ping) {
  const byDay = new Map((Array.isArray(ping.daily) ? ping.daily : [])
    .filter(day => day?.day && day.avg != null)
    .map(day => [day.day, day]));
  if (!byDay.size) return '';
  const days = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (PLAYER_PING_CHART_DAYS - 1));
  for (let index = 0; index < PLAYER_PING_CHART_DAYS; index += 1) {
    const key = playerPingDayKey(cursor);
    days.push({ key, sample: byDay.get(key) || null });
    cursor.setDate(cursor.getDate() + 1);
  }
  const sampled = days.filter(day => day.sample);
  if (!sampled.length) return '';
  // Scale against at least the "fair" threshold so a stable 30 ms week doesn't
  // render as full-height bars.
  const scale = Math.max(100, ...sampled.map(day => Number(day.sample.avg) || 0));
  return `
            <figure class="player-ping-chart">
              <div class="player-ping-bars" role="img" aria-label="Daily average ping, last ${PLAYER_PING_CHART_DAYS} days, ${formatNumber(sampled.length)} with samples">
                ${days.map(({ key, sample }) => sample
                  ? `<span class="player-ping-bar" data-ping-quality="${playerPingQuality(sample.avg)}" style="--ping-height:${Math.max(8, Math.round(Number(sample.avg) / scale * 100))}%" title="${escapeHtml(formatPlayerPingDay(key))}: avg ${escapeHtml(formatPing(sample.avg))} · ${escapeHtml(formatPing(sample.min))}–${escapeHtml(formatPing(sample.max))}"></span>`
                  : `<span class="player-ping-bar is-empty" title="${escapeHtml(formatPlayerPingDay(key))}: no samples"></span>`).join('')}
              </div>
              <figcaption class="player-ping-axis">
                <small>${escapeHtml(formatPlayerPingDay(days[0].key))}</small>
                <small>Daily avg · ${formatNumber(sampled.length)}/${PLAYER_PING_CHART_DAYS} days</small>
                <small>Today</small>
              </figcaption>
            </figure>`;
}

function renderPlayerPingStat(label, value, quality = '') {
  return `<div><dt>${label}</dt><dd${quality ? ` data-ping-quality="${quality}"` : ''}>${value}</dd></div>`;
}

function renderPlayerPingBadge(profile) {
  const ping = profile.ping || {};
  if (ping.last == null) return '';
  const isFresh = profile.isOnline && ping.lastAt && Date.now() - new Date(ping.lastAt).getTime() < PLAYER_PING_FRESH_MS;
  const quality = playerPingQuality(ping.last);
  const range = ping.min7d == null || ping.max7d == null ? '-' : `${formatNumber(ping.min7d)}–${formatNumber(ping.max7d)} ms`;
  const sampledAt = ping.lastAt
    ? `<small title="${escapeHtml(formatDate(ping.lastAt))}">${isFresh ? 'Live' : 'Sampled'} · ${escapeHtml(formatRecentDate(ping.lastAt))}</small>`
    : '';
  return `
          <details class="player-ping-details">
            <summary class="player-ping-value" data-ping-quality="${quality}" data-ping-fresh="${isFresh}" title="${isFresh ? 'Current ping' : 'Last sampled ping'}" aria-label="${isFresh ? 'Ping' : 'Last ping'} ${escapeHtml(formatPing(ping.last))}, show ping details">
              <span class="player-ping-signal" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="player-ping-number">${formatNumber(ping.last)}</span><span class="player-ping-unit">ms</span>
            </summary>
            <div class="player-ping-popover">
              <header class="player-ping-head">
                <div>
                  <span class="player-ping-eyebrow">${isFresh ? 'Ping now' : 'Last ping'}</span>
                  <strong data-ping-quality="${quality}">${formatNumber(ping.last)}<span>ms</span></strong>
                  ${sampledAt}
                </div>
                <span class="player-ping-quality" data-ping-quality="${quality}" data-ping-fresh="${isFresh}">${PLAYER_PING_QUALITY_LABELS[quality] || '-'}</span>
              </header>
              <dl class="player-ping-stats">
                ${renderPlayerPingStat('Avg 24h', formatPing(ping.avg24h), playerPingQuality(ping.avg24h))}
                ${renderPlayerPingStat('Avg 7d', formatPing(ping.avg7d), playerPingQuality(ping.avg7d))}
                ${renderPlayerPingStat('Range 7d', range)}
                ${renderPlayerPingStat('All-time', formatPing(ping.avgAllTime), playerPingQuality(ping.avgAllTime))}
              </dl>
              ${renderPlayerPingBars(ping)}
            </div>
          </details>`;
}

function renderPlayerActivityPattern(pattern) {
  if (!pattern || !pattern.maxCellSeconds) return '';
  // A square-root scale keeps ordinary hours visible next to one marathon
  // session instead of flattening them all into the palest shade.
  const heatLevel = seconds => seconds <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(seconds / pattern.maxCellSeconds) * 4)));
  const peak = pattern.peak
    ? `${PLAYER_ACTIVITY_WEEKDAYS[pattern.peak.weekday]} ${formatActivityHourRange(pattern.peak.hour)}`
    : '-';
  const longest = pattern.longestSession;
  const since = formatActivitySince(pattern.firstObservedAt, pattern.timeZone);
  return `
    <details class="player-profile-activity">
      <summary class="player-profile-section-head">
        <div>
          <h3>Activity pattern</h3>
          <small>Sessions observed by the bot${since ? ` since ${escapeHtml(since)}` : ''} · ${escapeHtml(pattern.timeZone)}</small>
        </div>
        <span class="player-activity-peak"><small>Peak</small><strong>${escapeHtml(peak)}</strong></span>
      </summary>
      <div class="player-activity-stats">
        <div><span>Avg session</span><strong>${pattern.completedSessionCount ? escapeHtml(formatDurationMs(pattern.averageSessionSeconds * 1000)) : '-'}</strong></div>
        <div${longest ? ` title="Started ${escapeHtml(formatDate(longest.startedAt))}${longest.isCurrent ? ' (still online)' : ''}"` : ''}><span>Longest</span><strong>${longest ? escapeHtml(formatDurationMs(longest.durationSeconds * 1000)) : '-'}</strong></div>
        <div><span>Streak</span><strong>${formatStreakDays(pattern.currentStreakDays)}</strong></div>
        <div><span>Best</span><strong>${formatStreakDays(pattern.longestStreakDays)}</strong></div>
        <div><span>Active days</span><strong>${formatNumber(pattern.activeDays)}</strong></div>
        <div><span>Sessions</span><strong>${formatNumber(pattern.completedSessionCount)}</strong></div>
      </div>
      <div class="player-activity-heatmap" role="group" aria-label="Online time by weekday and hour. Busiest: ${escapeHtml(peak)}.">
        <span class="player-activity-corner" aria-hidden="true"></span>
        ${Array.from({ length: 24 }, (_, hour) => `<span class="player-activity-hour" aria-hidden="true">${hour % 6 === 0 ? String(hour).padStart(2, '0') : ''}</span>`).join('')}
        ${pattern.heatmap.map((row, weekday) => `
          <span class="player-activity-day">${PLAYER_ACTIVITY_WEEKDAYS[weekday]}</span>
          ${row.map((seconds, hour) => {
            const label = `${PLAYER_ACTIVITY_WEEKDAYS[weekday]} ${formatActivityHourRange(hour)} · ${playerActivityCellSummary(pattern, weekday, hour)}`;
            const isFirstCell = weekday === 0 && hour === 0;
            return `<button class="player-activity-cell" type="button" data-heat="${heatLevel(seconds)}" data-activity-cell data-activity-key="${weekday}:${hour}" data-activity-label="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="false" tabindex="${isFirstCell ? '0' : '-1'}" title="${escapeHtml(label)}"></button>`;
          }).join('')}`).join('')}
      </div>
      <div class="player-activity-footer">
        <div class="player-activity-selection" data-activity-selection aria-live="polite">
          <span>Most active</span><strong>${escapeHtml(peak)}</strong><small>${escapeHtml(pattern.peak ? playerActivityCellSummary(pattern, pattern.peak.weekday, pattern.peak.hour) : 'No activity')}</small>
        </div>
        <div class="player-activity-legend" aria-hidden="true">
          <small>Less</small>${[0, 1, 2, 3, 4].map(level => `<span class="player-activity-cell" data-heat="${level}"></span>`).join('')}<small>More</small>
        </div>
      </div>
    </details>`;
}

function renderPlayerProfile(profile) {
  const recentMessages = profile.chat?.recentMessages || [];
  const gameSessions = Array.isArray(profile.gameSessions) ? profile.gameSessions : [];
  const gameSessionCount = Math.max(Number(profile.gameSessionCount) || 0, gameSessions.length);
  const nearby = profile.nearby;
  const profileUsername = String(profile.username || '');
  const messageRefreshRequested = state.playerProfileMessageRefreshes.has(profileUsername.toLowerCase());
  const nameHistory = Array.isArray(profile.nameHistory) ? profile.nameHistory : [];
  const nameHistoryControl = nameHistory.length > 1
    ? `<details class="player-name-history">
        <summary><small>Name history</small><code>&middot; ${formatNumber(nameHistory.length)}</code></summary>
        <div class="player-name-history-list">
          ${nameHistory.map((entry, index) => `
            <div>
              <strong>${escapeHtml(entry.username)}</strong>
              ${index === 0 ? '<span class="pill">current</span>' : ''}
              <small>${entry.firstSeen ? `First seen ${formatDate(entry.firstSeen)}` : ''}</small>
            </div>`).join('')}
        </div>
      </details>`
    : '';
  const registrationTitle = state.playerProfileRegistrationDateMode
    ? 'Show time since registration'
    : 'Show registration date';
  const lastSeenTitle = state.playerProfileLastSeenDateMode
    ? 'Show time since last seen'
    : 'Show exact last seen date';
  const ignoreAction = profile.isIgnored ? 'unignore_chat' : 'ignore_chat';
  const ignoreLabel = profile.isIgnored ? 'Unignore' : 'Ignore';
  const ignoreIcon = profile.isIgnored
    ? '<svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
    : '<svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
  const ignoreButton = state.currentUser?.role === 'admin'
    ? `
          <button class="player-profile-message-action player-profile-ignore-action" type="button" data-player-ignore-action="${ignoreAction}" aria-label="${ignoreLabel} ${escapeHtml(profileUsername)}" title="${ignoreLabel}" aria-pressed="${profile.isIgnored}">
            ${ignoreIcon}
            <span>${ignoreLabel}</span>
          </button>`
    : '';
  const whitelistAction = profile.isWhitelisted ? 'whitelist_remove' : 'whitelist_add';
  const whitelistLabel = profile.isWhitelisted ? 'Remove from whitelist' : 'Add to whitelist';
  const whitelistIcon = profile.isWhitelisted
    ? '<svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H21v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H21"/><path d="M9 10h6"/></svg>'
    : '<svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H21v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H21"/><path d="M12 7v6M9 10h6"/></svg>';
  const whitelistButton = state.currentUser?.role === 'admin'
    ? `
          <button class="player-profile-message-action player-profile-whitelist-action${profile.isWhitelisted ? ' is-remove' : ''}" type="button" data-player-whitelist-action="${whitelistAction}" aria-label="${whitelistLabel} for ${escapeHtml(profileUsername)}" title="${whitelistLabel}" aria-pressed="${profile.isWhitelisted}">
            ${whitelistIcon}
            <span>${whitelistLabel}</span>
          </button>`
    : '';
  const storedAdminTags = (Array.isArray(profile.adminTags) ? profile.adminTags : [])
    .filter(tag => String(tag).trim().toLowerCase() !== 'new player');
  const adminTagMarkup = [
    ...storedAdminTags.map(tag => `<span class="admin-player-tag">${escapeHtml(tag)}</span>`),
    ...(profile.isNewPlayer
      ? ['<span class="admin-player-tag is-new-player" title="Automatic tag: shown for 14 days after registration">New Player</span>']
      : [])
  ].join('');
  const adminMetadata = state.currentUser?.role === 'admin' && (Object.hasOwn(profile, 'adminNotes') || Object.hasOwn(profile, 'adminTags'))
    ? `<section class="player-profile-admin-metadata">
        <h3>Admin metadata</h3>
        <div><span>Tags</span><strong>${adminTagMarkup || 'None'}</strong></div>
        <div><span>Notes</span><p>${profile.adminNotes ? escapeHtml(profile.adminNotes) : 'No admin notes.'}</p></div>
      </section>`
    : '';
  const gameSessionsSection = `
    <section class="player-profile-sessions">
      <header class="player-profile-section-head">
        <div>
          <h3>Game sessions</h3>
          <small>${formatNumber(gameSessionCount)} total ${gameSessionCount === 1 ? 'session' : 'sessions'}</small>
        </div>
        ${gameSessions.length > 3 ? '<span>Scroll for older</span>' : ''}
      </header>
      <div class="player-profile-session-list${gameSessions.length > 3 ? ' is-scrollable' : ''}" data-player-profile-scroll="game-sessions"${gameSessions.length > 3 ? ' tabindex="0" aria-label="Game sessions, newest first"' : ''}>
        ${gameSessions.length
          ? gameSessions.map(session => `
            <article class="player-profile-session${session.isCurrent ? ' is-current' : ''}">
              <span class="player-profile-session-marker" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(formatDate(session.startedAt))}</strong>
                <small>${session.isCurrent ? 'Online now' : `Ended ${escapeHtml(formatDate(session.endedAt))}`}</small>
              </div>
              <time${session.isCurrent ? ` data-current-session-start="${escapeHtml(session.startedAt)}"` : ''}>${escapeHtml(formatDurationMs((Number(session.durationSeconds) || 0) * 1000))}</time>
            </article>
          `).join('')
          : '<div class="empty">No completed game sessions recorded yet.</div>'}
      </div>
    </section>`;
  return `
    <header class="player-profile-head">
      <button class="player-profile-avatar-wrap" type="button" data-player-skins="${escapeHtml(profileUsername)}" data-status="${profile.isOnline ? 'online' : 'offline'}" aria-label="View ${escapeHtml(profileUsername)} skin history (${profile.isOnline ? 'online' : 'offline'})" title="View and rotate player skins">
        <img class="player-profile-avatar" src="${playerHeadUrl(profile.username, 96, { uuid: profile.uuid })}" alt="" loading="eager" onerror="this.style.visibility='hidden'">
      </button>
      <div class="player-profile-summary">
        <div class="player-profile-identity">
          <div class="player-profile-name-row">
            <h2 id="playerProfileName">${escapeHtml(profile.username)}</h2>
          </div>
          <div class="player-profile-badges">
            ${renderPlayerPingBadge(profile)}
            <span class="pill">${profile.isWhitelisted ? 'whitelisted' : 'not whitelisted'}</span>
            ${profile.isIgnored ? '<span class="pill ignored">ignored</span>' : ''}
          </div>
        </div>
        <div class="player-profile-meta">
          ${profile.uuid ? `<span class="player-profile-uuid uuid-copy" role="button" tabindex="0" data-copy-uuid="${escapeHtml(profile.uuid)}" title="Copy Minecraft UUID" aria-label="Copy UUID ${escapeHtml(profile.uuid)}"><small>UUID</small><code data-compact-uuid="${escapeHtml(String(profile.uuid).replaceAll('-', ''))}">${escapeHtml(profile.uuid)}</code></span>` : ''}
          ${nameHistoryControl}
        </div>
      </div>
      <div class="player-profile-actions">
        <button class="player-profile-message-action" type="button" data-whisper-player="${escapeHtml(profileUsername)}">
          <svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
          <span>Message</span>
        </button>
        <a class="player-profile-message-action player-profile-namemc-action" href="https://namemc.com/profile/${encodeURIComponent(profileUsername)}" target="_blank" rel="noopener noreferrer">
          <svg class="player-profile-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          <span>NameMC</span>
        </a>
        ${whitelistButton}
        ${ignoreButton}
      </div>
    </header>
    <section class="player-profile-grid">
      <div>
        <header class="player-profile-metric-head">
          <span>Playtime</span>
          <button class="player-profile-refresh-button" type="button" data-player-refresh-command="!pt" aria-label="Refresh playtime for ${escapeHtml(profileUsername)}" title="Request current playtime">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15"/></svg>
          </button>
        </header>
        <strong>${escapeHtml(profile.playtime || '-')}</strong>
      </div>
      <div>
        <header class="player-profile-metric-head">
          <span>Registered</span>
          <button class="player-profile-refresh-button" type="button" data-player-refresh-command="!jd" aria-label="Refresh registration date for ${escapeHtml(profileUsername)}" title="Request current registration date">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15"/></svg>
          </button>
        </header>
        <button class="player-profile-value-button" type="button" data-profile-toggle="registration-date" title="${registrationTitle}">
          ${escapeHtml(registrationProfileValue(profile))}
        </button>
      </div>
      <div>
        <header class="player-profile-metric-head">
          <span>Last Seen</span>
          ${profile.isOnline || profile.lastSeen ? '' : `
            <button class="player-profile-refresh-button" type="button" data-player-refresh-command="!seen" aria-label="Request last seen for ${escapeHtml(profileUsername)}" title="Request last seen">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15"/></svg>
            </button>`}
        </header>
        ${profile.isOnline
          ? '<strong>Online now</strong>'
          : profile.lastSeen
          ? `<button class="player-profile-value-button" type="button" data-profile-toggle="last-seen-date" title="${lastSeenTitle}">${escapeHtml(lastSeenProfileValue(profile))}</button>`
          : '<strong>Never</strong>'}
      </div>
      <div>
        <header class="player-profile-metric-head">
          <span>Chat Messages</span>
          ${messageRefreshRequested ? '' : `
            <button class="player-profile-refresh-button" type="button" data-player-refresh-command="!messages" aria-label="Refresh chat messages for ${escapeHtml(profileUsername)}" title="Request current chat message count">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15"/></svg>
            </button>`}
        </header>
        <strong>${formatNumber(profile.chat?.totalMessages)}</strong>
      </div>
      <div><span>Messages 24h</span><strong>${formatNumber(profile.chat?.last24h)}</strong></div>
      <div><span>Last Message</span><strong${profile.chat?.lastMessageAt ? ` data-profile-relative-time="${escapeHtml(profile.chat.lastMessageAt)}"` : ''}>${profile.chat?.lastMessageAt ? formatRecentDate(profile.chat.lastMessageAt) : 'None'}</strong></div>
      <div><span>Nearby</span><strong>${nearby ? `${formatNumber(nearby.distance)} blocks` : 'No sighting'}</strong></div>
      <div>
        <span>Signs</span>
        <button class="player-profile-value-button" type="button" data-player-signs="${escapeHtml(profileUsername)}" aria-haspopup="dialog" title="Signs with ${escapeHtml(profileUsername)} written on them">Show signs</button>
      </div>
    </section>
    ${gameSessionsSection}
    ${renderPlayerActivityPattern(profile.activityPattern)}
    ${adminMetadata}
    <section class="player-profile-chat">
      <h3>Recent Chat</h3>
      ${recentMessages.length
        ? recentMessages.map(message => `
          <article class="player-profile-message${profile.isBot ? ' player-profile-message-bot' : ''}${message.isVisible === false ? ' is-hidden' : ''}"${message.isVisible === false ? ' title="Hidden from public chat"' : ` data-chat-message-id="${escapeHtml(message.id)}" title="Open this moment in game chat" role="button" tabindex="0"`}>
            <div class="chat-message-body">
              <div class="chat-message-head">
                <span class="chat-message-name">${escapeHtml(profileUsername)}</span>
                ${profile.isBot ? '<span class="chat-bot-badge">BOT</span>' : ''}
                ${message.isVisible === false ? '<span class="chat-hidden-badge">Hidden</span>' : ''}
                <time class="chat-time" datetime="${escapeHtml(message.createdAt || '')}">${escapeHtml(formatPlayerProfileChatTimestamp(message.createdAt))}</time>
              </div>
              <div class="chat-text">${linkifyChatMessage(message.message)}</div>
            </div>
          </article>
        `).join('')
        : '<div class="empty">No recorded chat messages for this player.</div>'}
      ${profile.chat?.hasMoreMessages
        ? `<button class="ghost-button player-profile-load-more" type="button" data-player-chat-more="${escapeHtml(profile.chat.nextBeforeMessageId || '')}">Load older messages</button>`
        : ''}
    </section>
  `;
}

function fitPlayerProfileName() {
  const name = $('#playerProfileName');
  if (!name) return;
  name.style.removeProperty('font-size');
  if (!window.matchMedia?.('(max-width: 700px)').matches) return;

  const closeButton = $('#playerProfileClose');
  const nameRect = name.getBoundingClientRect();
  const closeRect = closeButton?.getBoundingClientRect();
  const closeSafeWidth = closeRect && closeRect.left > nameRect.left
    ? Math.max(0, closeRect.left - nameRect.left - 10)
    : name.clientWidth;
  const availableWidth = Math.min(name.clientWidth, closeSafeWidth);
  const naturalWidth = name.scrollWidth;
  if (!availableWidth || naturalWidth <= availableWidth) return;

  const defaultSize = Number.parseFloat(getComputedStyle(name).fontSize) || 18;
  const fittedSize = Math.max(8, Math.floor(defaultSize * availableWidth / naturalWidth * 0.98));
  name.style.fontSize = `${fittedSize}px`;
}

function playerProfileSignature(profile) {
  return JSON.stringify([
    profile.username,
    profile.uuid,
    profile.nameHistory,
    profile.isOnline,
    profile.isWhitelisted,
    profile.isIgnored,
    profile.isBot,
    profile.isNewPlayer,
    profile.playtime,
    profile.registrationAt,
    profile.registrationDisplay,
    state.playerProfileRegistrationDateMode,
    state.playerProfileLastSeenDateMode,
    profile.lastSeen,
    profile.lastOnline,
    profile.gameSessionCount,
    ...(profile.gameSessions || []).map(session => session.isCurrent
      ? [session.startedAt, null, true]
      : [session.startedAt, session.endedAt, session.durationSeconds, false]),
    profile.chat?.totalMessages,
    profile.chat?.last24h,
    profile.chat?.lastMessageAt,
    profile.nearby?.distance,
    profile.ping,
    // The live session grows every refresh; only re-render the pattern when a
    // completed session or a new active day changes it.
    profile.activityPattern?.completedSessionCount,
    profile.activityPattern?.activeDays,
    profile.activityPattern?.currentStreakDays,
    profile.activityPattern?.timeZone,
    profile.adminNotes,
    profile.adminTags,
    profile.chat?.hasMoreMessages,
    ...(profile.chat?.recentMessages || []).map(message => [message.id, message.message, message.createdAt, message.isVisible])
  ]);
}

function stopPlayerProfileSessionClock() {
  if (state.playerProfileSessionTimer) clearInterval(state.playerProfileSessionTimer);
  state.playerProfileSessionTimer = null;
}

function clearPlayerProfileRefreshTimers() {
  for (const timer of state.playerProfileRefreshTimers) clearTimeout(timer);
  state.playerProfileRefreshTimers = [];
}

function schedulePlayerProfileRefresh(username) {
  clearPlayerProfileRefreshTimers();
  const expectedUsername = String(username).toLowerCase();
  for (const delay of [1_500, 4_000, 8_000]) {
    const timer = window.setTimeout(() => {
      state.playerProfileRefreshTimers = state.playerProfileRefreshTimers.filter(item => item !== timer);
      if ($('#playerProfileOverlay')?.hidden) return;
      if (String(state.playerProfileUsername || '').toLowerCase() !== expectedUsername) return;
      loadPlayerProfile(state.playerProfileUsername);
    }, delay);
    state.playerProfileRefreshTimers.push(timer);
  }
}

function updatePlayerProfileSessionClock() {
  const overlay = $('#playerProfileOverlay');
  const content = $('#playerProfileContent');
  const clocks = document.querySelectorAll('[data-current-session-start]');
  const relativeTimes = document.querySelectorAll('[data-profile-relative-time]');
  if (overlay?.hidden || (!clocks.length && !relativeTimes.length)) {
    stopPlayerProfileSessionClock();
    return;
  }
  // Replacing even one live timestamp can invalidate a selection whose range
  // crosses that text node. The interval catches up after selection ends.
  if (hasActiveTextSelectionWithin(content)) return;
  const now = Date.now();
  for (const clock of clocks) {
    const startedAt = new Date(clock.dataset.currentSessionStart).getTime();
    if (Number.isFinite(startedAt)) clock.textContent = formatDurationMs(Math.max(0, now - startedAt));
  }
  for (const relativeTime of relativeTimes) {
    relativeTime.textContent = formatRecentDate(relativeTime.dataset.profileRelativeTime);
  }
}

function startPlayerProfileSessionClock() {
  stopPlayerProfileSessionClock();
  updatePlayerProfileSessionClock();
  if (document.querySelector('[data-current-session-start], [data-profile-relative-time]')) {
    state.playerProfileSessionTimer = setInterval(updatePlayerProfileSessionClock, 1_000);
  }
}

function capturePlayerProfileViewState(content) {
  const card = content?.closest('.player-profile-card');
  const scrollAreas = [...(content?.querySelectorAll('[data-player-profile-scroll]') || [])];
  return {
    cardScrollTop: card?.scrollTop || 0,
    scrollAreas: scrollAreas.map(area => ({
      key: area.dataset.playerProfileScroll,
      scrollTop: area.scrollTop,
      scrollLeft: area.scrollLeft,
      focused: document.activeElement === area
    })),
    // The periodic refresh (schedulePlayerProfileRefresh) rebuilds this whole
    // panel from scratch, which would otherwise silently snap any open
    // <details> (e.g. Name history) shut a second or two after the click.
    nameHistoryOpen: Boolean(content?.querySelector('.player-name-history')?.open),
    pingDetailsOpen: Boolean(content?.querySelector('.player-ping-details')?.open),
    activityPatternOpen: Boolean(content?.querySelector('.player-profile-activity')?.open),
    // Durations grow while the player is online, so remember the cell by its
    // weekday/hour instead of its label or the selection resets on refresh.
    activityCellKey: content?.querySelector('[data-activity-cell].is-selected')?.dataset.activityKey || null
  };
}

function restorePlayerProfileViewState(content, viewState) {
  if (!content || !viewState) return;
  const card = content.closest('.player-profile-card');
  for (const saved of viewState.scrollAreas) {
    const area = [...content.querySelectorAll('[data-player-profile-scroll]')]
      .find(candidate => candidate.dataset.playerProfileScroll === saved.key);
    if (!area) continue;
    if (saved.focused) area.focus({ preventScroll: true });
    area.scrollTop = saved.scrollTop;
    area.scrollLeft = saved.scrollLeft;
  }
  for (const [selector, open] of [
    ['.player-name-history', viewState.nameHistoryOpen],
    ['.player-ping-details', viewState.pingDetailsOpen],
    ['.player-profile-activity', viewState.activityPatternOpen]
  ]) {
    const details = open ? content.querySelector(selector) : null;
    if (details) details.open = true;
  }
  if (viewState.activityCellKey) {
    const selectedCell = [...content.querySelectorAll('[data-activity-cell]')]
      .find(cell => cell.dataset.activityKey === viewState.activityCellKey);
    if (selectedCell) selectPlayerActivityCell(selectedCell);
  }
  if (card) card.scrollTop = viewState.cardScrollTop;
}

function replacePlayerProfileContent(profile, { animate = false } = {}) {
  const content = $('#playerProfileContent');
  if (!content) return;
  const viewState = capturePlayerProfileViewState(content);
  // The periodic background refresh (schedulePlayerProfileRefresh) rebuilds
  // this whole panel every 1.5-8s even when only a live timestamp elsewhere
  // changed. Rebuilding the header from scratch forces the browser to
  // redecode the avatar image and repaint the action buttons every time,
  // which shows up as a visible flicker on phones. Keep the previous header
  // element in place when its markup didn't actually change.
  const previousHead = content.querySelector('.player-profile-head');
  const previousHeadHtml = previousHead?.outerHTML || null;
  clearTimeout(state.playerProfileRevealTimer);
  state.playerProfileRevealTimer = null;
  content.classList.remove('is-loading', 'profile-data-enter');
  content.innerHTML = renderPlayerProfile(profile);
  fitPlayerProfileName();
  const nextHead = content.querySelector('.player-profile-head');
  if (previousHead && nextHead && previousHeadHtml === nextHead.outerHTML) {
    nextHead.replaceWith(previousHead);
  }
  applyPlayerProfileAccent(profile);
  restorePlayerProfileViewState(content, viewState);
  requestAnimationFrame(fitPlayerProfileName);
  document.fonts?.ready?.then(() => {
    if (!$('#playerProfileOverlay')?.hidden) fitPlayerProfileName();
  });
  startPlayerProfileSessionClock();
  if (!animate) return;
  void content.offsetWidth;
  content.classList.add('profile-data-enter');
  state.playerProfileRevealTimer = setTimeout(() => {
    content.classList.remove('profile-data-enter');
    state.playerProfileRevealTimer = null;
  }, 620);
}

async function loadPlayerProfile(username, { showLoading = false } = {}) {
  const overlay = $('#playerProfileOverlay');
  const content = $('#playerProfileContent');
  if (!overlay || !content || !username) return;

  if (!showLoading && hasActiveTextSelectionWithin(content)) {
    queueRealtimeRefresh('player-profile-selection', () => loadPlayerProfile(state.playerProfileUsername), 750);
    return;
  }

  overlay.hidden = false;
  document.body.classList.add('profile-open');
  state.playerProfileUsername = username;
  if (showLoading) {
    stopPlayerProfileSessionClock();
    setPlayerProfileLoading(true);
    content.classList.remove('profile-data-enter');
    content.classList.add('is-loading');
    content.innerHTML = renderPlayerProfileSkeleton();
  }

  try {
    let profile = await fetchJson(`/api/player?username=${encodeURIComponent(username)}&messageLimit=20`);
    const previous = state.playerProfileLastPayload;
    if (previous && String(previous.username).toLowerCase() === String(profile.username).toLowerCase()) {
      const merged = [...(profile.chat?.recentMessages || []), ...(previous.chat?.recentMessages || [])];
      profile.chat.recentMessages = [...new Map(merged.map(message => [String(message.id), message])).values()]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (previous.chat?.recentMessages?.length > 20) {
        profile.chat.hasMoreMessages = previous.chat.hasMoreMessages;
        profile.chat.nextBeforeMessageId = previous.chat.nextBeforeMessageId;
      }
    }
    state.playerProfileLastPayload = profile;
    const signature = playerProfileSignature(profile);
    if (state.playerProfileSignature !== signature) {
      if (!showLoading && hasActiveTextSelectionWithin(content)) {
        queueRealtimeRefresh('player-profile-selection', () => loadPlayerProfile(state.playerProfileUsername), 750);
        return;
      }
      replacePlayerProfileContent(profile, { animate: content.classList.contains('is-loading') });
      state.playerProfileSignature = signature;
      state.playerProfileUsername = profile.username || username;
    }
  } catch (err) {
    stopPlayerProfileSessionClock();
    setPlayerProfileLoading(false);
    content.classList.remove('is-loading', 'profile-data-enter');
    content.innerHTML = `<div class="empty">Could not load player profile: ${escapeHtml(err.message)}</div>`;
  }
}

async function openPlayerProfile(username, { returnToSeenSearch = null } = {}) {
  clearTimeout(state.playerProfileSeenSearchRestoreTimer);
  state.playerProfileSeenSearchRestoreTimer = null;
  state.playerProfileSeenSearchReturn = returnToSeenSearch;
  clearPlayerProfileRefreshTimers();
  setPlayerProfileAccent();
  state.playerProfileSignature = '';
  state.playerProfileRegistrationDateMode = false;
  state.playerProfileLastSeenDateMode = false;
  state.playerProfileLastPayload = null;
  await loadPlayerProfile(username, { showLoading: true });
}

function closePlayerProfile({ restoreSeenSearch = true } = {}) {
  const overlay = $('#playerProfileOverlay');
  if (!overlay) return;
  const seenSearchReturn = restoreSeenSearch ? state.playerProfileSeenSearchReturn : null;
  state.playerProfileSeenSearchReturn = null;
  closePlayerSkins();
  closePlayerSigns();
  overlay.hidden = true;
  setPlayerProfileLoading(false);
  stopPlayerProfileSessionClock();
  clearPlayerProfileRefreshTimers();
  clearTimeout(state.playerProfileRevealTimer);
  state.playerProfileRevealTimer = null;
  document.body.classList.remove('profile-open');
  state.playerProfileUsername = null;
  state.playerProfileSignature = '';
  state.playerProfileRegistrationDateMode = false;
  state.playerProfileLastSeenDateMode = false;
  state.playerProfileLastPayload = null;
  if (seenSearchReturn) {
    // Close-button clicks still bubble to the document handler, which closes
    // popovers clicked from outside. Restore on the next task so that handler
    // cannot immediately discard the search we are returning to.
    state.playerProfileSeenSearchRestoreTimer = setTimeout(() => {
      state.playerProfileSeenSearchRestoreTimer = null;
      const input = $('#seenSearchInput');
      if (input) input.value = seenSearchReturn.query;
      renderSeenSuggestions(seenSearchReturn.players);
      setSeenSearchOpen(true);
      runSeenSearch(seenSearchReturn.query);
    }, 0);
  }
}

function closePlayerSkins() {
  const overlay = $('#playerSkinsOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  state.playerSkinsRequestId += 1;
  state.playerSkinViewer?.destroy();
  state.playerSkinViewer = null;
  state.playerSelectedSkin = null;
  state.playerSelectedCape = null;
}

function preparePlayerSkinBackground(overlay) {
  if (!overlay || !PLAYER_SKIN_BACKGROUNDS.length) return;
  let index = Math.floor(Math.random() * PLAYER_SKIN_BACKGROUNDS.length);
  if (PLAYER_SKIN_BACKGROUNDS.length > 1 && index === state.playerSkinBackgroundIndex) {
    index = (index + 1) % PLAYER_SKIN_BACKGROUNDS.length;
  }
  state.playerSkinBackgroundIndex = index;
  const backgroundUrl = PLAYER_SKIN_BACKGROUNDS[index];
  const preload = new Image();
  preload.decoding = 'async';
  preload.fetchPriority = 'high';
  preload.src = backgroundUrl;
  overlay.style.setProperty('--player-skin-background', `url("${backgroundUrl}")`);
}

function drawSkinThumbnail(canvas, textureUrl) {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const context = canvas.getContext('2d');
    context.clearRect(0,0,canvas.width,canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image,8,8,8,8,0,0,canvas.width,canvas.height);
    context.drawImage(image,40,8,8,8,0,0,canvas.width,canvas.height);
  };
  image.src = textureUrl;
}

function drawCapeThumbnail(canvas, textureUrl) {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const context = canvas.getContext('2d');
    const sourceX = image.naturalWidth / 64;
    const sourceY = image.naturalHeight / 32;
    const width = canvas.width * .56;
    const height = canvas.height * .82;
    context.clearRect(0,0,canvas.width,canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      sourceX,sourceY,sourceX * 10,sourceY * 16,
      (canvas.width - width) / 2,(canvas.height - height) / 2,width,height
    );
  };
  image.src = textureUrl;
}

function loadPlayerSkinSelection() {
  const canvas = $('#playerSkinCanvas');
  const skin = state.playerSelectedSkin;
  if (!canvas || !skin || !state.playerSkinViewer) return;
  const cape = state.playerSelectedCape;
  $('#playerSkinObserved').textContent = skin.firstSeen
    ? `Observed ${formatDate(skin.firstSeen)}${skin.lastSeen && skin.lastSeen !== skin.firstSeen ? ` – ${formatDate(skin.lastSeen)}` : ''} · ${cape ? 'selected cape elytra' : 'skin only'}`
    : 'Current skin';
  canvas.classList.add('is-loading');
  state.playerSkinViewer.load(skin.textureUrl,skin.model,cape?.textureUrl || null);
}

function selectPlayerSkin(skin, button = null) {
  if (!skin) return;
  state.playerSelectedSkin = skin;
  document.querySelectorAll('[data-player-skin-hash]').forEach(item => {
    const selected = item === button || (!button && item.dataset.playerSkinHash === skin.hash);
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  loadPlayerSkinSelection();
}

function selectPlayerCape(cape, button = null) {
  state.playerSelectedCape = cape;
  document.querySelectorAll('[data-player-cape-hash]').forEach(item => {
    const capeHash = cape?.hash || '';
    const selected = item === button || (!button && item.dataset.playerCapeHash === capeHash);
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  loadPlayerSkinSelection();
}

function renderPlayerSkins(payload) {
  const content = $('#playerSkinsContent');
  const skins = Array.isArray(payload.skins) ? payload.skins : [];
  const capes = Array.isArray(payload.capes) ? payload.capes : [];
  if (!skins.length) {
    content.innerHTML = `<div class="player-skins-empty"><strong>No skin captured yet</strong><p>${payload.refreshFailed ? 'The Minecraft skin service is temporarily unavailable. Try again later.' : 'This player does not currently have an official skin available.'}</p></div>`;
    return;
  }
  const profileAvatar = $('#playerProfileContent')?.querySelector('.player-profile-avatar');
  if (profileAvatar && String(state.playerProfileUsername || '').toLowerCase() === String(payload.username || '').toLowerCase()) {
    profileAvatar.src = playerHeadUrl(payload.username,96,{ uuid:payload.uuid,skinHash:skins[0].hash });
    profileAvatar.style.visibility = '';
  }
  content.innerHTML = `
    <section class="player-skin-stage">
      <canvas id="playerSkinCanvas" width="520" height="520" tabindex="0" aria-label="Rotatable animated 3D skin model. Click to pause or resume, drag to rotate, and scroll to zoom."></canvas>
      <div class="player-skin-stage-tools">
        <span><strong id="playerSkinInteractionHint">Drag to rotate · Click to pause</strong><small id="playerSkinObserved"></small></span>
        <button id="playerSkinReset" class="ghost-button" type="button">Reset view</button>
      </div>
    </section>
    <section class="player-skin-wardrobe" aria-label="Saved skins">
      <header><h3>Skin history</h3><span>${formatNumber(skins.length)} ${skins.length === 1 ? 'skin' : 'skins'}</span></header>
      <div class="player-skin-list">
        ${skins.map((skin,index) => `
          <button type="button" data-player-skin-hash="${escapeHtml(skin.hash)}" aria-pressed="${index === 0}" class="player-skin-choice${index === 0 ? ' is-selected' : ''}" title="Observed ${escapeHtml(formatDate(skin.firstSeen))}">
            <canvas width="48" height="48" aria-hidden="true"></canvas>
            <span>${index === 0 ? 'Current' : escapeHtml(formatDate(skin.firstSeen))}</span>
          </button>`).join('')}
      </div>
      <p>${payload.refreshFailed ? 'Showing saved skins; the current Mojang skin could not be checked.' : 'New skins are saved automatically whenever this window is opened.'}</p>
      <section class="player-cape-wardrobe" aria-label="Saved capes">
        <header><h3>Cape history</h3><span>${formatNumber(capes.length)} ${capes.length === 1 ? 'cape' : 'capes'}</span></header>
        <div class="player-cape-list">
          <button type="button" data-player-cape-hash="" aria-pressed="${!payload.currentCapeHash}" class="player-cape-choice${payload.currentCapeHash ? '' : ' is-selected'}" title="Show the skin without elytra">
            <span class="player-cape-none" aria-hidden="true">×</span>
            <span>No cape</span>
          </button>
          ${capes.map(cape => {
            const current = cape.hash === payload.currentCapeHash;
            return `
              <button type="button" data-player-cape-hash="${escapeHtml(cape.hash)}" aria-pressed="${current}" class="player-cape-choice${current ? ' is-selected' : ''}" title="Observed ${escapeHtml(formatDate(cape.firstSeen))}">
                <canvas width="48" height="48" aria-hidden="true"></canvas>
                <span>${escapeHtml(cape.name || (current ? 'Current' : formatDate(cape.firstSeen)))}</span>
              </button>`;
          }).join('')}
        </div>
        <p>${capes.length ? 'NameMC capes and locally observed capes are saved here for elytra preview.' : 'No official cape has been found for this player yet.'}</p>
      </section>
    </section>`;
  const canvas = $('#playerSkinCanvas');
  state.playerSkinViewer?.destroy();
  state.playerSkinViewer = new globalThis.MinecraftSkinViewer(canvas);
  canvas.addEventListener('skinviewerload', () => canvas.classList.remove('is-loading'));
  canvas.addEventListener('skinviewererror', () => canvas.classList.remove('is-loading'));
  canvas.addEventListener('skinvieweranimationchange', event => {
    const paused = event.detail?.paused === true;
    $('#playerSkinInteractionHint').textContent = paused
      ? 'Animation paused · Click to resume'
      : 'Drag to rotate · Click to pause';
  });
  content.querySelectorAll('[data-player-skin-hash]').forEach((button,index) => {
    const skin = skins[index];
    drawSkinThumbnail(button.querySelector('canvas'),skin.textureUrl);
    button.addEventListener('click', () => selectPlayerSkin(skin,button));
  });
  content.querySelectorAll('[data-player-cape-hash]').forEach(button => {
    const cape = capes.find(item => item.hash === button.dataset.playerCapeHash) || null;
    if (cape) drawCapeThumbnail(button.querySelector('canvas'),cape.textureUrl);
    button.addEventListener('click', () => selectPlayerCape(cape,button));
  });
  $('#playerSkinReset').addEventListener('click', () => state.playerSkinViewer?.reset());
  state.playerSelectedCape = capes.find(cape => cape.hash === payload.currentCapeHash) || null;
  selectPlayerSkin(skins[0],content.querySelector('[data-player-skin-hash]'));
}

async function openPlayerSkins(username) {
  const overlay = $('#playerSkinsOverlay');
  const content = $('#playerSkinsContent');
  if (!overlay || !content || !globalThis.MinecraftSkinViewer) return;
  const requestId = ++state.playerSkinsRequestId;
  preparePlayerSkinBackground(overlay);
  $('#playerSkinsTitle').textContent = `${username}'s skins`;
  content.innerHTML = `
    <section class="player-skins-skeleton-stage" aria-hidden="true">
      <span class="player-skins-skeleton-model"></span>
      <footer><span></span><span></span></footer>
    </section>
    <section class="player-skins-skeleton-wardrobe" aria-hidden="true">
      <header><span></span><span></span></header>
      <div class="player-skins-skeleton-grid">
        ${Array.from({ length:6 }, () => '<span></span>').join('')}
      </div>
      <p></p>
      <header><span></span><span></span></header>
      <div class="player-skins-skeleton-grid capes">
        ${Array.from({ length:4 }, () => '<span></span>').join('')}
      </div>
    </section>
    <span class="visually-hidden" role="status">Loading skin wardrobe...</span>`;
  overlay.hidden = false;
  $('#playerSkinsClose')?.focus();
  try {
    const payload = await fetchJson(`/api/player-skins?username=${encodeURIComponent(username)}`);
    if (requestId !== state.playerSkinsRequestId || overlay.hidden) return;
    renderPlayerSkins(payload);
  } catch (err) {
    if (requestId !== state.playerSkinsRequestId || overlay.hidden) return;
    content.innerHTML = `<div class="player-skins-empty"><strong>Could not load skins</strong><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// Signs with the player's name on them: what the Area Explorer mod read, from any server and dimension

function closePlayerSigns() {
  const overlay = $('#playerSignsOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  state.playerSignsRequestId = (state.playerSignsRequestId || 0) + 1;
  state.playerSigns = [];
}

/** The name lit up wherever it's written on the sign (the text is escaped already: entities are left alone). */
function highlightPlayerSignName(html, username) {
  const name = username.replace(/[.*]/g, '\\$&');
  const word = new RegExp(`(^|[^A-Za-z0-9_&#])(${name})(?=$|[^A-Za-z0-9_])`, 'gim');
  return html.replace(/(<span class="area-explorer-sign-text">)([\s\S]*?)(<\/span>)/g,
    (match, open, text, close) => `${open}${text.replace(word, '$1<mark>$2</mark>')}${close}`);
}

function renderPlayerSigns(username, { signs, total }) {
  const content = $('#playerSignsContent');
  state.playerSigns = signs;
  $('#playerSignsCount').textContent = total
    ? `${formatNumber(total)} sign${total === 1 ? '' : 's'}${total > signs.length ? `, newest ${formatNumber(signs.length)} shown` : ''}`
    : 'No signs';
  content.innerHTML = signs.length
    ? `<ol class="area-explorer-finds player-signs-list">${signs.map(find => highlightPlayerSignName(renderAreaExplorerFind(find, { showScope: true }), username)).join('')}</ol>`
    : `<div class="player-signs-empty"><strong>No signs yet</strong><p>No sign the Area Explorer mod has read has ${escapeHtml(username)} written on it.</p></div>`;
}

/** Sign cards to come, shaped like the real ones: the slot, the name, a few lines of text, the meta row. */
function renderPlayerSignsSkeleton() {
  const lines = [[78, 54, 66], [62, 84], [90, 48, 70, 36]];
  return `<ol class="area-explorer-finds player-signs-list player-signs-skeleton" aria-hidden="true">
    ${lines.concat(lines.slice(0, 1)).map(widths => `<li class="player-signs-skeleton-card">
      <span class="player-signs-skeleton-icon"></span>
      <div class="player-signs-skeleton-main">
        <span class="player-signs-skeleton-name"></span>
        <div class="player-signs-skeleton-sign">${widths.map(width => `<span style="width:${width}%"></span>`).join('')}</div>
        <div class="player-signs-skeleton-meta"><span></span><span></span><span></span></div>
      </div>
    </li>`).join('')}
  </ol>
  <span class="visually-hidden" role="status">Loading signs...</span>`;
}

async function openPlayerSigns(username) {
  const overlay = $('#playerSignsOverlay');
  const content = $('#playerSignsContent');
  if (!overlay || !content) return;
  const requestId = state.playerSignsRequestId = (state.playerSignsRequestId || 0) + 1;
  $('#playerSignsTitle').textContent = `Signs with ${username}`;
  $('#playerSignsCount').innerHTML = '<span class="player-signs-skeleton-count" aria-hidden="true"></span>';
  content.innerHTML = renderPlayerSignsSkeleton();
  overlay.hidden = false;
  $('#playerSignsClose')?.focus();
  try {
    const payload = await fetchJson(`/api/area-explorer/signs?player=${encodeURIComponent(username)}`);
    if (requestId !== state.playerSignsRequestId || overlay.hidden) return;
    renderPlayerSigns(username, payload);
  } catch (err) {
    if (requestId !== state.playerSignsRequestId || overlay.hidden) return;
    $('#playerSignsCount').textContent = '';
    content.innerHTML = `<div class="player-signs-empty"><strong>Could not load signs</strong><p>${escapeHtml(err.message)}</p></div>`;
  }
}

/** A sign picked from the list: the Area Explorer opens on its server and dimension, centred on it. */
function showPlayerSignOnMap(find) {
  closePlayerSigns();
  closePlayerProfile({ restoreSeenSearch: false });
  const ae = areaExplorerState();
  const scope = `${find.server}|${find.dimension}`;
  if (ae.scope !== scope) {
    ae.scope = scope;
    ae.offset = 0;
    ae.view = null;
    ae.nearby = null;
    ae.areaSelection = null;
  }
  ae.pendingFocus = { scope, x: find.x, z: find.z, id: find.id };
  if (state.activeTab === 'area-explorer') loadAreaExplorer().catch(error => setBanner(`Could not load Area Explorer: ${error.message}`));
  else setActiveTab('area-explorer');
  // The tab may be closed to this account: nothing to focus later then
  if (state.activeTab !== 'area-explorer') ae.pendingFocus = null;
}

async function handlePlayerSignsClick(event) {
  const coords = event.target.closest('[data-copy-coords]');
  if (coords) {
    try {
      await writeClipboardText(coords.dataset.copyCoords);
      coords.classList.add('copied');
      setTimeout(() => coords.classList.remove('copied'), 1200);
    } catch { /* the coordinates stay on screen to copy by hand */ }
    return;
  }
  const item = event.target.closest('[data-find-id]');
  if (!item || !(event.target.closest('[data-area-select]') || !event.target.closest('button, a, pre'))) return;
  const find = (state.playerSigns || []).find(sign => sign.id === item.dataset.findId);
  if (find) showPlayerSignOnMap(find);
}

async function handlePlayerProfileClick(event) {
  if (event.target.closest('.chat-link')) return;
  const activityCell = event.target.closest('[data-activity-cell]');
  if (activityCell) {
    event.preventDefault();
    selectPlayerActivityCell(activityCell);
    return;
  }
  const signsButton = event.target.closest('[data-player-signs]');
  if (signsButton) {
    event.preventDefault();
    await openPlayerSigns(signsButton.dataset.playerSigns);
    return;
  }
  const skinsButton = event.target.closest('[data-player-skins]');
  if (skinsButton) {
    event.preventDefault();
    await openPlayerSkins(skinsButton.dataset.playerSkins);
    return;
  }
  const chatMessage = event.target.closest('[data-chat-message-id]');
  if (chatMessage) {
    event.preventDefault();
    await openChatContext(chatMessage.dataset.chatMessageId);
    return;
  }
  const loadMore = event.target.closest('[data-player-chat-more]');
  if (loadMore) {
    event.preventDefault();
    await loadMorePlayerMessages(loadMore);
    return;
  }
  const refreshButton = event.target.closest('[data-player-refresh-command]');
  if (refreshButton) {
    event.preventDefault();
    const command = refreshButton.dataset.playerRefreshCommand;
    const username = String(state.playerProfileLastPayload?.username || '');
    const refreshByCommand = {
      '!pt': { metric: 'playtime', label: 'Playtime' },
      '!jd': { metric: 'joinDate', label: 'Registration date' },
      '!seen': { metric: 'lastSeen', label: 'Last seen' },
      '!messages': { metric: 'messages', label: 'Chat messages' }
    };
    const refresh = refreshByCommand[command];
    if (!refresh || !/^[A-Za-z0-9_]{1,32}$/.test(username)) return;

    const startedAt = Date.now();
    refreshButton.disabled = true;
    refreshButton.classList.add('is-refreshing');
    refreshButton.setAttribute('aria-busy', 'true');
    try {
      await postJson('/api/chat/send', {
        message: `${command} ${username}`,
        playerInfoRefresh: {
          metric: refresh.metric,
          username
        },
        accountId: state.activeAccountId
      });
      if (refresh.metric === 'messages') {
        state.playerProfileMessageRefreshes.add(username.toLowerCase());
        refreshButton.remove();
      }
      setBanner(`${refresh.label} refresh requested for ${username}.`);
      schedulePlayerProfileRefresh(username);
    } catch (err) {
      setBanner(`Could not request player data: ${err.message}`);
    } finally {
      window.setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.classList.remove('is-refreshing');
        refreshButton.removeAttribute('aria-busy');
      }, Math.max(0, 650 - (Date.now() - startedAt)));
    }
    return;
  }
  const whitelistButton = event.target.closest('[data-player-whitelist-action]');
  if (whitelistButton) {
    event.preventDefault();
    if (state.currentUser?.role !== 'admin' || !state.playerProfileLastPayload) return;

    const action = whitelistButton.dataset.playerWhitelistAction;
    if (!['whitelist_add', 'whitelist_remove'].includes(action)) return;
    const username = state.playerProfileLastPayload.username;
    whitelistButton.disabled = true;
    try {
      await postJson('/api/admin/bot-command', {
        commandType: action,
        payload: { username },
        accountId: state.activeAccountId
      });
      const isWhitelisted = action === 'whitelist_add';
      state.playerProfileLastPayload.isWhitelisted = isWhitelisted;
      state.playerProfileSignature = '';
      replacePlayerProfileContent(state.playerProfileLastPayload);
      setBanner(`${username} ${isWhitelisted ? 'added to' : 'removed from'} whitelist.`);
      scheduleAdminControlRefresh();
    } catch (err) {
      whitelistButton.disabled = false;
      setBanner(`Could not ${action === 'whitelist_add' ? 'add' : 'remove'} ${username} ${action === 'whitelist_add' ? 'to' : 'from'} whitelist: ${err.message}`);
    }
    return;
  }
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
        payload: { username },
        accountId: state.activeAccountId
      });
      state.playerProfileLastPayload.isIgnored = action === 'ignore_chat';
      state.playerProfileSignature = '';
      replacePlayerProfileContent(state.playerProfileLastPayload);
      scheduleAdminControlRefresh();
    } catch (err) {
      ignoreButton.disabled = false;
      console.error(`Could not ${action === 'ignore_chat' ? 'ignore' : 'unignore'} ${username}:`, err);
    }
    return;
  }

  const toggle = event.target.closest('[data-profile-toggle]');
  if (!toggle) return;
  event.preventDefault();
  const profile = state.playerProfileLastPayload;
  if (!profile) return;
  if (toggle.dataset.profileToggle === 'registration-date') {
    state.playerProfileRegistrationDateMode = !state.playerProfileRegistrationDateMode;
    toggle.textContent = registrationProfileValue(profile);
    toggle.title = state.playerProfileRegistrationDateMode
      ? 'Show time since registration'
      : 'Show registration date';
  } else if (toggle.dataset.profileToggle === 'last-seen-date') {
    state.playerProfileLastSeenDateMode = !state.playerProfileLastSeenDateMode;
    toggle.textContent = lastSeenProfileValue(profile);
    toggle.title = state.playerProfileLastSeenDateMode
      ? 'Show time since last seen'
      : 'Show exact last seen date';
  } else {
    return;
  }
  state.playerProfileSignature = playerProfileSignature(profile);
}

function selectPlayerActivityCell(cell) {
  const activity = cell?.closest('.player-profile-activity');
  const selection = activity?.querySelector('[data-activity-selection]');
  if (!activity || !selection) return;
  activity.querySelectorAll('[data-activity-cell]').forEach(candidate => {
    const selected = candidate === cell;
    candidate.classList.toggle('is-selected', selected);
    candidate.setAttribute('aria-pressed', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  });
  const [period = '', ...details] = String(cell.dataset.activityLabel || '').split(' · ');
  selection.innerHTML = `<span>Selected</span><strong>${escapeHtml(period)}</strong><small>${escapeHtml(details.join(' · '))}</small>`;
}

function openWhisperFromProfile(username) {
  closePlayerProfile({ restoreSeenSearch: false });
  setWhisperOpen(true);
  openWhisperDialog(username).catch(err => setBanner(`Could not open dialog: ${err.message}`));
}

function setSeenSearchOpen(open) {
  const search = $('#seenSearch');
  const toggle = $('#seenSearchToggle');
  if (!search || !toggle) return;
  if (open) {
    setNavMenuOpen(false);
    setWhisperOpen(false);
    setMobileAccountSwitcherOpen(false);
    const rect = toggle.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    const targetTop = rect.top;
    const targetWidth = isMobile
      ? Math.max(0, window.innerWidth - 16)
      : Math.min(560, Math.max(0, window.innerWidth - 32));
    const targetLeft = isMobile ? 8 : (window.innerWidth - targetWidth) / 2;
    const transformOriginX = Math.max(0, Math.min(targetWidth, rect.left + rect.width / 2 - targetLeft));
    const collapsedScale = targetWidth > 0 ? Math.min(1, rect.width / targetWidth) : 1;
    search.style.setProperty('--seen-search-target-top', `${targetTop}px`);
    search.style.setProperty('--seen-search-transform-origin-x', `${transformOriginX}px`);
    search.style.setProperty('--seen-search-collapsed-scale', String(collapsedScale));
  } else {
    search.style.removeProperty('--seen-search-target-top');
    search.style.removeProperty('--seen-search-transform-origin-x');
    search.style.removeProperty('--seen-search-collapsed-scale');
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
  stopSeenOnlineTimer();
  if (suggestions) suggestions.hidden = true;
  state.seenPlayers = [];
  if (collapse) setSeenSearchOpen(false);
  if (collapse) {
    setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 80);
  }
}

function seenPlayerStatusText(player, now = Date.now()) {
  if (!player?.isOnline) return player?.lastSeen ? formatAgo(player.lastSeen) : 'never seen';
  const startedAt = new Date(player.onlineSince || 0).getTime();
  return Number.isFinite(startedAt) && startedAt > 0
    ? `online for ${formatDurationMs(Math.max(0, now - startedAt))}`
    : 'online now';
}

function updateSeenOnlineDurations() {
  const suggestions = $('#seenSuggestions');
  if (!suggestions || suggestions.hidden) return;
  const now = Date.now();
  suggestions.querySelectorAll('[data-seen-online-since]').forEach(status => {
    const startedAt = new Date(status.dataset.seenOnlineSince).getTime();
    if (Number.isFinite(startedAt) && startedAt > 0) {
      status.textContent = `online for ${formatDurationMs(Math.max(0, now - startedAt))}`;
    }
  });
}

function stopSeenOnlineTimer() {
  clearInterval(state.seenOnlineTimer);
  state.seenOnlineTimer = null;
}

function startSeenOnlineTimer() {
  stopSeenOnlineTimer();
  if (!state.seenPlayers.some(player => player.isOnline && player.onlineSince)) return;
  updateSeenOnlineDurations();
  state.seenOnlineTimer = setInterval(updateSeenOnlineDurations, 1_000);
}

function toggleSeenSearch() {
  const isOpen = $('#seenSearch')?.classList.contains('open');
  if (isOpen) clearSeenSearch({ collapse: true });
  else setSeenSearchOpen(true);
}

function renderSeenSuggestions(players) {
  const suggestions = $('#seenSuggestions');
  state.seenPlayers = players || [];
  stopSeenOnlineTimer();

  if (!suggestions) return;
  if (state.seenPlayers.length === 0) {
    suggestions.innerHTML = '<div class="seen-empty">No players found.</div>';
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = state.seenPlayers.map((player, index) => `
    <button class="seen-option" type="button" data-index="${index}">
      ${playerIdentity(player.username, 24, { status: player.isOnline ? 'online' : 'offline', uuid: player.uuid })}
      <span class="muted"${player.isOnline && player.onlineSince ? ` data-seen-online-since="${escapeHtml(player.onlineSince)}"` : ''}>${escapeHtml(seenPlayerStatusText(player))}</span>
    </button>
  `).join('');
  suggestions.hidden = false;
  startSeenOnlineTimer();
}

async function runSeenSearch(query) {
  const cleanQuery = query.trim();
  const suggestions = $('#seenSuggestions');
  if (cleanQuery.length < 1) {
    stopSeenOnlineTimer();
    if (suggestions) suggestions.hidden = true;
    state.seenPlayers = [];
    return;
  }

  try {
    const payload = await fetchJson(`/api/seen-search?query=${encodeURIComponent(cleanQuery)}`);
    renderSeenSuggestions(payload.players || []);
  } catch (err) {
    stopSeenOnlineTimer();
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
  const input = $('#seenSearchInput');
  const returnToSeenSearch = {
    query: input?.value || '',
    players: [...state.seenPlayers]
  };
  input?.blur();
  setSeenSearchOpen(false);
  openPlayerProfile(player.username, { returnToSeenSearch });
  setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 80);
}

function setWhisperOpen(open) {
  const panel = $('#whisperPanel');
  const toggle = $('#whisperToggle');
  const popover = $('#whisperPopover');
  if (!panel || !toggle || !popover) return;
  if (open && !activeAccountIsPrimary()) open = false;
  if (open) {
    setNavMenuOpen(false);
    clearSeenSearch({ collapse: true });
    setMobileAccountSwitcherOpen(false);
  }
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
  return `wm-whisper-last-seen-id:${username}:${state.activeAccountId || 'default'}`;
}

function whisperDialogReadStorageKey() {
  const username = String(state.currentUser?.username || 'anonymous').toLowerCase();
  return `wm-whisper-dialog-read-ids:${username}:${state.activeAccountId || 'default'}`;
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
      readState: state.whisperDialogReadIds,accountId:state.activeAccountId
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
    messageId: String(nextId),
    accountId:state.activeAccountId
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
  setWhisperAccent();
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
  if (title.dataset.renderSignature !== signature) {
    title.innerHTML = `
      ${playerIdentity(state.whisperTarget, 26, { status: isOnline ? 'online' : 'offline' })}
    `;
    title.dataset.renderSignature = signature;
  }
  applyWhisperAccent(state.whisperTarget);
}

async function loadWhisperOnlinePlayers({ force = false } = {}) {
  if (!activeAccountIsPrimary()) {
    state.whisperPlayers = [];
    state.whisperUnreadCount = 0;
    renderWhisperBadge();
    return false;
  }
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
  return true;
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

  const targetKey = String(state.whisperTarget || '').toLowerCase();
  const targetChanged = list.dataset.whisperTarget !== targetKey;
  const distanceFromBottom = list.scrollHeight - list.clientHeight - list.scrollTop;
  const shouldScrollToBottom = targetChanged || !list.childElementCount || distanceFromBottom <= 48;
  const previousScrollTop = list.scrollTop;

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
  list.dataset.whisperTarget = targetKey;
  if (shouldScrollToBottom) {
    list.scrollTop = list.scrollHeight;
  } else {
    list.scrollTop = previousScrollTop;
  }
}

async function loadWhisperDialog() {
  if (!activeAccountIsPrimary()) return false;
  if (!state.whisperTarget || !$('#whisperPanel')?.classList.contains('open')) return;
  const payload = await fetchJson(`/api/whisper/dialog?username=${encodeURIComponent(state.whisperTarget)}&limit=80`);
  mergeWhisperPlayerStatus(payload.player);
  renderWhisperPlayers();
  updateWhisperDialogTitle();
  renderWhisperMessages(payload.messages || []);
  return true;
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
  const claimKey = String(username || '').toLowerCase();
  if (claimKey && !state.whisperClaimedPlayers.has(claimKey)) {
    postJson('/api/whisper/claim', { username,accountId:state.activeAccountId }).then(() => {
      state.whisperClaimedPlayers.add(claimKey);
    }).catch(err => setBanner(`Could not claim private dialog: ${err.message}`));
  }
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
      message,
      accountId:state.activeAccountId
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
    await postJson('/api/whisper/dialog/delete', { username,accountId:state.activeAccountId });
    closeWhisperDialog();
    await loadWhisperOnlinePlayers();
  } catch (err) {
    setBanner(`Could not delete private chat: ${err.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function chatMessageUsernameKey(message) {
  if (message.type === 'activity' || message.type === 'flood' || message.type === 'server') return null;
  return String(message.username || 'Minecraft').trim().toLocaleLowerCase();
}

function createChatMessageElement(message, previousChatUsername, { isNew = false } = {}) {
  const id = String(message.id);
  const isActivity = message.type === 'activity';
  const isFloodNotice = message.type === 'flood';
  const isServerNotice = message.type === 'server';
  const isNotice = isFloodNotice || isServerNotice;
  const isBot = Boolean(message.isBot);
  const isNewPlayer = Boolean(message.isNewPlayer);
  const username = String(message.username || 'Minecraft');
  const normalizedUsername = username.trim().toLocaleLowerCase();
  const isContinuation = !isActivity
    && !isNotice
    && previousChatUsername !== null
    && normalizedUsername === previousChatUsername;
  const article = document.createElement('article');
  article.dataset.messageId = id;
  article.dataset.createdAt = String(message.createdAt || '');
  if (state.chatSearchQuery && !isActivity) article.dataset.openChatContext = id;
  const activityKind = isActivity && message.event === 'join' ? 'join' : 'leave';
  article.className = `chat-message${isActivity ? ` chat-activity chat-activity-${activityKind}` : ''}${isNotice ? ` chat-notice chat-notice-${message.type}` : ''}${isBot ? ' chat-message-bot' : ''}${isNewPlayer ? ' chat-message-new-player' : ''}${isContinuation ? ' chat-message-continuation' : ''}${isNew ? ' new-message' : ''}`;
  article.classList.toggle('reply-active', !isActivity && !isNotice && state.chatReplyActiveMessageId === id);
  const text = isActivity
    ? (message.event === 'join' ? 'joined the game' : 'left the game')
    : String(message.message || '');
  article.innerHTML = isActivity
    ? `<span class="chat-activity-mark" aria-hidden="true"></span>
       <div class="chat-activity-copy">
         <button class="chat-activity-player" type="button" data-player="${escapeHtml(username)}" aria-label="Open ${escapeHtml(username)} player profile">${escapeHtml(username)}</button>
         <span class="chat-text"></span>
       </div>
       <time class="chat-time">${formatChatTime(message.createdAt)}</time>`
    : isNotice
    ? `<span class="chat-notice-mark" aria-hidden="true"></span>
       <div class="chat-notice-copy">
         <strong>${isFloodNotice ? 'Flood protection' : 'SERVER'}</strong>
         <span class="chat-text"></span>
       </div>
       <time class="chat-time">${formatChatTime(message.createdAt)}</time>`
    : `<div class="chat-user">${isContinuation ? '' : playerIdentity(username, 28, { uuid: message.playerUuid })}</div>
       <div class="chat-message-body">
         ${isContinuation ? '' : `<div class="chat-message-head">
           <span class="chat-message-name">${escapeHtml(username)}</span>
           ${isBot ? '<span class="chat-bot-badge">BOT</span>' : ''}
         </div>`}
         <div class="chat-text"></div>
       </div>
       <div class="chat-meta">
         <button class="chat-reply-button" type="button" aria-label="Reply to ${escapeHtml(username)}" title="Reply"><img src="/logos/reply.png" alt="" aria-hidden="true"></button>
         <time class="chat-time">${formatChatTime(message.createdAt)}</time>
       </div>`;
  const chatText = article.querySelector('.chat-text');
  if (isActivity) chatText.textContent = text;
  else if (isFloodNotice) chatText.textContent = `${username}: ${text}`;
  else if (isServerNotice) chatText.textContent = text;
  else chatText.innerHTML = linkifyChatMessage(text);
  const replyButton = article.querySelector('.chat-reply-button');
  if (replyButton) {
    replyButton.dataset.chatReply = username;
    replyButton.dataset.chatReplyText = text;
  }
  return article;
}

// Describes how the rendered rows can become the next list without rebuilding
// all of them: rows trimmed from the top plus rows appended at the bottom, or
// a block of older rows prepended. Anything else needs a full rebuild.
function planChatListUpdate(previousIds, nextIds) {
  if (!previousIds.length || !nextIds.length) return null;
  const headIndex = previousIds.indexOf(nextIds[0]);
  if (headIndex >= 0) {
    const kept = previousIds.length - headIndex;
    if (kept <= nextIds.length) {
      let matches = true;
      for (let index = 0; index < kept; index++) {
        if (previousIds[headIndex + index] !== nextIds[index]) { matches = false; break; }
      }
      if (matches) return { type: 'append', trim: headIndex, appendFrom: kept };
    }
  }
  const prependCount = nextIds.length - previousIds.length;
  if (prependCount > 0) {
    for (let index = 0; index < previousIds.length; index++) {
      if (previousIds[index] !== nextIds[prependCount + index]) return null;
    }
    return { type: 'prepend', count: prependCount };
  }
  return null;
}

function renderChatMessages(messages, { scrollMode = 'preserve' } = {}) {
  const list = $('#chatList');
  if (!list) return;
  const safeMessages = Array.isArray(messages) ? messages.filter(message => message?.id != null) : [];
  // Search results and the live chat are different lists; a reset signature
  // (timezone or account change) forces every timestamp to be rebuilt.
  const renderKey = `query:${state.chatSearchQuery}`;
  const nextIds = safeMessages.map(message => String(message.id));

  if (!safeMessages.length) {
    const emptySignature = `${renderKey}:empty`;
    if (state.renderSignatures['#chatList'] === emptySignature) return;
    list.innerHTML = state.chatSearchQuery
      ? `<div class="empty">No archived messages contain “${escapeHtml(state.chatSearchQuery)}”.</div>`
      : '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>';
    list.dataset.empty = 'true';
    state.chatRenderedIds = [];
    state.renderSignatures['#chatList'] = emptySignature;
    return;
  }

  const canUpdateInPlace = state.renderSignatures['#chatList'] === renderKey && list.dataset.empty !== 'true';
  const plan = canUpdateInPlace ? planChatListUpdate(state.chatRenderedIds || [], nextIds) : null;
  if (plan?.type === 'append' && plan.trim === 0 && plan.appendFrom === nextIds.length) return;

  const distanceFromBottom = list.scrollHeight - list.clientHeight - list.scrollTop;
  const keepBottom = distanceFromBottom < 48;
  const previousScrollTop = list.scrollTop;
  const previousScrollHeight = list.scrollHeight;
  const previousIds = state.chatMessageIds;

  if (plan?.type === 'append') {
    for (let index = 0; index < plan.trim; index++) list.firstElementChild?.remove();
    const fragment = document.createDocumentFragment();
    let previousChatUsername = plan.appendFrom > 0 ? chatMessageUsernameKey(safeMessages[plan.appendFrom - 1]) : null;
    for (let index = plan.appendFrom; index < safeMessages.length; index++) {
      const message = safeMessages[index];
      fragment.append(createChatMessageElement(message, previousChatUsername, {
        isNew: state.chatInitialized && !previousIds.has(String(message.id))
      }));
      previousChatUsername = chatMessageUsernameKey(message);
    }
    list.append(fragment);
    // A trimmed top can leave a continuation row without its avatar and name.
    const firstRow = list.firstElementChild;
    if (plan.trim > 0 && firstRow?.classList.contains('chat-message-continuation')) {
      firstRow.replaceWith(createChatMessageElement(safeMessages[0], null));
    }
  } else if (plan?.type === 'prepend') {
    const fragment = document.createDocumentFragment();
    let previousChatUsername = null;
    for (let index = 0; index < plan.count; index++) {
      fragment.append(createChatMessageElement(safeMessages[index], previousChatUsername));
      previousChatUsername = chatMessageUsernameKey(safeMessages[index]);
    }
    const formerFirstRow = list.firstElementChild;
    list.insertBefore(fragment, formerFirstRow);
    // The former first row may now continue the last prepended message.
    formerFirstRow?.replaceWith(createChatMessageElement(safeMessages[plan.count], previousChatUsername));
  } else {
    const fragment = document.createDocumentFragment();
    let previousChatUsername = null;
    safeMessages.forEach(message => {
      fragment.append(createChatMessageElement(message, previousChatUsername, {
        isNew: state.chatInitialized && !previousIds.has(String(message.id))
      }));
      previousChatUsername = chatMessageUsernameKey(message);
    });
    delete list.dataset.empty;
    list.replaceChildren(fragment);
  }
  state.chatRenderedIds = nextIds;
  state.renderSignatures['#chatList'] = renderKey;

  requestAnimationFrame(() => {
    if (scrollMode === 'prepend') {
      list.scrollTop = previousScrollTop + Math.max(0, list.scrollHeight - previousScrollHeight);
    } else if (scrollMode === 'bottom' || keepBottom) {
      list.scrollTop = list.scrollHeight;
    } else if (scrollMode === 'top') {
      list.scrollTop = 0;
    } else {
      list.scrollTop = previousScrollTop;
    }
    updateChatDateIndicator();
  });
}

function mergeChatMessagePages(...pages) {
  const messages = new Map();
  pages.flat().forEach(message => {
    if (message?.id != null) messages.set(String(message.id), message);
  });
  return [...messages.values()].sort((first, second) => {
    const timeDifference = new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    if (timeDifference) return timeDifference;
    return String(first.id).localeCompare(String(second.id), undefined, { numeric: true });
  });
}

function renderChat(payload, { mode = 'replace', scrollMode = null } = {}) {
  if (payload.totals) {
    setRollingNumber('#chat24h', payload.totals.last24h);
    setRollingNumber('#activeChatters', payload.totals.activeChatters24h);
    setRollingNumber('#chatAllTime', payload.totals.allTime);
  }

  const incomingMessages = Array.isArray(payload.messages) ? payload.messages : [];
  let messages = mode === 'prepend'
    ? mergeChatMessagePages(incomingMessages, state.chatMessages)
    : mode === 'mergeLatest'
      ? mergeChatMessagePages(state.chatMessages, incomingMessages)
      : incomingMessages;
  // Live messages would otherwise grow the list forever. While the reader
  // follows the bottom, drop the oldest rows; scrolling up reloads them.
  const list = $('#chatList');
  const followsBottom = list && list.scrollHeight - list.clientHeight - list.scrollTop < 48;
  let trimmedOlderMessages = false;
  if (mode === 'mergeLatest' && followsBottom && messages.length > CHAT_HISTORY_LIMIT) {
    messages = messages.slice(-CHAT_HISTORY_LIMIT);
    trimmedOlderMessages = true;
  }
  if (mode === 'replace') {
    state.chatSearchQuery = String(payload.searchQuery || '');
  }
  state.chatMessages = messages;
  renderChatMessages(messages, {
    scrollMode: scrollMode || (mode === 'prepend' ? 'prepend' : 'preserve')
  });
  if (mode === 'replace') ensureInitialChatScroll();
  updateChatScrollButton();
  state.chatMessageIds = new Set(messages.map(message => String(message.id)));
  if (payload.latestId != null) state.chatLatestId = String(payload.latestId);
  if (mode !== 'mergeLatest') {
    state.chatHasMore = Boolean(payload.hasMore);
    state.chatNextBeforeId = payload.nextBeforeId == null ? null : String(payload.nextBeforeId);
  } else if (trimmedOlderMessages) {
    state.chatHasMore = true;
    state.chatNextBeforeId = String(messages[0].id);
  }
  state.chatInitialized = true;

  if (Array.isArray(payload.topChatters)) {
    const topChatters = payload.topChatters;
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
  }

  if (Array.isArray(payload.hourly)) state.charts.chatHourly = payload.hourly;
  if (Array.isArray(payload.daily)) state.charts.chatDaily = payload.daily;
  if (Array.isArray(payload.monthly)) state.charts.chatMonthly = payload.monthly;
  if (payload.hourly || payload.daily || payload.monthly) {
    setChartLoading('chatHourlyChart', false);
    redrawCharts();
  }
}

function renderLiveChat(payload) {
  renderChat(payload, { mode: state.chatInitialized ? 'mergeLatest' : 'replace' });
}

function handleChatReplyClick(event) {
  if (event.target.closest('.chat-link')) return;
  const contextMessage = event.target.closest('[data-open-chat-context]');
  if (contextMessage && !event.target.closest('[data-chat-reply]')) {
    openChatContext(contextMessage.dataset.openChatContext)
      .catch(err => setBanner(`Could not open chat context: ${err.message}`));
    return;
  }
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
  if (event.target.closest('.chat-link')) return;
  // Player avatars open profiles on tap. Do not use that tap merely to reveal
  // the reply action for the surrounding chat message.
  const player = event.target.closest('[data-player]');
  if (player) {
    state.chatPlayerTap = {
      pointerId: event.pointerId,
      username: player.dataset.player,
      startX: event.clientX,
      startY: event.clientY
    };
    return;
  }
  state.chatPlayerTap = null;
  if (event.target.closest('[data-chat-reply]')) return;
  const message = event.target.closest('.chat-message:not(.chat-activity)');
  const list = event.currentTarget;
  if (!message || !list.contains(message)) return;

  state.chatReplyActiveMessageId = message.dataset.messageId || null;
  list.querySelectorAll('.chat-message.reply-active').forEach(node => {
    if (node !== message) node.classList.remove('reply-active');
  });
  message.classList.add('reply-active');
}

function handleChatPlayerPointerMove(event) {
  const tap = state.chatPlayerTap;
  if (!tap || tap.pointerId !== event.pointerId) return;
  if (Math.hypot(event.clientX - tap.startX, event.clientY - tap.startY) > 10) {
    state.chatPlayerTap = null;
  }
}

function handleChatPlayerPointerEnd(event) {
  const tap = state.chatPlayerTap;
  state.chatPlayerTap = null;
  if (event.type === 'pointercancel' || !tap || tap.pointerId !== event.pointerId) return;
  const player = event.target.closest('[data-player]');
  if (!player || player.dataset.player !== tap.username) return;

  event.preventDefault();
  event.stopPropagation();
  state.chatPlayerClickSuppression = {
    username: tap.username,
    until: Date.now() + 700
  };
  openPlayerProfile(tap.username).catch(err => setBanner(`Could not open player profile: ${err.message}`));
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

function renderEquipmentSlot(label, slot, item, tooltipPrefix, { inventoryControl = false } = {}) {
  return `
    <div class="equipment-slot">
      <span class="inventory-slot-label">${escapeHtml(label)}</span>
      ${renderInventorySlot(slot, item, { label: `${label} slot`, tooltipPrefix, inventoryControl })}
    </div>
  `;
}

function renderBotInventory(selector, bot, connected) {
  const inventory = (bot?.inventory || []).map(normalizeInventoryItem).filter(Boolean);
  const armor = equipmentBySlot(bot?.armor || []);
  const heldItem = normalizeInventoryItem(bot?.heldItem);
  const offhandItem = inventory.find(item => Number(item.slot) === 45);
  const slots = inventoryGridSlots(inventory);
  const inventoryControl = connected && state.currentUser?.role === 'admin';
  if (!connected && state.inventoryMoveSelection) clearInventoryMoveSelection();
  const hint = $('#botInventoryHint');
  if (hint && !state.inventoryMovePending && !state.inventoryMoveSelection) {
    hint.textContent = inventoryControl
      ? 'Click an item for stats, Move and Drop. You can also drag it directly to another slot.'
      : 'Latest item snapshot reported by the Minecraft bot.';
    hint.classList.remove('inventory-hint-error');
  }

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
    <div class="bot-inventory-layout${state.inventoryMoveSelection ? ' inventory-move-active' : ''}${state.inventoryMovePending ? ' inventory-move-pending' : ''}">
      <div class="bot-equipment-panel" aria-label="Bot equipment">
        ${renderEquipmentSlot('Helmet', 5, armor.get(5), 'bot-equipment', { inventoryControl })}
        ${renderEquipmentSlot('Chest / Elytra', 6, armor.get(6), 'bot-equipment', { inventoryControl })}
        ${renderEquipmentSlot('Leggings', 7, armor.get(7), 'bot-equipment', { inventoryControl })}
        ${renderEquipmentSlot('Boots', 8, armor.get(8), 'bot-equipment', { inventoryControl })}
      </div>
      <div class="bot-hand-panel" aria-label="Bot hands">
        <div class="inventory-offhand">
          <span class="inventory-slot-label">Offhand</span>
          ${renderInventorySlot(45, offhandItem, { tooltipPrefix: 'bot-inventory', label: 'Offhand slot', inventoryControl })}
        </div>
        ${renderEquipmentSlot('Held', 'held', heldItem, 'bot-held')}
      </div>
      <div class="inventory-layout bot-main-inventory">
        <div class="inventory-grid" aria-label="Bot inventory slots">
          ${slots.map(({ slot, item, fallback }) => renderInventorySlot(slot, item, { fallback, tooltipPrefix: 'bot-inventory', inventoryControl: inventoryControl && !fallback })).join('')}
        </div>
      </div>
    </div>
  `;

  renderStable(selector, html, {
    inventoryControl,
    inventory: inventory.map(item => [item.name, item.displayName, item.label, item.count, item.slot, item.remainingPercent]),
    armor: (bot?.armor || []).map(item => [item.name, item.displayName, item.count, item.slot, item.remainingPercent]),
    heldItem: heldItem ? [heldItem.name, heldItem.displayName, heldItem.count, heldItem.slot, heldItem.remainingPercent] : null
  });
}

function renderBotStats(payload) {
  const bot = payload.bot || null;
  syncFarmLaunchFailureToast(bot);
  const connected = Boolean(bot?.connected);
  state.liveNearbyPlayers = connected && Array.isArray(bot?.nearbyPlayers) ? bot.nearbyPlayers : [];
  const livePlayerCount = connected && Number.isFinite(Number(bot?.playerCount))
    ? Number(bot.playerCount)
    : null;
  $('#onlinePlayers').textContent = livePlayerCount == null ? '-' : formatNumber(livePlayerCount);
  $('#totalPlayers').textContent = connected ? 'live server total' : 'server unavailable';
  const displayedStatus = !connected && bot?.status === 'connected' ? 'stopped' : bot?.status || 'unknown';
  $('#botConnectionState').textContent = displayedStatus;
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

  if (!state.inventoryMovePending) renderBotInventory('#botInventory', bot, connected);

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

function formatMobLabel(value) {
  return String(value || '')
    .replace(/^minecraft:/, '')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const KILL_AURA_RANGE_MIN = 0.5;
const KILL_AURA_RANGE_MAX = 3;

function normalizeKillAuraRangeValue(value, fallback = KILL_AURA_RANGE_MAX) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
  return Number(Math.max(KILL_AURA_RANGE_MIN, Math.min(KILL_AURA_RANGE_MAX, resolved || KILL_AURA_RANGE_MAX)).toFixed(1));
}

function renderKillAuraRangeControl(value, { status = null } = {}) {
  const range = normalizeKillAuraRangeValue(value);
  const input = $('#killAuraAttackRange');
  const output = $('#killAuraRangeValue');
  const statusNode = $('#killAuraRangeStatus');
  const progress = ((range - KILL_AURA_RANGE_MIN) / (KILL_AURA_RANGE_MAX - KILL_AURA_RANGE_MIN)) * 100;
  if (input) {
    input.value = range.toFixed(1);
    input.style.setProperty('--range-progress', `${progress}%`);
    input.setAttribute('aria-valuetext', `${range.toFixed(1)} blocks`);
  }
  if (output) output.textContent = `${range.toFixed(1)} blocks`;
  const detail = $('#killAuraDetailRange');
  if (detail) detail.textContent = `${range.toFixed(1)} blocks`;
  if (statusNode && status != null) statusNode.textContent = status;
}

function resetKillAuraRangeEditor() {
  clearTimeout(state.killAuraRangeSaveTimer);
  state.killAuraRangeSaveTimer = null;
  state.killAuraRangeDirty = false;
  state.killAuraRangeSaving = false;
  state.killAuraRangeSaveQueued = false;
  state.killAuraRangeGeneration += 1;
  renderKillAuraRangeControl(KILL_AURA_RANGE_MAX, { status: 'Loading saved range…' });
}

function scheduleKillAuraRangeSave(delay = 350) {
  clearTimeout(state.killAuraRangeSaveTimer);
  state.killAuraRangeSaveTimer = setTimeout(() => {
    state.killAuraRangeSaveTimer = null;
    saveKillAuraAttackRange().catch(error => setBanner(`Could not save Kill Aura range: ${error.message}`));
  }, delay);
}

function handleKillAuraRangeInput(event) {
  const value = normalizeKillAuraRangeValue(event.currentTarget.value);
  state.killAuraRangeDirty = true;
  renderKillAuraRangeControl(value, { status: 'Release to save · applies immediately.' });
  scheduleKillAuraRangeSave(450);
}

async function saveKillAuraAttackRange() {
  if (state.currentUser?.role !== 'admin') return;
  if (state.killAuraRangeSaving) {
    state.killAuraRangeSaveQueued = true;
    return;
  }

  const input = $('#killAuraAttackRange');
  if (!input) return;
  const value = normalizeKillAuraRangeValue(input.value);
  const accountId = state.activeAccountId;
  const generation = state.killAuraRangeGeneration;
  state.killAuraRangeSaving = true;
  state.killAuraRangeSaveQueued = false;
  renderKillAuraRangeControl(value, { status: `Saving ${value.toFixed(1)} blocks…` });

  try {
    const queued = await postJson('/api/admin/bot-command', {
      commandType: 'kill_aura_range',
      payload: { value },
      accountId
    });
    await waitForAdminBotCommand(queued.command.id);
    if (generation !== state.killAuraRangeGeneration || accountId !== state.activeAccountId) return;

    const currentValue = normalizeKillAuraRangeValue(input.value);
    if (state.killAuraData?.state) state.killAuraData.state.attackRange = value;
    if (currentValue === value) {
      state.killAuraRangeDirty = false;
      renderKillAuraRangeControl(value, { status: 'Saved · applies immediately.' });
    } else {
      state.killAuraRangeSaveQueued = true;
    }
  } catch (error) {
    if (generation === state.killAuraRangeGeneration && accountId === state.activeAccountId) {
      state.killAuraRangeDirty = false;
      const savedValue = normalizeKillAuraRangeValue(state.killAuraData?.state?.attackRange);
      renderKillAuraRangeControl(savedValue, { status: 'Save failed · previous value restored.' });
      setBanner(`Could not save Kill Aura range: ${error.message}`);
    }
  } finally {
    if (generation === state.killAuraRangeGeneration && accountId === state.activeAccountId) {
      state.killAuraRangeSaving = false;
      if (state.killAuraRangeSaveQueued) {
        state.killAuraRangeSaveQueued = false;
        scheduleKillAuraRangeSave(0);
      }
    }
  }
}

function updateKillAuraSelectionSummary() {
  const summary = $('#killAuraSelectionSummary');
  const count = state.killAuraSelectedMobs.size;
  const suffix = state.killAuraTargetsDirty ? ' · unsaved changes' : '';
  if (summary) {
    summary.textContent = count
      ? `${count} target${count === 1 ? '' : 's'} selected${suffix}`
      : `No targets selected${suffix}`;
  }
  const dropdownLabel = $('#killAuraMobDropdownLabel');
  if (dropdownLabel) {
    dropdownLabel.textContent = count
      ? `${count} target${count === 1 ? '' : 's'}`
      : 'Choose targets';
  }
  const controlMeta = $('#killAuraControlMeta');
  if (controlMeta) {
    const enabled = Boolean(state.killAuraData?.state?.enabled);
    controlMeta.textContent = `${enabled ? 'Enabled' : 'Disabled'} · ${count || 'No'} target${count === 1 ? '' : 's'}${state.killAuraTargetsDirty ? ' · Unsaved' : ''}`;
  }
  const selectedCount = $('#killAuraSelectedCount');
  if (selectedCount) selectedCount.textContent = formatNumber(count);
  const selectedMeta = $('#killAuraSelectedMeta');
  if (selectedMeta) selectedMeta.textContent = state.killAuraTargetsDirty
    ? 'unsaved selection'
    : `target ${count === 1 ? 'type' : 'types'}`;
  const detailTargets = $('#killAuraDetailTargets');
  if (detailTargets) detailTargets.textContent = formatNumber(count);
}

function renderKillAuraMobList() {
  const container = $('#killAuraMobList');
  if (!container) return;
  const mobs = state.killAuraData?.mobs || [];
  const query = String($('#killAuraSearch')?.value || '').trim().toLowerCase();
  const visible = mobs.filter(mob =>
    !query || mob.name.toLowerCase().includes(query) || mob.id.toLowerCase().includes(query)
  );
  container.innerHTML = visible.length
    ? visible.map(mob => `
      <label class="kill-aura-mob-option">
        <input type="checkbox" value="${escapeHtml(mob.id)}" ${state.killAuraSelectedMobs.has(mob.id) ? 'checked' : ''}>
        <span>${escapeHtml(mob.name)}</span>
        <small>${escapeHtml(mob.category)}</small>
      </label>
    `).join('')
    : '<div class="empty">No matching targets.</div>';
  updateKillAuraSelectionSummary();
}

function renderKillAura(payload = {}) {
  state.killAuraData = payload;
  state.charts.killAuraHourly = payload.killHistory?.hourly || [];
  state.charts.killAuraDaily = payload.killHistory?.daily || [];
  state.charts.killAuraMonthly = payload.killHistory?.monthly || [];
  setChartLoading('killAuraKillsChart', false);
  const aura = payload.state || {};
  if (!state.killAuraRangeDirty && !state.killAuraRangeSaving) {
    renderKillAuraRangeControl(aura.attackRange, { status: 'Saved · applies immediately.' });
  }
  const stateLabel = aura.active ? 'Active' : aura.enabled ? 'Waiting' : 'Disabled';
  const auraPanel = $('#tab-kill-aura');
  if (auraPanel) auraPanel.dataset.auraState = aura.active ? 'active' : aura.enabled ? 'waiting' : 'disabled';
  $('#killAuraState').textContent = stateLabel;
  $('#killAuraUpdated').textContent = `last update: ${formatDate(aura.observedAt || aura.updatedAt)}`;
  setRollingNumber('#killAuraSessionKills', aura.sessionKills || 0);
  setRollingNumber('#killAuraTotalKills', payload.totalKills || 0);
  $('#killAuraWeapon').textContent = aura.currentWeapon ? formatMobLabel(aura.currentWeapon) : 'None';
  const target = aura.currentTarget;
  const targetLabel = target?.username || target?.displayName || target?.name;
  $('#killAuraTarget').textContent = target
    ? `target: ${formatMobLabel(targetLabel)}${target.distance == null ? '' : ` · ${target.distance} blocks`}`
    : 'target: none';
  const detailTarget = $('#killAuraDetailTarget');
  if (detailTarget) detailTarget.textContent = target
    ? `${formatMobLabel(targetLabel)}${target.distance == null ? '' : ` · ${target.distance} blocks`}`
    : 'None';

  const toggle = $('#killAuraToggleButton');
  if (toggle) {
    toggle.textContent = aura.enabled ? 'Disable Kill Aura' : 'Enable Kill Aura';
    toggle.classList.toggle('danger-button', Boolean(aura.enabled));
    toggle.classList.toggle('aura-primary-button', !aura.enabled);
    toggle.disabled = !aura.enabled && !(aura.selectedMobs || []).length && !state.killAuraSelectedMobs.size;
  }

  const criticalsEnabled = Boolean(aura.criticalsEnabled);
  const criticalsButton = $('#killAuraCriticalsButton');
  if (criticalsButton) {
    criticalsButton.textContent = `Criticals: ${criticalsEnabled ? 'On' : 'Off'}`;
    criticalsButton.setAttribute('aria-pressed', String(criticalsEnabled));
    criticalsButton.classList.toggle('ghost-button', !criticalsEnabled);
  }
  const criticalsStatus = $('#killAuraCriticalsStatus');
  if (criticalsStatus) {
    criticalsStatus.textContent = criticalsEnabled
      ? 'Packet mode enabled for living targets.'
      : 'Packet mode for living targets.';
  }
  const detailCriticals = $('#killAuraDetailCriticals');
  if (detailCriticals) detailCriticals.textContent = criticalsEnabled ? 'Packet · On' : 'Off';

  if (!state.killAuraTargetsDirty) {
    state.killAuraSelectedMobs = new Set(aura.selectedMobs || []);
  }
  renderKillAuraMobList();

  const killed = (payload.mobs || [])
    .filter(mob => Number(mob.kills) > 0)
    .sort((first, second) => Number(second.kills) - Number(first.kills) || first.name.localeCompare(second.name));
  const historyCount = $('#killAuraHistoryCount');
  if (historyCount) historyCount.textContent = `${killed.length} target ${killed.length === 1 ? 'type' : 'types'}`;
  renderStable('#killAuraKillStats', killed.length
    ? killed.map((mob, index) => `
      <div class="rank-item">
        <span class="rank-index">${index + 1}</span>
        <span class="aura-mob-name"><img src="${minecraftIconUrl('mob', mob.id) || '/items/Target.png'}" alt="" loading="lazy" data-minecraft-mob-icon data-fallback-src="/items/Target.png"><span>${escapeHtml(mob.name)}</span></span>
        <strong>${formatNumber(mob.kills)}</strong>
      </div>
    `).join('')
    : '<div class="empty">No Kill Aura kills recorded yet.</div>',
    killed.map(mob => [mob.id, mob.kills])
  );
  redrawCharts();
}

// Area Explorer: what the OnFocus mod finds (bases, markers, loot, signs), its live run and the
// Xaero map it sends. The map is on top; the finds, the run and the mod's tokens under it.

const AREA_EXPLORER_PAGE_SIZE = 50;
const AREA_EXPLORER_KIND_LABELS = Object.freeze({ BASE: 'Base', ITEM: 'Loot', SIGN: 'Sign', MARKER: 'Marker' });
const AREA_EXPLORER_PHASES = Object.freeze({
  SCAN: 'Reading the map', SWEEP: 'Sweeping', SETTLE: 'Letting the map catch up', CLEANUP: 'Cleaning up gaps',
  SPIRAL: 'Spiralling out', IDLE: 'Stopped'
});
// The map shows a square territory around 0, 0, and nothing past it: its tiles, finds and runs.
// Picked by its radius: ±30k is -30,000 to 30,000 each way. ae.extent is the side, twice that.
const AREA_EXPLORER_RADII = Object.freeze([30_000, 50_000, 100_000]);
// Signs under loot under markers under bases: the rarer, the higher
// Markers of structures that stay where they are: no Remove (the site refuses it too)
const AREA_EXPLORER_PERMANENT_MARKERS = Object.freeze(['End Portal', 'End Gateway', 'End City', 'Ancient City', 'Trial Chamber']);
const AREA_EXPLORER_KIND_ORDER = Object.freeze({ SIGN: 0, ITEM: 1, MARKER: 2, BASE: 3 });
// What the map's marker checkboxes switch: the kinds, with End Portals apart from the other markers.
// Only End Portals are on to begin with; a find picked from the list shows by itself whatever they say.
const AREA_EXPLORER_MAP_LAYERS = Object.freeze(['BASE', 'END_PORTAL', 'MARKER', 'ITEM', 'SIGN']);
const AREA_EXPLORER_DEFAULT_LAYERS = Object.freeze(['END_PORTAL']);
// The right-click menu's "Show markers within 100 blocks": every find that close to the spot, whatever the checkboxes say
const AREA_EXPLORER_NEARBY_RADIUS = 100;
const AREA_EXPLORER_MAX_SCALE = 16;

function areaExplorerState() {
  if (!state.areaExplorer) {
    state.areaExplorer = {
      scope: '', kind: '', markerName: '', q: '', offset: 0, total: 0, summary: null, mapScopes: [],
      points: [], pointsScope: null, view: null, selectedId: null, searchTimer: null, mapBound: false, loadedAt: 0,
      tiles: new Map(), drawQueued: false, regionMaps: new Map(), dusk: null, duskLayer: null, regionMapEpoch: 0, colors: null, colorsTheme: null,
      findsDirty: false, tokensDirty: true, newFindsAbove: 0, versions: null,
      night: readAreaExplorerSetting('areaExplorerNight', 'false') === 'true',
      // Flown-over grids by token: { version, coverage, image } - fetched when a run's version moves on
      coverage: new Map(),
      // The area picked on the map for a mod to explore: block corners, still being dragged out while picking
      areaSelection: null,
      // The spot picked with "Show markers within 100 blocks": { x, z }, or null
      nearby: null,
      logFilter: '', logEvents: [], logHasMore: false, logServer: null, logRequestId: 0,
      showFinds: readAreaExplorerSetting('areaExplorerShowFinds', 'true') !== 'false',
      visibleKinds: readAreaExplorerMarkerKinds(),
      sort: ['newest', 'nearest', 'name'].includes(readAreaExplorerSetting('areaExplorerSort', 'newest')) ? readAreaExplorerSetting('areaExplorerSort', 'newest') : 'newest',
      extent: readAreaExplorerExtent()
    };
  }
  return state.areaExplorer;
}

function readAreaExplorerMarkerKinds() {
  try {
    // Saved under a new name since End Portals got their own checkbox: everyone starts from End Portals only
    const kinds = JSON.parse(readAreaExplorerSetting('areaExplorerMapLayers', 'null'));
    if (Array.isArray(kinds)) return AREA_EXPLORER_MAP_LAYERS.filter(kind => kinds.includes(kind));
  } catch { /* Ignore malformed saved preferences. */ }
  return [...AREA_EXPLORER_DEFAULT_LAYERS];
}

/** The checkbox a point is under: its kind, or END_PORTAL for an End Portal marker. */
function areaExplorerPointLayer(point) {
  return point.kind === 'MARKER' && point.name === 'End Portal' ? 'END_PORTAL' : point.kind;
}

function isAreaExplorerPointNearby(point) {
  const nearby = areaExplorerState().nearby;
  return !!nearby && Math.hypot(point.x - nearby.x, point.z - nearby.z) <= AREA_EXPLORER_NEARBY_RADIUS;
}

/**
 * The find picked from the list or the map, and those around the spot picked from the menu,
 * always show, even with their checkbox off or markers hidden.
 */
function isAreaExplorerPointVisible(point) {
  const ae = areaExplorerState();
  if (point.id === ae.selectedId || isAreaExplorerPointNearby(point)) return true;
  return ae.showFinds && (ae.visibleKinds || AREA_EXPLORER_DEFAULT_LAYERS).includes(areaExplorerPointLayer(point));
}

function renderAreaExplorerMarkerVisibility() {
  const ae = areaExplorerState();
  const kinds = ae.visibleKinds || AREA_EXPLORER_DEFAULT_LAYERS;
  $$('[data-area-visible-kind]').forEach(input => { input.checked = kinds.includes(input.dataset.areaVisibleKind); });
  for (const [name, layers] of Object.entries({ base: ['BASE'], marker: ['END_PORTAL', 'MARKER'], item: ['ITEM'], sign: ['SIGN'] })) {
    const legend = $(`.area-explorer-map-legend .legend-${name}`);
    if (legend) legend.hidden = !ae.showFinds || !layers.some(layer => kinds.includes(layer));
  }
}

function setAreaExplorerMarkerKind(kind, visible) {
  const ae = areaExplorerState();
  const kinds = new Set(ae.visibleKinds || AREA_EXPLORER_DEFAULT_LAYERS);
  if (visible) kinds.add(kind);
  else kinds.delete(kind);
  ae.visibleKinds = AREA_EXPLORER_MAP_LAYERS.filter(item => kinds.has(item));
  saveAreaExplorerSetting('areaExplorerMapLayers', JSON.stringify(ae.visibleKinds));
  setAreaExplorerFindsVisible(ae.visibleKinds.length > 0);
}

function closeAreaExplorerMarkerFilters({ restoreFocus = false } = {}) {
  $('#areaExplorerMarkerFilters').hidden = true;
  $('#areaExplorerToggleFinds').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#areaExplorerToggleFinds').focus({ preventScroll: true });
}

function bindAreaExplorerVisibility() {
  const eye = $('#areaExplorerToggleFinds');
  const filters = $('#areaExplorerMarkerFilters');
  let timer = null, held = false, start = null, moved = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const open = () => {
    closeAreaExplorerMenu();
    renderAreaExplorerMarkerVisibility();
    filters.hidden = false;
    eye.setAttribute('aria-expanded', 'true');
    filters.querySelector('input')?.focus({ preventScroll: true });
  };
  eye.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    cancel();
    held = moved = false;
    start = [event.clientX, event.clientY];
    eye.setPointerCapture(event.pointerId);
    timer = setTimeout(() => { held = true; open(); }, 450);
  });
  eye.addEventListener('pointermove', event => {
    if (start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 8) { moved = true; cancel(); }
  });
  eye.addEventListener('pointerup', () => { cancel(); start = null; });
  eye.addEventListener('pointercancel', () => { cancel(); start = null; moved = true; });
  eye.addEventListener('lostpointercapture', cancel);
  eye.addEventListener('click', () => {
    if (held || moved) { held = moved = false; return; }
    closeAreaExplorerMarkerFilters();
    setAreaExplorerFindsVisible(!areaExplorerState().showFinds);
  });
  eye.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); held = true; open(); });
  eye.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); open(); }
  });
  filters.addEventListener('change', event => {
    const input = event.target.closest('[data-area-visible-kind]');
    if (input) setAreaExplorerMarkerKind(input.dataset.areaVisibleKind, input.checked);
  });
  filters.querySelector('[data-area-close-filters]').addEventListener('click', () => closeAreaExplorerMarkerFilters({ restoreFocus: true }));
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#areaExplorerMarkerFilters, #areaExplorerToggleFinds')) closeAreaExplorerMarkerFilters();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !filters.hidden) { event.preventDefault(); closeAreaExplorerMarkerFilters({ restoreFocus: true }); }
  });
}

function focusAreaExplorerPlayer() {
  const live = areaExplorerLiveStatus();
  if (!Number.isFinite(live?.x) || !Number.isFinite(live?.z)) return;
  selectAreaExplorerFind(null);
  focusAreaExplorerMap(live.x, live.z);
  if (!live.online) showAreaExplorerNote(`Last reported position: ${areaExplorerFoundAgo(live.updatedAt)}`);
}

function readAreaExplorerSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function saveAreaExplorerSetting(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* remembered for this visit only */ }
}

function readAreaExplorerExtent() {
  const saved = Number(readAreaExplorerSetting('areaExplorerRadius', ''));
  return 2 * (AREA_EXPLORER_RADII.includes(saved) ? saved : AREA_EXPLORER_RADII[0]);
}

function areaExplorerScopeParams(extra = {}) {
  const ae = areaExplorerState();
  const [server = '', dimension = ''] = ae.scope.split('|');
  const params = new URLSearchParams();
  if (server) params.set('server', server);
  if (dimension) params.set('dimension', dimension);
  for (const [key, value] of Object.entries(extra)) if (value !== '' && value !== null && value !== undefined) params.set(key, value);
  return params.toString();
}

function prettyDimension(id) {
  return String(id || '').split('_').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

/** The kind of marker picked, only while Markers are shown. */
function areaExplorerMarkerFilter() {
  const ae = areaExplorerState();
  return ae.kind === 'MARKER' ? ae.markerName : '';
}

function areaExplorerFindCount(scope) {
  return scope.bases + scope.signs + scope.items + (scope.markers || 0);
}

/**
 * Opening the page loads everything; a live update only the summary and the runs, plus the finds
 * when the mod sent new ones and the tokens when one was revoked - not thousands of map points
 * every half minute the mod reports where it is.
 */
async function loadAreaExplorer({ full = true } = {}) {
  if (!state.currentUser) return;
  const ae = areaExplorerState();
  // Refreshes can overlap while the mod uploads: an older answer never replaces a newer one
  const requestId = (ae.summaryRequestId || 0) + 1;
  ae.summaryRequestId = requestId;
  const [summary, mapScopes] = await Promise.all([
    fetchJson('/api/area-explorer/summary'), fetchJson('/api/area-explorer/map/scopes'),
    // The site's item pictures, for the finds' and highlights' icons
    ensureItemIcons().catch(() => null)
  ]);
  if (ae.summaryRequestId !== requestId) return;
  summary.statuses = summary.statuses.map(status => {
    const current = ae.summary?.statuses.find(item => item.tokenId === status.tokenId);
    return current && new Date(current.updatedAt) > new Date(status.updatedAt) ? current : status;
  });
  ae.summary = summary;
  ae.mapScopes = mapScopes.scopes;
  ae.loadedAt = Date.now();
  renderAreaExplorerScopes();
  renderAreaExplorerStatus();
  recordAreaExplorerTrail(areaExplorerLiveStatus());
  const work = [];
  if (full || ae.findsDirty || ae.pointsScope !== ae.scope) {
    ae.findsDirty = false;
    work.push(loadAreaExplorerMap(), loadAreaExplorerFinds());
  } else {
    queueAreaExplorerMapDraw();
  }
  if (state.currentUser.role === 'admin' && (full || ae.tokensDirty)) {
    ae.tokensDirty = false;
    work.push(loadAreaExplorerTokens());
  }
  if (full || ae.logServer !== areaExplorerLogServer()) work.push(loadAreaExplorerLog());
  await Promise.all(work);
  // A sign opened from a player's profile: shown once its scope is loaded
  const pending = ae.pendingFocus;
  if (pending && pending.scope === ae.scope) {
    ae.pendingFocus = null;
    focusAreaExplorerMap(pending.x, pending.z);
    selectAreaExplorerFind(pending.id).catch(error => setBanner(error.message));
  }
}

// Run log: what happened to the mod's runs, newest first

const AREA_EXPLORER_LOG_PAGE = 50;
const AREA_EXPLORER_LOG_KEEP = 500;
const AREA_EXPLORER_LOG_TYPES = Object.freeze({
  start: 'Start', stop: 'Stopped', pause: 'Paused', resume: 'Resumed', phase: 'Phase', progress: 'Progress',
  finish: 'Done', disconnect: 'Kicked', reconnect: 'Reconnect', rejoin: 'Back', totem: 'Totem', leave: 'Left',
  warning: 'Warning', error: 'Error'
});
// The item shown in each event's slot (the site's /items pictures)
const AREA_EXPLORER_LOG_ICONS = Object.freeze({
  start: 'Elytra', stop: 'Lever', pause: 'Clock', resume: 'Firework_Rocket', phase: 'Compass', progress: 'Filled_Map',
  finish: 'Nether_Star', disconnect: 'Tnt', reconnect: 'Ender_Pearl', rejoin: 'Oak_Door', totem: 'Totem_Of_Undying',
  leave: 'Oak_Door', warning: 'Bell', error: 'Redstone_Torch'
});
const AREA_EXPLORER_LOG_CONNECTION =Object.freeze(['disconnect', 'reconnect', 'rejoin', 'totem', 'leave']);

/** The log follows the server picked above (every dimension of it), or shows all servers. */
function areaExplorerLogServer() {
  return areaExplorerState().scope.split('|')[0] || '';
}

function areaExplorerLogMatches(event) {
  const ae = areaExplorerState();
  if (ae.logServer && event.server !== ae.logServer) return false;
  if (ae.logFilter === 'problems') return event.level === 'warn' || event.level === 'error';
  if (ae.logFilter === 'connection') return AREA_EXPLORER_LOG_CONNECTION.includes(event.type);
  return true;
}

async function loadAreaExplorerLog({ older = false } = {}) {
  const ae = areaExplorerState();
  const requestId = ++ae.logRequestId;
  const server = areaExplorerLogServer();
  const params = new URLSearchParams({ limit: String(AREA_EXPLORER_LOG_PAGE) });
  if (server) params.set('server', server);
  if (ae.logFilter) params.set('filter', ae.logFilter);
  const last = older ? ae.logEvents[ae.logEvents.length - 1] : null;
  if (last) params.set('before', `${new Date(last.occurredAt).toISOString()}|${last.id}`);
  const list = $('#areaExplorerLog');
  list.setAttribute('aria-busy', 'true');
  try {
    const data = await fetchJson(`/api/area-explorer/events?${params}`);
    if (ae.logRequestId !== requestId) return;
    ae.logServer = server;
    ae.logEvents = older ? [...ae.logEvents, ...data.events] : data.events;
    ae.logHasMore = data.hasMore;
    renderAreaExplorerLog();
  } finally {
    if (ae.logRequestId === requestId) list.removeAttribute('aria-busy');
  }
}

/** New events from the mod, straight from the live update: added on top if the log shows them. */
function applyAreaExplorerEvents(events) {
  const ae = areaExplorerState();
  if (ae.logServer === null) return;
  const known = new Set(ae.logEvents.map(event => event.id));
  const fresh = events.filter(event => !known.has(event.id) && areaExplorerLogMatches(event));
  if (!fresh.length) return;
  ae.logEvents = [...fresh, ...ae.logEvents]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || Number(b.id) - Number(a.id))
    .slice(0, AREA_EXPLORER_LOG_KEEP);
  renderAreaExplorerLog();
}

function areaExplorerLogDay(value) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: state.accountTimezone }).format(new Date(value));
}

function renderAreaExplorerLog() {
  const ae = areaExplorerState();
  const list = $('#areaExplorerLog');
  $('#areaExplorerLogMore').hidden = !ae.logHasMore;
  if (!ae.logEvents.length) {
    list.innerHTML = `<li class="area-explorer-empty">${ae.logFilter ? 'Nothing of this kind yet.' : 'No events yet - they show up once a mod with site-sync runs.'}</li>`;
    return;
  }
  const today = areaExplorerLogDay(Date.now());
  const yesterday = areaExplorerLogDay(Date.now() - 86_400_000);
  let lastDay = null;
  list.innerHTML = ae.logEvents.map(event => {
    // A heading wherever the day changes: Today, Yesterday, then the date
    const day = areaExplorerLogDay(event.occurredAt);
    let heading = '';
    if (day !== lastDay) {
      lastDay = day;
      const label = day === today ? 'Today' : day === yesterday ? 'Yesterday'
        : new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: state.accountTimezone }).format(new Date(event.occurredAt));
      heading = `<li class="area-explorer-log-day" aria-hidden="true"><span>${escapeHtml(label)}</span></li>`;
    }
    const where = event.x === null || event.x === undefined || event.z === null || event.z === undefined ? ''
      : `<button class="area-explorer-log-coords" type="button" data-area-focus="${event.x},${event.z}" data-area-focus-scope="${escapeHtml(`${event.server}|${event.dimension}`)}" title="Show on map">${event.x} ${event.y ?? '~'} ${event.z}</button>`;
    const meta = [
      event.player || event.tokenName ? `<span>${escapeHtml(event.player || event.tokenName)}</span>` : '',
      ae.logServer ? '' : `<span>${escapeHtml(event.server)}</span>`,
      `<span>${escapeHtml(prettyDimension(event.dimension))}</span>`
    ].filter(Boolean).join('<span class="area-explorer-log-dot" aria-hidden="true">·</span>');
    const icon = AREA_EXPLORER_LOG_ICONS[event.type] || AREA_EXPLORER_LOG_ICONS[event.level === 'error' ? 'error' : 'warning'];
    return `${heading}<li class="area-explorer-log-entry level-${escapeHtml(event.level)}">
      <span class="area-explorer-log-icon" aria-hidden="true"><img src="/items/${icon}.png" alt="" width="24" height="24" loading="lazy"></span>
      <div class="area-explorer-log-body">
        <div class="area-explorer-log-head">
          <span class="area-explorer-log-type">${escapeHtml(AREA_EXPLORER_LOG_TYPES[event.type] || event.type)}</span>
          <time datetime="${escapeHtml(new Date(event.occurredAt).toISOString())}" title="${escapeHtml(formatFullDateTime(event.occurredAt))}">${escapeHtml(formatTime(event.occurredAt))}</time>
        </div>
        <p class="area-explorer-log-message">${escapeHtml(event.message)}</p>
        <div class="area-explorer-log-meta">${meta}${where}</div>
      </div>
    </li>`;
  }).join('');
}

/** Every server/dimension with finds, plus those with only a Xaero map so far. */
function areaExplorerScopes() {
  const ae = areaExplorerState();
  const scopes = [...(ae.summary?.scopes || [])];
  for (const map of ae.mapScopes) {
    if (!scopes.some(scope => scope.server === map.server && scope.dimension === map.dimension)) {
      scopes.push({ server: map.server, dimension: map.dimension, bases: 0, signs: 0, items: 0, markers: 0, markerNames: [], lastFoundAt: null });
    }
  }
  for (const status of ae.summary?.statuses || []) {
    if (status.server && status.dimension && !scopes.some(scope => scope.server === status.server && scope.dimension === status.dimension)) {
      scopes.push({ server: status.server, dimension: status.dimension, bases: 0, signs: 0, items: 0, markers: 0, markerNames: [] });
    }
  }
  return scopes;
}

function renderAreaExplorerScopes() {
  const ae = areaExplorerState();
  const scopes = areaExplorerScopes();
  // The live run's scope first when nothing is picked yet: that's what's being explored
  const live = (ae.summary?.statuses || []).find(status => status.online);
  if (scopes.length && !scopes.some(scope => `${scope.server}|${scope.dimension}` === ae.scope)) {
    const preferred = live && scopes.find(scope => scope.server === live.server && scope.dimension === live.dimension);
    const pick = preferred || scopes.reduce((best, scope) => (areaExplorerFindCount(scope) > areaExplorerFindCount(best) ? scope : best));
    ae.scope = `${pick.server}|${pick.dimension}`;
  }
  if (!scopes.length) ae.scope = '';

  const scope = scopes.find(item => `${item.server}|${item.dimension}` === ae.scope);
  const counts = {
    all: scope ? areaExplorerFindCount(scope) : 0, BASE: scope?.bases || 0, MARKER: scope?.markers || 0, ITEM: scope?.items || 0, SIGN: scope?.signs || 0
  };
  $$('[data-area-count]').forEach(element => { element.textContent = formatNumber(counts[element.dataset.areaCount]); });
  $('#areaExplorerScopeSummary').textContent = scope
    ? `${formatNumber(counts.all)} finds over every run`
    : 'Nothing uploaded by the mod yet.';
  renderAreaExplorerMarkerNames(scope);
  renderAreaExplorerHighlights(scope);
}

/**
 * What stands out in this scope: how much is mapped, the latest find, what the markers mark and
 * the loot found most. Each one lists its finds (and the latest shows on the map) when tapped.
 */
function renderAreaExplorerHighlights(scope) {
  const ae = areaExplorerState();
  const container = $('#areaExplorerHighlights');
  if (!container) return;
  const [server, dimension] = ae.scope.split('|');
  const regions = ae.mapScopes.find(item => item.server === server && item.dimension === dimension)?.regions || 0;
  const chip = (find, attributes, count) => {
    const icon = areaExplorerFindIcon(find);
    return `<button class="area-explorer-highlight-chip kind-${find.kind.toLowerCase()}" type="button" ${attributes}>
      <img src="${escapeHtml(icon.src)}" data-fallback="${escapeHtml(icon.fallback)}" alt="" width="24" height="24" loading="lazy">
      <span class="area-explorer-highlight-name">${escapeHtml(find.name)}</span>
      <span class="area-explorer-highlight-count">${formatNumber(count)}</span>
    </button>`;
  };
  const sections = [];
  if (regions) {
    const km2 = regions * XAERO_REGION_PX * XAERO_REGION_PX / 1e6;
    sections.push(`<div class="area-explorer-highlight-row">
      <img src="/items/Filled_Map.png" alt="" width="24" height="24">
      <div><span class="area-explorer-highlight-label">Mapped</span><strong>${formatNumber(regions)} regions · ≈${formatNumber(Math.round(km2))} km²</strong></div>
    </div>`);
  }
  if (scope?.latest) {
    const latest = scope.latest;
    const icon = areaExplorerFindIcon(latest);
    sections.push(`<button class="area-explorer-highlight-row is-button" type="button" data-area-focus="${latest.x},${latest.z}" data-area-select-find="${escapeHtml(latest.id)}">
      <img src="${escapeHtml(icon.src)}" data-fallback="${escapeHtml(icon.fallback)}" alt="" width="24" height="24">
      <div><span class="area-explorer-highlight-label">Latest find · ${escapeHtml(areaExplorerFoundAgo(latest.foundAt))}</span><strong>${escapeHtml(latest.name)}</strong></div>
    </button>`);
  }
  if (scope?.markerNames?.length) {
    sections.push(`<div class="area-explorer-highlight-group"><span class="area-explorer-highlight-label">Markers</span><div class="area-explorer-highlight-chips">
      ${scope.markerNames.map(item => chip({ kind: 'MARKER', name: item.name }, `data-area-filter-kind="MARKER" data-area-filter-name="${escapeHtml(item.name)}"`, item.count)).join('')}
    </div></div>`);
  }
  // The dearest loot first: Elytra, netherite, shulker boxes, maps, written books...
  if (scope?.valuableItems?.length) {
    sections.push(`<div class="area-explorer-highlight-group"><span class="area-explorer-highlight-label">Most valuable</span><div class="area-explorer-highlight-chips">
      ${scope.valuableItems.map(item => chip({ kind: 'ITEM', name: item.name }, `data-area-filter-kind="ITEM" data-area-filter-q="${escapeHtml(item.name)}"`, item.count)).join('')}
    </div></div>`);
  }
  container.innerHTML = sections.length ? sections.join('') : '<p class="area-explorer-empty">Nothing found here yet.</p>';
}

/** With Markers picked: which of them to show - End Portals, Shulker Boxes... - most found first. */
function renderAreaExplorerMarkerNames(scope) {
  const ae = areaExplorerState();
  const select = $('#areaExplorerMarkerName');
  const names = scope?.markerNames || [];
  if (ae.markerName && !names.some(item => item.name === ae.markerName)) ae.markerName = '';
  select.closest('label').hidden = ae.kind !== 'MARKER';
  select.innerHTML = [`<option value="">All markers (${formatNumber(scope?.markers || 0)})</option>`]
    .concat(names.map(item => `<option value="${escapeHtml(item.name)}"${item.name === ae.markerName ? ' selected' : ''}>${escapeHtml(item.name)} (${formatNumber(item.count)})</option>`))
    .join('');
}

function renderAreaExplorerStatus() {
  const ae = areaExplorerState();
  const container = $('#areaExplorerStatus');
  const statuses = ae.summary?.statuses || [];
  const locate = $('#areaExplorerLocatePlayer');
  const live = areaExplorerLiveStatus();
  locate.disabled = !Number.isFinite(live?.x) || !Number.isFinite(live?.z);
  locate.title = locate.disabled ? 'No player position available' : `Show ${live.player || live.tokenName || 'player'}${live.online ? '' : "'s last known position"} on map`;
  if (!statuses.length) {
    container.innerHTML = '<p class="area-explorer-empty">No mod has reported in yet.</p>';
    return;
  }
  container.innerHTML = statuses.map(status => {
    const percent = status.percent === null ? null : Math.round(status.percent * 10) / 10;
    const rescan = status.mode === 'Rescan';
    const phaseName = status.paused ? 'Paused' : (AREA_EXPLORER_PHASES[status.phase] || status.phase);
    const phase = rescan ? `Rescan · ${phaseName}` : phaseName;
    const checkingIn = Date.now() - new Date(status.updatedAt).getTime() < 20_000;
    const runState = status.online ? (status.paused ? 'paused' : 'online') : checkingIn ? 'ready' : 'offline';
    const found = status.runFinds
      ? `${formatNumber(status.runFinds.bases)} bases · ${formatNumber(status.runFinds.items)} loot · ${formatNumber(status.runFinds.signs)} signs this run`
      : '';
    const position = status.x === null ? '' : `X ${status.x}${status.y === null || status.y === undefined ? '' : ` · Y ${status.y}`} · Z ${status.z}`;
    return `<article class="area-explorer-run is-${runState}">
      <header>
        <span class="area-explorer-dot" aria-hidden="true"></span>
        <strong>${escapeHtml(status.player || status.tokenName || 'Explorer')}</strong>
        <span class="area-explorer-run-state">${status.online ? escapeHtml(phase) : checkingIn ? 'Ready - not exploring' : 'Offline'}</span>
        <span class="area-explorer-run-where">${escapeHtml(status.server || '-')} · ${escapeHtml(prettyDimension(status.dimension))}</span>
      </header>
      ${percent === null ? '' : `<div class="area-explorer-progress" role="progressbar" aria-label="Explored" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`}
      <dl>
        ${percent === null ? '' : `<div><dt>${rescan ? 'Rescanned' : 'Explored'}</dt><dd>${percent}%</dd></div>`}
        ${status.etaSeconds === null || !status.online ? '' : `<div><dt>Time left</dt><dd>${escapeHtml(formatDurationMs(status.etaSeconds * 1000))}</dd></div>`}
        ${position ? `<div class="area-explorer-run-position"><dt>Position</dt><dd>${escapeHtml(position)}</dd></div>` : ''}
        <div><dt>Last report</dt><dd>${escapeHtml(formatDurationMs(Date.now() - new Date(status.updatedAt).getTime()))} ago</dd></div>
      </dl>
      ${found ? `<p class="area-explorer-run-finds">${escapeHtml(found)}</p>` : ''}
    </article>`;
  }).join('');
}

async function loadAreaExplorerFinds() {
  const ae = areaExplorerState();
  const list = $('#areaExplorerFinds');
  const requestId = ae.findsRequestId = (ae.findsRequestId || 0) + 1;
  if (!ae.scope) {
    list.innerHTML = '';
    list.removeAttribute('aria-busy');
    ae.total = 0;
    renderAreaExplorerPager();
    return;
  }
  list.setAttribute('aria-busy', 'true');
  // "Nearest" is nearest the middle of the map in view, rounded so a nudge doesn't reload the list
  const near = ae.sort === 'nearest' && ae.view ? { nearX: Math.round(ae.view.cx / 64) * 64, nearZ: Math.round(ae.view.cz / 64) * 64 } : {};
  const query = areaExplorerScopeParams({
    kind: ae.kind, name: areaExplorerMarkerFilter(), q: ae.q, sort: ae.sort === 'newest' ? '' : ae.sort, ...near,
    limit: AREA_EXPLORER_PAGE_SIZE, offset: ae.offset
  });
  try {
    // The list of the site's item pictures comes first, so each find gets its own icon
    const [data] = await Promise.all([fetchJson(`/api/area-explorer/finds?${query}`), ensureItemIcons().catch(() => null)]);
    if (ae.findsRequestId !== requestId) return;
    ae.total = data.total;
    // The same list again with newer finds in it: what's being read stays where it is
    const refresh = ae.renderedFindsQuery === query;
    const anchor = refresh ? areaExplorerListAnchor(list) : null;
    const shown = refresh ? areaExplorerListIds(list) : null;
    list.innerHTML = data.finds.length
      ? data.finds.map(find => renderAreaExplorerFind(find)).join('')
      : `<li class="area-explorer-empty">${ae.q ? 'Nothing matches the search.' : 'No finds of this kind yet.'}</li>`;
    if (!refresh) {
      list.scrollTop = 0;
      setAreaExplorerNewFinds(0);
    } else {
      markAreaExplorerNewFinds(list, shown, anchor);
    }
    ae.renderedFindsQuery = query;
    renderAreaExplorerPager();
  } catch (error) {
    if (ae.findsRequestId === requestId) throw error;
  } finally {
    if (ae.findsRequestId === requestId) list.removeAttribute('aria-busy');
  }
}

/** The first find showing at the top of the scrolled list, and how far down it sits; null at the very top. */
function areaExplorerListAnchor(list) {
  if (!list.querySelectorAll || list.scrollTop <= 4) return null;
  const top = list.getBoundingClientRect().top;
  for (const item of list.querySelectorAll('[data-find-id]')) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom > top + 1) return { id: item.dataset.findId, offset: rect.top - top };
  }
  return null;
}

function areaExplorerListIds(list) {
  return list.querySelectorAll ? new Set([...list.querySelectorAll('[data-find-id]')].map(item => item.dataset.findId)) : null;
}

/**
 * After a live reload: the finds that weren't there before light up, and the list is scrolled
 * back so the one that was at the top still is - new ones above it are counted on a button instead
 * of pushing what's being read away.
 */
function markAreaExplorerNewFinds(list, shown, anchor) {
  if (!shown || !list.querySelectorAll) return;
  const items = [...list.querySelectorAll('[data-find-id]')];
  let above = 0;
  let reachedAnchor = !anchor;
  for (const item of items) {
    if (anchor && item.dataset.findId === anchor.id) reachedAnchor = true;
    if (shown.has(item.dataset.findId)) continue;
    item.classList.add('is-new');
    if (!reachedAnchor) above++;
  }
  const kept = anchor && items.find(item => item.dataset.findId === anchor.id);
  if (kept) list.scrollTop += kept.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
  setAreaExplorerNewFinds(anchor ? areaExplorerState().newFindsAbove + above : 0);
}

function setAreaExplorerNewFinds(count) {
  const ae = areaExplorerState();
  ae.newFindsAbove = count;
  const button = $('#areaExplorerNewFinds');
  if (!button) return;
  button.hidden = count <= 0;
  button.textContent = `↑ ${formatNumber(count)} new ${count === 1 ? 'find' : 'finds'}`;
}

function areaExplorerFindTitle(find) {
  if (find.kind === 'ITEM') return `${find.name} ×${find.count}${find.label ? ` "${find.label}"` : ''}`;
  return find.name;
}

// Each find shows its own item: the Elytra, the Enchanted Book, the Pale Oak Sign; a marker the
// item that stands for what it marks. The kind's icon when there's none.
const AREA_EXPLORER_KIND_ICONS = Object.freeze({ '': 'filled_map', BASE: 'crafting_table', MARKER: 'ender_eye', ITEM: 'chest', SIGN: 'oak_sign' });
const AREA_EXPLORER_MARKER_ICONS = Object.freeze({
  'End Portal': 'ender_eye', 'Nether Portal': 'obsidian', Spawner: 'spawner', 'Trial Chamber': 'trial_key',
  'Ancient City': 'echo_shard', 'End City': 'purpur_block', 'End Gateway': 'ender_pearl', 'Shulker Box': 'shulker_box'
});

// Items the game names unlike their id: a filled map is just "Map", a writable book "Book and Quill"

/** The site's own picture of an item, else the cached one from the icon service. */
function areaExplorerIconUrl(key) {
  return state.itemIcons[key] || minecraftIconUrl('item', key);
}

function areaExplorerFindIcon(find) {
  const fallback = state.itemIcons[AREA_EXPLORER_KIND_ICONS[find.kind]] || '/items/Chest.png';
  let key = AREA_EXPLORER_KIND_ICONS[find.kind];
  // A wall sign is the same item as the standing one
  if (find.kind === 'ITEM' || find.kind === 'SIGN') {
    key = itemIdForName(normalizeItemIconKey(find.name).replace('_wall_', '_'));
  }
  else if (find.kind === 'MARKER') key = AREA_EXPLORER_MARKER_ICONS[find.name] || normalizeItemIconKey(find.name);
  return { src: areaExplorerIconUrl(key) || fallback, fallback };
}

/** "3h 12m ago" for the last month, the date after that. */
function areaExplorerFoundAgo(foundAt) {
  const age = Date.now() - new Date(foundAt).getTime();
  return age >= 0 && age < 30 * 86_400_000 ? `${formatDurationMs(age)} ago` : formatFullDateTime(foundAt);
}

function renderAreaExplorerFind(find, { selected = false, showScope = false } = {}) {
  let body = '';
  if (find.kind === 'SIGN') {
    // The front, then the back; the same text on both sides shown once
    const front = find.details || '', back = find.label || '';
    const sides = front && back.trim() === front.trim() ? [[front, 'both']] : [[front, ''], [back, 'back']].filter(([text]) => text);
    // The text in a span of its own: cut short to a few lines, the box's padding can't let the next one peek out
    body = sides.map(([text, side]) => `<pre class="area-explorer-sign${side ? ` is-${side}` : ''}"><span class="area-explorer-sign-text">${escapeHtml(text)}</span></pre>`).join('');
  } else if (find.details) {
    body = `<p class="area-explorer-details">${escapeHtml(find.details)}</p>`;
  }
  const coords = `${find.x} ${find.y} ${find.z}`;
  const icon = areaExplorerFindIcon(find);
  // The name alone; an item's count goes on its icon, as in an inventory, and its custom name beside it
  const name = escapeHtml(find.name);
  const label = find.kind === 'ITEM' && find.label ? ` <span class="area-explorer-find-label">“${escapeHtml(find.label)}”</span>` : '';
  const count = find.kind === 'ITEM' && find.count > 1 ? `<span class="area-explorer-find-count">${formatNumber(find.count)}</span>` : '';
  // Sorted by nearness: how far each is from the middle of the map
  const view = areaExplorerState().sort === 'nearest' ? areaExplorerState().view : null;
  const away = view ? Math.round(Math.hypot(find.x - view.cx, find.z - view.cz)) : null;
  const distance = away === null ? '' : `<span class="area-explorer-find-distance">${away >= 1000 ? `${(away / 1000).toFixed(1)}k` : away} blocks away</span>`;
  // Loot picked up in game, or a marker that's wrong or gone, comes off the site (administrators)
  const removable = find.kind === 'ITEM' || (find.kind === 'MARKER' && !AREA_EXPLORER_PERMANENT_MARKERS.includes(find.name));
  const pickup = removable && state.currentUser?.role === 'admin'
    ? `<button class="ghost-button area-explorer-pickup" type="button" data-area-pickup="${escapeHtml(find.id)}" data-area-pickup-kind="${find.kind}" data-area-pickup-name="${escapeHtml(areaExplorerFindTitle(find))}" title="${find.kind === 'ITEM' ? 'Picked up in game: take it off the site' : 'Wrong or no longer there: take it off the site'}">${find.kind === 'ITEM' ? 'Picked up' : 'Remove'}</button>`
    : '';
  return `<li class="area-explorer-find kind-${find.kind.toLowerCase()}" data-find-id="${escapeHtml(find.id)}" data-find-at="${find.x},${find.z}">
    <span class="area-explorer-find-icon" aria-hidden="true"><img src="${escapeHtml(icon.src)}" data-fallback="${escapeHtml(icon.fallback)}" alt="" loading="lazy" decoding="async" width="32" height="32">${count}</span>
    <div class="area-explorer-find-main">
      <div class="area-explorer-find-heading">
      ${selected ? `<strong class="area-explorer-find-name">${name}${label}</strong>` : `<button class="area-explorer-find-title area-explorer-find-name" type="button" data-area-select aria-label="Show ${escapeHtml(areaExplorerFindTitle(find))} on map">${name}${label}</button>`}
      </div>
      ${body}
      <div class="area-explorer-find-meta">
        <span class="area-explorer-kind">${showScope ? `${escapeHtml(find.server)} · ${escapeHtml(prettyDimension(find.dimension))}` : AREA_EXPLORER_KIND_LABELS[find.kind] || escapeHtml(find.kind)}</span>
        <button class="ghost-button area-explorer-coords" type="button" data-copy-coords="${escapeHtml(coords)}" title="Copy coordinates" aria-label="Copy coordinates: X ${find.x}, Y ${find.y}, Z ${find.z}"><span><span class="area-explorer-axis">X</span> ${find.x}</span><span><span class="area-explorer-axis">Y</span> ${find.y}</span><span><span class="area-explorer-axis">Z</span> ${find.z}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button>
        ${distance}<time datetime="${escapeHtml(find.foundAt)}" title="Found ${escapeHtml(formatFullDateTime(find.foundAt))}">${escapeHtml(areaExplorerFoundAgo(find.foundAt))}</time>
        ${pickup}
      </div>
    </div>
  </li>`;
}

function renderAreaExplorerPager() {
  const ae = areaExplorerState();
  const page = Math.floor(ae.offset / AREA_EXPLORER_PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(ae.total / AREA_EXPLORER_PAGE_SIZE));
  $('#areaExplorerPage').textContent = ae.total ? `${page} / ${pages} · ${formatNumber(ae.total)} finds` : '-';
  $('#areaExplorerPrev').disabled = ae.offset <= 0;
  $('#areaExplorerNext').disabled = ae.offset + AREA_EXPLORER_PAGE_SIZE >= ae.total;
}

// The map: the Xaero map, every find of the scope, the explorer and its area on top

async function loadAreaExplorerMap() {
  const ae = areaExplorerState();
  const requestId = ae.mapRequestId = (ae.mapRequestId || 0) + 1;
  bindAreaExplorerMap();
  if (!ae.scope) {
    ae.points = [];
    queueAreaExplorerMapDraw();
    return;
  }
  const scope = ae.scope;
  // Every find of the scope, however many: the map draws them all
  const [data] = await Promise.all([
    fetchJson(`/api/area-explorer/map?${areaExplorerScopeParams()}`),
    loadXaeroRegionMap()
  ]);
  if (ae.scope !== scope || ae.mapRequestId !== requestId) return;
  // Sorted once, so each frame just draws them in order
  ae.points = data.points
    .map(([id, kind, x, z, name]) => ({ id, kind, x, z, name }))
    .sort((a, b) => AREA_EXPLORER_KIND_ORDER[a.kind] - AREA_EXPLORER_KIND_ORDER[b.kind]);
  // A new server or dimension shows its whole territory; another kind of find keeps the view
  if (ae.pointsScope !== scope || !ae.view) fitAreaExplorerMap();
  ae.pointsScope = scope;
  queueAreaExplorerMapDraw();
}

function areaExplorerLiveStatus() {
  const ae = areaExplorerState();
  const [server, dimension] = ae.scope.split('|');
  return (ae.summary?.statuses || []).find(status => status.server === server && status.dimension === dimension && status.x !== null) || null;
}

function areaExplorerHeading(yaw) {
  return Number.isFinite(yaw) ? (yaw + 180) * Math.PI / 180 : 0;
}

function recordAreaExplorerTrail(live, now = Date.now()) {
  const ae = areaExplorerState();
  if (!live?.online || !Number.isFinite(live.x) || !Number.isFinite(live.z)) { ae.trail = null; return; }
  const key = `${live.tokenId}|${live.server}|${live.dimension}`;
  if (ae.trail?.key !== key) ae.trail = { key, samples: [] };
  const samples = ae.trail.samples;
  const last = samples.at(-1);
  if (last && (now - last.at > 2500 || Math.hypot(live.x - last.x, live.z - last.z) > 512)) samples.length = 0;
  if (!last || last.x !== live.x || last.z !== live.z || !samples.length) samples.push({ x: live.x, z: live.z, at: now });
  ae.trail.samples = samples.filter(point => now - point.at < 3000).slice(-10);
}

function areaExplorerTrail(live, now = Date.now()) {
  const trail = areaExplorerState().trail;
  if (!live?.online || trail?.key !== `${live.tokenId}|${live.server}|${live.dimension}`) return [];
  return trail.samples.filter(point => now - point.at < 3000);
}

function applyAreaExplorerLiveStatus(live) {
  const ae = areaExplorerState();
  ae.summary ||= { scopes: [], statuses: [] };
  const index = ae.summary.statuses.findIndex(status => status.tokenId === live.tokenId);
  const previous = ae.summary.statuses[index];
  if (previous && new Date(previous.updatedAt) > new Date(live.updatedAt)) return;
  const status = { ...previous, ...live, tokenName: live.tokenName || previous?.tokenName };
  if (index < 0) ae.summary.statuses.push(status);
  else ae.summary.statuses[index] = status;
  ae.liveReceivedAt = Date.now();
  if (state.activeTab !== 'area-explorer' || document.visibilityState === 'hidden') return;
  recordAreaExplorerTrail(areaExplorerLiveStatus());
  renderAreaExplorerStatus();
  queueAreaExplorerMapDraw();
}

async function loadAreaExplorerLive() {
  const ae = areaExplorerState();
  if (!state.currentUser || state.activeTab !== 'area-explorer' || document.visibilityState === 'hidden' || ae.liveLoading) return;
  if (state.eventSource?.readyState === 1 && Date.now() - (ae.liveReceivedAt || 0) < 2500) return;
  ae.liveLoading = true;
  try {
    const { statuses, versions } = await fetchJson('/api/area-explorer/live');
    for (const status of statuses) applyAreaExplorerLiveStatus(status);
    noteAreaExplorerVersions(versions);
    if (!statuses.length && ae.summary) { ae.summary.statuses = []; ae.trail = null; renderAreaExplorerStatus(); queueAreaExplorerMapDraw(); }
  } catch { /* The next second retries without replacing the last known position. */ }
  finally { ae.liveLoading = false; }
}

/**
 * Without the live stream (a phone drops it in the background, some networks hold it back) the
 * poll's newest find and event ids tell when the finds, highlights or the log have something new.
 */
function noteAreaExplorerVersions(versions) {
  if (!versions) return;
  const ae = areaExplorerState();
  const previous = ae.versions;
  ae.versions = versions;
  if (!previous) return;
  if (versions.finds !== previous.finds) {
    ae.findsDirty = true;
    queueAreaExplorerRefresh(180);
  }
  if (versions.events !== previous.events && ae.logServer !== null) {
    const params = new URLSearchParams({ limit: String(AREA_EXPLORER_LOG_PAGE) });
    if (ae.logServer) params.set('server', ae.logServer);
    if (ae.logFilter) params.set('filter', ae.logFilter);
    fetchJson(`/api/area-explorer/events?${params}`).then(data => applyAreaExplorerEvents(data.events)).catch(() => {});
  }
}

function areaExplorerInTerritory(x, z) {
  const half = areaExplorerState().extent / 2;
  return x >= -half && x < half && z >= -half && z < half;
}

/** The territory fits the canvas at the furthest zoom, and the view never leaves it. */
function clampAreaExplorerView() {
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  if (!ae.view || !canvas) return;
  const width = canvas.clientWidth || 600, height = canvas.clientHeight || 420;
  const half = ae.extent / 2;
  ae.view.scale = Math.min(Math.max(ae.view.scale, Math.min(width, height) / ae.extent), AREA_EXPLORER_MAX_SCALE);
  const clamp = (center, visibleHalf) => (visibleHalf >= half ? 0 : Math.min(Math.max(center, -half + visibleHalf), half - visibleHalf));
  ae.view.cx = clamp(ae.view.cx, width / 2 / ae.view.scale);
  ae.view.cz = clamp(ae.view.cz, height / 2 / ae.view.scale);
}

/** The whole territory in view. */
function fitAreaExplorerMap() {
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  const width = canvas?.clientWidth || 600, height = canvas?.clientHeight || 420;
  ae.view = { cx: 0, cz: 0, scale: Math.min(width, height) / ae.extent };
  clampAreaExplorerView();
}

/** Centres the map on a spot, zoomed in close enough to see around it. */
function focusAreaExplorerMap(x, z) {
  const ae = areaExplorerState();
  if (!ae.view) fitAreaExplorerMap();
  ae.view = { cx: x, cz: z, scale: Math.max(ae.view.scale, 0.6) };
  clampAreaExplorerView();
  queueAreaExplorerMapDraw();
  noteAreaExplorerViewMoved();
  const wrap = $('#areaExplorerMapWrap');
  const rect = wrap.getBoundingClientRect();
  if (!wrap.classList.contains('is-fullscreen') && (rect.top < 0 || rect.top > window.innerHeight * 0.5)) {
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function zoomAreaExplorerMap(factor, sx, sz) {
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  const view = ae.view;
  if (!view) return;
  sx ??= canvas.clientWidth / 2;
  sz ??= canvas.clientHeight / 2;
  const x = view.cx + (sx - canvas.clientWidth / 2) / view.scale;
  const z = view.cz + (sz - canvas.clientHeight / 2) / view.scale;
  view.scale = Math.min(Math.max(view.scale * factor, 0.0005), AREA_EXPLORER_MAX_SCALE);
  view.cx = x - (sx - canvas.clientWidth / 2) / view.scale;
  view.cz = z - (sz - canvas.clientHeight / 2) / view.scale;
  clampAreaExplorerView();
  queueAreaExplorerMapDraw();
  noteAreaExplorerViewMoved();
}

/** Sorted by nearness, the list follows the map: loaded again once it stops moving. */
function noteAreaExplorerViewMoved() {
  const ae = areaExplorerState();
  if (ae.sort !== 'nearest') return;
  clearTimeout(ae.nearestTimer);
  ae.nearestTimer = setTimeout(() => {
    ae.offset = 0;
    loadAreaExplorerFinds().catch(() => { /* the next move tries again */ });
  }, 700);
}

function renderAreaExplorerExtent() {
  const ae = areaExplorerState();
  $$('[data-area-radius]').forEach(button => {
    const active = 2 * Number(button.dataset.areaRadius) === ae.extent;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function areaExplorerToScreen(view, canvas, x, z) {
  return [canvas.clientWidth / 2 + (x - view.cx) * view.scale, canvas.clientHeight / 2 + (z - view.cz) * view.scale];
}

/** The map's colours, read from the stylesheet once per theme rather than every frame. */
function areaExplorerColors(canvas) {
  const ae = areaExplorerState();
  const theme = document.documentElement.getAttribute('data-theme') || '';
  if (ae.colors && ae.colorsTheme === theme) return ae.colors;
  const styles = getComputedStyle(canvas);
  const color = name => styles.getPropertyValue(name).trim();
  ae.colorsTheme = theme;
  ae.colors = {
    bg: color('--area-map-bg'), grid: color('--area-map-grid'), axis: color('--area-map-axis'), area: color('--area-map-area'),
    player: color('--area-player'), text: color('--text'), muted: color('--muted'),
    signOutline: color('--area-sign-outline'), SIGN: color('--area-sign'), ITEM: color('--area-loot'), MARKER: color('--area-marker'), BASE: color('--area-base')
  };
  return ae.colors;
}

/**
 * The ground the run has flown over, over its area: the mod's grid of cells as a tiny image, one
 * pixel a cell, stretched over the area without smoothing. True if drawn. A newer grid than the one
 * held is fetched, and drawn once it's in.
 */
function drawAreaExplorerCoverage(ctx, canvas, view, live, [x1, z1, x2, z2]) {
  if (live.coverageVersion === null || live.coverageVersion === undefined) return false;
  const ae = areaExplorerState();
  const held = ae.coverage.get(live.tokenId);
  const retryLater = held?.failedAt && Date.now() - held.failedAt < 10_000;
  if ((!held || held.version !== live.coverageVersion) && !held?.loading && !retryLater) loadAreaExplorerCoverage(live.tokenId);
  if (!held?.image) return false;
  const grid = held.coverage;
  const [gx1, gz1] = areaExplorerToScreen(view, canvas, grid.minCX * 16, grid.minCZ * 16);
  const [gx2, gz2] = areaExplorerToScreen(view, canvas, (grid.minCX + grid.cols * grid.cell) * 16, (grid.minCZ + grid.rows * grid.cell) * 16);
  ctx.save();
  // The last cells may run past the area's edge: kept inside it
  ctx.beginPath();
  ctx.rect(x1, z1, x2 - x1, z2 - z1);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(held.image, gx1, gz1, gx2 - gx1, gz2 - gz1);
  ctx.restore();
  return true;
}

async function loadAreaExplorerCoverage(tokenId) {
  const ae = areaExplorerState();
  const held = ae.coverage.get(tokenId) || {};
  held.loading = true;
  held.failedAt = 0;
  ae.coverage.set(tokenId, held);
  try {
    const { coverage } = await fetchJson(`/api/area-explorer/coverage?token=${encodeURIComponent(tokenId)}`);
    if (!coverage) {
      // Gone already (the run ended): not asked for again straight away
      ae.coverage.set(tokenId, { loading: false, failedAt: Date.now() });
      return;
    }
    // Bit i of the grid (row by row) is bit i % 8 of byte i / 8
    const bytes = Uint8Array.from(atob(coverage.bits), char => char.charCodeAt(0));
    const image = document.createElement('canvas');
    image.width = coverage.cols;
    image.height = coverage.rows;
    const g = image.getContext('2d');
    const pixels = g.createImageData(coverage.cols, coverage.rows);
    const [r, gr, b, a] = areaExplorerFlownColor(image);
    for (let i = 0; i < coverage.cols * coverage.rows; i++) {
      if (!(bytes[i >> 3] & (1 << (i & 7)))) continue;
      pixels.data.set([r, gr, b, a], i * 4);
    }
    g.putImageData(pixels, 0, 0);
    ae.coverage.set(tokenId, { version: coverage.version, coverage, image, loading: false, failedAt: 0 });
    queueAreaExplorerMapDraw();
  } catch {
    // The last grid stays on the map; tried again in a few seconds
    held.loading = false;
    held.failedAt = Date.now();
  }
}

/** The theme's flown colour as RGBA bytes, from --area-map-flown. */
function areaExplorerFlownColor(element) {
  const probe = element.getContext('2d');
  probe.fillStyle = '#000';
  probe.fillStyle = getComputedStyle($('#areaExplorerMap')).getPropertyValue('--area-map-flown').trim() || 'rgba(230, 150, 30, 0.32)';
  const match = String(probe.fillStyle).match(/rgba?\(([^)]+)\)/);
  if (match) {
    const [r, g, b, a = '1'] = match[1].split(',').map(part => part.trim());
    return [Number(r), Number(g), Number(b), Math.round(Number(a) * 255)];
  }
  const hex = String(probe.fillStyle).replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
}

/** Screen point to block coordinates. */
function areaExplorerFromScreen(canvas, sx, sz) {
  const view = areaExplorerState().view;
  return [Math.floor(view.cx + (sx - canvas.clientWidth / 2) / view.scale), Math.floor(view.cz + (sz - canvas.clientHeight / 2) / view.scale)];
}

/** The picked area out to whole chunks, as the mod takes it: [minX, minZ, maxX, maxZ] in blocks, and its size in chunks. */
function areaExplorerSelectionBox(selection) {
  const minCX = Math.floor(Math.min(selection.x1, selection.x2) / 16), maxCX = Math.floor(Math.max(selection.x1, selection.x2) / 16);
  const minCZ = Math.floor(Math.min(selection.z1, selection.z2) / 16), maxCZ = Math.floor(Math.max(selection.z1, selection.z2) / 16);
  return { minX: minCX * 16, minZ: minCZ * 16, maxX: maxCX * 16 + 15, maxZ: maxCZ * 16 + 15, width: maxCX - minCX + 1, depth: maxCZ - minCZ + 1 };
}

/** The ring around the spot picked with "Show markers within 100 blocks". */
function drawAreaExplorerNearby(ctx, canvas, view) {
  const nearby = areaExplorerState().nearby;
  if (!nearby) return;
  const [x, z] = areaExplorerToScreen(view, canvas, nearby.x + 0.5, nearby.z + 0.5);
  const radius = AREA_EXPLORER_NEARBY_RADIUS * view.scale;
  const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#6bc94a';
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.1;
  ctx.beginPath(); ctx.arc(x, z, radius, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.restore();
}

/** Shows every find within 100 blocks of the spot, or (null) stops. */
function setAreaExplorerNearby(spot) {
  const ae = areaExplorerState();
  ae.nearby = spot;
  queueAreaExplorerMapDraw();
  if (!spot) return;
  const count = ae.points.filter(point => isAreaExplorerPointNearby(point) && areaExplorerInTerritory(point.x, point.z)).length;
  showAreaExplorerNote(count ? `${formatNumber(count)} find${count === 1 ? '' : 's'} within ${AREA_EXPLORER_NEARBY_RADIUS} blocks` : `Nothing found within ${AREA_EXPLORER_NEARBY_RADIUS} blocks`);
}

function drawAreaExplorerSelection(ctx, canvas, view) {
  const selection = areaExplorerState().areaSelection;
  if (!selection) return;
  const box = areaExplorerSelectionBox(selection);
  const [x1, z1] = areaExplorerToScreen(view, canvas, box.minX, box.minZ);
  const [x2, z2] = areaExplorerToScreen(view, canvas, box.maxX + 1, box.maxZ + 1);
  const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#6bc94a';
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(Math.round(x1) + 0.5, Math.round(z1) + 0.5, Math.round(x2 - x1), Math.round(z2 - z1));
  ctx.setLineDash([]);
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  const label = `${box.width} × ${box.depth} chunks`;
  const width = ctx.measureText(label).width + 12;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x1, z1 - 20, width, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x1 + 6, z1 - 7);
  ctx.restore();
}

/** A mod that's checking in on this server and dimension now (running or idle), to send an area to. */
function areaExplorerReachableMod() {
  const ae = areaExplorerState();
  const [server, dimension] = ae.scope.split('|');
  return (ae.summary?.statuses || []).find(status => status.server === server && status.dimension === dimension
    && Date.now() - new Date(status.updatedAt).getTime() < 20_000) || null;
}

// The map has no height: the right-click menu's spot is given at the height the elytra flies, over the build limit
const AREA_EXPLORER_MENU_Y = 325;

/**
 * The map's right-click menu: copy the spot's coordinates; for administrators, pick an area and
 * send the mod there to explore or rescan it - as the Explore and Rescan options on Xaero's map.
 */
function openAreaExplorerMenu(sx, sz) {
  closeAreaExplorerMarkerFilters();
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  const menu = $('#areaExplorerMenu');
  const [x, z] = areaExplorerFromScreen(canvas, sx, sz);
  const items = [
    { label: `Copy coordinates (${x} ${AREA_EXPLORER_MENU_Y} ${z})`, run: () => copyAreaExplorerText(`${x} ${AREA_EXPLORER_MENU_Y} ${z}`, 'Coordinates copied') },
    { label: 'Copy Baritone #goto', run: () => copyAreaExplorerText(`#goto ${x} ${AREA_EXPLORER_MENU_Y} ${z}`, 'Baritone command copied') },
    { separator: true },
    { label: `Show markers within ${AREA_EXPLORER_NEARBY_RADIUS} blocks`, run: () => setAreaExplorerNearby({ x, z }) }
  ];
  if (ae.nearby) items.push({ label: `Hide markers around ${ae.nearby.x} ${ae.nearby.z}`, run: () => setAreaExplorerNearby(null) });
  if (state.currentUser?.role === 'admin') {
    const selection = ae.areaSelection;
    const box = selection && !selection.picking ? areaExplorerSelectionBox(selection) : null;
    const inside = box && x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
    if (inside) {
      const mod = areaExplorerReachableMod();
      const why = mod ? '' : 'No mod checking in on this server and dimension';
      const to = mod ? ` - ${mod.player || mod.tokenName}` : '';
      items.push({ separator: true });
      items.push({ label: `Explore ${box.width} × ${box.depth} chunks${to}`, disabled: !mod, title: why, run: () => sendAreaExplorerCommand('EXPLORE', mod, box) });
      items.push({ label: `Rescan ${box.width} × ${box.depth} chunks${to}`, disabled: !mod, title: why, run: () => sendAreaExplorerCommand('RESCAN', mod, box) });
      items.push({ label: 'Clear selection', run: () => { ae.areaSelection = null; queueAreaExplorerMapDraw(); } });
    } else {
      items.push({ separator: true });
      items.push({ label: 'Select an area from here', run: () => { ae.areaSelection = { x1: x, z1: z, x2: x, z2: z, picking: true }; queueAreaExplorerMapDraw(); showAreaExplorerNote('Tap or click the opposite corner'); } });
      if (selection) items.push({ label: 'Clear selection', run: () => { ae.areaSelection = null; queueAreaExplorerMapDraw(); } });
    }
  }
  menu.innerHTML = items.map((item, index) => item.separator
    ? '<hr class="area-explorer-menu-separator">'
    : `<button type="button" role="menuitem" data-menu-index="${index}"${item.disabled ? ' disabled' : ''}${item.title ? ` title="${escapeHtml(item.title)}"` : ''}>${escapeHtml(item.label)}</button>`).join('');
  menu.querySelectorAll('[data-menu-index]').forEach(button => button.addEventListener('click', () => {
    closeAreaExplorerMenu();
    items[Number(button.dataset.menuIndex)].run();
  }));
  menu.hidden = false;
  $('#areaExplorerMapActions').setAttribute('aria-expanded', 'true');
  // Kept inside the map
  const wrap = $('#areaExplorerMapWrap');
  const left = Math.max(4, Math.min(sx, wrap.clientWidth - menu.offsetWidth - 4));
  const top = Math.max(4, Math.min(sz, wrap.clientHeight - menu.offsetHeight - 4));
  menu.style.left = `${left + canvas.offsetLeft}px`;
  menu.style.top = `${top + canvas.offsetTop}px`;
  menu.querySelector('button:not([disabled])')?.focus();
}

function closeAreaExplorerMenu() {
  const menu = $('#areaExplorerMenu');
  if (menu && !menu.hidden) menu.hidden = true;
  $('#areaExplorerMapActions')?.setAttribute('aria-expanded', 'false');
}

/** A short word over the map: copied, sent, or what went wrong. */
function showAreaExplorerNote(text) {
  const note = $('#areaExplorerMapNote');
  note.textContent = text;
  note.hidden = false;
  clearTimeout(showAreaExplorerNote.timer);
  showAreaExplorerNote.timer = setTimeout(() => { note.hidden = true; }, 4000);
}

function copyAreaExplorerText(text, done) {
  writeClipboardText(text).then(() => showAreaExplorerNote(`${done}: ${text}`)).catch(() => showAreaExplorerNote(`Copy by hand: ${text}`));
}

async function sendAreaExplorerCommand(kind, mod, box) {
  const ae = areaExplorerState();
  try {
    const { command } = await postJson('/api/area-explorer/commands', {
      kind, tokenId: mod.tokenId, server: mod.server, dimension: mod.dimension,
      minX: box.minX, minZ: box.minZ, maxX: box.maxX, maxZ: box.maxZ
    });
    ae.areaSelection = null;
    queueAreaExplorerMapDraw();
    showAreaExplorerNote(`Sent ${mod.player || mod.tokenName} to ${kind === 'RESCAN' ? 'rescan' : 'explore'} ${command.size} - it starts within seconds`);
  } catch (error) {
    showAreaExplorerNote(`Could not send it: ${error.message}`);
  }
}

// Zoomed out, finds close together on screen are drawn as one cluster with their count: tens of
// thousands of dots each frame made the page crawl. The grid is anchored to the world and its cells
// double in size a zoom level at a time, so clusters stay put while panning and are worked out once
// per level, not every frame.

const AREA_EXPLORER_CLUSTER_PX = 44;
// Closer in than this (pixels a block) every find shows on its own
const AREA_EXPLORER_CLUSTER_MAX_SCALE = 1;

function areaExplorerPointSize(kind) {
  return kind === 'BASE' || kind === 'MARKER' ? 4.5 : kind === 'ITEM' ? 3.5 : 3.25;
}

/**
 * The finds the map shows, split into those that may join a cluster and those always drawn on
 * their own (the one picked, those around the spot picked from the menu). Kept until the finds,
 * the checkboxes, the pick or the territory change.
 */
function areaExplorerVisiblePoints() {
  const ae = areaExplorerState();
  const key = [(ae.visibleKinds || AREA_EXPLORER_DEFAULT_LAYERS).join(), ae.showFinds, ae.selectedId, ae.nearby?.x, ae.nearby?.z, ae.extent].join('|');
  const cache = ae.visibleCache;
  if (cache && cache.points === ae.points && cache.key === key) return cache;
  const clustered = [], alone = [];
  for (const point of ae.points) {
    if (!isAreaExplorerPointVisible(point) || !areaExplorerInTerritory(point.x, point.z)) continue;
    (point.id === ae.selectedId || isAreaExplorerPointNearby(point) ? alone : clustered).push(point);
  }
  ae.visibleCache = { points: ae.points, key, clustered, alone, levels: new Map() };
  return ae.visibleCache;
}

/** The world-cell size (a power of two, in blocks) clusters use at this zoom; 0 when not clustering. */
function areaExplorerClusterCell(scale) {
  if (scale >= AREA_EXPLORER_CLUSTER_MAX_SCALE) return 0;
  return 2 ** Math.ceil(Math.log2(AREA_EXPLORER_CLUSTER_PX / scale));
}

/** The finds grouped into world cells of this size: a cell of one is that find, more a cluster at their middle. */
function areaExplorerClusters(visible, cell) {
  const cached = visible.levels.get(cell);
  if (cached) return cached;
  const cells = new Map();
  for (const point of visible.clustered) {
    const key = Math.floor(point.x / cell) * 4_194_304 + Math.floor(point.z / cell);
    const group = cells.get(key);
    if (!group) { cells.set(key, { point, x: point.x, z: point.z, count: 1, kinds: null }); continue; }
    if (!group.kinds) group.kinds = { [group.point.kind]: 1 };
    group.kinds[point.kind] = (group.kinds[point.kind] || 0) + 1;
    group.x += point.x; group.z += point.z; group.count += 1;
  }
  const singles = [], clusters = [];
  for (const group of cells.values()) {
    if (group.count === 1) { singles.push(group.point); continue; }
    // Coloured as the kind most of it is
    const kind = Object.entries(group.kinds).sort((a, b) => b[1] - a[1] || AREA_EXPLORER_KIND_ORDER[b[0]] - AREA_EXPLORER_KIND_ORDER[a[0]])[0][0];
    clusters.push({ x: group.x / group.count, z: group.z / group.count, count: group.count, kind });
  }
  // Drawn in the kinds' order, as the finds are sorted
  singles.sort((a, b) => AREA_EXPLORER_KIND_ORDER[a.kind] - AREA_EXPLORER_KIND_ORDER[b.kind]);
  const result = { singles, clusters };
  visible.levels.set(cell, result);
  return result;
}

function areaExplorerClusterRadius(count) {
  return Math.min(22, 9 + Math.log10(count) * 5);
}

function formatAreaExplorerClusterCount(count) {
  if (count < 1000) return String(count);
  return count < 10_000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(count / 1000)}k`;
}

/**
 * The finds in view: clusters zoomed out, single finds batched into one path a kind (a fill per
 * kind instead of per find). What was drawn where is kept for taps and clicks.
 */
function drawAreaExplorerPoints(ctx, view, colors, width, height) {
  const ae = areaExplorerState();
  const visible = areaExplorerVisiblePoints();
  const cell = areaExplorerClusterCell(view.scale);
  const { singles, clusters } = cell ? areaExplorerClusters(visible, cell) : { singles: visible.clustered, clusters: [] };
  const hits = [];
  const toScreen = (x, z) => [width / 2 + (x - view.cx) * view.scale, height / 2 + (z - view.cz) * view.scale];
  const inView = (sx, sz, margin) => sx >= -margin && sz >= -margin && sx <= width + margin && sz <= height + margin;

  const drawSingles = points => {
    let kind = null, size = 0;
    const flush = () => {
      if (!kind) return;
      ctx.fillStyle = colors[kind];
      ctx.fill();
      if (kind === 'SIGN') { ctx.strokeStyle = colors.signOutline; ctx.lineWidth = 1.5; ctx.stroke(); }
    };
    for (const point of points) {
      const [sx, sz] = toScreen(point.x, point.z);
      if (!inView(sx, sz, 6)) continue;
      if (point.kind !== kind) { flush(); kind = point.kind; size = areaExplorerPointSize(kind); ctx.beginPath(); }
      // Markers are diamonds, the rest dots
      if (kind === 'MARKER') { ctx.moveTo(sx, sz - size); ctx.lineTo(sx + size, sz); ctx.lineTo(sx, sz + size); ctx.lineTo(sx - size, sz); ctx.closePath(); }
      else { ctx.moveTo(sx + size, sz); ctx.arc(sx, sz, size, 0, Math.PI * 2); }
      hits.push({ sx, sz, radius: size, point });
    }
    flush();
  };
  drawSingles(singles);

  if (clusters.length) {
    ctx.save();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cluster of clusters) {
      const [sx, sz] = toScreen(cluster.x, cluster.z);
      const radius = areaExplorerClusterRadius(cluster.count);
      if (!inView(sx, sz, radius)) continue;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = colors[cluster.kind];
      ctx.beginPath(); ctx.arc(sx, sz, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.bg;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(formatAreaExplorerClusterCount(cluster.count), sx, sz + 0.5);
      hits.push({ sx, sz, radius, cluster });
    }
    ctx.restore();
  }

  // The picked find and those around the menu's spot: always on their own, on top
  drawSingles([...visible.alone].sort((a, b) => AREA_EXPLORER_KIND_ORDER[a.kind] - AREA_EXPLORER_KIND_ORDER[b.kind]));
  const selected = visible.alone.find(point => point.id === ae.selectedId);
  if (selected) {
    const [sx, sz] = toScreen(selected.x, selected.z);
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sz, areaExplorerPointSize(selected.kind) + 5, 0, Math.PI * 2); ctx.stroke();
  }
  ae.drawnHits = hits;
}

/** What's under a tap or click: the nearest find, else a cluster it lands on. */
function areaExplorerHitAt(sx, sz, reach) {
  let best = null, bestDistance = reach;
  let cluster = null;
  for (const hit of areaExplorerState().drawnHits || []) {
    const distance = Math.hypot(hit.sx - sx, hit.sz - sz);
    if (hit.cluster) { if (distance <= hit.radius + 4 && (!cluster || distance < cluster.distance)) cluster = { hit, distance }; }
    else if (distance < bestDistance) { best = hit; bestDistance = distance; }
  }
  if (best) return { point: best.point };
  return cluster ? { cluster: cluster.hit.cluster } : null;
}

function queueAreaExplorerMapDraw() {
  const ae = areaExplorerState();
  if (ae.drawQueued) return;
  ae.drawQueued = true;
  requestAnimationFrame(() => {
    ae.drawQueued = false;
    drawAreaExplorerMap();
  });
}

function drawAreaExplorerMap() {
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  if (!canvas || !canvas.clientWidth) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  // Resizing the backing store clears and reallocates it: only when the size really changed
  const backingWidth = Math.round(width * ratio), backingHeight = Math.round(height * ratio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const colors = areaExplorerColors(canvas);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);
  const view = ae.view || { cx: 0, cz: 0, scale: 0.05 };

  // Everything is drawn inside the territory only
  const half = ae.extent / 2;
  const [tx1, tz1] = areaExplorerToScreen(view, canvas, -half, -half);
  const [tx2, tz2] = areaExplorerToScreen(view, canvas, half, half);
  ctx.save();
  ctx.beginPath();
  ctx.rect(tx1, tz1, tx2 - tx1, tz2 - tz1);
  ctx.clip();
  drawXaeroRegionMap(ctx, canvas, view, ratio);

  // A grid line every 1,000 blocks, or 10,000 zoomed out; the axes stronger
  const step = view.scale * 1000 >= 40 ? 1000 : 10000;
  const left = view.cx - width / 2 / view.scale, top = view.cz - height / 2 / view.scale;
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  for (let x = Math.ceil(left / step) * step; x < left + width / view.scale; x += step) {
    if (x === 0) continue;
    const sx = Math.round(areaExplorerToScreen(view, canvas, x, 0)[0]) + 0.5;
    ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
  }
  for (let z = Math.ceil(top / step) * step; z < top + height / view.scale; z += step) {
    if (z === 0) continue;
    const sz = Math.round(areaExplorerToScreen(view, canvas, 0, z)[1]) + 0.5;
    ctx.moveTo(0, sz); ctx.lineTo(width, sz);
  }
  ctx.stroke();
  const [ox, oz] = areaExplorerToScreen(view, canvas, 0, 0);
  ctx.strokeStyle = colors.axis;
  ctx.beginPath();
  ctx.moveTo(Math.round(ox) + 0.5, 0); ctx.lineTo(Math.round(ox) + 0.5, height);
  ctx.moveTo(0, Math.round(oz) + 0.5); ctx.lineTo(width, Math.round(oz) + 0.5);
  ctx.stroke();

  const live = areaExplorerLiveStatus();
  let flownShown = false;
  if (live?.area && live.online) {
    const [x1, z1] = areaExplorerToScreen(view, canvas, live.area.minX, live.area.minZ);
    const [x2, z2] = areaExplorerToScreen(view, canvas, live.area.maxX, live.area.maxZ);
    ctx.fillStyle = colors.area;
    ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
    flownShown = drawAreaExplorerCoverage(ctx, canvas, view, live, [x1, z1, x2, z2]);
  }
  drawAreaExplorerSelection(ctx, canvas, view);
  drawAreaExplorerNearby(ctx, canvas, view);
  const flownLegend = $('#areaExplorerFlownLegend');
  if (flownLegend && flownLegend.hidden === flownShown) flownLegend.hidden = !flownShown;

  drawAreaExplorerPoints(ctx, view, colors, width, height);

  if (live) {
    const now = Date.now();
    const trail = areaExplorerTrail(live, now);
    ctx.save();
    ctx.strokeStyle = colors.player;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      ctx.globalAlpha = 0.65 * Math.max(0, 1 - (now - trail[i - 1].at) / 3000);
      const [ax, az] = areaExplorerToScreen(view, canvas, trail[i - 1].x, trail[i - 1].z);
      const [bx, bz] = areaExplorerToScreen(view, canvas, trail[i].x, trail[i].z);
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
    }
    ctx.restore();
    if (trail.length > 1 && !ae.trailTimer && state.activeTab === 'area-explorer' && document.visibilityState !== 'hidden') {
      ae.trailTimer = setTimeout(() => { ae.trailTimer = null; queueAreaExplorerMapDraw(); }, 50);
    }
    const [sx, sz] = areaExplorerToScreen(view, canvas, live.x, live.z);
    ctx.save();
    ctx.translate(sx, sz);
    // Minecraft yaw: 0 = south (+Z), 90 = west (-X), 180 = north (-Z).
    ctx.rotate(areaExplorerHeading(live.yaw));
    ctx.fillStyle = colors.player;
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // The territory's edge
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(tx1) + 0.5, Math.round(tz1) + 0.5, Math.round(tx2 - tx1), Math.round(tz2 - tz1));
  $('#areaExplorerGrid').textContent = `Grid ${step.toLocaleString('en-US')} blocks`;
}

// The Xaero map the OnFocus mod sends: tiles anchored to the world, level 0 being Xaero's 512-block
// regions at a pixel a block, each level up covering twice as much a side at the same 512 px

const XAERO_REGION_PX = 512;
const XAERO_TILE_CACHE_LIMIT = 900;
const XAERO_FALLBACK_LEVELS = 5;

/**
 * An image of the map from the cache, loading it the first time; null until it has. A stale one
 * (redrawn on the server) stays on screen while its new version loads.
 */
function cachedMapImage(key, url, { request = true } = {}) {
  const ae = areaExplorerState();
  let entry = ae.tiles.get(key);
  if (entry) {
    // Most recently used last, so the oldest go first when the cache is full
    ae.tiles.delete(key);
    ae.tiles.set(key, entry);
    if (entry.stale && request && !entry.reloading) {
      entry.reloading = true;
      const fresh = new Image();
      fresh.decoding = 'async';
      fresh.onload = () => { Object.assign(entry, { image: fresh, status: 'ready', stale: false, reloading: false }); queueAreaExplorerMapDraw(); };
      fresh.onerror = () => { Object.assign(entry, { status: 'missing', stale: false, reloading: false }); queueAreaExplorerMapDraw(); };
      fresh.src = url;
    }
    return entry.status === 'ready' ? entry.image : null;
  }
  if (!request) return null;
  const image = new Image();
  image.decoding = 'async';
  entry = { image, status: 'loading' };
  image.onload = () => { entry.status = 'ready'; queueAreaExplorerMapDraw(); };
  image.onerror = () => { entry.status = 'missing'; };
  image.src = url;
  ae.tiles.set(key, entry);
  while (ae.tiles.size > XAERO_TILE_CACHE_LIMIT) {
    const oldest = ae.tiles.keys().next().value;
    const stale = ae.tiles.get(oldest);
    if (stale.status === 'loading') stale.image.src = '';
    ae.tiles.delete(oldest);
  }
  return null;
}

/**
 * The map's index for the picked scope: which tiles exist on each level - by day, and the night
 * view too where there is one, both kept so the switch between them can fade from one to the other.
 */
async function loadXaeroRegionMap() {
  const ae = areaExplorerState();
  const scope = ae.scope;
  const [server, dimension] = scope.split('|');
  const map = ae.mapScopes.find(item => item.server === server && item.dimension === dimension);
  renderAreaExplorerNightButton();
  if (!map) return;
  const wanted = [scope, ...(map.night ? [`${server}|${dimension}@night`] : [])];
  await Promise.all(wanted.filter(mapScope => !ae.regionMaps.has(mapScope)).map(async mapScope => {
    const index = await fetchJson(`/api/area-explorer/map/index?${new URLSearchParams({ server, dimension: mapScope.split('|')[1] })}`);
    const regionMap = { scope: mapScope, maxLevel: index.maxLevel, levels: [], versions: new Map() };
    for (let level = 0; level <= index.maxLevel; level++) regionMap.levels.push(new Set());
    for (let i = 0; i < index.regions.length; i += 2) addXaeroRegion(regionMap, index.regions[i], index.regions[i + 1]);
    ae.regionMaps.set(mapScope, regionMap);
  }));
}

/** The map's dimension as tiles are kept: the overworld's night view is "overworld@night". */
function areaExplorerMapDimension(server, dimension) {
  const ae = areaExplorerState();
  const map = ae.mapScopes.find(item => item.server === server && item.dimension === dimension);
  return ae.night && map?.night ? `${dimension}@night` : dimension;
}

/** The Night button: only where there's a night view, pressed while it's shown. */
function renderAreaExplorerNightButton() {
  const ae = areaExplorerState();
  const button = $('#areaExplorerNight');
  if (!button) return;
  const [server, dimension] = ae.scope.split('|');
  button.hidden = !ae.mapScopes.some(item => item.server === server && item.dimension === dimension && item.night);
  button.setAttribute('aria-pressed', String(Boolean(ae.night)));
  button.title = ae.night ? 'Day view' : "Night view, as Xaero's World Map shows it";
}

function addXaeroRegion(regionMap, x, z) {
  for (let level = 0; level <= regionMap.maxLevel; level++) regionMap.levels[level].add(`${x >> level},${z >> level}`);
}

function xaeroRegionTile(regionMap, level, x, z, options) {
  const version = regionMap.versions.get(`${level},${x},${z}`) || 0;
  const [server, dimension] = regionMap.scope.split('|');
  const params = new URLSearchParams({ server, dimension });
  if (version) params.set('v', String(version));
  const epoch = areaExplorerState().regionMapEpoch;
  if (epoch) params.set('e', String(epoch));
  return cachedMapImage(`map|${regionMap.scope}|${level},${x},${z}`, `/api/area-explorer/map/tiles/${level}/${x}/${z}.webp?${params}`, options);
}

/** Tiles the mod's uploads changed: new regions join the index, cached ones load again. */
function applyXaeroRegionMapUpdate(update) {
  const ae = areaExplorerState();
  const scope = `${update.server}|${update.dimension}`;
  // The night view's tiles belong to the dimension they're the night of
  const base = `${update.server}|${update.dimension.replace(/@night$/, '')}`;
  if (!ae.mapScopes.some(item => `${item.server}|${item.dimension}` === base && (base === scope || item.night))) {
    // A scope's first region: the picker learns of it on the next refresh
    queueAreaExplorerRefresh(2000);
    return;
  }
  const regionMap = ae.regionMaps.get(scope);
  if (!regionMap) return;
  if (update.all) {
    ae.regionMaps.delete(scope);
    ae.regionMapEpoch += 1;
    for (const [key, entry] of ae.tiles) if (key.startsWith(`map|${scope}|`)) entry.stale = true;
    if (state.activeTab === 'area-explorer') loadXaeroRegionMap().then(queueAreaExplorerMapDraw).catch(() => {});
    return;
  }
  for (const [level, x, z] of update.tiles) {
    if (level === 0) addXaeroRegion(regionMap, x, z);
    const versionKey = `${level},${x},${z}`;
    regionMap.versions.set(versionKey, (regionMap.versions.get(versionKey) || 0) + 1);
    // Loaded again under its new address, the old picture showing until then
    const cached = ae.tiles.get(`map|${scope}|${versionKey}`);
    if (cached?.status === 'ready') cached.stale = true;
    else if (cached) ae.tiles.delete(`map|${scope}|${versionKey}`);
  }
  if (state.activeTab === 'area-explorer') queueAreaExplorerMapDraw();
}

/** How long dusk (or dawn) takes on the map, ms. */
const AREA_EXPLORER_DUSK_MS = 1600;
// Night as Xaero draws it: unlit ground at 37.5%, a touch of blue in the dark
const AREA_EXPLORER_NIGHT_DARKNESS = 0.625;
const AREA_EXPLORER_NIGHT_TINT = '4, 8, 28';

function easeInOut(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 0 by day, 1 at night, and the way between while it's changing. */
function areaExplorerNightFactor() {
  const ae = areaExplorerState();
  const dusk = ae.dusk;
  if (dusk) {
    const progress = (performance.now() - dusk.start) / dusk.duration;
    if (progress < 1) return dusk.from + (dusk.to - dusk.from) * progress;
    ae.dusk = null;
  }
  return ae.night ? 1 : 0;
}

/** Night on or off: dusk or dawn over the map, from wherever it is now (a click halfway turns it back). */
function setAreaExplorerNight(night) {
  const ae = areaExplorerState();
  const from = areaExplorerNightFactor();
  ae.night = night;
  const to = night ? 1 : 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  ae.dusk = reduced || from === to ? null : { from, to, start: performance.now(), duration: AREA_EXPLORER_DUSK_MS * Math.abs(to - from) };
  queueAreaExplorerMapDraw();
}

/** A tile, or until it loads a stretched piece of a coarser one already in; true if anything was drawn. */
function drawXaeroTile(ctx, regionMap, level, x, z, dx, dy, dw, dh) {
  if (!regionMap?.levels[level]?.has(`${x},${z}`)) return false;
  const image = xaeroRegionTile(regionMap, level, x, z);
  if (image) {
    ctx.drawImage(image, dx, dy, dw, dh);
    return true;
  }
  for (let up = 1; up <= XAERO_FALLBACK_LEVELS && level + up <= regionMap.maxLevel; up++) {
    const parent = xaeroRegionTile(regionMap, level + up, x >> up, z >> up, { request: false });
    if (!parent) continue;
    const piece = XAERO_REGION_PX / 2 ** up;
    ctx.drawImage(parent, (x - ((x >> up) << up)) * piece, (z - ((z >> up) << up)) * piece, piece, piece, dx, dy, dw, dh);
    return true;
  }
  return false;
}

/**
 * Xaero's map under the finds. By day the day tiles; at night the night ones (lit by torches, lava
 * and the like); in between, dusk: the ground darkens towards night first, then the lights come on
 * - at dawn they go off first. Where a region has no night view yet, the darkened day one stands in.
 */
function drawXaeroRegionMap(ctx, canvas, view, ratio) {
  const ae = areaExplorerState();
  const [server, dimension] = ae.scope.split('|');
  const dayMap = ae.regionMaps.get(ae.scope);
  const nightMap = ae.regionMaps.get(`${server}|${dimension}@night`);
  if (!dayMap && !nightMap) return;
  const n = nightMap ? areaExplorerNightFactor() : 0;
  const darkness = easeInOut(n / 0.8);
  const lights = easeInOut((n - 0.45) / 0.55);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  // What's in view of the territory: no tile past it is asked for
  const half = areaExplorerState().extent / 2;
  const left = Math.max(-half, view.cx - width / 2 / view.scale), top = Math.max(-half, view.cz - height / 2 / view.scale);
  const right = Math.min(half - 1, view.cx + width / 2 / view.scale), bottom = Math.min(half - 1, view.cz + height / 2 / view.scale);
  // The level whose pixels are at least one screen pixel
  const blockOnScreen = view.scale * ratio;
  const maxLevel = (dayMap || nightMap).maxLevel;
  const level = Math.min(maxLevel, Math.max(0, Math.floor(Math.log2(1 / blockOnScreen))));
  const tileBlocks = XAERO_REGION_PX * 2 ** level;

  // Any night at all: drawn on a layer of its own, so the dark falls only on drawn ground, not the map around it
  const dusky = darkness > 0 || lights > 0;
  let target = ctx;
  if (dusky) {
    ae.duskLayer ||= document.createElement('canvas');
    const layer = ae.duskLayer;
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
    target = layer.getContext('2d');
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, layer.width, layer.height);
    target.setTransform(ctx.getTransform());
  }
  target.imageSmoothingEnabled = blockOnScreen * 2 ** level < 1;

  const tiles = [];
  for (let z = Math.floor(top / tileBlocks); z <= Math.floor(bottom / tileBlocks); z++) {
    for (let x = Math.floor(left / tileBlocks); x <= Math.floor(right / tileBlocks); x++) {
      const [sx, sz] = areaExplorerToScreen(view, canvas, x * tileBlocks, z * tileBlocks);
      const [ex, ez] = areaExplorerToScreen(view, canvas, (x + 1) * tileBlocks, (z + 1) * tileBlocks);
      // Whole pixels, so neighbouring tiles meet without a seam
      const dx = Math.floor(sx), dy = Math.floor(sz);
      tiles.push([x, z, dx, dy, Math.ceil(ex) - dx, Math.ceil(ez) - dy]);
    }
  }
  // The day picture - all of it by day, under the night where that isn't fully in yet
  const nightDone = new Set();
  for (const [x, z, dx, dy, dw, dh] of tiles) {
    if (lights >= 1 && drawXaeroTile(target, nightMap, level, x, z, dx, dy, dw, dh)) {
      nightDone.add(`${x},${z}`);
      continue;
    }
    drawXaeroTile(target, dayMap, level, x, z, dx, dy, dw, dh);
  }
  if (dusky) {
    // Evening falls on the drawn ground only (source-atop: where the layer has pixels)
    if (darkness > 0) {
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = 'source-atop';
      target.fillStyle = `rgba(${AREA_EXPLORER_NIGHT_TINT}, ${AREA_EXPLORER_NIGHT_DARKNESS * darkness})`;
      target.fillRect(0, 0, target.canvas.width, target.canvas.height);
      target.restore();
    }
    // Then the lights come on: the night view over the darkened day
    if (lights > 0 && lights < 1) {
      target.globalAlpha = lights;
      for (const [x, z, dx, dy, dw, dh] of tiles) drawXaeroTile(target, nightMap, level, x, z, dx, dy, dw, dh);
      target.globalAlpha = 1;
    }
    // The night tiles drawn whole above went under the dark: drawn again on top
    if (lights >= 1 && nightDone.size) {
      for (const [x, z, dx, dy, dw, dh] of tiles) if (nightDone.has(`${x},${z}`)) drawXaeroTile(target, nightMap, level, x, z, dx, dy, dw, dh);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(target.canvas, 0, 0);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = true;
  // Dusk is moving: the next frame
  if (ae.dusk) queueAreaExplorerMapDraw();
}

function bindAreaExplorerMap() {
  const ae = areaExplorerState();
  if (ae.mapBound) return;
  const canvas = $('#areaExplorerMap');
  if (!canvas) return;
  ae.mapBound = true;
  const pointers = new Map();
  let dragged = false, pinchDistance = 0, pinchCentre = null, holdTimer = null;
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
  const cursor = $('#areaExplorerCursor');
  const local = event => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const showCoordinates = (sx, sz) => {
    if (!ae.view) return;
    const x = ae.view.cx + (sx - canvas.clientWidth / 2) / ae.view.scale;
    const z = ae.view.cz + (sz - canvas.clientHeight / 2) / ae.view.scale;
    cursor.textContent = `X ${Math.floor(x)} · Z ${Math.floor(z)}`;
    cursor.hidden = false;
  };

  // Right click (a long press on a phone): what can be done here
  canvas.addEventListener('contextmenu', event => {
    if (!ae.view) return;
    event.preventDefault();
    cancelHold();
    dragged = true;
    openAreaExplorerMenu(...local(event));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || state.activeTab !== 'area-explorer') return;
    if (!$('#areaExplorerMenu').hidden) {
      closeAreaExplorerMenu();
      $('#areaExplorerMapActions').focus({ preventScroll: true });
      event.preventDefault();
    } else if (ae.areaSelection) {
      ae.areaSelection = null;
      queueAreaExplorerMapDraw();
      event.preventDefault();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#areaExplorerMenu, #areaExplorerMapActions')) closeAreaExplorerMenu();
  }, true);

  canvas.addEventListener('wheel', event => {
    if (!ae.view) return;
    event.preventDefault();
    zoomAreaExplorerMap(Math.exp(-event.deltaY * 0.0015), ...local(event));
  }, { passive: false });

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    cancelHold();
    canvas.setPointerCapture(event.pointerId);
    if (!pointers.size) dragged = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      dragged = true;
    } else if (pointers.size === 1 && ae.view && event.pointerType !== 'mouse') {
      holdTimer = setTimeout(() => {
        dragged = true;
        showCoordinates(...local(event));
        openAreaExplorerMenu(...local(event));
      }, 550);
    }
  });
  canvas.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') cursor.hidden = true; });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') showCoordinates(...local(event));
    // Picking an area: the far corner follows the mouse
    if (ae.areaSelection?.picking && event.pointerType === 'mouse' && ae.view) {
      const [x, z] = areaExplorerFromScreen(canvas, ...local(event));
      ae.areaSelection.x2 = x;
      ae.areaSelection.z2 = z;
      queueAreaExplorerMapDraw();
    }
    const last = pointers.get(event.pointerId);
    if (!last || !ae.view) return;
    pointers.set(event.pointerId, { ...last, x: event.clientX, y: event.clientY });
    if (Math.hypot(event.clientX - last.startX, event.clientY - last.startY) > 6) {
      dragged = true;
      cancelHold();
    }
    if (pointers.size > 2) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = canvas.getBoundingClientRect();
      // One finger pans; two fingers zoom around the gesture's initial midpoint.
      if (pinchDistance && pinchCentre) zoomAreaExplorerMap(distance / pinchDistance, pinchCentre.x - rect.left, pinchCentre.y - rect.top);
      pinchDistance = distance;
      dragged = true;
      return;
    }
    const dx = event.clientX - last.x, dy = event.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    ae.view.cx -= dx / ae.view.scale;
    ae.view.cz -= dy / ae.view.scale;
    clampAreaExplorerView();
    queueAreaExplorerMapDraw();
    noteAreaExplorerViewMoved();
  });
  const release = event => {
    cancelHold();
    pointers.delete(event.pointerId);
    pinchDistance = 0;
    pinchCentre = null;
  };
  canvas.addEventListener('pointerup', event => {
    if (!pointers.has(event.pointerId)) return;
    const wasGesture = dragged || pointers.size > 1;
    release(event);
    if (wasGesture || !ae.view) return;
    const [sx, sz] = local(event);
    // A tap shows where it landed: there is no hovering on a phone
    if (event.pointerType !== 'mouse') showCoordinates(sx, sz);
    // Picking an area: this click is its far corner, and what to do with it comes up right there
    if (ae.areaSelection?.picking) {
      const [x, z] = areaExplorerFromScreen(canvas, sx, sz);
      Object.assign(ae.areaSelection, { x2: x, z2: z, picking: false });
      queueAreaExplorerMapDraw();
      openAreaExplorerMenu(sx, sz);
      return;
    }
    const hit = areaExplorerHitAt(sx, sz, event.pointerType === 'mouse' ? 10 : 20);
    // A cluster opens up: zoomed in on it, until its finds show on their own
    if (hit?.cluster) {
      ae.view = { cx: hit.cluster.x, cz: hit.cluster.z, scale: Math.min(ae.view.scale * 4, AREA_EXPLORER_MAX_SCALE) };
      clampAreaExplorerView();
      queueAreaExplorerMapDraw();
      noteAreaExplorerViewMoved();
      return;
    }
    selectAreaExplorerFind(hit?.point.id || null).catch(error => setBanner(error.message));
  });
  canvas.addEventListener('pointercancel', event => { dragged = true; release(event); });
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', event => {
    if (!ae.view) return;
    if (event.key === '+' || event.key === '=') zoomAreaExplorerMap(2);
    else if (event.key === '-') zoomAreaExplorerMap(0.5);
    else if (event.key === 'Home') { fitAreaExplorerMap(); queueAreaExplorerMapDraw(); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const step = 60 / ae.view.scale;
      ae.view.cx += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      ae.view.cz += event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      clampAreaExplorerView();
      queueAreaExplorerMapDraw();
    } else return;
    event.preventDefault();
  });

  const onResize = () => {
    clampAreaExplorerView();
    const selected = ae.points.find(point => point.id === ae.selectedId);
    if (selected) revealAreaExplorerFind(selected);
    queueAreaExplorerMapDraw();
  };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);
}

function setAreaExplorerFullscreen(on) {
  closeAreaExplorerMenu();
  closeAreaExplorerMarkerFilters();
  const wrap = $('#areaExplorerMapWrap');
  wrap.classList.toggle('is-fullscreen', on);
  document.body.classList.toggle('area-explorer-fullscreen', on);
  const button = $('#areaExplorerFullscreen');
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
  button.title = on ? 'Leave full screen' : 'Full screen';
  (on ? $('#areaExplorerMap') : button).focus({ preventScroll: true });
  queueAreaExplorerMapDraw();
}

function setAreaExplorerFindsVisible(show) {
  const ae = areaExplorerState();
  if (show && ae.visibleKinds?.length === 0) {
    ae.visibleKinds = [...AREA_EXPLORER_MAP_LAYERS];
    saveAreaExplorerSetting('areaExplorerMapLayers', JSON.stringify(ae.visibleKinds));
  }
  ae.showFinds = show;
  saveAreaExplorerSetting('areaExplorerShowFinds', show);
  const button = $('#areaExplorerToggleFinds');
  button.setAttribute('aria-pressed', String(!show));
  button.setAttribute('aria-label', show ? 'Hide map markers' : 'Show map markers');
  button.title = `${show ? 'Hide' : 'Show'} map markers; hold to choose types`;
  $('#areaExplorerMapWrap').classList.toggle('is-hiding-finds', !show);
  if (!show) {
    ae.selectedId = null;
    ae.selectedRequestId = (ae.selectedRequestId || 0) + 1;
    $('#areaExplorerSelected').hidden = true;
  }
  renderAreaExplorerMarkerVisibility();
  queueAreaExplorerMapDraw();
}

/** Keep the selected marker above its details sheet, including after a rotation. */
function revealAreaExplorerFind(find) {
  const ae = areaExplorerState();
  const canvas = $('#areaExplorerMap');
  const sheet = $('#areaExplorerSelected');
  if (!ae.view || sheet.hidden) return;
  const bottom = sheet.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 24;
  const top = 64; // Leave room for the legend.
  if (bottom <= top) return;
  const [, y] = areaExplorerToScreen(ae.view, canvas, find.x, find.z);
  if (y >= top && y <= bottom) return;
  ae.view.cz += (y - (top + bottom) / 2) / ae.view.scale;
  clampAreaExplorerView();
  queueAreaExplorerMapDraw();
  noteAreaExplorerViewMoved();
}

async function selectAreaExplorerFind(id) {
  const ae = areaExplorerState();
  const box = $('#areaExplorerSelected');
  const requestId = ae.selectedRequestId = (ae.selectedRequestId || 0) + 1;
  ae.selectedId = id;
  box.hidden = true;
  queueAreaExplorerMapDraw();
  if (!id) {
    box.hidden = true;
    return;
  }
  const { find } = await fetchJson(`/api/area-explorer/finds/${encodeURIComponent(id)}`);
  if (ae.selectedId !== id || ae.selectedRequestId !== requestId) return;
  box.innerHTML = `<button class="area-explorer-selected-close" type="button" data-area-close-selected aria-label="Close">×</button>
    <ol class="area-explorer-finds">${renderAreaExplorerFind(find, { selected: true })}</ol>`;
  box.hidden = false;
  revealAreaExplorerFind(find);
}

// Tokens for the mod (administrators)

async function loadAreaExplorerTokens() {
  const { tokens } = await fetchJson('/api/admin/area-explorer/tokens');
  const list = $('#areaExplorerTokens');
  list.innerHTML = tokens.length
    ? tokens.map(token => `<li class="${token.revokedAt ? 'is-revoked' : ''}">
        <div><strong>${escapeHtml(token.name)}</strong> <code>…${escapeHtml(token.hint)}</code></div>
        <small>${token.revokedAt ? `Revoked ${escapeHtml(formatFullDateTime(token.revokedAt))}` : token.lastUsedAt ? `Last upload ${escapeHtml(formatFullDateTime(token.lastUsedAt))}` : 'Not used yet'}</small>
        ${token.revokedAt ? '' : `<button class="ghost-button" type="button" data-revoke-area-token="${escapeHtml(token.id)}">Revoke</button>`}
      </li>`).join('')
    : '<li class="area-explorer-empty">No tokens yet.</li>';
}

function setupAreaExplorer() {
  const ae = areaExplorerState();
  if (!ae.liveTimer) ae.liveTimer = setInterval(loadAreaExplorerLive, 1000);
  // An item with no picture anywhere shows its kind's icon instead (errors don't bubble: caught on the way down)
  $('#tab-area-explorer').addEventListener('error', event => {
    const image = event.target;
    if (image.tagName !== 'IMG' || !image.dataset.fallback || image.getAttribute('src') === image.dataset.fallback) return;
    image.src = image.dataset.fallback;
  }, true);
  const reloadScope = () => Promise.all([loadAreaExplorerFinds(), loadAreaExplorerMap()])
    .catch(error => setBanner(`Could not load Area Explorer finds: ${error.message}`));
  const changeScope = scope => {
    ae.scope = scope;
    ae.offset = 0;
    if (ae.logServer !== null && ae.logServer !== areaExplorerLogServer()) {
      loadAreaExplorerLog().catch(error => setBanner(`Could not load the run log: ${error.message}`));
    }
    ae.selectedId = null;
    $('#areaExplorerSelected').hidden = true;
    ae.areaSelection = null;
    ae.nearby = null;
    ae.view = null;
    closeAreaExplorerMenu();
    renderAreaExplorerScopes();
    fitAreaExplorerMap();
    return reloadScope();
  };
  $$('[data-area-jump]').forEach(button => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.areaJump);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }));
  $$('[data-area-kind]').forEach(button => button.addEventListener('click', () => {
    ae.kind = button.dataset.areaKind;
    ae.offset = 0;
    ae.selectedId = null;
    $('#areaExplorerSelected').hidden = true;
    $$('[data-area-kind]').forEach(other => {
      other.classList.toggle('active', other === button);
      other.setAttribute('aria-pressed', String(other === button));
    });
    renderAreaExplorerScopes();
    reloadScope();
  }));
  const setKind = kind => {
    ae.kind = kind;
    $$('[data-area-kind]').forEach(other => {
      const active = other.dataset.areaKind === kind;
      other.classList.toggle('active', active);
      other.setAttribute('aria-pressed', String(active));
    });
  };
  // A highlight lists its finds: a kind of marker, or a loot item by name
  $('#areaExplorerHighlights').addEventListener('click', event => {
    const chip = event.target.closest('[data-area-filter-kind]');
    if (!chip) return;
    setKind(chip.dataset.areaFilterKind);
    ae.markerName = chip.dataset.areaFilterName || '';
    ae.q = chip.dataset.areaFilterQ || '';
    $('#areaExplorerSearch').value = ae.q;
    ae.offset = 0;
    ae.selectedId = null;
    $('#areaExplorerSelected').hidden = true;
    renderAreaExplorerScopes();
    reloadScope().then(() => $('.area-explorer-finds-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  $('#areaExplorerSort').value = ae.sort;
  $('#areaExplorerSort').addEventListener('change', event => {
    ae.sort = event.target.value;
    saveAreaExplorerSetting('areaExplorerSort', ae.sort);
    ae.offset = 0;
    loadAreaExplorerFinds().catch(error => setBanner(error.message));
  });
  $('#areaExplorerMarkerName').addEventListener('change', event => {
    ae.markerName = event.target.value;
    ae.offset = 0;
    ae.selectedId = null;
    $('#areaExplorerSelected').hidden = true;
    reloadScope();
  });
  $('#areaExplorerSearch').addEventListener('input', event => {
    clearTimeout(ae.searchTimer);
    ae.searchTimer = setTimeout(() => {
      ae.q = event.target.value.trim();
      ae.offset = 0;
      loadAreaExplorerFinds().catch(error => setBanner(`Could not search Area Explorer finds: ${error.message}`));
    }, 300);
  });
  const turnPage = delta => {
    ae.offset = Math.max(0, ae.offset + delta);
    loadAreaExplorerFinds()
      .then(() => $('#areaExplorerFinds').scrollIntoView({ behavior: 'smooth', block: 'start' }))
      .catch(error => setBanner(error.message));
  };
  $('#areaExplorerPrev').addEventListener('click', () => turnPage(-AREA_EXPLORER_PAGE_SIZE));
  $('#areaExplorerNext').addEventListener('click', () => turnPage(AREA_EXPLORER_PAGE_SIZE));

  // The map's own controls
  setAreaExplorerFindsVisible(ae.showFinds);
  $('#areaExplorerMapActions').addEventListener('click', () => {
    if (!$('#areaExplorerMenu').hidden) { closeAreaExplorerMenu(); return; }
    const canvas = $('#areaExplorerMap');
    if (ae.view) openAreaExplorerMenu(canvas.clientWidth / 2, canvas.clientHeight / 2);
  });
  bindAreaExplorerVisibility();
  $('#areaExplorerLocatePlayer').addEventListener('click', focusAreaExplorerPlayer);
  renderAreaExplorerExtent();
  $$('[data-area-log-filter]').forEach(button => button.addEventListener('click', () => {
    ae.logFilter = button.dataset.areaLogFilter;
    $$('[data-area-log-filter]').forEach(other => {
      other.classList.toggle('active', other === button);
      other.setAttribute('aria-pressed', String(other === button));
    });
    loadAreaExplorerLog().catch(error => setBanner(`Could not load the run log: ${error.message}`));
  }));
  $('#areaExplorerNight').addEventListener('click', () => {
    setAreaExplorerNight(!ae.night);
    saveAreaExplorerSetting('areaExplorerNight', ae.night);
    renderAreaExplorerNightButton();
    // Both views are normally in already; if not, dusk starts as soon as they are
    loadXaeroRegionMap().then(queueAreaExplorerMapDraw).catch(error => setBanner(error.message));
  });
  $('#areaExplorerNewFinds').addEventListener('click', () => {
    $('#areaExplorerFinds').scrollTo({ top: 0, behavior: 'smooth' });
    setAreaExplorerNewFinds(0);
  });
  // Scrolled up to them by hand: nothing left to point at
  $('#areaExplorerFinds').addEventListener('scroll', event => {
    if (ae.newFindsAbove && event.currentTarget.scrollTop <= 4) setAreaExplorerNewFinds(0);
  }, { passive: true });
  $('#areaExplorerLogMore').addEventListener('click', () => {
    loadAreaExplorerLog({ older: true }).catch(error => setBanner(`Could not load older events: ${error.message}`));
  });
  $$('[data-area-radius]').forEach(button => button.addEventListener('click', () => {
    ae.extent = 2 * Number(button.dataset.areaRadius);
    saveAreaExplorerSetting('areaExplorerRadius', button.dataset.areaRadius);
    renderAreaExplorerExtent();
    fitAreaExplorerMap();
    queueAreaExplorerMapDraw();
  }));
  $('#areaExplorerZoomIn').addEventListener('click', () => zoomAreaExplorerMap(2));
  $('#areaExplorerZoomOut').addEventListener('click', () => zoomAreaExplorerMap(0.5));
  $('#areaExplorerMapReset').addEventListener('click', () => {
    fitAreaExplorerMap();
    queueAreaExplorerMapDraw();
  });
  $('#areaExplorerFullscreen').addEventListener('click', () => {
    setAreaExplorerFullscreen(!$('#areaExplorerMapWrap').classList.contains('is-fullscreen'));
  });
  document.addEventListener('keydown', event => {
    const wrap = $('#areaExplorerMapWrap');
    if (!wrap?.classList.contains('is-fullscreen') || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      if (!$('#areaExplorerMenu').hidden || !$('#areaExplorerMarkerFilters').hidden || ae.areaSelection) return;
      setAreaExplorerFullscreen(false);
    }
    if (event.key === 'Tab') {
      const controls = [...wrap.querySelectorAll('canvas, button:not(:disabled)')].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  $('#tab-area-explorer').addEventListener('click', async event => {
    const coords = event.target.closest('[data-copy-coords]');
    if (coords) {
      try {
        await writeClipboardText(coords.dataset.copyCoords);
        coords.classList.add('copied');
        setTimeout(() => coords.classList.remove('copied'), 1200);
      } catch { /* the coordinates stay on screen to copy by hand */ }
      return;
    }
    if (event.target.closest('[data-area-close-selected]')) {
      selectAreaExplorerFind(null);
      return;
    }
    // Loot picked up in game: off the list, the map and the highlights
    const pickup = event.target.closest('[data-area-pickup]');
    if (pickup) {
      const id = pickup.dataset.areaPickup;
      const loot = pickup.dataset.areaPickupKind !== 'MARKER';
      if (!confirm(loot ? `Take ${pickup.dataset.areaPickupName} off the site? Do this once it's been picked up in game.`
        : `Remove the ${pickup.dataset.areaPickupName} marker from the site? The mod finding it again won't bring it back.`)) return;
      pickup.disabled = true;
      try {
        await deleteJson(`/api/area-explorer/finds/${encodeURIComponent(id)}`);
        $$(`#tab-area-explorer [data-find-id="${CSS.escape(id)}"]`).forEach(item => item.remove());
        if (ae.selectedId === id) selectAreaExplorerFind(null);
        ae.points = ae.points.filter(point => point.id !== id);
        queueAreaExplorerMapDraw();
        ae.findsDirty = true;
        await loadAreaExplorer({ full: false });
      } catch (error) {
        pickup.disabled = false;
        setBanner(`Could not take ${loot ? 'the loot' : 'the marker'} off: ${error.message}`);
      }
      return;
    }
    const focus = event.target.closest('[data-area-focus]');
    if (focus) {
      const [x, z] = focus.dataset.areaFocus.split(',').map(Number);
      if (focus.dataset.areaFocusScope && focus.dataset.areaFocusScope !== ae.scope && areaExplorerScopes().some(scope => `${scope.server}|${scope.dimension}` === focus.dataset.areaFocusScope)) {
        await changeScope(focus.dataset.areaFocusScope);
      }
      focusAreaExplorerMap(x, z);
      if (focus.dataset.areaSelectFind) selectAreaExplorerFind(focus.dataset.areaSelectFind).catch(error => setBanner(error.message));
      return;
    }
    // A find in the list: shown on the map, unless it's the one on the map already
    const find = event.target.closest('.area-explorer-finds-panel [data-find-at]');
    if (find && (event.target.closest('[data-area-select]') || !event.target.closest('button, a, pre'))) {
      const [x, z] = find.dataset.findAt.split(',').map(Number);
      focusAreaExplorerMap(x, z);
      selectAreaExplorerFind(find.dataset.findId).catch(error => setBanner(error.message));
      return;
    }
    const revoke = event.target.closest('[data-revoke-area-token]');
    if (revoke && confirm('Revoke this token? The mod using it stops uploading.')) {
      try {
        await deleteJson(`/api/admin/area-explorer/tokens/${encodeURIComponent(revoke.dataset.revokeAreaToken)}`);
        ae.tokensDirty = true;
        await loadAreaExplorer({ full: false });
      } catch (error) { setBanner(`Could not revoke the token: ${error.message}`); }
    }
  });
  $('#areaExplorerTokenForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#areaExplorerTokenName');
    try {
      const { token } = await postJson('/api/admin/area-explorer/tokens', { name: input.value });
      input.value = '';
      $('#areaExplorerNewTokenValue').textContent = token;
      $('#areaExplorerNewToken').hidden = false;
      await loadAreaExplorerTokens();
    } catch (error) { setBanner(`Could not create the token: ${error.message}`); }
  });
  $('#areaExplorerCopyToken').addEventListener('click', () => {
    writeClipboardText($('#areaExplorerNewTokenValue').textContent).catch(() => {});
  });
}

/** A live update from the mod: only what it changed is loaded again. */
function noteAreaExplorerUpdate(payload) {
  const ae = areaExplorerState();
  if (payload.added || payload.removed) ae.findsDirty = true;
  if (payload.tokenRevoked) ae.tokensDirty = true;
}

/**
 * A refresh already on its way is not pushed back by the next update: while the mod keeps uploading
 * (finds, map tiles) the counts still move every moment instead of waiting for it to go quiet.
 */
function queueAreaExplorerRefresh(delay) {
  if (state.realtimeRefreshTimers['area-explorer'] && (state.areaExplorerRefreshDue || 0) <= Date.now() + delay) return;
  state.areaExplorerRefreshDue = Date.now() + delay;
  queueRealtimeRefresh('area-explorer', refreshAreaExplorerFromEvent, delay);
}

function refreshAreaExplorerFromEvent() {
  if (state.activeTab !== 'area-explorer') {
    areaExplorerState().loadedAt = 0;
    return Promise.resolve();
  }
  return loadAreaExplorer({ full: false });
}

async function loadKillAura() {
  if (!state.currentUser) return;
  renderKillAura(await fetchJson('/api/kill-aura'));
}

function setKillAuraTargetModalOpen(open, { restoreSelection = false, restoreFocus = true } = {}) {
  const modal = $('#killAuraTargetModal');
  const opener = $('#killAuraTargetModalOpen');
  if (!modal || !opener) return;
  const nextOpen = Boolean(open);
  if (nextOpen) {
    state.killAuraModalSelectionSnapshot = new Set(state.killAuraSelectedMobs);
    modal.hidden = false;
    modal.classList.add('is-open');
    opener.setAttribute('aria-expanded', 'true');
    document.body.classList.add('kill-aura-modal-open');
    renderKillAuraMobList();
    requestAnimationFrame(() => $('#killAuraSearch')?.focus());
    return;
  }

  if (restoreSelection) {
    state.killAuraSelectedMobs = new Set(state.killAuraModalSelectionSnapshot);
    state.killAuraTargetsDirty = false;
    renderKillAuraMobList();
  }
  modal.classList.remove('is-open');
  modal.hidden = true;
  opener.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('kill-aura-modal-open');
  const search = $('#killAuraSearch');
  if (search) search.value = '';
  if (restoreFocus) requestAnimationFrame(() => opener.focus());
}

function closeKillAuraTargetModal() {
  setKillAuraTargetModalOpen(false, { restoreSelection: true });
}

function trapKillAuraModalFocus(event) {
  const modal = $('#killAuraTargetModal');
  if (!modal?.classList.contains('is-open') || event.key !== 'Tab') return;
  const focusable = $$('button:not(:disabled), input:not(:disabled)').filter(element => modal.contains(element));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleKillAuraModalKeydown(event) {
  const modal = $('#killAuraTargetModal');
  if (!modal?.classList.contains('is-open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeKillAuraTargetModal();
    return;
  }
  trapKillAuraModalFocus(event);
}

function openKillAuraTargetModal() {
  setKillAuraTargetModalOpen(true);
}

function handleKillAuraModalClick(event) {
  if (event.target.closest('[data-kill-aura-modal-close]')) closeKillAuraTargetModal();
}

function handleKillAuraMobChange(event) {
  const checkbox = event.target.closest('input[type="checkbox"]');
  if (!checkbox) return;
  if (checkbox.checked) state.killAuraSelectedMobs.add(checkbox.value);
  else state.killAuraSelectedMobs.delete(checkbox.value);
  state.killAuraTargetsDirty = true;
  updateKillAuraSelectionSummary();
  const toggle = $('#killAuraToggleButton');
  if (toggle && !state.killAuraData?.state?.enabled) toggle.disabled = !state.killAuraSelectedMobs.size;
}

function setKillAuraSelection(predicate) {
  const mobs = state.killAuraData?.mobs || [];
  state.killAuraSelectedMobs = new Set(mobs.filter(predicate).map(mob => mob.id));
  state.killAuraTargetsDirty = true;
  renderKillAuraMobList();
}

async function saveKillAuraTargets() {
  const button = $('#killAuraSaveTargets');
  if (!button || state.currentUser?.role !== 'admin') return;
  button.disabled = true;
  try {
    const targets = [...state.killAuraSelectedMobs];
    await postJson('/api/admin/bot-command', {
      commandType: 'kill_aura_targets',
      payload: { targets },
      accountId: state.activeAccountId
    });
    state.killAuraTargetsDirty = false;
    if (state.killAuraData?.state) state.killAuraData.state.selectedMobs = targets;
    renderKillAuraMobList();
    setKillAuraTargetModalOpen(false);
    scheduleAdminControlRefresh();
  } catch (error) {
    setBanner(`Could not save Kill Aura targets: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function updatePlaytimeLeaderboardScopeControls(scope, { animateButton = false } = {}) {
  const controls = $('#playtimeLeaderboardScope');
  if (controls) controls.dataset.activeScope = scope;
  $$('#playtimeLeaderboardScope [data-playtime-scope]').forEach(button => {
    const active = button.dataset.playtimeScope === scope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (active && animateButton) {
      button.classList.remove('pressed');
      void button.offsetWidth;
      button.classList.add('pressed');
    }
  });
}

function updatePlaytimeLeaderboardSortControls(sort, direction, { animateButton = false } = {}) {
  const controls = $('#playtimeLeaderboardSort');
  if (controls) controls.dataset.activeSort = sort;
  $$('#playtimeLeaderboardSort [data-playtime-sort]').forEach(button => {
    const active = button.dataset.playtimeSort === sort;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (active && animateButton) {
      button.classList.remove('pressed');
      void button.offsetWidth;
      button.classList.add('pressed');
    }
  });

  const directionButton = $('#playtimeLeaderboardDirection');
  if (directionButton) {
    const isAscending = direction === 'asc';
    directionButton.dataset.direction = direction;
    directionButton.setAttribute('aria-pressed', String(isAscending));
    directionButton.setAttribute('aria-label', isAscending ? 'Sort lowest to highest' : 'Sort highest to lowest');
    directionButton.title = isAscending ? 'Lowest to highest' : 'Highest to lowest';
    const icon = directionButton.querySelector('.leaderboard-direction-icon');
    if (icon) icon.textContent = isAscending ? '↑' : '↓';
  }
}

function comparePlaytimeLeaderboardEntries(a, b, sort, direction) {
  const dir = direction === 'asc' ? 1 : -1;
  if (sort === 'messages') return dir * ((a.messageCount || 0) - (b.messageCount || 0));
  if (sort === 'joindate') {
    const aTime = a.joinDate ? new Date(a.joinDate).getTime() : null;
    const bTime = b.joinDate ? new Date(b.joinDate).getTime() : null;
    if (aTime == null && bTime == null) return 0;
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return dir * (aTime - bTime);
  }
  return dir * ((a.totalSeconds || 0) - (b.totalSeconds || 0));
}

function sortPlaytimeLeaderboardEntries(entries, sort, direction) {
  return [...entries].sort((a, b) => comparePlaytimeLeaderboardEntries(a, b, sort, direction));
}

function playtimeLeaderboardStatValue(player, sort) {
  if (sort === 'messages') return `${formatNumber(player.messageCount || 0)} msgs`;
  if (sort === 'joindate') return player.joinDate ? formatRegistrationAge(player.joinDate) : 'Unknown';
  return player.playtime;
}

function setInventoryMoveHint(message, { error = false } = {}) {
  const hint = $('#botInventoryHint');
  if (!hint) return;
  hint.textContent = message;
  hint.classList.toggle('inventory-hint-error', error);
}

function clearInventoryMoveSelection() {
  state.inventoryMoveSelection = null;
  $$('#botInventory .inventory-selected, #botInventory .inventory-drag-over, #botInventory .inventory-dragging')
    .forEach(slot => slot.classList.remove('inventory-selected', 'inventory-drag-over', 'inventory-dragging'));
  $('#botInventory .bot-inventory-layout')?.classList.remove('inventory-move-active');
}

function inventorySlotItemFromElement(slot) {
  if (!slot?.dataset.inventoryItemName) return null;
  const item = {
    name: slot.dataset.inventoryItemName,
    count: Number(slot.dataset.inventoryItemCount) || 1
  };
  if (slot.dataset.inventoryItemDurability != null && slot.dataset.inventoryItemDurability !== '') {
    item.durabilityUsed = Number(slot.dataset.inventoryItemDurability);
  }
  return item;
}

function selectInventoryMoveSource(slot) {
  const item = inventorySlotItemFromElement(slot);
  const sourceSlot = Number(slot?.dataset.inventorySlot);
  if (!item || !Number.isInteger(sourceSlot) || state.inventoryMovePending) return false;

  clearInventoryMoveSelection();
  state.inventoryMoveSelection = { sourceSlot, item };
  slot.classList.add('inventory-selected');
  $('#botInventory .bot-inventory-layout')?.classList.add('inventory-move-active');
  setInventoryMoveHint(`Selected ${item.name.replaceAll('_', ' ')}. Choose its destination slot.`);
  return true;
}

async function moveSelectedInventoryItem(targetSlotElement) {
  const selection = state.inventoryMoveSelection;
  const targetSlot = Number(targetSlotElement?.dataset.inventorySlot);
  if (!selection || !Number.isInteger(targetSlot) || state.inventoryMovePending) return;
  if (selection.sourceSlot === targetSlot) {
    clearInventoryMoveSelection();
    setInventoryMoveHint('Inventory move cancelled.');
    return;
  }

  const expectedTarget = inventorySlotItemFromElement(targetSlotElement);
  state.inventoryMovePending = true;
  $('#botInventory .bot-inventory-layout')?.classList.add('inventory-move-pending');
  setInventoryMoveHint(`Moving item from slot ${selection.sourceSlot} to slot ${targetSlot}...`);

  try {
    const queued = await postJson('/api/admin/bot-command', {
      commandType: 'inventory_move',
      accountId: state.activeAccountId,
      payload: {
        sourceSlot: selection.sourceSlot,
        targetSlot,
        expectedSource: selection.item,
        expectedTarget
      }
    });
    await waitForAdminBotCommand(queued.command.id);
    state.inventoryMovePending = false;
    clearInventoryMoveSelection();
    state.renderSignatures['#botInventory'] = null;
    await refreshBotFromEvent();
    setInventoryMoveHint(`Moved item to slot ${targetSlot}.`);
  } catch (error) {
    state.inventoryMovePending = false;
    clearInventoryMoveSelection();
    state.renderSignatures['#botInventory'] = null;
    await refreshBotFromEvent().catch(() => {});
    setInventoryMoveHint(error.message || 'Could not move the inventory item.', { error: true });
  } finally {
    $('#botInventory .bot-inventory-layout')?.classList.remove('inventory-move-pending');
  }
}

function handleBotInventoryClick(event) {
  const slot = event.target.closest('[data-inventory-slot]');
  if (!slot || state.currentUser?.role !== 'admin' || Date.now() < state.inventoryDragConsumedUntil) return;
  if (!state.inventoryMoveSelection) return;
  event.preventDefault();
  event.stopPropagation();
  moveSelectedInventoryItem(slot);
}

function handleBotInventoryKeydown(event) {
  const slot = event.target.closest('[data-inventory-slot]');
  if (!['Enter', ' '].includes(event.key) || !slot) return;
  event.preventDefault();
  if (state.inventoryMoveSelection) {
    handleBotInventoryClick(event);
    return;
  }
  const tooltipKey = slot.dataset.supplyTooltip;
  if (tooltipKey) showSupplyTooltip(tooltipKey, slot);
}

function handleBotInventoryDragStart(event) {
  const slot = event.target.closest('[data-inventory-item-name]');
  if (!slot || state.currentUser?.role !== 'admin' || state.inventoryMovePending) {
    event.preventDefault();
    return;
  }
  selectInventoryMoveSource(slot);
  slot.classList.add('inventory-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', slot.dataset.inventorySlot);
}

function handleBotInventoryDragOver(event) {
  const slot = event.target.closest('[data-inventory-slot]');
  if (!slot || !state.inventoryMoveSelection || state.inventoryMovePending) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  $$('#botInventory .inventory-drag-over').forEach(item => item.classList.remove('inventory-drag-over'));
  if (Number(slot.dataset.inventorySlot) !== state.inventoryMoveSelection.sourceSlot) {
    slot.classList.add('inventory-drag-over');
  }
}

function handleBotInventoryDrop(event) {
  const slot = event.target.closest('[data-inventory-slot]');
  if (!slot || !state.inventoryMoveSelection || state.inventoryMovePending) return;
  event.preventDefault();
  state.inventoryDragConsumedUntil = Date.now() + 500;
  moveSelectedInventoryItem(slot);
}

function handleBotInventoryDragEnd() {
  $$('#botInventory .inventory-drag-over, #botInventory .inventory-dragging')
    .forEach(slot => slot.classList.remove('inventory-drag-over', 'inventory-dragging'));
  if (!state.inventoryMovePending && state.inventoryMoveSelection) {
    clearInventoryMoveSelection();
    setInventoryMoveHint('Inventory move cancelled.');
  }
}

function resetPlaytimeLeaderboardScroll(list, scope) {
  if (!list) return;
  list.scrollTop = 0;
  requestAnimationFrame(() => {
    if (state.playtimeLeaderboardScope === scope) list.scrollTop = 0;
  });
}

const MOBILE_LEADERBOARD_BATCH_SIZE = 24;

function resetPlaytimeLeaderboardBatch() {
  state.playtimeLeaderboardVisibleCount = MOBILE_LEADERBOARD_BATCH_SIZE;
}

function maybeLoadMorePlaytimeLeaderboard() {
  const list = $('#playtimeLeaderboard');
  if (!list || !window.matchMedia?.('(max-width: 700px)').matches) return;
  if (list.scrollHeight - list.scrollTop - list.clientHeight > 120) return;

  const scope = state.playtimeLeaderboardScope === 'whitelisted' ? 'whitelisted' : 'global';
  const total = scope === 'global'
    ? Math.min(100, state.playtimeLeaderboards.global.length)
    : state.playtimeLeaderboards.whitelisted.length;
  if (state.playtimeLeaderboardVisibleCount >= total) return;

  const previousScrollTop = list.scrollTop;
  state.playtimeLeaderboardVisibleCount = Math.min(
    total,
    state.playtimeLeaderboardVisibleCount + MOBILE_LEADERBOARD_BATCH_SIZE
  );
  renderPlaytimeLeaderboard({ force: true });
  list.scrollTop = previousScrollTop;
}

function renderPlaytimeLeaderboard({ resetScroll = false, force = false } = {}) {
  const scope = state.playtimeLeaderboardScope === 'whitelisted' ? 'whitelisted' : 'global';
  const sort = ['messages', 'joindate'].includes(state.playtimeLeaderboardSort) ? state.playtimeLeaderboardSort : 'playtime';
  const direction = state.playtimeLeaderboardDirection === 'asc' ? 'asc' : 'desc';
  const sortedLeaderboard = sortPlaytimeLeaderboardEntries(state.playtimeLeaderboards[scope] || [], sort, direction);
  const scopedLeaderboard = scope === 'global' ? sortedLeaderboard.slice(0, 100) : sortedLeaderboard;
  const isMobile = window.matchMedia?.('(max-width: 700px)').matches;
  const leaderboard = isMobile
    ? scopedLeaderboard.slice(0, state.playtimeLeaderboardVisibleCount)
    : scopedLeaderboard;
  const list = $('#playtimeLeaderboard');

  updatePlaytimeLeaderboardScopeControls(scope);
  updatePlaytimeLeaderboardSortControls(sort, direction);
  if (list?.classList.contains('is-leaving') && !force) return;

  const description = $('#playtimeLeaderboardDescription');
  if (description) {
    const scopeText = scope === 'global' ? 'Top 100 server-wide' : 'Whitelisted';
    const sortText = sort === 'messages' ? 'message counts' : sort === 'joindate' ? 'join dates' : 'playtime totals';
    const directionText = direction === 'asc' ? 'lowest to highest' : 'highest to lowest';
    description.textContent = `${scopeText} players, sorted by ${sortText} (${directionText}).`;
  }

  const isFirstRender = Boolean(list && list.dataset.leaderboardRendered !== 'true');
  const didRender = renderStable('#playtimeLeaderboard', leaderboard.length
    ? leaderboard.map((player, index) => `
      <div class="rank-item leaderboard-item">
        <span class="rank-index">${index + 1}</span>
        <span class="leaderboard-player">
          ${playerIdentity(player.username, 28, { status: player.isOnline ? 'online' : 'offline', loading: 'lazy' })}
        </span>
        <strong>${escapeHtml(playtimeLeaderboardStatValue(player, sort))}</strong>
      </div>
    `).join('')
    : `<div class="empty">No ${scope === 'global' ? 'global' : 'whitelist'} data found.</div>`,
    [scope, sort, direction, ...leaderboard.map(player => [player.username, player.isOnline, player.playtime, player.messageCount, player.joinDate])]
  );

  if (didRender && list) list.dataset.leaderboardRendered = 'true';
  if (resetScroll || (didRender && isFirstRender)) {
    resetPlaytimeLeaderboardScroll(list, scope);
  }
}

function animatePlaytimeLeaderboardChange() {
  const list = $('#playtimeLeaderboard');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!list || reducedMotion) {
    renderPlaytimeLeaderboard({ resetScroll: true, force: true });
    return;
  }

  window.clearTimeout(list.playtimeSwapTimer);
  window.clearTimeout(list.playtimeEnterTimer);
  list.classList.remove('is-entering');
  void list.offsetWidth;
  list.classList.add('is-leaving');
  list.setAttribute('aria-busy', 'true');
  list.playtimeSwapTimer = window.setTimeout(() => {
    renderPlaytimeLeaderboard({ resetScroll: true, force: true });
    list.classList.remove('is-leaving');
    void list.offsetWidth;
    list.classList.add('is-entering');
    list.playtimeEnterTimer = window.setTimeout(() => {
      list.classList.remove('is-entering');
      list.removeAttribute('aria-busy');
    }, 320);
  }, 160);
}

function setPlaytimeLeaderboardScope(scope) {
  const nextScope = scope === 'whitelisted' ? 'whitelisted' : 'global';
  if (state.playtimeLeaderboardScope === nextScope) return;
  state.playtimeLeaderboardScope = nextScope;
  resetPlaytimeLeaderboardBatch();
  updatePlaytimeLeaderboardScopeControls(nextScope, { animateButton: true });
  animatePlaytimeLeaderboardChange();
}

function setPlaytimeLeaderboardSort(sort) {
  const nextSort = ['messages', 'joindate'].includes(sort) ? sort : 'playtime';
  if (state.playtimeLeaderboardSort === nextSort) return;
  state.playtimeLeaderboardSort = nextSort;
  resetPlaytimeLeaderboardBatch();
  updatePlaytimeLeaderboardSortControls(nextSort, state.playtimeLeaderboardDirection, { animateButton: true });
  animatePlaytimeLeaderboardChange();
}

function setPlaytimeLeaderboardDirection(direction) {
  const nextDirection = direction === 'asc' ? 'asc' : 'desc';
  if (state.playtimeLeaderboardDirection === nextDirection) return;
  state.playtimeLeaderboardDirection = nextDirection;
  resetPlaytimeLeaderboardBatch();
  updatePlaytimeLeaderboardSortControls(state.playtimeLeaderboardSort, nextDirection);
  animatePlaytimeLeaderboardChange();
}

function togglePlaytimeLeaderboardDirection() {
  setPlaytimeLeaderboardDirection(state.playtimeLeaderboardDirection === 'asc' ? 'desc' : 'asc');
}

function newPlayerIdentityKey(player) {
  return String(player?.uuid || player?.username || '').toLowerCase();
}

function newPlayerRow(player) {
  return `
    <div class="rank-item new-player-item">
      ${playerIdentity(player.username, 28, {
        status: player.isOnline ? 'online' : 'offline',
        uuid: player.uuid,
        loading: 'lazy'
      })}
      <div class="new-player-meta">
        ${player.isWhitelisted ? '<span class="pill">whitelisted</span>' : ''}
        <time>${player.firstSeen ? formatRecentDate(player.firstSeen) : 'Unknown'}</time>
      </div>
    </div>
  `;
}

function renderNewPlayers({ resetScroll = false } = {}) {
  const list = $('#newPlayersList');
  const status = $('#newPlayersLoadStatus');
  if (!list || !status) return false;
  const players = state.newPlayers;
  const statusMarkup = state.newPlayersLoading
    ? '<span>Loading more profiles&hellip;</span>'
    : state.newPlayersHasMore
      ? '<button class="ghost-button" type="button" data-new-players-more>Load more</button>'
      : '';
  const hasStatus = Boolean(statusMarkup);
  status.innerHTML = statusMarkup;
  status.classList.toggle('is-empty', !hasStatus);
  status.setAttribute('aria-hidden', String(!hasStatus));
  if (state.newPlayersLoading) list.setAttribute('aria-busy', 'true');
  else list.removeAttribute('aria-busy');

  const signature = stableSignature({
    players: players.map(player => [
      player.username,
      player.uuid,
      player.firstSeen,
      player.isOnline,
      player.isWhitelisted
    ]),
    emptyState: players.length ? null : (state.newPlayersLoading ? 'loading' : 'empty')
  });
  if (state.renderSignatures['#newPlayersList'] === signature) return false;

  const scrollTop = resetScroll ? 0 : list.scrollTop;
  list.innerHTML = players.length
    ? players.map(newPlayerRow).join('')
    : state.newPlayersLoading
      ? ''
      : '<div class="empty">No tracked players yet.</div>';
  state.renderSignatures['#newPlayersList'] = signature;
  requestAnimationFrame(() => { list.scrollTop = resetScroll ? 0 : scrollTop; });
  return true;
}

function syncNewPlayers(firstPage = [], page = {}) {
  const accountId = state.activeAccountId || 'primary';
  const changedAccount = state.newPlayersAccountId !== accountId;
  if (changedAccount) {
    state.newPlayers = [];
    state.newPlayersInitialized = false;
    state.newPlayersLoading = false;
    state.newPlayersHasMore = false;
    state.newPlayersNextOffset = 0;
    state.newPlayersFirstPageSize = 0;
    state.newPlayersAccountId = accountId;
    delete state.renderSignatures['#newPlayersList'];
  }

  const wasInitialized = state.newPlayersInitialized;
  const hadLoadedEverything = wasInitialized && !state.newPlayersHasMore;
  const existingKeys = new Set(state.newPlayers.map(newPlayerIdentityKey));
  const firstPageOverlapsExisting = firstPage.some(player => existingKeys.has(newPlayerIdentityKey(player)));
  const firstKeys = new Set(firstPage.map(newPlayerIdentityKey));
  const previousFirstPageSize = Math.min(
    state.newPlayers.length,
    Math.max(0, Number(state.newPlayersFirstPageSize) || 0)
  );
  const retainedTail = wasInitialized ? state.newPlayers.slice(previousFirstPageSize) : [];
  state.newPlayers = [
    ...firstPage,
    ...retainedTail.filter(player => !firstKeys.has(newPlayerIdentityKey(player)))
  ];
  state.newPlayersInitialized = true;
  state.newPlayersFirstPageSize = firstPage.length;
  state.newPlayersNextOffset = state.newPlayers.length;
  state.newPlayersHasMore = hadLoadedEverything && (!page.hasMore || firstPageOverlapsExisting)
    ? false
    : Boolean(page.hasMore);
  renderNewPlayers({ resetScroll: changedAccount || !wasInitialized });
}

async function loadMoreNewPlayers() {
  if (state.newPlayersLoading || !state.newPlayersHasMore) return;
  const accountId = state.activeAccountId || 'primary';
  const offset = state.newPlayersNextOffset;
  state.newPlayersLoading = true;
  renderNewPlayers();
  try {
    const params = new URLSearchParams({
      limit: String(NEW_PLAYERS_PAGE_SIZE),
      offset: String(offset)
    });
    const payload = await fetchJson(`/api/new-players?${params}`);
    if ((state.activeAccountId || 'primary') !== accountId) return;
    const knownKeys = new Set(state.newPlayers.map(newPlayerIdentityKey));
    const additions = (payload.players || []).filter(player => !knownKeys.has(newPlayerIdentityKey(player)));
    state.newPlayers.push(...additions);
    state.newPlayersNextOffset = Math.max(state.newPlayers.length, Number(payload.nextOffset) || 0);
    state.newPlayersHasMore = Boolean(payload.hasMore);
  } catch (error) {
    if (error?.name !== 'AbortError') setBanner(`Could not load more players: ${error.message}`);
  } finally {
    if ((state.activeAccountId || 'primary') === accountId) {
      state.newPlayersLoading = false;
      renderNewPlayers();
    }
  }
}

function maybeLoadMoreNewPlayers() {
  const list = $('#newPlayersList');
  if (!list || state.newPlayersLoading || !state.newPlayersHasMore) return;
  const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (distanceFromBottom <= 160) loadMoreNewPlayers();
}

function renderPlayerStats(payload = {}, nearbyPlayers = null) {
  $('#uniquePlayersToday').textContent = formatNumber(payload.players?.seenToday);
  $('#uniquePlayersWeek').textContent = formatNumber(payload.players?.seenWeek);
  $('#uniquePlayersMonth').textContent = formatNumber(payload.players?.seenMonth);
  renderPeriodTrend('#uniquePlayersTodayTrend', payload.players?.seenToday, payload.players?.seenPreviousDay, 'yesterday at this time');
  renderPeriodTrend('#uniquePlayersWeekTrend', payload.players?.seenWeek, payload.players?.seenPreviousWeek, 'the same point last week');
  renderPeriodTrend('#uniquePlayersMonthTrend', payload.players?.seenMonth, payload.players?.seenPreviousMonth, 'the same point last month');
  state.charts.hourlyAverageOnline = payload.hourlyAverageOnline || [];
  const chartShell = $('#averageOnlineChartShell');
  chartShell?.classList.remove('player-chart-loading');
  chartShell?.removeAttribute('aria-busy');

  const leaderboardSources = payload.playtimeLeaderboards || {};
  state.playtimeLeaderboards = {
    global: Array.isArray(leaderboardSources.global) ? leaderboardSources.global : [],
    whitelisted: Array.isArray(leaderboardSources.whitelisted)
      ? leaderboardSources.whitelisted
      : Array.isArray(payload.playtimeLeaderboard) ? payload.playtimeLeaderboard : []
  };
  resetPlaytimeLeaderboardBatch();
  renderPlaytimeLeaderboard();

  if (Array.isArray(nearbyPlayers)) renderNearbySightings(nearbyPlayers);

  syncNewPlayers(
    Array.isArray(payload.newPlayers) ? payload.newPlayers : [],
    payload.newPlayersPage || {}
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
  for (const selector of ['#playerMilestones', '#playtimeLeaderboard', '#newPlayersList']) {
    const element = $(selector);
    element?.classList.remove('player-list-loading');
    element?.removeAttribute('aria-busy');
  }
  if (state.activeTab === 'players') requestAnimationFrame(redrawCharts);
}

// Players the bot can see right now come first, nearest first; everyone who has
// left its view follows, most recently seen first.
function sortNearbySightings(nearbyPlayers) {
  const live = new Map();
  for (const player of state.liveNearbyPlayers || []) {
    const key = String(player?.username || '').toLowerCase();
    if (key && Number.isFinite(Number(player.distance))) live.set(key, Number(player.distance));
  }
  const seen = new Set();
  const active = [];
  const past = [];
  for (const player of nearbyPlayers || []) {
    const key = String(player?.username || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (live.has(key)) active.push({ ...player, distance: live.get(key), active: true });
    else past.push(player);
  }
  const timeOf = player => new Date(player.lastSeen).getTime() || 0;
  active.sort((a, b) => a.distance - b.distance || timeOf(b) - timeOf(a));
  past.sort((a, b) => timeOf(b) - timeOf(a));
  return [...active, ...past];
}

function renderNearbySightings(nearbyPlayers = []) {
  const nearby = sortNearbySightings(nearbyPlayers);
  renderStable('#nearbyList', nearby.length
    ? nearby.map(player => `
      <div class="rank-item activity-item">
        ${playerIdentity(player.username, 28)}
        <strong>${formatNumber(player.distance)} blocks</strong>
        <span class="muted">${player.active ? '' : formatAgo(player.lastSeen)}</span>
      </div>
    `).join('')
    : '<div class="empty">No nearby sightings yet.</div>',
    nearby.map(player => [player.username, player.distance, player.active ? null : player.lastSeen])
  );
  const list = $('#nearbyList');
  list?.classList.remove('player-list-loading');
  list?.removeAttribute('aria-busy');

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

function activeAccountIsPrimary() {
  return Boolean(state.accounts.find(account => account.id === state.activeAccountId)?.isDefault);
}

function updateObsidianStatsScopeVisibility() {
  const control = $('#obsidianStatsScope');
  const visible = state.currentUser?.role === 'admin'
    && activeAccountIsPrimary()
    && state.activeTab === 'obsidian';
  if (control) control.hidden = !visible;
  document.body.classList.toggle('obsidian-scope-visible', Boolean(visible));
}

function updateObsidianFarmControlsVisibility(scope = state.obsidianStatsScope) {
  const aggregate = activeAccountIsPrimary() && scope === 'all';
  if (aggregate) state.obsidianCoordinateEditorOpen = false;
  const adminCarousel = $('#obsidianAdminCarousel');
  if (adminCarousel) adminCarousel.hidden = state.currentUser?.role !== 'admin' || aggregate;
  const supplyPanels = $('#obsidianSupplyPanels');
  if (supplyPanels) supplyPanels.hidden = aggregate;
  if (!aggregate) $('#obsidianChartLegend').hidden = true;
  const coordinateEditor = $('#obsidianCoordinateEditor');
  if (coordinateEditor) {
    coordinateEditor.hidden = state.currentUser?.role !== 'admin'
      || aggregate
      || !state.obsidianCoordinateEditorOpen;
  }
}

function obsidianStatsPath() {
  const scope = activeAccountIsPrimary() && state.currentUser?.role === 'admin' ? state.obsidianStatsScope : 'personal';
  return `/api/obsidian?scope=${encodeURIComponent(scope)}`;
}

function updateObsidianScopeControl(scope, { disabled = false } = {}) {
  const control = $('#obsidianStatsScope');
  if (!control) return;
  control.dataset.activeScope = scope;
  control.querySelectorAll('[data-obsidian-scope]').forEach(button => {
    const active = button.dataset.obsidianScope === scope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = disabled;
  });
}

function startObsidianScopeAnimation(direction) {
  const tab = $('#tab-obsidian');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!tab || reducedMotion) return { finished: Promise.resolve(), cancel() {} };
  const elements = Array.from(tab.querySelectorAll(
    ':scope > .stats-grid > .stat, :scope > .farm-admin-grid > .panel, :scope > .panel, :scope > .split-grid > .panel, :scope > .collapsible-section'
  )).filter(element => !element.hidden && typeof element.animate === 'function');
  const leaving = direction === 'out';
  const keyframes = leaving
    ? [
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' },
      { opacity: 0.08, filter: 'blur(5px)', transform: 'translateY(9px) scale(.992)' }
    ]
    : [
      { opacity: 0, filter: 'blur(5px)', transform: 'translateY(11px) scale(.992)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' }
    ];
  const animations = elements.map((element, index) => element.animate(keyframes, {
    duration: leaving ? 180 : 380,
    delay: leaving ? Math.min(index, 6) * 7 : Math.min(index, 8) * 24,
    easing: leaving ? 'cubic-bezier(.4, 0, 1, 1)' : 'cubic-bezier(.16, 1, .3, 1)',
    fill: 'both'
  }));
  return {
    finished: Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
    cancel() { animations.forEach(animation => animation.cancel()); }
  };
}

async function changeObsidianStatsScope(event) {
  const button = event.target.closest('[data-obsidian-scope]');
  if (!button || !activeAccountIsPrimary()) return;
  const scope = button.dataset.obsidianScope === 'all' ? 'all' : 'personal';
  if (scope === state.obsidianStatsScope) return;
  const previousScope = state.obsidianStatsScope;
  state.obsidianStatsScope = scope;
  localStorage.setItem('wm-obsidian-stats-scope', scope);
  updateObsidianScopeControl(scope, { disabled: true });
  const exitAnimation = startObsidianScopeAnimation('out');
  try {
    const payloadPromise = fetchJson(obsidianStatsPath());
    await exitAnimation.finished;
    renderObsidian(await payloadPromise);
    updateObsidianScopeControl(state.obsidianStatsScope, { disabled: true });
  } catch (error) {
    await exitAnimation.finished;
    state.obsidianStatsScope = previousScope;
    localStorage.setItem('wm-obsidian-stats-scope', previousScope);
    renderObsidian(await fetchJson(obsidianStatsPath()));
    updateObsidianScopeControl(state.obsidianStatsScope, { disabled: true });
    throw error;
  } finally {
    exitAnimation.cancel();
    const enterAnimation = startObsidianScopeAnimation('in');
    await enterAnimation.finished;
    enterAnimation.cancel();
    updateObsidianScopeControl(state.obsidianStatsScope);
  }
}

function obsidianSeriesValueForAccount(item, accountId = null) {
  if (!accountId) return Number(item?.value) || 0;
  const segment = Array.isArray(item?.segments)
    ? item.segments.find(entry => String(entry.accountId) === String(accountId))
    : null;
  return Number(segment?.value) || 0;
}

function recentObsidianRatePerDay(payload = {}, accountId = null, accountFarm = null) {
  const hourly = Array.isArray(payload.hourly) ? payload.hourly : [];
  const recentHours = hourly.slice(-48);
  const sessionRate = Number(accountFarm?.sessionPerHour ?? payload.farm?.sessionPerHour) || 0;
  const sessionSeconds = Number(accountFarm?.sessionSeconds ?? payload.farm?.sessionSeconds) || 0;
  if (accountFarm?.running === true && sessionRate > 0 && sessionSeconds >= 15 * 60) {
    return sessionRate * 24;
  }

  // Generated chart buckets predate a newly added account. Begin at that
  // account's first productive hour instead of treating those buckets as
  // observed zero-production time and diluting its refill rate.
  const firstProductiveHour = recentHours.findIndex(
    item => obsidianSeriesValueForAccount(item, accountId) > 0
  );
  if (firstProductiveHour >= 0) {
    const productiveWindow = recentHours.slice(firstProductiveHour);
    const recentHourlyTotal = productiveWindow.reduce(
      (sum, item) => sum + obsidianSeriesValueForAccount(item, accountId),
      0
    );
    return recentHourlyTotal / Math.max(1 / 24, productiveWindow.length / 24);
  }

  const daily = Array.isArray(payload.daily) ? payload.daily : [];
  const recentDays = daily.slice(-7)
    .map(item => obsidianSeriesValueForAccount(item, accountId))
    .filter(value => value > 0);
  if (recentDays.length > 0) {
    return recentDays.reduce((sum, value) => sum + value, 0) / recentDays.length;
  }

  return sessionRate > 0 ? sessionRate * 24 : 0;
}

function formatSupplyNeededDate(daysUntilNeeded) {
  if (!Number.isFinite(daysUntilNeeded)) return '-';
  if (daysUntilNeeded <= 0.25) return 'today';
  const date = new Date(Date.now() + daysUntilNeeded * 86400000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: state.accountTimezone
  }).format(date);
}

function calculateSupplyRefill(payload, { supplies, farm, accountId = null, name = null } = {}) {
  supplies = supplies || {};
  farm = farm || {};
  if (farm.running === false) {
    return { available:false,reason:'inactive',name };
  }
  if (!supplies.hasSnapshot) {
    return { available:false,reason:'snapshot',name };
  }
  if (!supplies.barrel || supplies.barrelError) {
    return { available:false,reason:'barrel',name };
  }
  const observedAt = new Date(supplies.observedAt).getTime();
  if (farm.running === true && (!Number.isFinite(observedAt) || Date.now() - observedAt > 30 * 60_000)) {
    return { available:false,reason:'stale',name };
  }

  const inventory = supplies.inventory;
  const barrel = supplies.barrel;
  const pickaxes = usablePickaxeCount(inventory, barrel);
  const food = foodItemCount(inventory, barrel);
  const blocksPerPickaxe = Number(farm.blocksPerPickaxe) > 0 ? Number(farm.blocksPerPickaxe) : 1500;
  const foodPerDay = 7;
  const ratePerDay = recentObsidianRatePerDay(payload, accountId, farm);
  if (ratePerDay <= 0) {
    return { available:false,reason:'rate',pickaxes,food,name };
  }

  const pickaxeDays = pickaxes > 0 ? (pickaxes * blocksPerPickaxe) / ratePerDay : 0;
  const foodDays = food > 0 ? food / foodPerDay : 0;
  const limitingDays = Math.min(pickaxeDays, foodDays);
  const limitingSupply = pickaxeDays <= foodDays ? 'pickaxes' : 'food est.';
  return { available:true,days:limitingDays,limitingSupply,name };
}

function formatSupplyRefillEstimate(estimate, { includeAccount = false } = {}) {
  if (!estimate?.available) {
    const accountLabel = includeAccount && estimate?.name ? ` · ${estimate.name}` : '';
    if (estimate?.reason === 'rate') {
      return `Need rate data (${formatNumber(estimate.pickaxes)} picks, ${formatNumber(estimate.food)} food${accountLabel})`;
    }
    if (estimate?.reason === 'inactive') return `Farm is not running${accountLabel}`;
    if (estimate?.reason === 'barrel') return `Barrel snapshot unavailable${accountLabel}`;
    if (estimate?.reason === 'stale') return `Supply snapshot is stale${accountLabel}`;
    return `No supply snapshot${accountLabel}`;
  }
  const approxDate = formatSupplyNeededDate(estimate.days);
  const accountLabel = includeAccount && estimate.name ? ` · ${estimate.name}` : '';
  return `${approxDate} (${Math.max(0, Math.round(estimate.days))}d, ${estimate.limitingSupply}${accountLabel})`;
}

function estimateSupplyRefill(payload = {}) {
  if (payload.scope === 'all' && Array.isArray(payload.supplyAccounts)) {
    const estimates = payload.supplyAccounts.map(account => calculateSupplyRefill(payload, {
      supplies:account.supplies,
      farm:account.farm,
      accountId:account.accountId,
      name:account.name
    }));
    const available = estimates.filter(estimate => estimate.available);
    if (available.length > 0) {
      const nearest = available.reduce((current, estimate) =>
        estimate.days < current.days ? estimate : current
      );
      return formatSupplyRefillEstimate(nearest, { includeAccount:true });
    }
    const rateMissing = estimates.find(estimate => estimate.reason === 'rate');
    return formatSupplyRefillEstimate(rateMissing || estimates[0], { includeAccount:true });
  }

  return formatSupplyRefillEstimate(calculateSupplyRefill(payload, {
    supplies:payload.supplies,
    farm:payload.farm
  }));
}

function renderObsidian(payload) {
  const renderedScope = payload.scope === 'all' ? 'all' : 'personal';
  if (activeAccountIsPrimary()) state.obsidianStatsScope = renderedScope;
  updateObsidianFarmControlsVisibility(renderedScope);
  const scopeControl = $('#obsidianStatsScope');
  if (scopeControl) updateObsidianScopeControl(renderedScope);
  const chartAccounts = Array.isArray(payload.chartAccounts) ? payload.chartAccounts : [];
  const chartLegend = $('#obsidianChartLegend');
  if (chartLegend) {
    chartLegend.innerHTML = chartAccounts.map(account => `<span><i style="--series-color:${escapeHtml(account.color)}" aria-hidden="true"></i>${escapeHtml(account.name)}${account.archived ? ' <small>(deleted)</small>' : ''}</span>`).join('');
    chartLegend.hidden = renderedScope !== 'all' || !chartAccounts.length;
  }
  const farm = payload.farm || {};
  $('#farmState').textContent = farm.running === true
    ? 'Running'
    : farm.desiredEnabled
      ? (farm.running === false ? 'Waiting to resume' : 'Enabled')
      : 'Disabled';
  $('#farmUpdated').textContent = `last update: ${formatDate(farm.updatedAt)}`;
  setObsidianDigitNumber('#obsidianTotal', farm.totalMined);
  setObsidianDigitNumber('#obsidianToday', farm.todayMined);
  $('#obsidianTodayTimezone').textContent = `${payload.settings?.timezone || 'Europe/Vilnius'} calendar day`;
  setObsidianDigitNumber('#sessionRate', farm.sessionPerHour, { suffix: '/h' });
  setObsidianDigitNumber('#pickaxeAverage', farm.blocksPerPickaxe);
  $('#retiredPickaxes').textContent = `retired pickaxes: ${formatNumber(farm.retiredPickaxes)}`;

  const analytics = payload.analytics || {};
  const efficiency = analytics.efficiency || {};
  const forecast = analytics.forecast || {};
  const confidence = forecast.confidence || { level: 'insufficient', explanation: 'Not enough data.' };
  const confidenceLabel = confidence.level === 'insufficient'
    ? 'Insufficient'
    : `${confidence.level.charAt(0).toUpperCase()}${confidence.level.slice(1)}`;
  const metric = (number, suffix = '') => number == null ? 'Not enough data' : `${formatNumber(number)}${suffix}`;
  const eta = estimate => estimate?.at ? formatDate(estimate.at) : 'Not enough data';
  const anomalyCount = Array.isArray(analytics.anomalies) ? analytics.anomalies.length : 0;
  $('#obsidianAnalyticsCollapseMeta').textContent = `${metric(efficiency.obsidianPerHour, '/h')} · ${metric(forecast.expected24h)} expected in 24h · ${anomalyCount} ${anomalyCount === 1 ? 'anomaly' : 'anomalies'}`;
  const activeGoalCount = (payload.goals || []).filter(goal => goal.active).length;
  $('#obsidianPlanningCollapseMeta').textContent = `${activeGoalCount} active ${activeGoalCount === 1 ? 'goal' : 'goals'} · Discord report ${payload.settings?.dailyReportEnabled ? `at ${payload.settings.dailyReportHour}:00` : 'disabled'}`;
  $('#obsidianEfficiency').innerHTML = `
    <div><span>Obsidian per hour</span><strong>${metric(efficiency.obsidianPerHour, '/h')}</strong></div>
    <div><span>Per pickaxe</span><strong>${metric(efficiency.obsidianPerPickaxe)}</strong></div>
    <div><span>Per durability unit</span><strong>${metric(efficiency.obsidianPerDurabilityUnit)}</strong></div>
    <div><span>Downtime</span><strong>${metric(efficiency.downtimePercent, '%')}</strong></div>
    <div><span>Mean time between stops</span><strong>${metric(efficiency.meanHoursBetweenStops, 'h')}</strong></div>`;
  $('#obsidianForecast').innerHTML = `
    <div><span>Confidence</span><strong>${escapeHtml(confidenceLabel)} · ${escapeHtml(confidence.explanation || '')}</strong></div>
    <div title="${escapeHtml(forecast.pickaxes?.explanation || '')}"><span>Pickaxes exhausted</span><strong>${eta(forecast.pickaxes)}</strong></div>
    <div title="${escapeHtml(forecast.food?.explanation || '')}"><span>Food exhausted</span><strong>${eta(forecast.food)}</strong></div>
    <div><span>Expected in 24 hours</span><strong>${metric(forecast.expected24h)}</strong></div>
    <div><span>Expected in 7 days</span><strong>${metric(forecast.expected7d)}</strong></div>
    <div><span>Active goal ETA</span><strong>${forecast.goal ? `${escapeHtml(forecast.goal.name)} · ${forecast.goal.at ? formatDate(forecast.goal.at) : 'not enough data'}` : 'No active goal'}</strong></div>`;
  const comparison = analytics.comparisons || {};
  const delta = item => item?.percent == null ? 'no comparison' : `${item.percent > 0 ? '+' : ''}${item.percent}%`;
  $('#obsidianComparisons').innerHTML = `<div><span>Today / yesterday</span><strong>${metric(comparison.today?.current)} / ${metric(comparison.today?.previous)} · ${delta(comparison.today)}</strong></div><div><span>Week / previous week</span><strong>${metric(comparison.week?.current)} / ${metric(comparison.week?.previous)} · ${delta(comparison.week)}</strong></div>`;
  $('#obsidianAnomalies').innerHTML = analytics.anomalies?.length
    ? analytics.anomalies.map(item => `<div class="analytics-alert ${escapeHtml(item.severity)}">${escapeHtml(item.message)}</div>`).join('')
    : '<div class="empty">No anomalies detected.</div>';
  $('#obsidianGoals').innerHTML = payload.goals?.length
    ? payload.goals.map(goal => `<div class="goal-item"><span>${escapeHtml(goal.name)}</span><strong><span class="goal-target">${formatNumber(goal.progress || 0)} / ${formatNumber(goal.targetTotal)}${goal.active ? '' : ' · inactive'}</span>${state.currentUser?.role === 'admin' ? `<span class="goal-actions"><button class="mini-button" type="button" data-obsidian-goal-id="${goal.id}" data-obsidian-goal-action="state" data-obsidian-goal-active="${goal.active ? 'false' : 'true'}">${goal.active ? 'Pause' : 'Activate'}</button><button class="mini-button danger-button" type="button" data-obsidian-goal-id="${goal.id}" data-obsidian-goal-action="delete" data-obsidian-goal-name="${escapeHtml(goal.name)}">Delete</button></span>` : ''}</strong></div>`).join('')
    : '<div class="empty">No production goals.</div>';
  $('#obsidianSettingsSummary').innerHTML = `<div><span>Timezone</span><strong>${escapeHtml(payload.settings?.timezone || 'Europe/Vilnius')}</strong></div><div><span>Discord report</span><strong>${payload.settings?.dailyReportEnabled ? `${payload.settings.dailyReportHour}:00` : 'Disabled'}</strong></div>`;
  const analyticsSettingsForm = $('#obsidianAnalyticsSettings');
  if (state.currentUser?.role === 'admin' && analyticsSettingsForm?.dataset.dirty !== 'true') {
    $('#obsidianReportHour').value = payload.settings?.dailyReportHour ?? 9;
    $('#obsidianReportEnabled').checked = Boolean(payload.settings?.dailyReportEnabled);
  }
  const newestAnnotations = compactRecentAnnotations(payload.annotations);
  const annotationsElement = $('#obsidianAnnotations');
  annotationsElement.innerHTML = newestAnnotations.map(item => {
    const annotation = item.annotation;
    const count = item.count > 1 ? `<small class="annotation-count">×${item.count}</small>` : '';
    const title = item.count > 1 ? `${formatDate(annotation.occurredAt)} · ${item.count} similar events` : formatDate(annotation.occurredAt);
    return `<span class="annotation-${annotationKind(annotation)}" title="${escapeHtml(title)}">${escapeHtml(annotation.title)}${count}</span>`;
  }).join('') || '<span>No annotations yet</span>';
  annotationsElement.scrollLeft = 0;

  // Build the shell once; rebuilding it on every payload would tear down the
  // number elements the digit-roll animation depends on, forcing every
  // update to snap instantly instead of spinning.
  const farmDetailsContainer = $('#farmDetails');
  if (farmDetailsContainer && !farmDetailsContainer.querySelector('#farmLast7Days')) {
    farmDetailsContainer.innerHTML = `
      <div><span>Last 7 days</span><strong id="farmLast7Days">- blocks</strong></div>
      <div><span>Retired pickaxe blocks</span><strong id="farmRetiredPickaxeBlocks">-</strong></div>
      <div><span>Barrel last opened</span><strong id="farmBarrelLastOpened">-</strong></div>
      <div><span>Refill around</span><strong id="farmRefillEstimate">-</strong></div>
    `;
  }
  const barrelLastOpenedElement = $('#farmBarrelLastOpened');
  if (barrelLastOpenedElement) barrelLastOpenedElement.textContent = formatDate(payload.supplies?.observedAt);
  const refillEstimateElement = $('#farmRefillEstimate');
  if (refillEstimateElement) refillEstimateElement.textContent = estimateSupplyRefill(payload);
  setObsidianDigitNumber('#farmLast7Days', farm.last7Days, { suffix: ' blocks' });
  setObsidianDigitNumber('#farmRetiredPickaxeBlocks', farm.retiredPickaxeBlocks);

  renderSupplies('#inventorySupplies', payload.supplies?.inventory);
  renderSupplies('#barrelSupplies', payload.supplies?.barrel, payload.supplies?.barrelError);
  state.charts.obsidianHourly = payload.hourly || [];
  state.charts.obsidianDaily = payload.daily || [];
  state.charts.obsidianAccounts = chartAccounts;
  state.charts.obsidianAnnotations = payload.annotations || [];
  setChartLoading('obsidianDailyChart', false);
  redrawCharts();
}

function renderLiveObsidian(payload) {
  const renderedScope = payload?.scope === 'all' ? 'all' : 'personal';
  const activeScope = activeAccountIsPrimary() && state.currentUser?.role === 'admin'
    ? state.obsidianStatsScope
    : 'personal';
  if (renderedScope !== activeScope) return;
  const farm = payload?.farm;
  if (!farm) return;
  setObsidianDigitNumber('#obsidianTotal', farm.totalMined);
  setObsidianDigitNumber('#sessionRate', farm.sessionPerHour, { suffix: '/h' });
  setObsidianDigitNumber('#pickaxeAverage', farm.blocksPerPickaxe);
  $('#retiredPickaxes').textContent = `retired pickaxes: ${formatNumber(farm.retiredPickaxes)}`;
  $('#farmUpdated').textContent = `last update: ${formatDate(farm.updatedAt)}`;
}

async function saveObsidianGoal(event) {
  event.preventDefault();
  try {
    await postJson('/api/obsidian', { action: 'goal', name: $('#obsidianGoalName').value, targetTotal: Number($('#obsidianGoalTarget').value) });
    event.currentTarget.reset(); renderObsidian(await fetchJson(obsidianStatsPath())); setBanner('Obsidian goal saved.');
  } catch (err) { setBanner(`Could not save goal: ${err.message}`); }
}

async function saveObsidianAnalyticsSettings(event) {
  event.preventDefault();
  try {
    await postJson('/api/obsidian', { action: 'settings', dailyReportHour: Number($('#obsidianReportHour').value), dailyReportEnabled: $('#obsidianReportEnabled').checked });
    delete event.currentTarget.dataset.dirty;
    renderObsidian(await fetchJson(obsidianStatsPath())); setBanner('Obsidian analytics settings saved.');
  } catch (err) { setBanner(`Could not save settings: ${err.message}`); }
}

async function loadMorePlayerMessages(button) {
  const profile = state.playerProfileLastPayload;
  if (!profile?.username || !button.dataset.playerChatMore) return;
  button.disabled = true;
  try {
    const page = await fetchJson(`/api/player?username=${encodeURIComponent(profile.username)}&messageLimit=100&beforeMessageId=${encodeURIComponent(button.dataset.playerChatMore)}`);
    const merged = [...(profile.chat?.recentMessages || []), ...(page.chat?.recentMessages || [])];
    profile.chat.recentMessages = [...new Map(merged.map(message => [String(message.id), message])).values()]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    profile.chat.hasMoreMessages = page.chat?.hasMoreMessages;
    profile.chat.nextBeforeMessageId = page.chat?.nextBeforeMessageId;
    state.playerProfileSignature = '';
    replacePlayerProfileContent(profile);
  } catch (err) {
    setBanner(`Could not load older chat messages: ${err.message}`);
    button.disabled = false;
  }
}

async function openChatContext(messageId) {
  if (!/^\d+$/.test(String(messageId || ''))) return;
  const request = ++state.chatContextRequest;
  const payload = await fetchJson(`/api/chat?around=${encodeURIComponent(messageId)}&limit=200`);
  // A newer jump (or a return to live chat) superseded this one while loading.
  if (request !== state.chatContextRequest) return;
  state.chatSearchQuery = '';
  state.chatContextMessageId = String(messageId);
  // The context jump is this tab's initial position. Without this, opening the
  // chat tab for the first time queues delayed scroll-to-bottom passes that
  // land after the jump and leave the target ~100 messages above the viewport.
  state.chatInitialScrollDone = true;
  setChatArchiveStatus('');
  closePlayerProfile({ restoreSeenSearch: false });
  setActiveTab('chat');
  renderChat(payload);
  const returnButton = $('#chatReturnLive');
  if (returnButton) returnButton.hidden = false;
  anchorChatContextTarget(String(messageId), request);
}

function centerChatContextTarget(messageId) {
  const list = $('#chatList');
  const target = list?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!list || !target) return false;
  const listRect = list.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  list.scrollTop += targetRect.top - listRect.top - Math.max(0, (list.clientHeight - targetRect.height) / 2);
  return true;
}

// Keep the jumped-to message centred while the freshly rendered list settles
// (row entrance, avatar images, tab layout) and stop as soon as the user
// scrolls on their own.
function anchorChatContextTarget(messageId, request) {
  const list = $('#chatList');
  if (!list) return;
  const stillAnchored = () => request === state.chatContextRequest && state.chatContextMessageId === messageId;
  const release = () => {
    clearTimeout(releaseTimer);
    list.removeEventListener('load', recenter, true);
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => list.removeEventListener(type, release));
  };
  const recenter = () => {
    if (!stillAnchored()) {
      release();
      return;
    }
    centerChatContextTarget(messageId);
  };
  const releaseTimer = setTimeout(release, 1_500);
  list.addEventListener('load', recenter, true);
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => list.addEventListener(type, release, { passive: true }));

  requestAnimationFrame(() => {
    if (!stillAnchored()) return;
    const target = list.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) {
      release();
      setChatArchiveStatus('This message is no longer in the chat archive.');
      return;
    }
    target.classList.add('chat-context-target');
    list.scrollIntoView({ block: 'nearest' });
    centerChatContextTarget(messageId);
    requestAnimationFrame(recenter);
    setTimeout(recenter, 120);
  });
}

function setChatArchiveStatus(message = '') {
  const status = $('#chatArchiveStatus');
  if (!status) return;
  clearTimeout(state.chatArchiveStatusTimer);
  state.chatArchiveStatusTimer = null;
  status.textContent = message;
  status.hidden = !message;
}

async function loadOlderChatMessages() {
  if (
    state.chatOlderLoading
    || state.chatContextMessageId
    || !state.chatHasMore
    || !/^\d+$/.test(String(state.chatNextBeforeId || ''))
  ) return false;

  const expectedQuery = state.chatSearchQuery;
  const beforeId = state.chatNextBeforeId;
  const params = new URLSearchParams({
    limit: String(CHAT_HISTORY_LIMIT),
    before: String(beforeId)
  });
  if (expectedQuery) params.set('q', expectedQuery);

  state.chatOlderLoading = true;
  setChatArchiveStatus(expectedQuery ? 'Loading older matches…' : 'Loading older messages…');
  try {
    const payload = await fetchJson(`/api/chat?${params}`);
    if (
      state.chatContextMessageId
      || state.chatSearchQuery !== expectedQuery
      || state.chatNextBeforeId !== beforeId
    ) return false;
    renderChat(payload, { mode: 'prepend', scrollMode: 'prepend' });
    if (!payload.hasMore) {
      setChatArchiveStatus(expectedQuery ? 'Beginning of search results' : 'Beginning of chat history');
      state.chatArchiveStatusTimer = setTimeout(() => setChatArchiveStatus(''), 1_600);
    } else {
      setChatArchiveStatus('');
    }
    return true;
  } finally {
    state.chatOlderLoading = false;
    if (state.chatHasMore) setChatArchiveStatus('');
  }
}

async function returnToLiveChat() {
  state.chatContextRequest += 1;
  state.chatContextMessageId = null;
  state.chatSearchQuery = '';
  setChatArchiveStatus('');
  const searchInput = $('#chatSearchInput');
  if (searchInput) searchInput.value = '';
  const button = $('#chatReturnLive');
  if (button) button.hidden = true;
  renderChat(await fetchJson(`/api/chat?limit=${CHAT_HISTORY_LIMIT}`), {
    mode: 'replace',
    scrollMode: 'bottom'
  });
}

async function searchGameChat(event) {
  event.preventDefault();
  const query = String($('#chatSearchInput')?.value || '').trim();
  if (!query) {
    await returnToLiveChat();
    return;
  }
  state.chatContextRequest += 1;
  state.chatContextMessageId = null;
  state.chatSearchQuery = query;
  setChatArchiveStatus('');
  const payload = await fetchJson(`/api/chat?q=${encodeURIComponent(query)}&limit=${CHAT_HISTORY_LIMIT}`);
  renderChat(payload, { mode: 'replace', scrollMode: 'bottom' });
  const returnButton = $('#chatReturnLive');
  if (returnButton) returnButton.hidden = false;
}

function setChatArchiveSearchOpen(open) {
  const search = $('#chatArchiveSearch');
  const toggle = $('#chatSearchToggle');
  if (!search || !toggle) return;
  search.classList.toggle('open', open);
  search.closest('.chat-panel')?.classList.toggle('chat-search-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (open) requestAnimationFrame(() => $('#chatSearchInput')?.focus());
}

async function closeChatArchiveSearch() {
  setChatArchiveSearchOpen(false);
  if (state.chatSearchQuery) await returnToLiveChat();
}

function initializeCollapsibleSections() {
  $$('[data-collapse-key]').forEach(section => {
    const storageKey = `wm-collapse-${section.dataset.collapseKey}`;
    section.open = localStorage.getItem(storageKey) === 'open';
    section.addEventListener('toggle', () => {
      localStorage.setItem(storageKey, section.open ? 'open' : 'closed');
    });
  });
}

async function changeObsidianGoalState(event) {
  const button = event.target.closest('[data-obsidian-goal-id]');
  if (!button || state.currentUser?.role !== 'admin') return;
  const action = button.dataset.obsidianGoalAction || 'state';
  if (action === 'delete' && !confirm(`Delete production goal "${button.dataset.obsidianGoalName || ''}"?`)) return;
  button.disabled = true;
  try {
    await postJson('/api/obsidian', action === 'delete'
      ? { action: 'goal_delete', id: button.dataset.obsidianGoalId }
      : { action: 'goal_state', id: button.dataset.obsidianGoalId, active: button.dataset.obsidianGoalActive === 'true' });
    renderObsidian(await fetchJson(obsidianStatsPath()));
  } catch (err) { setBanner(`Could not update goal: ${err.message}`); button.disabled = false; }
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

function renderInventorySlot(slot, item, { fallback = false, label = 'Empty slot', tooltipPrefix = 'inventory', inventoryControl = false } = {}) {
  const selected = inventoryControl && Number(state.inventoryMoveSelection?.sourceSlot) === Number(slot);
  const controlAttributes = inventoryControl
    ? `data-inventory-slot="${slot}" role="button" tabindex="0"`
    : '';
  if (!item) return `<div class="inventory-slot${inventoryControl ? ' inventory-drop-target' : ''}" data-slot="${slot}" ${controlAttributes} aria-label="${escapeHtml(label)}"></div>`;
  const itemLabel = item.displayName || item.label || item.name || 'Item';
  const durability = item.remainingPercent == null
    ? ''
    : `<span class="inventory-durability">${Number(item.remainingPercent).toFixed(0)}%</span>`;
  const low = item.usable === false ? ' low' : '';
  const tooltipKey = supplyTooltipKey(tooltipPrefix, slot, item);
  const movableAttributes = inventoryControl
    ? `draggable="true" data-inventory-slot="${slot}" data-inventory-item-name="${escapeHtml(item.name || '')}" data-inventory-item-count="${Number(item.count) || 1}"${item.durabilityUsed != null && Number.isFinite(Number(item.durabilityUsed)) ? ` data-inventory-item-durability="${Number(item.durabilityUsed)}"` : ''} aria-label="Move ${escapeHtml(itemLabel)} from slot ${slot}"`
    : '';
  return `
    <div class="inventory-slot filled${low}${fallback ? ' fallback-position' : ''}${inventoryControl ? ' inventory-draggable' : ''}${selected ? ' inventory-selected' : ''}" role="button" tabindex="0" data-slot="${slot}" ${movableAttributes} data-supply-tooltip="${escapeHtml(tooltipKey)}" title="${escapeHtml(itemLabel)} x${formatNumber(item.count)}">
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
  const canMove = state.currentUser?.role === 'admin' && item.slot != null && Number.isInteger(Number(item.slot)) && (
    key.startsWith('bot-inventory:') || key.startsWith('bot-equipment:')
  );
  const dropPayload = canDrop
    ? escapeHtml(JSON.stringify({ slot: item.slot, name: item.name }))
    : '';
  const movePayload = canMove
    ? escapeHtml(JSON.stringify({ slot: item.slot }))
    : '';
  tooltip.innerHTML = `
    <strong>${escapeHtml(item.displayName || item.label || item.name || 'Item')}</strong>
    <span>Count: ${formatNumber(item.count)}</span>
    ${item.slot == null ? '' : `<span>Slot: ${formatNumber(item.slot)}</span>`}
    ${item.remainingPercent == null ? '' : `<span>Durability: ${Number(item.remainingPercent).toFixed(1)}%</span>`}
    ${(canMove || canDrop) ? `<div class="tooltip-item-actions${canMove && canDrop ? '' : ' single'}">
      ${canMove ? `<button class="tooltip-move-button ghost-button" type="button" data-tooltip-move="${movePayload}">Move</button>` : ''}
      ${canDrop ? `<button class="tooltip-drop-button danger-button" type="button" data-tooltip-drop="${dropPayload}">Drop</button>` : ''}
    </div>` : ''}
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
  if (payload.playerStats) renderPlayerStats(payload.playerStats, payload.nearby || []);
  else if (Array.isArray(payload.nearby)) renderNearbySightings(payload.nearby);

  const tps = payload.tps || {};
  $('#latestTps').textContent = formatTps(tps.latest);
  $('#latestTpsAt').textContent = `sampled: ${formatDate(tps.latestAt)}`;
  $('#minTps').textContent = formatTps(tps.min24h);
  $('#maxTps').textContent = formatTps(tps.max24h);

  state.charts.tpsHourly = payload.hourlyTps || [];
  state.charts.tpsHistoryCache = null;
  setChartLoading('tpsHourlyChart', false);
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

function linkifyChatMessage(value) {
  const source = String(value ?? '');
  const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let html = '';
  let cursor = 0;

  for (const match of source.matchAll(urlPattern)) {
    const start = Number(match.index) || 0;
    let visibleUrl = match[0];
    let trailing = '';
    while (visibleUrl && /[.,!?;:)\]}]/.test(visibleUrl.at(-1))) {
      trailing = visibleUrl.at(-1) + trailing;
      visibleUrl = visibleUrl.slice(0, -1);
    }
    if (!visibleUrl) continue;

    html += escapeHtml(source.slice(cursor, start));
    try {
      const parsed = new URL(/^www\./i.test(visibleUrl) ? `https://${visibleUrl}` : visibleUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Unsupported URL protocol');
      html += `<a class="chat-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visibleUrl)}</a>${escapeHtml(trailing)}`;
    } catch {
      html += escapeHtml(visibleUrl + trailing);
    }
    cursor = start + match[0].length;
  }

  return html + escapeHtml(source.slice(cursor));
}

async function handlePlayerProfileKeydown(event) {
  const activityCell = event.target.closest('[data-activity-cell]');
  if (activityCell && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const cells = [...activityCell.closest('.player-activity-heatmap').querySelectorAll('[data-activity-cell]')];
    const currentIndex = cells.indexOf(activityCell);
    const rowStart = currentIndex - currentIndex % 24;
    const nextIndex = {
      ArrowLeft: currentIndex - 1,
      ArrowRight: currentIndex + 1,
      ArrowUp: currentIndex - 24,
      ArrowDown: currentIndex + 24,
      Home: rowStart,
      End: rowStart + 23
    }[event.key];
    const nextCell = cells[nextIndex];
    if (!nextCell) return;
    activityCell.tabIndex = -1;
    nextCell.tabIndex = 0;
    nextCell.focus({ preventScroll: true });
    selectPlayerActivityCell(nextCell);
    return;
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('.chat-link')) return;
  const chatMessage = event.target.closest('[data-chat-message-id]');
  if (!chatMessage) return;
  event.preventDefault();
  await openChatContext(chatMessage.dataset.chatMessageId);
}

function setAdminPlayersNotice(message = '', kind = 'success') {
  const notice = $('#adminPlayersNotice');
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = !message;
}

// The list is re-fetched every 1.5s while a copied command is awaited, so only
// replace its buttons when the markup changes: swapping them between pointerdown
// and pointerup makes the browser drop the click and the copy never happens.
function setAdminPlaytimeCommandsHtml(list, html) {
  if (list.renderedHtml === html) return;
  list.renderedHtml = html;
  list.innerHTML = html;
}

function renderAdminPlaytimeCommands(progress) {
  const list = $('#adminPlaytimeCommands');
  const count = $('#adminPlaytimeMissingCount');
  if (!list || !count || !progress) return;
  const missing = progress.missing || {};
  const missingCount = ['playtime', 'joinDate', 'lastSeen', 'messages']
    .reduce((total, metric) => total + Math.max(0, Number(missing[metric]) || 0), 0);
  const commands = (Array.isArray(progress.missingCommands) ? progress.missingCommands : [])
    .filter(item => item && /^[A-Za-z0-9_]{1,32}$/.test(String(item.username || '')))
    .map(item => ({ metric:String(item.metric || ''),username:String(item.username),command:String(item.command || '') }))
    .filter(item => /^!(?:pt|jd|seen|messages) [A-Za-z0-9_]{1,32}$/i.test(item.command));

  count.textContent = formatNumber(missingCount);
  const listedCommands = new Set(commands.map(item => item.command.toLowerCase()));
  let resolvedCommand = false;
  for (const command of state.adminPlayerInfoAwaitingCommands.keys()) {
    if (listedCommands.has(command)) continue;
    state.adminPlayerInfoAwaitingCommands.delete(command);
    resolvedCommand = true;
  }
  if (resolvedCommand && state.activeTab === 'admin') {
    loadAdminPlayers({ showLoading: false, preserveScroll: true });
  }
  if (!missingCount) {
    setAdminPlaytimeCommandsHtml(list, '<div class="admin-playtime-complete">All tracked player information is complete.</div>');
    return;
  }
  if (!commands.length) {
    setAdminPlaytimeCommandsHtml(list, '<div class="empty">No copyable playtime commands are available.</div>');
    return;
  }

  let html = commands.map(({ metric,username,command }) => `
    <button class="admin-playtime-command" type="button" data-player-info-metric="${escapeHtml(metric)}" data-copy-playtime-command="${escapeHtml(command)}" aria-label="Copy ${escapeHtml(command)}" title="Copy ${escapeHtml(command)}">
      <strong>${escapeHtml(username)}</strong>
      <code>${escapeHtml(command.split(' ')[0])}</code>
    </button>`).join('');
  if (missingCount > commands.length) {
    html += `<div class="admin-playtime-list-note">Showing the first ${formatNumber(commands.length)} of ${formatNumber(missingCount)} commands.</div>`;
  }
  setAdminPlaytimeCommandsHtml(list, html);
}

async function copyAdminPlaytimeCommand(button) {
  const command = String(button?.dataset?.copyPlaytimeCommand || '').trim();
  if (!command) return;
  try {
    await writeClipboardText(command);
    window.clearTimeout(button.copyResetTimer);
    button.classList.add('copied');
    watchAdminPlayerInfoCommand(command);
    showCopyToast(`${command} copied. Paste it into the Discord lookup channel.`);
    button.copyResetTimer = window.setTimeout(() => {
      button.classList.remove('copied');
    }, 1800);
  } catch (error) {
    showCopyToast(error.message || 'Could not copy the command.');
  }
}

// The Discord import event usually fires while this page is hidden or its SSE
// connection was dropped by the mobile browser, so poll briefly after a copy
// until the copied command leaves the list instead of relying on that event.
const ADMIN_PLAYER_INFO_AWAIT_MS = 3 * 60 * 1000;
const ADMIN_PLAYER_INFO_CACHE_KEY = 'wheatmagnate.adminPlayerInfoCollection';

function watchAdminPlayerInfoCommand(command) {
  state.adminPlayerInfoAwaitingCommands.set(command.toLowerCase(), Date.now());
  scheduleAdminPlayerInfoAwaitPoll();
}

function scheduleAdminPlayerInfoAwaitPoll(delay = 1_500) {
  clearTimeout(state.adminPlayerInfoAwaitTimer);
  state.adminPlayerInfoAwaitTimer = null;
  const cutoff = Date.now() - ADMIN_PLAYER_INFO_AWAIT_MS;
  for (const [command, copiedAt] of state.adminPlayerInfoAwaitingCommands) {
    if (copiedAt < cutoff) state.adminPlayerInfoAwaitingCommands.delete(command);
  }
  if (!state.adminPlayerInfoAwaitingCommands.size || state.currentUser?.role !== 'admin') return;
  state.adminPlayerInfoAwaitTimer = setTimeout(async () => {
    state.adminPlayerInfoAwaitTimer = null;
    if (document.visibilityState !== 'hidden') {
      await loadAdminPlayerInfoCollection({ force: true });
    }
    scheduleAdminPlayerInfoAwaitPoll();
  }, delay);
}

function renderAdminPlayerInfoCollection(progress) {
  renderAdminPlaytimeCommands(progress);
  const status = $('#adminPlayerInfoCollection');
  if (!status || !progress) return;
  const total = Math.max(0, Number(progress.totalPlayers) || 0);
  const remaining = Math.max(0, Number(progress.remainingPlayers) || 0);
  const missing = progress.missing || {};
  status.classList.toggle('pending', remaining > 0);
  status.classList.toggle('online', total > 0 && remaining === 0);
  status.classList.toggle('info', total === 0);
  status.textContent = total === 0
    ? 'No tracked players yet'
    : remaining === 0
      ? `Information complete for all ${formatNumber(total)} players`
      : `${formatNumber(remaining)} of ${formatNumber(total)} players still missing information`;
  status.title = remaining > 0
    ? `Missing values — Playtime: ${formatNumber(missing.playtime)}; Messages: ${formatNumber(missing.messages)}; Join date: ${formatNumber(missing.joinDate)}; Last seen: ${formatNumber(missing.lastSeen)}`
    : status.textContent;
}

async function loadAdminPlayerInfoCollection({ force = false } = {}) {
  if (state.currentUser?.role !== 'admin') return;
  if (state.adminPlayerInfoCollectionLoading) {
    state.adminPlayerInfoCollectionPending = true;
    return;
  }
  const now = Date.now();
  const refreshDelay = 750 - (now - state.adminPlayerInfoCollectionAttemptedAt);
  if (!force && refreshDelay > 0) {
    if (!state.adminPlayerInfoCollectionTimer) {
      state.adminPlayerInfoCollectionTimer = setTimeout(() => {
        state.adminPlayerInfoCollectionTimer = null;
        loadAdminPlayerInfoCollection();
      }, refreshDelay);
    }
    return;
  }
  clearTimeout(state.adminPlayerInfoCollectionTimer);
  state.adminPlayerInfoCollectionTimer = null;
  state.adminPlayerInfoCollectionAttemptedAt = now;
  state.adminPlayerInfoCollectionPending = false;
  state.adminPlayerInfoCollectionLoading = true;
  if (!state.adminPlayerInfoCollectionRendered) {
    // Show the last known commands at once instead of "Loading missing commands…";
    // the fresh response replaces them as soon as it arrives.
    try {
      const cached = JSON.parse(localStorage.getItem(ADMIN_PLAYER_INFO_CACHE_KEY) || 'null');
      if (cached && typeof cached === 'object') renderAdminPlayerInfoCollection(cached);
    } catch { /* storage is only a convenience */ }
  }
  try {
    const progress = await fetchJson('/api/admin/player-info-collection');
    renderAdminPlayerInfoCollection(progress);
    state.adminPlayerInfoCollectionRendered = true;
    try { localStorage.setItem(ADMIN_PLAYER_INFO_CACHE_KEY, JSON.stringify(progress)); } catch { /* ignore */ }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    const status = $('#adminPlayerInfoCollection');
    if (status) {
      status.classList.remove('online', 'pending');
      status.classList.add('info');
      status.textContent = 'Information summary temporarily unavailable';
      status.title = error.message || 'Could not load player information summary.';
    }
  } finally {
    state.adminPlayerInfoCollectionLoading = false;
    if (state.adminPlayerInfoCollectionPending) {
      state.adminPlayerInfoCollectionPending = false;
      loadAdminPlayerInfoCollection();
    }
  }
}

function adminPlayerByIdentity(identityKey) {
  return state.adminPlayers.find(player => String(player.identityKey) === String(identityKey)) || null;
}

function adminPlayerCardSignature(player) {
  return JSON.stringify([
    player.identityKey,
    player.username,
    player.uuid,
    player.id,
    Array.isArray(player.tags) ? player.tags : []
  ]);
}

function adminPlayerCardMarkup(player) {
  const identityKey = escapeHtml(player.identityKey);
  const username = escapeHtml(player.username);
  const uuid = player.uuid ? escapeHtml(player.uuid) : '';
  const tags = Array.isArray(player.tags) ? player.tags : [];
  return `
      <article class="admin-player-card" data-admin-player-key="${identityKey}" data-admin-player-signature="${escapeHtml(adminPlayerCardSignature(player))}">
        <button class="admin-player-avatar-button" type="button" data-admin-player-action="view" data-player-key="${identityKey}" aria-label="Open ${username} profile">
          <img class="admin-player-avatar" src="${accountHeadUrl(player.username, player.uuid)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
        </button>
        <div class="admin-player-card-main">
          <div class="admin-player-card-title"><button class="admin-player-name-button" type="button" data-admin-player-action="view" data-player-key="${identityKey}">${username}</button><span class="pill ${player.isOnline ? 'online' : ''}" data-admin-player-status>${player.isOnline ? 'online' : 'offline'}</span></div>
          ${uuid
            ? `<code class="uuid-copy" role="button" tabindex="0" data-copy-uuid="${uuid}" title="Copy UUID" aria-label="Copy UUID ${uuid}">${uuid}</code>`
            : `<code title="Legacy profile ID ${escapeHtml(player.id)}">Legacy ID ${escapeHtml(player.id)}</code>`}
          <div class="admin-player-card-tags">${tags.length ? tags.map(tag => `<span class="admin-player-tag">${escapeHtml(tag)}</span>`).join('') : '<span class="muted">No tags</span>'}</div>
        </div>
        <dl class="admin-player-card-stats">
          <div><dt>First seen</dt><dd data-admin-player-stat="first-seen">${player.firstSeen ? formatDate(player.firstSeen) : 'Unknown'}</dd></div>
          <div><dt>Last seen</dt><dd data-admin-player-stat="last-seen">${player.lastSeen ? formatRecentDate(player.lastSeen) : 'Never'}</dd></div>
          <div><dt>Playtime</dt><dd data-admin-player-stat="playtime">${escapeHtml(player.playtime || '0m')}</dd></div>
          <div><dt>Messages</dt><dd data-admin-player-stat="messages">${formatNumber(player.totalMessages)}</dd></div>
        </dl>
        <details class="admin-player-card-menu">
          <summary aria-label="Actions for ${username}">&hellip;</summary>
          <div>
            <button type="button" data-admin-player-action="view" data-player-key="${identityKey}">View details</button>
            <button type="button" data-admin-player-action="edit" data-player-key="${identityKey}">Edit</button>
            <hr>
            <button class="danger-text" type="button" data-admin-player-action="delete" data-player-key="${identityKey}">Delete player</button>
          </div>
        </details>
      </article>`;
}

function updateAdminPlayerCard(card, player) {
  const status = card.querySelector('[data-admin-player-status]');
  if (status) {
    status.classList.toggle('online', Boolean(player.isOnline));
    status.textContent = player.isOnline ? 'online' : 'offline';
  }
  const values = {
    'first-seen': player.firstSeen ? formatDate(player.firstSeen) : 'Unknown',
    'last-seen': player.lastSeen ? formatRecentDate(player.lastSeen) : 'Never',
    playtime: player.playtime || '0m',
    messages: formatNumber(player.totalMessages)
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = card.querySelector(`[data-admin-player-stat="${name}"]`);
    if (field && field.textContent !== String(value)) field.textContent = value;
  });
}

function renderAdminPlayers(players = state.adminPlayers, { append = false, reconcile = false } = {}) {
  const list = $('#adminPlayersList');
  if (!list) return;
  if (!players.length) {
    if (!append) list.innerHTML = '<div class="empty">No tracked Minecraft players found.</div>';
    return;
  }
  const markup = players.map(adminPlayerCardMarkup).join('');
  if (append) list.insertAdjacentHTML('beforeend', markup);
  else if (reconcile) {
    const existingCards = new Map([...list.querySelectorAll(':scope > .admin-player-card')]
      .map(card => [card.dataset.adminPlayerKey, card]));
    const template = document.createElement('template');
    players.forEach((player, index) => {
      const key = String(player.identityKey);
      const signature = adminPlayerCardSignature(player);
      let card = existingCards.get(key);
      if (!card || card.dataset.adminPlayerSignature !== signature) {
        template.innerHTML = adminPlayerCardMarkup(player).trim();
        const replacement = template.content.firstElementChild;
        if (card) card.replaceWith(replacement);
        card = replacement;
      } else {
        updateAdminPlayerCard(card, player);
      }
      existingCards.delete(key);
      const cardAtIndex = list.children[index];
      if (cardAtIndex !== card) list.insertBefore(card, cardAtIndex || null);
    });
    existingCards.forEach(card => card.remove());
    [...list.children].forEach(child => {
      if (!child.matches('.admin-player-card')) child.remove();
    });
  }
  else list.innerHTML = markup;

  list.querySelectorAll('.admin-player-card-menu:not([data-menu-bound])').forEach(menu => {
    menu.dataset.menuBound = 'true';
    menu.querySelector('summary').addEventListener('click', event => {
      if (!matchMedia('(max-width: 700px)').matches) return;
      event.preventDefault();
      menu.removeAttribute('open');
      openAdminPlayerActions(menu);
    });
    menu.addEventListener('toggle', () => {
      if (menu.open) {
        list.querySelectorAll('.admin-player-card-menu[open]').forEach(otherMenu => {
          if (otherMenu !== menu) otherMenu.removeAttribute('open');
        });
      }

      menu.closest('.admin-player-card')?.classList.toggle('menu-open', menu.open);
      if (menu.open && !matchMedia('(max-width: 700px)').matches) {
        requestAnimationFrame(() => menu.querySelector(':scope > div')?.scrollIntoView({ block: 'nearest' }));
      }
    });
  });
}

function updateAdminPlayersScrollStatus() {
  const status = $('#adminPlayersScrollStatus');
  if (!status) return;
  const loadingMore = state.adminPlayersLoading && state.adminPlayersAppending && state.adminPlayers.length > 0;
  status.hidden = !loadingMore && !state.adminPlayersHasMore;
  status.textContent = loadingMore ? 'Loading more players…' : 'Scroll to load more';
}

let adminPlayerActionsScrollPosition = null;

function openAdminPlayerActions(menu) {
  const dialog = $('#adminPlayerActionsDialog');
  if (!dialog || dialog.open) return;
  $('#adminPlayerActionsTitle').textContent = menu.closest('.admin-player-card').querySelector('.admin-player-name-button').textContent;
  $('#adminPlayerActionsButtons').innerHTML = menu.querySelector(':scope > div').innerHTML;
  // Lock the page before native dialog autofocus. overflow:hidden on body alone
  // still lets the document move on mobile Safari.
  adminPlayerActionsScrollPosition = { left: window.scrollX, top: window.scrollY };
  document.documentElement.style.setProperty('--admin-player-actions-scroll-top', `${-window.scrollY}px`);
  document.documentElement.classList.add('admin-player-actions-open');
  dialog.showModal();
}

function restoreAdminPlayerActionsScroll() {
  if (!adminPlayerActionsScrollPosition) return;
  const position = adminPlayerActionsScrollPosition;
  adminPlayerActionsScrollPosition = null;
  document.documentElement.classList.remove('admin-player-actions-open');
  document.documentElement.style.removeProperty('--admin-player-actions-scroll-top');
  window.scrollTo({ ...position, behavior: 'instant' });
}

function closeAdminPlayerActions() {
  $('#adminPlayerActionsDialog')?.close();
  // Restore synchronously so opening the player editor starts at the same place.
  restoreAdminPlayerActionsScroll();
}

function closeAdminPlayerMenus(event) {
  document.querySelectorAll('.admin-player-card-menu[open]').forEach(menu => {
    if (menu.contains(event.target)) return;
    menu.removeAttribute('open');
    menu.closest('.admin-player-card')?.classList.remove('menu-open');
  });
}

function maybeLoadMoreAdminPlayers() {
  const scroller = $('#adminPlayersScroller');
  if (!scroller || state.adminPlayersLoading || !state.adminPlayersHasMore) return;
  const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  if (distanceFromBottom <= 180) {
    loadAdminPlayers({ showLoading: false, offset: state.adminPlayersNextOffset, append: true });
  }
}

async function loadAdminPlayers({ query = $('#adminPlayersSearch')?.value || '', showLoading = true, offset = 0, append = false, preserveScroll = false } = {}) {
  if (state.currentUser?.role !== 'admin') return;
  const requestedLoad = { query, showLoading, offset, append, preserveScroll };
  if (state.adminPlayersLoading || state.adminPlayersRetryTimer) {
    // A burst of player_info_updated events used to create overlapping list
    // queries. Keep only the newest full refresh; appended pages can be loaded
    // normally after the active request finishes.
    if (!append) state.adminPlayersPendingLoad = requestedLoad;
    return;
  }
  const list = $('#adminPlayersList');
  const scroller = $('#adminPlayersScroller');
  const refresh = $('#adminPlayersRefresh');
  if (hasActiveTextSelectionWithin(list)) {
    queueRealtimeRefresh('admin-player-selection', () => loadAdminPlayers({ query, showLoading, offset, append, preserveScroll }), 750);
    return;
  }
  const previousPlayers = preserveScroll && !append ? [...state.adminPlayers] : [];
  const requestId = ++state.adminPlayersRequestId;
  let loaded = false;
  state.adminPlayersLoading = true;
  state.adminPlayersAppending = append;
  if (refresh) refresh.disabled = true;
  updateAdminPlayersScrollStatus();
  try {
    if (showLoading && !append && list) list.innerHTML = '<div class="empty">Loading Minecraft players...</div>';
    const params = new URLSearchParams({
      query: query.trim(),
      sort: state.adminPlayersSort,
      direction: state.adminPlayersDirection,
      limit: String(state.adminPlayersLimit),
      offset: String(Math.max(0, offset))
    });
    if (preserveScroll && !append) {
      params.set('limit', String(Math.min(24, Math.max(state.adminPlayersLimit, previousPlayers.length))));
    }
    const payload = await fetchJson(`/api/admin/players?${params}`);
    if (requestId !== state.adminPlayersRequestId) return;
    if (hasActiveTextSelectionWithin(list)) {
      queueRealtimeRefresh('admin-player-selection', () => loadAdminPlayers({ query, showLoading, offset, append, preserveScroll }), 750);
      return;
    }
    state.adminPlayersSort = payload.sort || state.adminPlayersSort;
    state.adminPlayersDirection = payload.direction || state.adminPlayersDirection;
    if (!preserveScroll) state.adminPlayersLimit = Number(payload.limit) || state.adminPlayersLimit;
    state.adminPlayersOffset = Number(payload.offset) || 0;
    state.adminPlayersHasMore = Boolean(payload.hasMore);
    if (append) {
      const knownKeys = new Set(state.adminPlayers.map(player => String(player.identityKey)));
      const additions = (payload.players || []).filter(player => !knownKeys.has(String(player.identityKey)));
      state.adminPlayers.push(...additions);
      renderAdminPlayers(additions, { append: true });
    } else if (preserveScroll) {
      const refreshedPlayers = payload.players || [];
      const refreshedByKey = new Map(refreshedPlayers.map(player => [String(player.identityKey), player]));
      const previousKeys = new Set(previousPlayers.map(player => String(player.identityKey)));
      state.adminPlayers = previousPlayers.map(player =>
        refreshedByKey.get(String(player.identityKey)) || player
      );
      refreshedPlayers.forEach(player => {
        if (!previousKeys.has(String(player.identityKey))) state.adminPlayers.push(player);
      });
      const liveScrollTop = scroller?.scrollTop || 0;
      renderAdminPlayers(state.adminPlayers, { reconcile: true });
      if (scroller && scroller.scrollTop !== liveScrollTop) scroller.scrollTop = liveScrollTop;
    } else {
      state.adminPlayers = payload.players || [];
      renderAdminPlayers();
      if (scroller) scroller.scrollTop = 0;
    }
    state.adminPlayersNextOffset = preserveScroll && !append
      ? state.adminPlayers.length
      : state.adminPlayersOffset + (payload.players || []).length;
    loaded = true;
    setAdminPlayersNotice('');
    updateAdminPlayersScrollStatus();
  } catch (err) {
    if (requestId !== state.adminPlayersRequestId) return;
    if (err?.status === 429) {
      const retryAfterSeconds = Math.min(120, Math.max(1, Number(err.retryAfterSeconds) || 10));
      state.adminPlayersPendingLoad = {
        query,
        showLoading: state.adminPlayers.length === 0,
        offset: 0,
        append: false,
        preserveScroll: state.adminPlayers.length > 0
      };
      state.adminPlayersRetryTimer = setTimeout(() => {
        state.adminPlayersRetryTimer = null;
        const retryLoad = state.adminPlayersPendingLoad;
        state.adminPlayersPendingLoad = null;
        if (retryLoad) loadAdminPlayers(retryLoad);
      }, retryAfterSeconds * 1000);
      if (!state.adminPlayers.length && list) {
        list.innerHTML = '<div class="empty">Player list is temporarily busy. Retrying automatically...</div>';
      }
      setAdminPlayersNotice(`Player list is updating too quickly. Retrying in ${retryAfterSeconds} seconds.`, 'info');
    } else {
      if (!append && !state.adminPlayers.length && list) list.innerHTML = `<div class="empty">Could not load players: ${escapeHtml(err.message)}</div>`;
      setAdminPlayersNotice(`Could not load players: ${err.message}`, 'error');
    }
  } finally {
    if (requestId === state.adminPlayersRequestId) {
      state.adminPlayersLoading = false;
      state.adminPlayersAppending = false;
      if (refresh) refresh.disabled = false;
      updateAdminPlayersScrollStatus();
      const pendingLoad = state.adminPlayersPendingLoad;
      if (pendingLoad && !state.adminPlayersRetryTimer) {
        state.adminPlayersPendingLoad = null;
        requestAnimationFrame(() => loadAdminPlayers(pendingLoad));
      } else if (loaded && !pendingLoad) {
        requestAnimationFrame(maybeLoadMoreAdminPlayers);
      }
    }
  }
}

function adminPlayerIdentityMarkup(player) {
  const uuid = player.uuid ? escapeHtml(player.uuid) : '';
  const identity = uuid
    ? `<code class="uuid-copy" role="button" tabindex="0" data-copy-uuid="${uuid}" title="Copy UUID" aria-label="Copy UUID ${uuid}">${uuid}</code>`
    : `<code>Legacy profile ID ${escapeHtml(player.id)}</code>`;
  return `<img src="${accountHeadUrl(player.username, player.uuid)}" alt="" decoding="async"><div><strong>${escapeHtml(player.username)}</strong>${identity}</div>`;
}

function renderAdminPlayerReadonly(player) {
  $('#adminPlayerEditReadonly').innerHTML = [
    ['First seen', player.firstSeen ? formatDate(player.firstSeen) : 'Unknown'],
    ['Last seen', player.lastSeen ? formatRecentDate(player.lastSeen) : 'Never'],
    ['Playtime', player.playtime || '0m'],
    ['Messages', formatNumber(player.totalMessages)]
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

async function openAdminPlayerEdit(identityKey) {
  const listPlayer = adminPlayerByIdentity(identityKey);
  if (!listPlayer) return;
  const modal = $('#adminPlayerEditModal');
  const error = $('#adminPlayerEditError');
  state.adminPlayerEditTarget = { ...listPlayer };
  delete $('#adminPlayerEditForm').dataset.hatchEdited;
  $('#adminPlayerEditIdentity').innerHTML = adminPlayerIdentityMarkup(listPlayer);
  renderAdminPlayerReadonly(listPlayer);
  $('#adminPlayerNotes').value = listPlayer.notes || '';
  $('#adminPlayerTags').value = (listPlayer.tags || []).join(', ');
  $('#adminPlayerPearlHatchX').value = listPlayer.pearlHatch?.x ?? '';
  $('#adminPlayerPearlHatchY').value = listPlayer.pearlHatch?.y ?? '';
  $('#adminPlayerPearlHatchZ').value = listPlayer.pearlHatch?.z ?? '';
  error.hidden = true;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  try {
    const profile = await fetchJson(`/api/player?username=${encodeURIComponent(listPlayer.username)}&messageLimit=20`);
    if (String(state.adminPlayerEditTarget?.identityKey) !== String(identityKey)) return;
    state.adminPlayerEditTarget = { ...listPlayer, notes: profile.adminNotes || '', tags: profile.adminTags || [], pearlHatch:profile.pearlHatch || null };
    $('#adminPlayerNotes').value = state.adminPlayerEditTarget.notes;
    $('#adminPlayerTags').value = state.adminPlayerEditTarget.tags.join(', ');
    if (!$('#adminPlayerEditForm').dataset.hatchEdited) {
      $('#adminPlayerPearlHatchX').value = state.adminPlayerEditTarget.pearlHatch?.x ?? '';
      $('#adminPlayerPearlHatchY').value = state.adminPlayerEditTarget.pearlHatch?.y ?? '';
      $('#adminPlayerPearlHatchZ').value = state.adminPlayerEditTarget.pearlHatch?.z ?? '';
    }
  } catch (err) {
    error.textContent = `Could not refresh player details: ${err.message}`;
    error.hidden = false;
  }
}

function resetAdminPlayerPearlHatch() {
  for (const axis of ['X', 'Y', 'Z']) $('#adminPlayerPearlHatch' + axis).value = '';
  $('#adminPlayerEditForm').dataset.hatchEdited = 'true';
  $('#adminPlayerEditError').hidden = true;
}

function closeAdminPlayerEdit() {
  $('#adminPlayerEditModal').hidden = true;
  state.adminPlayerEditTarget = null;
  if ($('#adminPlayerDeleteModal')?.hidden) document.body.classList.remove('modal-open');
}

function openAdminPlayerDelete(identityKey) {
  const player = adminPlayerByIdentity(identityKey);
  if (!player) return;
  state.adminPlayerDeleteTarget = player;
  $('#adminPlayerDeleteIdentity').innerHTML = adminPlayerIdentityMarkup(player);
  $('#adminPlayerDeleteError').hidden = true;
  $('#adminPlayerDeleteModal').hidden = false;
  document.body.classList.add('modal-open');
}

function closeAdminPlayerDelete() {
  $('#adminPlayerDeleteModal').hidden = true;
  state.adminPlayerDeleteTarget = null;
  if ($('#adminPlayerEditModal')?.hidden) document.body.classList.remove('modal-open');
}

async function saveAdminPlayer(event) {
  event.preventDefault();
  const player = state.adminPlayerEditTarget;
  if (!player) return;
  const button = $('#adminPlayerEditSubmit');
  const error = $('#adminPlayerEditError');
  const values = {
    notes: $('#adminPlayerNotes').value.trim(),
    tags: $('#adminPlayerTags').value.split(',').map(tag => tag.trim()).filter(Boolean)
  };
  const hatchValues = ['X','Y','Z'].map(axis => String($(`#adminPlayerPearlHatch${axis}`).value || '').trim());
  if (hatchValues.some(Boolean) && !hatchValues.every(value => /^-?\d+$/.test(value))) {
    error.textContent = 'Enter integer X, Y and Z coordinates, or leave all three empty.';
    error.hidden = false;
    return;
  }
  values.pearlHatch = hatchValues.every(Boolean)
    ? { x:Number(hatchValues[0]),y:Number(hatchValues[1]),z:Number(hatchValues[2]) }
    : null;
  const patch = {};
  if (values.notes !== String(player.notes || '')) patch.notes = values.notes;
  if (JSON.stringify(values.tags) !== JSON.stringify(player.tags || [])) patch.tags = values.tags;
  if (JSON.stringify(values.pearlHatch) !== JSON.stringify(player.pearlHatch || null)) patch.pearlHatch = values.pearlHatch;
  if (!Object.keys(patch).length) {
    closeAdminPlayerEdit();
    return;
  }
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const payload = await patchJson(`/api/admin/players/${encodeURIComponent(player.identityKey)}`, patch);
    state.adminPlayers = state.adminPlayers.map(item => String(item.identityKey) === String(player.identityKey) ? { ...item, ...payload.player } : item);
    renderAdminPlayers();
    closeAdminPlayerEdit();
    setAdminPlayersNotice('Player updated.');
    loadAdminSystemLogs().catch(() => {});
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Save changes';
  }
}

async function confirmAdminPlayerDelete() {
  const player = state.adminPlayerDeleteTarget;
  if (!player) return;
  const button = $('#adminPlayerDeleteConfirm');
  const error = $('#adminPlayerDeleteError');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Deleting...';
  try {
    await deleteJson(`/api/admin/players/${encodeURIComponent(player.identityKey)}`);
    state.adminPlayers = state.adminPlayers.filter(item => String(item.identityKey) !== String(player.identityKey));
    renderAdminPlayers();
    updateAdminPlayersScrollStatus();
    if (String(state.playerProfileLastPayload?.uuid || '').toLowerCase() === String(player.uuid || '').toLowerCase() ||
        String(state.playerProfileLastPayload?.username || '').toLowerCase() === String(player.username || '').toLowerCase()) closePlayerProfile();
    closeAdminPlayerDelete();
    setAdminPlayersNotice('Player deleted.');
    loadAdminPlayers({ showLoading: false, offset: 0 }).catch(() => {});
    loadAdminSystemLogs().catch(() => {});
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Delete player';
  }
}

async function handleAdminPlayerAction(event) {
  const button = event.target.closest('[data-admin-player-action]');
  if (!button) return;
  if (hasActiveTextSelectionWithin(button.closest('.admin-player-card'))) return;
  if ($('#adminPlayerActionsDialog')?.open) closeAdminPlayerActions();
  button.closest('details')?.removeAttribute('open');
  const player = adminPlayerByIdentity(button.dataset.playerKey);
  if (!player) return;
  if (button.dataset.adminPlayerAction === 'view') await openPlayerProfile(player.username);
  else if (button.dataset.adminPlayerAction === 'edit') await openAdminPlayerEdit(player.identityKey);
  else if (button.dataset.adminPlayerAction === 'delete') openAdminPlayerDelete(player.identityKey);
}

function renderAdminUsers(users = []) {
  const list = $('#adminUsersList');
  if (!list) return;

  const onlineCount = users.filter(user => user.isOnline).length;
  const pendingCount = users.filter(user => user.status === 'pending').length;
  const adminCount = users.filter(user => user.role === 'admin' && user.status === 'approved').length;
  setRollingNumber('#adminUsersTotal', users.length);
  setRollingNumber('#adminUsersOnline', onlineCount);
  setRollingNumber('#adminUsersAdmins', adminCount);
  setRollingNumber('#adminUsersPending', pendingCount);
  if ($('#adminUsersOnlineSummary')) $('#adminUsersOnlineSummary').textContent = String(onlineCount);
  if ($('#adminUsersPendingSummary')) $('#adminUsersPendingSummary').textContent = String(pendingCount);
  if ($('#adminUsersAdminSummary')) $('#adminUsersAdminSummary').textContent = String(adminCount);

  if (!users.length) {
    list.innerHTML = '<div class="empty">No registered users yet.</div>';
    return;
  }

  const currentUsername = state.currentUser?.username?.toLowerCase();
  list.innerHTML = users.map(user => {
    const username = escapeHtml(user.username);
    const status = escapeHtml(user.status);
    const role = escapeHtml(user.role);
    const roleLabel = user.role === 'admin' ? 'Administrator' : 'Member';
    const statusLabel = user.status === 'pending' ? 'Pending review'
      : user.status === 'approved' ? 'Approved' : String(user.status || 'Unknown');
    const lower = String(user.username || '').toLowerCase();
    const isSelf = lower === currentUsername;
    const isOnline = Boolean(user.isOnline);
    const initial = escapeHtml(Array.from(String(user.username || '?'))[0]?.toUpperCase() || '?');
    const presenceText = isOnline
      ? 'Online now'
      : user.lastSeenAt ? `Last online ${formatRecentDate(user.lastSeenAt)}` : 'Never online';
    const presenceTitle = user.lastSeenAt ? `Last activity: ${formatDate(user.lastSeenAt)}` : presenceText;
    const actions = [];

    if (user.status !== 'approved') {
      actions.push(`<button class="admin-user-action approve" type="button" data-admin-action="approve" data-username="${username}">Approve access</button>`);
    }
    if (!isSelf) {
      actions.push(`<button class="admin-user-action danger-button reject" type="button" data-admin-action="reject" data-username="${username}">Reject</button>`);
    }
    if (user.role !== 'admin' && user.status === 'approved') {
      actions.push(`<button class="admin-user-action ghost-button role" type="button" data-admin-action="make_admin" data-username="${username}">Make admin</button>`);
    }
    if (user.role === 'admin' && !isSelf) {
      actions.push(`<button class="admin-user-action ghost-button role" type="button" data-admin-action="remove_admin" data-username="${username}">Remove admin</button>`);
    }

    return `
      <article class="admin-user" data-status="${status}" data-role="${role}">
        <div class="admin-user-identity">
          <span class="admin-user-avatar" aria-hidden="true">${initial}</span>
          <div class="admin-user-copy">
            <div class="admin-user-name-line">
              <strong>${username}</strong>
              ${isSelf ? '<span class="admin-user-self">You</span>' : ''}
            </div>
            <span class="muted">Joined ${formatDate(user.createdAt)}</span>
          </div>
        </div>
        <div class="admin-user-state">
          <span class="admin-user-presence ${isOnline ? 'online' : ''}" title="${escapeHtml(presenceTitle)}">
            <span class="admin-user-presence-dot" aria-hidden="true"></span>${escapeHtml(presenceText)}
          </span>
          <div class="admin-user-badges">
            <span class="admin-user-badge status ${status}">${escapeHtml(statusLabel)}</span>
            <span class="admin-user-badge role ${role}">${escapeHtml(roleLabel)}</span>
          </div>
        </div>
        <div class="admin-user-actions">${actions.length ? actions.join('') : '<span class="admin-user-current-note">Current account</span>'}</div>
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

function renderObsidianDebugLogDownload(entry) {
  const logId = String(entry?.id || '').match(/^log-(\d+)$/)?.[1];
  const createdAt = new Date(entry?.createdAt);
  if (
    !logId ||
    entry?.kind !== 'system' ||
    entry?.category !== 'notification' ||
    entry?.details?.eventType !== 'farm_stalled' ||
    !Number.isFinite(createdAt.getTime())
  ) return '';

  const retainedFrom = new Date();
  retainedFrom.setUTCHours(0, 0, 0, 0);
  retainedFrom.setUTCDate(retainedFrom.getUTCDate() - 6);
  if (createdAt < retainedFrom) return '';

  const dateKey = createdAt.toISOString().slice(0, 10);
  return `<a
    class="admin-log-download"
    href="/api/admin/system-logs/${logId}/obsidian-debug-log"
    target="_blank"
    rel="noopener"
    download
    aria-label="Download Obsidian Farm logs for ${dateKey}"
    title="Download logs for ${dateKey}"
  ><span aria-hidden="true">&#8595;</span> Download logs</a>`;
}

function renderAdminSystemLogEntry(entry) {
  const logId = String(entry.id || '');
  const level = escapeHtml(entry.level || 'info');
  const category = escapeHtml(entry.category || entry.kind || 'system');
  const actor = entry.actor ? `<span class="admin-log-actor">${escapeHtml(entry.actor)}</span>` : '';
  const kind = escapeHtml(entry.kind || 'system');
  const details = renderLogDetails(entry.details);
  const debugLogDownload = renderObsidianDebugLogDownload(entry);
  const debugLogId = String(entry?.details?.debugLogId || '').trim();
  const debugLogReference = debugLogId
    ? `<p class="admin-debug-log-id">Debug Log ID: <code>${escapeHtml(debugLogId)}</code></p>`
    : '';
  const detailsOpen = logId && state.adminOpenLogDetails.has(logId) ? ' open' : '';
  const detailsId = logId ? ` data-log-id="${escapeHtml(logId)}"` : '';
  return `
    <article class="admin-log-entry ${level}" data-kind="${kind}">
      <div class="admin-log-content">
        <div class="admin-log-main">
          <span class="admin-log-time">${formatDate(entry.createdAt)}</span>
          <span class="pill ${level}">${level}</span>
          <span class="admin-log-category">${category}</span>
          ${actor}
          <span class="admin-log-record-id">ID ${escapeHtml(logId)}</span>
        </div>
        <p>${escapeHtml(entry.message || '')}</p>
        ${debugLogReference}
        ${details ? `<details class="admin-log-details"${detailsId}${detailsOpen}><summary>Details</summary>${details}</details>` : ''}
      </div>
      ${debugLogDownload}
    </article>
  `;
}

const SYSTEM_LOG_REPEAT_MAX_PERIOD = 3;
const SYSTEM_LOG_LEVEL_RANK = { debug: 0, info: 1, audit: 2, warn: 3, error: 4 };

function systemLogRepeatSignature(entry) {
  return [entry?.kind, entry?.level, entry?.category, entry?.actor, entry?.message].join('\u0001');
}

// Collapses consecutive repeats of one entry, or of a short cycle such as
// "disconnected -> starting connection" during a reconnect loop.
function groupRepeatedSystemLogs(logs = []) {
  const signatures = logs.map(systemLogRepeatSignature);
  const groups = [];
  let index = 0;
  while (index < logs.length) {
    let best = { period: 1, repeats: 1 };
    for (let period = 1; period <= SYSTEM_LOG_REPEAT_MAX_PERIOD && index + period * 2 <= logs.length; period += 1) {
      let repeats = 1;
      while (
        index + (repeats + 1) * period <= logs.length &&
        signatures.slice(index + repeats * period, index + (repeats + 1) * period)
          .every((signature, offset) => signature === signatures[index + offset])
      ) repeats += 1;
      // Shorter cycles win ties, so a run of one message is never shown as a pair.
      if (repeats >= 2 && repeats * period > best.repeats * best.period) best = { period, repeats };
    }
    const size = best.period * best.repeats;
    groups.push({ entries: logs.slice(index, index + size), period: best.period, repeats: best.repeats });
    index += size;
  }
  return groups;
}

function renderAdminSystemLogGroup(group) {
  if (group.repeats < 2) return renderAdminSystemLogEntry(group.entries[0]);
  const pattern = group.entries.slice(0, group.period);
  const newest = group.entries[0];
  const oldest = group.entries[group.entries.length - 1];
  const level = escapeHtml(pattern.reduce((top, entry) => (
    (SYSTEM_LOG_LEVEL_RANK[entry.level] ?? 1) > (SYSTEM_LOG_LEVEL_RANK[top] ?? 1) ? entry.level : top
  ), pattern[0].level || 'info'));
  const categories = [...new Set(pattern.map(entry => entry.category || entry.kind || 'system'))];
  const groupId = `group-${String(oldest.id || '')}`;
  const detailsOpen = state.adminOpenLogDetails.has(groupId) ? ' open' : '';
  return `
    <article class="admin-log-entry admin-log-group ${level}" data-kind="${escapeHtml(newest.kind || 'system')}">
      <div class="admin-log-content">
        <div class="admin-log-main">
          <span class="admin-log-time">${formatDate(oldest.createdAt)} – ${formatDate(newest.createdAt)}</span>
          <span class="pill ${level}">${level}</span>
          <span class="admin-log-category">${escapeHtml(categories.join(', '))}</span>
          <span class="admin-log-repeat-count" title="${group.entries.length} entries">&times;${group.repeats}</span>
        </div>
        ${group.period > 1
          ? `<p>Repeated cycle of ${group.period} events:</p><ul class="admin-log-cycle">${pattern.map(entry => (
            `<li><span class="pill ${escapeHtml(entry.level || 'info')}">${escapeHtml(entry.level || 'info')}</span> ${escapeHtml(entry.message || '')}</li>`
          )).join('')}</ul>`
          : `<p>${escapeHtml(newest.message || '')}</p>`}
        <details class="admin-log-details admin-log-group-details" data-log-id="${escapeHtml(groupId)}"${detailsOpen}>
          <summary>Show all ${group.entries.length} entries</summary>
          <div class="admin-log-group-entries">${group.entries.map(renderAdminSystemLogEntry).join('')}</div>
        </details>
      </div>
    </article>
  `;
}

function renderAdminSystemLogs(logs = []) {
  const list = $('#adminSystemLogs');
  if (!list) return;
  const renderSignature = stableSignature(logs.map(entry => [
    entry.id,
    entry.level,
    entry.category,
    entry.kind,
    entry.actor,
    entry.message,
    entry.details,
    entry.createdAt
  ]));
  if (state.renderSignatures['#adminSystemLogs'] === renderSignature) return;

  list.querySelectorAll('.admin-log-details[data-log-id]').forEach(details => {
    if (details.open) state.adminOpenLogDetails.add(details.dataset.logId);
    else state.adminOpenLogDetails.delete(details.dataset.logId);
  });
  if (!logs.length) {
    const filtered = ($('#adminLogType')?.value || 'all') !== 'all' || ($('#adminLogLevel')?.value || 'all') !== 'all';
    list.innerHTML = `<div class="empty">${filtered ? 'No log entries match these filters.' : 'No system log entries yet.'}</div>`;
    state.adminOpenLogDetails.clear();
    state.renderSignatures['#adminSystemLogs'] = renderSignature;
    return;
  }

  const visibleIds = new Set(logs.map(entry => String(entry.id || '')).filter(Boolean));
  logs.forEach(entry => { if (entry.id) visibleIds.add(`group-${entry.id}`); });
  state.adminOpenLogDetails.forEach(id => {
    if (!visibleIds.has(id)) state.adminOpenLogDetails.delete(id);
  });

  list.innerHTML = groupRepeatedSystemLogs(logs).map(renderAdminSystemLogGroup).join('');
  state.renderSignatures['#adminSystemLogs'] = renderSignature;

  list.querySelectorAll('.admin-log-details[data-log-id]').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) state.adminOpenLogDetails.add(details.dataset.logId);
      else state.adminOpenLogDetails.delete(details.dataset.logId);
    });
  });
}

async function loadAdminSystemLogs() {
  if (state.currentUser?.role !== 'admin') return;
  // A filter change during a request must not be dropped: reload once it settles.
  if (state.adminLogsLoading) {
    state.adminLogsReloadQueued = true;
    return;
  }
  const list = $('#adminSystemLogs');
  if (hasActiveTextSelectionWithin(list)) {
    queueRealtimeRefresh('admin-log-selection', loadAdminSystemLogs, 750);
    return;
  }
  const level = $('#adminLogLevel')?.value || 'all';
  const type = $('#adminLogType')?.value || 'all';
  state.adminLogsLoading = true;
  try {
    if (list && !list.children.length) list.innerHTML = '<div class="empty">Loading system log...</div>';
    const payload = await fetchJson(`/api/admin/system-logs?limit=160&level=${encodeURIComponent(level)}&type=${encodeURIComponent(type)}`);
    if (level !== ($('#adminLogLevel')?.value || 'all') || type !== ($('#adminLogType')?.value || 'all')) return;
    if (hasActiveTextSelectionWithin(list)) {
      queueRealtimeRefresh('admin-log-selection', loadAdminSystemLogs, 750);
      return;
    }
    renderAdminSystemLogs(payload.logs || []);
  } catch (err) {
    if (list) {
      delete state.renderSignatures['#adminSystemLogs'];
      list.innerHTML = `<div class="empty">Could not load system log: ${escapeHtml(err.message)}</div>`;
    }
  } finally {
    state.adminLogsLoading = false;
    if (state.adminLogsReloadQueued) {
      state.adminLogsReloadQueued = false;
      loadAdminSystemLogs();
    }
  }
}

async function loadAdminUsers({ showLoading = true } = {}) {
  if (state.currentUser?.role !== 'admin') return;
  const list = $('#adminUsersList');
  try {
    if (showLoading && list) list.innerHTML = '<div class="empty">Loading users...</div>';
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

function renderAdminControlState(payload = {}) {
  state.adminControlState = payload;
  const settings = payload.settings || {};
  const bot = payload.bot || {};
  setRollingNumber('#adminDatabasePlayers', payload.playerTotals?.allTime);
  setRollingNumber('#adminPearlLoads', payload.pearlLoads?.completed);
  const pearlLoadsDetail = $('#adminPearlLoadsDetail');
  if (pearlLoadsDetail) {
    const loads = payload.pearlLoads;
    pearlLoadsDetail.textContent = loads ? `${formatNumber(loads.today)} today · ${formatNumber(loads.total)} requests` : 'all time';
    pearlLoadsDetail.title = loads ? `${formatNumber(loads.total - loads.completed)} requests ended without a load` : '';
  }

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
    const hasCoordinates = Boolean(bot?.obsidian?.config);
    obsidianResetButton.textContent = hasCoordinates ? 'Reset Coordinates' : 'Set Coordinates';
    obsidianResetButton.disabled = state.currentUser?.role !== 'admin';
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
    coordinateEditor.hidden = state.currentUser?.role !== 'admin'
      || (activeAccountIsPrimary() && state.obsidianStatsScope === 'all')
      || !state.obsidianCoordinateEditorOpen;
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
  if (commandType === 'kill_aura_toggle') {
    const button = $('#killAuraToggleButton');
    if (button) button.textContent = button.textContent.toLowerCase().includes('disable')
      ? 'Disabling Kill Aura...'
      : 'Enabling Kill Aura...';
  } else if (commandType === 'kill_aura_criticals_toggle') {
    const button = $('#killAuraCriticalsButton');
    if (button) button.textContent = 'Updating Criticals...';
  } else if (commandType === 'obsidian_toggle') {
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
      Promise.all([loadAll(), loadAdminControlState({ force: true })]).catch(() => {});
    }
  }, delayMs);
}

function handleTooltipMove(button) {
  const payload = JSON.parse(button.dataset.tooltipMove || '{}');
  const slotNumber = Number(payload.slot);
  const sourceSlot = Number.isInteger(slotNumber)
    ? document.querySelector(`#botInventory [data-inventory-slot="${slotNumber}"][data-inventory-item-name]`)
    : null;
  if (!sourceSlot || !selectInventoryMoveSource(sourceSlot)) {
    throw new Error('Item cannot be moved from this snapshot.');
  }
  hideSupplyTooltip();
}

async function loadAdminControlState({ force = false } = {}) {
  if (state.currentUser?.role !== 'admin') return;
  if (state.adminControlLoading) return;
  if (!force && state.adminControlState && Date.now() - state.adminControlRefreshedAt < 3_000) return;
  const accountId = state.activeAccountId;
  const token = Symbol('admin-control');
  state.adminControlToken = token;
  state.adminControlLoading = true;
  try {
    const payload = await fetchJson('/api/admin/control-state', { transientRetries: 2 });
    if (state.adminControlToken !== token || state.activeAccountId !== accountId) return;
    state.adminControlRefreshedAt = Date.now();
    renderAdminControlState(payload);
  } catch (err) {
    if (state.adminControlToken === token && err?.name !== 'AbortError') setBanner(`Could not load bot controls: ${err.message}`);
  } finally {
    if (state.adminControlToken === token) {
      state.adminControlLoading = false;
      state.adminControlToken = null;
    }
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
  const submitsKillAuraTargets = commandType === 'kill_aura_toggle' && state.killAuraTargetsDirty;
  if (commandType === 'kill_aura_toggle' && state.killAuraTargetsDirty) {
    body.payload = { targets: [...state.killAuraSelectedMobs] };
  }
  if (commandType === 'obsidian_toggle') {
    const farm = state.adminControlState?.bot?.obsidian || {};
    body.payload = {
      enabled: !(farm.enabled || farm.desiredEnabled || state.adminControlState?.bot?.task === 'obsidian')
    };
  }
  if (commandType === 'obsidian_reset_coordinates') {
    const hasCoordinates = Boolean(state.adminControlState?.bot?.obsidian?.config);
    if (!hasCoordinates) {
      state.obsidianCoordinateEditorOpen = true;
      clearObsidianCoordinateEditor();
      renderAdminControlState(state.adminControlState || {});
      setTimeout(() => $('#obsidianCoordX')?.focus(), 0);
      return;
    }
    if (!confirm('Reset Obsidian Farm coordinates? The farm will stop and ask for new coordinates next time.')) return;
  }

  button.disabled = true;
  try {
    setButtonBusyState(commandType);
    const queued = await postJson('/api/admin/bot-command', { ...body,accountId:state.activeAccountId });
    await waitForAdminBotCommand(queued.command.id);
    if (commandType === 'obsidian_reset_coordinates') {
      state.obsidianCoordinateEditorOpen = true;
      clearObsidianCoordinateEditor();
    }
    if (commandType === 'obsidian_toggle' && state.adminControlState?.bot) {
      // Show the confirmed farm intent at once; the refreshes below follow.
      const enabled = body.payload.enabled;
      const bot = state.adminControlState.bot;
      bot.obsidian = { ...(bot.obsidian || {}), desiredEnabled: enabled, ...(enabled ? {} : { enabled: false }) };
      if (!enabled && bot.task === 'obsidian') bot.task = 'idle';
      // Drop a control-state response requested before the command finished.
      state.adminControlToken = null;
      state.adminControlLoading = false;
      renderAdminControlState(state.adminControlState);
    }
    // Release the button as soon as the bot has confirmed the command; the full
    // dashboard reload is slow and does not affect this control.
    loadAdminControlState({ force: true }).catch(() => {});
    Promise.all([loadAll(), loadAdminSystemLogs()]).catch(() => {});
    scheduleAdminControlRefresh();
    if (submitsKillAuraTargets) {
      setTimeout(() => {
        state.killAuraTargetsDirty = false;
        loadKillAura().catch(() => {});
      }, 1800);
    }
  } catch (err) {
    console.error(`Could not queue bot command ${commandType}:`, err);
    if (commandType === 'obsidian_toggle' && body.payload?.enabled === true) {
      reportFarmLaunchFailure(err.message, state.adminControlState?.bot || null, { force: true });
    } else {
      setBanner(`Could not update bot: ${err.message}`);
    }
  } finally {
    button.disabled = false;
  }
}

async function queueAdminCommand(commandType, payload = {}) {
  const queued = await postJson('/api/admin/bot-command', { commandType, payload, accountId:state.activeAccountId });
  const result = await waitForAdminBotCommand(queued.command.id);
  await Promise.all([loadAll(), loadAdminControlState({ force: true }), loadAdminSystemLogs()]);
  return result;
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

    if (['follow', 'whitelist_add', 'whitelist_remove'].includes(action) && !payload.username) {
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
      $('#adminPlaytimeInput').value = '';
      showAdminDataToast({
        title:'Playtime updated',
        message:`${result.username} now has ${result.playtime}.`
      });
      await Promise.all([loadAll(), loadAdminSystemLogs()]).catch(error => {
        console.warn('Playtime was updated, but dashboard refresh failed:', error);
      });
      return;
    }
    if (action === 'registration_date_set') {
      const result = await postJson('/api/admin/registration-date', payload);
      $('#adminRegistrationDateInput').value = '';
      showAdminDataToast({
        title:'Registration date updated',
        message:`${result.username}: ${result.registrationDisplay}.`
      });
      await Promise.all([loadAll(), loadAdminSystemLogs()]).catch(error => {
        console.warn('Registration date was updated, but dashboard refresh failed:', error);
      });
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
  } catch (err) {
    if (['playtime_set', 'registration_date_set'].includes(action)) {
      showAdminDataToast({
        kind:'error',
        title:action === 'playtime_set' ? 'Could not update playtime' : 'Could not update registration date',
        message:err.message
      });
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
    await postJson('/api/chat/send', { message: outgoingMessage,accountId:state.activeAccountId });
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

function updateRequestsBadge(count) {
  const badge = $('#requestsBadge');
  if (!badge) return;
  const value = Math.max(0, Number(count) || 0);
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.hidden = value === 0;
  badge.closest('.requests-nav-link')?.setAttribute('aria-label', value
    ? `Requests, ${value} active`
    : 'Requests');
}

async function loadRequestCount() {
  if (state.currentUser?.role !== 'admin') {
    updateRequestsBadge(0);
    return;
  }
  if (state.requestCountLoading) return;
  state.requestCountLoading = true;
  try {
    const payload = await fetchJson('/api/request/summary');
    updateRequestsBadge(payload.activeCount);
  } finally {
    state.requestCountLoading = false;
  }
}

function browserPushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function pushSubscriptionUsesServerKey(subscription, publicKey) {
  const subscribedKey = subscription?.options?.applicationServerKey;
  if (!subscribedKey || !publicKey) return false;
  const expectedKey = applicationServerKey(publicKey);
  const actualKey = new Uint8Array(subscribedKey);
  return actualKey.length === expectedKey.length && actualKey.every((value, index) => value === expectedKey[index]);
}

function defaultPushDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Device';
  const browser = navigator.userAgentData?.brands?.find(item => !/not.a.brand/i.test(item.brand))?.brand || 'Browser';
  return `${platform} · ${browser}`.slice(0, 80);
}

function pushDeviceHtml(device, eventTypes, testTypes = []) {
  const detailedEventTypes = Array.isArray(device.detailedEventTypes) ? device.detailedEventTypes : [];
  const isCurrentDevice = String(state.currentPushSubscriptionId || '') === String(device.id);
  const eventOptions = eventTypes.map(type => {
    const selected = device.eventTypes.length === 0 || device.eventTypes.includes(type);
    const detailed = selected && detailedEventTypes.includes(type);
    return `<div class="push-event-type-row">
      <label class="push-event-enabled"><input type="checkbox" name="eventType" value="${escapeHtml(type)}"${selected ? ' checked' : ''}> <span>${escapeHtml(type)}</span></label>
      <label class="push-event-detailed"><input type="checkbox" name="detailedEventType" value="${escapeHtml(type)}"${detailed ? ' checked' : ''}${selected ? '' : ' disabled'}> Detailed</label>
    </div>`;
  }).join('');
  const testOptions = (testTypes.length ? testTypes : [{ value:'generic', label:'Generic test' }])
    .map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join('');
  const selectedEventCount = device.eventTypes.length || eventTypes.length;
  return `<form class="push-device-card${isCurrentDevice ? ' is-current-device' : ''}" data-push-device-id="${escapeHtml(device.id)}">
    <div class="push-device-head">
      <div class="push-device-identity">
        <span class="push-device-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5.5" y="2.5" width="13" height="19" rx="3"></rect><path d="M9.5 5h5M10.5 18.5h3"></path></svg></span>
        <div><div class="push-device-title"><strong>${escapeHtml(device.deviceName)}</strong>${isCurrentDevice ? '<span>Current device</span>' : ''}</div><small>Endpoint …${escapeHtml(device.endpointSuffix || '')}</small></div>
      </div>
      <span class="push-device-status ${device.enabled ? 'is-enabled' : 'is-disabled'}"><i></i>${device.enabled ? 'Enabled' : 'Disabled'}</span>
    </div>
    <section class="push-device-section" aria-label="Delivery settings">
      <div class="push-device-section-head"><strong>Delivery settings</strong><small>Choose when and what this device receives</small></div>
      <div class="push-device-fields">
        <label><span>Device name</span><input name="deviceName" maxlength="80" value="${escapeHtml(device.deviceName)}"></label>
        <label><span>Minimum severity</span><select name="minimumSeverity"><option value="info"${device.minimumSeverity === 'info' ? ' selected' : ''}>Info</option><option value="warning"${device.minimumSeverity === 'warning' ? ' selected' : ''}>Warning</option><option value="critical"${device.minimumSeverity === 'critical' ? ' selected' : ''}>Critical</option></select></label>
      </div>
      <div class="push-toggle-grid">
        <label><input type="checkbox" name="enabled"${device.enabled ? ' checked' : ''}><span><strong>Push enabled</strong><small>Receive notifications</small></span></label>
        <label><input type="checkbox" name="includeResolved"${device.includeResolved ? ' checked' : ''}><span><strong>Resolved events</strong><small>Send recovery updates</small></span></label>
        <label><input type="checkbox" name="quietHoursEnabled"${device.quietHoursEnabled ? ' checked' : ''}><span><strong>Quiet hours</strong><small>Pause overnight</small></span></label>
      </div>
      <div class="push-quiet-hours"><label><span>Quiet from</span><span class="push-time-control"><input type="time" name="quietStart" value="${escapeHtml(device.quietStart || '22:00')}"></span></label><span class="push-time-divider" aria-hidden="true">→</span><label><span>Until</span><span class="push-time-control"><input type="time" name="quietEnd" value="${escapeHtml(device.quietEnd || '07:00')}"></span></label></div>
      <div class="push-game-time">
        <label class="push-game-time-toggle"><input type="checkbox" name="gameTimeEnabled"${device.gameTimeEnabled ? ' checked' : ''}><span><strong>Minecraft time alert</strong><small>Notify once per game day when this time is reached</small></span></label>
        <label class="push-game-time-value"><span>Game time</span><span class="push-time-control"><input type="time" name="gameTime" value="${escapeHtml(device.gameTime || '06:00')}"></span></label>
      </div>
    </section>
    <details class="push-event-types"><summary><span><strong>Event types</strong><small>Fine-tune notifications and details</small></span><span class="push-event-count">${selectedEventCount} selected</span></summary><div>${eventOptions}</div><p class="muted">Uncheck every event to allow all event types.</p></details>
    <section class="push-test-panel" aria-label="Test notification">
      <div class="push-test-copy"><strong>Test notification</strong><small>Preview delivery on this device</small></div>
      <label class="push-test-type"><span>Message type</span><select name="pushTestType">${testOptions}</select></label>
      <button class="ghost-button push-test-button" type="button" data-push-test="${escapeHtml(device.id)}">Send test</button>
    </section>
    <div class="push-device-actions"><button class="push-save-button" type="submit">Save changes</button><button class="push-remove-button" type="button" data-push-remove="${escapeHtml(device.id)}">Remove device</button></div>
    <small class="push-delivery-status"><i class="${device.failureCount ? 'has-failures' : ''}"></i>${device.lastSuccessAt ? `Last delivered ${escapeHtml(formatDate(device.lastSuccessAt))}` : 'No successful delivery yet'}${device.failureCount ? ` · ${escapeHtml(device.failureCount)} failures` : ''}</small>
  </form>`;
}

async function identifyCurrentPushDevice(devices) {
  state.currentPushSubscriptionId = null;
  state.pushSubscriptionKeyMismatch = false;
  state.pushSubscriptionNeedsRepair = false;
  state.pushRepairDevice = null;
  if (!browserPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const suffix = subscription.endpoint.slice(-18);
  const device = devices.find(item => item.endpointSuffix === suffix) || null;
  state.currentPushSubscriptionId = device?.id || null;
  state.pushRepairDevice = device;
  if (!pushSubscriptionUsesServerKey(subscription, state.pushSettings?.publicKey)) {
    state.pushSubscriptionKeyMismatch = true;
    state.pushSubscriptionNeedsRepair = true;
    return;
  }
  // The server removes endpoints rejected with HTTP 404/410. If the browser
  // kept that local subscription, it must be recreated instead of reused.
  state.pushSubscriptionNeedsRepair = !device || Number(device.failureCount) > 0;
}

async function loadPushSettings() {
  if (!state.currentUser) return;
  const status = $('#pushSupportStatus');
  const button = $('#pushEnableDevice');
  try {
    const payload = await fetchJson('/api/push/settings');
    state.pushSettings = payload;
    await identifyCurrentPushDevice(payload.devices || []);
    const supported = browserPushSupported();
    const repairNeeded = state.pushSubscriptionKeyMismatch || state.pushSubscriptionNeedsRepair;
    if (button) {
      button.disabled = !supported || !payload.configured || Notification.permission === 'denied';
      button.textContent = repairNeeded ? 'Repair push on this device' : 'Enable on this device';
    }
    if (status) status.textContent = !supported ? 'Push API is not supported in this browser or the page is not using HTTPS.'
      : !payload.configured ? (payload.configurationError || 'Push is not configured on the server.')
        : Notification.permission === 'denied' ? 'Browser permission is blocked. Change it in the browser site settings.'
          : state.pushSubscriptionKeyMismatch ? 'This browser subscription uses an old server key. Repair it to receive notifications again.'
            : state.pushSubscriptionNeedsRepair ? 'This browser subscription is stale or has delivery failures. Repair it to receive notifications again.'
          : state.currentPushSubscriptionId ? 'This browser is registered. Manage it below.' : 'Push is off on this browser.';
    $('#pushDeviceList').innerHTML = payload.devices?.length
      ? payload.devices.map(device => pushDeviceHtml(device, payload.eventTypes || [], payload.testTypes || [])).join('')
      : '<div class="empty">No push devices registered. Push is off by default.</div>';
  } catch (err) {
    if (status) status.textContent = `Could not load push settings: ${err.message}`;
  }
}

async function enablePushOnCurrentDevice() {
  if (!browserPushSupported() || !state.pushSettings?.configured) return;
  const button = $('#pushEnableDevice');
  button.disabled = true;
  try {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Browser notification permission was not granted.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    const repairedDevice = state.pushRepairDevice;
    const oldSubscriptionId = state.currentPushSubscriptionId;
    const repairNeeded = state.pushSubscriptionKeyMismatch || state.pushSubscriptionNeedsRepair;
    if (subscription && (repairNeeded || !pushSubscriptionUsesServerKey(subscription, state.pushSettings.publicKey))) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(state.pushSettings.publicKey)
    });
    const payload = await postJson('/api/push/subscriptions', {
      subscription: subscription.toJSON(), deviceName: repairedDevice?.deviceName || defaultPushDeviceName(), enabled: true,
      minimumSeverity: repairedDevice?.minimumSeverity || 'critical', eventTypes: repairedDevice?.eventTypes || [],
      detailedEventTypes: repairedDevice?.detailedEventTypes || [], includeResolved: repairedDevice?.includeResolved || false,
      quietHoursEnabled: repairedDevice?.quietHoursEnabled || false, quietStart: repairedDevice?.quietStart || '22:00', quietEnd: repairedDevice?.quietEnd || '07:00',
      gameTimeEnabled: repairedDevice?.gameTimeEnabled || false, gameTime: repairedDevice?.gameTime || '06:00',
      timezone: state.accountTimezone
    });
    if (oldSubscriptionId && String(oldSubscriptionId) !== String(payload.currentSubscriptionId)) {
      await deleteJson(`/api/push/subscriptions/${encodeURIComponent(oldSubscriptionId)}`).catch(() => {});
    }
    state.pushSettings = payload;
    state.currentPushSubscriptionId = payload.currentSubscriptionId;
    setBanner('Browser push enabled for this device. Send a test below to verify delivery.');
    await loadPushSettings();
  } catch (err) { setBanner(`Could not enable push: ${err.message}`); }
  finally { button.disabled = false; }
}

function pushPreferencesFromForm(form) {
  return {
    deviceName: form.elements.deviceName.value.trim(), enabled: form.elements.enabled.checked,
    minimumSeverity: form.elements.minimumSeverity.value,
    eventTypes: [...form.querySelectorAll('[name="eventType"]:checked')].map(input => input.value),
    detailedEventTypes: [...form.querySelectorAll('[name="detailedEventType"]:checked:not(:disabled)')].map(input => input.value),
    includeResolved: form.elements.includeResolved.checked,
    quietHoursEnabled: form.elements.quietHoursEnabled.checked,
    quietStart: form.elements.quietStart.value, quietEnd: form.elements.quietEnd.value,
    gameTimeEnabled: form.elements.gameTimeEnabled.checked,
    gameTime: form.elements.gameTime.value,
    timezone: state.accountTimezone
  };
}

function handlePushEventTypeChange(event) {
  const eventType = event.target.closest('input[name="eventType"]');
  if (!eventType) return;
  const detailed = eventType.closest('.push-event-type-row')?.querySelector('input[name="detailedEventType"]');
  if (!detailed) return;
  detailed.disabled = !eventType.checked;
  if (!eventType.checked) detailed.checked = false;
}

async function handlePushDeviceSubmit(event) {
  const form = event.target.closest('[data-push-device-id]');
  if (!form) return;
  event.preventDefault();
  try {
    await putJson(`/api/push/subscriptions/${encodeURIComponent(form.dataset.pushDeviceId)}`, pushPreferencesFromForm(form));
    await loadPushSettings();
  } catch (err) { setBanner(`Could not save push settings: ${err.message}`); }
}

async function handlePushDeviceClick(event) {
  const test = event.target.closest('[data-push-test]');
  const remove = event.target.closest('[data-push-remove]');
  try {
    if (test) {
      const form = test.closest('[data-push-device-id]');
      const testType = form?.elements?.pushTestType?.value || 'generic';
      const result = await postJson('/api/push/test', { subscriptionId: test.dataset.pushTest, testType });
      if (result.removed) {
        if (String(test.dataset.pushTest) === String(state.currentPushSubscriptionId) && browserPushSupported()) {
          const registration = await navigator.serviceWorker.ready;
          await (await registration.pushManager.getSubscription())?.unsubscribe();
        }
        setBanner('The expired push endpoint was removed. Enable push on this device again.');
      } else {
        setBanner(`Sent ${result.testType || testType} test push.`);
      }
      await loadPushSettings();
    }
    if (remove) {
      const id = remove.dataset.pushRemove;
      await deleteJson(`/api/push/subscriptions/${encodeURIComponent(id)}`);
      if (String(id) === String(state.currentPushSubscriptionId) && browserPushSupported()) {
        const registration = await navigator.serviceWorker.ready;
        await (await registration.pushManager.getSubscription())?.unsubscribe();
      }
      setBanner('Push device removed.'); await loadPushSettings();
    }
  } catch (err) { setBanner(`Push action failed: ${err.message}`); }
}

async function openPushDestination(destination = null, player = null, accountId = null) {
  const pageUrl = new URL(location.href);
  const pending = state.pendingPushDestination;
  const target = destination || pending?.destination || pageUrl.searchParams.get('push');
  const targetPlayer = player || pending?.player || pageUrl.searchParams.get('player');
  const targetAccountId = accountId || pending?.accountId || pageUrl.searchParams.get('accountId');
  if (!target) return;
  if (!state.currentUser) {
    state.pendingPushDestination = { destination: target, player: targetPlayer, accountId: targetAccountId };
    return;
  }
  state.pendingPushDestination = null;
  if (target === 'whispers') {
    if (targetAccountId && state.accounts.some(account => account.id === targetAccountId)) await selectAccount(targetAccountId);
    setActiveTab('chat');
    setTimeout(() => {
      setWhisperOpen(true);
      const safePlayer = String(targetPlayer || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
      if (safePlayer) openWhisperDialog(safePlayer).catch(err => setBanner(`Could not open dialog: ${err.message}`));
    }, 0);
  } else if (target === 'obsidian') {
    setActiveTab('obsidian');
  } else if (target === 'players') {
    setActiveTab('players');
  } else if (target === 'requests' && state.currentUser.role === 'admin') {
    window.location.assign('/request');
    return;
  } else {
    setActiveTab(target === 'notifications' && state.currentUser.role === 'admin' ? 'notifications' : 'settings');
  }
  pageUrl.searchParams.delete('push');
  pageUrl.searchParams.delete('player');
  pageUrl.searchParams.delete('accountId');
  history.replaceState({}, '', `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
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

function formatFileSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function qualitySummary(item) {
  const percent = value => `${Math.round((Number(value) || 0) * 100)}%`;
  return `coherence ${percent(item.coherence)} · toxicity ${percent(item.toxicity)} · repetition ${percent(item.repetition)} · unknown ${percent(item.unknown_ratio)}`;
}

function renderChildAiPlayerStyles({ resetScroll = false } = {}) {
  const list = $('#childAiStyles');
  const count = $('#childAiStyleCount');
  if (!list) return;

  const styles = Array.isArray(state.childAiPlayerStyles) ? state.childAiPlayerStyles : [];
  const query = String($('#childAiStyleSearch')?.value || '').trim().toLocaleLowerCase();
  const filteredStyles = query
    ? styles.filter(profile => String(profile.subjectName || profile.subjectId || '').toLocaleLowerCase().includes(query))
    : styles;
  const compact = window.matchMedia?.('(max-width: 700px)').matches;
  const visibleLimit = compact
    ? Math.max(CHILD_AI_MOBILE_STYLE_BATCH, Number(state.childAiStyleVisibleLimit) || 0)
    : filteredStyles.length;
  const visibleStyles = filteredStyles.slice(0, visibleLimit);
  const remaining = Math.max(0, filteredStyles.length - visibleStyles.length);

  if (count) {
    count.textContent = remaining
      ? `${formatNumber(visibleStyles.length)} of ${formatNumber(filteredStyles.length)} players`
      : query
        ? `${formatNumber(filteredStyles.length)} of ${formatNumber(styles.length)} players`
        : `${formatNumber(styles.length)} players`;
  }

  const rows = visibleStyles.map(profile => {
    const displayName = profile.subjectName || profile.subjectId || 'Unknown player';
    const isMinecraftPlayer = String(profile.source || '').toLowerCase() === 'minecraft';
    const confidencePercent = value => `${Math.round((Number(value) || 0) * 100)}%`;
    const manuallyAdjusted = profile.adminTone && profile.adminTone !== 'auto';
    const toneLabel = manuallyAdjusted
      ? `${profile.tone} (manual)`
      : `${profile.detectedTone || profile.tone} · ${confidencePercent(profile.toneConfidence)}`;
    const languageBreakdown = Array.isArray(profile.languageBreakdown) ? profile.languageBreakdown : [];
    const secondaryLanguage = profile.multilingual && languageBreakdown[1]
      ? ` + ${languageBreakdown[1].name}`
      : '';
    const languageLabel = `${profile.language}${secondaryLanguage} · ${confidencePercent(profile.languageConfidence)}`;
    const learningStatus = profile.learningStatus || 'insufficient';
    const identity = isMinecraftPlayer
      ? playerIdentity(displayName, 28)
      : `<strong class="child-ai-style-name">${escapeHtml(displayName)}</strong>`;
    return `
      <article class="child-ai-style-row">
        <div class="child-ai-style-main">
          <div class="child-ai-style-identity">
            ${identity}
            <span class="child-ai-style-source">${escapeHtml(profile.source)}</span>
            <span class="child-ai-style-confidence" data-confidence="${escapeHtml(learningStatus)}">${escapeHtml(learningStatus)} evidence</span>
          </div>
          <p class="child-ai-style-summary">
            <span>tone: ${escapeHtml(toneLabel)}</span>
            <span>${escapeHtml(profile.responseLength)} replies</span>
            <span>language: ${escapeHtml(languageLabel)}</span>
            <span>${escapeHtml(profile.averageWords)} words/message</span>
          </p>
          <div class="child-ai-style-signals">${(profile.signals || []).map(signal => `<span>${escapeHtml(signal)}</span>`).join('') || '<span>collecting style signals</span>'}</div>
          ${profile.adminNotes ? `<small class="child-ai-style-note">Administrator note: ${escapeHtml(profile.adminNotes)}</small>` : ''}
        </div>
        <div class="child-ai-style-meta">
          <span><strong>${formatNumber(profile.messagesSeen)}</strong> messages</span>
          <button class="ghost-button" type="button" data-child-style-edit="${escapeHtml(profile.subjectId)}" data-source="${escapeHtml(profile.source)}" data-tone="${escapeHtml(profile.adminTone || 'auto')}" data-length="${escapeHtml(profile.adminLength || 'auto')}" data-notes="${escapeHtml(profile.adminNotes || '')}">Adjust style</button>
        </div>
      </article>`;
  }).join('');
  const loadMore = remaining
    ? `<button class="ghost-button child-ai-load-more" type="button" data-child-style-load-more>Show ${formatNumber(Math.min(CHILD_AI_MOBILE_STYLE_BATCH, remaining))} more</button>`
    : '';
  list.innerHTML = visibleStyles.length
    ? `${rows}${loadMore}`
    : `<div class="empty">${styles.length ? 'No player styles match this nickname.' : 'Player styles appear after safe messages are learned.'}</div>`;

  if (resetScroll) list.scrollTop = 0;
}

function handleChildAiStyleSearch() {
  state.childAiStyleVisibleLimit = CHILD_AI_MOBILE_STYLE_BATCH;
  cancelAnimationFrame(state.childAiStyleRenderFrame);
  state.childAiStyleRenderFrame = requestAnimationFrame(() => {
    state.childAiStyleRenderFrame = null;
    renderChildAiPlayerStyles({ resetScroll: true });
  });
}

function renderChildAiAdmin(payload) {
  const snapshot = payload?.snapshot;
  if (!snapshot) {
    state.childAiPlayerStyles = [];
    ['#childAiMemories', '#childAiStyles', '#childAiExamples', '#childAiWords', '#childAiTopics', '#childAiEmotions', '#childAiResponses', '#childAiRejections']
      .forEach(selector => { if ($(selector)) $(selector).innerHTML = '<div class="empty">Waiting for the bot to publish its first snapshot.</div>'; });
    if ($('#childAiStyleCount')) $('#childAiStyleCount').textContent = '0 players';
    return;
  }

  const memories = Array.isArray(snapshot.memories) ? snapshot.memories : [];
  const generations = Array.isArray(snapshot.generations) ? snapshot.generations : [];
  const playerStyles = Array.isArray(snapshot.playerStyles) ? snapshot.playerStyles : [];
  state.childAiPlayerStyles = playerStyles;
  state.childAiStyleVisibleLimit = CHILD_AI_MOBILE_STYLE_BATCH;
  const responseExamples = Array.isArray(snapshot.responseExamples) ? snapshot.responseExamples : [];
  $('#childAiWordCount').textContent = formatNumber(snapshot.stats?.knownWords || 0);
  $('#childAiMemoryCount').textContent = formatNumber(memories.length);
  $('#childAiEmotion').textContent = String(snapshot.emotion || 'neutral');
  $('#childAiDatabaseSize').textContent = formatFileSize(snapshot.databaseSizeBytes);

  $('#childAiWords').innerHTML = (snapshot.words || []).length
    ? snapshot.words.map(item => `<span class="child-ai-chip"><strong>${escapeHtml(item.word)}</strong><small>${formatNumber(item.times_seen)} uses</small></span>`).join('')
    : '<div class="empty">No learned words yet.</div>';
  $('#childAiTopics').innerHTML = (snapshot.topics || []).length
    ? snapshot.topics.map(item => `<span class="child-ai-chip"><strong>${escapeHtml(item.topic)}</strong><small>${formatNumber(item.times_seen)} mentions</small></span>`).join('')
    : '<div class="empty">No topics yet.</div>';
  $('#childAiMemories').innerHTML = memories.length ? memories.map(item => `
    <article class="child-ai-row child-ai-memory">
      <div><strong>${escapeHtml(item.subject_name || item.subject_id || 'Unknown user')}</strong><span class="muted">${escapeHtml(item.subject_source)} · ${escapeHtml(item.kind)} · ${escapeHtml(item.fact_key)}</span></div>
      <p>${escapeHtml(item.fact_value)}</p>
      <small>Confidence ${Math.round((Number(item.confidence) || 0) * 100)}% · ${escapeHtml(item.source_type)} · expires ${formatDate(item.expires_at)}</small>
      <div class="child-ai-row-actions"><button class="ghost-button" type="button" data-child-memory-correct="${item.id}" data-current-value="${escapeHtml(item.fact_value)}" data-current-confidence="${Number(item.confidence) || 0.8}" data-current-expiry="${escapeHtml(item.expires_at)}">Correct</button><button class="danger-button" type="button" data-child-memory-delete="${item.id}">Delete</button></div>
    </article>`).join('') : '<div class="empty">No active long-term memories.</div>';

  renderChildAiPlayerStyles();

  $('#childAiExamples').innerHTML = responseExamples.length ? responseExamples.map(example => `
    <article class="child-ai-row">
      <div><strong>${example.subject_id ? `${escapeHtml(example.subject_source)} · ${escapeHtml(example.subject_id)}` : 'All players'}</strong><span>${example.active ? 'Active' : 'Paused'}</span></div>
      <p><span>Player:</span> ${escapeHtml(example.trigger_text)}</p>
      <p><span>Bot:</span> ${escapeHtml(example.response_text)}</p>
      <small>Added by ${escapeHtml(example.created_by || 'administrator')} · ${formatDate(example.updated_at)}</small>
      <div class="child-ai-row-actions"><button class="ghost-button" type="button" data-child-example-edit="${example.id}" data-trigger="${escapeHtml(example.trigger_text)}" data-response="${escapeHtml(example.response_text)}">Edit</button><button class="ghost-button" type="button" data-child-example-toggle="${example.id}" data-active="${example.active ? 'true' : 'false'}">${example.active ? 'Pause' : 'Enable'}</button><button class="danger-button" type="button" data-child-example-delete="${example.id}">Delete</button></div>
    </article>`).join('') : '<div class="empty">No response examples yet.</div>';

  $('#childAiEmotions').innerHTML = (snapshot.emotions || []).length
    ? snapshot.emotions.map(item => `<article class="child-ai-row"><strong>${escapeHtml(item.emotion)}</strong><span>${escapeHtml(item.reason || 'State update')}</span><small>${formatDate(item.created_at)}</small></article>`).join('')
    : '<div class="empty">No emotion history yet.</div>';
  const renderGeneration = item => `<article class="child-ai-row"><strong>${escapeHtml(item.phrase || 'Empty candidate')}</strong><span>${escapeHtml(item.generator)}</span><small>${escapeHtml(qualitySummary(item))} · ${formatDate(item.created_at)}</small>${item.rejection_reason ? `<em>${escapeHtml(item.rejection_reason)}</em>` : ''}</article>`;
  $('#childAiResponses').innerHTML = generations.some(item => item.accepted)
    ? generations.filter(item => item.accepted).slice(0, 30).map(renderGeneration).join('')
    : '<div class="empty">No accepted responses recorded yet.</div>';
  $('#childAiRejections').innerHTML = generations.some(item => !item.accepted)
    ? generations.filter(item => !item.accepted).slice(0, 30).map(renderGeneration).join('')
    : '<div class="empty">No rejected generations recorded yet.</div>';
}

async function loadChildAiAdmin() {
  if (state.currentUser?.role !== 'admin' || state.childAiLoading) return;
  state.childAiLoading = true;
  try {
    renderChildAiAdmin(await fetchJson('/api/admin/growing-child'));
  } catch (err) {
    setBanner(`Could not load Child AI state: ${err.message}`);
  } finally {
    state.childAiLoading = false;
  }
}

async function waitForAdminBotCommand(id, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const command = await fetchJson(`/api/admin/bot-command/${encodeURIComponent(id)}`);
    if (command.status === 'completed' || command.status === 'done') return command.result;
    if (command.status === 'failed') throw new Error(command.error || 'Bot command failed.');
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('The bot did not process the command in time.');
}

async function runChildAiCommand(commandType, payload = {}) {
  const queued = await postJson('/api/admin/growing-child', { commandType, payload,accountId:state.activeAccountId });
  return waitForAdminBotCommand(queued.command.id);
}

async function handleChildAiMemoryAction(event) {
  const deleteButton = event.target.closest('[data-child-memory-delete]');
  const correctButton = event.target.closest('[data-child-memory-correct]');
  if (!deleteButton && !correctButton) return;
  const button = deleteButton || correctButton;
  const memoryId = Number(deleteButton?.dataset.childMemoryDelete || correctButton?.dataset.childMemoryCorrect);
  if (deleteButton && !confirm('Delete this fact from long-term memory?')) return;
  let commandType = 'child_memory_delete';
  let payload = { memoryId };
  if (correctButton) {
    const factValue = prompt('Correct fact value:', correctButton.dataset.currentValue || '');
    if (factValue == null || !factValue.trim()) return;
    const currentConfidence = Math.round((Number(correctButton.dataset.currentConfidence) || 0.8) * 100);
    const confidenceInput = prompt('Confidence (0-100%):', String(currentConfidence));
    if (confidenceInput == null) return;
    const currentExpiry = new Date(correctButton.dataset.currentExpiry).getTime();
    const currentTtl = Number.isFinite(currentExpiry) ? Math.max(1, Math.ceil((currentExpiry - Date.now()) / 86_400_000)) : 180;
    const ttlInput = prompt('Keep the corrected fact for how many days?', String(currentTtl));
    if (ttlInput == null) return;
    commandType = 'child_memory_correct';
    payload = {
      memoryId, factValue: factValue.trim(),
      confidence: Math.max(0, Math.min(1, Number(confidenceInput) / 100)),
      ttlDays: Math.max(1, Math.min(3650, Number(ttlInput) || currentTtl))
    };
  }
  button.disabled = true;
  try {
    await runChildAiCommand(commandType, payload);
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner(commandType === 'child_memory_delete' ? 'Memory deleted.' : 'Memory corrected.');
  } catch (err) {
    setBanner(`Could not update memory: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function forgetChildAiUser() {
  const subjectId = $('#childAiForgetUserId')?.value.trim();
  const source = $('#childAiForgetSource')?.value;
  if (!subjectId) return setBanner('Enter a user ID to forget.');
  if (!confirm(`Forget all stored memory and conversation context for ${subjectId}?`)) return;
  const button = $('#childAiForgetUser');
  button.disabled = true;
  try {
    const result = await runChildAiCommand('child_forget_user', { source, subjectId });
    $('#childAiForgetUserId').value = '';
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner(`User forgotten. Removed ${Number(result?.deleted || 0)} facts.`);
  } catch (err) {
    setBanner(`Could not forget user: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function addChildAiExample(event) {
  event.preventDefault();
  const triggerText = $('#childAiExampleTrigger')?.value.trim();
  const responseText = $('#childAiExampleResponse')?.value.trim();
  const subjectId = $('#childAiExampleSubjectId')?.value.trim();
  if (!triggerText || !responseText) return setBanner('Enter both the player message and preferred response.');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await runChildAiCommand('child_example_add', {
      triggerText, responseText, subjectId,
      source: $('#childAiExampleSource')?.value || 'minecraft'
    });
    event.currentTarget.reset();
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner('Response example added. It will guide similar conversations.');
  } catch (err) {
    setBanner(`Could not add response example: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function handleChildAiExampleAction(event) {
  const edit = event.target.closest('[data-child-example-edit]');
  const toggle = event.target.closest('[data-child-example-toggle]');
  const remove = event.target.closest('[data-child-example-delete]');
  if (!edit && !toggle && !remove) return;
  const button = edit || toggle || remove;
  const exampleId = Number(edit?.dataset.childExampleEdit || toggle?.dataset.childExampleToggle || remove?.dataset.childExampleDelete);
  let commandType;
  let payload = { exampleId };
  if (remove) {
    if (!confirm('Delete this response example?')) return;
    commandType = 'child_example_delete';
  } else if (toggle) {
    commandType = 'child_example_update';
    payload.active = toggle.dataset.active !== 'true';
  } else {
    const triggerText = prompt('Player message:', edit.dataset.trigger || '');
    if (triggerText == null || !triggerText.trim()) return;
    const responseText = prompt('Preferred bot response (2-12 words):', edit.dataset.response || '');
    if (responseText == null || !responseText.trim()) return;
    commandType = 'child_example_update';
    payload = { exampleId, triggerText: triggerText.trim(), responseText: responseText.trim() };
  }
  button.disabled = true;
  try {
    await runChildAiCommand(commandType, payload);
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner(remove ? 'Response example deleted.' : 'Response example updated.');
  } catch (err) {
    setBanner(`Could not update response example: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function handleChildAiStyleAction(event) {
  const loadMoreButton = event.target.closest('[data-child-style-load-more]');
  if (loadMoreButton) {
    state.childAiStyleVisibleLimit += CHILD_AI_MOBILE_STYLE_BATCH;
    renderChildAiPlayerStyles();
    return;
  }
  const button = event.target.closest('[data-child-style-edit]');
  if (!button) return;
  const tone = prompt('Tone (auto, neutral, casual, friendly, helpful, energetic, reserved, inquisitive, playful, direct, formal):', button.dataset.tone || 'auto');
  if (tone == null) return;
  const responseLength = prompt('Response length (auto, short, balanced, detailed):', button.dataset.length || 'auto');
  if (responseLength == null) return;
  const notes = prompt('Optional instruction for this player:', button.dataset.notes || '');
  if (notes == null) return;
  button.disabled = true;
  try {
    await runChildAiCommand('child_style_update', {
      source: button.dataset.source,
      subjectId: button.dataset.childStyleEdit,
      tone: tone.trim().toLowerCase(),
      responseLength: responseLength.trim().toLowerCase(),
      notes: notes.trim()
    });
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner('Player communication style updated.');
  } catch (err) {
    setBanner(`Could not update player style: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function exportChildAiState() {
  const button = $('#childAiExport');
  button.disabled = true;
  try {
    const result = await runChildAiCommand('child_export_state');
    const exported = result?.state || result;
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `growing-child-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  } catch (err) {
    setBanner(`Could not export state: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

async function selectChildAiImport(event) {
  const file = event.target.files?.[0];
  state.childAiImportState = null;
  $('#childAiImport').disabled = true;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (![2, 3].includes(Number(parsed.version)) || !parsed.tables) throw new Error('This is not a supported Growing Child export.');
    state.childAiImportState = parsed;
    $('#childAiImport').disabled = false;
    setBanner(`${file.name} is ready to import.`);
  } catch (err) {
    setBanner(`Could not read import file: ${err.message}`);
  }
}

async function importChildAiState() {
  if (!state.childAiImportState || !confirm('Merge this backup into the current Child AI state? Existing learned data will be preserved.')) return;
  const button = $('#childAiImport');
  button.disabled = true;
  try {
    await runChildAiCommand('child_import_state', { state: state.childAiImportState });
    state.childAiImportState = null;
    $('#childAiImportFile').value = '';
    await new Promise(resolve => setTimeout(resolve, 650));
    await loadChildAiAdmin();
    setBanner('Child AI state imported. Existing vocabulary was preserved.');
  } catch (err) {
    setBanner(`Could not import state: ${err.message}`);
  }
}

function setRealtimeStatus(mode) {
  const indicator = $('#realtimeStatus');
  if (!indicator) return;
  if (mode !== 'reconnecting') clearTimeout(state.realtimeStatusTimer);
  clearTimeout(state.realtimeHideTimer);
  if (mode !== 'reconnecting') state.realtimeStatusTimer = null;
  state.realtimeHideTimer = null;
  if (mode === 'connected') {
    indicator.hidden = true;
    return;
  }
  indicator.hidden = false;
  const label = mode === 'unsupported' ? 'Live updates unavailable · polling'
    : mode === 'polling' ? 'Live updates using polling' : 'Reconnecting live updates…';
  indicator.innerHTML = `<span aria-hidden="true"></span>${label}`;
  indicator.classList.toggle('polling', mode === 'polling' || mode === 'unsupported');
  if (mode === 'polling') state.realtimeHideTimer = setTimeout(() => { indicator.hidden = true; }, 4_000);
}

function schedulePollingStatus(source) {
  if (state.realtimeStatusTimer) return;
  state.realtimeStatusTimer = setTimeout(() => {
    if (state.eventSource === source && source.readyState !== EventSource.OPEN && state.pollingMode === 'fallback') {
      setRealtimeStatus('polling');
    }
  }, 5_000);
}

function clearDashboardPolling() {
  clearInterval(state.timer);
  clearInterval(state.liveChatTimer);
  clearInterval(state.liveDashboardTimer);
  state.timer = null;
  state.liveChatTimer = null;
  state.liveDashboardTimer = null;
  state.pollingMode = null;
}

function startSlowPolling() {
  if (state.pollingMode === 'slow') return;
  clearDashboardPolling();
  state.pollingMode = 'slow';
  state.timer = setInterval(loadAll, 60_000);
  state.liveChatTimer = setInterval(checkChatVersion, 750);
  state.liveDashboardTimer = setInterval(refreshLiveDashboard, 1_000);
  refreshLiveDashboard();
}

function startFallbackPolling() {
  if (state.pollingMode === 'fallback') return;
  clearDashboardPolling();
  state.pollingMode = 'fallback';
  state.timer = setInterval(loadAll, 15_000);
  state.liveChatTimer = setInterval(loadLiveChats, 2_000);
  state.liveDashboardTimer = setInterval(refreshLiveDashboard, 1_000);
  refreshLiveDashboard();
}

function queueRealtimeRefresh(key, callback, delay = 180) {
  clearTimeout(state.realtimeRefreshTimers[key]);
  state.realtimeRefreshTimers[key] = setTimeout(async () => {
    delete state.realtimeRefreshTimers[key];
    if (!state.currentUser) return;
    if (document.visibilityState === 'hidden') {
      state.sseNeedsFullSync = true;
      return;
    }
    try { await callback(); } catch { /* slow polling remains the consistency fallback */ }
  }, delay);
}

// Each new game message used to refetch 500 messages plus every chat chart
// and leaderboard, then rebuild the whole list. Live updates now fetch only the
// newer messages; the summary (totals, top chatters, charts) refreshes at most
// once per CHAT_SUMMARY_REFRESH_MS.
const CHAT_SUMMARY_REFRESH_MS = 60_000;

async function refreshChatFromEvent() {
  if (state.chatContextMessageId || state.chatSearchQuery) return;
  if (state.liveChatLoading) {
    state.liveChatRefreshPending = true;
    return;
  }
  state.liveChatLoading = true;
  try {
    const canFetchDelta = state.chatInitialized
      && /^\d+$/.test(String(state.chatLatestId || ''))
      && Date.now() - (state.chatSummaryRefreshedAt || 0) < CHAT_SUMMARY_REFRESH_MS;
    let payload = canFetchDelta
      ? await fetchJson(`/api/chat?after=${state.chatLatestId}&limit=100`)
      : null;
    if (!payload || payload.hasGap) {
      payload = await fetchJson(`/api/chat?limit=${CHAT_HISTORY_LIMIT}`);
      state.chatSummaryRefreshedAt = Date.now();
    }
    if (state.chatContextMessageId || state.chatSearchQuery) return;
    renderLiveChat(payload);
    const profileUsername = String(state.playerProfileUsername || '').toLowerCase();
    const profileHasNewMessages = profileUsername && (payload.messages || [])
      .some(message => String(message.username || '').toLowerCase() === profileUsername);
    if (profileHasNewMessages && !$('#playerProfileOverlay')?.hidden) {
      await loadPlayerProfile(state.playerProfileUsername);
    }
  } finally {
    state.liveChatLoading = false;
    if (state.liveChatRefreshPending) {
      state.liveChatRefreshPending = false;
      queueRealtimeRefresh('chat', refreshChatFromEvent, 30);
    }
  }
}

async function checkChatVersion() {
  if (!state.currentUser || document.visibilityState === 'hidden' || state.liveChatLoading || state.chatContextMessageId || state.chatSearchQuery) return;
  // An open SSE stream already announces every message; poll only as a slow
  // safety net then, and at full speed while it is disconnected.
  const sseOpen = state.eventSource?.readyState === EventSource.OPEN;
  if (sseOpen && Date.now() - (state.chatVersionCheckedAt || 0) < 5_000) return;
  state.chatVersionCheckedAt = Date.now();
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

async function refreshKillAuraFromEvent() {
  renderKillAura(await fetchJson('/api/kill-aura'));
}

async function loadPlayerStats({ force = false } = {}) {
  if (!state.currentUser || document.visibilityState === 'hidden') return false;
  const accountId = state.activeAccountId;
  const isFresh = state.playerStatsAccountId === accountId
    && Date.now() - state.playerStatsLoadedAt < 30_000;
  if (!force && isFresh) return true;
  if (state.playerStatsPromise) {
    if (!force) return state.playerStatsPromise;
    return state.playerStatsPromise.finally(() => loadPlayerStats({ force: true }));
  }

  state.playerStatsLoading = true;
  const request = fetchJson(`/api/player-stats${force ? '?fresh=1' : ''}`, {
    signal: state.accountAbortController?.signal || null
  }).then(payload => {
    if (accountId !== state.activeAccountId) return false;
    renderPlayerStats(payload);
    state.playerStatsLoadedAt = Date.now();
    state.playerStatsAccountId = accountId;
    return true;
  }).finally(() => {
    if (state.playerStatsPromise === request) {
      state.playerStatsLoading = false;
      state.playerStatsPromise = null;
    }
  });
  state.playerStatsPromise = request;
  return request;
}

async function refreshLiveDashboard() {
  if (!state.currentUser || state.liveDashboardLoading || document.visibilityState === 'hidden') return;
  const accountId = state.activeAccountId;
  state.liveDashboardLoading = true;
  try {
    if (Date.now() - state.accountsRefreshedAt >= 5_000) loadAccounts().catch(() => {});
    const obsidianLivePath = `/api/obsidian/live?scope=${encodeURIComponent(
      activeAccountIsPrimary() && state.currentUser?.role === 'admin' ? state.obsidianStatsScope : 'personal'
    )}`;
    const [payload, liveObsidian] = await Promise.all([
      fetchJson('/api/live-dashboard'),
      state.activeTab === 'obsidian' ? fetchJson(obsidianLivePath).catch(() => null) : Promise.resolve(null)
    ]);
    if (accountId !== state.activeAccountId) return;
    renderBotStats({ bot: payload.bot, observedAt: payload.observedAt });
    renderNearbySightings(payload.nearby || []);
    renderSupplies('#inventorySupplies', payload.supplies?.inventory);
    renderSupplies('#barrelSupplies', payload.supplies?.barrel, payload.supplies?.barrelError);
    if (liveObsidian) renderLiveObsidian(liveObsidian);
  } catch {
    // SSE and the periodic full dashboard refresh remain as fallbacks.
  } finally {
    state.liveDashboardLoading = false;
  }
}

async function refreshFarmFromEvent() {
  if (hasActiveTextSelection()) {
    queueRealtimeRefresh('farm-selection', refreshFarmFromEvent, 1_000);
    return;
  }
  renderObsidian(await fetchJson(obsidianStatsPath()));
}

function hasActiveTextSelection() {
  const selection = window.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

function hasActiveTextSelectionWithin(container) {
  if (!container || !hasActiveTextSelection()) return false;
  const selection = window.getSelection();
  return [selection.anchorNode, selection.focusNode].some(node => node && container.contains(node));
}

async function refreshPlayersFromEvent({ forcePlayerStats = false } = {}) {
  const serverRequest = fetchJson('/api/server-stats').then(renderServerStats);
  const playerRequest = state.activeTab === 'players'
    ? loadPlayerStats({ force: forcePlayerStats })
    : Promise.resolve();
  await Promise.all([serverRequest, playerRequest]);
}

function scheduleRealtimeChartRefresh() {
  const now = Date.now();
  if (now - state.lastRealtimeChartRefreshAt < 15_000) return;
  state.lastRealtimeChartRefreshAt = now;
  queueRealtimeRefresh('charts', refreshPlayersFromEvent, 500);
}

async function refreshWhispersFromEvent() {
  if (!activeAccountIsPrimary()) return;
  await loadWhisperOnlinePlayers({ force: true });
  if ($('#whisperPanel')?.classList.contains('open')) await loadWhisperDialog();
}

function handleRealtimeEvent(event) {
  const type = event.type;
  let eventPayload = {};
  try { eventPayload=JSON.parse(event.data || '{}'); } catch {}
  if (type === 'chat_message') queueRealtimeRefresh('chat', refreshChatFromEvent, 30);
  else if (type === 'whisper_message') {
    showWhisperToast(eventPayload);
    if (!eventPayload.accountId || eventPayload.accountId === state.activeAccountId) queueRealtimeRefresh('whisper', refreshWhispersFromEvent);
  }
  else if (type === 'bot_status_updated') {
    queueRealtimeRefresh('bot', refreshBotFromEvent);
    queueRealtimeRefresh('kill-aura', refreshKillAuraFromEvent);
    scheduleRealtimeChartRefresh();
  }
  else if (type === 'farm_status_updated') queueRealtimeRefresh('farm', refreshFarmFromEvent);
  else if (type === 'area_explorer_updated') {
    // The live map's tiles are refreshed in place; a full reload is for finds, runs and layers
    if (eventPayload.mapTiles) applyXaeroRegionMapUpdate(eventPayload.mapTiles);
    else {
      noteAreaExplorerUpdate(eventPayload);
      if (eventPayload.liveStatus) applyAreaExplorerLiveStatus(eventPayload.liveStatus);
      if (eventPayload.events) applyAreaExplorerEvents(eventPayload.events);
      // Run log events alone come in the update itself: nothing else to load for them
      const onlyEvents = eventPayload.events && !eventPayload.added && !eventPayload.status;
      if (eventPayload.added || eventPayload.tokenRevoked || (!eventPayload.liveStatus && !onlyEvents)) queueAreaExplorerRefresh(180);
    }
  }
  else if (type === 'player_joined' || type === 'player_left') {
    state.playerStatsLoadedAt = 0;
    queueRealtimeRefresh('players', () => refreshPlayersFromEvent({ forcePlayerStats: true }));
    queueRealtimeRefresh('chat-activity', refreshChatFromEvent, 30);
    if (state.playerProfileUsername && String(state.playerProfileUsername).toLowerCase() === String(eventPayload.username || '').toLowerCase()) {
      queueRealtimeRefresh('player-profile-activity', () => loadPlayerProfile(state.playerProfileUsername), 100);
    }
    if (state.currentUser?.role === 'admin' && state.activeTab === 'admin') {
      queueRealtimeRefresh('admin-players', () => loadAdminPlayers({ showLoading: false, preserveScroll: true }), 350);
    }
  }
  else if (type === 'player_info_updated') {
    state.playerStatsLoadedAt = 0;
    queueRealtimeRefresh('players-info', () => refreshPlayersFromEvent({ forcePlayerStats: true }), 200);
    if (state.currentUser?.role === 'admin') {
      queueRealtimeRefresh(
        'admin-player-info-collection',
        () => loadAdminPlayerInfoCollection({ force: true }),
        250
      );
      if (state.activeTab === 'admin') {
        queueRealtimeRefresh('admin-player-info', () => loadAdminPlayers({ showLoading: false, preserveScroll: true }), 2_000);
      }
    }
    if (state.playerProfileUsername
      && !$('#playerProfileOverlay')?.hidden
      && (!eventPayload.username
        || String(state.playerProfileUsername).toLowerCase() === String(eventPayload.username).toLowerCase())) {
      queueRealtimeRefresh('player-profile-info', () => loadPlayerProfile(state.playerProfileUsername), 100);
    }
  }
  else if (type === 'notification_created' && state.currentUser?.role === 'admin') {
    queueRealtimeRefresh('notifications', async () => {
      await loadNotificationCount();
      if (state.activeTab === 'notifications') await loadNotifications();
    });
  } else if (type === 'resource_request_updated' && state.currentUser?.role === 'admin') {
    queueRealtimeRefresh('resource-requests', loadRequestCount, 100);
  } else if (type === 'admin_control_updated' && state.currentUser?.role === 'admin') {
    queueRealtimeRefresh('admin-control', async () => {
      await loadAdminControlState();
      if (state.activeTab === 'admin' && eventPayload.source !== 'bot_status') await loadAdminSystemLogs();
      if (state.activeTab === 'child-ai') await loadChildAiAdmin();
    }, 300);
  } else if (type === 'navigation_settings_updated') {
    queueRealtimeRefresh('navigation-settings', () => loadNavigationSettings(), 100);
  } else if (type === 'account_settings_updated') {
    queueRealtimeRefresh('account-settings', () => loadAccountSettings({ refreshDashboard: true }), 100);
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
    'bot_status_updated', 'player_joined', 'player_left', 'player_info_updated', 'chat_message',
    'whisper_message', 'farm_status_updated', 'notification_created', 'admin_control_updated',
    'navigation_settings_updated', 'account_settings_updated', 'resource_request_updated', 'area_explorer_updated'
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
    schedulePollingStatus(source);
  };
}

async function loadAll({ force = false, switchGeneration = state.accountSwitchGeneration } = {}) {
  if (!state.currentUser) return false;
  if (document.visibilityState === 'hidden' && !force) {
    state.sseNeedsFullSync = true;
    return false;
  }
  if (state.fullSyncLoading && !force) return state.fullSyncPromise || false;

  const syncToken = Symbol('dashboard-sync');
  const accountId = state.activeAccountId;
  const signal = state.accountAbortController?.signal || null;
  const isCurrentSync = () => (
    state.fullSyncToken === syncToken
    && state.accountSwitchGeneration === switchGeneration
    && state.activeAccountId === accountId
    && !signal?.aborted
  );
  const renderIfCurrent = renderer => payload => {
    if (isCurrentSync()) renderer(payload);
  };

  state.fullSyncToken = syncToken;
  state.fullSyncLoading = true;
  const syncPromise = (async () => {
    try {
      // Player info imports usually land while the admin is in Discord and this
      // page is hidden, so those events were skipped. Refresh the lookup cards
      // right away instead of waiting for the next unrelated player update.
      if (state.currentUser?.role === 'admin' && state.activeTab === 'admin') {
        loadAdminPlayerInfoCollection({ force: true });
        loadAdminPlayers({ showLoading: false, preserveScroll: true });
      }
      // Render each dashboard section as soon as its own request completes. A slow
      // analytics query or the icon manifest must not hold the whole first screen.
      const sectionLoads = [
        fetchJson(`/api/chat?limit=${CHAT_HISTORY_LIMIT}`, { signal }).then(payload => {
          if (isCurrentSync() && !state.chatContextMessageId && !state.chatSearchQuery) renderLiveChat(payload);
        }),
        fetchJson('/api/bot-stats', { signal }).then(renderIfCurrent(renderBotStats)),
        fetchJson('/api/kill-aura', { signal }).then(renderIfCurrent(renderKillAura)),
        Promise.all([ensureItemIcons(), fetchJson(obsidianStatsPath(), { signal })]).then(([, payload]) => {
          if (!isCurrentSync()) return;
          if (hasActiveTextSelection()) {
            queueRealtimeRefresh('farm-selection', refreshFarmFromEvent, 1_000);
            return;
          }
          renderObsidian(payload);
        }),
        fetchJson('/api/server-stats', { signal }).then(renderIfCurrent(renderServerStats))
      ];
      if (state.activeTab === 'players') {
        sectionLoads.push(loadPlayerStats());
      }
      // Back from the background or a dropped stream: the finds' counts catch up too
      if (state.activeTab === 'area-explorer') {
        sectionLoads.push(loadAreaExplorer({ full: false }).catch(() => {}));
      }
      const results = await Promise.allSettled(sectionLoads);
      if (!isCurrentSync()) return false;
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (state.currentUser?.role === 'admin') await Promise.all([loadNotificationCount(), loadRequestCount()]);
      if (!isCurrentSync()) return false;
      if (state.currentUser?.role === 'admin') {
        await loadAdminControlState();
        if (state.activeTab === 'admin') {
          await Promise.all([loadAdminSystemLogs(), loadAdminUsers({ showLoading: false })]);
        }
      }
      if (!isCurrentSync()) return false;
      if ($('#whisperPanel')?.classList.contains('open')) {
        await loadWhisperOnlinePlayers();
        await loadWhisperDialog();
      } else {
        await loadWhisperOnlinePlayers({ force: true });
      }
      if (!isCurrentSync()) return false;
      setBanner('');
      return true;
    } catch (err) {
      if (isCurrentSync() && err?.name !== 'AbortError') setBanner(`Could not load dashboard data: ${err.message}`);
      return false;
    } finally {
      if (state.fullSyncToken === syncToken) {
        state.fullSyncLoading = false;
        state.fullSyncToken = null;
        state.fullSyncPromise = null;
      }
    }
  })();
  state.fullSyncPromise = syncPromise;
  return syncPromise;
}

async function ensureItemIcons() {
  if (Object.keys(state.itemIcons).length) return state.itemIcons;
  if (!state.itemIconsLoading) {
    state.itemIconsLoading = fetchJson('/api/item-icons')
      .then(payload => {
        state.itemIcons = payload?.icons && typeof payload.icons === 'object' ? payload.icons : {};
        state.itemNameIds = payload?.names && typeof payload.names === 'object' ? payload.names : {};
        return state.itemIcons;
      })
      .finally(() => {
        state.itemIconsLoading = null;
      });
  }
  return state.itemIconsLoading;
}

async function loadLiveChats() {
  if (!state.currentUser || document.visibilityState === 'hidden' || state.liveChatLoading) return;
  state.liveChatLoading = true;
  try {
    const chat = await fetchJson(`/api/chat?limit=${CHAT_HISTORY_LIMIT}`);
    if (!state.chatContextMessageId && !state.chatSearchQuery) renderLiveChat(chat);
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
initializeCollapsibleSections();
setAuthMode('login');
$$('.tab-button[data-tab]').forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});
$('#authForm').addEventListener('submit', handleAuthSubmit);
$('#authPassword').addEventListener('input', event => updatePasswordStrength('#authPasswordStrength', event.currentTarget.value));
$('#authModeToggle').addEventListener('click', () => transitionAuthMode(state.authMode === 'login' ? 'register' : 'login'));
$('#authBootstrapToggle').addEventListener('click', () => transitionAuthMode('bootstrap'));
$('#navMenuToggle')?.addEventListener('click', toggleNavMenu);
$('#logoutButton')?.addEventListener('click', handleLogout);
$('#accountModalClose')?.addEventListener('click', () => setAccountModalOpen(false));
$('#accountModalCancel')?.addEventListener('click', () => setAccountModalOpen(false));
$('#accountModal')?.addEventListener('click', event => { if (event.target.id === 'accountModal') setAccountModalOpen(false); });
$('#accountForm')?.addEventListener('submit', submitAccount);
$('#accountSwitcherList')?.addEventListener('click', event => {
  if (Date.now() < accountLongPressConsumedUntil || Date.now() < state.accountDragConsumedUntil) { event.preventDefault(); return; }
  if (event.target.closest('#accountAddButton')) { setMobileAccountSwitcherOpen(false); setAccountModalOpen(true); return; }
  const avatar=event.target.closest('[data-account-id]');
  if (!avatar) return;
  const accountId=avatar.dataset.accountId;
  const mobile=matchMedia('(max-width: 700px)').matches;
  const switcher=$('#accountSwitcher');
  if (mobile && accountId === state.activeAccountId && !switcher?.classList.contains('expanded')) { setMobileAccountSwitcherOpen(true); return; }
  selectAccount(accountId);
  setMobileAccountSwitcherOpen(false);
});
$('#accountSwitcherList')?.addEventListener('dragstart', event => {
  const avatar=event.target.closest('[data-account-id]');
  if (!avatar || avatar.dataset.accountPrimary === 'true' || state.accountReorderPending) {
    event.preventDefault();
    return;
  }
  state.accountDragId=avatar.dataset.accountId;
  avatar.classList.add('account-avatar-dragging');
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',state.accountDragId);
});
$('#accountSwitcherList')?.addEventListener('dragover', event => {
  if (!state.accountDragId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  $$('.account-avatar-drop-target').forEach(element => element.classList.remove('account-avatar-drop-target'));
  event.target.closest('[data-account-id]')?.classList.add('account-avatar-drop-target');
});
$('#accountSwitcherList')?.addEventListener('drop', event => {
  if (!state.accountDragId) return;
  event.preventDefault();
  const sourceId=state.accountDragId;
  state.accountDragId=null;
  $$('.account-avatar-dragging,.account-avatar-drop-target').forEach(element => element.classList.remove('account-avatar-dragging','account-avatar-drop-target'));
  const target=event.target.closest('[data-account-id]');
  const secondaryIds=state.accounts.filter(account => !account.isDefault && account.id !== sourceId).map(account => account.id);
  if (target?.dataset.accountPrimary === 'true') {
    secondaryIds.unshift(sourceId);
  } else if (!target) {
    secondaryIds.push(sourceId);
  } else if (target.dataset.accountId !== sourceId) {
    const targetIndex=secondaryIds.indexOf(target.dataset.accountId);
    const after=event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2;
    secondaryIds.splice(Math.max(0,targetIndex + (after ? 1 : 0)),0,sourceId);
  } else {
    return;
  }
  state.accountDragConsumedUntil=Date.now()+500;
  persistAccountOrder(secondaryIds).catch(error => setBanner(error.message));
});
$('#accountSwitcherList')?.addEventListener('dragend', () => {
  state.accountDragId=null;
  $$('.account-avatar-dragging,.account-avatar-drop-target').forEach(element => element.classList.remove('account-avatar-dragging','account-avatar-drop-target'));
});
$('#accountSwitcherList')?.addEventListener('pointerdown', event => {
  const avatar=event.target.closest('[data-account-id]');
  if (!avatar || !matchMedia('(max-width: 700px)').matches || event.pointerType === 'mouse') return;
  cancelAccountLongPress();
  accountLongPressTimer=setTimeout(() => {
    accountLongPressTimer=null;
    accountLongPressConsumedUntil=Date.now()+800;
    navigator.vibrate?.(20);
    openAccountMenu(avatar.dataset.accountId,avatar);
  },550);
});
for (const eventName of ['pointerup','pointercancel','pointerleave']) $('#accountSwitcherList')?.addEventListener(eventName,cancelAccountLongPress);
$('#accountSwitcherList')?.addEventListener('contextmenu', event => { const avatar=event.target.closest('[data-account-id]'); if(!avatar)return; event.preventDefault(); openAccountMenu(avatar.dataset.accountId,avatar); });
$('#accountSwitcherList')?.addEventListener('keydown', event => { const avatar=event.target.closest('[data-account-id]'); if(avatar && (event.key==='ContextMenu' || (event.shiftKey&&event.key==='F10'))) { event.preventDefault(); openAccountMenu(avatar.dataset.accountId,avatar); } });
document.addEventListener('pointerdown', event => {
  const menu=document.querySelector('.account-context-menu');
  const insideMenu=Boolean(event.target.closest('.account-context-menu'));
  if (menu && !insideMenu) menu.remove();
  if (!event.target.closest('#accountSwitcher') && !insideMenu) setMobileAccountSwitcherOpen(false);
});
$('#adminUsersRefresh')?.addEventListener('click', loadAdminUsers);
$('#adminPlayersRefresh')?.addEventListener('click', () => {
  loadAdminPlayers({ showLoading: false, preserveScroll: true });
  loadAdminPlayerInfoCollection({ force: true });
});
$('#adminPlayersSort')?.addEventListener('change', event => {
  state.adminPlayersSort = event.target.value;
  loadAdminPlayers({ offset: 0 });
});
$('#adminPlayersDirection')?.addEventListener('change', event => {
  state.adminPlayersDirection = event.target.value;
  loadAdminPlayers({ offset: 0 });
});
$('#adminPlayersSearch')?.addEventListener('input', () => {
  clearTimeout(state.adminPlayerSearchTimer);
  state.adminPlayerSearchTimer = setTimeout(() => loadAdminPlayers({ offset: 0 }), 250);
});
$('#adminPlayersScroller')?.addEventListener('scroll', maybeLoadMoreAdminPlayers, { passive: true });
$('#adminPlayersList')?.addEventListener('click', event => handleAdminPlayerAction(event).catch(err => setAdminPlayersNotice(err.message, 'error')));
document.addEventListener('pointerdown', closeAdminPlayerMenus, true);
document.addEventListener('pointerdown', event => {
  for (const details of document.querySelectorAll('.player-ping-details[open]')) {
    if (!details.contains(event.target)) details.open = false;
  }
}, true);
$('#adminPlayerActionsButtons')?.addEventListener('click', event => handleAdminPlayerAction(event).catch(err => setAdminPlayersNotice(err.message, 'error')));
$('#adminPlayerActionsClose')?.addEventListener('click', closeAdminPlayerActions);
$('#adminPlayerActionsDialog')?.addEventListener('cancel', event => {
  event.preventDefault();
  closeAdminPlayerActions();
});
$('#adminPlayerActionsDialog')?.addEventListener('close', () => {
  if (!$('#adminPlayerActionsDialog').open) restoreAdminPlayerActionsScroll();
});
$('#adminPlayerActionsDialog')?.addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAdminPlayerActions();
});
$('#adminPlayerPearlHatchReset')?.addEventListener('click', resetAdminPlayerPearlHatch);
for (const axis of ['X', 'Y', 'Z']) {
  $('#adminPlayerPearlHatch' + axis)?.addEventListener('input', () => {
    $('#adminPlayerEditForm').dataset.hatchEdited = 'true';
  });
}
$('#adminPlayerEditForm')?.addEventListener('submit', saveAdminPlayer);
$('#adminPlayerEditClose')?.addEventListener('click', closeAdminPlayerEdit);
$('#adminPlayerEditCancel')?.addEventListener('click', closeAdminPlayerEdit);
$('#adminPlayerEditModal')?.addEventListener('click', event => { if (event.target.id === 'adminPlayerEditModal') closeAdminPlayerEdit(); });
$('#adminPlayerDeleteClose')?.addEventListener('click', closeAdminPlayerDelete);
$('#adminPlayerDeleteCancel')?.addEventListener('click', closeAdminPlayerDelete);
$('#adminPlayerDeleteConfirm')?.addEventListener('click', confirmAdminPlayerDelete);
$('#adminPlayerDeleteModal')?.addEventListener('click', event => { if (event.target.id === 'adminPlayerDeleteModal') closeAdminPlayerDelete(); });
$('#adminLogsRefresh')?.addEventListener('click', loadAdminSystemLogs);
$('#adminLogLevel')?.addEventListener('change', loadAdminSystemLogs);
$('#adminLogType')?.addEventListener('change', loadAdminSystemLogs);
$('#childAiRefresh')?.addEventListener('click', loadChildAiAdmin);
$('#childAiMemories')?.addEventListener('click', handleChildAiMemoryAction);
$('#childAiExampleForm')?.addEventListener('submit', addChildAiExample);
$('#childAiExamples')?.addEventListener('click', handleChildAiExampleAction);
$('#childAiStyles')?.addEventListener('click', handleChildAiStyleAction);
$('#childAiStyleSearch')?.addEventListener('input', handleChildAiStyleSearch);
$('#childAiForgetUser')?.addEventListener('click', forgetChildAiUser);
$('#childAiExport')?.addEventListener('click', exportChildAiState);
$('#childAiImportFile')?.addEventListener('change', selectChildAiImport);
$('#childAiImport')?.addEventListener('click', importChildAiState);
$('#notificationsRefresh')?.addEventListener('click', loadNotifications);
$('#notificationStatusFilter')?.addEventListener('change', loadNotifications);
$('#notificationSeverityFilter')?.addEventListener('change', loadNotifications);
$('#notificationEventFilter')?.addEventListener('change', loadNotifications);
$('#notificationUnreadFilter')?.addEventListener('change', loadNotifications);
$('#activeNotifications')?.addEventListener('click', markNotificationRead);
$('#notificationHistory')?.addEventListener('click', markNotificationRead);
$('#notificationRules')?.addEventListener('submit', saveNotificationRule);
$('#obsidianGoalForm')?.addEventListener('submit', saveObsidianGoal);
$('#obsidianAnalyticsSettings')?.addEventListener('submit', saveObsidianAnalyticsSettings);
$('#obsidianAnalyticsSettings')?.addEventListener('input', event => { event.currentTarget.dataset.dirty = 'true'; });
$('#obsidianGoals')?.addEventListener('click', changeObsidianGoalState);
$('#obsidianStatsScope')?.addEventListener('click', event => changeObsidianStatsScope(event).catch(error => setBanner(`Could not switch Obsidian statistics: ${error.message}`)));
$('#killAuraSearch')?.addEventListener('input', renderKillAuraMobList);
$('#killAuraMobList')?.addEventListener('change', handleKillAuraMobChange);
$('#killAuraTargetModalOpen')?.addEventListener('click', openKillAuraTargetModal);
$('#killAuraTargetModalClose')?.addEventListener('click', closeKillAuraTargetModal);
$('#killAuraTargetModalCancel')?.addEventListener('click', closeKillAuraTargetModal);
$('#killAuraTargetModal')?.addEventListener('click', handleKillAuraModalClick);
const initialKillAuraModal = $('#killAuraTargetModal');
if (initialKillAuraModal) {
  initialKillAuraModal.classList.remove('is-open');
  initialKillAuraModal.hidden = true;
  document.body.classList.remove('kill-aura-modal-open');
}
$('#killAuraSelectHostile')?.addEventListener('click', () => setKillAuraSelection(mob => mob.category === 'hostile'));
$('#killAuraSelectProjectiles')?.addEventListener('click', () => setKillAuraSelection(mob => mob.category === 'projectile'));
$('#killAuraSelectAll')?.addEventListener('click', () => setKillAuraSelection(() => true));
$('#killAuraClear')?.addEventListener('click', () => setKillAuraSelection(() => false));
$('#killAuraSaveTargets')?.addEventListener('click', saveKillAuraTargets);
$('#killAuraAttackRange')?.addEventListener('input', handleKillAuraRangeInput);
$('#killAuraAttackRange')?.addEventListener('change', () => scheduleKillAuraRangeSave(100));
$('#playtimeLeaderboardScope')?.addEventListener('click', event => {
  const button = event.target.closest('[data-playtime-scope]');
  if (button) setPlaytimeLeaderboardScope(button.dataset.playtimeScope);
});
$('#playtimeLeaderboardSort')?.addEventListener('click', event => {
  const button = event.target.closest('[data-playtime-sort]');
  if (button) setPlaytimeLeaderboardSort(button.dataset.playtimeSort);
});
$('#playtimeLeaderboardDirection')?.addEventListener('click', togglePlaytimeLeaderboardDirection);
$('#playtimeLeaderboard')?.addEventListener('scroll', maybeLoadMorePlaytimeLeaderboard, { passive: true });
$('#newPlayersList')?.addEventListener('scroll', maybeLoadMoreNewPlayers, { passive: true });
$('#newPlayersList')?.addEventListener('click', event => {
  if (event.target.closest('[data-new-players-more]')) loadMoreNewPlayers();
});
document.addEventListener('keydown', handleKillAuraModalKeydown);
$('#notificationsMarkAllRead')?.addEventListener('click', async () => {
  await postJson('/api/notifications/read', { all: true });
  await loadNotifications();
});
$('#pushEnableDevice')?.addEventListener('click', enablePushOnCurrentDevice);
$('#pushDeviceList')?.addEventListener('submit', handlePushDeviceSubmit);
$('#pushDeviceList')?.addEventListener('click', handlePushDeviceClick);
$('#pushDeviceList')?.addEventListener('change', handlePushEventTypeChange);
$('.settings-tabs')?.addEventListener('click', event => {
  const button = event.target.closest('[data-settings-view]');
  if (button) setSettingsView(button.dataset.settingsView);
});
$('#navSectionsList')?.addEventListener('change', saveNavigationVisibility);
$('#navSectionsList')?.addEventListener('click', moveNavigationSection);
$('#navSectionsReset')?.addEventListener('click', resetNavigationVisibility);
$('#accountSettingsForm')?.addEventListener('submit', saveAccountSettings);
$('#accountPasswordForm')?.addEventListener('submit', changeAccountPassword);
$('#accountNewPassword')?.addEventListener('input', event => updatePasswordStrength('#accountNewPasswordStrength', event.currentTarget.value));
$('#farmLaunchToastClose')?.addEventListener('click', () => hideFarmLaunchFailureToast());
$('#adminDataToastClose')?.addEventListener('click', () => hideAdminDataToast());
$('#whisperToastClose')?.addEventListener('click', () => hideWhisperToast());
$('#whisperToastOpen')?.addEventListener('click', () => openWhisperToast().catch(err => setBanner(`Could not open dialog: ${err.message}`)));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'open_push_destination') openPushDestination(event.data.destination, event.data.player, event.data.accountId);
    if (event.data?.type === 'push_subscription_changed') {
      loadPushSettings().catch(() => {});
      setBanner('The browser push subscription changed. Open Settings and repair this device.');
    }
  });
}
$('#adminUsersList')?.addEventListener('click', handleAdminUserAction);
$('#adminPlaytimeCommands')?.addEventListener('click', event => {
  const button = event.target.closest('[data-copy-playtime-command]');
  if (button) copyAdminPlaytimeCommand(button);
});
document.addEventListener('click', handleAdminBotCommand);
document.addEventListener('click', handleAdminControlAction);
for (const [selector, action] of [
  ['#adminPlaytimeInput', 'playtime_set'],
  ['#adminRegistrationDateInput', 'registration_date_set']
]) {
  $(selector)?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    document.querySelector(`[data-admin-control-action="${action}"]`)?.click();
  });
}
$('#adminFollowTarget')?.addEventListener('change', updateFollowControl);
$('#adminWhitelistPlayer')?.addEventListener('input', handleWhitelistPlayerInput);
$('#adminWhitelistPlayer')?.addEventListener('focus', event => runWhitelistSearch(event.currentTarget.value));
$('#adminWhitelistSuggestions')?.addEventListener('click', handleWhitelistSuggestionClick);
$('#gameChatForm')?.addEventListener('submit', handleGameChatSubmit);
$('#chatScrollBottom')?.addEventListener('click', () => scrollToBottom('#chatList', { smooth: true }));
$('#chatReturnLive')?.addEventListener('click', () => returnToLiveChat().catch(err => setBanner(`Could not load live chat: ${err.message}`)));
$('#chatSearchForm')?.addEventListener('submit', event => searchGameChat(event).catch(err => setBanner(`Could not search chat: ${err.message}`)));
$('#chatSearchToggle')?.addEventListener('click', () => setChatArchiveSearchOpen(true));
$('#chatSearchClose')?.addEventListener('click', () => closeChatArchiveSearch().catch(err => setBanner(`Could not load live chat: ${err.message}`)));
$('#chatSearchInput')?.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeChatArchiveSearch().catch(err => setBanner(`Could not load live chat: ${err.message}`));
});
$('#chatList')?.addEventListener('scroll', handleChatListScroll, { passive: true });
$('#chatList')?.addEventListener('pointerdown', handleChatMessagePointerDown);
$('#chatList')?.addEventListener('pointermove', handleChatPlayerPointerMove, { passive: true });
$('#chatList')?.addEventListener('pointerup', handleChatPlayerPointerEnd);
$('#chatList')?.addEventListener('pointercancel', handleChatPlayerPointerEnd);
$('#chatList')?.addEventListener('click', handleChatReplyClick);
$('#gameChatReplyCancel')?.addEventListener('click', clearGameChatReply);
$$('.chart-controls').forEach(controls => {
  controls.addEventListener('click', handleChartRangeClick);
  controls.addEventListener('click', handleChartZoomClick);
});
$$('.chart-scroll').forEach(scroll => {
  scroll.addEventListener('scroll', scheduleChartViewportRedraw, { passive: true });
});
$('#themeToggle').addEventListener('click', toggleTheme);

// Mobile Safari emits resize events while only its address bar is moving. Chart
// layout depends on width, not viewport height, so ignore those events and
// debounce real width/orientation changes until the viewport has settled.
let viewportRedrawFrame = null;
let viewportRedrawTimer = null;
let lastViewportLayout = `${document.documentElement.clientWidth}:${window.devicePixelRatio || 1}`;
function scheduleViewportRedraw({ force = false } = {}) {
  const nextViewportLayout = `${document.documentElement.clientWidth}:${window.devicePixelRatio || 1}`;
  if (!force && nextViewportLayout === lastViewportLayout) return;
  lastViewportLayout = nextViewportLayout;
  clearTimeout(viewportRedrawTimer);
  if (viewportRedrawFrame != null) cancelAnimationFrame(viewportRedrawFrame);
  viewportRedrawTimer = setTimeout(() => {
    viewportRedrawTimer = null;
    viewportRedrawFrame = requestAnimationFrame(() => {
      viewportRedrawFrame = null;
      redrawCharts();
      updateCarousels();
      fitPlayerProfileName();
    });
  }, 140);
}

window.addEventListener('resize', scheduleViewportRedraw, { passive: true });
window.addEventListener('pageshow', event => {
  // Standalone mobile PWAs may restore transient body classes from BFCache
  // after the popup itself was discarded. Clear them so the page stays usable.
  if (event.persisted) {
    setNavMenuOpen(false);
    clearSeenSearch({ collapse: true });
    setWhisperOpen(false);
    setMobileAccountSwitcherOpen(false);
    closePlayerProfile({ restoreSeenSearch: false });
  }
  ensureActiveTabAvailable();
  scheduleViewportRedraw({ force: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    ensureActiveTabAvailable();
    scheduleViewportRedraw({ force: true });
    if (state.adminPlayerInfoAwaitingCommands.size) scheduleAdminPlayerInfoAwaitPoll(0);
    if (state.currentUser && state.sseNeedsFullSync) {
      state.sseNeedsFullSync = false;
      loadAll().catch(() => { state.sseNeedsFullSync = true; });
    }
  } else {
    state.sseNeedsFullSync = Boolean(state.currentUser);
    clearTimeout(viewportRedrawTimer);
    viewportRedrawTimer = null;
    if (viewportRedrawFrame != null) cancelAnimationFrame(viewportRedrawFrame);
    viewportRedrawFrame = null;
    if (state.chartRedrawFrame) cancelAnimationFrame(state.chartRedrawFrame);
    state.chartRedrawFrame = null;
  }
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
$('#playerProfileContent')?.addEventListener('keydown', handlePlayerProfileKeydown);
$('#botInventory')?.addEventListener('click', handleBotInventoryClick);
$('#botInventory')?.addEventListener('keydown', handleBotInventoryKeydown);
$('#botInventory')?.addEventListener('dragstart', handleBotInventoryDragStart);
$('#botInventory')?.addEventListener('dragover', handleBotInventoryDragOver);
$('#botInventory')?.addEventListener('drop', handleBotInventoryDrop);
$('#botInventory')?.addEventListener('dragend', handleBotInventoryDragEnd);
document.addEventListener('pointerdown', event => {
  if ($('#navMenu')?.classList.contains('open') && !event.target.closest('.nav-menu')) {
    setNavMenuOpen(false);
  }
}, true);
document.addEventListener('click', event => {
  const tooltipMove = event.target.closest('[data-tooltip-move]');
  if (tooltipMove) {
    event.preventDefault();
    event.stopPropagation();
    try {
      handleTooltipMove(tooltipMove);
    } catch (err) {
      setInventoryMoveHint(err.message || 'Could not select the inventory item.', { error: true });
    }
    return;
  }

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

  const uuidTarget = event.target.closest('[data-copy-uuid]');
  if (uuidTarget) {
    event.preventDefault();
    event.stopPropagation();
    copyUuid(uuidTarget).catch(err => showCopyToast(err.message || 'Could not copy UUID'));
    return;
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
    const suppressed = state.chatPlayerClickSuppression;
    if (
      suppressed
      && player.closest('#chatList')
      && suppressed.username === player.dataset.player
      && suppressed.until >= Date.now()
    ) {
      state.chatPlayerClickSuppression = null;
      return;
    }
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
  }

});
document.addEventListener('error', event => {
  const accountImage = event.target.closest?.('.account-avatar img');
  if (accountImage) {
    accountImage.closest('.account-avatar')?.classList.add('avatar-image-failed');
    accountImage.remove();
    return;
  }
  const minecraftMobImage = event.target.closest?.('[data-minecraft-mob-icon]');
  if (minecraftMobImage) {
    const fallbackSrc = minecraftMobImage.dataset.fallbackSrc;
    minecraftMobImage.removeAttribute('data-fallback-src');
    if (fallbackSrc) minecraftMobImage.src = fallbackSrc;
    else minecraftMobImage.remove();
    return;
  }
  const image = event.target.closest?.('[data-item-icon-image]');
  if (!image) return;
  image.closest('.item-icon')?.classList.add('fallback');
  image.remove();
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#playerSignsOverlay')?.hidden) {
    closePlayerSigns();
    return;
  }
  if (event.key === 'Escape' && !$('#playerSkinsOverlay')?.hidden) {
    closePlayerSkins();
    return;
  }
  if (event.key === 'Escape' && !$('#adminPlayerDeleteModal')?.hidden) {
    closeAdminPlayerDelete();
    return;
  }
  if (event.key === 'Escape' && !$('#adminPlayerEditModal')?.hidden) {
    closeAdminPlayerEdit();
    return;
  }
  if (event.key === 'Escape' && $('#accountSwitcher')?.classList.contains('expanded')) {
    setMobileAccountSwitcherOpen(false);
    return;
  }
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

  const uuidTarget = event.target.closest?.('[data-copy-uuid]');
  if (uuidTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    copyUuid(uuidTarget).catch(err => showCopyToast(err.message || 'Could not copy UUID'));
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

  if (event.key === 'Escape' && $('#navMenu')?.classList.contains('open')) {
    setNavMenuOpen(false);
  }
});
$('#playerProfileClose').addEventListener('click', closePlayerProfile);
$('#playerProfileOverlay').addEventListener('click', event => {
  if (event.target.id === 'playerProfileOverlay') closePlayerProfile();
});
$('#playerSkinsClose').addEventListener('click', closePlayerSkins);
$('#playerSignsClose').addEventListener('click', closePlayerSigns);
$('#playerSignsContent').addEventListener('click', handlePlayerSignsClick);
$('#playerSignsOverlay').addEventListener('click', event => {
  if (event.target.id === 'playerSignsOverlay') closePlayerSigns();
});
$('#playerSkinsOverlay').addEventListener('click', event => {
  if (event.target.id === 'playerSkinsOverlay') closePlayerSkins();
});

setupAreaExplorer();
updateNavLabel('chat');
initializeDashboardBrandVisibility();
initLoopingCarousels();
initAuth();
