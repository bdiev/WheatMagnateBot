'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {
  PLAYER_HEAD_CANVAS_SIZE,
  PLAYER_HEAD_IMAGE_OFFSET,
  PLAYER_HEAD_IMAGE_SIZE,
  preparePlayerHeadEmojiImage
} = require('../discord/player-head-image');

function pixelAt(raw, channels, x, y) {
  const offset = (y * PLAYER_HEAD_CANVAS_SIZE + x) * channels;
  return Array.from(raw.subarray(offset, offset + channels));
}

(async () => {
  const source = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 214, g: 55, b: 72, alpha: 1 }
    }
  }).png().toBuffer();

  const output = await preparePlayerHeadEmojiImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(PLAYER_HEAD_CANVAS_SIZE, 512);
  assert.equal(PLAYER_HEAD_IMAGE_SIZE, 280);
  assert.equal(PLAYER_HEAD_IMAGE_OFFSET, 116);

  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(pixelAt(data, info.channels, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixelAt(data, info.channels, 115, 116), [0, 0, 0, 0]);
  assert.deepEqual(pixelAt(data, info.channels, 116, 116), [214, 55, 72, 255]);
  assert.deepEqual(pixelAt(data, info.channels, 395, 395), [214, 55, 72, 255]);
  assert.deepEqual(pixelAt(data, info.channels, 396, 396), [0, 0, 0, 0]);
  assert.ok(output.length < 256 * 1024, 'prepared PNG must fit the Discord emoji upload limit');
  await assert.rejects(() => preparePlayerHeadEmojiImage(Buffer.alloc(0)), /non-empty/);

  const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
  assert.match(botSource, /REQUESTED_PLAYER_HEAD_EMOJI_REDRAWS[\s\S]*username: 'ObbyMagnate', version: 1/,
    'ObbyMagnate must be queued for one-time redraw');
  assert.match(botSource, /attachment: preparedImage,[\s\S]*name: temporaryName[\s\S]*existing\.delete\(\)[\s\S]*temporaryEmoji\.setName\(emojiName\)/,
    'redraw must upload the replacement before deleting and renaming the old emoji');
  assert.match(botSource, /redrawState\[key\] = request\.version[\s\S]*savePlayerHeadEmojiRedrawState/,
    'successful redraws must be persisted and not repeated every startup');

  console.log('Player head image tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
