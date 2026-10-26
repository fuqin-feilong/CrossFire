import { PLAYER } from '/shared/constants.js';

const clampPitch = (v) => Math.max(-PLAYER.maxPitch, Math.min(PLAYER.maxPitch, v));

export class InputController {
  constructor(canvas, { onReload, onLockChange, onScoreboard } = {}) {
    this.canvas = canvas;
    this.onReload = onReload;
    this.onLockChange = onLockChange;
    this.onScoreboard = onScoreboard;

    this.enabled = false;
    this.locked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.ads = false;
    this.shoot = false;
    this.keys = new Set();
    this.scoreboard = false;

    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      const code = event.code;
      if (code === 'Tab') {
        event.preventDefault();
        if (!this.scoreboard) {
          this.scoreboard = true;
          this.onScoreboard?.(true);
        }
        return;
      }
      if (code === 'Space' || code.startsWith('Arrow')) event.preventDefault();
      if (code === 'KeyR' && !event.repeat) {
        this.onReload?.();
        return;
      }
      this.keys.add(code);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      if (event.code === 'Tab') {
        event.preventDefault();
        this.scoreboard = false;
        this.onScoreboard?.(false);
      }
    });

    window.addEventListener('blur', () => this.clearTransient());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearTransient();
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.locked || !this.enabled) return;
      const factor = this.ads ? 0.62 : 1;
      this.yaw -= event.movementX * this.sensitivity * factor;
      this.pitch = clampPitch(this.pitch - event.movementY * this.sensitivity * factor);
    });

    document.addEventListener('mousedown', (event) => {
      if (!this.locked || !this.enabled) return;
      if (event.button === 0) {
        this.shoot = true;
        event.preventDefault();
      } else if (event.button === 2) {
        this.ads = true;
        event.preventDefault();
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.shoot = false;
      if (event.button === 2) this.ads = false;
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.shoot = false;
        this.ads = false;
      }
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      this.onLockChange?.(false);
    });
  }

  async requestLock() {
    if (document.pointerLockElement === this.canvas) return true;
    try {
      const result = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (result && typeof result.catch === 'function') await result;
      return true;
    } catch {
      try {
        const fallback = this.canvas.requestPointerLock();
        if (fallback && typeof fallback.catch === 'function') await fallback;
        return true;
      } catch {
        return false;
      }
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clearTransient();
  }

  clearTransient() {
    this.keys.clear();
    this.shoot = false;
    this.ads = false;
    this.scoreboard = false;
    this.onScoreboard?.(false);
  }

  resetView(yaw = 0, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.shoot = false;
    this.ads = false;
  }

  getInput() {
    const k = this.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      jump: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      ads: this.ads,
      shoot: this.shoot,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
}
