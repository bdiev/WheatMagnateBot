'use strict';

function minecraftAvatarSources(identity) {
  const encodedIdentity = encodeURIComponent(identity);
  return [
    `https://minotar.net/helm/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/wide`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/slim`,
    // Some valid skins (notably moooomoooo) render as a tiny solid-black PNG
    // through the flat-avatar endpoint. The 3D head renderer still preserves
    // their face details and gives the profile a usable final fallback.
    `https://mc-heads.net/head/${encodedIdentity}/64`
  ];
}

module.exports = { minecraftAvatarSources };
