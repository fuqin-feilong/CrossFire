import { ARENA, PLAYER } from './constants.js';
import { MAP_BOXES } from './map.js';

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function directionFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

export function anglesFromDirection(dx, dy, dz) {
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.asin(clamp(dy, -1, 1)),
  };
}

export function eyeOf(state) {
  return { x: state.x, y: state.y + PLAYER.eyeHeight, z: state.z };
}

/** Circle (in XZ plane) vs axis-aligned box on the ground. */
export function circleHitsBox(x, z, radius, box) {
  const minX = box.x - box.sx / 2;
  const maxX = box.x + box.sx / 2;
  const minZ = box.z - box.sz / 2;
  const maxZ = box.z + box.sz / 2;
  const nx = clamp(x, minX, maxX);
  const nz = clamp(z, minZ, maxZ);
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < radius * radius;
}

export function collides(x, z, radius = PLAYER.radius, boxes = MAP_BOXES) {
  for (let i = 0; i < boxes.length; i++) {
    if (circleHitsBox(x, z, radius, boxes[i])) return true;
  }
  return false;
}

/** Move with axis separation so players slide along walls instead of sticking. */
export function moveWithCollision(state, dx, dz, radius = PLAYER.radius, boxes = MAP_BOXES) {
  const nx = state.x + dx;
  if (!collides(nx, state.z, radius, boxes)) state.x = nx;
  const nz = state.z + dz;
  if (!collides(state.x, nz, radius, boxes)) state.z = nz;

  const limit = ARENA.halfX - radius - 0.05;
  state.x = clamp(state.x, -limit, limit);
  state.z = clamp(state.z, -limit, limit);
}

/**
 * Advance a player by one fixed step.
 * state: { x, y, z, vy, grounded, jumpLatch, yaw }
 * input: { forward, back, left, right, jump, sprint, ads, yaw }
 */
export function stepMovement(state, input, dt, boxes = MAP_BOXES) {
  const yaw = Number.isFinite(input.yaw) ? input.yaw : state.yaw;
  state.yaw = yaw;

  let speed = PLAYER.speed;
  if (input.ads) speed = PLAYER.adsSpeed;
  else if (input.sprint) speed = PLAYER.sprintSpeed;

  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  let wx = 0;
  let wz = 0;
  if (f || s) {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    wx = -sin * f + cos * s;
    wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    wx /= len;
    wz /= len;
  }

  const dist = speed * dt;
  moveWithCollision(state, wx * dist, wz * dist, PLAYER.radius, boxes);

  // Jump + gravity (flat ground, no climbing).
  if (input.jump && !state.jumpLatch && state.grounded) {
    state.vy = PLAYER.jumpSpeed;
    state.grounded = false;
  }
  state.jumpLatch = !!input.jump;

  if (!state.grounded) {
    state.vy -= PLAYER.gravity * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) {
      state.y = 0;
      state.vy = 0;
      state.grounded = true;
    }
  } else {
    state.y = 0;
    state.vy = 0;
  }

  return { moved: !!(f || s), speed };
}

/** Slab method. Returns distance along a normalized ray, or Infinity. */
export function rayAABB(ox, oy, oz, dx, dy, dz, box) {
  const minX = box.x - box.sx / 2;
  const maxX = box.x + box.sx / 2;
  const minY = box.y - box.sy / 2;
  const maxY = box.y + box.sy / 2;
  const minZ = box.z - box.sz / 2;
  const maxZ = box.z + box.sz / 2;

  let tmin = 0;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }

  if (Math.abs(dy) < 1e-9) {
    if (oy < minY || oy > maxY) return Infinity;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }

  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }

  return tmin >= 0 ? tmin : Infinity;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = 2 * (lx * dx + ly * dy + lz * dz);
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / 2;
  if (t < 0) t = (-b + sq) / 2;
  return t >= 0 ? t : Infinity;
}

export function raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist = Infinity, boxes = MAP_BOXES) {
  let best = maxDist;
  let bestBox = null;
  for (let i = 0; i < boxes.length; i++) {
    const t = rayAABB(ox, oy, oz, dx, dy, dz, boxes[i]);
    if (t < best) {
      best = t;
      bestBox = boxes[i];
    }
  }
  return { dist: best, box: bestBox };
}

/**
 * Ray vs a player capsule approximation: body AABB + head sphere.
 * Returns { dist, head } with dist Infinity when missed.
 */
export function raycastPlayer(ox, oy, oz, dx, dy, dz, player) {
  if (player.alive === false) return { dist: Infinity, head: false };
  const bodyHeight = PLAYER.bodyMax - PLAYER.bodyMin;
  const body = {
    x: player.x,
    y: player.y + PLAYER.bodyMin + bodyHeight / 2,
    z: player.z,
    sx: PLAYER.bodyHalf * 2,
    sy: bodyHeight,
    sz: PLAYER.bodyHalf * 2,
  };
  const bodyT = rayAABB(ox, oy, oz, dx, dy, dz, body);
  const headT = raySphere(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    player.x,
    player.y + PLAYER.headHeight,
    player.z,
    PLAYER.headRadius,
  );
  if (headT < bodyT) return { dist: headT, head: true };
  return { dist: bodyT, head: false };
}

/** Add a random cone spread to a normalized direction. */
export function applySpread(dir, spread) {
  if (spread <= 0) return dir;
  const { yaw, pitch } = anglesFromDirection(dir.x, dir.y, dir.z);
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  const y2 = yaw + Math.cos(theta) * r;
  const p2 = clamp(pitch + Math.sin(theta) * r, -PLAYER.maxPitch, PLAYER.maxPitch);
  return directionFromAngles(y2, p2);
}

export function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
