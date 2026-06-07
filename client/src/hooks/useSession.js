import { useState, useEffect, useCallback } from 'react';
import { getSessionById } from '../api';

export function useSession(sessionId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await getSessionById(sessionId);
      setSession(res.data.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { session, loading, error, refresh };
}
