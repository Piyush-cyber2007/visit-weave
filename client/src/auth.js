import credentials from '../../server/data/login-credentials.json' with { type: 'json' };

const AUTH_KEY = 'onetoken-demo-auth';
const REMEMBERED_AUTH_KEY = 'onetoken-remembered-auth';

export function authenticate(role, userId, password) {
  const account = credentials[role];
  if (!account || account.id.toLowerCase() !== userId.trim().toLowerCase() || account.password !== password) return null;
  return { role, displayName: account.displayName };
}

export function hasDemoRole(user, role) {
  return user?.role === role;
}

export function getDemoAuth() {
  try {
    const user = JSON.parse(sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(REMEMBERED_AUTH_KEY));
    return ['doctor', 'patient'].includes(user?.role) ? user : null;
  } catch {
    return null;
  }
}

export function setDemoAuth(user, remember = false) {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(REMEMBERED_AUTH_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(remember ? REMEMBERED_AUTH_KEY : AUTH_KEY, JSON.stringify(user));
  } catch {
    // The current page can still continue without browser storage.
  }
}

export function clearDemoAuth() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(REMEMBERED_AUTH_KEY);
  } catch {
    // Sign-out still navigates away if browser storage is unavailable.
  }
}