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

  // Below this share of colourful pixels a skin reads as black, white or
  // grey, and its accent stays neutral instead of inventing a hue.
  const CHROMATIC_SHARE_MINIMUM = 0.1;

  function pickPlayerAccent(pixels, identity = 'player') {
    const bins = new Map();
    let opaquePixelCount = 0;
    let chromaticPixelCount = 0;
    // Faint colour cast of the whole avatar, for tinting a neutral accent
    let tintX = 0;
    let tintY = 0;
    let tintWeight = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 96) continue;
      opaquePixelCount += 1;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const hsl = rgbToHsl(red, green, blue);
      // HSL saturation calls a near-black (20,10,10) "33% saturated"; chroma
      // measures how much colour the eye actually sees.
      const chroma = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
      if (chroma >= 0.035) {
        const angle = hsl.hue * Math.PI / 180;
        tintX += Math.cos(angle) * chroma;
        tintY += Math.sin(angle) * chroma;
        tintWeight += chroma;
      }
      if (chroma < 0.16 || hsl.lightness < 0.1 || hsl.lightness > 0.92) continue;
      chromaticPixelCount += 1;
      const lightnessFit = 1 - Math.min(0.72, Math.abs(hsl.lightness - 0.5) * 1.25);
      const weight = (0.35 + chroma * 1.8) * lightnessFit * (alpha / 255);
      const key = `${red >> 5}:${green >> 5}:${blue >> 5}`;
      const bin = bins.get(key) || { count: 0, score: 0, red: 0, green: 0, blue: 0 };
      bin.count += 1;
      bin.score += weight;
      bin.red += red * weight;
      bin.green += green * weight;
      bin.blue += blue * weight;
      bins.set(key, bin);
    }

    const hash = identityHash(identity);
    // Nothing readable (the image failed): a stable hue from the name
    if (!opaquePixelCount) return { hue: hash % 360, saturation: 68, source: 'fallback' };

    const minimumCount = Math.max(1, Math.floor(chromaticPixelCount * 0.03));
    const candidates = chromaticPixelCount / opaquePixelCount < CHROMATIC_SHARE_MINIMUM
      ? []
      : [...bins.values()]
        .filter(bin => bin.count >= minimumCount)
        .sort((left, right) => (right.score * (1 + Math.log1p(right.count) * 0.07)) - (left.score * (1 + Math.log1p(left.count) * 0.07)));
    const selected = candidates[0];
    if (!selected || !selected.score) {
      const tintHue = tintWeight ? (Math.atan2(tintY, tintX) * 180 / Math.PI + 360) % 360 : 0;
      const tintStrength = Math.hypot(tintX, tintY) / opaquePixelCount;
      return { hue: Math.round(tintHue), saturation: clamp(Math.round(tintStrength * 90), 0, 14), source: 'neutral' };
    }

    const average = rgbToHsl(
      selected.red / selected.score,
      selected.green / selected.score,
      selected.blue / selected.score
    );
    const identityOffset = ((hash / 0xffffffff) * 5.5) - 2.75;
    return {
      hue: (average.hue + identityOffset + 360) % 360,
      saturation: clamp(Math.round(average.saturation * 112), 58, 84),
      source: 'avatar'
    };
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
      : clamp(Number(accent?.saturation) || 68, 58, 84);
    const lightAccent = neutral ? 30 : 38;
    const darkAccent = neutral ? 72 : 62;
    const lightStrong = neutral ? `${saturation}% 20%` : `${Math.max(52, saturation - 4)}% 27%`;
    const darkStrong = neutral ? `${saturation}% 84%` : `${Math.max(60, saturation)}% 74%`;
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

  return { accentFromImage, createPlayerAccentTheme, identityHash, pickPlayerAccent };
});
