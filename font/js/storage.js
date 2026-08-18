const GLOBAL_KEYS = {
  access: "auth_accessToken",
  refresh: "auth_refreshToken",
  role: "auth_role",
};

const PREFIX_BY_ROLE = {
  USER: "user",
  ADMIN: "admin",
};

function normalizeRole(role) {
  const value = String(role || "").trim().toUpperCase();
  if (value === "ADMIN") return "ADMIN";
  if (["USER", "CUSTOMER", "MEMBER", "CLIENT"].includes(value)) return "USER";
  return value;
}

function prefixForRole(role) {
  return PREFIX_BY_ROLE[normalizeRole(role)] || "";
}

function setOrRemove(key, value) {
  if (value === undefined || value === null || value === "") {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(value));
}

export function makeStorage(prefix) {
  const KEY = {
    access: `${prefix}_accessToken`,
    refresh: `${prefix}_refreshToken`,
    role: `${prefix}_role`,
  };

  return {
    prefix,
    get access() {
      const own = localStorage.getItem(KEY.access) || "";
      if (own) return own;
      const globalRole = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(globalRole)) {
        return localStorage.getItem(GLOBAL_KEYS.access) || "";
      }
      return "";
    },
    set access(v) {
      setOrRemove(KEY.access, v);
      const role = normalizeRole(localStorage.getItem(KEY.role) || localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(role)) {
        setOrRemove(GLOBAL_KEYS.access, v);
        if (role) localStorage.setItem(GLOBAL_KEYS.role, role);
      }
    },

    get refresh() {
      const own = localStorage.getItem(KEY.refresh) || "";
      if (own) return own;
      const globalRole = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(globalRole)) {
        return localStorage.getItem(GLOBAL_KEYS.refresh) || "";
      }
      return "";
    },
    set refresh(v) {
      setOrRemove(KEY.refresh, v);
      const role = normalizeRole(localStorage.getItem(KEY.role) || localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(role)) {
        setOrRemove(GLOBAL_KEYS.refresh, v);
        if (role) localStorage.setItem(GLOBAL_KEYS.role, role);
      }
    },

    get role() {
      const own = normalizeRole(localStorage.getItem(KEY.role));
      if (own) return own;
      const globalRole = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(globalRole)) {
        return globalRole;
      }
      return "";
    },
    set role(v) {
      const role = normalizeRole(v);
      setOrRemove(KEY.role, role);
      if (prefix === prefixForRole(role)) {
        localStorage.setItem(GLOBAL_KEYS.role, role);
        const access = localStorage.getItem(KEY.access) || localStorage.getItem(GLOBAL_KEYS.access) || "";
        const refresh = localStorage.getItem(KEY.refresh) || localStorage.getItem(GLOBAL_KEYS.refresh) || "";
        setOrRemove(GLOBAL_KEYS.access, access);
        setOrRemove(GLOBAL_KEYS.refresh, refresh);
      } else {
        const globalRole = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
        if (prefix === prefixForRole(globalRole)) {
          localStorage.removeItem(GLOBAL_KEYS.role);
          localStorage.removeItem(GLOBAL_KEYS.access);
          localStorage.removeItem(GLOBAL_KEYS.refresh);
        }
      }
    },

    clear() {
      localStorage.removeItem(KEY.access);
      localStorage.removeItem(KEY.refresh);
      localStorage.removeItem(KEY.role);
      const globalRole = normalizeRole(localStorage.getItem(GLOBAL_KEYS.role));
      if (prefix === prefixForRole(globalRole)) {
        localStorage.removeItem(GLOBAL_KEYS.role);
        localStorage.removeItem(GLOBAL_KEYS.access);
        localStorage.removeItem(GLOBAL_KEYS.refresh);
      }
    },
  };
}
