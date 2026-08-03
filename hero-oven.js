import * as THREE from './three.module.js';
import { mergeVertices } from './three-BufferGeometryUtils.js';

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const clamp01 = t => Math.max(0, Math.min(1, t));
const lerp = THREE.MathUtils.lerp;

function roundedRectShape(w, h, r, originBottom) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = originBottom ? 0 : -h / 2;
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);
  return shape;
}

function samsaShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.6);
  s.quadraticCurveTo(0.56, 0.18, 0.62, -0.36);
  s.quadraticCurveTo(0.64, -0.52, 0.46, -0.52);
  s.lineTo(-0.46, -0.52);
  s.quadraticCurveTo(-0.64, -0.52, -0.62, -0.36);
  s.quadraticCurveTo(-0.56, 0.18, 0, 0.6);
  return s;
}

function makeSpeckleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 40, 6, 64, 70, 110);
  g.addColorStop(0, '#F2B15C');
  g.addColorStop(0.55, '#D98A3D');
  g.addColorStop(1, '#B5661F');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(60,32,10,.55)';
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.7, 0.9, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 108, 4, 64, 60, 92);
  g.addColorStop(0, '#FFEAB2');
  g.addColorStop(0.35, '#FFB25C');
  g.addColorStop(0.7, '#B85A18');
  g.addColorStop(1, 'rgba(58,34,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeSteamTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,253,248,.95)');
  g.addColorStop(1, 'rgba(255,253,248,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(26,21,18,.45)');
  g.addColorStop(1, 'rgba(26,21,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const TL = {
  ovenFly: { start: 0.05, dur: 1.4 },
  doorOpen: { start: 1.55, dur: 0.6 },
  trayOut: { start: 1.85, dur: 0.7 },
  steamStart: 2.35,
  fly: [
    { start: 2.7, dur: 1.15 },
    { start: 2.98, dur: 1.15 },
    { start: 3.26, dur: 1.15 }
  ]
};

const FLY_TARGETS = [
  { pos: new THREE.Vector3(-1.05, 0.32, 1.85), rotY: -0.35, rotX: -0.08 },
  { pos: new THREE.Vector3(0.05, 0.66, 2.1), rotY: 0.08, rotX: -0.04 },
  { pos: new THREE.Vector3(1.1, 0.3, 1.85), rotY: 0.35, rotX: -0.1 }
];

class HeroOven3D extends HTMLElement {
  connectedCallback() {
    this.startTime = null;
    this.detached = [false, false, false];
    this.flyers = [null, null, null];

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    this.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.85, 7.6);
    camera.lookAt(0, 0.3, 0);
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0xfff1d8, 0.6));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.15);
    key.position.set(-3, 4, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff4e0, 0.35);
    rim.position.set(3, 2, -4);
    scene.add(rim);
    const glowLight = new THREE.PointLight(0xff8a1f, 1.4, 14, 2);
    glowLight.position.set(0, 0.2, 1.6);
    scene.add(glowLight);
    this.glowLight = glowLight;

    // ground contact shadow
    const shadowMat = new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -1.02, 0.3);
    scene.add(shadow);
    this.shadow = shadow;

    // ---- oven ----
    const oven = new THREE.Group();
    scene.add(oven);
    this.oven = oven;

    const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(2.6, 3.0, 0.22), { depth: 1.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 });
    bodyGeo.center();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 0.55, metalness: 0.18 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    oven.add(body);

    const knobColors = [0xF28C1A, 0xFFC93C, 0xD7263D];
    const knobMats = [];
    knobColors.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.25 });
      knobMats.push(m);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 16), m);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.78 - i * 0.32, 1.3, 0.78);
      oven.add(knob);
    });

    const winGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.72, 1.55, 0.16), { depth: 0.1, bevelEnabled: false });
    winGeo.center();
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 0.75 });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, 0.1, 0.8);
    oven.add(win);

    const glowTex = makeGlowTexture();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 1.35), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true }));
    glow.position.set(0, 0.1, 0.86);
    oven.add(glow);
    this.glow = glow;

    const doorPivot = new THREE.Group();
    doorPivot.position.set(0, -0.62, 0.86);
    oven.add(doorPivot);
    this.doorPivot = doorPivot;

    const doorGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.9, 1.7, 0.14, true), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    doorGeo.translate(0, 0, -0.07);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e2318, roughness: 0.5, metalness: 0.15 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    doorPivot.add(door);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0xF28C1A, roughness: 0.35, metalness: 0.3 });
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), handleMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 1.4, 0.12);
    doorPivot.add(handle);

    // ---- tray ----
    const trayGroup = new THREE.Group();
    trayGroup.position.set(0, -0.62, 0.35);
    oven.add(trayGroup);
    this.trayGroup = trayGroup;
    this.trayInsideZ = 0.35;
    this.trayOutZ = 1.95;
    this.trayInsideY = -0.62;
    this.trayOutY = -0.78;

    const trayGeo = new THREE.ExtrudeGeometry(roundedRectShape(2.1, 0.9, 0.12), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    trayGeo.center();
    trayGeo.rotateX(-Math.PI / 2);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.55, metalness: 0.2 });
    const trayBase = new THREE.Mesh(trayGeo, trayMat);
    trayGroup.add(trayBase);

    let samsaGeo = new THREE.ExtrudeGeometry(samsaShape(), { depth: 0.34, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 5, curveSegments: 24 });
    samsaGeo = mergeVertices(samsaGeo, 1e-4);
    samsaGeo.computeVertexNormals();
    samsaGeo.center();
    samsaGeo.scale(0.62, 0.62, 0.62);
    this.samsaGeo = samsaGeo;
    const samsaMat = new THREE.MeshPhysicalMaterial({
      map: makeSpeckleTexture(), roughness: 0.62, metalness: 0.02,
      clearcoat: 0.12, clearcoatRoughness: 0.65, sheen: 0.15, sheenColor: new THREE.Color('#FFD37A'),
      flatShading: false
    });
    this.samsaMat = samsaMat;

    const cols = [-0.62, 0, 0.62];
    const rowsZ = [-0.18, 0.17];
    const trayItems = [];
    rowsZ.forEach((z, ri) => {
      cols.forEach((x, ci) => {
        const m = new THREE.Mesh(samsaGeo, samsaMat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = (Math.random() - 0.5) * 0.5;
        m.position.set(x, 0.09, z);
        trayGroup.add(m);
        trayItems.push(m);
      });
    });
    this.flySource = [trayItems[0], trayItems[2], trayItems[4]];

    const steamTex = makeSteamTexture();
    this.steamParticles = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.35);
      const bx = (i % 3 - 1) * 0.62 + (Math.random() - 0.5) * 0.15;
      const bz = (Math.random() - 0.5) * 0.3;
      sprite.position.set(bx, 0.12, bz);
      trayGroup.add(sprite);
      this.steamParticles.push({ sprite, baseX: bx, baseZ: bz, phase: Math.random(), speed: 0.28 + Math.random() * 0.12 });
    }

    this.ovenStartX = 9.5;
    this.ovenRestX = 0.05;
    this.ovenRestY = -0.05;
    this.ovenStartRotY = -Math.PI * 2.35;
    this.ovenRestRotY = -0.3;
    oven.position.set(this.ovenStartX, 0.35, -1.1);
    oven.rotation.y = this.ovenStartRotY;

    this._resize = () => this.resize();
    this.ro = new ResizeObserver(this._resize);
    this.ro.observe(this);
    this.resize();

    this._raf = (now) => this.frame(now);
    this.rafId = requestAnimationFrame(this._raf);
  }

  resize() {
    const w = Math.max(1, this.clientWidth), h = Math.max(1, this.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  attachFlyer(i) {
    const src = this.flySource[i];
    const worldPos = new THREE.Vector3();
    src.getWorldPosition(worldPos);
    this.trayGroup.remove(src);
    this.scene.add(src);
    src.position.copy(worldPos);
    src.rotation.set(-Math.PI / 2, 0, src.rotation.z);
    src.scale.setScalar(0.82);
    this.flyers[i] = { mesh: src, from: worldPos.clone(), fromRotZ: src.rotation.z };
  }

  frame(now) {
    if (this.startTime === null) this.startTime = now;
    const t = (now - this.startTime) / 1000;
    window.__heroT = t;

    const ovenT = easeOutCubic(clamp01((t - TL.ovenFly.start) / TL.ovenFly.dur));
    this.oven.position.x = lerp(this.ovenStartX, this.ovenRestX, ovenT) ;
    this.oven.position.y = lerp(0.35, this.ovenRestY, ovenT) + Math.sin(clamp01((t - TL.ovenFly.start) / TL.ovenFly.dur) * Math.PI) * 0.4;
    this.oven.rotation.y = lerp(this.ovenStartRotY, this.ovenRestRotY, ovenT);
    if (ovenT >= 1) {
      const bt = clamp01((t - (TL.ovenFly.start + TL.ovenFly.dur)) / 0.4);
      const bounce = 1 - Math.abs(Math.sin(bt * Math.PI)) * 0.05 * (1 - bt);
      this.oven.scale.set(1, bounce, 1);
      this.shadow.material.opacity = 0.9;
    } else {
      this.shadow.material.opacity = 0.35 + ovenT * 0.4;
    }
    this.shadow.position.x = this.oven.position.x;
    this.shadow.scale.setScalar(0.85 + ovenT * 0.3);

    const doorT = easeOutCubic(clamp01((t - TL.doorOpen.start) / TL.doorOpen.dur));
    this.doorPivot.rotation.x = lerp(0, 1.25, doorT);

    const trayT = easeOutCubic(clamp01((t - TL.trayOut.start) / TL.trayOut.dur));
    this.trayGroup.position.z = lerp(this.trayInsideZ, this.trayOutZ, trayT);
    this.trayGroup.position.y = lerp(this.trayInsideY, this.trayOutY, trayT);

    const steamOn = t > TL.steamStart;
    this.steamParticles.forEach(p => {
      if (!steamOn) { p.sprite.material.opacity = 0; return; }
      const ct = ((t - TL.steamStart) * p.speed + p.phase) % 1;
      p.sprite.position.set(p.baseX, 0.1 + ct * 1.3, p.baseZ + Math.sin(ct * 8 + p.phase * 6) * 0.06);
      p.sprite.material.opacity = Math.sin(ct * Math.PI) * 0.85;
      p.sprite.scale.setScalar(0.5 + ct * 0.95);
    });

    TL.fly.forEach((stage, i) => {
      if (t < stage.start) return;
      if (!this.detached[i]) { this.detached[i] = true; this.attachFlyer(i); }
      const f = this.flyers[i];
      if (!f) return;
      const ft = clamp01((t - stage.start) / stage.dur);
      if (ft < 1) {
        const e = easeOutCubic(ft);
        const target = FLY_TARGETS[i];
        f.mesh.position.x = lerp(f.from.x, target.pos.x, e);
        f.mesh.position.z = lerp(f.from.z, target.pos.z, e);
        f.mesh.position.y = lerp(f.from.y, target.pos.y, e) + Math.sin(ft * Math.PI) * 0.4;
        f.mesh.rotation.x = lerp(-Math.PI / 2, target.rotX, e);
        f.mesh.rotation.y = lerp(0, target.rotY + Math.sin(ft * 10) * 0.3 * (1 - ft), e);
        f.mesh.rotation.z = lerp(f.fromRotZ, 0, e);
      } else {
        const target = FLY_TARGETS[i];
        f.mesh.position.x = target.pos.x;
        f.mesh.position.z = target.pos.z;
        f.mesh.position.y = target.pos.y + Math.sin(t * 1.6 + i * 1.7) * 0.09;
        f.mesh.rotation.x = target.rotX;
        f.mesh.rotation.y = target.rotY + Math.sin(t * 0.9 + i) * 0.06;
        f.mesh.rotation.z = Math.sin(t * 1.1 + i) * 0.07;
      }
    });

    this.glow.material.opacity = 0.6 + Math.sin(t * 2.2) * 0.15;
    this.glowLight.intensity = 1.2 + Math.sin(t * 2.2) * 0.4;

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this._raf);
  }

  disconnectedCallback() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.ro) this.ro.disconnect();
    const r = this.renderer;
    if (!r) return;
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    r.dispose();
    this.innerHTML = '';
  }
}

customElements.define('hero-oven-3d', HeroOven3D);
