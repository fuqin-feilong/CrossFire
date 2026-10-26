import { MATCH } from '../shared/constants.js';
import { Game } from './game.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const WS_OPEN = 1;

export class RoomManager {
  constructor(store) {
    this.store = store;
    this.clients = new Map(); // session token -> client
    this.bySocket = new Map(); // ws -> client
    this.queue = [];
    this.rooms = new Map(); // code -> room
  }

  /* ------------------------------------------------------------------ */
  /* Connection lifecycle                                                */
  /* ------------------------------------------------------------------ */

  connect(ws, session) {
    let client = this.clients.get(session.token);

    if (client) {
      if (client.ws && client.ws !== ws && client.ws.readyState === WS_OPEN) {
        client.ws.close(4001, 'replaced');
      }
      client.ws = ws;
      client.connected = true;
      if (client.forfeitTimer) {
        clearTimeout(client.forfeitTimer);
        client.forfeitTimer = null;
      }
      if (client.room?.game) client.room.game.setConnected(client.token, true);
    } else {
      client = {
        token: session.token,
        name: session.name,
        ws,
        room: null,
        queued: false,
        connected: true,
        forfeitTimer: null,
      };
      this.clients.set(session.token, client);
    }

    if (client.room && client.room.state === 'ended') {
      client.room = null;
    }

    this.bySocket.set(ws, client);

    this.send(client, {
      t: 'hello',
      name: client.name,
      stats: this.store.profile(client.name),
      room: this.roomSummary(client),
    });

    if (client.room?.state === 'countdown') {
      this.sendCountdown(client);
    } else if (client.room?.state === 'playing' && client.room.game) {
      this.send(client, client.room.game.snapshot());
    } else if (client.queued) {
      this.send(client, { t: 'queued' });
    }

    return client;
  }

  disconnectBySocket(ws) {
    const client = this.bySocket.get(ws);
    if (!client) return;
    this.bySocket.delete(ws);
    if (client.ws !== ws) return; // a newer socket replaced this one

    client.connected = false;

    if (client.queued) this.removeFromQueue(client);

    const room = client.room;
    if (!room) {
      this.clients.delete(client.token);
      return;
    }

    if (room.state === 'waiting' || room.state === 'countdown') {
      const peer = room.players.find((p) => p !== client);
      if (peer) {
        this.send(peer, { t: 'toLobby', reason: `${client.name} 离开了房间` });
      }
      this.destroyRoom(room);
      return;
    }

    if (room.state === 'playing' && room.game && !room.game.over) {
      room.game.setConnected(client.token, false);
      client.forfeitTimer = setTimeout(() => {
        client.forfeitTimer = null;
        if (!client.connected && room.state === 'playing' && room.game && !room.game.over) {
          const opponent = room.players.find((p) => p !== client);
          if (opponent) room.game.forceWin(opponent.token, 'disconnect');
        }
      }, MATCH.reconnectGraceMs);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Messaging                                                           */
  /* ------------------------------------------------------------------ */

  send(client, message) {
    if (!client?.ws || client.ws.readyState !== WS_OPEN) return;
    try {
      client.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('[ws] send failed:', err.message);
    }
  }

  broadcast(room, message) {
    for (const player of room.players) this.send(player, message);
  }

  roomSummary(client) {
    const room = client.room;
    if (!room) return null;
    return {
      code: room.code,
      state: room.state,
      you: room.players.indexOf(client),
      players: room.players.map((p) => p.name),
      opponent: room.players.find((p) => p !== client)?.name || null,
    };
  }

  sendCountdown(client) {
    const room = client.room;
    if (!room?.game) return;
    this.send(client, {
      t: 'countdown',
      code: room.code,
      you: room.players.indexOf(client),
      players: room.players.map((p) => p.name),
      seconds: Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)),
    });
    this.send(client, room.game.snapshot());
  }

  handleMessage(client, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'quick':
        this.enqueue(client);
        break;
      case 'cancelQueue':
        this.removeFromQueue(client);
        this.send(client, { t: 'queueCancelled' });
        break;
      case 'createRoom':
        this.createRoomFlow(client);
        break;
      case 'joinRoom':
        this.joinRoom(client, msg.code);
        break;
      case 'leaveRoom':
        this.leaveRoom(client);
        break;
      case 'input':
        if (client.room?.state === 'playing' || client.room?.state === 'countdown') {
          client.room.game?.setInput(client.token, msg);
        }
        break;
      case 'reload':
        if (client.room?.state === 'playing') {
          client.room.game?.requestReload(client.token);
        }
        break;
      case 'ping':
        this.send(client, { t: 'pong', ts: msg.ts });
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Matchmaking / rooms                                                 */
  /* ------------------------------------------------------------------ */

  enqueue(client) {
    if (client.room) {
      this.send(client, { t: 'error', message: '你已经在房间中' });
      return;
    }
    if (client.queued) {
      this.send(client, { t: 'queued', count: this.queue.length });
      return;
    }
    client.queued = true;
    this.queue.push(client);
    this.send(client, { t: 'queued', count: this.queue.length });
    this.tryMatch();
  }

  removeFromQueue(client) {
    if (!client.queued) return;
    client.queued = false;
    this.queue = this.queue.filter((c) => c !== client);
  }

  tryMatch() {
    this.queue = this.queue.filter((c) => c.connected && !c.room && c.queued);
    if (this.queue.length < 2) return;

    const a = this.queue[0];
    const b = this.queue.find((c) => c !== a);
    if (!b) return;

    this.queue = this.queue.filter((c) => c !== a && c !== b);
    a.queued = false;
    b.queued = false;

    const room = this.createRoom([a, b]);
    this.startCountdown(room);
  }

  newCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-3).toUpperCase()}`;
  }

  createRoom(players) {
    const room = {
      code: this.newCode(),
      players,
      state: 'waiting',
      host: players[0],
      game: null,
      createdAt: Date.now(),
      countdownTimer: null,
      cleanupTimer: null,
      countdownEndsAt: 0,
    };
    this.rooms.set(room.code, room);
    for (const player of players) {
      player.room = room;
      player.queued = false;
    }
    for (const player of players) {
      this.send(player, { t: 'room', ...this.roomSummary(player) });
    }
    return room;
  }

  createRoomFlow(client) {
    this.removeFromQueue(client);
    if (client.room) {
      this.send(client, { t: 'error', message: '你已经在房间中' });
      return;
    }
    this.createRoom([client]);
  }

  joinRoom(client, rawCode) {
    this.removeFromQueue(client);
    if (client.room) {
      this.send(client, { t: 'error', message: '你已经在房间中' });
      return;
    }
    const code = String(rawCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.send(client, { t: 'error', message: '房间不存在或已过期' });
      return;
    }
    if (room.state !== 'waiting' || room.players.length >= 2) {
      this.send(client, { t: 'error', message: '房间已满或已开始' });
      return;
    }
    room.players.push(client);
    client.room = room;
    for (const player of room.players) {
      this.send(player, { t: 'room', ...this.roomSummary(player) });
    }
    this.startCountdown(room);
  }

  startCountdown(room) {
    if (room.state !== 'waiting' || room.players.length !== 2) return;
    room.state = 'countdown';
    room.countdownEndsAt = Date.now() + MATCH.countdownMs;

    room.game = new Game({
      players: room.players.map((p) => ({ token: p.token, name: p.name })),
      emit: (event) => this.broadcast(room, event),
      onEnd: (summary, players) => this.finishMatch(room, summary, players),
    });

    for (const player of room.players) this.sendCountdown(player);

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      if (room.state !== 'countdown') return;
      if (room.players.length !== 2 || room.players.some((p) => !p.connected)) {
        for (const player of room.players) {
          this.send(player, { t: 'toLobby', reason: '对手断线，对局取消' });
        }
        this.destroyRoom(room);
        return;
      }
      room.state = 'playing';
      room.startedAt = Date.now();
      room.players.forEach((player, index) => {
        this.send(player, {
          t: 'matchStart',
          code: room.code,
          you: index,
          players: room.players.map((p) => p.name),
          durationMs: MATCH.durationMs,
        });
      });
    }, MATCH.countdownMs);
  }

  finishMatch(room, summary, gamePlayers) {
    if (room.state === 'ended' || room.state === 'destroyed') return;
    room.state = 'ended';
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    for (const player of room.players) {
      if (player.forfeitTimer) {
        clearTimeout(player.forfeitTimer);
        player.forfeitTimer = null;
      }
    }

    this.store.recordMatch({ winner: summary.winner, players: summary.players });
    this.broadcast(room, summary);

    room.cleanupTimer = setTimeout(() => this.destroyRoom(room), 45000);
    // gamePlayers kept only for potential future stats; summary has everything needed.
    void gamePlayers;
  }

  leaveRoom(client) {
    const room = client.room;
    if (!room) {
      this.send(client, { t: 'toLobby' });
      return;
    }

    if (room.state === 'waiting' || room.state === 'countdown') {
      const peer = room.players.find((p) => p !== client);
      if (peer) this.send(peer, { t: 'toLobby', reason: `${client.name} 离开了房间` });
      this.destroyRoom(room);
      this.send(client, { t: 'toLobby' });
      return;
    }

    if (room.state === 'playing' && room.game && !room.game.over) {
      const opponent = room.players.find((p) => p !== client);
      if (opponent) room.game.forceWin(opponent.token, 'forfeit');
    }

    client.room = null;
    this.send(client, { t: 'toLobby' });
  }

  destroyRoom(room) {
    if (!room || room.state === 'destroyed') return;
    room.state = 'destroyed';
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    for (const player of room.players) {
      if (player.room === room) player.room = null;
      if (player.forfeitTimer) {
        clearTimeout(player.forfeitTimer);
        player.forfeitTimer = null;
      }
      if (this.clients.get(player.token) === player && !player.connected) {
        this.clients.delete(player.token);
      }
    }
    this.rooms.delete(room.code);
  }

  tick(now, dt) {
    for (const room of this.rooms.values()) {
      if (room.state !== 'playing' || !room.game || room.game.over) continue;
      room.game.tick(now, dt);
      if (room.state === 'playing' && !room.game.over) {
        this.broadcast(room, room.game.snapshot(now));
      }
    }
  }
}
