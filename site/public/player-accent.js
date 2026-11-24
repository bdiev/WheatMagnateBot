'use strict';

(function exposePlayerAccent(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlayerAccent = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function identityHash(value) {
    let hash = 2166136261;
    for (const character of String(value || 'player').toLowerCase()) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function rgbToHsl(red, green, blue) {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    if (!chroma) return { hue: 0, saturation: 0, lightness };

    let hue;
    if (maximum === r) hue = ((g - b) / chroma) % 6;
    else if (maximum === g) hue = ((b - r) / chroma) + 2;
    else hue = ((r - g) / chroma) + 4;
    hue = (hue * 60 + 360) % 360;
    const saturation = chroma / (1 - Math.abs((2 * lightness) - 1));
    return { hue, saturation, lightness };
  }

  // OKLab: distances and chroma that match what the eye sees, so dark navy
  // counts as a colour while a near-black brown counts as black.
  function srgbToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function rgbToOklab(red, green, blue) {
    const r = srgbToLinear(red);
    const g = srgbToLinear(green);
    const b = srgbToLinear(blue);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }

  // Below this share of colourful pixels a skin reads as black, white or
  // grey, and its accent stays neutral instead of inventing a hue.
  const CHROMATIC_SHARE_MINIMUM = 0.1;

  // Faces and hands: present on almost every skin, so they say little about
  // the player. They still win when the whole skin is that colour.
  function skinToneFactor(lab, chroma) {
    const hue = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
    const isSkinTone = hue >= 35 && hue <= 80 && chroma >= 0.03 && chroma <= 0.13 && lab.L >= 0.55 && lab.L <= 0.9;
    return isSkinTone ? 0.3 : 1;
  }

  function pickPlayerAccent(pixels, identity = 'player') {
    const bins = new Map();
    const chromaticPixels = [];
    let opaquePixelCount = 0;
    // Faint colour cast of the whole skin, for tinting a neutral accent
    let tintA = 0;
    let tintB = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 96) continue;
      opaquePixelCount += 1;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const lab = rgbToOklab(red, green, blue);
      tintA += lab.a;
      tintB += lab.b;
      const chroma = Math.hypot(lab.a, lab.b);
      if (chroma < 0.045 || lab.L < 0.2 || lab.L > 0.96) continue;
      // Area first: a big shirt beats a small vivid badge; colourfulness and
      // a usable middle lightness only tip the balance.
      const weight = (0.55 + chroma * 5) * (1 - Math.min(0.6, Math.abs(lab.L - 0.6) * 0.9)) * skinToneFactor(lab, chroma) * (alpha / 255);
      const key = `${Math.round(lab.L / 0.08)}:${Math.round(lab.a / 0.035)}:${Math.round(lab.b / 0.035)}`;
      const bin = bins.get(key) || { count: 0, score: 0, L: 0, a: 0, b: 0 };
      bin.count += 1;
      bin.score += weight;
      bin.L += lab.L * weight;
      bin.a += lab.a * weight;
      bin.b += lab.b * weight;
      bins.set(key, bin);
      chromaticPixels.push({ red, green, blue, lab, weight });
    }

    const hash = identityHash(identity);
    // Nothing readable (the image failed): a stable hue from the name
    if (!opaquePixelCount) return { hue: hash % 360, saturation: 68, source: 'fallback' };

    if (chromaticPixels.length / opaquePixelCount < CHROMATIC_SHARE_MINIMUM || !bins.size) {
      const a = tintA / opaquePixelCount;
      const b = tintB / opaquePixelCount;
      // Back through a tiny sRGB sample to express the cast as an HSL hue
      const castHue = Math.hypot(a, b) > 0.004 ? oklabHueToHslHue(a, b) : 0;
      return { hue: Math.round(castHue), saturation: clamp(Math.round(Math.hypot(a, b) * 400), 0, 14), source: 'neutral' };
    }

    // The strongest colour region, then every pixel close to it, averaged:
    // neighbouring shades of one shirt count together.
    const top = [...bins.values()].sort((left, right) => right.score - left.score)[0];
    const centre = { L: top.L / top.score, a: top.a / top.score, b: top.b / top.score };
    let red = 0;
    let green = 0;
    let blue = 0;
    let total = 0;
    for (const pixel of chromaticPixels) {
      const distance = Math.hypot(pixel.lab.L - centre.L, pixel.lab.a - centre.a, pixel.lab.b - centre.b);
      if (distance > 0.1) continue;
      red += pixel.red * pixel.weight;
      green += pixel.green * pixel.weight;
      blue += pixel.blue * pixel.weight;
      total += pixel.weight;
    }
    const average = rgbToHsl(red / total, green / total, blue / total);
    const identityOffset = ((hash / 0xffffffff) * 5.5) - 2.75;
    return {
      hue: (average.hue + identityOffset + 360) % 360,
      // Faithful to the skin: a muted coat stays muted, a vivid one vivid
      saturation: clamp(Math.round(average.saturation * 100), 30, 84),
      source: 'avatar'
    };
  }

  function oklabHueToHslHue(a, b) {
    // A mid-grey nudged along (a, b), converted back to sRGB
    const L = 0.6;
    const scale = 0.08 / Math.max(1e-6, Math.hypot(a, b));
    const l = (L + 0.3963377774 * a * scale + 0.2158037573 * b * scale) ** 3;
    const m = (L - 0.1055613458 * a * scale - 0.0638541728 * b * scale) ** 3;
    const s = (L - 0.0894841775 * a * scale - 1.2914855480 * b * scale) ** 3;
    const toSrgb = value => {
      const v = clamp(value, 0, 1);
      return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
    };
    return rgbToHsl(
      toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ).hue;
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360;
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs((2 * l) - 1)) * s;
    const section = h / 60;
    const secondary = chroma * (1 - Math.abs((section % 2) - 1));
    const values = section < 1 ? [chroma, secondary, 0]
      : section < 2 ? [secondary, chroma, 0]
        : section < 3 ? [0, chroma, secondary]
          : section < 4 ? [0, secondary, chroma]
            : section < 5 ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
    const match = l - (chroma / 2);
    return values.map(value => Math.round((value + match) * 255));
  }

  function contrastColor(hue, saturation, lightness) {
    const [red, green, blue] = hslToRgb(hue, saturation, lightness).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    const whiteContrast = 1.05 / (luminance + 0.05);
    const darkContrast = (luminance + 0.05) / 0.055;
    const isLight = whiteContrast >= darkContrast;
    // The companion shadow always leans the opposite way from the text
    // itself, so it reads as a drop shadow instead of a duplicate outline.
    return { color: isLight ? '#ffffff' : '#0b0f14', shadow: isLight ? 'rgba(0, 0, 0, .3)' : 'rgba(255, 255, 255, .35)' };
  }

  function createPlayerAccentTheme(accent) {
    const hue = Number(accent?.hue) || 0;
    // Black, white and grey skins get graphite in the light theme and silver
    // in the dark one, keeping only a faint cast of their own colour.
    const neutral = accent?.source === 'neutral';
    const saturation = neutral
      ? clamp(Number(accent?.saturation) || 0, 0, 14)
      : clamp(Number(accent?.saturation) || 68, 30, 84);
    const lightAccent = neutral ? 30 : 38;
    const darkAccent = neutral ? 72 : 62;
    const lightStrong = neutral ? `${saturation}% 20%` : `${Math.max(28, saturation - 4)}% 27%`;
    const darkStrong = neutral ? `${saturation}% 84%` : `${Math.max(30, saturation)}% 74%`;
    const lightContrast = contrastColor(hue, saturation, lightAccent);
    const darkContrast = contrastColor(hue, saturation, darkAccent);
    return {
      '--player-accent-light': `hsl(${hue.toFixed(1)} ${saturation}% ${lightAccent}%)`,
      '--player-accent-light-strong': `hsl(${hue.toFixed(1)} ${lightStrong})`,
      '--player-accent-light-contrast': lightContrast.color,
      '--player-accent-light-contrast-shadow': lightContrast.shadow,
      '--player-accent-dark': `hsl(${hue.toFixed(1)} ${saturation}% ${darkAccent}%)`,
      '--player-accent-dark-strong': `hsl(${hue.toFixed(1)} ${darkStrong})`,
      '--player-accent-dark-contrast': darkContrast.color,
      '--player-accent-dark-contrast-shadow': darkContrast.shadow
    };
  }

  function accentFromImage(image, identity = 'player') {
    if (!image?.naturalWidth || !image?.naturalHeight || typeof document === 'undefined') {
      return pickPlayerAccent([], identity);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(64, image.naturalWidth);
    canvas.height = Math.min(64, image.naturalHeight);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return pickPlayerAccent([], identity);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return pickPlayerAccent(context.getImageData(0, 0, canvas.width, canvas.height).data, identity);
  }

  // The front of the whole player as others see it: head, body, arms and
  // legs, each outer layer over its base where it has pixels.
  function frontSkinPixels(texture, width, height, model = 'classic') {
    const scale = width / 64;
    const legacy = height === width / 2;
    const armWidth = model === 'slim' ? 3 : 4;
    const read = (x, y) => {
      const offset = ((Math.floor(y * scale) * width) + Math.floor(x * scale)) * 4;
      return [texture[offset], texture[offset + 1], texture[offset + 2], texture[offset + 3]];
    };
    const parts = [
      [8, 8, 8, 8, 40, 8],
      [20, 20, 8, 12, legacy ? null : 20, 36],
      [44, 20, armWidth, 12, legacy ? null : 44, 36],
      [legacy ? 44 : 36, legacy ? 20 : 52, armWidth, 12, legacy ? null : 52, 52],
      [4, 20, 4, 12, legacy ? null : 4, 36],
      [legacy ? 4 : 20, legacy ? 20 : 52, 4, 12, legacy ? null : 4, 52]
    ];
    const pixels = [];
    for (const [baseX, baseY, partWidth, partHeight, overlayX, overlayY] of parts) {
      for (let y = 0; y < partHeight; y += 1) {
        for (let x = 0; x < partWidth; x += 1) {
          const overlay = overlayX == null ? null : read(overlayX + x, overlayY + y);
          pixels.push(...(overlay && overlay[3] >= 96 ? overlay : read(baseX + x, baseY + y)));
        }
      }
    }
    return Uint8ClampedArray.from(pixels);
  }

  function accentFromSkinTexture(image, identity = 'player', model = 'classic') {
    if (!image?.naturalWidth || !image?.naturalHeight || typeof document === 'undefined') {
      return pickPlayerAccent([], identity);
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return pickPlayerAccent([], identity);
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return pickPlayerAccent(frontSkinPixels(data, canvas.width, canvas.height, model), identity);
  }

  return { accentFromImage, accentFromSkinTexture, createPlayerAccentTheme, frontSkinPixels, identityHash, pickPlayerAccent };
});
