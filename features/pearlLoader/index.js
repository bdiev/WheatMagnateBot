'use strict';

const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');

const PEARL_LOADER_ROLE = 'pearl_loader';
const LOAD_COMMAND = /^load$/i;
const YES_COMMAND = /^yes$/i;

function cleanWhisperText(value) {
  return String(value || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function isTrapdoor(block) {
  return Boolean(block?.name && /(?:^|_)trapdoor$/i.test(block.name));
}

function trapdoorIsOpen(block) {
  const properties = typeof block?.getProperties === 'function' ? block.getProperties() : null;
  return properties?.open === true || properties?.open === 'true';
}

function timeoutError(message, statusCode = 504) {
  return Object.assign(new Error(message), { statusCode });
}

function sendPrivateWhisper(bot, username, message) {
  const safeUsername = String(username || '').trim();
  const safeMessage = String(message || '').replace(/[\r\n]+/g, ' ').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(safeUsername)) throw new Error('Invalid whisper recipient.');
  if (!safeMessage) throw new Error('Whisper message is empty.');
  if (typeof bot?.chat !== 'function') throw new Error('Minecraft bot cannot send whispers.');
  bot.chat(`/w ${safeUsername} ${safeMessage}`);
}

function createPearlLoaderFeature({
  pool,
  getRegistry,
  getManager,
  sendPrimaryWhisper,
  log = () => {},
  connectionTimeoutMs = 90_000,
  readyTimeoutMs = 5 * 60_000,
  visibilityTimeoutMs = 15 * 60_000,
  visibilityDistance = 32,
  openDelayMs = 2_000,
  visibilityPollMs = 250,
  interactionSettleMs = 250,
  navigationRange = 1,
  goalFactory = (x, y, z, range) => new GoalNear(x, y, z, range),
  movementsFactory = bot => new Movements(bot),
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  if (!pool) throw new Error('Pearl Loader requires a database pool.');
  if (typeof getRegistry !== 'function' || typeof getManager !== 'function') {
    throw new Error('Pearl Loader requires account registry and bot manager access.');
  }

  let activeJob = null;

  const tellPrimary = async (username, message) => {
    if (typeof sendPrimaryWhisper === 'function') await sendPrimaryWhisper(username, message);
  };

  async function loaderAccount() {
    const registry = getRegistry();
    await registry?.load?.();
    return registry?.list?.().find(account => account.role === PEARL_LOADER_ROLE && !account.isDefault) || null;
  }

  async function loadPlayerHatch(username) {
    const result = await pool.query(`
      SELECT pa.username,pa.pearl_hatch_x,pa.pearl_hatch_y,pa.pearl_hatch_z
      FROM player_activity pa
      WHERE LOWER(pa.username)=LOWER($1)
         OR EXISTS (
           SELECT 1 FROM player_name_history history
           WHERE history.player_uuid=pa.player_uuid AND LOWER(history.username)=LOWER($1)
         )
      ORDER BY CASE WHEN LOWER(pa.username)=LOWER($1) THEN 0 ELSE 1 END,
               pa.is_online DESC,COALESCE(pa.last_seen,pa.last_online) DESC NULLS LAST,pa.id DESC
      LIMIT 1
    `, [username]);
    const player = result.rows[0] || null;
    if (!player || [player.pearl_hatch_x, player.pearl_hatch_y, player.pearl_hatch_z].some(value => value == null)) return null;
    return {
      username: player.username || username,
      x: Number(player.pearl_hatch_x),
      y: Number(player.pearl_hatch_y),
      z: Number(player.pearl_hatch_z)
    };
  }

  async function waitForLoader(runtime) {
    if (runtime?.bot?.entity) return runtime.bot;
    return new Promise((resolve, reject) => {
      let timer = null;
      const cleanup = () => {
        clearTimer(timer);
        runtime?.off?.('status', onStatus);
        runtime?.off?.('end', onEnd);
      };
      const onStatus = () => {
        if (!runtime?.bot?.entity) return;
        const connectedBot = runtime.bot;
        cleanup();
        resolve(connectedBot);
      };
      const onEnd = reason => {
        cleanup();
        reject(new Error(`Pearl Loader disconnected: ${String(reason || 'connection closed')}`));
      };
      runtime?.on?.('status', onStatus);
      runtime?.once?.('end', onEnd);
      timer = setTimer(() => {
        cleanup();
        reject(timeoutError('Pearl Loader did not join the server in time.'));
      }, connectionTimeoutMs);
      timer?.unref?.();
      onStatus();
    });
  }

  function configureSafeMovement(bot) {
    if (!bot?.pathfinder) {
      if (typeof bot?.loadPlugin !== 'function') throw new Error('Pearl Loader pathfinder is unavailable.');
      bot.loadPlugin(pathfinder);
    }
    const movements = movementsFactory(bot);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.allowParkour = false;
    movements.allowSprinting = false;
    movements.canOpenDoors = false;
    bot.pathfinder.setMovements?.(movements);
  }

  async function blockAtHatch(bot, hatch) {
    return bot?.blockAt?.(new Vec3(hatch.x, hatch.y, hatch.z)) || null;
  }

  async function navigateToHatch(bot, hatch) {
    configureSafeMovement(bot);
    await bot.waitForChunksToLoad?.();
    await bot.pathfinder.goto(goalFactory(hatch.x, hatch.y, hatch.z, navigationRange));
    const block = await blockAtHatch(bot, hatch);
    if (!isTrapdoor(block)) {
      throw new Error(`Configured block at ${hatch.x}, ${hatch.y}, ${hatch.z} is not a trapdoor.`);
    }
    return block;
  }

  async function setHatchOpen(bot, hatch, shouldOpen) {
    let block = await blockAtHatch(bot, hatch);
    if (!isTrapdoor(block)) throw new Error('The configured trapdoor is no longer available.');
    if (trapdoorIsOpen(block) === shouldOpen) return false;
    await bot.activateBlock(block);
    await new Promise(resolve => setTimer(resolve, interactionSettleMs));
    block = await blockAtHatch(bot, hatch);
    if (!isTrapdoor(block) || trapdoorIsOpen(block) !== shouldOpen) {
      throw new Error(`Pearl Loader could not ${shouldOpen ? 'open' : 'close'} the trapdoor.`);
    }
    return true;
  }

  function clearJobTimers(job) {
    if (!job) return;
    clearTimer(job.readyTimer);
    clearTimer(job.visibilityTimer);
    clearTimer(job.visibilityDeadlineTimer);
    job.readyTimer = null;
    job.visibilityTimer = null;
    job.visibilityDeadlineTimer = null;
    if (job.runtime && job.onRuntimeEnd) job.runtime.off?.('end', job.onRuntimeEnd);
    if (job.runtime && job.onRuntimeStatus) job.runtime.off?.('status', job.onRuntimeStatus);
    job.onRuntimeEnd = null;
    job.onRuntimeStatus = null;
  }

  async function failJob(job, error, { notify = true } = {}) {
    if (!job || activeJob !== job) return;
    clearJobTimers(job);
    job.runtime?.assignTask?.('idle');
    activeJob = null;
    await job.runtime?.stop?.('Pearl Loader request ended').catch(() => {});
    log('error', `Pearl Loader request for ${job.username} failed.`, {
      username: job.username,
      accountId: job.accountId,
      stage: job.stage,
      error: error?.message || String(error)
    });
    if (notify) await tellPrimary(job.username, `Pearl Loader unavailable: ${error?.message || String(error)}`).catch(() => {});
  }

  async function finishJob(job) {
    if (!job || activeJob !== job) return;
    clearJobTimers(job);
    job.runtime?.assignTask?.('idle');
    activeJob = null;
    await job.runtime?.stop?.('Pearl Loader request complete').catch(() => {});
    log('info', `Pearl Loader completed the hatch cycle for ${job.username}.`, {
      username: job.username,
      accountId: job.accountId,
      hatch: job.hatch
    });
  }

  function playerVisible(bot, username) {
    const entity = Object.values(bot?.entities || {}).find(candidate =>
      candidate?.type === 'player' &&
      String(candidate.username || '').toLowerCase() === String(username || '').toLowerCase() &&
      candidate.position && bot?.entity?.position
    );
    return Boolean(entity && bot.entity.position.distanceTo(entity.position) <= visibilityDistance);
  }

  function monitorForPlayer(job) {
    const check = () => {
      if (activeJob !== job || job.stage !== 'waiting_visibility') return;
      const bot = job.runtime?.bot;
      if (!bot?.entity || !playerVisible(bot, job.username)) return;
      clearTimer(job.visibilityTimer);
      job.visibilityTimer = null;
      job.stage = 'opening';
      sendPrivateWhisper(bot, job.username, 'Remember to throw a new ender pearl.');
      const timer = setTimer(() => {
        setHatchOpen(bot, job.hatch, true)
          .then(() => finishJob(job))
          .catch(error => failJob(job, error));
      }, openDelayMs);
      timer?.unref?.();
      job.visibilityTimer = timer;
    };
    job.visibilityTimer = setInterval(check, visibilityPollMs);
    job.visibilityTimer?.unref?.();
    job.visibilityDeadlineTimer = setTimer(() => {
      const bot = job.runtime?.bot;
      Promise.resolve(bot?.entity ? setHatchOpen(bot, job.hatch, true) : null)
        .catch(() => {})
        .finally(() => failJob(job, timeoutError('The player did not enter Pearl Loader view in time.'), { notify:false }));
    }, visibilityTimeoutMs);
    job.visibilityDeadlineTimer?.unref?.();
    check();
  }

  async function begin(username) {
    const key = String(username || '').toLowerCase();
    if (activeJob) {
      const ownJob = activeJob.usernameKey === key;
      await tellPrimary(username, ownJob ? 'Your Pearl Loader request is already in progress.' : `Pearl Loader is busy with ${activeJob.username}.`);
      return;
    }
    const job = {
      username,
      usernameKey: key,
      accountId: null,
      hatch: null,
      stage: 'lookup',
      runtime: null,
      readyTimer: null,
      visibilityTimer: null,
      visibilityDeadlineTimer: null
    };
    activeJob = job;
    try {
      const hatch = await loadPlayerHatch(username);
      if (!hatch) {
        activeJob = null;
        await tellPrimary(username, 'Pearl hatch coordinates are not configured. Ask an administrator to add them to your player card.');
        return;
      }
      const account = await loaderAccount();
      if (!account) {
        activeJob = null;
        await tellPrimary(username, 'Pearl Loader is not configured. Ask an administrator to assign the Pearl Loader role to one bot.');
        return;
      }
      const manager = getManager();
      Object.assign(job, {
        username:hatch.username || username,
        usernameKey:String(hatch.username || username).toLowerCase(),
        accountId:account.id,
        hatch,
        stage:'connecting'
      });
      if (manager.get(account.id)) await manager.recreate(account.id);
      else await manager.start(account.id);
      const runtime = manager.get(account.id);
      if (!runtime) throw new Error('Pearl Loader runtime could not be started.');
      job.runtime = runtime;
      const loaderBot = await waitForLoader(runtime);
      if (activeJob !== job) return;
      runtime.assignTask?.('pearl_loader');
      job.onRuntimeEnd = reason => failJob(job, new Error(`Pearl Loader disconnected: ${String(reason || 'connection closed')}`));
      job.onRuntimeStatus = status => {
        if (['stopped','paused','error'].includes(String(status?.status || ''))) {
          void failJob(job, new Error(`Pearl Loader became ${status.status}.`));
        }
      };
      runtime.once?.('end', job.onRuntimeEnd);
      runtime.on?.('status', job.onRuntimeStatus);
      job.stage = 'navigating';
      await navigateToHatch(loaderBot, hatch);
      if (activeJob !== job || runtime.bot !== loaderBot) throw new Error('Pearl Loader connection changed while navigating.');
      job.stage = 'awaiting_yes';
      sendPrivateWhisper(loaderBot, job.username, 'Ready?');
      job.readyTimer = setTimer(() => {
        failJob(job, timeoutError('The Ready? confirmation expired.'), { notify:false });
      }, readyTimeoutMs);
      job.readyTimer?.unref?.();
      log('info', `Pearl Loader is ready for ${job.username}.`, { username:job.username,accountId:account.id,hatch });
    } catch (error) {
      await failJob(job, error);
    }
  }

  async function handlePrimaryWhisper(username, message) {
    if (!LOAD_COMMAND.test(cleanWhisperText(message))) return false;
    try { await begin(username); }
    catch (error) { await tellPrimary(username, `Pearl Loader unavailable: ${error?.message || String(error)}`).catch(() => {}); }
    return true;
  }

  async function handleLoaderWhisper(accountId, username, message) {
    const job = activeJob;
    if (!job || job.accountId !== accountId || job.stage !== 'awaiting_yes') return false;
    if (String(username || '').toLowerCase() !== job.usernameKey || !YES_COMMAND.test(cleanWhisperText(message))) return false;
    clearTimer(job.readyTimer);
    job.readyTimer = null;
    job.stage = 'closing';
    try {
      const loaderBot = job.runtime?.bot;
      if (!loaderBot?.entity) throw new Error('Pearl Loader disconnected before confirmation.');
      await setHatchOpen(loaderBot, job.hatch, false);
      if (activeJob !== job) return true;
      job.stage = 'waiting_visibility';
      monitorForPlayer(job);
    } catch (error) {
      await failJob(job, error);
    }
    return true;
  }

  function isExpectedPlayer(accountId, username) {
    return Boolean(activeJob && activeJob.accountId === accountId && activeJob.usernameKey === String(username || '').toLowerCase());
  }

  function getStatus() {
    if (!activeJob) return { active:false };
    return {
      active:true,
      accountId:activeJob.accountId,
      username:activeJob.username,
      stage:activeJob.stage,
      hatch:{ ...activeJob.hatch }
    };
  }

  function dispose() {
    clearJobTimers(activeJob);
    activeJob = null;
  }

  return { handlePrimaryWhisper, handleLoaderWhisper, isExpectedPlayer, getStatus, dispose, __test:{ isTrapdoor, trapdoorIsOpen, loadPlayerHatch } };
}

module.exports = { PEARL_LOADER_ROLE, cleanWhisperText, createPearlLoaderFeature, isTrapdoor, sendPrivateWhisper, trapdoorIsOpen };
