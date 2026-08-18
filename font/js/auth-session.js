import { makeStorage } from './storage.js';

const GLOBAL_KEYS = {
  access: 'auth_accessToken',
  refresh: 'auth_refreshToken',
  role: 'auth_role',
};

const ROLE_PREFIX = {
  USER: 'user',
  ADMIN: 'admin',
};

const ROLE_STORAGES = {
  USER: makeStorage('user'),
  ADMIN: makeStorage('admin'),
};

export function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (['ADMIN'].includes(value)) return 'ADMIN';
  if (['USER', 'CUSTOMER', 'MEMBER', 'CLIENT'].includes(value)) return 'USER';
  return value;
}

function getRolePrefix(role) {
  return ROLE_PREFIX[normalizeRole(role)] || 'user';
}

function readGlobalSession() {
  const role = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
  const accessToken = localStorage.getItem(GLOBAL_KEYS.access) || '';
  const refreshToken = localStorage.getItem(GLOBAL_KEYS.refresh) || '';
  if (!role || !accessToken) return null;
  return { role, accessToken, refreshToken };
}

function writeGlobalSession(session) {
  const role = normalizeRole(session?.role);
  if (!role || !session?.accessToken) return null;
  localStorage.setItem(GLOBAL_KEYS.role, role);
  localStorage.setItem(GLOBAL_KEYS.access, session.accessToken);
  localStorage.setItem(GLOBAL_KEYS.refresh, session.refreshToken || '');
  return { role, accessToken: session.accessToken, refreshToken: session.refreshToken || '' };
}

function clearGlobalSession() {
  localStorage.removeItem(GLOBAL_KEYS.role);
  localStorage.removeItem(GLOBAL_KEYS.access);
  localStorage.removeItem(GLOBAL_KEYS.refresh);
}

export function clearAllAuthSessions() {
  Object.values(ROLE_STORAGES).forEach((s) => s.clear());
  clearGlobalSession();
}

export function saveAuthSession(auth) {
  const role = normalizeRole(auth?.role);
  const accessToken = auth?.accessToken || auth?.access || '';
  const refreshToken = auth?.refreshToken || auth?.refresh || '';
  if (!role || !accessToken) throw new Error('AUTH_SESSION_INVALID');

  clearAllAuthSessions();
  const storage = ROLE_STORAGES[role] || ROLE_STORAGES.USER;
  storage.access = accessToken;
  storage.refresh = refreshToken;
  storage.role = role;
  writeGlobalSession({ role, accessToken, refreshToken });
  return { role, accessToken, refreshToken, storage };
}

export function getActiveSession() {
  const globalSession = readGlobalSession();
  if (globalSession) {
    const correctStorage = ROLE_STORAGES[globalSession.role];
    if (correctStorage) {
      if (!correctStorage.access) correctStorage.access = globalSession.accessToken;
      if (!correctStorage.refresh && globalSession.refreshToken) correctStorage.refresh = globalSession.refreshToken;
      if (normalizeRole(correctStorage.role) !== globalSession.role) correctStorage.role = globalSession.role;
    }
    return globalSession;
  }

  const candidates = Object.values(ROLE_STORAGES)
    .map((storage) => ({
      role: normalizeRole(storage.role),
      accessToken: storage.access,
      refreshToken: storage.refresh,
    }))
    .filter((x) => x.accessToken);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.role === "ADMIN" && b.role !== "ADMIN") return -1;
    if (a.role !== "ADMIN" && b.role === "ADMIN") return 1;
    return 0;
  });

  const picked = candidates[0];
  return saveAuthSession({
    role: picked.role || "USER",
    accessToken: picked.accessToken,
    refreshToken: picked.refreshToken,
  });
}

export function syncStorageWithActive(storage, prefix) {
  const active = getActiveSession();
  if (!active) return null;
  if (prefix === getRolePrefix(active.role)) {
    if (!storage.access) storage.access = active.accessToken;
    if (!storage.refresh && active.refreshToken) storage.refresh = active.refreshToken;
    if (normalizeRole(storage.role) !== active.role) storage.role = active.role;
  }
  return active;
}

export function redirectByRole(role, pageMap = {}) {
  const normalized = normalizeRole(role);
  const defaults = {
    USER: './index.html',
    ADMIN: './admin.html',
  };
  const target = pageMap[normalized] ?? defaults[normalized];
  if (!target) return false;
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const wanted = String(target).replace(/^\.\//, '');
  if (current === wanted) return false;
  window.location.href = target;
  return true;
}
