import { API_BASE } from './config.js';
import { saveAuthSession, clearAllAuthSessions, syncStorageWithActive } from './auth-session.js';

let refreshPromise = null;

async function rawFetch(path, { method = 'GET', body = null, auth = true, storage, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const hasBody = body !== null && body !== undefined;

  if (!isFormData && !headers['Content-Type'] && hasBody) headers['Content-Type'] = 'application/json';
  if (auth && storage?.access) headers['Authorization'] = `Bearer ${storage.access}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: hasBody ? (isFormData ? body : JSON.stringify(body)) : null,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') throw new Error('Yêu cầu quá lâu, vui lòng thử lại.');
    throw new Error('Không kết nối được server.');
  }

  clearTimeout(timeoutId);

  if (res.status === 204 || res.status === 205) return { res, data: null };
  const text = await res.text();
  if (!text) return { res, data: null };

  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { res, data };
}

async function doRefreshToken(storage) {
  if (!storage?.refresh) return false;
  const { res, data } = await rawFetch('/api/auth/refresh', {
    method: 'POST',
    auth: false,
    storage,
    body: { refreshToken: storage.refresh },
  });
  if (!res.ok || !data?.accessToken || !data?.refreshToken) return false;

  const role = storage.role || localStorage.getItem('auth_role') || '';
  if (role) {
    saveAuthSession({ role, accessToken: data.accessToken, refreshToken: data.refreshToken });
    syncStorageWithActive(storage, storage.prefix || 'customer');
  } else {
    storage.access = data.accessToken;
    storage.refresh = data.refreshToken;
  }
  return true;
}

async function refreshToken(storage) {
  if (!storage?.refresh) return false;
  if (!refreshPromise) {
    refreshPromise = doRefreshToken(storage).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function makeError(status, data) {
  const code = data?.error?.code || 'HTTP_ERROR';
  const msg = data?.error?.message || code;
  const err = new Error(`${msg} (HTTP ${status})`);
  err.status = status;
  err.code = code;
  err.data = data;
  return err;
}

export function createApi(storage) {
  return async function api(path, opts = {}) {
    const first = await rawFetch(path, { ...opts, storage });
    if (first.res.status === 401 && opts.auth !== false) {
      const ok = await refreshToken(storage);
      if (ok) {
        const retry = await rawFetch(path, { ...opts, storage });
        if (!retry.res.ok) throw makeError(retry.res.status, retry.data);
        return retry.data;
      }
      clearAllAuthSessions();
      throw makeError(first.res.status, first.data);
    }
    if (!first.res.ok) throw makeError(first.res.status, first.data);
    return first.data;
  };
}
