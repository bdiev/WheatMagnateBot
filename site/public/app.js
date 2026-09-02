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
    unwhitelistedHourly: []
  },
  chartMeta: {},
  rollingNumbers: {},
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
  chartHover: {},
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
  whisperAccentCache: new Map(),
  playtimeLeaderboardScope: 'global',
  playtimeLeaderboards: { global: [], whitelisted: [] },
  newPlayers: [],
  newPlayersInitialized: false,
  newPlayersLoading: false,
  newPlayersHasMore: false,
  newPlayersNextOffset: 0,
  newPlayersAccountId: null,
  whisperSearchPlayers: [],
  playerProfileUsername: null,
  playerProfileSignature: '',
  chatContextMessageId: null,
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
  adminPlayersRequestId: 0,
  adminPlayersSort: 'playtime',
  adminPlayersDirection: 'asc',
  adminPlayersLimit: 6,
  adminPlayersOffset: 0,
  adminPlayersNextOffset: 0,
  adminPlayersHasMore: false,
  adminPlayerSearchTimer: null,
  adminPlayerEditTarget: null,
  adminPlayerDeleteTarget: null,
  requestCountLoading: false,
  adminLogsLoading: false,
  childAiLoading: false,
  childAiPlayerStyles: [],
  childAiStyleVisibleLimit: 40,
  childAiStyleRenderFrame: null,
  childAiImportState: null,
  timelineLoading: false,
  timelineSelectedEventId: null,
  timelineIncident: null,
  adminOpenLogDetails: new Set(),
  notificationRules: [],
  pushSettings: null,
  currentPushSubscriptionId: null,
  navigationPreferences: null,
  navigationSettingsLoading: null,
  navigationSavePromise: Promise.resolve(),
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
    unwhitelistedHourlyChart: 'hours'
  },
  chartScrollInitialized: {},
  chatDateIndicatorFrame: null,
  chatDateIndicatorShowPending: false,
  chatDateIndicatorHideTimer: null,
  chatDateIndicatorHiddenTimer: null,
  renderSignatures: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const CHAT_HISTORY_LIMIT = 500;
const CHILD_AI_MOBILE_STYLE_BATCH = 40;
const NEW_PLAYERS_PAGE_SIZE = 24;
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
  settings: ['Settings', 'Timezone, security and navigation'],
  notifications: ['Notifications', 'Alerts and notification rules'],
  timeline: ['Incident Timeline', 'Operational event investigation'],
  'child-ai': ['Child AI', 'Learning and memory administration'],
  admin: ['Admin', 'Administrative controls']
});
const NAV_DEFAULT_ORDER = Object.freeze(['chat', 'bot', 'kill-aura', 'obsidian', 'server', 'players', 'settings', 'notifications', 'timeline', 'child-ai', 'admin']);
let dashboardBrandLastScrollY = Math.max(0, window.scrollY);
let dashboardBrandScrollFrame = null;

function updateDashboardBrandVisibility() {
  dashboardBrandScrollFrame = null;
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
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: state.accountTimezone
  }).format(date);
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

function playerHeadUrl(username, size = 32, { uuid = null } = {}) {
  const safeUsername = encodeURIComponent(String(username || 'Steve').trim() || 'Steve');
  const compactUuid = String(uuid || '').replaceAll('-', '').trim().toLowerCase();
  const uuidQuery = /^[0-9a-f]{32}$/.test(compactUuid) ? `&uuid=${encodeURIComponent(compactUuid)}` : '';
  return `/api/minecraft-avatar?username=${safeUsername}${uuidQuery}&v=2`;
}

function playerProfileAccentKey(profile) {
  const uuid = String(profile?.uuid || '').replaceAll('-', '').trim().toLowerCase();
  return uuid || String(profile?.username || '').trim().toLowerCase();
}

const PLAYER_ACCENT_PROPERTY_NAMES = [
    '--player-accent-light',
    '--player-accent-light-strong',
    '--player-accent-light-contrast',
    '--player-accent-dark',
    '--player-accent-dark-strong',
    '--player-accent-dark-contrast'
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
      <img class="player-head" src="${playerHeadUrl(username, size, { uuid })}" alt="" loading="${loading === 'lazy' ? 'lazy' : 'eager'}" decoding="async" width="${size}" height="${size}">
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

function minecraftIconUrl(type, value) {
  const iconKey = normalizeItemIconKey(value);
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
    const message = Array.from(list.querySelectorAll('.chat-message[data-created-at]'))
      .find(item => item.offsetTop + item.offsetHeight >= visibleTop);
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
  const allowed = new Set(['chat','bot','kill-aura','obsidian','admin']);
  $$('.tab-button[data-tab]').forEach(button => button.classList.toggle('account-tab-restricted',restricted && !allowed.has(button.dataset.tab)));
  const childTab = $('.tab-button[data-tab="child-ai"]');
  if (childTab) childTab.hidden = restricted || state.currentUser?.role !== 'admin';
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
  if (!isAdmin && ['admin', 'notifications', 'timeline', 'child-ai'].includes(state.activeTab)) setActiveTab('chat');
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
  if (activeButton && label) label.textContent = activeButton.textContent.trim();
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
    const localVisibility = loadNavigationVisibility();
    const localOrder = loadNavigationOrder();
    let payload = await fetchJson('/api/settings/navigation');
    const hasLocalSettings = localStorage.getItem(navigationVisibilityStorageKey()) !== null || localStorage.getItem(navigationOrderStorageKey()) !== null;
    if (migrateLocal && !payload.exists && hasLocalSettings) {
      payload = await putJson('/api/settings/navigation', { visibility: localVisibility, order: localOrder });
    }
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
  setActiveTab(['admin', 'notifications', 'timeline', 'child-ai'].includes(tab) && state.currentUser?.role !== 'admin' ? 'chat' : tab);
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
  if (['admin', 'notifications', 'timeline', 'child-ai'].includes(tab) && state.currentUser?.role !== 'admin') return;
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
    loadAdminControlState();
    loadAdminSystemLogs();
  }
  if (tab === 'timeline') loadTimeline();
  if (tab === 'notifications') loadNotifications();
  if (tab === 'settings') {
    renderNavigationSettings();
    if ($('.settings-tab.active')?.dataset.settingsView !== 'navigation') loadPushSettings();
  }
  if (tab === 'child-ai') loadChildAiAdmin();
  if (tab === 'kill-aura') loadKillAura();
  if (tab === 'chat') ensureInitialChatScroll();
  if (tab === 'players') {
    resetPlaytimeLeaderboardScroll($('#playtimeLeaderboard'), state.playtimeLeaderboardScope);
  }
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
  const requestedWidth = (Array.isArray(data) ? data.length : 0) * pointWidth + 92;
  const cssWidth = Math.min(safeCanvasWidth, Math.max(minWidth || 320, requestedWidth));
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
  drawChartById(chartId);
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
  const padding = { top: 24, right: 52, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = visibleChartValues(canvas, chartData, padding, chartWidth, 'bar');
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
    const segments = options.stacked && Array.isArray(item.segments) ? item.segments : [];
    if (segments.length) {
      let segmentBottom = padding.top + chartHeight;
      segments.forEach(segment => {
        const segmentValue = Math.max(0, Number(segment.value) || 0);
        if (!segmentValue) return;
        const segmentHeight = (segmentValue / maxValue) * chartHeight;
        segmentBottom -= segmentHeight;
        ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(String(segment.color || '')) ? segment.color : accent;
        ctx.fillRect(x, segmentBottom, barWidth, Math.max(1, segmentHeight));
      });
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
      highlight: { x, y, width: barWidth, height: barHeight },
      label: item.label,
      value,
      tooltip: options.tooltip ? options.tooltip(item) : `${item.label}: ${formatNumber(value)}`
    });
  });
  clusteredChartAnnotations(options.annotations, chartData, padding.left, chartWidth).forEach(cluster => {
    const x = Math.max(padding.left + 3, Math.min(padding.left + chartWidth - 3, cluster.x));
    ctx.save(); ctx.strokeStyle = annotationColor(cluster.annotation); ctx.globalAlpha = 0.82; ctx.lineWidth = cluster.items.length > 1 ? 2.5 : 2; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + chartHeight); ctx.stroke(); ctx.restore();
    ctx.save();
    ctx.fillStyle = annotationColor(cluster.annotation);
    ctx.beginPath();
    ctx.arc(x, padding.top + 5, cluster.items.length > 1 ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  state.chartMeta[canvas.id] = { hitboxes };

  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
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
  const chartData = Array.isArray(data) ? data : [];
  const { ctx, width, height } = prepareChartCanvas(canvas, chartData, { pointWidth: options.pointWidth || 42 });

  const text = getCssColor('--text');
  const muted = getCssColor('--muted');
  const line = getCssColor('--line');
  const accent = getCssColor('--accent');
  const panelSoft = getCssColor('--panel-soft');
  const padding = { top: 24, right: 52, bottom: 44, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
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
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: state.accountTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function localizedChartItem(item) {
  const bucket = item?.bucket;
  if (!bucket) return item;
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return item;
  const parts = chartDateParts(date);
  return { ...item, label: `${parts.month}-${parts.day} ${parts.hour}:00` };
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
    if (!groups.has(key)) groups.set(key, { label, values: [], segments: new Map() });
    const value = Number(item.value);
    if (Number.isFinite(value)) groups.get(key).values.push(value);
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
    value: reducer === 'avg'
      ? group.values.reduce((sum, value) => sum + value, 0) / Math.max(1, group.values.length)
      : group.values.reduce((sum, value) => sum + value, 0),
    segments: Array.from(group.segments.values())
  }));
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

const CHART_TAB_BY_ID = Object.freeze({
  chatHourlyChart: 'chat',
  killAuraKillsChart: 'kill-aura',
  obsidianDailyChart: 'obsidian',
  tpsHourlyChart: 'server',
  unwhitelistedHourlyChart: 'players'
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
    case 'tpsHourlyChart':
      drawLineChart($('#tpsHourlyChart'), aggregateSeries(state.charts.tpsHourly, range, 'avg'), {
        max: 20,
        pointWidth: range === 'hours' ? 48 : 42,
        axisLabel: item => range === 'hours' ? String(item.label || '').slice(-5) : item.label,
        tooltip: item => `${item.label}: ${formatTps(item.value)} TPS`
      });
      break;
    case 'unwhitelistedHourlyChart':
      drawBarChart($('#unwhitelistedHourlyChart'), aggregateSeries(state.charts.unwhitelistedHourly, range), {
        tooltip: item => `${item.label}: ${formatNumber(item.value)} players`
      });
      break;
    default:
      break;
  }
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
  const geometry = `${hit.index}:${box.x}:${box.y}:${box.width}:${box.height}`;
  if (highlight.dataset.geometry !== geometry) {
    highlight.style.width = `${Math.max(1, box.width)}px`;
    highlight.style.height = `${Math.max(1, box.height)}px`;
    highlight.style.transform = `translate3d(${canvas.offsetLeft + box.x}px, ${canvas.offsetTop + box.y}px, 0)`;
    highlight.dataset.geometry = geometry;
  }
  highlight.hidden = false;
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
  }
  setChartHoverHighlight(canvas, hit);

  if (!hit) {
    canvas.style.cursor = '';
    if (!state.chartTooltipPinned) tooltip.hidden = true;
    return;
  }

  canvas.style.cursor = Number.isInteger(hit.index) ? 'pointer' : '';
  const tooltipChanged = tooltip.textContent !== hit.tooltip;
  if (tooltipChanged) tooltip.textContent = hit.tooltip;
  tooltip.hidden = false;
  clearTimeout(state.chartTooltipTimer);
  state.chartTooltipPinned = Boolean(pin || event.pointerType === 'touch');
  let tooltipWidth = Number(tooltip.dataset.measuredWidth);
  if (tooltipChanged || !Number.isFinite(tooltipWidth)) {
    tooltipWidth = Math.max(160, tooltip.offsetWidth || 0);
    tooltip.dataset.measuredWidth = String(tooltipWidth);
  }
  const left = Math.min(window.innerWidth - tooltipWidth - 10, event.clientX + 12);
  const top = Math.min(window.innerHeight - 46, event.clientY + 12);
  tooltip.style.transform = `translate3d(${Math.max(10, left)}px, ${Math.max(10, top)}px, 0)`;
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
      <div class="player-profile-session-list${gameSessions.length > 3 ? ' is-scrollable' : ''}"${gameSessions.length > 3 ? ' tabindex="0" aria-label="Game sessions, newest first"' : ''}>
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
      <span class="player-profile-avatar-wrap" data-status="${profile.isOnline ? 'online' : 'offline'}" aria-label="${profile.isOnline ? 'Online' : 'Offline'}">
        <img class="player-profile-avatar" src="${playerHeadUrl(profile.username, 96, { uuid: profile.uuid })}" alt="" loading="lazy">
      </span>
      <div>
        <div class="player-profile-identity">
          <h2 id="playerProfileName">${escapeHtml(profile.username)}</h2>
          <div class="player-profile-badges">
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
      <div><span>Nearby Seen</span><strong>${nearby?.lastSeen ? formatDate(nearby.lastSeen) : '-'}</strong></div>
    </section>
    ${gameSessionsSection}
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
    profile.nearby?.lastSeen,
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
  const clocks = document.querySelectorAll('[data-current-session-start]');
  const relativeTimes = document.querySelectorAll('[data-profile-relative-time]');
  if (overlay?.hidden || (!clocks.length && !relativeTimes.length)) {
    stopPlayerProfileSessionClock();
    return;
  }
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

function replacePlayerProfileContent(profile, { animate = false } = {}) {
  const content = $('#playerProfileContent');
  if (!content) return;
  clearTimeout(state.playerProfileRevealTimer);
  state.playerProfileRevealTimer = null;
  content.classList.remove('is-loading', 'profile-data-enter');
  content.innerHTML = renderPlayerProfile(profile);
  applyPlayerProfileAccent(profile);
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

async function openPlayerProfile(username) {
  clearPlayerProfileRefreshTimers();
  setPlayerProfileAccent();
  state.playerProfileSignature = '';
  state.playerProfileRegistrationDateMode = false;
  state.playerProfileLastSeenDateMode = false;
  state.playerProfileLastPayload = null;
  await loadPlayerProfile(username, { showLoading: true });
}

function closePlayerProfile() {
  const overlay = $('#playerProfileOverlay');
  if (!overlay) return;
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
}

async function handlePlayerProfileClick(event) {
  if (event.target.closest('.chat-link')) return;
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
  const startedAt = new Date(player.onlineSince || player.lastOnline || 0).getTime();
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
  if (!state.seenPlayers.some(player => player.isOnline && (player.onlineSince || player.lastOnline))) return;
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
      ${playerIdentity(player.username, 24, { status: player.isOnline ? 'online' : 'offline' })}
      <span class="muted"${player.isOnline && (player.onlineSince || player.lastOnline) ? ` data-seen-online-since="${escapeHtml(player.onlineSince || player.lastOnline)}"` : ''}>${escapeHtml(seenPlayerStatusText(player))}</span>
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

function renderChatMessages(messages, { scrollMode = 'preserve' } = {}) {
  const list = $('#chatList');
  if (!list) return;
  const safeMessages = Array.isArray(messages) ? messages.filter(message => message?.id != null) : [];
  const listSignature = stableSignature([
    state.chatSearchQuery,
    ...safeMessages.map(message => [
      message.id,
      message.type,
      message.username,
      message.playerUuid,
      message.message,
      message.messageCount,
      message.event,
      message.isBot,
      message.isNewPlayer,
      message.createdAt
    ])
  ]);

  if (!safeMessages.length) {
    if (state.renderSignatures['#chatList'] === listSignature) return;
    if (list.dataset.empty !== 'true') {
      list.innerHTML = state.chatSearchQuery
        ? `<div class="empty">No archived messages contain “${escapeHtml(state.chatSearchQuery)}”.</div>`
        : '<div class="empty">No chat messages yet. New messages will appear after the bot records them.</div>';
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
  const previousScrollHeight = list.scrollHeight;
  const previousIds = state.chatMessageIds;
  const fragment = document.createDocumentFragment();

  let previousChatUsername = null;
  safeMessages.forEach(message => {
    const id = String(message.id);
    const isActivity = message.type === 'activity';
    const isFloodNotice = message.type === 'flood';
    const isServerNotice = message.type === 'server';
    const isNotice = isFloodNotice || isServerNotice;
    const isBot = Boolean(message.isBot);
    const isNewPlayer = Boolean(message.isNewPlayer);
    const isNew = state.chatInitialized && !previousIds.has(id);
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
           <button class="chat-activity-player" type="button" data-player="${escapeHtml(username)}" title="Open player profile">${escapeHtml(username)}</button>
           ${isBot ? '<span class="chat-bot-badge">BOT</span>' : ''}
           ${isNewPlayer ? '<span class="chat-new-player-badge">New Player</span>' : ''}
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
             ${isNewPlayer ? '<span class="chat-new-player-badge">New Player</span>' : ''}
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
    fragment.append(article);
    previousChatUsername = isActivity || isNotice ? null : normalizedUsername;
  });

  delete list.dataset.empty;
  list.replaceChildren(fragment);

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
  const messages = mode === 'prepend'
    ? mergeChatMessagePages(incomingMessages, state.chatMessages)
    : mode === 'mergeLatest'
      ? mergeChatMessagePages(state.chatMessages, incomingMessages)
      : incomingMessages;
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
  if (payload.hourly || payload.daily || payload.monthly) redrawCharts();
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
    ? `${formatMobLabel(targetLabel)}${target.distance == null ? '' : ` В· ${target.distance} blocks`}`
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

function renderPlaytimeLeaderboard({ resetScroll = false, force = false } = {}) {
  const scope = state.playtimeLeaderboardScope === 'whitelisted' ? 'whitelisted' : 'global';
  const leaderboard = state.playtimeLeaderboards[scope] || [];
  const list = $('#playtimeLeaderboard');

  updatePlaytimeLeaderboardScopeControls(scope);
  if (list?.classList.contains('is-leaving') && !force) return;

  const description = $('#playtimeLeaderboardDescription');
  if (description) {
    description.textContent = scope === 'global'
      ? 'Top 100 server-wide playtime totals.'
      : 'Playtime totals for players in the whitelist database.';
  }

  const isFirstRender = Boolean(list && list.dataset.leaderboardRendered !== 'true');
  const didRender = renderStable('#playtimeLeaderboard', leaderboard.length
    ? leaderboard.map((player, index) => `
      <div class="rank-item leaderboard-item">
        <span class="rank-index">${index + 1}</span>
        <span class="leaderboard-player">
          ${playerIdentity(player.username, 28, { status: player.isOnline ? 'online' : 'offline' })}
        </span>
        <strong>${escapeHtml(player.playtime)}</strong>
      </div>
    `).join('')
    : `<div class="empty">No ${scope === 'global' ? 'global' : 'whitelist'} playtime data found.</div>`,
    [scope, ...leaderboard.map(player => [player.username, player.isOnline, player.playtime])]
  );

  if (didRender && list) list.dataset.leaderboardRendered = 'true';
  if (resetScroll || (didRender && isFirstRender)) {
    resetPlaytimeLeaderboardScroll(list, scope);
  }
}

function setPlaytimeLeaderboardScope(scope) {
  const nextScope = scope === 'whitelisted' ? 'whitelisted' : 'global';
  if (state.playtimeLeaderboardScope === nextScope) return;
  state.playtimeLeaderboardScope = nextScope;
  updatePlaytimeLeaderboardScopeControls(nextScope, { animateButton: true });

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
  if (!list) return false;
  const players = state.newPlayers;
  const status = state.newPlayersLoading
    ? '<div class="new-players-load-status" role="status"><span>Loading more profiles&hellip;</span></div>'
    : state.newPlayersHasMore
      ? '<div class="new-players-load-status"><button class="ghost-button" type="button" data-new-players-more>Load more</button></div>'
      : '';
  const signature = stableSignature({
    players: players.map(player => [
      player.username,
      player.uuid,
      player.firstSeen,
      player.isOnline,
      player.isWhitelisted
    ]),
    loading: state.newPlayersLoading,
    hasMore: state.newPlayersHasMore
  });
  if (state.renderSignatures['#newPlayersList'] === signature) return false;

  const scrollTop = resetScroll ? 0 : list.scrollTop;
  if (state.newPlayersLoading) list.setAttribute('aria-busy', 'true');
  else list.removeAttribute('aria-busy');
  list.innerHTML = players.length
    ? `${players.map(newPlayerRow).join('')}${status}`
    : state.newPlayersLoading
      ? status
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
    state.newPlayersAccountId = accountId;
    delete state.renderSignatures['#newPlayersList'];
  }

  const wasInitialized = state.newPlayersInitialized;
  const hadLoadedEverything = wasInitialized && !state.newPlayersHasMore;
  const existingKeys = new Set(state.newPlayers.map(newPlayerIdentityKey));
  const firstPageOverlapsExisting = firstPage.some(player => existingKeys.has(newPlayerIdentityKey(player)));
  const firstKeys = new Set(firstPage.map(newPlayerIdentityKey));
  state.newPlayers = [
    ...firstPage,
    ...state.newPlayers.filter(player => !firstKeys.has(newPlayerIdentityKey(player)))
  ];
  state.newPlayersInitialized = true;
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

function renderPlayerStats(payload = {}, nearbyPlayers = []) {
  $('#onlinePlayers').textContent = formatNumber(payload.players?.online);
  $('#totalPlayers').textContent = `of ${formatNumber(payload.players?.total)} whitelisted`;
  $('#onlineUnwhitelistedPlayers').textContent = formatNumber(payload.players?.onlineUnwhitelisted);
  $('#seen24h').textContent = formatNumber(payload.players?.seen24h);
  $('#seen7d').textContent = formatNumber(payload.players?.seen7d);
  state.charts.unwhitelistedHourly = payload.hourlyUnwhitelisted || [];

  const leaderboardSources = payload.playtimeLeaderboards || {};
  state.playtimeLeaderboards = {
    global: Array.isArray(leaderboardSources.global) ? leaderboardSources.global.slice(0, 100) : [],
    whitelisted: Array.isArray(leaderboardSources.whitelisted)
      ? leaderboardSources.whitelisted
      : Array.isArray(payload.playtimeLeaderboard) ? payload.playtimeLeaderboard : []
  };
  renderPlaytimeLeaderboard();

  renderNearbySightings(nearbyPlayers);

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
}

function renderNearbySightings(nearbyPlayers = []) {
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
  setRollingNumber('#obsidianTotal', farm.totalMined);
  setRollingNumber('#obsidianToday', farm.todayMined);
  $('#obsidianTodayTimezone').textContent = `${payload.settings?.timezone || 'Europe/Vilnius'} calendar day`;
  setRollingNumber('#sessionRate', farm.sessionPerHour, { suffix: '/h' });
  setRollingNumber('#pickaxeAverage', farm.blocksPerPickaxe);
  setRollingNumber('#retiredPickaxes', farm.retiredPickaxes, { prefix: 'retired pickaxes: ' });

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

  $('#farmDetails').innerHTML = `
    <div><span>Last 7 days</span><strong id="farmLast7Days">- blocks</strong></div>
    <div><span>Retired pickaxe blocks</span><strong id="farmRetiredPickaxeBlocks">-</strong></div>
    <div><span>Barrel last opened</span><strong>${formatDate(payload.supplies?.observedAt)}</strong></div>
    <div><span>Refill around</span><strong>${escapeHtml(estimateSupplyRefill(payload))}</strong></div>
  `;
  setRollingNumber('#farmLast7Days', farm.last7Days, { suffix: ' blocks' });
  setRollingNumber('#farmRetiredPickaxeBlocks', farm.retiredPickaxeBlocks);

  renderSupplies('#inventorySupplies', payload.supplies?.inventory);
  renderSupplies('#barrelSupplies', payload.supplies?.barrel, payload.supplies?.barrelError);
  state.charts.obsidianHourly = payload.hourly || [];
  state.charts.obsidianDaily = payload.daily || [];
  state.charts.obsidianAccounts = chartAccounts;
  state.charts.obsidianAnnotations = payload.annotations || [];
  redrawCharts();
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
  const payload = await fetchJson(`/api/chat?around=${encodeURIComponent(messageId)}&limit=200`);
  state.chatSearchQuery = '';
  state.chatContextMessageId = String(messageId);
  setChatArchiveStatus('');
  closePlayerProfile();
  setActiveTab('chat');
  renderChat(payload);
  const returnButton = $('#chatReturnLive');
  if (returnButton) returnButton.hidden = false;
  requestAnimationFrame(() => {
    const target = $(`#chatList [data-message-id="${CSS.escape(String(messageId))}"]`);
    target?.classList.add('chat-context-target');
    target?.scrollIntoView({ block: 'center' });
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

function renderAdminPlayerInfoCollection(progress) {
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

function adminPlayerByIdentity(identityKey) {
  return state.adminPlayers.find(player => String(player.identityKey) === String(identityKey)) || null;
}

function renderAdminPlayers(players = state.adminPlayers, { append = false } = {}) {
  const list = $('#adminPlayersList');
  if (!list) return;
  if (!players.length) {
    if (!append) list.innerHTML = '<div class="empty">No tracked Minecraft players found.</div>';
    return;
  }
  const markup = players.map(player => {
    const identityKey = escapeHtml(player.identityKey);
    const username = escapeHtml(player.username);
    const uuid = player.uuid ? escapeHtml(player.uuid) : '';
    const tags = Array.isArray(player.tags) ? player.tags : [];
    return `
      <article class="admin-player-card" data-admin-player-key="${identityKey}">
        <button class="admin-player-avatar-button" type="button" data-admin-player-action="view" data-player-key="${identityKey}" aria-label="Open ${username} profile">
          <img class="admin-player-avatar" src="${accountHeadUrl(player.username, player.uuid)}" alt="" loading="lazy" decoding="async">
        </button>
        <div class="admin-player-card-main">
          <div class="admin-player-card-title"><button class="admin-player-name-button" type="button" data-admin-player-action="view" data-player-key="${identityKey}">${username}</button><span class="pill ${player.isOnline ? 'online' : ''}">${player.isOnline ? 'online' : 'offline'}</span></div>
          ${uuid
            ? `<code class="uuid-copy" role="button" tabindex="0" data-copy-uuid="${uuid}" title="Copy UUID" aria-label="Copy UUID ${uuid}">${uuid}</code>`
            : `<code title="Legacy profile ID ${escapeHtml(player.id)}">Legacy ID ${escapeHtml(player.id)}</code>`}
          <div class="admin-player-card-tags">${tags.length ? tags.map(tag => `<span class="admin-player-tag">${escapeHtml(tag)}</span>`).join('') : '<span class="muted">No tags</span>'}</div>
        </div>
        <dl class="admin-player-card-stats">
          <div><dt>First seen</dt><dd>${player.firstSeen ? formatDate(player.firstSeen) : 'Unknown'}</dd></div>
          <div><dt>Last seen</dt><dd>${player.lastSeen ? formatRecentDate(player.lastSeen) : 'Never'}</dd></div>
          <div><dt>Playtime</dt><dd>${escapeHtml(player.playtime || '0m')}</dd></div>
          <div><dt>Messages</dt><dd>${formatNumber(player.totalMessages)}</dd></div>
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
  }).join('');
  if (append) list.insertAdjacentHTML('beforeend', markup);
  else list.innerHTML = markup;

  list.querySelectorAll('.admin-player-card-menu:not([data-menu-bound])').forEach(menu => {
    menu.dataset.menuBound = 'true';
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
  const loadingMore = state.adminPlayersLoading && state.adminPlayers.length > 0;
  status.hidden = !loadingMore && !state.adminPlayersHasMore;
  status.textContent = loadingMore ? 'Loading more players…' : 'Scroll to load more';
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
  if (append && state.adminPlayersLoading) return;
  const list = $('#adminPlayersList');
  const scroller = $('#adminPlayersScroller');
  const refresh = $('#adminPlayersRefresh');
  const previousScrollTop = scroller?.scrollTop || 0;
  const previousPlayers = preserveScroll && !append ? [...state.adminPlayers] : [];
  const requestId = ++state.adminPlayersRequestId;
  state.adminPlayersLoading = true;
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
    if (!append && Number(offset) === 0 && !query.trim()) {
      params.set('includeInfoCollection', 'true');
    }
    if (preserveScroll && !append) {
      params.set('limit', String(Math.min(24, Math.max(state.adminPlayersLimit, previousPlayers.length))));
    }
    const payload = await fetchJson(`/api/admin/players?${params}`);
    if (requestId !== state.adminPlayersRequestId) return;
    state.adminPlayersSort = payload.sort || state.adminPlayersSort;
    state.adminPlayersDirection = payload.direction || state.adminPlayersDirection;
    if (!preserveScroll) state.adminPlayersLimit = Number(payload.limit) || state.adminPlayersLimit;
    state.adminPlayersOffset = Number(payload.offset) || 0;
    state.adminPlayersHasMore = Boolean(payload.hasMore);
    renderAdminPlayerInfoCollection(payload.infoCollection);
    if (append) {
      const knownKeys = new Set(state.adminPlayers.map(player => String(player.identityKey)));
      const additions = (payload.players || []).filter(player => !knownKeys.has(String(player.identityKey)));
      state.adminPlayers.push(...additions);
      renderAdminPlayers(additions, { append: true });
    } else if (preserveScroll) {
      const refreshedPlayers = payload.players || [];
      const refreshedKeys = new Set(refreshedPlayers.map(player => String(player.identityKey)));
      state.adminPlayers = [
        ...refreshedPlayers,
        ...previousPlayers.filter(player => !refreshedKeys.has(String(player.identityKey)))
      ];
      renderAdminPlayers();
      if (scroller) {
        scroller.scrollTop = previousScrollTop;
        requestAnimationFrame(() => {
          if (requestId === state.adminPlayersRequestId) scroller.scrollTop = previousScrollTop;
        });
      }
    } else {
      state.adminPlayers = payload.players || [];
      renderAdminPlayers();
      if (scroller) scroller.scrollTop = 0;
    }
    state.adminPlayersNextOffset = preserveScroll && !append
      ? state.adminPlayers.length
      : state.adminPlayersOffset + (payload.players || []).length;
    updateAdminPlayersScrollStatus();
  } catch (err) {
    if (requestId !== state.adminPlayersRequestId) return;
    if (!append && list) list.innerHTML = `<div class="empty">Could not load players: ${escapeHtml(err.message)}</div>`;
    setAdminPlayersNotice(`Could not load players: ${err.message}`, 'error');
  } finally {
    if (requestId === state.adminPlayersRequestId) {
      state.adminPlayersLoading = false;
      if (refresh) refresh.disabled = false;
      updateAdminPlayersScrollStatus();
      requestAnimationFrame(maybeLoadMoreAdminPlayers);
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
    $('#adminPlayerPearlHatchX').value = state.adminPlayerEditTarget.pearlHatch?.x ?? '';
    $('#adminPlayerPearlHatchY').value = state.adminPlayerEditTarget.pearlHatch?.y ?? '';
    $('#adminPlayerPearlHatchZ').value = state.adminPlayerEditTarget.pearlHatch?.z ?? '';
  } catch (err) {
    error.textContent = `Could not refresh player details: ${err.message}`;
    error.hidden = false;
  }
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
    list.innerHTML = '<div class="empty">No system log entries yet.</div>';
    state.adminOpenLogDetails.clear();
    state.renderSignatures['#adminSystemLogs'] = renderSignature;
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
  }).join('');
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
  if (state.adminLogsLoading) return;
  const list = $('#adminSystemLogs');
  if (hasActiveTextSelectionWithin(list)) {
    queueRealtimeRefresh('admin-log-selection', loadAdminSystemLogs, 750);
    return;
  }
  const level = $('#adminLogLevel')?.value || 'all';
  state.adminLogsLoading = true;
  try {
    if (list && !list.children.length) list.innerHTML = '<div class="empty">Loading system log...</div>';
    const payload = await fetchJson(`/api/admin/system-logs?limit=160&level=${encodeURIComponent(level)}`);
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
    await Promise.all([loadAll(), loadAdminControlState({ force: true })]);
    await loadAdminSystemLogs();
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

function timelineFilterQuery() {
  const params = new URLSearchParams({ period: $('#timelinePeriod')?.value || '24h', limit: '150' });
  const values = {
    severity: $('#timelineSeverity')?.value, source: $('#timelineSource')?.value,
    eventType: $('#timelineEventType')?.value.trim(), player: $('#timelinePlayer')?.value.trim(),
    correlationId: $('#timelineCorrelation')?.value.trim()
  };
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params;
}

function timelineEventHtml(event, { compact = false, rootId = null } = {}) {
  const details = event.details && Object.keys(event.details).length
    ? `<details><summary>Details</summary><pre>${escapeHtml(JSON.stringify(event.details, null, 2))}</pre></details>` : '';
  return `<article class="timeline-event severity-${escapeHtml(event.severity)}${event.id === rootId ? ' root-event' : ''}">
    <div class="timeline-event-marker" aria-hidden="true"></div>
    <div class="timeline-event-body">
      <div class="timeline-event-head"><time>${escapeHtml(formatDate(event.occurredAt))}</time><span class="pill">${escapeHtml(event.severity)}</span><span class="pill">${escapeHtml(event.source)}</span></div>
      <strong>${escapeHtml(event.title)}</strong>
      <small>${escapeHtml(event.eventType)}${event.actor ? ` · ${escapeHtml(event.actor)}` : ''}</small>
      <button class="timeline-correlation" type="button" data-timeline-correlation="${escapeHtml(event.correlationId)}">${escapeHtml(event.correlationId)}</button>
      ${compact ? '' : details}
      ${compact ? '' : `<button class="ghost-button timeline-open" type="button" data-timeline-event="${escapeHtml(event.id)}">Inspect event</button>`}
    </div>
  </article>`;
}

function renderTimeline(events = [], filters = {}) {
  const list = $('#timelineEvents');
  if (!list) return;
  $('#timelineSummary').textContent = `${events.length} events · ${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  list.innerHTML = events.length ? events.map(event => timelineEventHtml(event)).join('') : '<div class="empty">No operational events match these filters.</div>';
}

async function loadIncidents() {
  if (state.currentUser?.role !== 'admin') return;
  const payload = await fetchJson('/api/admin/incidents');
  const list = $('#incidentList');
  if (!list) return;
  list.innerHTML = payload.incidents?.length ? payload.incidents.map(incident => `<button type="button" class="incident-row" data-incident-id="${escapeHtml(incident.id)}">
    <span><strong>#${escapeHtml(incident.id)} ${escapeHtml(incident.title)}</strong><small>${escapeHtml(incident.correlationId)}</small></span>
    <span class="pill">${escapeHtml(incident.status)}</span><span>${escapeHtml(incident.assignedAdmin || 'Unassigned')}</span><time>${escapeHtml(formatDate(incident.updatedAt))}</time>
  </button>`).join('') : '<div class="empty">No incidents created yet.</div>';
}

async function loadTimeline() {
  if (state.timelineLoading || state.currentUser?.role !== 'admin') return;
  state.timelineLoading = true;
  try {
    const payload = await fetchJson(`/api/admin/operational-events?${timelineFilterQuery()}`);
    renderTimeline(payload.events, payload.filters);
    await loadIncidents();
  } catch (err) { setBanner(`Incident timeline: ${err.message}`); }
  finally { state.timelineLoading = false; }
}

function incidentFormHtml(payload) {
  const incident = payload.incident;
  const options = (payload.admins || []).map(admin => `<option value="${escapeHtml(admin.id)}"${String(admin.id) === String(incident.assignedAdminId) ? ' selected' : ''}>${escapeHtml(admin.username)}</option>`).join('');
  return `<form id="incidentEditor" data-incident-id="${escapeHtml(incident.id)}" class="incident-editor">
    <div class="incident-title-row"><h3>Incident #${escapeHtml(incident.id)}</h3><span class="pill">${escapeHtml(incident.status)}</span></div>
    <label><span>Status</span><select name="status"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>
    <label><span>Assigned administrator</span><select name="assignedAdminId"><option value="">Unassigned</option>${options}</select></label>
    <label><span>Cause</span><textarea name="cause" rows="3">${escapeHtml(incident.cause)}</textarea></label>
    <label><span>Notes</span><textarea name="notes" rows="5">${escapeHtml(incident.notes)}</textarea></label>
    <label><span>Resolution</span><textarea name="resolution" rows="3">${escapeHtml(incident.resolution)}</textarea></label>
    <button type="submit">Save incident</button>
    <div class="incident-export"><a class="ghost-button link-button" href="/api/admin/incidents/${escapeHtml(incident.id)}/export?format=json">Export JSON</a><a class="ghost-button link-button" href="/api/admin/incidents/${escapeHtml(incident.id)}/export?format=markdown">Export Markdown</a></div>
  </form>`;
}

function renderTimelineContext(payload, { selectedId = null } = {}) {
  const context = $('#timelineContext');
  if (!context) return;
  const root = payload.event || payload.events?.find(event => event.operationalId === payload.incident?.rootEventId) || payload.events?.[0];
  const events = payload.window || payload.events || [];
  const related = payload.related || [];
  context.innerHTML = `<div class="timeline-context-head"><div><h3>${escapeHtml(root?.title || payload.incident?.title || 'Incident context')}</h3><p>10 minutes before and after the selected event.</p></div>
    ${payload.incident ? '' : `<button type="button" data-create-incident="${escapeHtml(root?.id || selectedId)}">Create incident</button>`}</div>
    ${payload.incident ? incidentFormHtml(payload) : ''}
    ${related.length ? `<details class="timeline-related"><summary>Related commands and notifications (${related.length})</summary>${related.map(event => timelineEventHtml(event, { compact: true })).join('')}</details>` : ''}
    <div class="timeline-window">${events.map(event => timelineEventHtml(event, { compact: true, rootId: root?.id })).join('')}</div>`;
  const status = context.querySelector('[name="status"]');
  if (status && payload.incident) status.value = payload.incident.status;
}

async function openTimelineEvent(eventId) {
  state.timelineSelectedEventId = eventId;
  const payload = await fetchJson(`/api/admin/operational-events/context?id=${encodeURIComponent(eventId)}`);
  renderTimelineContext(payload, { selectedId: eventId });
}

async function openIncident(id) {
  const payload = await fetchJson(`/api/admin/incidents/${encodeURIComponent(id)}`);
  state.timelineIncident = payload.incident;
  renderTimelineContext(payload);
}

async function handleTimelineClick(event) {
  const correlation = event.target.closest('[data-timeline-correlation]');
  if (correlation) {
    $('#timelineCorrelation').value = correlation.dataset.timelineCorrelation;
    await loadTimeline(); return;
  }
  const selected = event.target.closest('[data-timeline-event]');
  if (selected) { await openTimelineEvent(selected.dataset.timelineEvent); return; }
  const create = event.target.closest('[data-create-incident]');
  if (create) {
    const payload = await postJson('/api/admin/incidents', { eventId: create.dataset.createIncident });
    state.timelineIncident = payload.incident; renderTimelineContext(payload); await loadIncidents();
  }
}

async function saveIncident(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const payload = await putJson(`/api/admin/incidents/${form.dataset.incidentId}`, Object.fromEntries(data.entries()));
  state.timelineIncident = payload.incident; renderTimelineContext(payload); await loadIncidents();
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

async function refreshChatFromEvent() {
  if (state.chatContextMessageId || state.chatSearchQuery) return;
  if (state.liveChatLoading) return;
  state.liveChatLoading = true;
  try {
    renderLiveChat(await fetchJson(`/api/chat?limit=${CHAT_HISTORY_LIMIT}`));
    if (state.playerProfileUsername && !$('#playerProfileOverlay')?.hidden) {
      await loadPlayerProfile(state.playerProfileUsername);
    }
  } finally {
    state.liveChatLoading = false;
  }
}

async function checkChatVersion() {
  if (!state.currentUser || document.visibilityState === 'hidden' || state.liveChatLoading || state.chatContextMessageId || state.chatSearchQuery) return;
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

async function refreshLiveDashboard() {
  if (!state.currentUser || state.liveDashboardLoading || document.visibilityState === 'hidden') return;
  const accountId = state.activeAccountId;
  state.liveDashboardLoading = true;
  try {
    if (Date.now() - state.accountsRefreshedAt >= 5_000) loadAccounts().catch(() => {});
    const payload = await fetchJson('/api/live-dashboard');
    if (accountId !== state.activeAccountId) return;
    renderBotStats({ bot: payload.bot, observedAt: payload.observedAt });
    renderNearbySightings(payload.nearby || []);
    renderSupplies('#inventorySupplies', payload.supplies?.inventory);
    renderSupplies('#barrelSupplies', payload.supplies?.barrel, payload.supplies?.barrelError);
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
    if (state.currentUser?.role === 'admin' && state.activeTab === 'timeline') queueRealtimeRefresh('timeline-snapshots', loadTimeline, 500);
  }
  else if (type === 'farm_status_updated') queueRealtimeRefresh('farm', refreshFarmFromEvent);
  else if (type === 'player_joined' || type === 'player_left') {
    queueRealtimeRefresh('players', refreshPlayersFromEvent);
    queueRealtimeRefresh('chat-activity', refreshChatFromEvent, 30);
    if (state.playerProfileUsername && String(state.playerProfileUsername).toLowerCase() === String(eventPayload.username || '').toLowerCase()) {
      queueRealtimeRefresh('player-profile-activity', () => loadPlayerProfile(state.playerProfileUsername), 100);
    }
    if (state.currentUser?.role === 'admin' && state.activeTab === 'admin') {
      queueRealtimeRefresh('admin-players', () => loadAdminPlayers({ showLoading: false, preserveScroll: true }), 350);
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
      if (state.activeTab === 'admin') await loadAdminSystemLogs();
      if (state.activeTab === 'timeline') await loadTimeline();
      if (state.activeTab === 'child-ai') await loadChildAiAdmin();
    }, 300);
  } else if (type === 'operational_event_created' && state.currentUser?.role === 'admin' && state.activeTab === 'timeline') {
    queueRealtimeRefresh('incident-timeline', loadTimeline, 250);
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
    'bot_status_updated', 'player_joined', 'player_left', 'chat_message',
    'whisper_message', 'farm_status_updated', 'notification_created', 'admin_control_updated', 'operational_event_created',
    'navigation_settings_updated', 'account_settings_updated', 'resource_request_updated'
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
$('#adminPlayersRefresh')?.addEventListener('click', () => loadAdminPlayers());
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
$('#timelineRefresh')?.addEventListener('click', loadTimeline);
$('#timelineFilters')?.addEventListener('submit', event => { event.preventDefault(); loadTimeline(); });
$('#timelineEvents')?.addEventListener('click', event => handleTimelineClick(event).catch(err => setBanner(err.message)));
$('#timelineContext')?.addEventListener('click', event => handleTimelineClick(event).catch(err => setBanner(err.message)));
$('#timelineContext')?.addEventListener('submit', event => { if (event.target.id === 'incidentEditor') saveIncident(event).catch(err => setBanner(err.message)); });
$('#incidentList')?.addEventListener('click', event => { const row = event.target.closest('[data-incident-id]'); if (row) openIncident(row.dataset.incidentId).catch(err => setBanner(err.message)); });
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
$$('.chart-controls').forEach(controls => controls.addEventListener('click', handleChartRangeClick));
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
    closePlayerProfile();
  }
  ensureActiveTabAvailable();
  scheduleViewportRedraw({ force: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    ensureActiveTabAvailable();
    scheduleViewportRedraw({ force: true });
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

updateNavLabel('chat');
initializeDashboardBrandVisibility();
initLoopingCarousels();
initAuth();
