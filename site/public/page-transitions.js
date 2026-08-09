'use strict';

(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const nativeTransitions = typeof document.startViewTransition === 'function';
  let navigationTimer = null;
  let entryStarted = false;

  function startFallbackEntry() {
    if (reducedMotion || nativeTransitions || entryStarted) return;
    entryStarted = true;
    window.requestAnimationFrame(() => root.classList.add('page-transition-ready'));
  }

  function navigateWithPageTransition(destination) {
    const url = destination instanceof URL ? destination : new URL(String(destination), window.location.href);
    if (reducedMotion || nativeTransitions) {
      window.location.assign(url.href);
      return;
    }
    if (root.classList.contains('page-transition-leaving')) return;
    root.classList.remove('page-transition-ready');
    root.classList.add('page-transition-leaving');
    window.clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => window.location.assign(url.href), 180);
  }

  window.navigateWithPageTransition = navigateWithPageTransition;

  startFallbackEntry();

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download') || anchor.dataset.noPageTransition != null) return;
    if (anchor.target && anchor.target !== '_self') return;

    const url = new URL(anchor.href, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;
    const sameDocument = url.pathname === window.location.pathname && url.search === window.location.search;
    if (sameDocument && url.hash) return;
    if (url.href === window.location.href || reducedMotion || nativeTransitions) return;

    event.preventDefault();
    navigateWithPageTransition(url);
  }, true);

  window.addEventListener('pageshow', event => {
    window.clearTimeout(navigationTimer);
    root.classList.remove('page-transition-leaving');
    if (event.persisted) {
      root.classList.remove('page-transition-ready');
      entryStarted = false;
      startFallbackEntry();
    }
  });
})();
