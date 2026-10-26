// Shared gameplay constants used by both the server simulation and the browser client.

export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const INPUT_RATE = 30;

export const ARENA = {
  halfX: 22,
  halfZ: 22,
  wallHeight: 6,
};

export const PLAYER = {
  radius: 0.35,
  eyeHeight: 1.62,
  headHeight: 1.62,
  headRadius: 0.22,
  bodyHalf: 0.32,
  bodyMin: 0.15,
  bodyMax: 1.45,
  speed: 5.4,
  sprintSpeed: 7.2,
  adsSpeed: 3.1,
  jumpSpeed: 5.6,
  gravity: 18,
  maxHp: 100,
  respawnMs: 3000,
  spawnProtectMs: 2000,
  maxPitch: Math.PI / 2 - 0.02,
  nameMax: 16,
};

export const WEAPON = {
  name: 'AR-15',
  magSize: 30,
  fireIntervalMs: 100,
  reloadMs: 2200,
  damageBody: 25,
  damageHead: 100,
  range: 150,
  hipSpread: 0.018,
  adsSpread: 0.0035,
  movingSpread: 0.007,
  recoilKick: 0.55,
};

export const MATCH = {
  killsToWin: 10,
  durationMs: 5 * 60 * 1000,
  countdownMs: 3000,
  reconnectGraceMs: 10000,
};

export const NET = {
  maxNicknameChange: 3,
};

export const SPAWN_COLORS = ['#ff7a45', '#4da3ff'];
