import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  createAdminSession,
  createAdminUser,
  deleteAdminSession,
  deleteExpiredAdminSessions,
  findAdminUser,
  findAdminSession,
  hasAdminUser,
  touchAdminSession,
  updateAdminLastLogin,
  updateAdminPasswordAndRevokeSessions
} from '../db.js';

const SESSION_COOKIE = 'scc10_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const [, salt, expectedHex] = String(storedHash || '').split('$');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(cookieHeader, name) {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || null;
}

export function ensureBootstrapAdmin() {
  const username = process.env.SCC10_ADMIN_USERNAME?.trim();
  const password = process.env.SCC10_ADMIN_PASSWORD;
  if (!username || !password || hasAdminUser()) return false;
  createAdminUser({ username, passwordHash: hashPassword(password), role: 'admin' });
  return true;
}

export function bootstrapAdminUser(username, password) {
  const name = String(username || '').trim();
  if (!name) throw new Error('Informe o nome do usuário administrativo.');
  if (String(password).length < 16) throw new Error('A senha deve ter pelo menos 16 caracteres.');
  if (hasAdminUser()) throw new Error('Já existe um usuário administrativo; use a rotação de senha.');
  createAdminUser({ username: name, passwordHash: hashPassword(password), role: 'admin' });
  return true;
}

export function isAdminAuthConfigured() {
  return Boolean(process.env.SCC10_ADMIN_TOKEN || hasAdminUser() || (process.env.SCC10_ADMIN_USERNAME && process.env.SCC10_ADMIN_PASSWORD));
}

export function isPasswordLoginConfigured() {
  return Boolean(hasAdminUser() || (process.env.SCC10_ADMIN_USERNAME && process.env.SCC10_ADMIN_PASSWORD));
}

export function rotateAdminPassword(username, newPassword) {
  const user = findAdminUser(String(username || '').trim());
  if (!user || !user.active) throw new Error('Usuário administrativo não encontrado ou inativo.');
  if (String(newPassword).length < 16) throw new Error('A nova senha deve ter pelo menos 16 caracteres.');
  updateAdminPasswordAndRevokeSessions(user.id, hashPassword(newPassword));
}

export function login(username, password) {
  ensureBootstrapAdmin();
  const normalizedUsername = String(username || '').trim();
  const user = findAdminUser(normalizedUsername);
  if (!user || !user.active) return null;
  const attempt = loginAttempts.get(normalizedUsername);
  const nowMs = Date.now();
  if (attempt && nowMs - attempt.startedAt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) return null;
  if (attempt && nowMs - attempt.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(normalizedUsername);

  if (!verifyPassword(password, user.password_hash)) {
    const current = loginAttempts.get(normalizedUsername);
    loginAttempts.set(normalizedUsername, {
      startedAt: current && nowMs - current.startedAt < LOGIN_WINDOW_MS ? current.startedAt : nowMs,
      count: (current && nowMs - current.startedAt < LOGIN_WINDOW_MS ? current.count : 0) + 1
    });
    return null;
  }
  loginAttempts.delete(normalizedUsername);
  deleteExpiredAdminSessions();

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const created = createAdminSession({
    sessionHash: hashSessionToken(token),
    userId: user.id,
    passwordHash: user.password_hash,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  if (!created) return null;
  updateAdminLastLogin(user.id, now.toISOString());
  return { token, expiresAt: expiresAt.toISOString(), user: { username: user.username, role: user.role } };
}

export function getSessionUser(req) {
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const session = findAdminSession(hashSessionToken(token), new Date().toISOString());
  if (!session) return null;
  touchAdminSession(session.session_hash, new Date().toISOString());
  return { username: session.username, role: session.role };
}

export function logout(req) {
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (token) deleteAdminSession(hashSessionToken(token));
}

export function sessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
