'use strict';

const sharp = require('sharp');

function minecraftAvatarSources(identity) {
  const encodedIdentity = encodeURIComponent(identity);
  return [
    `https://minotar.net/helm/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/wide`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/slim`
  ];
}

async function fetchOk(fetchImpl, url, signal, accept) {
  const response = await fetchImpl(url, { signal, headers: { Accept: accept } });
  if (!response.ok) throw new Error(`Avatar source returned HTTP ${response.status}.`);
  return response;
}

async function resolveOfficialMinecraftSkin({ username, uuid, fetchImpl = fetch, signal, includeBody = false } = {}) {
  let compactUuid = String(uuid || '').replace(/-/g, '').trim().toLowerCase();
  if (!compactUuid) {
    const profileResponse = await fetchOk(
      fetchImpl,
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      signal,
      'application/json'
    );
    const profile = await profileResponse.json();
    compactUuid = String(profile?.id || '').toLowerCase();
  }
  if (!/^[0-9a-f]{32}$/.test(compactUuid)) throw new Error('Minecraft profile has no valid UUID.');

  const sessionResponse = await fetchOk(
    fetchImpl,
    `https://sessionserver.mojang.com/session/minecraft/profile/${compactUuid}`,
    signal,
    'application/json'
  );
  const session = await sessionResponse.json();
  const encodedTextures = session?.properties?.find(property => property?.name === 'textures')?.value;
  const textures = JSON.parse(Buffer.from(String(encodedTextures || ''), 'base64').toString('utf8'));
  const skin = textures?.textures?.SKIN;
  const skinUrl = new URL(skin?.url);
  if (skinUrl.hostname !== 'textures.minecraft.net') throw new Error('Minecraft profile returned an invalid skin URL.');
  skinUrl.protocol = 'https:';
  const textureHash = skinUrl.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(textureHash || '')) throw new Error('Minecraft profile returned an invalid skin hash.');

  const result = {
    uuid: compactUuid,
    textureHash,
    textureUrl: skinUrl.href,
    model: skin?.metadata?.model === 'slim' ? 'slim' : 'classic'
  };
  if (!includeBody) return result;

  const skinResponse = await fetchOk(fetchImpl, skinUrl.href, signal, 'image/png');
  const body = Buffer.from(await skinResponse.arrayBuffer());
  const metadata = await sharp(body).metadata();
  if ((metadata.width || 0) < 64 || ![32, 64].includes(metadata.height || 0) || metadata.width !== 64) {
    throw new Error('Minecraft skin has invalid dimensions.');
  }
  return { ...result, body };
}

async function renderOfficialMinecraftAvatar({ username, uuid, fetchImpl = fetch, signal } = {}) {
  const resolvedSkin = await resolveOfficialMinecraftSkin({ username, uuid, fetchImpl, signal, includeBody: true });
  const skin = resolvedSkin.body;
  const metadata = await sharp(skin).metadata();
  if ((metadata.width || 0) < 48 || (metadata.height || 0) < 16) throw new Error('Minecraft skin has invalid dimensions.');

  const face = await sharp(skin).extract({ left: 8, top: 8, width: 8, height: 8 }).ensureAlpha().png().toBuffer();
  const outerLayer = await sharp(skin).extract({ left: 40, top: 8, width: 8, height: 8 }).ensureAlpha().png().toBuffer();
  const compositedFace = await sharp(face)
    .composite([{ input: outerLayer, blend: 'over' }])
    .png()
    .toBuffer();
  const compositedPixels = await sharp(compositedFace).ensureAlpha().raw().toBuffer();
  const visibleColors = new Set();
  for (let offset = 0; offset < compositedPixels.length; offset += 4) {
    if (compositedPixels[offset + 3] > 0) {
      visibleColors.add(compositedPixels.subarray(offset, offset + 3).toString('hex'));
    }
  }
  // A fully opaque, solid outer layer can hide a detailed base face and look
  // like a missing avatar. In that case retain the detailed 2D base layer.
  const visibleFace = visibleColors.size > 1 ? compositedFace : face;
  return sharp(visibleFace)
    .resize(64, 64, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

module.exports = { minecraftAvatarSources, renderOfficialMinecraftAvatar, resolveOfficialMinecraftSkin };
