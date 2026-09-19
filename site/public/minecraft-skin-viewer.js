'use strict';

(function registerMinecraftSkinViewer(global) {
  const skinview3d = global.skinview3d;

  class MinecraftSkinViewer {
    constructor(canvas) {
      if (!skinview3d?.SkinViewer || !skinview3d?.WalkingAnimation) {
        throw new Error('The skinview3d renderer is unavailable.');
      }

      this.canvas = canvas;
      this.disposed = false;
      this.loadRequestId = 0;
      this.animationPointer = null;

      const bounds = canvas.getBoundingClientRect();
      this.walkingAnimation = new skinview3d.WalkingAnimation();
      this.walkingAnimation.speed = 1;

      this.viewer = new skinview3d.SkinViewer({
        canvas,
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
        pixelRatio: 'match-device',
        fov: 50,
        zoom: 0.94,
        enableControls: true,
        animation: this.walkingAnimation
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

      this.onAnimationPointerDown = event => {
        if (event.button !== 0) return;
        this.animationPointer = { id:event.pointerId, x:event.clientX, y:event.clientY, moved:false };
      };
      this.onAnimationPointerMove = event => {
        if (!this.animationPointer || this.animationPointer.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - this.animationPointer.x, event.clientY - this.animationPointer.y) > 6) {
          this.animationPointer.moved = true;
        }
      };
      this.onAnimationPointerUp = event => {
        if (!this.animationPointer || this.animationPointer.id !== event.pointerId) return;
        const shouldToggle = !this.animationPointer.moved;
        this.animationPointer = null;
        if (shouldToggle) this.toggleAnimation();
      };
      this.onAnimationPointerCancel = () => { this.animationPointer = null; };
      canvas.addEventListener('pointerdown', this.onAnimationPointerDown);
      canvas.addEventListener('pointermove', this.onAnimationPointerMove);
      canvas.addEventListener('pointerup', this.onAnimationPointerUp);
      canvas.addEventListener('pointercancel', this.onAnimationPointerCancel);
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

    toggleAnimation() {
      if (this.disposed) return;
      this.walkingAnimation.paused = !this.walkingAnimation.paused;
      this.canvas.dataset.animationPaused = String(this.walkingAnimation.paused);
      this.canvas.dispatchEvent(new CustomEvent('skinvieweranimationchange', {
        detail:{ paused:this.walkingAnimation.paused }
      }));
    }

    destroy() {
      if (this.disposed) return;
      this.disposed = true;
      this.loadRequestId += 1;
      this.resizeObserver?.disconnect();
      this.canvas.removeEventListener('pointerdown', this.onAnimationPointerDown);
      this.canvas.removeEventListener('pointermove', this.onAnimationPointerMove);
      this.canvas.removeEventListener('pointerup', this.onAnimationPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onAnimationPointerCancel);
      this.viewer.dispose();
    }
  }

  global.MinecraftSkinViewer = MinecraftSkinViewer;
})(globalThis);
