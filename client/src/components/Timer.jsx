import { useState, useEffect } from 'react';

export default function Timer({ expiresAt, onExpire }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000)));

  useEffect(() => {
    if (seconds <= 0) { onExpire?.(); return; }
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { clearInterval(t); onExpire?.(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');

  const isLow = seconds < 300;
  return (
    <span className={`font-mono text-lg font-semibold ${isLow ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  );
}
