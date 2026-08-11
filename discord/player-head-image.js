'use strict';

const sharp = require('sharp');

const PLAYER_HEAD_CANVAS_SIZE = 512;
const PLAYER_HEAD_IMAGE_SIZE = 280;
const PLAYER_HEAD_IMAGE_OFFSET = (PLAYER_HEAD_CANVAS_SIZE - PLAYER_HEAD_IMAGE_SIZE) / 2;

async function preparePlayerHeadEmojiImage(input, { imageSize = PLAYER_HEAD_IMAGE_SIZE } = {}) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new TypeError('A non-empty player head image buffer is required.');
  }
  if (!Number.isInteger(imageSize) || imageSize < 1 || imageSize > PLAYER_HEAD_CANVAS_SIZE) {
    throw new RangeError(`Player head image size must be between 1 and ${PLAYER_HEAD_CANVAS_SIZE}.`);
  }
  const imageOffset = Math.floor((PLAYER_HEAD_CANVAS_SIZE - imageSize) / 2);

  const centeredHead = await sharp(input, { failOn: 'error' })
    .resize(imageSize, imageSize, {
      fit: 'fill',
      kernel: sharp.kernel.nearest
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: PLAYER_HEAD_CANVAS_SIZE,
      height: PLAYER_HEAD_CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: centeredHead,
      left: imageOffset,
      top: imageOffset
    }])
    .png()
    .toBuffer();
}

module.exports = {
  PLAYER_HEAD_CANVAS_SIZE,
  PLAYER_HEAD_IMAGE_OFFSET,
  PLAYER_HEAD_IMAGE_SIZE,
  preparePlayerHeadEmojiImage
};
