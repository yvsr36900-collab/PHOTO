import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSessionByCode, joinSession, uploadPhoto, sendHeartbeat } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePhotos } from '../hooks/usePhotos';
import Timer from '../components/Timer';
import PhotoGrid from '../components/PhotoGrid';
import ClientSyncPanel from '../components/ClientSyncPanel';

export default function JoinPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('loading'); // loading | nameEntry | session | error
  const [session, setSession] = useState(null);
  const [guestId, setGuestId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState('photos');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  const sessionId = session?.id;
  const { photos, refresh: refreshPhotos } = usePhotos(sessionId || null);

  useEffect(() => {
    if (code) checkSession();
  }, [code]);

  // Heartbeat — keeps lastSeenAt fresh so host can see who's here
  useEffect(() => {
    if (step !== 'session' || !sessionId) return;
    const userId = user ? String(user.id) : guestId;
    if (!userId) return;

    const ping = () => sendHeartbeat(sessionId, user ? null : userId).catch(() => {});
    ping();
    const t = setInterval(ping, 15000);
    return () => clearInterval(t);
  }, [step, sessionId, user, guestId]);

  async function checkSession() {
    try {
      const res = await getSessionByCode(code);
      const s = res.data.data;
      if (s.status === 'expired') { setError('This session has expired.'); setStep('error'); return; }
      setSession(s);

      if (user) {
        await doJoin(s, user.displayName);
      } else {
        const savedId = sessionStorage.getItem(`sg_guest_${s.id}`);
        const savedName = sessionStorage.getItem(`sg_name_${s.id}`);
        if (savedId && savedName) {
          setGuestId(savedId);
          setDisplayName(savedName);
          setStep('session');
        } else {
          setStep('nameEntry');
        }
      }
    } catch {
      setError('Session not found. Check your code.');
      setStep('error');
    }
  }

  async function doJoin(s, name) {
    setJoining(true);
    try {
      const res = await joinSession({ joinCode: s.joinCode, displayName: name });
      const { session: updatedSession, userId, displayName: resolvedName } = res.data.data;
      setSession(updatedSession || s);
      setGuestId(userId);
      setDisplayName(resolvedName);
      if (!user) {
        sessionStorage.setItem(`sg_guest_${s.id}`, userId);
        sessionStorage.setItem(`sg_name_${s.id}`, resolvedName);
      }
      setStep('session');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join');
      setStep('error');
    } finally {
      setJoining(false);
    }
  }

  async function handleNameSubmit(e) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    await doJoin(session, nameInput.trim());
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      if (!user) {
        fd.append('guestId', guestId || '');
        fd.append('displayName', displayName || 'Guest');
      }
      await uploadPhoto(session.id, fd);
      await refreshPhotos();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      fileRef.current.value = '';
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/join/${session.joinCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (step === 'loading') return <div className="text-center py-20 text-gray-400">Loading…</div>;

  if (step === 'error') return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <p className="text-red-500 text-lg mb-4">{error}</p>
      <button onClick={() => navigate('/')} className="btn-secondary">Go Home</button>
    </div>
  );

  if (step === 'nameEntry') return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-sm text-center">
        <p className="text-3xl mb-3">👋</p>
        <h1 className="text-xl font-bold mb-1">Join {session?.name}</h1>
        <p className="text-gray-500 text-sm mb-6">{session?.occasionType} · Code: {session?.joinCode}</p>
        <form onSubmit={handleNameSubmit} className="space-y-3">
          <input className="input text-center" placeholder="Your display name"
            value={nameInput} onChange={(e) => setNameInput(e.target.value)} required autoFocus />
          <button type="submit" className="btn-primary w-full" disabled={joining}>
            {joining ? 'Joining…' : 'Join Session'}
          </button>
        </form>
      </div>
    </div>
  );

  const sessionStatus = session?.status === 'stopped' ? 'stopped'
    : session && new Date(session.expiresAt) > new Date() ? 'active' : 'expired';
  const isActive = sessionStatus === 'active';
  const isStopped = sessionStatus === 'stopped';
  const currentUserId = user ? user.id : guestId;
  const joinUrl = session ? `${window.location.origin}/join/${session.joinCode}` : '';
  const mailtoLink = session
    ? `mailto:?subject=Join ${encodeURIComponent(session.name)} on SnapGather&body=Join my photo sharing session: ${encodeURIComponent(joinUrl)}%0ACode: ${session.joinCode}`
    : '#';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Stopped banner */}
      {isStopped && (
        <div className="mb-5 flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-yellow-800 text-sm font-medium">
          <span>⏸</span>
          Session paused by host — uploads disabled until restarted.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{session?.name}</h1>
          <p className="text-gray-500 text-sm">
            {session?.occasionType} · Joined as <strong>{displayName}</strong>
          </p>
        </div>
        {isActive && session && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>⏱</span>
            <Timer expiresAt={session.expiresAt} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {['photos', 'share'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-b-2 border-brand-600 text-brand-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'share' ? '🔗 Invite' : '📷 Photos'}
          </button>
        ))}
      </div>

      {/* Photos tab */}
      {tab === 'photos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {photos.length} photo{photos.length !== 1 ? 's' : ''} · auto-refreshes every 10s
            </p>
            {(isActive || isStopped) && (
              <label
                className={`text-sm ${
                  isStopped
                    ? 'opacity-40 cursor-not-allowed btn-primary'
                    : 'btn-primary cursor-pointer'
                }`}
              >
                {uploading ? 'Uploading…' : '+ Upload Photo'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading || isStopped}
                />
              </label>
            )}
          </div>

          <PhotoGrid
            photos={photos}
            currentUserId={currentUserId}
            isHost={false}
            onDeleted={refreshPhotos}
          />

          {/* Folder sync — inline below the photo grid */}
          {isActive && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">📁 Sync from this device</h3>
              <ClientSyncPanel
                sessionId={sessionId}
                userId={currentUserId}
                displayName={displayName}
                isAuthenticated={!!user}
                existingPhotos={photos}
              />
            </div>
          )}
        </div>
      )}

      {/* Invite tab */}
      {tab === 'share' && (
        <div className="max-w-md space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-4">Invite Others to This Session</h3>

            <p className="text-sm text-gray-500 mb-1">Join Code</p>
            <p className="text-4xl font-bold tracking-[0.4em] text-brand-600 mb-5">
              {session?.joinCode}
            </p>

            <p className="text-sm text-gray-500 mb-1">Join Link</p>
            <div className="flex gap-2 mb-4">
              <input
                readOnly
                className="input text-sm bg-gray-50 text-gray-600 flex-1"
                value={joinUrl}
              />
              <button onClick={copyLink} className="btn-primary text-sm px-3 flex-shrink-0">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <a href={mailtoLink} className="btn-secondary text-sm block text-center">
              ✉ Send Invite Email
            </a>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Anyone with the link or code can join and contribute photos — no account needed.
          </div>
        </div>
      )}
    </div>
  );
}
