import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../hooks/useSession';
import { usePhotos } from '../hooks/usePhotos';
import { addTime, uploadPhoto, downloadZip, exportToDrive, getRsvps, stopSession, restartSession, getSessionMembers, sendHeartbeat, getAllowlist, addToAllowlist, removeFromAllowlist } from '../api';
import Timer from '../components/Timer';
import PhotoGrid from '../components/PhotoGrid';
import QRDisplay from '../components/QRDisplay';
import InvitePoster from '../components/InvitePoster';
import PhotoSyncPanel from '../components/PhotoSyncPanel';

export default function SessionPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { session, loading, error, refresh } = useSession(id);
  const { photos, loading: photosLoading, refresh: refreshPhotos } = usePhotos(id);
  const [uploading, setUploading] = useState(false);
  const [addingTime, setAddingTime] = useState(false);
  const [sessionAction, setSessionAction] = useState(false); // stop/restart in flight
  const [tab, setTab] = useState('photos');
  const [rsvps, setRsvps] = useState(null);
  const [driveStatus, setDriveStatus] = useState('idle');
  const [members, setMembers] = useState(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [allowlist, setAllowlist] = useState(null);
  const [allowlistInput, setAllowlistInput] = useState('');
  const [allowlistSaving, setAllowlistSaving] = useState(false);
  const fileRef = useRef();
  const navigate = useNavigate();

  const isHost = user && session && session.hostUserId === user.id;
  const guestId = sessionStorage.getItem(`sg_guest_${id}`);
  const currentUserId = user ? user.id : guestId;
  const displayName = user ? user.displayName : sessionStorage.getItem(`sg_name_${id}`);

  useEffect(() => {
    if (!loading && !session && !error) navigate('/');
  }, [loading, session, error]);

  // Heartbeat — lets host see us in the members list
  useEffect(() => {
    if (!user || !id) return;
    const ping = () => sendHeartbeat(id, null).catch(() => {});
    ping();
    const t = setInterval(ping, 15000);
    return () => clearInterval(t);
  }, [user, id]);

  // Auto-refresh members list when the manage tab is open
  useEffect(() => {
    if (tab !== 'manage' || !user || !session || session.hostUserId !== user.id) return;
    loadMembers();
    if (session.guestListEnabled) loadAllowlist();
    const t = setInterval(loadMembers, 15000);
    return () => clearInterval(t);
  }, [tab, session?.id]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      if (!user) {
        fd.append('guestId', guestId || '');
        fd.append('displayName', displayName || 'Guest');
      }
      await uploadPhoto(id, fd);
      await refreshPhotos();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      fileRef.current.value = '';
    }
  }

  async function handleAddTime(mins) {
    setAddingTime(true);
    try {
      await addTime(id, mins);
      await refresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add time');
    } finally {
      setAddingTime(false);
    }
  }

  async function handleStopSession() {
    if (!confirm('Stop the session? Guests will not be able to upload until you restart it.')) return;
    setSessionAction(true);
    try {
      await stopSession(id);
      await refresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to stop session');
    } finally {
      setSessionAction(false);
    }
  }

  async function handleRestartSession() {
    setSessionAction(true);
    try {
      await restartSession(id);
      await refresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to restart session');
    } finally {
      setSessionAction(false);
    }
  }

  async function handleZipDownload() {
    try {
      const res = await downloadZip(id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session.name}_photos.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed');
    }
  }

  async function handleDriveExport() {
    setDriveStatus('exporting');
    try {
      await exportToDrive(id);
      setDriveStatus('done');
    } catch (err) {
      alert(err.response?.data?.error || 'Drive export failed');
      setDriveStatus('idle');
    }
  }

  async function loadRsvps() {
    try {
      const res = await getRsvps(id);
      setRsvps(res.data.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load RSVPs');
    }
  }

  async function loadMembers() {
    if (membersLoading) return;
    setMembersLoading(true);
    try {
      const res = await getSessionMembers(id);
      setMembers(res.data.data);
    } catch {
      // silently ignore — not critical
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadAllowlist() {
    try {
      const res = await getAllowlist(id);
      setAllowlist(res.data.data);
    } catch {
      // silently ignore
    }
  }

  async function handleAddToAllowlist(e) {
    e.preventDefault();
    if (!allowlistInput.trim()) return;
    setAllowlistSaving(true);
    try {
      const res = await addToAllowlist(id, allowlistInput.trim());
      setAllowlist(res.data.data);
      setAllowlistInput('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add guest');
    } finally {
      setAllowlistSaving(false);
    }
  }

  async function handleRemoveFromAllowlist(entryId) {
    try {
      await removeFromAllowlist(id, entryId);
      setAllowlist((prev) => prev.filter((e) => e.id !== entryId));
    } catch {
      alert('Failed to remove guest');
    }
  }

  function handlePhotoDeleted(photoId) {
    refreshPhotos();
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading session…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!session) return null;

  // Use status from server (active | stopped | expired)
  const sessionStatus = session.status === 'stopped' ? 'stopped'
    : new Date(session.expiresAt) > new Date() ? 'active' : 'expired';
  const isActive = sessionStatus === 'active';
  const isStopped = sessionStatus === 'stopped';

  const joinUrl = `${window.location.origin}/join/${session.joinCode}`;
  const mailtoLink = `mailto:?subject=Join ${encodeURIComponent(session.name)} on SnapGather&body=Join my photo sharing session: ${encodeURIComponent(joinUrl)}%0ACode: ${session.joinCode}`;

  const isPremiumHost = isHost && user?.plan === 'premium';
  const isStandardOrAboveHost = isHost && (user?.plan === 'standard' || user?.plan === 'premium');

  const statusBadge = {
    active:  'bg-green-100 text-green-700',
    stopped: 'bg-yellow-100 text-yellow-700',
    expired: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Stopped banner */}
      {isStopped && (
        <div className="mb-5 flex items-center justify-between bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-yellow-800 text-sm font-medium">
            <span>⏸</span>
            Session paused — uploads are disabled until you restart.
            {session.secondsLeft > 0 && (
              <span className="text-yellow-600 font-normal">
                ({Math.floor(session.secondsLeft / 60)}m {session.secondsLeft % 60}s remaining)
              </span>
            )}
          </div>
          {isHost && (
            <button onClick={handleRestartSession} disabled={sessionAction}
              className="btn-primary text-sm py-1.5">
              {sessionAction ? 'Restarting…' : '▶ Restart'}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{session.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge[sessionStatus]}`}>
              {sessionStatus}
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            {session.occasionType} · Code: <strong className="text-brand-600 tracking-wider">{session.joinCode}</strong>
            {session.guestListEnabled ? <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">🔒 Guest List On</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>⏱</span>
              <Timer expiresAt={session.expiresAt} onExpire={refresh} />
            </div>
          )}
          {(isActive || isStopped) && isHost && (
            <div className="flex gap-1">
              {[15, 30, 60].map((m) => (
                <button key={m} onClick={() => handleAddTime(m)} disabled={addingTime}
                  className="text-xs btn-secondary px-2 py-1">
                  +{m}m
                </button>
              ))}
              {isActive && (
                <button onClick={handleStopSession} disabled={sessionAction}
                  className="text-xs btn-danger px-2 py-1">
                  {sessionAction ? '…' : '⏸ Stop'}
                </button>
              )}
              {isStopped && (
                <button onClick={handleRestartSession} disabled={sessionAction}
                  className="text-xs btn-primary px-2 py-1">
                  {sessionAction ? '…' : '▶ Restart'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {['photos', 'share', ...(isHost ? ['manage'] : [])].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Photos Tab */}
      {tab === 'photos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{photos.length} photo{photos.length !== 1 ? 's' : ''} · auto-refreshes every 10s</p>
            <div className="flex gap-2">
              <button onClick={handleZipDownload} className="btn-secondary text-sm">⬇ ZIP</button>
              {isPremiumHost && (
                <button onClick={handleDriveExport} disabled={driveStatus === 'exporting'}
                  className="btn-secondary text-sm">
                  {driveStatus === 'done' ? '✓ Exported' : driveStatus === 'exporting' ? 'Exporting…' : '☁ Drive'}
                </button>
              )}
              {(isActive || isStopped) && (
                <label className={`text-sm ${isStopped ? 'opacity-40 cursor-not-allowed' : 'btn-primary cursor-pointer'}`}>
                  {uploading ? 'Uploading…' : '+ Upload'}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={handleUpload} disabled={uploading || isStopped} />
                </label>
              )}
            </div>
          </div>
          <PhotoGrid
            photos={photos}
            currentUserId={currentUserId}
            isHost={isHost}
            onDeleted={handlePhotoDeleted}
          />

          {/* Sync staging — host only, shown inline below the photo grid */}
          {isHost && (isActive || isStopped) && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">📸 Sync from this Mac</h3>
              <PhotoSyncPanel sessionId={id} onUploaded={refreshPhotos} />
            </div>
          )}
        </div>
      )}

      {/* Share Tab */}
      {tab === 'share' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Join Link & QR Code</h3>
            {isStandardOrAboveHost ? (
              <QRDisplay joinCode={session.joinCode} joinUrl={joinUrl} />
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Join Code:</p>
                <p className="text-3xl font-bold tracking-[0.4em] text-brand-600 mb-3">{session.joinCode}</p>
                <p className="text-sm text-gray-400">QR codes require Standard plan or above.</p>
              </div>
            )}
            <div className="mt-4 space-y-2">
              <input readOnly className="input text-sm bg-gray-50 text-gray-600" value={joinUrl} />
              <a href={mailtoLink} className="btn-secondary text-sm block text-center">✉ Send Invite Email</a>
              {isPremiumHost && session.joinCode && (
                <a href={`/rsvp/${session.joinCode}`} target="_blank" rel="noreferrer"
                  className="btn-secondary text-sm block text-center">📋 RSVP Link</a>
              )}
            </div>
          </div>

          {isPremiumHost && (
            <div className="card">
              <h3 className="font-semibold mb-4">Invite Poster <span className="badge-premium ml-2">Premium</span></h3>
              <InvitePoster session={session} />
            </div>
          )}
        </div>
      )}

      {/* Manage Tab (host only) */}
      {tab === 'manage' && isHost && (
        <div className="space-y-6">

          {/* Who's Here */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">👥 Who's Here</h3>
              <button onClick={loadMembers} disabled={membersLoading} className="btn-secondary text-sm">
                {membersLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {members === null ? (
              <p className="text-gray-400 text-sm">Loading members…</p>
            ) : members.members.length === 0 ? (
              <p className="text-gray-400 text-sm">No one has joined yet — share the invite link.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* Host row */}
                <div className="py-2 flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Online (you)" />
                  <span className="font-medium">{members.hostName}</span>
                  <span className="text-xs text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded ml-auto">Host</span>
                </div>
                {members.members.map((m) => (
                  <div key={m.id} className="py-2 flex items-center gap-2 text-sm">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${m.isOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={m.isOnline ? 'Active in the last 30s' : 'Not recently active'}
                    />
                    <span className={m.isOnline ? 'text-gray-900' : 'text-gray-400'}>{m.displayName}</span>
                    {m.isOnline && (
                      <span className="ml-auto text-xs text-green-600">online</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">Green = active in the last 30 seconds · auto-refreshes every 15s</p>
          </div>

          {isHost && session.guestListEnabled && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">
                    🔒 Guest List
                    <span className="ml-2 text-xs font-normal text-white bg-brand-600 px-1.5 py-0.5 rounded">Restricted</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Only names listed here can join the session</p>
                </div>
                <button onClick={loadAllowlist} className="btn-secondary text-sm">Refresh</button>
              </div>

              <form onSubmit={handleAddToAllowlist} className="flex gap-2 mb-4">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Guest display name"
                  value={allowlistInput}
                  onChange={(e) => setAllowlistInput(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary text-sm" disabled={allowlistSaving}>
                  {allowlistSaving ? '…' : 'Add'}
                </button>
              </form>

              {allowlist === null ? (
                <p className="text-gray-400 text-sm">Loading guest list…</p>
              ) : allowlist.length === 0 ? (
                <p className="text-gray-400 text-sm">No guests added yet — anyone who tries to join will be denied.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {allowlist.map((entry) => (
                    <div key={entry.id} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-gray-800">{entry.name}</span>
                      <button
                        onClick={() => handleRemoveFromAllowlist(entry.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">Names are matched case-insensitively when guests join</p>
            </div>
          )}

          {isPremiumHost && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">RSVP Guest List <span className="badge-premium ml-2">Premium</span></h3>
                <button onClick={loadRsvps} className="btn-secondary text-sm">Refresh</button>
              </div>
              {rsvps === null ? (
                <p className="text-gray-400 text-sm">Click Refresh to load RSVPs.</p>
              ) : rsvps.rsvps.length === 0 ? (
                <p className="text-gray-400 text-sm">No RSVPs yet.</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-sm">
                    <span className="text-green-600">✓ Attending: {rsvps.summary.attending}</span>
                    <span className="text-red-500">✗ Not Attending: {rsvps.summary.notAttending}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {rsvps.rsvps.map((r) => (
                      <div key={r.id} className="py-2 flex justify-between text-sm">
                        <span>{r.guestName}</span>
                        <span className={r.status === 'attending' ? 'text-green-600' : 'text-red-500'}>
                          {r.status === 'attending' ? 'Attending' : 'Not Attending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold mb-2">Session Info</h3>
            <dl className="space-y-1 text-sm text-gray-600">
              <div className="flex gap-2"><dt className="font-medium w-28">Join Code:</dt><dd className="font-mono text-brand-600">{session.joinCode}</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-28">Created:</dt><dd>{new Date(session.createdAt).toLocaleString()}</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-28">Expires:</dt><dd>{new Date(session.expiresAt).toLocaleString()}</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-28">Photos:</dt><dd>{photos.length}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
