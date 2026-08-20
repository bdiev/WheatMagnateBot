'use strict';

(() => {
  if (!('serviceWorker' in navigator)) return;

  // Reload only when an existing installation is replaced. On the very first
  // visit clients.claim() also fires controllerchange, but no reload is needed.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  let registration = null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const activateWaitingWorker = workerRegistration => {
    workerRegistration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  const checkForUpdate = () => registration?.update().catch(() => {});

  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then(workerRegistration => {
      registration = workerRegistration;
      activateWaitingWorker(workerRegistration);
      workerRegistration.addEventListener('updatefound', () => {
        const worker = workerRegistration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            activateWaitingWorker(workerRegistration);
          }
        });
      });
      return checkForUpdate();
    })
    .catch(() => {});

  // Installed PWAs can stay in the background instead of being fully closed.
  // Check again whenever such a window returns to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
})();
