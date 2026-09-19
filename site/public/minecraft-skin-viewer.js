'use strict';

(function registerMinecraftSkinViewer(global) {
  const skinview3d = global.skinview3d;

  class MinecraftSkinViewer {
    constructor(canvas) {
      if (!skinview3d?.SkinViewer || !skinview3d?.RunningAnimation) {
        throw new Error('The skinview3d renderer is unavailable.');
      }

      this.canvas = canvas;
      this.disposed = false;
      this.loadRequestId = 0;

      const bounds = canvas.getBoundingClientRect();
      this.runningAnimation = new skinview3d.RunningAnimation();
      this.runningAnimation.speed = 0.2875;

      this.viewer = new skinview3d.SkinViewer({
        canvas,
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
        pixelRatio: 'match-device',
        fov: 50,
        zoom: 0.94,
        enableControls: true,
        animation: this.runningAnimation
      });

      this.viewer.controls.enableRotate = true;
      this.viewer.controls.enableZoom = true;
      this.viewer.controls.enablePan = false;
      this.viewer.globalLight.intensity = 2.45;
      this.viewer.cameraLight.intensity = 0.65;

      this.resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => this.resize())
        : null;
      this.resizeObserver?.observe(canvas);
    }

    resize() {
      if (this.disposed) return;
      const bounds = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      if (this.viewer.width !== width) this.viewer.width = width;
      if (this.viewer.height !== height) this.viewer.height = height;
    }

    async load(textureUrl, model = 'classic', capeUrl = null) {
      const requestId = ++this.loadRequestId;
      const skinModel = model === 'slim' ? 'slim' : 'default';

      try {
        await this.viewer.loadSkin(textureUrl, { model:skinModel });
        if (this.disposed || requestId !== this.loadRequestId) return;

        if (capeUrl) {
          try {
            await this.viewer.loadCape(capeUrl, { backEquipment:'elytra' });
          } catch (capeError) {
            this.viewer.loadCape(null);
            console.warn('[SkinViewer] Could not load the official elytra texture:', capeError);
          }
        } else {
          this.viewer.loadCape(null);
        }

        if (this.disposed || requestId !== this.loadRequestId) return;
        this.canvas.dispatchEvent(new CustomEvent('skinviewerload'));
      } catch (error) {
        if (this.disposed || requestId !== this.loadRequestId) return;
        this.canvas.dispatchEvent(new CustomEvent('skinviewererror', { detail:error }));
      }
    }

    reset() {
      if (this.disposed) return;
      this.viewer.resetCameraPose();
      this.viewer.zoom = 0.94;
    }

    destroy() {
      if (this.disposed) return;
      this.disposed = true;
      this.loadRequestId += 1;
      this.resizeObserver?.disconnect();
      this.viewer.dispose();
    }
  }

  global.MinecraftSkinViewer = MinecraftSkinViewer;
})(globalThis);
