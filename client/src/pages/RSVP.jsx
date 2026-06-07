import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSessionByCode, submitRsvp } from '../api';

export default function RSVPPage() {
  const { code } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getSessionByCode(code)
      .then((res) => setSession(res.data.data))
      .catch(() => setError('Session not found'))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleSubmit(selectedStatus) {
    if (!guestName.trim()) return;
    setSubmitting(true);
    setStatus(selectedStatus);
    try {
      await submitRsvp(code.toUpperCase(), { guestName: guestName.trim(), status: selectedStatus });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit RSVP');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;

  if (done) return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-sm text-center">
        <p className="text-4xl mb-3">{status === 'attending' ? '🎉' : '😢'}</p>
        <h2 className="text-xl font-bold mb-2">RSVP Recorded!</h2>
        <p className="text-gray-500">
          {status === 'attending'
            ? `See you at ${session?.name}!`
            : `Thanks for letting us know, ${guestName}.`}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <p className="text-3xl text-center mb-3">📋</p>
        <h1 className="text-xl font-bold text-center mb-1">RSVP</h1>
        <p className="text-gray-500 text-sm text-center mb-6">{session?.name} · {session?.occasionType}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input className="input" placeholder="Enter your name" value={guestName}
              onChange={(e) => setGuestName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSubmit('attending')}
              disabled={!guestName.trim() || submitting}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <span>✓</span> Attending
            </button>
            <button
              onClick={() => handleSubmit('not_attending')}
              disabled={!guestName.trim() || submitting}
              className="btn-danger flex items-center justify-center gap-2"
            >
              <span>✗</span> Can't Make It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
