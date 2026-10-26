import crypto from 'node:crypto';

const sessions = new Map(); // token -> { name, createdAt, lastSeen }
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function normalizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 16) return null;
  if (!/^[\p{L}\p{N}_\-. ]+$/u.test(name)) return null;
  return name;
}

export function createSession(name) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { name, createdAt: Date.now(), lastSeen: Date.now() });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_TTL) {
    sessions.delete(token);
    return null;
  }
  session.lastSeen = Date.now();
  return { token, ...session };
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return getSession(cookies.sid);
}

export function sessionFromUpgrade(req) {
  const cookies = parseCookies(req.headers.cookie);
  return getSession(cookies.sid);
}

export const SESSION_COOKIE = 'sid';
export const SESSION_MAX_AGE = SESSION_TTL;

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.lastSeen > SESSION_TTL) sessions.delete(token);
  }
}, 60 * 60 * 1000).unref();
