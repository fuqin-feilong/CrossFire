import { PLAYER, WEAPON, MATCH } from '../shared/constants.js';
import { MAP_BOXES, SPAWNS } from '../shared/map.js';
import {
  clamp,
  collides,
  directionFromAngles,
  distanceXZ,
  eyeOf,
  raycastBoxes,
  raycastPlayer,
  stepMovement,
  applySpread,
} from '../shared/physics.js';

const round2 = (n) => Math.round(n * 100) / 100;

function makeInput() {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    ads: false,
    shoot: false,
    yaw: 0,
  };
}

export class Game {
  constructor({ players, emit, onEnd }) {
    this.emit = emit;
    this.onEnd = onEnd;
    this.over = false;
    this.timeLeft = MATCH.durationMs;
    this.players = players.map((p, slot) => ({
      slot,
      token: p.token,
      name: p.name,
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      grounded: true,
      jumpLatch: false,
      yaw: 0,
      pitch: 0,
      hp: PLAYER.maxHp,
      alive: true,
      kills: 0,
      deaths: 0,
      headshots: 0,
      ammo: WEAPON.magSize,
      reloading: false,
      reloadEnd: 0,
      lastShotAt: 0,
      respawnAt: 0,
      protectedUntil: 0,
      connected: true,
      moving: false,
      input: makeInput(),
    }));

    // Symmetric initial spawns.
    this.players.forEach((p, slot) => {
      const spawn = SPAWNS[slot % SPAWNS.length];
      p.x = spawn.x;
      p.z = spawn.z;
      p.yaw = spawn.yaw;
      p.pitch = 0;
      p.protectedUntil = Date.now() + PLAYER.spawnProtectMs;
    });
  }

  find(token) {
    return this.players.find((p) => p.token === token) || null;
  }

  setConnected(token, connected) {
    const p = this.find(token);
    if (p) p.connected = connected;
  }

  setInput(token, msg) {
    const p = this.find(token);
    if (!p || !p.alive) return;
    const input = p.input;
    input.forward = !!msg.forward;
    input.back = !!msg.back;
    input.left = !!msg.left;
    input.right = !!msg.right;
    input.jump = !!msg.jump;
    input.sprint = !!msg.sprint;
    input.ads = !!msg.ads;
    input.shoot = !!msg.shoot;
    if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
    if (Number.isFinite(msg.pitch)) {
      p.pitch = clamp(msg.pitch, -PLAYER.maxPitch, PLAYER.maxPitch);
    }
    input.yaw = p.yaw;
  }

  startReload(p, now) {
    if (!p.alive || p.reloading || p.ammo >= WEAPON.magSize) return;
    p.reloading = true;
    p.reloadEnd = now + WEAPON.reloadMs;
    this.emit({ t: 'reload', slot: p.slot, name: p.name, duration: WEAPON.reloadMs });
  }

  requestReload(token) {
    const p = this.find(token);
    if (p) this.startReload(p, Date.now());
  }

  chooseSpawn(opponent) {
    let best = SPAWNS[0];
    let bestDist = -1;
    for (const spawn of SPAWNS) {
      if (collides(spawn.x, spawn.z)) continue;
      const d = opponent ? distanceXZ(spawn, opponent) : Math.random();
      if (d > bestDist) {
        bestDist = d;
        best = spawn;
      }
    }
    return best;
  }

  respawn(p, now) {
    const opponent = this.players.find((o) => o !== p) || null;
    const spawn = this.chooseSpawn(opponent);
    p.x = spawn.x;
    p.y = 0;
    p.z = spawn.z;
    p.vy = 0;
    p.grounded = true;
    p.yaw = spawn.yaw;
    p.pitch = 0;
    p.hp = PLAYER.maxHp;
    p.alive = true;
    p.ammo = WEAPON.magSize;
    p.reloading = false;
    p.reloadEnd = 0;
    p.protectedUntil = now + PLAYER.spawnProtectMs;
    p.respawnAt = 0;
    p.input = makeInput();
    p.input.yaw = p.yaw;
    this.emit({ t: 'spawn', slot: p.slot, name: p.name });
  }

  tick(now, dt) {
    if (this.over) return;

    this.timeLeft -= dt * 1000;

    for (const p of this.players) {
      if (!p.connected) continue;

      if (!p.alive) {
        if (now >= p.respawnAt) this.respawn(p, now);
        continue;
      }

      if (p.reloading && now >= p.reloadEnd) {
        p.reloading = false;
        p.ammo = WEAPON.magSize;
      }

      const result = stepMovement(p, { ...p.input, yaw: p.yaw }, dt, MAP_BOXES);
      p.moving = result.moved;

      if (p.input.shoot) this.tryFire(p, now);
    }

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.end(now, 'time');
    }
  }

  tryFire(p, now) {
    if (p.reloading || p.ammo <= 0) {
      if (p.ammo <= 0) this.startReload(p, now);
      return;
    }
    if (now - p.lastShotAt < WEAPON.fireIntervalMs) return;

    p.lastShotAt = now;
    p.ammo -= 1;

    const origin = eyeOf(p);
    let spread = p.input.ads ? WEAPON.adsSpread : WEAPON.hipSpread;
    if (p.moving) spread += WEAPON.movingSpread * (p.input.ads ? 0.5 : 1);
    const dir = applySpread(directionFromAngles(p.yaw, p.pitch), spread);

    const worldHit = raycastBoxes(
      origin.x,
      origin.y,
      origin.z,
      dir.x,
      dir.y,
      dir.z,
      WEAPON.range,
      MAP_BOXES,
    );

    let bestDist = Math.min(worldHit.dist, WEAPON.range);
    let victim = null;
    let head = false;

    for (const other of this.players) {
      if (other === p || !other.alive) continue;
      const hit = raycastPlayer(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, other);
      if (hit.dist < bestDist) {
        bestDist = hit.dist;
        victim = other;
        head = hit.head;
      }
    }

    const to = {
      x: origin.x + dir.x * bestDist,
      y: origin.y + dir.y * bestDist,
      z: origin.z + dir.z * bestDist,
    };

    let dmg = 0;
    let blocked = false;
    let killed = false;
    if (victim) {
      if (now < victim.protectedUntil) {
        blocked = true;
      } else {
        dmg = head ? WEAPON.damageHead : WEAPON.damageBody;
        victim.hp = Math.max(0, victim.hp - dmg);
        if (victim.hp <= 0) {
          killed = true;
          victim.alive = false;
          victim.deaths += 1;
          victim.respawnAt = now + PLAYER.respawnMs;
          victim.reloading = false;
          victim.input.shoot = false;
          p.kills += 1;
          if (head) p.headshots += 1;
        }
      }
    }

    this.emit({
      t: 'shot',
      slot: p.slot,
      name: p.name,
      from: [round2(origin.x), round2(origin.y), round2(origin.z)],
      to: [round2(to.x), round2(to.y), round2(to.z)],
      hit: !!victim,
      head,
      blocked,
      dmg,
      victimHp: victim ? victim.hp : null,
    });

    if (killed) {
      this.emit({
        t: 'kill',
        killer: p.slot,
        victim: victim.slot,
        killerName: p.name,
        victimName: victim.name,
        headshot: head,
        killerKills: p.kills,
      });
      if (p.kills >= MATCH.killsToWin) {
        this.end(now, 'kills', p.token);
      }
    }

    if (p.ammo <= 0) this.startReload(p, now);
  }

  snapshot(now = Date.now()) {
    return {
      t: 'state',
      timeLeft: Math.max(0, Math.round(this.timeLeft)),
      over: this.over,
      players: this.players.map((p) => ({
        slot: p.slot,
        n: p.name,
        x: round2(p.x),
        y: round2(p.y),
        z: round2(p.z),
        yaw: round2(p.yaw),
        pitch: round2(p.pitch),
        hp: p.hp,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        ammo: p.ammo,
        reloading: p.reloading,
        reloadLeft: p.reloading ? Math.max(0, p.reloadEnd - now) : 0,
        prot: now < p.protectedUntil,
        conn: p.connected,
      })),
    };
  }

  end(now, reason, forcedWinnerToken = null) {
    if (this.over) return;
    this.over = true;

    let winnerToken = forcedWinnerToken;
    if (!winnerToken) {
      const sorted = [...this.players].sort((a, b) => b.kills - a.kills);
      if (sorted[0].kills > sorted[1].kills) winnerToken = sorted[0].token;
    }

    const winner = winnerToken ? this.find(winnerToken) : null;
    const summary = {
      t: 'matchEnd',
      reason,
      winner: winner ? winner.name : null,
      winnerSlot: winner ? winner.slot : null,
      draw: !winner,
      timeLeft: Math.max(0, Math.round(this.timeLeft)),
      players: this.players.map((p) => ({
        slot: p.slot,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
        headshots: p.headshots,
      })),
    };

    this.onEnd(summary, this.players);
  }

  forceWin(token, reason = 'forfeit') {
    this.end(Date.now(), reason, token);
  }
}
