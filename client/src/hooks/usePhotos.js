import { useState, useEffect, useCallback } from 'react';
import { getPhotos } from '../api';

export function usePhotos(sessionId) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await getPhotos(sessionId);
      setPhotos(res.data.data);
    } catch {
      // silent refresh failure
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { photos, loading, refresh };
}
