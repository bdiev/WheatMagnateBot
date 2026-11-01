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
  debugLog = () => {}
}) {
  const dialogHeaders = state.whisperDialogHeaders || new Map();
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
        { name: 'Player', value: details.online ? '🟢 Online' : '⚫ Offline', inline: true },
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

  function touchDialog(channelId) {
    const ttlMs = state.customDialogTTL.get(channelId) || defaultTtlMs;
    state.whisperDeleteTimestamps.set(channelId, Date.now() + ttlMs);
    scheduleWhisperCleanup(channelId, ttlMs);
  }

  async function postDialogBubble(channel, username, embed, files) {
    touchDialog(channel.id);
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

  function setDialogTtl(channel, ttlMs) {
    state.customDialogTTL.set(channel.id, ttlMs);
    touchDialog(channel.id);
    return refreshDialogHeader(channel);
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
    const timer = setTimeout(async () => {
      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel && channel.deletable) {
          removeWhisperChannelMappings(channelId);
          await channel.delete('Dialog auto-deleted after inactivity');
        }
      } catch (e) {
        if (e?.code === 10003) removeWhisperChannelMappings(channelId);
        else console.error('[Whisper] Failed to auto-delete dialog channel:', e.message);
      } finally {
        cancelWhisperCleanup(channelId);
      }
    }, Math.max(1_000, ttlMs));

    state.whisperCleanupTimers.set(channelId, timer);
  }

  // Timers live in memory, so after a restart each dialog takes its deletion
  // time and idle length back from its header
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
        scheduleWhisperCleanup(channelId, remaining);
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
