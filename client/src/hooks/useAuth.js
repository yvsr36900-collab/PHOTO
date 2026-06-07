import { useState, useEffect, useCallback } from 'react';
import { getMe } from '../api';

export function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    try {
      const res = await getMe();
      const u = res.data.data;
      setUser(u);
      localStorage.setItem('user', JSON.stringify(u));
    } catch {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  function authLogin(token, userData) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }

  function authLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return { user, loading, authLogin, authLogout, refreshUser };
}
