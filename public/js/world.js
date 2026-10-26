import * as THREE from 'three';
import { MAP_BOXES, MAP_KIND_COLORS, SPAWNS } from '/shared/map.js';
import { SPAWN_COLORS } from '/shared/constants.js';

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#02050a');
  grad.addColorStop(0.3, '#060d17');
  grad.addColorStop(0.44, '#16283c');
  grad.addColorStop(0.5, '#466584');
  grad.addColorStop(0.54, '#2c4057');
  grad.addColorStop(0.64, '#101a27');
  grad.addColorStop(1, '#05080e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1b2531';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2200; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.14)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  ctx.strokeStyle = 'rgba(130, 165, 205, 0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 107, 44, 0.12)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, size - 16, size - 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.anisotropy = 8;
  return texture;
}

function makeGlowTexture(inner = 'rgba(255, 220, 160, 1)', outer = 'rgba(255, 110, 40, 0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, 'rgba(255, 160, 70, 0.55)');
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeHoleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)');
  grad.addColorStop(0.4, 'rgba(5,7,10,0.8)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.shake = 0;
    this.adsT = 0;
    this.bobPhase = 0;
    this.recoil = 0;
    this.flashTimer = 0;
    this.time = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0d1726, 48, 120);

    this.camera = new THREE.PerspectiveCamera(
      78,
      window.innerWidth / window.innerHeight,
      0.04,
      220,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildMap();
    this.buildDistantCity();
    this.buildViewmodel();
    this.buildEffects();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /* -------------------------------- Building ------------------------------- */

  buildSky() {
    const geometry = new THREE.SphereGeometry(150, 32, 20);
    const material = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xb6ccf2, 0x2a2118, 1.85);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0x3c4e66, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe2bd, 2.55);
    sun.position.set(16, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x7098d8, 0.85);
    fill.position.set(-18, 14, -14);
    this.scene.add(fill);

    const warm = new THREE.PointLight(0xff7a3c, 40, 26, 2);
    warm.position.set(0, 7, 0);
    this.scene.add(warm);

    const cool = new THREE.PointLight(0x4d9cff, 26, 22, 2);
    cool.position.set(-16, 3.5, 16);
    this.scene.add(cool);
  }

  buildGround() {
    const texture = makeGroundTexture();
    const geometry = new THREE.PlaneGeometry(46, 46);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.88,
      metalness: 0.08,
      color: 0xd6dfeb,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.15, 3.45, 64),
      new THREE.MeshBasicMaterial({
        color: 0xff6b2c,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.scene.add(ring);

    SPAWNS.forEach((spawn, index) => {
      const color = new THREE.Color(SPAWN_COLORS[index % SPAWN_COLORS.length]);
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(1.05, 1.28, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(spawn.x, 0.013, spawn.z);
      this.scene.add(pad);
    });
  }

  buildMap() {
    const materials = {};
    for (const [kind, color] of Object.entries(MAP_KIND_COLORS)) {
      materials[kind] = new THREE.MeshStandardMaterial({
        color,
        roughness: kind === 'container' ? 0.62 : 0.88,
        metalness: kind === 'container' ? 0.18 : 0.06,
      });
    }

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x05070a,
      transparent: true,
      opacity: 0.42,
    });

    for (const box of MAP_BOXES) {
      const geometry = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
      const mesh = new THREE.Mesh(geometry, materials[box.kind] || materials.crate);
      mesh.position.set(box.x, box.y, box.z);
      mesh.castShadow = box.kind !== 'wall';
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      this.scene.add(edges);
    }

    // A few orange hazard strips on the central tower for visual anchor.
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xff6b2c });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.6), stripMat);
      strip.position.set(side * 2.51, 3.6, 0);
      this.scene.add(strip);
    }
  }

  buildDistantCity() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x1d2b3d,
      roughness: 0.95,
      metalness: 0.08,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffa05a });

    const spots = [
      [-34, -30, 9, 14],
      [-26, -40, 12, 20],
      [30, -34, 10, 16],
      [40, -18, 8, 11],
      [-42, 12, 7, 18],
      [36, 26, 13, 22],
      [-30, 36, 9, 13],
      [12, 44, 11, 17],
    ];

    for (const [x, z, w, h] of spots) {
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), material);
      building.position.set(x, h / 2, z);
      this.scene.add(building);

      const windows = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.18, 0.06), glowMaterial);
      windows.position.set(x, h * 0.72, z + w / 2 + 0.04);
      this.scene.add(windows);
    }
  }

  buildViewmodel() {
    this.view = new THREE.Group();
    this.view.position.set(0.25, -0.21, -0.58);
    this.view.scale.setScalar(0.82);
    this.camera.add(this.view);

    const dark = new THREE.MeshStandardMaterial({
      color: 0x39434f,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x0b0f15,
      emissiveIntensity: 0.55,
    });
    const darker = new THREE.MeshStandardMaterial({
      color: 0x1d242d,
      roughness: 0.58,
      metalness: 0.18,
      emissive: 0x080b10,
      emissiveIntensity: 0.5,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0xff6b2c,
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xff3a00,
      emissiveIntensity: 0.55,
    });
    const handMat = new THREE.MeshStandardMaterial({ color: 0xc08a62, roughness: 0.9 });

    const add = (material, sx, sy, sz, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      this.view.add(mesh);
      return mesh;
    };

    // Receiver, magazine, stock, handguard.
    add(dark, 0.085, 0.1, 0.38, 0, 0, -0.2);
    add(darker, 0.05, 0.12, 0.075, 0, -0.09, -0.08);
    add(dark, 0.065, 0.085, 0.15, 0, -0.005, 0.06);
    add(darker, 0.045, 0.09, 0.055, 0, -0.075, 0.035);
    add(dark, 0.065, 0.065, 0.3, 0, 0.008, -0.47);
    add(accent, 0.018, 0.022, 0.2, 0.044, 0.02, -0.34);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 10), darker);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.68);
    this.view.add(barrel);

    const sight = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 16), darker);
    sight.position.set(0, 0.076, -0.12);
    this.view.add(sight);
    add(darker, 0.012, 0.045, 0.04, 0, 0.068, -0.02);

    this.muzzleAnchor = new THREE.Object3D();
    this.muzzleAnchor.position.set(0, 0.01, -0.82);
    this.view.add(this.muzzleAnchor);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.flash.position.copy(this.muzzleAnchor.position);
    this.view.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffa050, 0, 6, 2);
    this.flashLight.position.copy(this.muzzleAnchor.position);
    this.view.add(this.flashLight);

    // Soft fill light so the weapon reads against dark walls.
    const viewLight = new THREE.PointLight(0xffe0c0, 1.8, 1.6, 2);
    viewLight.position.set(0.25, 0.35, 0.35);
    this.view.add(viewLight);

    // Hands, kept small and forward so they do not swallow the viewport.
    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.13), handMat);
    lHand.position.set(-0.012, -0.088, -0.46);
    this.view.add(lHand);

    const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.11), handMat);
    rHand.position.set(0.008, -0.085, 0.01);
    this.view.add(rHand);
  }

  buildEffects() {
    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const material = new THREE.LineBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0, maxLife: 0.085 });
    }

    this.glowTexture = makeGlowTexture();
    this.holeTexture = makeHoleTexture();

    this.impacts = [];
    for (let i = 0; i < 25; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: 0xffb066,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.visible = false;
      this.scene.add(sprite);
      this.impacts.push({ sprite, life: 0, maxLife: 0.26 });
    }

    this.holes = [];
    for (let i = 0; i < 40; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.holeTexture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      sprite.visible = false;
      this.scene.add(sprite);
      this.holes.push({ sprite, life: 0, maxLife: 7 });
    }
    this.holeIndex = 0;
  }

  /* -------------------------------- Effects -------------------------------- */

  addTracer(from, to, mine = false) {
    let tracer = this.tracers.find((t) => t.life <= 0);
    if (!tracer) tracer = this.tracers[0];

    let start = new THREE.Vector3(from[0], from[1], from[2]);
    if (mine) {
      this.muzzleAnchor.getWorldPosition(start);
    }
    const end = new THREE.Vector3(to[0], to[1], to[2]);
    tracer.line.geometry.setFromPoints([start, end]);
    tracer.line.material.color.setHex(mine ? 0xffd27a : 0xff7a45);
    tracer.line.material.opacity = mine ? 0.9 : 0.7;
    tracer.line.visible = true;
    tracer.life = tracer.maxLife;
  }

  addImpact(point, headshot = false) {
    let impact = this.impacts.find((i) => i.life <= 0);
    if (!impact) impact = this.impacts[0];
    impact.sprite.position.set(point[0], point[1], point[2]);
    impact.sprite.material.color.setHex(headshot ? 0xffe08a : 0xffa050);
    impact.sprite.material.opacity = 1;
    impact.sprite.scale.setScalar(headshot ? 0.7 : 0.45);
    impact.sprite.visible = true;
    impact.life = impact.maxLife;

    const hole = this.holes[this.holeIndex % this.holes.length];
    this.holeIndex += 1;
    hole.sprite.position.set(point[0], point[1], point[2]);
    hole.sprite.scale.setScalar(0.1);
    hole.sprite.material.opacity = 0.85;
    hole.sprite.visible = true;
    hole.life = hole.maxLife;
  }

  triggerShot() {
    this.flash.material.opacity = 0.95;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flashLight.intensity = 7;
    this.flashTimer = 0.055;
    this.recoil = Math.min(1.4, this.recoil + 0.42);
    this.shake = Math.min(0.03, this.shake + 0.006);
  }

  addShake(amount) {
    this.shake = Math.min(0.08, this.shake + amount);
  }

  clearEffects() {
    for (const tracer of this.tracers) {
      tracer.life = 0;
      tracer.line.visible = false;
    }
    for (const impact of this.impacts) {
      impact.life = 0;
      impact.sprite.visible = false;
    }
    for (const hole of this.holes) {
      hole.life = 0;
      hole.sprite.visible = false;
    }
    this.flash.material.opacity = 0;
    this.flashLight.intensity = 0;
    this.flashTimer = 0;
    this.recoil = 0;
    this.shake = 0;
    this.adsT = 0;
  }

  setViewmodelVisible(visible) {
    this.view.visible = visible;
    if (!visible) {
      this.flash.material.opacity = 0;
      this.flashLight.intensity = 0;
    }
  }

  update(dt, { moving = false, ads = false, locked = true } = {}) {
    this.time += dt;

    this.adsT += ((ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 12);
    this.shake *= Math.exp(-9 * dt);
    this.recoil *= Math.exp(-13 * dt);

    const hip = new THREE.Vector3(0.25, -0.21, -0.58);
    const aim = new THREE.Vector3(0.0, -0.135, -0.52);
    const target = hip.clone().lerp(aim, this.adsT);

    this.bobPhase += dt * (moving ? 10 : 2.2);
    const bobScale = (moving && !ads ? 0.008 : 0.0016) * (locked ? 1 : 0.35);
    target.x += Math.sin(this.bobPhase) * bobScale;
    target.y += Math.abs(Math.cos(this.bobPhase)) * bobScale + this.recoil * 0.018;
    target.z += this.recoil * 0.055;

    this.view.position.lerp(target, Math.min(1, dt * 16));
    this.view.rotation.x = this.recoil * 0.22;
    this.view.rotation.z = Math.sin(this.bobPhase * 0.5) * (moving ? 0.006 : 0.002);

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.material.opacity = Math.max(0, this.flashTimer / 0.055);
      this.flashLight.intensity = Math.max(0, this.flashTimer / 0.055) * 7;
    }

    for (const tracer of this.tracers) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / tracer.maxLife) * 0.9;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
    }

    for (const impact of this.impacts) {
      if (impact.life > 0) {
        impact.life -= dt;
        const t = Math.max(0, impact.life / impact.maxLife);
        impact.sprite.material.opacity = t;
        impact.sprite.scale.setScalar(THREE.MathUtils.lerp(0.7, 0.18, 1 - t));
        if (impact.life <= 0) impact.sprite.visible = false;
      }
    }

    for (const hole of this.holes) {
      if (hole.life > 0) {
        hole.life -= dt;
        if (hole.life < 1) hole.sprite.material.opacity = Math.max(0, hole.life);
        if (hole.life <= 0) hole.sprite.visible = false;
      }
    }

    const fov = 78 - 23 * this.adsT;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setCameraPose(x, y, z, yaw, pitch) {
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    const sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(x + sx, y + sy, z + sz);
    this.camera.rotation.set(pitch + sy * 1.4, yaw + sx * 1.2, sz * 0.8, 'YXZ');
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
