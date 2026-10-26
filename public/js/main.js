import { Net } from './net.js';
import { Sound } from './audio.js';
import { GameClient } from './game.js';

const $ = (id) => document.getElementById(id);

const dom = {
  loginScreen: $('screen-login'),
  lobbyScreen: $('screen-lobby'),
  gameScreen: $('screen-game'),
  loginForm: $('login-form'),
  nickname: $('nickname'),
  loginError: $('login-error'),
  lobbyName: $('lobby-name'),
  netState: $('lobby-net'),
  logout: $('btn-logout'),
  quick: $('btn-quick'),
  queueStatus: $('queue-status'),
  queuePanel: $('queue-panel'),
  cancelQueue: $('btn-cancel-queue'),
  createRoom: $('btn-create'),
  joinRoom: $('btn-join'),
  roomCodeInput: $('room-code-input'),
  roomPanel: $('room-panel'),
  roomCode: $('room-code'),
  roomState: $('room-state'),
  copyCode: $('btn-copy-code'),
  leaveRoom: $('btn-leave-room'),
  message: $('lobby-message'),
  statWins: $('stat-wins'),
  statLosses: $('stat-losses'),
  statKd: $('stat-kd'),
  statKills: $('stat-kills'),
  statMatches: $('stat-matches'),
  statHeadshots: $('stat-headshots'),
  leaderboardBody: $('leaderboard').querySelector('tbody'),
  toast: $('toast'),
  canvas: $('game-canvas'),
};

const state = {
  user: null,
  currentRoom: null,
  queueActive: false,
  messageTimer: null,
  toastTimer: null,
};

const sound = new Sound();
let game = null;

const net = new Net({
  onOpen: () => {
    setNetState(true);
    game?.showDisconnect(false);
  },
  onMessage: handleMessage,
  onClose: () => {
    setNetState(false);
    if (game?.active) game.showDisconnect(true);
    verifySession();
  },
  onReplaced: () => {
    net.close();
    setNetState(false);
    game?.exit();
    showScreen('login');
    dom.loginError.textContent = '账号已在另一个窗口登录，请刷新页面重试';
  },
});

game = new GameClient({
  canvas: dom.canvas,
  net,
  sound,
  onExit: () => {
    showLobby();
    resetLobbyPanels();
  },
  onStats: () => refreshProfile(),
  onToast: (text) => toast(text),
});

/* ------------------------------- Startup -------------------------------- */

bindEvents();
boot();

async function boot() {
  refreshLeaderboard();
  try {
    const me = await api('/api/me');
    if (me.authenticated && me.name) {
      setUser(me);
      showLobby();
      net.connect();
    } else {
      showScreen('login');
    }
  } catch {
    showScreen('login');
  }
}

function bindEvents() {
  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    dom.loginError.textContent = '';
    const nickname = dom.nickname.value.trim();
    if (nickname.length < 2) {
      dom.loginError.textContent = '昵称至少 2 个字符';
      return;
    }
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      });
      sound.init();
      setUser(data);
      showLobby();
      net.connect();
      refreshLeaderboard();
      toast(`欢迎，${data.name}`);
    } catch (err) {
      dom.loginError.textContent = err.message;
    }
  });

  dom.quick.addEventListener('click', () => {
    if (state.currentRoom) {
      showMessage('请先离开当前房间');
      return;
    }
    if (!net.send({ t: 'quick' })) {
      showMessage('连接尚未就绪，正在重连…');
      net.connect();
      return;
    }
    state.queueActive = true;
    dom.queuePanel.classList.remove('hidden');
    dom.roomPanel.classList.add('hidden');
    dom.quick.disabled = true;
    dom.createRoom.disabled = true;
    dom.joinRoom.disabled = true;
    dom.queueStatus.textContent = '';
  });

  dom.cancelQueue.addEventListener('click', () => {
    net.send({ t: 'cancelQueue' });
    resetQueue();
  });

  dom.createRoom.addEventListener('click', () => {
    if (!net.send({ t: 'createRoom' })) {
      showMessage('连接尚未就绪，正在重连…');
      net.connect();
    }
  });

  dom.joinRoom.addEventListener('click', () => {
    const code = dom.roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) {
      showMessage('请输入 4 位房间码');
      return;
    }
    if (!net.send({ t: 'joinRoom', code })) {
      showMessage('连接尚未就绪，正在重连…');
      net.connect();
    }
  });

  dom.roomCodeInput.addEventListener('input', () => {
    dom.roomCodeInput.value = dom.roomCodeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
  });

  dom.roomCodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') dom.joinRoom.click();
  });

  dom.copyCode.addEventListener('click', async () => {
    const code = state.currentRoom?.code || dom.roomCode.textContent;
    try {
      await navigator.clipboard.writeText(code);
      toast('房间码已复制');
    } catch {
      toast(`房间码：${code}`);
    }
  });

  dom.leaveRoom.addEventListener('click', () => {
    net.send({ t: 'leaveRoom' });
    state.currentRoom = null;
    resetLobbyPanels();
    showMessage('已离开房间');
  });

  dom.logout.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout.
    }
    net.close();
    game.exit();
    state.user = null;
    state.currentRoom = null;
    resetLobbyPanels();
    showScreen('login');
    dom.nickname.value = '';
    toast('已退出登录');
  });
}

/* ------------------------------ Net messages ----------------------------- */

function handleMessage(msg) {
  switch (msg.t) {
    case 'hello':
      setUser({ name: msg.name, stats: msg.stats });
      setNetState(true);
      if (msg.room) {
        state.currentRoom = msg.room;
        enterGameRoom(msg.room);
      } else if (game.active) {
        game.exit();
        resetLobbyPanels();
        showLobby();
      } else {
        showLobby();
      }
      refreshLeaderboard();
      break;

    case 'queued':
      state.queueActive = true;
      dom.queuePanel.classList.remove('hidden');
      dom.roomPanel.classList.add('hidden');
      dom.quick.disabled = true;
      dom.createRoom.disabled = true;
      dom.joinRoom.disabled = true;
      dom.queueStatus.textContent = '正在寻找对手…';
      break;

    case 'queueCancelled':
      resetQueue();
      showMessage('已取消匹配');
      break;

    case 'room':
      state.currentRoom = msg;
      showScreen('lobby');
      showRoomPanel(msg);
      break;

    case 'countdown':
      showScreen('game');
      state.currentRoom = {
        code: msg.code,
        you: msg.you,
        players: msg.players,
        state: 'countdown',
      };
      game.beginCountdown(msg);
      break;

    case 'matchStart':
      showScreen('game');
      if (!game.active) {
        game.begin({ code: msg.code, you: msg.you, players: msg.players });
      }
      game.beginPlaying(msg);
      break;

    case 'state':
      game.handleState(msg);
      break;

    case 'shot':
      game.handleShot(msg);
      break;

    case 'kill':
      game.handleKill(msg);
      break;

    case 'reload':
      game.handleReload(msg);
      break;

    case 'spawn':
      game.handleSpawn(msg);
      break;

    case 'matchEnd':
      game.handleMatchEnd(msg);
      state.currentRoom = null;
      refreshProfile();
      refreshLeaderboard();
      break;

    case 'toLobby':
      if (msg.reason) toast(msg.reason);
      game.exit();
      state.currentRoom = null;
      resetLobbyPanels();
      showLobby();
      refreshProfile();
      refreshLeaderboard();
      break;

    case 'error':
      showMessage(msg.message || '操作失败');
      toast(msg.message || '操作失败');
      break;

    case 'pong':
      break;

    default:
      break;
  }
}

/* -------------------------------- Screens -------------------------------- */

function showScreen(name) {
  dom.loginScreen.classList.toggle('active', name === 'login');
  dom.lobbyScreen.classList.toggle('active', name === 'lobby');
  dom.gameScreen.classList.toggle('active', name === 'game');
}

function showLobby() {
  showScreen('lobby');
  if (state.currentRoom) showRoomPanel(state.currentRoom);
}

function enterGameRoom(room) {
  state.currentRoom = room;
  if (room.state === 'waiting') {
    showLobby();
    showRoomPanel(room);
    return;
  }
  showScreen('game');
  game.resumeFromRoom(room);
}

function showRoomPanel(room) {
  state.currentRoom = room;
  dom.roomPanel.classList.remove('hidden');
  dom.queuePanel.classList.add('hidden');
  dom.roomCode.textContent = room.code;
  dom.roomState.textContent =
    room.state === 'countdown'
      ? '对手已加入，准备开始…'
      : room.state === 'playing'
        ? '对局进行中…'
        : '等待对手加入…（把房间码发给朋友）';
  dom.quick.disabled = true;
  dom.createRoom.disabled = true;
  dom.joinRoom.disabled = true;
}

function resetLobbyPanels() {
  state.currentRoom = null;
  resetQueue();
  dom.roomPanel.classList.add('hidden');
  dom.quick.disabled = false;
  dom.createRoom.disabled = false;
  dom.joinRoom.disabled = false;
}

function resetQueue() {
  state.queueActive = false;
  dom.queuePanel.classList.add('hidden');
  dom.queueStatus.textContent = '';
  dom.quick.disabled = false;
  dom.createRoom.disabled = false;
  dom.joinRoom.disabled = false;
}

/* --------------------------------- User ---------------------------------- */

function setUser(user) {
  if (!user) return;
  state.user = { ...(state.user || {}), ...user };
  if (user.name) dom.lobbyName.textContent = user.name;
  if (user.stats) renderStats(user.stats);
}

function renderStats(stats) {
  dom.statWins.textContent = stats.wins ?? 0;
  dom.statLosses.textContent = stats.losses ?? 0;
  dom.statKd.textContent = stats.kd ?? 0;
  dom.statKills.textContent = stats.kills ?? 0;
  dom.statMatches.textContent = stats.matches ?? 0;
  dom.statHeadshots.textContent = stats.headshots ?? 0;
}

async function refreshProfile() {
  try {
    const me = await api('/api/me');
    if (!me.authenticated) {
      handleExpiredSession();
      return;
    }
    setUser(me);
  } catch (err) {
    if (err.status === 401) handleExpiredSession();
  }
}

function setNetState(online) {
  dom.netState.textContent = online ? '已连接' : '连接中…';
  dom.netState.classList.toggle('online', online);
  dom.netState.classList.toggle('offline', !online);
}

async function verifySession() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.authenticated) handleExpiredSession();
  } catch {
    // Offline; the WebSocket reconnect loop will keep trying.
  }
}

function handleExpiredSession() {
  net.close();
  game.exit();
  state.currentRoom = null;
  resetLobbyPanels();
  showScreen('login');
  dom.loginError.textContent = '登录已过期，请重新登录';
}

/* ------------------------------ Leaderboard ------------------------------ */

async function refreshLeaderboard() {
  try {
    const data = await api('/api/leaderboard');
    const rows = (data.players || []).map((p, index) => {
      const tr = document.createElement('tr');
      const cells = [index + 1, p.name, p.wins, p.kills, p.kd];
      for (const value of cells) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      if (state.user?.name === p.name) tr.style.background = 'rgba(255,107,44,0.08)';
      return tr;
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = '还没有战绩，来打第一局吧';
      td.className = 'muted';
      tr.append(td);
      rows.push(tr);
    }
    dom.leaderboardBody.replaceChildren(...rows);
  } catch {
    // Leaderboard is non-critical.
  }
}

/* -------------------------------- Helpers -------------------------------- */

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Empty body.
  }
  if (!res.ok) {
    const error = new Error(data.error || `请求失败 (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function showMessage(text) {
  dom.message.textContent = text;
  if (state.messageTimer) clearTimeout(state.messageTimer);
  if (text) {
    state.messageTimer = setTimeout(() => {
      dom.message.textContent = '';
      state.messageTimer = null;
    }, 4500);
  }
}

function toast(text) {
  dom.toast.textContent = text;
  dom.toast.classList.remove('hidden');
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    dom.toast.classList.add('hidden');
    state.toastTimer = null;
  }, 2600);
}

window.addEventListener('beforeunload', () => net.close());
