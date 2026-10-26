// Shared arena layout. Coordinates: X = east/west, Z = north/south, Y = up.
// Boxes are axis aligned: x/y/z is the center, sx/sy/sz are the full sizes.

const wall = (x, z, sx, sz) => ({
  kind: 'wall',
  x,
  y: 3,
  z,
  sx,
  sy: 6,
  sz,
});

export const MAP_BOXES = [
  // Outer walls (inner faces at +/-22).
  wall(0, -23, 46, 2),
  wall(0, 23, 46, 2),
  wall(-23, 0, 2, 46),
  wall(23, 0, 2, 46),

  // Symmetric container / crate cover.
  { kind: 'container', x: -8, y: 1.5, z: -7, sx: 4, sy: 3, sz: 10 },
  { kind: 'container', x: 8, y: 1.5, z: 7, sx: 4, sy: 3, sz: 10 },
  { kind: 'crate', x: -8, y: 1.0, z: 9, sx: 9, sy: 2, sz: 4 },
  { kind: 'crate', x: 8, y: 1.0, z: -9, sx: 9, sy: 2, sz: 4 },
  { kind: 'tower', x: 0, y: 2.2, z: 0, sx: 5, sy: 4.4, sz: 5 },

  // Low fences near each spawn + corner crates.
  { kind: 'crate', x: 0, y: 0.6, z: -13, sx: 7, sy: 1.2, sz: 1.2 },
  { kind: 'crate', x: 0, y: 0.6, z: 13, sx: 7, sy: 1.2, sz: 1.2 },
  { kind: 'crate', x: -16, y: 0.75, z: -16, sx: 2, sy: 1.5, sz: 2 },
  { kind: 'crate', x: 16, y: 0.75, z: 16, sx: 2, sy: 1.5, sz: 2 },
  { kind: 'crate', x: -16, y: 1.2, z: 16, sx: 2.6, sy: 2.4, sz: 2.6 },
  { kind: 'crate', x: 16, y: 1.2, z: -16, sx: 2.6, sy: 2.4, sz: 2.6 },

  // Mid-lane barriers.
  { kind: 'crate', x: -15, y: 1.1, z: 5, sx: 2.4, sy: 2.2, sz: 2.4 },
  { kind: 'crate', x: 15, y: 1.1, z: -5, sx: 2.4, sy: 2.2, sz: 2.4 },
  { kind: 'crate', x: 5, y: 0.9, z: -16, sx: 2.4, sy: 1.8, sz: 2.4 },
  { kind: 'crate', x: -5, y: 0.9, z: 16, sx: 2.4, sy: 1.8, sz: 2.4 },
];

const yawTo = (x, z) => Math.atan2(-(0 - x), -(0 - z));

export const SPAWNS = [
  { x: 0, z: 18, yaw: Math.atan2(0, 18) },
  { x: 0, z: -18, yaw: Math.PI },
  { x: -12, z: 16, yaw: yawTo(-12, 16) },
  { x: 12, z: -16, yaw: yawTo(12, -16) },
];

export const MAP_KIND_COLORS = {
  wall: 0x5c6879,
  container: 0x2f6bd8,
  crate: 0xa87545,
  tower: 0x7b8797,
};
