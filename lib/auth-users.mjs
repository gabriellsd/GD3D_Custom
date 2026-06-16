import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSessionToken,
  jsonResponse,
  sessionCookie,
} from './auth-token.mjs';

export { createSessionToken, jsonResponse, sessionCookie };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Utilizadores: AUTH_USERS (JSON) em produção ou auth.users.json local. */
export function loadUsers() {
  if (process.env.AUTH_USERS) {
    return JSON.parse(process.env.AUTH_USERS);
  }

  const localFile = path.join(ROOT, 'auth.users.json');
  if (fs.existsSync(localFile)) {
    return JSON.parse(fs.readFileSync(localFile, 'utf8'));
  }

  const exampleFile = path.join(ROOT, 'auth.users.example.json');
  if (process.env.NODE_ENV !== 'production' && fs.existsSync(exampleFile)) {
    console.warn('[auth] A usar auth.users.example.json — copie para auth.users.json');
    return JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
  }

  return [];
}

export function findUser(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return loadUsers().find((u) => String(u.email).trim().toLowerCase() === normalized) ?? null;
}

export function authenticate(email, password) {
  const user = findUser(email);
  if (!user || !password) return null;
  if (String(user.password) !== String(password)) return null;
  if (user.role !== 'admin' && user.role !== 'client') return null;
  return {
    email: user.email,
    role: user.role,
    name: user.name || user.email,
  };
}
