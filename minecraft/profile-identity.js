'use strict';

function dashedMinecraftUuid(value) {
  const compact = String(value || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

async function resolveMinecraftProfile(username, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000
} = {}) {
  const safeUsername = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(safeUsername)) return null;

  const response = await fetchImpl(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(safeUsername)}`,
    { signal:AbortSignal.timeout(timeoutMs) }
  );
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Mojang API returned HTTP ${response.status}`);

  const profile = await response.json();
  const id = String(profile?.id || '').trim();
  const name = String(profile?.name || safeUsername).trim();
  if (!/^[0-9a-f]{32}$/i.test(id) || !/^[A-Za-z0-9_]{1,16}$/.test(name)) return null;
  return { id,name };
}

module.exports = { dashedMinecraftUuid,resolveMinecraftProfile };
