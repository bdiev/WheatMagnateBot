'use strict';

const sharp = require('sharp');

const PLAYER_HEAD_CANVAS_SIZE = 512;
const PLAYER_HEAD_IMAGE_SIZE = 280;
const PLAYER_HEAD_IMAGE_OFFSET = (PLAYER_HEAD_CANVAS_SIZE - PLAYER_HEAD_IMAGE_SIZE) / 2;

async function preparePlayerHeadEmojiImage(input) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new TypeError('A non-empty player head image buffer is required.');
  }

  const centeredHead = await sharp(input, { failOn: 'error' })
    .resize(PLAYER_HEAD_IMAGE_SIZE, PLAYER_HEAD_IMAGE_SIZE, {
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
      left: PLAYER_HEAD_IMAGE_OFFSET,
      top: PLAYER_HEAD_IMAGE_OFFSET
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
