'use strict';

const crypto = require('node:crypto');

const REQUEST_SESSION_COOKIE = 'wm_request_session';
const REQUEST_ADMIN_SESSION_COOKIE = 'wm_request_admin_session';
const OAUTH_STATE_COOKIE = 'wm_discord_oauth_state';
const REQUEST_SESSION_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_SECONDS = 10 * 60;
const ACTIVE_STATUSES = ['pending', 'preparing', 'ready', 'notified'];
const ADMIN_STATUSES = new Set([...ACTIVE_STATUSES, 'completed', 'cancelled']);

function normalizeMinecraftUsername(value) {
  const username = String(value || '').trim();
  return /^[A-Za-z0-9_]{1,16}$/.test(username) ? username : '';
}

function normalizeRequestText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 2000);
}

function normalizeCoordinates(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 160);
}

function publicRequester(row) {
  if (!row) return null;
  return {
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    displayName: row.discord_global_name || row.discord_username,
    avatarUrl: row.discord_avatar_hash
      ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(row.discord_id)}/${encodeURIComponent(row.discord_avatar_hash)}.png?size=128`
      : null,
    minecraftUsername: row.minecraft_username || null
  };
}

function publicRequest(row) {
  return {
    id: String(row.id),
    minecraftUsername: row.minecraft_username,
    resources: row.resources,
    status: row.status,
    deliveryCoordinates: row.delivery_coordinates || null,
    adminNote: row.admin_note || null,
    deliveryQueued: Boolean(row.delivery_command_id),
    readyAt: row.ready_at || null,
    notifiedAt: row.notified_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requester: row.discord_id ? {
      discordId: row.discord_id,
      discordUsername: row.discord_username,
      displayName: row.discord_global_name || row.discord_username,
      avatarUrl: row.discord_avatar_hash
        ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(row.discord_id)}/${encodeURIComponent(row.discord_avatar_hash)}.png?size=64`
        : null
    } : null
  };
}

function safeEqual(first, second) {
  const left = Buffer.from(String(first || ''));
  const right = Buffer.from(String(second || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createResourceRequestService({
  pool, hashToken, parseCookies, readJsonBody, sendJson, sendError,
  requestIsHttps, trustProxy, getCurrentSession, queueBotCommand,
  enforceRateLimit, recordSystemLog
}) {
  const clientId = String(process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || '').trim();
  const configuredRedirectUri = String(process.env.DISCORD_OAUTH_REDIRECT_URI || '').trim();

  function assertDatabase() {
    if (!pool) throw Object.assign(new Error('DATABASE_URL is not configured on the server.'), { statusCode: 503 });
  }

  function discordConfigured() {
    return Boolean(clientId && clientSecret);
  }

  function cookieSecurity(req) {
    return requestIsHttps(req, trustProxy) ? '; Secure' : '';
  }

  function setCookie(req, res, name, value, maxAge) {
    res.appendHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${cookieSecurity(req)}`);
  }

  function clearCookie(req, res, name) {
    setCookie(req, res, name, '', 0);
  }

  function redirectUri(req) {
    if (configuredRedirectUri) return configuredRedirectUri;
    const forwardedHost = trustProxy ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
    const host = forwardedHost || String(req.headers.host || 'localhost');
    return `${requestIsHttps(req, trustProxy) ? 'https' : 'http'}://${host}/api/request/auth/callback`;
  }

  async function getRequesterSession(req) {
    if (!pool) return null;
    const token = parseCookies(req)[REQUEST_SESSION_COOKIE];
    if (!token) return null;
    const result = await pool.query(`
      SELECT u.discord_id,u.discord_username,u.discord_global_name,u.discord_avatar_hash,u.minecraft_username,
             s.token_hash,s.csrf_token_hash
      FROM resource_request_sessions s
      JOIN resource_request_users u ON u.discord_id=s.discord_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()
    `, [hashToken(token)]);
    return result.rows[0] || null;
  }

  async function createRequesterSession(req, res, discordId) {
    const token = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    await pool.query(`
      INSERT INTO resource_request_sessions(token_hash,discord_id,csrf_token_hash,expires_at)
      VALUES($1,$2,$3,NOW()+($4::int*INTERVAL '1 second'))
    `, [hashToken(token), discordId, hashToken(csrfToken), REQUEST_SESSION_SECONDS]);
    setCookie(req, res, REQUEST_SESSION_COOKIE, token, REQUEST_SESSION_SECONDS);
    return csrfToken;
  }

  async function getAdminRequestSession(req, admin) {
    const token = parseCookies(req)[REQUEST_ADMIN_SESSION_COOKIE];
    if (!token || !admin) return null;
    const result = await pool.query(`
      SELECT token_hash,site_user_id,csrf_token_hash
      FROM resource_request_admin_sessions
      WHERE token_hash=$1 AND site_user_id=$2 AND expires_at>NOW()
    `, [hashToken(token), admin.user.id]);
    return result.rows[0] || null;
  }

  async function context(req, { rotateCsrf = false, res = null } = {}) {
    const [requester, siteSession] = await Promise.all([
      getRequesterSession(req),
      getCurrentSession(req).catch(() => null)
    ]);
    const admin = siteSession?.user?.role === 'admin' ? siteSession : null;
    let adminRequestSession = await getAdminRequestSession(req, admin);
    let csrfToken = null;
    if (rotateCsrf && (requester || admin)) {
      csrfToken = crypto.randomBytes(32).toString('base64url');
      const csrfHash = hashToken(csrfToken);
      const updates = [];
      if (requester) updates.push(pool.query('UPDATE resource_request_sessions SET csrf_token_hash=$1 WHERE token_hash=$2', [csrfHash, requester.token_hash]));
      if (admin) {
        if (adminRequestSession) {
          updates.push(pool.query('UPDATE resource_request_admin_sessions SET csrf_token_hash=$1,expires_at=NOW()+($3::int*INTERVAL \'1 second\') WHERE token_hash=$2', [csrfHash, adminRequestSession.token_hash, REQUEST_SESSION_SECONDS]));
          adminRequestSession.csrf_token_hash = csrfHash;
        } else {
          const adminToken = crypto.randomBytes(32).toString('hex');
          const adminHash = hashToken(adminToken);
          updates.push(pool.query(`
            INSERT INTO resource_request_admin_sessions(token_hash,site_user_id,csrf_token_hash,expires_at)
            VALUES($1,$2,$3,NOW()+($4::int*INTERVAL '1 second'))
          `, [adminHash, admin.user.id, csrfHash, REQUEST_SESSION_SECONDS]));
          adminRequestSession = { token_hash: adminHash, site_user_id: admin.user.id, csrf_token_hash: csrfHash };
          if (res) setCookie(req, res, REQUEST_ADMIN_SESSION_COOKIE, adminToken, REQUEST_SESSION_SECONDS);
        }
      }
      await Promise.all(updates);
      if (requester) requester.csrf_token_hash = csrfHash;
    }
    return { requester, admin, adminRequestSession, csrfToken };
  }

  function assertCsrf(req, ctx, role) {
    const suppliedHash = hashToken(String(req.headers['x-csrf-token'] || ''));
    const expected = role === 'admin' ? ctx.adminRequestSession?.csrf_token_hash : ctx.requester?.csrf_token_hash;
    if (!expected || !safeEqual(suppliedHash, expected)) {
      throw Object.assign(new Error('Invalid CSRF token.'), { statusCode: 403 });
    }
  }

  async function beginDiscordAuth(req, res) {
    if (!discordConfigured()) {
      sendError(res, 503, 'Discord login is not configured yet.');
      return;
    }
    const state = crypto.randomBytes(24).toString('base64url');
    setCookie(req, res, OAUTH_STATE_COOKIE, state, OAUTH_STATE_SECONDS);
    const authorize = new URL('https://discord.com/oauth2/authorize');
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('scope', 'identify');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('redirect_uri', redirectUri(req));
    res.writeHead(302, { Location: authorize.toString(), 'Cache-Control': 'no-store' });
    res.end();
  }

  async function completeDiscordAuth(req, res, url) {
    const fail = reason => {
      clearCookie(req, res, OAUTH_STATE_COOKIE);
      res.writeHead(302, { Location: `/request?auth_error=${encodeURIComponent(reason)}`, 'Cache-Control': 'no-store' });
      res.end();
    };
    if (!discordConfigured()) return fail('not_configured');
    const expectedState = parseCookies(req)[OAUTH_STATE_COOKIE];
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!expectedState || !state || !safeEqual(expectedState, state) || !code) return fail('invalid_state');

    try {
      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(req)
      });
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000)
      });
      if (!tokenResponse.ok) throw new Error(`Discord token exchange failed (${tokenResponse.status}).`);
      const token = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10_000)
      });
      if (!userResponse.ok) throw new Error(`Discord profile request failed (${userResponse.status}).`);
      const user = await userResponse.json();
      if (!/^\d{5,32}$/.test(String(user.id || ''))) throw new Error('Discord returned an invalid user id.');
      await pool.query(`
        INSERT INTO resource_request_users(discord_id,discord_username,discord_global_name,discord_avatar_hash,updated_at)
        VALUES($1,$2,$3,$4,NOW())
        ON CONFLICT(discord_id) DO UPDATE SET
          discord_username=EXCLUDED.discord_username,
          discord_global_name=EXCLUDED.discord_global_name,
          discord_avatar_hash=EXCLUDED.discord_avatar_hash,
          updated_at=NOW()
      `, [String(user.id), String(user.username || 'Discord user').slice(0, 64), user.global_name ? String(user.global_name).slice(0, 128) : null, user.avatar ? String(user.avatar).slice(0, 128) : null]);
      await pool.query('DELETE FROM resource_request_sessions WHERE discord_id=$1 OR expires_at<=NOW()', [String(user.id)]);
      await createRequesterSession(req, res, String(user.id));
      clearCookie(req, res, OAUTH_STATE_COOKIE);
      await recordSystemLog({ level: 'info', category: 'resource_requests', actor: String(user.username || '').slice(0, 64), message: 'Requester logged in with Discord.' });
      res.writeHead(302, { Location: '/request?auth=success', 'Cache-Control': 'no-store' });
      res.end();
    } catch (error) {
      console.error('[Resource Requests] Discord OAuth failed:', error.message);
      fail('discord_failed');
    }
  }

  async function listRequests(ctx, url) {
    const adminView = Boolean(ctx.admin);
    if (!adminView && !ctx.requester) throw Object.assign(new Error('Discord login required.'), { statusCode: 401 });
    const status = String(url.searchParams.get('status') || '').toLowerCase();
    const values = [];
    const where = [];
    if (!adminView) {
      values.push(ctx.requester.discord_id);
      where.push(`r.requester_discord_id=$${values.length}`);
    }
    if (status && ADMIN_STATUSES.has(status)) {
      values.push(status);
      where.push(`r.status=$${values.length}`);
    }
    const result = await pool.query(`
      SELECT r.*,u.discord_id,u.discord_username,u.discord_global_name,u.discord_avatar_hash
      FROM resource_requests r
      JOIN resource_request_users u ON u.discord_id=r.requester_discord_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ready' THEN 2 WHEN 'notified' THEN 3 ELSE 4 END,
               r.created_at DESC
      LIMIT ${adminView ? 250 : 100}
    `, values);
    return result.rows.map(publicRequest);
  }

  async function createRequest(req, ctx) {
    if (!ctx.requester) throw Object.assign(new Error('Discord login required.'), { statusCode: 401 });
    assertCsrf(req, ctx, 'requester');
    const body = await readJsonBody(req, 32 * 1024);
    const resources = normalizeRequestText(body.resources);
    const minecraftUsername = normalizeMinecraftUsername(body.minecraftUsername || ctx.requester.minecraft_username);
    if (!minecraftUsername) throw Object.assign(new Error('Enter a valid Minecraft username.'), { statusCode: 400 });
    if (resources.length < 3) throw Object.assign(new Error('Describe the requested resources.'), { statusCode: 400 });
    const active = await pool.query('SELECT COUNT(*)::int AS count FROM resource_requests WHERE requester_discord_id=$1 AND status=ANY($2::text[])', [ctx.requester.discord_id, ACTIVE_STATUSES]);
    if (Number(active.rows[0]?.count) >= 3) throw Object.assign(new Error('You can have at most 3 active requests.'), { statusCode: 409 });
    await pool.query('UPDATE resource_request_users SET minecraft_username=$2,updated_at=NOW() WHERE discord_id=$1', [ctx.requester.discord_id, minecraftUsername]);
    const inserted = await pool.query(`
      INSERT INTO resource_requests(requester_discord_id,minecraft_username,resources)
      VALUES($1,$2,$3) RETURNING *
    `, [ctx.requester.discord_id, minecraftUsername, resources]);
    await recordSystemLog({
      level: 'info', category: 'resource_requests', actor: ctx.requester.discord_username,
      message: `Resource request #${inserted.rows[0].id} created.`,
      details: { requestId: String(inserted.rows[0].id), minecraftUsername }
    });
    return publicRequest(inserted.rows[0]);
  }

  async function updateProfile(req, ctx) {
    if (!ctx.requester) throw Object.assign(new Error('Discord login required.'), { statusCode: 401 });
    assertCsrf(req, ctx, 'requester');
    const body = await readJsonBody(req, 8 * 1024);
    const minecraftUsername = normalizeMinecraftUsername(body.minecraftUsername);
    if (!minecraftUsername) throw Object.assign(new Error('Enter a valid Minecraft username.'), { statusCode: 400 });
    const result = await pool.query(`UPDATE resource_request_users SET minecraft_username=$2,updated_at=NOW() WHERE discord_id=$1 RETURNING *`, [ctx.requester.discord_id, minecraftUsername]);
    return publicRequester(result.rows[0]);
  }

  async function updateRequest(req, ctx, requestId) {
    if (!ctx.admin) throw Object.assign(new Error('Administrator access is required.'), { statusCode: 403 });
    assertCsrf(req, ctx, 'admin');
    const body = await readJsonBody(req, 16 * 1024);
    const status = String(body.status || '').trim().toLowerCase();
    const coordinates = normalizeCoordinates(body.deliveryCoordinates);
    const adminNote = normalizeRequestText(body.adminNote).slice(0, 500) || null;
    if (!ADMIN_STATUSES.has(status)) throw Object.assign(new Error('Invalid request status.'), { statusCode: 400 });
    const existing = await pool.query('SELECT * FROM resource_requests WHERE id=$1', [requestId]);
    if (!existing.rowCount) throw Object.assign(new Error('Request not found.'), { statusCode: 404 });
    const current = existing.rows[0];
    const transitions = {
      pending: new Set(['pending', 'preparing', 'ready', 'cancelled']),
      preparing: new Set(['preparing', 'ready', 'cancelled']),
      ready: new Set(['ready']),
      notified: new Set(['notified', 'completed']),
      completed: new Set(['completed']),
      cancelled: new Set(['cancelled'])
    };
    if (!transitions[current.status]?.has(status)) {
      throw Object.assign(new Error(`Request cannot move from ${current.status} to ${status}.`), { statusCode: 409 });
    }
    const effectiveCoordinates = current.status === 'ready' ? (current.delivery_coordinates || '') : coordinates;
    if (status === 'ready' && !effectiveCoordinates) throw Object.assign(new Error('Coordinates are required before marking the request ready.'), { statusCode: 400 });

    const updated = await pool.query(`
      UPDATE resource_requests SET
        status=$2,
        delivery_coordinates=CASE WHEN $3::text='' THEN delivery_coordinates ELSE $3 END,
        admin_note=$4,
        ready_at=CASE WHEN $2='ready' THEN COALESCE(ready_at,NOW()) ELSE ready_at END,
        completed_at=CASE WHEN $2='completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
        updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [requestId, status, effectiveCoordinates, adminNote]);
    let row = updated.rows[0];

    if (status === 'ready' && !row.delivery_command_id) {
      const message = `Ваш заказ #${row.id} готов. Координаты: ${row.delivery_coordinates}`;
      const queued = await queueBotCommand(ctx.admin.user, 'site_whisper', {
        username: row.minecraft_username,
        message,
        commandAlias: 'w',
        resourceRequestId: String(row.id)
      }, { source: 'resource_request', idempotencyKey: `resource-request:${row.id}:delivery` });
      const linked = await pool.query(`
        UPDATE resource_requests SET delivery_command_id=$2,updated_at=NOW()
        WHERE id=$1 AND delivery_command_id IS NULL RETURNING *
      `, [row.id, queued.command.id]);
      row = linked.rows[0] || row;
    }
    await recordSystemLog({
      level: 'audit', category: 'resource_requests', actor: ctx.admin.user.username,
      message: `Resource request #${row.id} changed to ${status}.`,
      details: { requestId: String(row.id), minecraftUsername: row.minecraft_username, status }
    });
    return publicRequest(row);
  }

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/request/')) return false;
    try {
      assertDatabase();
      if (url.pathname === '/api/request/auth/start' && req.method === 'GET') {
        await beginDiscordAuth(req, res); return true;
      }
      if (url.pathname === '/api/request/auth/callback' && req.method === 'GET') {
        await completeDiscordAuth(req, res, url); return true;
      }
      if (url.pathname === '/api/request/session' && req.method === 'GET') {
        const ctx = await context(req, { rotateCsrf: true, res });
        sendJson(res, 200, {
          discordConfigured: discordConfigured(),
          authenticated: Boolean(ctx.requester),
          requester: publicRequester(ctx.requester),
          admin: ctx.admin ? { username: ctx.admin.user.username } : null,
          csrfToken: ctx.csrfToken
        });
        return true;
      }
      const ctx = await context(req);
      if (url.pathname === '/api/request/auth/logout' && req.method === 'POST') {
        if (ctx.requester) assertCsrf(req, ctx, 'requester');
        const token = parseCookies(req)[REQUEST_SESSION_COOKIE];
        if (token) await pool.query('DELETE FROM resource_request_sessions WHERE token_hash=$1', [hashToken(token)]);
        clearCookie(req, res, REQUEST_SESSION_COOKIE);
        sendJson(res, 200, { ok: true }); return true;
      }
      if (url.pathname === '/api/request/profile' && req.method === 'PUT') {
        sendJson(res, 200, { requester: await updateProfile(req, ctx) }); return true;
      }
      if (url.pathname === '/api/request/requests' && req.method === 'GET') {
        sendJson(res, 200, { requests: await listRequests(ctx, url) }); return true;
      }
      if (url.pathname === '/api/request/requests' && req.method === 'POST') {
        if (!enforceRateLimit(req, res, 'resource_request_create', ctx.requester?.discord_id || '', { limit: 5, windowMs: 60 * 60_000 })) return true;
        sendJson(res, 201, { request: await createRequest(req, ctx) }); return true;
      }
      const match = url.pathname.match(/^\/api\/request\/requests\/(\d+)$/);
      if (match && req.method === 'PATCH') {
        if (!enforceRateLimit(req, res, 'resource_request_admin', ctx.admin?.user?.username || '', { limit: 60, windowMs: 60_000 })) return true;
        sendJson(res, 200, { request: await updateRequest(req, ctx, match[1]) }); return true;
      }
      sendError(res, 404, 'Request route not found.');
      return true;
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      if (statusCode >= 500) console.error('[Resource Requests]', error);
      sendError(res, statusCode, statusCode >= 500 ? 'Internal server error.' : error.message);
      return true;
    }
  }

  return { handle };
}

module.exports = {
  ACTIVE_STATUSES,
  createResourceRequestService,
  normalizeCoordinates,
  normalizeMinecraftUsername,
  normalizeRequestText,
  publicRequest
};
