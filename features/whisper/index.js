'use strict';

const fs = require('fs');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageType,
  PermissionsBitField
} = require('discord.js');

const WHISPER_CLAIM_TITLE = 'New whisper';
const LEGACY_WHISPER_CLAIM_TITLE = 'New whisper from Minecraft';
const CLAIM_CARD_MESSAGE_LIMIT = 5;
const OUTGOING_COLOR = 0x5865F2;
const DEFAULT_PLAYER_COLOR = 0x3498DB;

function isWhisperClaimEmbed(embed) {
  return embed?.title === WHISPER_CLAIM_TITLE || embed?.title === LEGACY_WHISPER_CLAIM_TITLE;
}

// The player a claim card is about: the author line, or the description of a
// card posted before the cards had one
function whisperClaimUsername(embed) {
  if (!isWhisperClaimEmbed(embed)) return '';
  if (embed.author?.name) return String(embed.author.name).trim();
  const legacy = String(embed.description || '').match(/New \/msg from \*\*([^*]+)\*\*/i);
  return String(legacy?.[1] || '').trim();
}

function formatTtlMinutes(ttlMs) {
  const minutes = Math.max(1, Math.round(ttlMs / 60_000));
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

function createWhisperFeature({
  discordClient,
  discordChannelId,
  discordDmCategoryId,
  whisperChannelsFile,
  defaultTtlMs,
  state,
  emojis,
  loadAvatar = async () => ({}),
  profileUrl = () => null,
  formatMessage = text => String(text || ''),
  getPlayerColor = async () => DEFAULT_PLAYER_COLOR,
  // username -> { online, replyFrom }: what the dialog header shows
  describeDialog = () => ({}),
  // How long the owner has to answer "Delete this dialog?" before it goes
  confirmGraceMs = 5 * 60_000,
  // Replies written while the player is offline wait here for them to join
  outboxFile = null,
  // (username, texts) -> name of the bot that sent them, or null when it can't
  sendWhisper = async () => null,
  deliverDelayMs = 5_000,
  debugLog = () => {}
}) {
  const dialogHeaders = state.whisperDialogHeaders || new Map();
  const deletePrompts = state.whisperDeletePrompts || new Map();
  const queuedWhispers = new Map(); // id -> queued reply, see queueOfflineWhisper
  const deliveryTimers = new Map(); // player key -> timer of a delivery after a join
  const deliveringPlayers = new Set();
  const channelQueues = new Map();

  // Messages of one dialog go out one after another, so the header is made
  // once and the bubbles keep the order they came in
  function inChannelQueue(channelId, task) {
    const previous = channelQueues.get(channelId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    channelQueues.set(channelId, current);
    current.finally(() => {
      if (channelQueues.get(channelId) === current) channelQueues.delete(channelId);
    }).catch(() => {});
    return current;
  }

  function saveWhisperChannels() {
    try {
      const payload = Object.fromEntries(state.whisperChannels.entries());
      fs.writeFileSync(whisperChannelsFile, JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error('[Whisper] Failed to save channel mappings:', e.message);
    }
  }

  function loadWhisperChannels() {
    try {
      const raw = fs.readFileSync(whisperChannelsFile, 'utf8').trim();
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.error('[Whisper] Ignoring invalid channel mapping file format.');
        return;
      }

      state.whisperChannels.clear();
      for (const [key, value] of Object.entries(parsed)) {
        state.whisperChannels.set(key, value);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[Whisper] Failed to load channel mappings:', e.message);
      }
    }
  }

  function setWhisperChannelMapping(ownerId, mcUsername, channelId) {
    state.whisperChannels.set(`${ownerId}:${mcUsername.toLowerCase()}`, channelId);
    saveWhisperChannels();
  }

  function getDialogOwnerId(channelId) {
    for (const [key, value] of state.whisperChannels.entries()) {
      if (value === channelId) {
        return key.split(':')[0];
      }
    }
    return null;
  }

  function getDialogPlayerKey(channelId) {
    for (const [key, value] of state.whisperChannels.entries()) {
      if (value === channelId) return key.split(':')[1] || null;
    }
    return null;
  }

  function canAttachFiles(channel) {
    return !channel.guild || Boolean(channel.permissionsFor?.(discordClient.user)?.has(PermissionsBitField.Flags.AttachFiles));
  }

  async function playerColor(username) {
    try {
      return await getPlayerColor(username);
    } catch (_) {
      return DEFAULT_PLAYER_COLOR;
    }
  }

  function playerUrl(username) {
    try {
      return profileUrl(username) || undefined;
    } catch (_) {
      return undefined;
    }
  }

  function buildDeleteDialogComponents(channelId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_dialog_${channelId}`)
          .setLabel('Delete dialog')
          .setEmoji(emojis.farm.lavaBucket)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`set_ttl_${channelId}`)
          .setLabel('Auto-delete time')
          .setEmoji(emojis.ui.slowFalling)
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  function isDialogHeader(message, channelId) {
    if (discordClient.user?.id && message?.author?.id !== discordClient.user.id) return false;
    return (message?.components || []).some(row => (row.components || [])
      .some(component => component.customId === `delete_dialog_${channelId}`));
  }

  async function findDialogHeader(channel) {
    const knownId = dialogHeaders.get(channel.id);
    if (knownId) {
      try {
        return await channel.messages.fetch(knownId);
      } catch (_) {
        dialogHeaders.delete(channel.id);
      }
    }
    try {
      const pinned = await channel.messages.fetchPinned();
      const header = [...pinned.values()].find(message => isDialogHeader(message, channel.id));
      if (header) {
        dialogHeaders.set(channel.id, header.id);
        return header;
      }
    } catch (e) {
      debugLog('[Whisper] Failed to read pinned messages:', e.message);
    }
    return null;
  }

  function headerUsername(header, channelId) {
    const title = String(header?.embeds?.[0]?.title || '');
    const match = title.match(/^Dialog with (\S+)$/);
    return match?.[1] || getDialogPlayerKey(channelId);
  }

  async function buildDialogHeader(channel, username) {
    const ttlMs = state.customDialogTTL.get(channel.id) || defaultTtlMs;
    const deleteAt = state.whisperDeleteTimestamps.get(channel.id) || Date.now() + ttlMs;
    const details = describeDialog(username) || {};
    const avatar = await loadAvatar(username, { attachFiles: false }).catch(() => ({}));
    return {
      title: `Dialog with ${username}`,
      url: playerUrl(username),
      description: 'Write here to whisper the player: every line goes out as its own /msg.',
      color: await playerColor(username),
      ...(avatar.thumbnail?.url ? { thumbnail: { url: avatar.thumbnail.url } } : {}),
      fields: [
        {
          name: 'Player',
          value: [
            details.online ? '🟢 Online' : '⚫ Offline',
            queuedCount(channel.id) ? `⏳ ${queuedCount(channel.id)} waiting to be sent` : null
          ].filter(Boolean).join('\n'),
          inline: true
        },
        { name: 'Replies from', value: details.replyFrom || 'No bot in game', inline: true },
        {
          name: 'Auto-delete',
          value: `<t:${Math.floor(deleteAt / 1000)}:R>\nafter ${formatTtlMinutes(ttlMs)} idle`,
          inline: true
        }
      ]
    };
  }

  async function removePinNotice(channel) {
    try {
      const recent = await channel.messages.fetch({ limit: 5 });
      await Promise.all([...recent.values()]
        .filter(message => message.type === MessageType.ChannelPinnedMessage)
        .map(message => message.delete()));
    } catch (_) {}
  }

  // The pinned card at the top of the dialog: who it is with, which bot
  // replies and when the channel goes away. Discord counts the time down
  // itself, so the card changes only when the dialog does
  async function upsertDialogHeader(channel, username = null) {
    const header = await findDialogHeader(channel);
    const name = username || headerUsername(header, channel.id);
    if (!name) return null;
    const embed = await buildDialogHeader(channel, name);
    if (header) {
      await header.edit({ embeds: [embed], components: buildDeleteDialogComponents(channel.id) });
      return header;
    }
    const created = await channel.send({ embeds: [embed], components: buildDeleteDialogComponents(channel.id) });
    dialogHeaders.set(channel.id, created.id);
    try {
      await created.pin();
      await removePinNotice(channel);
    } catch (e) {
      debugLog('[Whisper] Failed to pin dialog header:', e.message);
    }
    return created;
  }

  function refreshDialogHeader(channel, username = null) {
    return inChannelQueue(channel.id, () => upsertDialogHeader(channel, username))
      .catch(e => debugLog('[Whisper] Failed to refresh dialog header:', e.message));
  }

  // A player came or went: the headers of their dialogs show it at once.
  // Without a username every dialog is refreshed (one of the bots came or
  // went, so "Replies from" may change)
  async function refreshPlayerDialogs(username = null) {
    const playerKey = username ? String(username).toLowerCase() : null;
    const channelIds = new Set();
    for (const [key, channelId] of state.whisperChannels.entries()) {
      if (!playerKey || key.split(':')[1] === playerKey) channelIds.add(channelId);
    }
    for (const channelId of channelIds) {
      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel?.isTextBased?.()) await refreshDialogHeader(channel, username);
      } catch (e) {
        if (e?.code === 10003) removeWhisperChannelMappings(channelId);
        else debugLog('[Whisper] Failed to refresh dialog after a join or leave:', e.message);
      }
    }
  }

  function touchDialog(channel) {
    const ttlMs = state.customDialogTTL.get(channel.id) || defaultTtlMs;
    state.whisperDeleteTimestamps.set(channel.id, Date.now() + ttlMs);
    scheduleWhisperCleanup(channel.id, ttlMs);
    dismissDeletePrompt(channel);
  }

  async function postDialogBubble(channel, username, embed, files) {
    touchDialog(channel);
    await upsertDialogHeader(channel, username).catch(e => {
      debugLog('[Whisper] Failed to update dialog header:', e.message);
    });
    return channel.send({ embeds: [embed], ...(files ? { files } : {}) });
  }

  // A whisper from the player, with their head and their chat colour
  function postIncomingDialogMessage(channel, { username, recipient = null, text, at = Date.now() }) {
    return inChannelQueue(channel.id, async () => {
      const avatar = await loadAvatar(username, { attachFiles: canAttachFiles(channel) }).catch(() => ({}));
      return postDialogBubble(channel, username, {
        author: {
          name: recipient ? `${username} → ${recipient}` : username,
          url: playerUrl(username),
          ...(avatar.thumbnail?.url ? { icon_url: avatar.thumbnail.url } : {})
        },
        description: formatMessage(text),
        color: await playerColor(username),
        timestamp: new Date(at)
      }, avatar.files);
    });
  }

  // A reply sent from Discord, in Discord blurple with the sender's avatar
  function postOutgoingDialogMessage(channel, { username, sender, text, via = null }) {
    return inChannelQueue(channel.id, () => postDialogBubble(channel, username, {
      author: {
        name: `${sender?.name || 'You'} → ${username}`,
        ...(sender?.iconUrl ? { icon_url: sender.iconUrl } : {})
      },
      description: formatMessage(text),
      color: OUTGOING_COLOR,
      ...(via ? { footer: { text: `via ${via}` } } : {}),
      timestamp: new Date()
    }));
  }

  function saveQueuedWhispers() {
    if (!outboxFile) return;
    try {
      fs.writeFileSync(outboxFile, JSON.stringify([...queuedWhispers.values()], null, 2));
    } catch (e) {
      console.error('[Whisper] Failed to save queued replies:', e.message);
    }
  }

  function loadQueuedWhispers() {
    if (!outboxFile) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(outboxFile, 'utf8').trim() || '[]');
      queuedWhispers.clear();
      for (const item of Array.isArray(parsed) ? parsed : []) {
        if (item?.id && item.username && Array.isArray(item.texts)) queuedWhispers.set(item.id, item);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[Whisper] Failed to load queued replies:', e.message);
    }
  }

  function queuedCount(channelId) {
    let count = 0;
    for (const item of queuedWhispers.values()) if (item.channelId === channelId) count += 1;
    return count;
  }

  // The bubble of a queued reply, in each of its states
  function buildQueuedBubble(item, status, via = null) {
    const text = formatMessage(item.texts.join('\n'));
    const footers = {
      waiting: item.reason === 'no_bot'
        ? '⏳ Not sent yet: no bot is in game. It goes out when one sees the player online.'
        : `⏳ Not sent yet: ${item.username} is offline. It goes out when they join.`,
      sent: `✅ Sent when ${item.username} came online${via ? ` · via ${via}` : ''}`,
      cancelled: '✖ Cancelled, not sent'
    };
    return {
      author: {
        name: `${item.senderName || 'You'} → ${item.username}`,
        ...(item.senderIconUrl ? { icon_url: item.senderIconUrl } : {})
      },
      description: status === 'cancelled' ? `~~${text}~~` : text,
      color: status === 'sent' ? OUTGOING_COLOR : 0x95A5A6,
      footer: { text: footers[status] },
      timestamp: new Date(status === 'waiting' ? item.createdAt : Date.now())
    };
  }

  function buildQueuedComponents(item) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancel_queued_whisper_${item.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  async function editQueuedBubble(item, status, via = null) {
    try {
      const channel = await discordClient.channels.fetch(item.channelId);
      const message = await channel.messages.fetch(item.messageId);
      await message.edit({ embeds: [buildQueuedBubble(item, status, via)], components: [] });
      await refreshDialogHeader(channel);
    } catch (e) {
      debugLog('[Whisper] Failed to update a queued reply:', e.message);
    }
  }

  // A reply that could not go out now: it is shown greyed out in the dialog
  // and sent by deliverQueuedWhispers once the player is seen online
  function queueOfflineWhisper(channel, { username, ownerId, sender, texts, reason = 'offline' }) {
    return inChannelQueue(channel.id, async () => {
      const item = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        channelId: channel.id, messageId: null, ownerId, username,
        texts: texts.filter(Boolean), reason,
        senderName: sender?.name || null, senderIconUrl: sender?.iconUrl || null,
        createdAt: Date.now()
      };
      queuedWhispers.set(item.id, item);
      touchDialog(channel);
      await upsertDialogHeader(channel, username).catch(() => {});
      try {
        const message = await channel.send({ embeds: [buildQueuedBubble(item, 'waiting')], components: buildQueuedComponents(item) });
        item.messageId = message.id;
      } finally {
        saveQueuedWhispers();
      }
      return item;
    });
  }

  // Sends what waited for this player, oldest first. A reply leaves the queue
  // only once a bot has sent it; otherwise it waits for the next join
  async function deliverQueuedWhispers(username) {
    const playerKey = String(username || '').toLowerCase();
    if (!playerKey || deliveringPlayers.has(playerKey)) return 0;
    deliveringPlayers.add(playerKey);
    let delivered = 0;
    try {
      const items = [...queuedWhispers.values()]
        .filter(item => item.username.toLowerCase() === playerKey)
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const item of items) {
        if (!queuedWhispers.has(item.id)) continue;
        const via = await sendWhisper(item.username, item.texts);
        if (!via) break;
        queuedWhispers.delete(item.id);
        saveQueuedWhispers();
        delivered += 1;
        console.log(`[Whisper] Delivered a queued reply to ${item.username} via ${via}.`);
        await editQueuedBubble(item, 'sent', via);
      }
    } finally {
      deliveringPlayers.delete(playerKey);
    }
    return delivered;
  }

  // A join is followed by a short wait, so the player is fully in the game
  function deliverQueuedWhispersSoon(username) {
    const playerKey = String(username || '').toLowerCase();
    if (![...queuedWhispers.values()].some(item => item.username.toLowerCase() === playerKey)) return;
    clearTimeout(deliveryTimers.get(playerKey));
    deliveryTimers.set(playerKey, setTimeout(() => {
      deliveryTimers.delete(playerKey);
      deliverQueuedWhispers(username).catch(e => console.error('[Whisper] Failed to deliver queued replies:', e.message));
    }, deliverDelayMs));
  }

  // 'cancelled', 'forbidden' (not the author) or 'missing' (already sent or gone)
  async function cancelQueuedWhisper(id, userId) {
    const item = queuedWhispers.get(id);
    if (!item) return 'missing';
    if (item.ownerId && item.ownerId !== userId) return 'forbidden';
    queuedWhispers.delete(id);
    saveQueuedWhispers();
    await editQueuedBubble(item, 'cancelled');
    return 'cancelled';
  }

  function dropQueuedWhispersForChannel(channelId) {
    let changed = false;
    for (const [id, item] of queuedWhispers) {
      if (item.channelId === channelId) {
        queuedWhispers.delete(id);
        changed = true;
      }
    }
    if (changed) saveQueuedWhispers();
  }

  function setDialogTtl(channel, ttlMs) {
    state.customDialogTTL.set(channel.id, ttlMs);
    touchDialog(channel);
    return refreshDialogHeader(channel);
  }

  // The owner is in the channel mapping; after a lost mapping file, the one
  // member the channel was opened for
  async function resolveDialogOwnerId(channelId, channel = null) {
    const ownerId = getDialogOwnerId(channelId);
    if (ownerId) return ownerId;
    try {
      const ch = channel || await discordClient.channels.fetch(channelId);
      if (!ch?.isTextBased?.() || !ch.guild) return null;
      const overwrites = ch.permissionOverwrites?.cache ?? new Map();
      for (const ov of overwrites.values()) {
        if (ov.id === ch.guild.roles.everyone.id || ov.id === discordClient.user.id) continue;
        const allowsView = ov.allow?.has?.(PermissionsBitField.Flags.ViewChannel);
        const isMemberType = ov.type === 1 || ov.type === 'member';
        if (isMemberType && allowsView) return ov.id;
      }
    } catch (_) {}
    return null;
  }

  function buildDeletePromptComponents(channelId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`keep_dialog_${channelId}`)
          .setLabel('Keep dialog')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`delete_dialog_${channelId}`)
          .setLabel('Delete now')
          .setEmoji(emojis.farm.lavaBucket)
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  function isDeletePrompt(message, channelId) {
    if (discordClient.user?.id && message?.author?.id !== discordClient.user.id) return false;
    return (message?.components || []).some(row => (row.components || [])
      .some(component => component.customId === `keep_dialog_${channelId}`));
  }

  function dismissDeletePrompt(channel) {
    const promptId = deletePrompts.get(channel.id);
    if (!promptId) return;
    deletePrompts.delete(channel.id);
    channel.messages.fetch(promptId)
      .then(message => message.delete())
      .catch(() => {});
  }

  async function deleteDialogChannel(channelId, reason) {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (channel && channel.deletable) {
        removeWhisperChannelMappings(channelId);
        await channel.delete(reason);
      }
    } catch (e) {
      if (e?.code === 10003) removeWhisperChannelMappings(channelId);
      else console.error('[Whisper] Failed to auto-delete dialog channel:', e.message);
    }
  }

  function scheduleFinalDelete(channelId, delayMs) {
    cancelWhisperCleanup(channelId);
    const timer = setTimeout(() => {
      state.whisperCleanupTimers.delete(channelId);
      deleteDialogChannel(channelId, 'Dialog auto-deleted after inactivity');
    }, Math.max(1_000, delayMs));
    state.whisperCleanupTimers.set(channelId, timer);
  }

  // When a dialog has been idle long enough, its owner is pinged and asked
  // first; the channel goes only if nobody keeps it within the grace time
  async function askBeforeDelete(channelId) {
    let channel;
    try {
      channel = await discordClient.channels.fetch(channelId);
    } catch (e) {
      if (e?.code === 10003) removeWhisperChannelMappings(channelId);
      else debugLog('[Whisper] Failed to fetch idle dialog:', e.message);
      return;
    }
    if (!channel?.isTextBased?.()) return;
    const ownerId = await resolveDialogOwnerId(channelId, channel);
    if (!ownerId) {
      await deleteDialogChannel(channelId, 'Dialog auto-deleted after inactivity');
      return;
    }

    const ttlMs = state.customDialogTTL.get(channelId) || defaultTtlMs;
    const waiting = queuedCount(channelId);
    const deleteAt = Date.now() + confirmGraceMs;
    state.whisperDeleteTimestamps.set(channelId, deleteAt);
    scheduleFinalDelete(channelId, confirmGraceMs);
    await inChannelQueue(channelId, async () => {
      const prompt = await channel.send({
        content: `<@${ownerId}>`,
        embeds: [{
          title: 'Delete this dialog?',
          description: `No messages for ${formatTtlMinutes(ttlMs)}. The channel will be deleted <t:${Math.floor(deleteAt / 1000)}:R> unless you keep it.${waiting ? `\n⏳ ${waiting === 1 ? '1 reply is' : `${waiting} replies are`} still waiting for the player and will be cancelled with it.` : ''}`,
          color: 0xF1C40F
        }],
        components: buildDeletePromptComponents(channelId),
        allowedMentions: { users: [ownerId] }
      });
      deletePrompts.set(channelId, prompt.id);
      await upsertDialogHeader(channel).catch(() => {});
    }).catch(e => debugLog('[Whisper] Failed to ask before deleting dialog:', e.message));
  }

  // "Keep dialog": the question goes away and the idle time starts again
  async function keepDialog(channel) {
    touchDialog(channel);
    await refreshDialogHeader(channel);
  }

  function removeWhisperChannelMappings(channelId) {
    let changed = false;
    for (const [key, value] of state.whisperChannels.entries()) {
      if (value === channelId) {
        state.whisperChannels.delete(key);
        changed = true;
      }
    }
    if (changed) saveWhisperChannels();
    dialogHeaders.delete(channelId);
    deletePrompts.delete(channelId);
    dropQueuedWhispersForChannel(channelId);
    state.whisperDeleteTimestamps.delete(channelId);
    state.customDialogTTL.delete(channelId);
  }

  function cancelWhisperCleanup(channelId) {
    const existing = state.whisperCleanupTimers.get(channelId);
    if (existing) {
      clearTimeout(existing);
      state.whisperCleanupTimers.delete(channelId);
    }
  }

  function scheduleWhisperCleanup(channelId, ttlMs = defaultTtlMs) {
    cancelWhisperCleanup(channelId);
    const timer = setTimeout(() => {
      state.whisperCleanupTimers.delete(channelId);
      askBeforeDelete(channelId).catch(e => debugLog('[Whisper] Idle dialog check failed:', e.message));
    }, Math.max(1_000, ttlMs));

    state.whisperCleanupTimers.set(channelId, timer);
  }

  // Timers live in memory, so after a restart each dialog takes its deletion
  // time and idle length back from its header, and a question already asked
  // keeps its deadline instead of being asked again
  async function restoreDialogTimers() {
    const channelIds = [...new Set(state.whisperChannels.values())];
    for (const channelId of channelIds) {
      if (state.whisperCleanupTimers.has(channelId)) continue;
      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel?.isTextBased?.()) {
          removeWhisperChannelMappings(channelId);
          continue;
        }
        const header = await findDialogHeader(channel);
        const field = header?.embeds?.[0]?.fields?.find(item => item.name === 'Auto-delete');
        const deleteAt = Number(String(field?.value || '').match(/<t:(\d+):R>/)?.[1]) * 1000;
        const idleMinutes = Number(String(field?.value || '').match(/after (\d+) min/)?.[1]);
        const idleHours = Number(String(field?.value || '').match(/after (\d+) h/)?.[1]);
        const ttlMs = idleMinutes ? idleMinutes * 60_000 : idleHours ? idleHours * 3_600_000 : null;
        if (ttlMs && ttlMs !== defaultTtlMs) state.customDialogTTL.set(channelId, ttlMs);
        const remaining = deleteAt ? deleteAt - Date.now() : (ttlMs || defaultTtlMs);
        state.whisperDeleteTimestamps.set(channelId, Date.now() + Math.max(0, remaining));
        const recent = await channel.messages.fetch({ limit: 20 }).catch(() => new Map());
        const prompt = [...recent.values()].find(message => isDeletePrompt(message, channelId));
        if (prompt) {
          deletePrompts.set(channelId, prompt.id);
          scheduleFinalDelete(channelId, remaining);
        } else {
          scheduleWhisperCleanup(channelId, remaining);
        }
      } catch (e) {
        if (e?.code === 10003) removeWhisperChannelMappings(channelId);
        else debugLog('[Whisper] Failed to restore dialog timer:', e.message);
      }
    }
  }

  async function buildClaimCard(mcUsername, messages, total, recipient) {
    const avatar = await loadAvatar(mcUsername, { attachFiles: false }).catch(() => ({}));
    const lines = messages.map(item => `> ${formatMessage(item.text)}`);
    return {
      author: {
        name: mcUsername,
        url: playerUrl(mcUsername),
        ...(avatar.thumbnail?.url ? { icon_url: avatar.thumbnail.url } : {})
      },
      title: WHISPER_CLAIM_TITLE,
      description: lines.join('\n').slice(0, 4000),
      color: await playerColor(mcUsername),
      footer: {
        text: [
          recipient ? `to ${recipient}` : null,
          total === 1 ? '1 message' : `${total} messages`,
          'claim to reply from Discord'
        ].filter(Boolean).join(' · ')
      },
      timestamp: new Date(messages[messages.length - 1]?.at || Date.now())
    };
  }

  // recipient: the bot the player wrote to
  async function sendWhisperClaimPrompt(mcUsername, body, recipient = null) {
    if (!discordChannelId || !discordClient || !discordClient.isReady()) return;
    const mcKey = mcUsername.toLowerCase();
    const channel = await discordClient.channels.fetch(discordChannelId);
    if (!channel || !channel.isTextBased()) return;

    const existing = state.pendingWhisperClaims.get(mcKey);
    const total = (existing?.total || existing?.messages?.length || 0) + 1;
    const messages = [...(existing?.messages || []), { text: body, at: Date.now(), recipient }]
      .slice(-CLAIM_CARD_MESSAGE_LIMIT);
    const pending = {
      messageId: existing?.messageId || null,
      username: mcUsername,
      lastMessage: body,
      messages,
      total,
      recipient
    };
    const payload = {
      embeds: [await buildClaimCard(mcUsername, messages, total, recipient)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_whisper_${mcKey}`)
            .setLabel('Claim dialog')
            .setEmoji(emojis.ui.bookOrange)
            .setStyle(ButtonStyle.Success)
        )
      ]
    };

    if (existing?.messageId) {
      try {
        const msg = await channel.messages.fetch(existing.messageId);
        await msg.edit(payload);
        state.pendingWhisperClaims.set(mcKey, pending);
        return;
      } catch (_) {
        state.pendingWhisperClaims.delete(mcKey);
      }
    }

    try {
      const msg = await channel.send(payload);
      state.pendingWhisperClaims.set(mcKey, { ...pending, messageId: msg.id });
    } catch (e) {
      console.error('[Whisper] Failed to post claim prompt:', e.message);
    }
  }

  async function removeWhisperClaimPrompt(mcUsername) {
    const mcKey = String(mcUsername || '').toLowerCase();
    const pending = state.pendingWhisperClaims.get(mcKey);
    let shouldClear = false;
    try {
      const channel = await discordClient.channels.fetch(discordChannelId);
      if (!channel?.isTextBased()) return false;
      if (pending) {
        const message = await channel.messages.fetch(pending.messageId);
        await message.delete();
        shouldClear = true;
        return true;
      }

      const recent = await channel.messages.fetch({ limit: 100 });
      const matches = [...recent.values()].filter(message => {
        if (discordClient.user?.id && message.author?.id !== discordClient.user.id) return false;
        return whisperClaimUsername(message.embeds?.[0]).toLowerCase() === mcKey;
      });
      await Promise.all(matches.map(message => message.delete()));
      return matches.length > 0;
    } catch (err) {
      if (err?.code === 10008 || err?.status === 404 || String(err?.message || '').includes('Unknown Message')) {
        shouldClear = true;
        return true;
      }
      console.error('[Whisper] Failed to remove claim prompt:', err.message);
      return false;
    } finally {
      if (shouldClear) state.pendingWhisperClaims.delete(mcKey);
    }
  }

  // After a claim: the card turns into a short note pointing at the channel
  async function markWhisperClaimed(pending, { mcUsername, claimedBy, channel }) {
    try {
      const statusChannel = await discordClient.channels.fetch(discordChannelId);
      const msg = await statusChannel.messages.fetch(pending.messageId);
      const avatar = await loadAvatar(mcUsername, { attachFiles: false }).catch(() => ({}));
      await msg.edit({
        embeds: [{
          author: {
            name: mcUsername,
            url: playerUrl(mcUsername),
            ...(avatar.thumbnail?.url ? { icon_url: avatar.thumbnail.url } : {})
          },
          description: `Dialog claimed by ${claimedBy} → ${channel}`,
          color: 0x2ECC71,
          timestamp: new Date()
        }],
        components: []
      });
    } catch (_) {}
  }

  async function getOrCreateWhisperChannel(ownerId, ownerTag, mcUsername) {
    if (!discordClient || !discordClient.isReady()) return null;
    if (!discordDmCategoryId) {
      console.error('[Whisper] DISCORD_DM_CATEGORY_ID not set. Cannot create private channel.');
      return null;
    }

    const statusChannel = await discordClient.channels.fetch(discordChannelId);
    if (!statusChannel || !statusChannel.guild) {
      console.error('[Whisper] Cannot resolve guild from status channel.');
      return null;
    }

    const guild = statusChannel.guild;
    const key = `${ownerId}:${mcUsername.toLowerCase()}`;

    if (state.whisperChannels.has(key)) {
      try {
        const existing = await guild.channels.fetch(state.whisperChannels.get(key));
        if (existing) return existing;
      } catch (_) {
        state.whisperChannels.delete(key);
        saveWhisperChannels();
      }
    }

    let parent;
    try {
      parent = await guild.channels.fetch(discordDmCategoryId);
    } catch (err) {
      console.error('[Whisper] Failed to fetch category:', err.message);
      return null;
    }

    if (!parent || parent.type !== ChannelType.GuildCategory) {
      console.error('[Whisper] Provided DISCORD_DM_CATEGORY_ID is not a category.');
      return null;
    }

    const suffix = ownerId.slice(-4);
    const baseName = `dialog-${mcUsername}-${suffix}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .slice(0, 90) || 'dialog';

    try {
      const channel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildText,
        parent: parent.id,
        topic: `Private Minecraft dialog with ${mcUsername}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: ownerId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: discordClient.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ]
      });

      setWhisperChannelMapping(ownerId, mcUsername, channel.id);
      console.log(`[Whisper] Created channel ${channel.name} for ${ownerTag} -> ${mcUsername}`);
      return channel;
    } catch (err) {
      console.error('[Whisper] Failed to create channel:', err.message);
      return null;
    }
  }

  return {
    saveWhisperChannels,
    loadWhisperChannels,
    setWhisperChannelMapping,
    getDialogOwnerId,
    postIncomingDialogMessage,
    postOutgoingDialogMessage,
    refreshDialogHeader,
    setDialogTtl,
    refreshPlayerDialogs,
    loadQueuedWhispers,
    queueOfflineWhisper,
    deliverQueuedWhispers,
    deliverQueuedWhispersSoon,
    cancelQueuedWhisper,
    keepDialog,
    resolveDialogOwnerId,
    restoreDialogTimers,
    removeWhisperChannelMappings,
    cancelWhisperCleanup,
    scheduleWhisperCleanup,
    sendWhisperClaimPrompt,
    removeWhisperClaimPrompt,
    markWhisperClaimed,
    buildDeleteDialogComponents,
    getOrCreateWhisperChannel
  };
}

module.exports = { createWhisperFeature, isWhisperClaimEmbed, whisperClaimUsername, WHISPER_CLAIM_TITLE };
