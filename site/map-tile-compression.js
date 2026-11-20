'use strict';

const sharp = require('sharp');

// In lossless WebP, quality controls compression search, not image quality.
// Keep effort bounded: effort 6 / quality 100 is too expensive on the VPS.
const LOSSLESS_OPTIONS = Object.freeze({ lossless: true, quality: 100, effort: 4, exact: true });

const decodeTile = image => sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/** True if an encoded tile decodes to exactly these RGBA pixels. */
async function tileMatchesPixels(image, pixels, info) {
  const decoded = await decodeTile(image);
  return decoded.info.width === info.width && decoded.info.height === info.height
    && decoded.info.channels === info.channels && decoded.data.equals(pixels);
}

async function sameTilePixels(left, right) {
  const { data, info } = await decodeTile(left);
  return tileMatchesPixels(right, data, info);
}

/** Return the original buffer unless the replacement is smaller and pixel-identical. */
async function compressStoredTile(original) {
  // Decode once: the same pixels feed the encoder and the verification.
  const { data, info } = await decodeTile(original);
  const candidate = await encodeRegionTile(data, info);
  if (candidate.length >= original.length) return original;
  if (!await tileMatchesPixels(candidate, data, info)) throw new Error('Tile compression changed decoded pixels');
  return candidate;
}

/** One bounded-effort lossless encode; exact keeps RGB under transparent pixels. */
function encodeRegionTile(pixels, info) {
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .webp(LOSSLESS_OPTIONS).toBuffer();
}

module.exports = { compressStoredTile, encodeRegionTile, sameTilePixels, tileMatchesPixels };
