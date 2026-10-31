import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authRequest, configureAuthCallbacks, setAuthAccessToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const acceptSession = useCallback((session) => {
    setAuthAccessToken(session.access_token);
    setUser(session.user);
  }, []);

  const clearSession = useCallback(() => {
    setAuthAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const callbacks = {
      onSession: acceptSession,
      onExpired: clearSession,
    };
    const detachCallbacks = configureAuthCallbacks(callbacks);

    authRequest('/api/auth/refresh')
      .then((session) => { if (mounted) acceptSession(session); })
      .catch(() => { if (mounted) clearSession(); })
      .finally(() => { if (mounted) setReady(true); });

    return () => {
      mounted = false;
      detachCallbacks();
    };
  }, [acceptSession, clearSession]);

  async function requestPatientOtp(phoneNumber) {
    return authRequest('/api/auth/patient/request-otp', { body: { phone_number: phoneNumber } });
  }

  async function verifyPatientOtp(phoneNumber, otp) {
    const session = await authRequest('/api/auth/patient/verify-otp', { body: { phone_number: phoneNumber, otp } });
    acceptSession(session);
    return session.user;
  }

  async function loginDoctor(email, password, rememberMe) {
    const session = await authRequest('/api/auth/doctor/login', {
      body: { email, password, remember_me: rememberMe },
    });
    acceptSession(session);
    return session.user;
  }

  async function logout() {
    try {
      await authRequest('/api/auth/logout');
    } finally {
      clearSession();
    }
  }

  const value = useMemo(() => ({
    user,
    role: user?.role?.toLowerCase() || null,
    ready,
    isAuthenticated: Boolean(user),
    requestPatientOtp,
    verifyPatientOtp,
    loginDoctor,
    logout,
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
