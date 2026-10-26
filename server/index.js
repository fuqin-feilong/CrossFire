import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { TICK_MS } from '../shared/constants.js';
import { Store } from './store.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSession,
  destroySession,
  normalizeNickname,
  parseCookies,
  sessionFromRequest,
  sessionFromUpgrade,
} from './auth.js';
import { RoomManager } from './rooms.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const store = new Store();
const rooms = new RoomManager(store);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

/* ------------------------------- REST API ------------------------------- */

app.post('/api/login', (req, res) => {
  const name = normalizeNickname(req.body?.nickname);
  if (!name) {
    return res.status(400).json({
      error: '昵称需为 2-16 个字符，可包含中英文、数字、空格、下划线、短横线和点',
    });
  }
  store.ensure(name);
  store.save();
  const token = createSession(name);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  res.json({ name, stats: store.profile(name) });
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  destroySession(cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const session = sessionFromRequest(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, name: session.name, stats: store.profile(session.name) });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ players: store.leaderboard(10) });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), rooms: rooms.rooms.size });
});

/* ------------------------------- Static --------------------------------- */

app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: '1h' }));
app.use(
  '/vendor/three/build',
  express.static(path.join(ROOT, 'node_modules/three/build'), { maxAge: '7d' }),
);
app.use(express.static(PUBLIC_DIR, { maxAge: 0 }));

/* ------------------------------ WebSocket ------------------------------- */

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const session = sessionFromUpgrade(req);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, session);
  });
});

wss.on('connection', (ws, req, session) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const client = rooms.connect(ws, session);

  ws.on('message', (data) => {
    if (data.length > 8192) return;
    rooms.handleMessage(client, data.toString());
  });

  ws.on('close', () => rooms.disconnectBySocket(ws));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // Ignore sockets that are already closing.
    }
  }
}, 30000).unref();

/* ------------------------------- Game loop ------------------------------ */

setInterval(() => {
  rooms.tick(Date.now(), TICK_MS / 1000);
}, TICK_MS);

/* -------------------------------- Startup ------------------------------- */

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  FIRE ARENA  /  3D web FPS');
  console.log(`  Local: http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  LAN:   http://${ip}:${PORT}`);
  }
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('');
});

function shutdown() {
  console.log('\n[server] shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
