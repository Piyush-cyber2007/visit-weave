import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, form, session } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session}`;
  const res = await fetch(path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.blob();
}

let socket;
export function getSocket() {
  socket ??= io({ transports: ['websocket', 'polling'] });
  return socket;
}

// Runs `load` now, on every server "changed" broadcast, and every 15 s as a
// polling fallback. Returns whether the live (WebSocket) link is up.
export function useLive(load) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const run = () => loadRef.current();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    setConnected(s.connected);
    s.on('changed', run);
    s.on('connect', onConnect);
    s.on('connect', run);
    s.on('disconnect', onDisconnect);
    run();
    const timer = setInterval(run, 15000);
    return () => {
      s.off('changed', run);
      s.off('connect', onConnect);
      s.off('connect', run);
      s.off('disconnect', onDisconnect);
      clearInterval(timer);
    };
  }, []);

  return connected;
}

export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    api('/api/meta').then(setMeta).catch(() => {});
  }, []);
  return meta;
}

export const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function storage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep the in-memory value only */
  }
}

// Patient session (signed, short-lived) shared by the patient view and phone check-in.
const SESSION_KEY = 'patient-session';
export const patientSession = {
  get() {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, value);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  },
};
