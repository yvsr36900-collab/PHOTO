import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMySessions, createSession } from '../api';
import { useEffect } from 'react';
import PlanBadge from '../components/PlanBadge';

const OCCASION_TYPES = ['Birthday', 'Wedding', 'Conference', 'Graduation', 'Holiday Party', 'Corporate', 'Other'];

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', occasionType: 'Birthday', durationMinutes: 60 });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await getMySessions();
      setSessions(res.data.data);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await createSession({ ...form, durationMinutes: Number(form.durationMinutes) });
      navigate(`/session/${res.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  }

  const activeSessions = sessions.filter((s) => new Date(s.expiresAt) > new Date());
  const expiredSessions = sessions.filter((s) => new Date(s.expiresAt) <= new Date());

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <PlanBadge plan={user?.plan} />
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            + New Session
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-8">
          <h2 className="font-semibold text-lg mb-4">Create New Session</h2>
          {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-3 rounded-lg">{error}</p>}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Session Name</label>
              <input className="input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Sarah's Birthday Party" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Occasion Type</label>
              <select className="input" value={form.occasionType}
                onChange={(e) => setForm({ ...form, occasionType: e.target.value })}>
                {OCCASION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
              <input className="input" type="number" min={5} max={1440} value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} required />
            </div>
            <div className="flex items-end gap-3">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create Session'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📸</p>
          <p className="text-gray-500">No sessions yet. Create your first one!</p>
        </div>
      ) : (
        <>
          {activeSessions.length > 0 && (
            <section className="mb-8">
              <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Active</h2>
              <div className="space-y-3">
                {activeSessions.map((s) => <SessionCard key={s.id} session={s} />)}
              </div>
            </section>
          )}
          {expiredSessions.length > 0 && (
            <section>
              <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Expired</h2>
              <div className="space-y-3">
                {expiredSessions.map((s) => <SessionCard key={s.id} session={s} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ session }) {
  const isActive = new Date(session.expiresAt) > new Date();
  return (
    <Link to={`/session/${session.id}`}
      className="card flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer block">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{session.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isActive ? 'Active' : 'Expired'}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{session.occasionType} · Code: <strong>{session.joinCode}</strong></p>
      </div>
      <span className="text-brand-600 text-sm font-medium">Open →</span>
    </Link>
  );
}
