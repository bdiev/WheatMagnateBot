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

  function pickPlayerAccent(pixels, identity = 'player') {
    const bins = new Map();
    let opaquePixelCount = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 96) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const hsl = rgbToHsl(red, green, blue);
      const lightnessFit = 1 - Math.min(0.72, Math.abs(hsl.lightness - 0.5) * 1.25);
      const vividness = 0.22 + (hsl.saturation * hsl.saturation * 1.9);
      const weight = vividness * lightnessFit * (alpha / 255);
      const key = `${red >> 5}:${green >> 5}:${blue >> 5}`;
      const bin = bins.get(key) || { count: 0, score: 0, red: 0, green: 0, blue: 0 };
      bin.count += 1;
      bin.score += weight;
      bin.red += red * weight;
      bin.green += green * weight;
      bin.blue += blue * weight;
      bins.set(key, bin);
      opaquePixelCount += 1;
    }

    const minimumCount = Math.max(1, Math.floor(opaquePixelCount * 0.012));
    const candidates = [...bins.values()]
      .filter(bin => bin.count >= minimumCount)
      .sort((left, right) => (right.score * (1 + Math.log1p(right.count) * 0.07)) - (left.score * (1 + Math.log1p(left.count) * 0.07)));
    const selected = candidates[0];
    const hash = identityHash(identity);
    if (!selected || !selected.score) {
      return { hue: hash % 360, saturation: 68, source: 'fallback' };
    }

    const average = rgbToHsl(
      selected.red / selected.score,
      selected.green / selected.score,
      selected.blue / selected.score
    );
    const identityOffset = ((hash / 0xffffffff) * 5.5) - 2.75;
    const hasAvatarHue = average.saturation >= 0.1;
    return {
      hue: hasAvatarHue ? (average.hue + identityOffset + 360) % 360 : hash % 360,
      saturation: clamp(Math.round(average.saturation * 112), 58, 84),
      source: hasAvatarHue ? 'avatar' : 'fallback'
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
    return whiteContrast >= darkContrast ? '#ffffff' : '#0b0f14';
  }

  function createPlayerAccentTheme(accent) {
    const hue = Number(accent?.hue) || 0;
    const saturation = clamp(Number(accent?.saturation) || 68, 58, 84);
    const lightAccent = 38;
    const darkAccent = 62;
    return {
      '--player-accent-light': `hsl(${hue.toFixed(1)} ${saturation}% ${lightAccent}%)`,
      '--player-accent-light-strong': `hsl(${hue.toFixed(1)} ${Math.max(52, saturation - 4)}% 27%)`,
      '--player-accent-light-contrast': contrastColor(hue, saturation, lightAccent),
      '--player-accent-dark': `hsl(${hue.toFixed(1)} ${saturation}% ${darkAccent}%)`,
      '--player-accent-dark-strong': `hsl(${hue.toFixed(1)} ${Math.max(60, saturation)}% 74%)`,
      '--player-accent-dark-contrast': contrastColor(hue, saturation, darkAccent)
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
