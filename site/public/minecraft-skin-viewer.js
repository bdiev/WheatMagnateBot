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

  function skinParts(model, legacy, runPhase = 0) {
    const armWidth = model === 'slim' ? 3 : 4;
    const rightArmX = 6 + (4 - armWidth) / 2;
    const leftArmX = -rightArmX;
    const stride = Math.sin(runPhase) * 0.72;
    const bounce = Math.abs(Math.cos(runPhase)) * 0.22;
    const rightArm = faceMap(40,16,armWidth,12,4);
    const rightArmLayer = faceMap(40,32,armWidth,12,4);
    const rightLeg = faceMap(0,16,4,12,4);
    const rightLegLayer = faceMap(0,32,4,12,4);
    return [
      { center:[0,10+bounce,0], size:[8,8,8], uv:faceMap(0,0,8,8,8), layer:faceMap(32,0,8,8,8) },
      { center:[0,bounce,0], size:[8,12,4], uv:faceMap(16,16,8,12,4), layer:faceMap(16,32,8,12,4) },
      { center:[rightArmX,bounce,0], size:[armWidth,12,4], uv:rightArm, layer:rightArmLayer, angle:stride, pivot:6+bounce },
      { center:[leftArmX,bounce,0], size:[armWidth,12,4], uv:legacy ? rightArm : faceMap(32,48,armWidth,12,4), layer:legacy ? null : faceMap(48,48,armWidth,12,4), angle:-stride, pivot:6+bounce },
      { center:[2,-12+bounce,0], size:[4,12,4], uv:rightLeg, layer:rightLegLayer, angle:-stride, pivot:-6+bounce },
      { center:[-2,-12+bounce,0], size:[4,12,4], uv:legacy ? rightLeg : faceMap(16,48,4,12,4), layer:legacy ? null : faceMap(0,48,4,12,4), angle:stride, pivot:-6+bounce }
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

  function texturePixels(image) {
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0);
    return { width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data };
  }

  function interpolate(first,second,amount) {
    return [first[0]+(second[0]-first[0])*amount,first[1]+(second[1]-first[1])*amount];
  }

  function facePoint(corners,u,v) {
    return interpolate(interpolate(corners[0],corners[1],u),interpolate(corners[3],corners[2],u),v);
  }

  function drawPixelFace(ctx,texture,uv,corners) {
    const [sourceX,sourceY,width,height]=uv;
    for (let y=0;y<height;y+=1) {
      for (let x=0;x<width;x+=1) {
        const offset=((sourceY+y)*texture.width+sourceX+x)*4;
        const alpha=texture.data[offset+3];
        if (!alpha) continue;
        const points=[
          facePoint(corners,x/width,y/height),
          facePoint(corners,(x+1)/width,y/height),
          facePoint(corners,(x+1)/width,(y+1)/height),
          facePoint(corners,x/width,(y+1)/height)
        ];
        const center=points.reduce((result,point)=>[result[0]+point[0]/4,result[1]+point[1]/4],[0,0]);
        const expanded=points.map(point=>{
          const dx=point[0]-center[0],dy=point[1]-center[1],length=Math.hypot(dx,dy)||1;
          return [point[0]+dx/length*.22,point[1]+dy/length*.22];
        });
        ctx.beginPath(); ctx.moveTo(...expanded[0]);
        expanded.slice(1).forEach(point=>ctx.lineTo(...point));
        ctx.closePath();
        ctx.fillStyle=`rgba(${texture.data[offset]},${texture.data[offset+1]},${texture.data[offset+2]},${alpha/255})`;
        ctx.fill();
      }
    }
  }

  class MinecraftSkinViewer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha:true });
      this.image = null;
      this.capeImage = null;
      this.model = 'classic';
      this.yaw = -0.55;
      this.pitch = -0.12;
      this.zoom = 1.25;
      this.pointer = null;
      this.startedAt = performance.now();
      this.animationFrame = null;
      this.reducedMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
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

    load(url, model = 'classic', capeUrl = null) {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (this.pendingImage !== image) return;
        this.image = image;
        this.skinPixels = texturePixels(image);
        this.model = model === 'slim' ? 'slim' : 'classic';
        this.startedAt = performance.now();
        this.startAnimation();
        this.canvas.dispatchEvent(new CustomEvent('skinviewerload'));
      };
      image.onerror = () => {
        if (this.pendingImage === image) this.canvas.dispatchEvent(new CustomEvent('skinviewererror'));
      };
      this.pendingImage = image;
      image.src = url;
      this.capeImage = null;
      this.capePixels = null;
      this.pendingCape = null;
      if (capeUrl) {
        const cape = new Image();
        cape.decoding = 'async';
        cape.onload = () => {
          if (this.pendingCape !== cape) return;
          this.capeImage = cape;
          this.capePixels = texturePixels(cape);
          this.render();
        };
        cape.src = capeUrl;
        this.pendingCape = cape;
      }
    }

    startAnimation() {
      if (this.animationFrame != null) return;
      const tick = timestamp => {
        this.animationFrame = null;
        if (!this.image) return;
        this.render(timestamp);
        if (!this.reducedMotion) this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    }

    reset() { this.yaw=-0.55; this.pitch=-0.12; this.zoom=1.25; this.render(); }
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

    render(timestamp = performance.now()) {
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
      const runPhase = this.reducedMotion ? 0.45 : (timestamp-this.startedAt)/155;
      for (const part of skinParts(this.model,legacy,runPhase)) {
        for (const [uvMap,expansion] of [[part.uv,0],[part.layer,0.32]]) {
          if (!uvMap) continue;
          const vertices=partVertices(part,expansion).map(point => this.project(point,width,height));
          for (const [name,indexes] of Object.entries(FACE_VERTICES)) {
            const uv=uvMap[name];
            if (!uv) continue;
            const points=indexes.map(index => vertices[index]);
            faces.push({ points,uv,texture:this.skinPixels,depth:points.reduce((sum,point)=>sum+point.z,0)/4 });
          }
        }
      }
      const bounce=Math.abs(Math.cos(runPhase))*0.22;
      const wingWorldPoints = [
        [[-1,5+bounce,-2.15],[-10,2+bounce,.45],[-7,-8+bounce,.15],[-1,-5+bounce,-2.15]],
        [[1,5+bounce,-2.15],[10,2+bounce,.45],[7,-8+bounce,.15],[1,-5+bounce,-2.15]]
      ];
      wingWorldPoints.forEach((worldPoints,index) => {
        const points=worldPoints.map(point=>this.project(point,width,height));
        faces.push({
          points,
          uv:index === 0 ? [1,1,5,16] : [6,1,5,16],
          texture:this.capePixels,
          color:index === 0 ? '#8c9198' : '#767c84',
          depth:points.reduce((sum,point)=>sum+point.z,0)/4
        });
      });
      faces.sort((first,second)=>first.depth-second.depth);
      for (const face of faces) {
        const destination=face.points.map(point=>[point.x,point.y]);
        if (!face.texture) {
          ctx.beginPath(); ctx.moveTo(...destination[0]);
          destination.slice(1).forEach(point=>ctx.lineTo(...point));
          ctx.closePath(); ctx.fillStyle=face.color; ctx.fill();
          ctx.strokeStyle='rgba(25,28,32,.45)'; ctx.lineWidth=1; ctx.stroke();
          continue;
        }
        drawPixelFace(ctx,face.texture,face.uv,destination);
      }
    }

    destroy() {
      if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      this.image = null;
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
