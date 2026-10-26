import { PLAYER, WEAPON, MATCH } from '/shared/constants.js';
import { stepMovement, clamp } from '/shared/physics.js';
import { World } from './world.js';
import { Avatar } from './avatars.js';
import { InputController } from './input.js';

const $ = (id) => document.getElementById(id);

function fitPrediction(pred, server) {
  pred.x = server.x;
  pred.y = server.y;
  pred.z = server.z;
  pred.vy = 0;
  pred.grounded = server.y <= 0.001;
  pred.jumpLatch = false;
}

export class GameClient {
  constructor({ canvas, net, sound, onExit, onStats, onToast }) {
    this.canvas = canvas;
    this.net = net;
    this.sound = sound;
    this.onExit = onExit;
    this.onStats = onStats;
    this.onToast = onToast;

    this.world = null;
    this.avatars = new Map();
    this.active = false;
    this.phase = 'idle';
    this.mySlot = 0;
    this.names = [];
    this.code = '';
    this.snapshot = null;
    this.serverMe = null;
    this.initialized = false;
    this.lastHp = PLAYER.maxHp;
    this.lastTime = 0;
    this.raf = null;
    this.accumulator = 0;
    this.dead = false;
    this.resultShown = false;
    this.countdownTimer = null;
    this.countdownEnd = 0;
    this.countdownValue = null;
    this.messageTimer = null;
    this.hitTimer = null;

    this.pred = {
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      grounded: true,
      jumpLatch: false,
      yaw: 0,
    };

    this.input = new InputController(canvas, {
      onReload: () => this.reload(),
      onLockChange: (locked) => this.handleLockChange(locked),
      onScoreboard: (show) => this.toggleScoreboard(show),
    });

    this.dom = {
      hpValue: $('hp-value'),
      hpFill: $('hp-bar-fill'),
      ammoValue: $('ammo-value'),
      weaponName: $('weapon-name'),
      reloadLabel: $('reload-label'),
      protectLabel: $('protect-label'),
      timer: $('timer'),
      scoreUs: $('score-us'),
      scoreThem: $('score-them'),
      enemyName: $('enemy-name'),
      killfeed: $('killfeed'),
      hitmarker: $('hitmarker'),
      vignette: $('damage-vignette'),
      crosshair: $('crosshair'),
      roomBadge: $('room-badge'),
      centerMessage: $('center-message'),
      gameOverlay: $('game-overlay'),
      overlayTitle: $('overlay-title'),
      overlayText: $('overlay-text'),
      overlayBtn: $('overlay-btn'),
      overlayLeave: $('overlay-leave'),
      countdownOverlay: $('countdown-overlay'),
      countdownNumber: $('countdown-number'),
      resultOverlay: $('result-overlay'),
      resultTitle: $('result-title'),
      resultKicker: $('result-kicker'),
      resultScore: $('result-score'),
      resultBody: $('result-table').querySelector('tbody'),
      resultBtn: $('result-btn'),
      scoreboard: $('scoreboard'),
      scoreboardBody: $('scoreboard').querySelector('tbody'),
      disconnectOverlay: $('disconnect-overlay'),
    };

    this.dom.overlayBtn.addEventListener('click', () => this.requestPointerLock());
    this.dom.overlayLeave.addEventListener('click', () => this.leaveToLobby());
    this.dom.resultBtn.addEventListener('click', () => {
      this.leaveToLobby();
    });
  }

  /* ---------------------------- Screen lifecycle --------------------------- */

  ensureWorld() {
    if (this.world) return;
    this.world = new World(this.canvas);
    this.world.setViewmodelVisible(false);
  }

  begin({ code, you, players }) {
    this.ensureWorld();
    this.active = true;
    this.phase = 'countdown';
    this.world.clearEffects();
    this.code = code || '';
    this.mySlot = Number.isInteger(you) ? you : 0;
    this.names = players || [];
    this.snapshot = null;
    this.serverMe = null;
    this.initialized = false;
    this.dead = false;
    this.resultShown = false;
    this.lastHp = PLAYER.maxHp;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.input.setEnabled(true);
    this.input.resetView(0, 0);

    this.setupAvatars();
    this.resetHud();

    this.dom.resultOverlay.classList.add('hidden');
    this.dom.gameOverlay.classList.remove('hidden');
    this.dom.overlayTitle.textContent = '点击进入战场';
    this.dom.overlayText.textContent = '点击后锁定鼠标，Esc 可随时释放';
    this.dom.overlayBtn.textContent = '点击开始';
    this.dom.disconnectOverlay.classList.add('hidden');
    this.dom.countdownOverlay.classList.add('hidden');
    this.dom.crosshair.classList.remove('ads');
    this.dom.roomBadge.textContent = this.code ? `房间 ${this.code}` : '1v1';
    this.world.setViewmodelVisible(true);

    this.startLoop();
    if (document.pointerLockElement === this.canvas) {
      this.dom.gameOverlay.classList.add('hidden');
    }
  }

  beginCountdown(msg) {
    this.begin(msg);
    this.phase = 'countdown';
    this.dom.enemyName.textContent = this.opponentName() || '对手';
    this.startCountdown(msg.seconds);
  }

  resumeFromRoom(room) {
    if (this.active) {
      this.showDisconnect(false);
      return;
    }
    this.begin({ code: room.code, you: room.you, players: room.players });
    if (room.state === 'playing') {
      this.phase = 'playing';
      this.stopCountdown();
      this.dom.countdownOverlay.classList.add('hidden');
    }
  }

  beginPlaying(msg) {
    if (!this.active) this.begin(msg);
    if (msg?.players?.length) {
      this.names = msg.players;
      this.dom.enemyName.textContent = this.opponentName() || '对手';
    }
    this.phase = 'playing';
    this.stopCountdown();
    this.dom.countdownOverlay.classList.add('hidden');
    this.dom.gameOverlay.classList.toggle('hidden', document.pointerLockElement === this.canvas);
    this.sound.countdown(true);
    this.showCenterMessage('消灭对手', 1400);
  }

  startCountdown(seconds) {
    this.stopCountdown();
    this.countdownEnd = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
    this.countdownValue = null;
    this.dom.countdownOverlay.classList.remove('hidden');
    const tick = () => {
      if (!this.active || this.phase !== 'countdown') return;
      const left = Math.max(0, Math.ceil((this.countdownEnd - Date.now()) / 1000));
      if (left > 0) {
        this.dom.countdownNumber.textContent = String(left);
        if (left !== this.countdownValue) {
          this.countdownValue = left;
          this.sound.countdown(left === 1);
        }
      } else {
        this.dom.countdownNumber.textContent = 'GO';
        this.stopCountdown();
        setTimeout(() => this.dom.countdownOverlay.classList.add('hidden'), 350);
      }
    };
    tick();
    this.countdownTimer = setInterval(tick, 200);
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  exit() {
    this.active = false;
    this.phase = 'idle';
    this.stopCountdown();
    this.input.setEnabled(false);
    this.input.exitLock();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.clearAvatars();
    this.snapshot = null;
    this.serverMe = null;
    this.initialized = false;
    this.dom.gameOverlay.classList.add('hidden');
    this.dom.countdownOverlay.classList.add('hidden');
    this.dom.resultOverlay.classList.add('hidden');
    this.dom.disconnectOverlay.classList.add('hidden');
    this.dom.scoreboard.classList.add('hidden');
    this.dom.hitmarker.classList.remove('show');
    this.dom.vignette.classList.remove('flash');
    this.dom.centerMessage.classList.remove('show');
    if (this.world) this.world.setViewmodelVisible(false);
  }

  showDisconnect(show) {
    if (!this.active) return;
    this.dom.disconnectOverlay.classList.toggle('hidden', !show);
  }

  leaveToLobby() {
    this.net.send({ t: 'leaveRoom' });
    this.exit();
    this.onExit?.();
  }

  /* ------------------------------- Avatars -------------------------------- */

  setupAvatars() {
    this.clearAvatars();
    this.names.forEach((name, slot) => {
      if (slot === this.mySlot) return;
      const avatar = new Avatar(slot, name);
      this.world.scene.add(avatar.root);
      this.avatars.set(slot, avatar);
    });
  }

  clearAvatars() {
    for (const avatar of this.avatars.values()) {
      this.world?.scene.remove(avatar.root);
      avatar.dispose();
    }
    this.avatars.clear();
  }

  opponentName() {
    return this.names.find((_, index) => index !== this.mySlot) || '';
  }

  /* -------------------------------- HUD ----------------------------------- */

  resetHud() {
    this.dom.hpValue.textContent = PLAYER.maxHp;
    this.dom.hpFill.style.width = '100%';
    this.dom.hpFill.classList.remove('low');
    this.dom.ammoValue.textContent = WEAPON.magSize;
    this.dom.weaponName.textContent = WEAPON.name;
    this.dom.reloadLabel.classList.add('hidden');
    this.dom.protectLabel.classList.add('hidden');
    this.dom.timer.textContent = formatTime(MATCH.durationMs);
    this.dom.scoreUs.textContent = '0';
    this.dom.scoreThem.textContent = '0';
    this.dom.enemyName.textContent = this.opponentName() || '对手';
    this.dom.killfeed.innerHTML = '';
    this.dom.roomBadge.textContent = this.code ? `房间 ${this.code}` : '1v1';
  }

  updateHud(me, foe, timeLeft) {
    if (!me) return;
    this.dom.hpValue.textContent = Math.max(0, Math.round(me.hp));
    const pct = Math.max(0, Math.min(1, me.hp / PLAYER.maxHp));
    this.dom.hpFill.style.width = `${pct * 100}%`;
    this.dom.hpFill.classList.toggle('low', me.hp <= 30);
    this.dom.ammoValue.textContent = me.ammo;
    this.dom.reloadLabel.classList.toggle('hidden', !me.reloading);
    this.dom.protectLabel.classList.toggle('hidden', !me.prot);
    this.dom.scoreUs.textContent = me.kills;
    this.dom.scoreThem.textContent = foe ? foe.kills : 0;
    this.dom.timer.textContent = formatTime(timeLeft);
    if (foe) this.dom.enemyName.textContent = foe.n;
    if (me.hp < this.lastHp) {
      this.dom.vignette.classList.remove('flash');
      void this.dom.vignette.offsetWidth;
      this.dom.vignette.classList.add('flash');
      this.world.addShake(0.012 + (this.lastHp - me.hp) * 0.0008);
    }
    this.lastHp = me.hp;
  }

  showCenterMessage(text, duration = 1600) {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.dom.centerMessage.textContent = text;
    this.dom.centerMessage.classList.add('show');
    this.messageTimer = setTimeout(() => {
      this.dom.centerMessage.classList.remove('show');
      this.messageTimer = null;
    }, duration);
  }

  showHitmarker(kind = '') {
    const el = this.dom.hitmarker;
    el.className = '';
    if (kind) el.classList.add(kind);
    void el.offsetWidth;
    el.classList.add('show');
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 200);
  }

  addKillFeed(killer, victim, headshot) {
    const row = document.createElement('div');
    row.className = 'kill-entry';

    const k = document.createElement('span');
    k.className = 'killer';
    k.textContent = killer;

    const icon = document.createElement('span');
    icon.className = 'weapon-icon';
    icon.textContent = '▸';

    const v = document.createElement('span');
    v.className = 'victim';
    v.textContent = victim;

    row.append(k, icon, v);
    if (headshot) {
      const hs = document.createElement('span');
      hs.className = 'hs';
      hs.textContent = 'HEADSHOT';
      row.append(hs);
    }

    this.dom.killfeed.prepend(row);
    setTimeout(() => row.remove(), 4500);
    while (this.dom.killfeed.children.length > 5) {
      this.dom.killfeed.lastChild.remove();
    }
  }

  toggleScoreboard(show) {
    if (!this.active || this.phase === 'ended') return;
    this.dom.scoreboard.classList.toggle('hidden', !show);
    if (show) this.renderScoreboard();
  }

  renderScoreboard() {
    if (!this.snapshot) return;
    const rows = this.snapshot.players
      .slice()
      .sort((a, b) => b.kills - a.kills)
      .map((p) => {
        const tr = document.createElement('tr');
        const isMe = p.slot === this.mySlot;
        tr.innerHTML = `
          <td>${escapeHtml(p.n)}${isMe ? ' <span class="muted small">(你)</span>' : ''}</td>
          <td>${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${p.alive ? '存活' : '阵亡'}</td>
        `;
        return tr;
      });
    this.dom.scoreboardBody.replaceChildren(...rows);
  }

  /* --------------------------------- Lock --------------------------------- */

  async requestPointerLock() {
    this.sound.init();
    if (this.phase === 'ended') return;
    const ok = await this.input.requestLock();
    if (!ok) {
      this.dom.overlayText.textContent = '鼠标锁定失败，请再点击一次';
    }
  }

  handleLockChange(locked) {
    if (!this.active) return;
    if (locked) {
      this.dom.gameOverlay.classList.add('hidden');
      this.sound.init();
      return;
    }
    if (this.phase === 'ended' || this.phase === 'idle') return;
    this.dom.overlayTitle.textContent = '鼠标已释放';
    this.dom.overlayText.textContent = '对局仍在进行，点击继续战斗';
    this.dom.overlayBtn.textContent = '继续战斗';
    this.dom.gameOverlay.classList.remove('hidden');
  }

  /* ------------------------------- Messages ------------------------------- */

  handleState(msg) {
    if (!this.active || this.phase === 'ended' || !msg?.players) return;
    this.snapshot = msg;
    const me = msg.players.find((p) => p.slot === this.mySlot);
    const foe = msg.players.find((p) => p.slot !== this.mySlot);
    if (!me) return;
    this.serverMe = me;

    if (!this.initialized) {
      fitPrediction(this.pred, me);
      this.pred.yaw = me.yaw;
      this.input.resetView(me.yaw, me.pitch);
      this.initialized = true;
      this.lastHp = me.hp;
    }

    this.updateHud(me, foe, msg.timeLeft);

    for (const p of msg.players) {
      if (p.slot === this.mySlot) continue;
      const avatar = this.avatars.get(p.slot);
      if (avatar) avatar.setTarget(p);
    }

    const wasDead = this.dead;
    this.dead = !me.alive;

    if (this.dead && !wasDead) {
      this.input.clearTransient();
      this.world.setViewmodelVisible(false);
    } else if (!this.dead && wasDead) {
      fitPrediction(this.pred, me);
      this.pred.yaw = me.yaw;
      this.input.resetView(me.yaw, me.pitch);
      this.lastHp = me.hp;
      this.world.setViewmodelVisible(true);
      this.showCenterMessage('重新部署', 1100);
      this.sound.spawn();
    }

    if (!this.dead) {
      const error = Math.hypot(this.pred.x - me.x, this.pred.z - me.z);
      if (error > 1.6 || Math.abs(this.pred.y - me.y) > 1.2) {
        fitPrediction(this.pred, me);
        this.pred.yaw = this.input.yaw;
      }
    }

    if (!this.dom.scoreboard.classList.contains('hidden')) this.renderScoreboard();
  }

  handleShot(msg) {
    if (!this.active) return;
    const mine = msg.slot === this.mySlot;
    this.world.addTracer(msg.from, msg.to, mine);

    if (mine) {
      this.world.triggerShot();
      this.sound.shot(0, this.input.ads);
      if (msg.hit) {
        if (msg.blocked) {
          this.showHitmarker('head');
          this.sound.blocked();
        } else {
          this.showHitmarker(msg.head ? 'head' : '');
          this.sound.hit(msg.head, false);
        }
      }
    } else {
      const avatar = this.avatars.get(msg.slot);
      avatar?.flash();
      const eyeY = this.pred.y + PLAYER.eyeHeight;
      const distance = Math.hypot(msg.from[0] - this.pred.x, msg.from[1] - eyeY, msg.from[2] - this.pred.z);
      this.sound.shot(distance, false);
      if (msg.hit) {
        this.world.addShake(0.02);
      }
    }

    if (!msg.hit) this.world.addImpact(msg.to, false);
  }

  handleKill(msg) {
    if (!this.active) return;
    this.addKillFeed(msg.killerName, msg.victimName, msg.headshot);

    if (msg.killer === this.mySlot) {
      this.showHitmarker('kill');
      this.sound.hit(false, true);
      this.showCenterMessage(msg.headshot ? '爆头击杀！' : `击杀 ${msg.victimName}`, 1300);
    }

    if (msg.victim === this.mySlot) {
      this.sound.damage();
      this.showCenterMessage(`你被 ${msg.killerName} 击杀`, 1800);
      this.world.addShake(0.05);
      this.dead = true;
      this.input.clearTransient();
      this.world.setViewmodelVisible(false);
    }
  }

  handleReload(msg) {
    if (!this.active) return;
    if (msg.slot === this.mySlot) this.sound.reload();
  }

  handleSpawn(msg) {
    if (msg.slot === this.mySlot) {
      this.sound.spawn();
    }
  }

  handleMatchEnd(msg) {
    if (!this.active) return;
    this.phase = 'ended';
    this.dead = true;
    this.stopCountdown();
    this.input.setEnabled(false);
    this.input.exitLock();
    this.dom.gameOverlay.classList.add('hidden');
    this.dom.countdownOverlay.classList.add('hidden');
    this.dom.scoreboard.classList.add('hidden');
    this.world.setViewmodelVisible(false);

    const me = msg.players.find((p) => p.slot === this.mySlot) || { kills: 0, deaths: 0, headshots: 0, name: '' };
    const foe =
      msg.players.find((p) => p.slot !== this.mySlot) || { kills: 0, deaths: 0, headshots: 0, name: '对手' };

    const win = msg.winnerSlot === this.mySlot && !msg.draw;
    const draw = !!msg.draw;

    this.dom.resultTitle.textContent = draw ? '平局' : win ? '胜利' : '失败';
    this.dom.resultTitle.className = draw ? 'draw' : win ? 'win' : 'lose';
    this.dom.resultKicker.textContent = reasonText(msg.reason);
    this.dom.resultScore.innerHTML = `${me.kills}<span>:</span>${foe.kills}`;

    const rows = [me, foe].map((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(p.name)}${p.slot === this.mySlot ? ' <span class="muted small">(你)</span>' : ''}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${p.headshots}</td>
      `;
      return tr;
    });
    this.dom.resultBody.replaceChildren(...rows);

    this.dom.resultOverlay.classList.remove('hidden');
    if (win) this.sound.victory();
    else if (draw) this.sound.countdown(true);
    else this.sound.defeat();

    this.resultShown = true;
    this.onStats?.();
    this.onToast?.(win ? '胜利！战绩已保存' : draw ? '平局，战绩已保存' : '失败，战绩已保存');
  }

  /* -------------------------------- Loop ---------------------------------- */

  startLoop() {
    if (this.raf) return;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.active) {
        this.raf = null;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.update(dt);
      this.world.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  update(dt) {
    if (!this.world) return;
    const me = this.snapshot?.players.find((p) => p.slot === this.mySlot) || null;
    const locked = document.pointerLockElement === this.canvas;
    const input = this.input.getInput();
    const canAct = this.phase === 'playing' && !!me && me.alive && locked && !this.resultShown;

    const moveInput = {
      forward: canAct && input.forward,
      back: canAct && input.back,
      left: canAct && input.left,
      right: canAct && input.right,
      jump: canAct && input.jump,
      sprint: canAct && input.sprint,
      ads: canAct && input.ads,
      shoot: canAct && input.shoot,
      yaw: input.yaw,
      pitch: input.pitch,
    };

    if (canAct) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) {
        stepMovement(this.pred, { ...moveInput, yaw: input.yaw }, sub);
        this.pred.yaw = input.yaw;
      }

      if (this.serverMe) {
        const error = Math.hypot(this.pred.x - this.serverMe.x, this.pred.z - this.serverMe.z);
        if (error > 1.6) {
          fitPrediction(this.pred, this.serverMe);
          this.pred.yaw = input.yaw;
        } else {
          const k = Math.min(1, dt * 2.2);
          this.pred.x += (this.serverMe.x - this.pred.x) * k;
          this.pred.z += (this.serverMe.z - this.pred.z) * k;
        }
      }
    }

    let camX = this.pred.x;
    let camY = this.pred.y + PLAYER.eyeHeight;
    let camZ = this.pred.z;

    if (!me || !me.alive) {
      const s = this.serverMe || me;
      if (s) {
        camX = s.x;
        camY = s.y + 0.45;
        camZ = s.z;
      }
    }

    this.world.setCameraPose(camX, camY, camZ, input.yaw, input.pitch);
    this.world.setViewmodelVisible(!!me?.alive && !this.resultShown);
    this.world.update(dt, {
      moving: canAct && (input.forward || input.back || input.left || input.right),
      ads: canAct && input.ads,
      locked,
    });

    for (const avatar of this.avatars.values()) avatar.update(dt);

    const gap = 6 + (canAct && (input.forward || input.back || input.left || input.right) ? 7 : 0) + this.world.recoil * 5;
    this.dom.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    this.dom.crosshair.classList.toggle('ads', canAct && input.ads);

    this.accumulator += dt;
    if (this.accumulator >= 1 / 30) {
      this.accumulator = 0;
      if (this.phase === 'playing' || this.phase === 'countdown') {
        this.net.send({
          t: 'input',
          forward: moveInput.forward,
          back: moveInput.back,
          left: moveInput.left,
          right: moveInput.right,
          jump: moveInput.jump,
          sprint: moveInput.sprint,
          ads: moveInput.ads,
          shoot: moveInput.shoot,
          yaw: normalizeAngle(input.yaw),
          pitch: clamp(input.pitch, -PLAYER.maxPitch, PLAYER.maxPitch),
        });
      }
    }
  }

  reload() {
    if (!this.active || this.phase !== 'playing' || this.dead) return;
    this.net.send({ t: 'reload' });
  }
}

function normalizeAngle(a) {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function reasonText(reason) {
  switch (reason) {
    case 'kills':
      return `击杀数达到 ${MATCH.killsToWin}`;
    case 'time':
      return '时间到，按击杀数判定';
    case 'forfeit':
      return '对手退出了对局';
    case 'disconnect':
      return '对手掉线';
    default:
      return '对局结束';
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
