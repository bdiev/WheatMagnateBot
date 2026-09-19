'use strict';

(function exposeMinecraftSkinViewer(global) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function faceMap(x, y, width, height, depth) {
    return {
      top:[x + depth,y,width,depth], bottom:[x + depth + width,y,width,depth],
      right:[x,y + depth,depth,height], front:[x + depth,y + depth,width,height],
      left:[x + depth + width,y + depth,depth,height], back:[x + depth * 2 + width,y + depth,width,height]
    };
  }

  function skinParts(model, legacy) {
    const armWidth = model === 'slim' ? 3 : 4;
    const rightArmX = 6 + (4 - armWidth) / 2;
    const leftArmX = -rightArmX;
    const rightArm = faceMap(40,16,armWidth,12,4);
    const rightArmLayer = faceMap(40,32,armWidth,12,4);
    const rightLeg = faceMap(0,16,4,12,4);
    const rightLegLayer = faceMap(0,32,4,12,4);
    return [
      { center:[0,10,0], size:[8,8,8], uv:faceMap(0,0,8,8,8), layer:faceMap(32,0,8,8,8) },
      { center:[0,0,0], size:[8,12,4], uv:faceMap(16,16,8,12,4), layer:faceMap(16,32,8,12,4) },
      { center:[rightArmX,0,0], size:[armWidth,12,4], uv:rightArm, layer:rightArmLayer, angle:-0.12, pivot:6 },
      { center:[leftArmX,0,0], size:[armWidth,12,4], uv:legacy ? rightArm : faceMap(32,48,armWidth,12,4), layer:legacy ? null : faceMap(48,48,armWidth,12,4), angle:0.12, pivot:6 },
      { center:[2,-12,0], size:[4,12,4], uv:rightLeg, layer:rightLegLayer, angle:0.06, pivot:-6 },
      { center:[-2,-12,0], size:[4,12,4], uv:legacy ? rightLeg : faceMap(16,48,4,12,4), layer:legacy ? null : faceMap(0,48,4,12,4), angle:-0.06, pivot:-6 }
    ];
  }

  const FACE_VERTICES = {
    front:[3,2,1,0], back:[6,7,4,5], right:[2,6,5,1],
    left:[7,3,0,4], top:[7,6,2,3], bottom:[0,1,5,4]
  };

  function partVertices(part, expansion = 0) {
    const [cx,cy,cz] = part.center;
    const [w,h,d] = part.size.map(value => value + expansion * 2);
    const points = [
      [-w/2,-h/2,d/2],[w/2,-h/2,d/2],[w/2,h/2,d/2],[-w/2,h/2,d/2],
      [-w/2,-h/2,-d/2],[w/2,-h/2,-d/2],[w/2,h/2,-d/2],[-w/2,h/2,-d/2]
    ];
    return points.map(([x,y,z]) => {
      let worldY = y + cy;
      let worldZ = z + cz;
      if (part.angle) {
        const pivotY = part.pivot;
        const relativeY = worldY - pivotY;
        const cosine = Math.cos(part.angle);
        const sine = Math.sin(part.angle);
        worldY = pivotY + relativeY * cosine - worldZ * sine;
        worldZ = relativeY * sine + worldZ * cosine;
      }
      return [x + cx,worldY,worldZ];
    });
  }

  function triangleImage(ctx, image, source, destination) {
    const [[sx0,sy0],[sx1,sy1],[sx2,sy2]] = source;
    const [[dx0,dy0],[dx1,dy1],[dx2,dy2]] = destination;
    const determinant = sx0*(sy1-sy2)+sx1*(sy2-sy0)+sx2*(sy0-sy1);
    if (!determinant) return;
    const a=(dx0*(sy1-sy2)+dx1*(sy2-sy0)+dx2*(sy0-sy1))/determinant;
    const b=(dy0*(sy1-sy2)+dy1*(sy2-sy0)+dy2*(sy0-sy1))/determinant;
    const c=(dx0*(sx2-sx1)+dx1*(sx0-sx2)+dx2*(sx1-sx0))/determinant;
    const d=(dy0*(sx2-sx1)+dy1*(sx0-sx2)+dy2*(sx1-sx0))/determinant;
    const e=(dx0*(sx1*sy2-sx2*sy1)+dx1*(sx2*sy0-sx0*sy2)+dx2*(sx0*sy1-sx1*sy0))/determinant;
    const f=(dy0*(sx1*sy2-sx2*sy1)+dy1*(sx2*sy0-sx0*sy2)+dy2*(sx0*sy1-sx1*sy0))/determinant;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0,dy0); ctx.lineTo(dx1,dy1); ctx.lineTo(dx2,dy2); ctx.closePath(); ctx.clip();
    ctx.transform(a,b,c,d,e,f);
    ctx.drawImage(image,0,0);
    ctx.restore();
  }

  class MinecraftSkinViewer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha:true });
      this.image = null;
      this.model = 'classic';
      this.yaw = -0.55;
      this.pitch = -0.12;
      this.zoom = 1;
      this.pointer = null;
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(canvas);
      this.onPointerDown = event => this.pointerDown(event);
      this.onPointerMove = event => this.pointerMove(event);
      this.onPointerUp = event => this.pointerUp(event);
      this.onWheel = event => this.wheel(event);
      this.onKeyDown = event => this.keyDown(event);
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointermove', this.onPointerMove);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('pointercancel', this.onPointerUp);
      canvas.addEventListener('wheel', this.onWheel, { passive:false });
      canvas.addEventListener('keydown', this.onKeyDown);
    }

    load(url, model = 'classic') {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (this.pendingImage !== image) return;
        this.image = image;
        this.model = model === 'slim' ? 'slim' : 'classic';
        this.render();
        this.canvas.dispatchEvent(new CustomEvent('skinviewerload'));
      };
      image.onerror = () => {
        if (this.pendingImage === image) this.canvas.dispatchEvent(new CustomEvent('skinviewererror'));
      };
      this.pendingImage = image;
      image.src = url;
    }

    reset() { this.yaw=-0.55; this.pitch=-0.12; this.zoom=1; this.render(); }
    pointerDown(event) {
      this.pointer={ id:event.pointerId,x:event.clientX,y:event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('is-dragging');
    }
    pointerMove(event) {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      this.yaw += (event.clientX-this.pointer.x)*0.012;
      this.pitch = clamp(this.pitch+(event.clientY-this.pointer.y)*0.009,-1.15,1.15);
      this.pointer.x=event.clientX; this.pointer.y=event.clientY; this.render();
    }
    pointerUp(event) {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      this.pointer=null; this.canvas.classList.remove('is-dragging');
    }
    wheel(event) { event.preventDefault(); this.zoom=clamp(this.zoom-event.deltaY*0.001,0.72,1.45); this.render(); }
    keyDown(event) {
      const movement={ArrowLeft:[-0.12,0],ArrowRight:[0.12,0],ArrowUp:[0,-0.1],ArrowDown:[0,0.1]}[event.key];
      if (!movement) return;
      event.preventDefault(); this.yaw+=movement[0]; this.pitch=clamp(this.pitch+movement[1],-1.15,1.15); this.render();
    }

    project(point, width, height) {
      const [x,y,z] = point;
      const cosineY=Math.cos(this.yaw), sineY=Math.sin(this.yaw);
      const yawX=x*cosineY+z*sineY, yawZ=-x*sineY+z*cosineY;
      const cosineX=Math.cos(this.pitch), sineX=Math.sin(this.pitch);
      const pitchY=y*cosineX-yawZ*sineX, pitchZ=y*sineX+yawZ*cosineX;
      const camera=58, perspective=330*this.zoom, scale=perspective/(camera-pitchZ);
      return { x:width/2+yawX*scale, y:height/2+7*this.zoom-pitchY*scale, z:pitchZ };
    }

    render() {
      const rect=this.canvas.getBoundingClientRect();
      const width=Math.max(1,rect.width), height=Math.max(1,rect.height);
      const ratio=Math.min(2,global.devicePixelRatio || 1);
      if (this.canvas.width !== Math.round(width*ratio) || this.canvas.height !== Math.round(height*ratio)) {
        this.canvas.width=Math.round(width*ratio); this.canvas.height=Math.round(height*ratio);
      }
      const ctx=this.context;
      ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height); ctx.imageSmoothingEnabled=false;
      if (!this.image) return;
      const legacy=this.image.naturalHeight === 32;
      const faces=[];
      for (const part of skinParts(this.model,legacy)) {
        for (const [uvMap,expansion] of [[part.uv,0],[part.layer,0.32]]) {
          if (!uvMap) continue;
          const vertices=partVertices(part,expansion).map(point => this.project(point,width,height));
          for (const [name,indexes] of Object.entries(FACE_VERTICES)) {
            const uv=uvMap[name];
            if (!uv) continue;
            const points=indexes.map(index => vertices[index]);
            faces.push({ points,uv,depth:points.reduce((sum,point)=>sum+point.z,0)/4 });
          }
        }
      }
      faces.sort((first,second)=>first.depth-second.depth);
      for (const face of faces) {
        const [x,y,w,h]=face.uv;
        const source=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
        const destination=face.points.map(point=>[point.x,point.y]);
        triangleImage(ctx,this.image,[source[0],source[1],source[2]],[destination[0],destination[1],destination[2]]);
        triangleImage(ctx,this.image,[source[0],source[2],source[3]],[destination[0],destination[2],destination[3]]);
      }
    }

    destroy() {
      this.resizeObserver.disconnect();
      this.canvas.removeEventListener('pointerdown',this.onPointerDown);
      this.canvas.removeEventListener('pointermove',this.onPointerMove);
      this.canvas.removeEventListener('pointerup',this.onPointerUp);
      this.canvas.removeEventListener('pointercancel',this.onPointerUp);
      this.canvas.removeEventListener('wheel',this.onWheel);
      this.canvas.removeEventListener('keydown',this.onKeyDown);
    }
  }

  global.MinecraftSkinViewer = MinecraftSkinViewer;
})(globalThis);
