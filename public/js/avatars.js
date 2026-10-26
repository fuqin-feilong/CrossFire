import * as THREE from 'three';
import { SPAWN_COLORS } from '/shared/constants.js';

function makeNameTexture(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(5, 8, 13, 0.62)';
  ctx.fillRect(0, 62, 512, 52);
  ctx.fillStyle = color;
  ctx.fillRect(0, 62, 512, 4);

  ctx.font = 'bold 44px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 256, 39, 480);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function addBox(parent, material, sx, sy, sz, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export class Avatar {
  constructor(slot, name) {
    this.slot = slot;
    this.name = name;
    this.color = new THREE.Color(SPAWN_COLORS[slot % SPAWN_COLORS.length]);
    this.current = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.target = null;
    this.hasTarget = false;
    this.walkPhase = 0;
    this.lastHp = 100;
    this.flashTimer = 0;

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const uniform = new THREE.MeshStandardMaterial({
      color: 0x28313d,
      roughness: 0.82,
      metalness: 0.08,
    });
    const uniformDark = new THREE.MeshStandardMaterial({
      color: 0x161c25,
      roughness: 0.9,
      metalness: 0.05,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.45,
      metalness: 0.25,
      emissive: this.color,
      emissiveIntensity: 0.18,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc79068, roughness: 0.85 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x141920, roughness: 0.5, metalness: 0.5 });

    // Torso / vest
    addBox(this.body, uniform, 0.56, 0.66, 0.32, 0, 1.1, 0);
    addBox(this.body, uniformDark, 0.5, 0.5, 0.36, 0, 1.12, 0);
    addBox(this.body, accent, 0.14, 0.16, 0.02, 0.17, 1.24, -0.19);
    addBox(this.body, accent, 0.5, 0.05, 0.02, 0, 1.32, -0.19);
    addBox(this.body, uniform, 0.42, 0.24, 0.3, 0, 0.72, 0);

    // Legs
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.72, 0);
    addBox(this.legL, uniformDark, 0.17, 0.62, 0.2, 0, -0.31, 0);
    addBox(this.legL, uniform, 0.18, 0.16, 0.26, 0, -0.62, 0.03);
    this.body.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.72, 0);
    addBox(this.legR, uniformDark, 0.17, 0.62, 0.2, 0, -0.31, 0);
    addBox(this.legR, uniform, 0.18, 0.16, 0.26, 0, -0.62, 0.03);
    this.body.add(this.legR);

    // Head / helmet
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 12), skin);
    head.position.set(0, 1.6, 0);
    head.castShadow = true;
    this.body.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.195, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), accent);
    helmet.position.set(0, 1.61, 0);
    helmet.castShadow = true;
    this.body.add(helmet);

    addBox(this.body, uniformDark, 0.3, 0.11, 0.06, 0, 1.57, -0.16);

    // Arms
    this.armL = new THREE.Group();
    this.armL.position.set(-0.34, 1.34, 0);
    addBox(this.armL, uniform, 0.14, 0.52, 0.16, 0, -0.24, 0);
    this.armL.rotation.x = -0.85;
    this.body.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.34, 1.34, 0);
    addBox(this.armR, uniform, 0.14, 0.52, 0.16, 0, -0.24, 0);
    this.armR.rotation.x = -1.05;
    this.armR.rotation.z = -0.12;
    this.body.add(this.armR);

    // Gun
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(0.2, 1.28, -0.16);
    this.body.add(this.gunPivot);

    addBox(this.gunPivot, gunMat, 0.09, 0.11, 0.46, 0, 0, -0.2);
    addBox(this.gunPivot, gunMat, 0.055, 0.13, 0.08, 0, -0.1, -0.04);
    addBox(this.gunPivot, gunMat, 0.07, 0.09, 0.16, 0, -0.01, 0.08);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.56);
    barrel.castShadow = true;
    this.gunPivot.add(barrel);

    this.muzzle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({
        color: 0xffc26b,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.muzzle.position.set(0, 0.01, -0.75);
    this.gunPivot.add(this.muzzle);

    // Shield ring while spawn protected.
    this.shield = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.02, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0x6ec8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.shield.rotation.x = Math.PI / 2;
    this.shield.position.y = 1.0;
    this.shield.visible = false;
    this.body.add(this.shield);

    // Name tag
    const nameTexture = makeNameTexture(name, `#${this.color.getHexString()}`);
    this.nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: nameTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.nameSprite.scale.set(1.85, 0.46, 1);
    this.nameSprite.position.set(0, 2.16, 0);
    this.root.add(this.nameSprite);

    // HP bar (background + fill sprites).
    this.hpBg = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0x05070a, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.hpBg.scale.set(1.14, 0.1, 1);
    this.hpBg.position.set(0, 1.99, 0);
    this.root.add(this.hpBg);

    this.hpFill = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0x55d68b, transparent: true, depthWrite: false }),
    );
    this.hpFill.center.set(0, 0.5);
    this.hpFill.scale.set(1.06, 0.062, 1);
    this.hpFill.position.set(-0.53, 1.99, 0);
    this.root.add(this.hpFill);

    this.root.visible = false;
  }

  setTarget(state) {
    this.target = state;
    if (!this.hasTarget) {
      this.current.x = state.x;
      this.current.y = state.y;
      this.current.z = state.z;
      this.current.yaw = state.yaw;
      this.current.pitch = state.pitch;
      this.hasTarget = true;
      this.applyPose();
    }
    this.root.visible = state.alive;
    this.lastHp = state.hp;
    this.hpFill.scale.x = Math.max(0.001, 1.06 * (state.hp / 100));
    this.hpFill.material.color.setHex(
      state.hp > 60 ? 0x55d68b : state.hp > 30 ? 0xffc857 : 0xff4d5e,
    );
    this.shield.visible = !!state.prot;
  }

  applyPose() {
    this.root.position.set(this.current.x, this.current.y, this.current.z);
    this.root.rotation.y = this.current.yaw;
    this.gunPivot.rotation.x = this.current.pitch;
  }

  update(dt) {
    if (!this.target || !this.hasTarget) return;

    const k = 1 - Math.exp(-16 * dt);
    const dx = this.target.x - this.current.x;
    const dz = this.target.z - this.current.z;
    const speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);

    this.current.x += dx * k;
    this.current.y += (this.target.y - this.current.y) * k;
    this.current.z += dz * k;

    const angleDelta = Math.atan2(
      Math.sin(this.target.yaw - this.current.yaw),
      Math.cos(this.target.yaw - this.current.yaw),
    );
    this.current.yaw += angleDelta * k;
    this.current.pitch += (this.target.pitch - this.current.pitch) * k;

    this.applyPose();

    const move = Math.min(1, speed / 5.2);
    this.walkPhase += dt * 9 * move;
    const swing = Math.sin(this.walkPhase) * 0.55 * move;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -0.85 - swing * 0.18;
    this.armR.rotation.x = -1.05 + swing * 0.12;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.muzzle.material.opacity = 0;
    }
    this.root.visible = this.target.alive;
  }

  flash() {
    this.muzzle.material.opacity = 0.95;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    this.flashTimer = 0.055;
  }

  dispose() {
    this.root.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
}
