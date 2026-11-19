'use strict';

const sharp = require('sharp');

// In lossless WebP, quality controls compression search, not image quality.
// Keep effort bounded: effort 6 / quality 100 is too expensive on the VPS.
const LOSSLESS_OPTIONS = Object.freeze({ lossless: true, quality: 100, effort: 4, exact: true });

async function sameTilePixels(left, right) {
  const decode = image => sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([decode(left), decode(right)]);
  return a.info.width === b.info.width && a.info.height === b.info.height && a.data.equals(b.data);
}

/** Return the original buffer unless the replacement is smaller and pixel-identical. */
async function compressStoredTile(original) {
  const candidate = await sharp(original).webp(LOSSLESS_OPTIONS).toBuffer();
  if (candidate.length >= original.length) return original;
  if (!await sameTilePixels(original, candidate)) throw new Error('Tile compression changed decoded pixels');
  return candidate;
}

/** Retain the existing encoder as a size ceiling for new regions. */
async function encodeRegionTile(pixels, info) {
  const input = () => sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } });
  const baseline = await input().webp({ lossless: true, effort: 4, exact: true }).toBuffer();
  const compressed = await input().webp(LOSSLESS_OPTIONS).toBuffer();
  return compressed.length < baseline.length ? compressed : baseline;
}

module.exports = { compressStoredTile, encodeRegionTile, sameTilePixels };
