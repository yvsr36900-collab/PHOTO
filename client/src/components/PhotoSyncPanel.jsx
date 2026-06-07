import { useState, useEffect, useRef } from 'react';
import { getSyncStatus, startSync, stopSync, getSyncPending, confirmSyncUpload } from '../api';

export default function PhotoSyncPanel({ sessionId, onUploaded }) {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]); // [{filename, originalName, detectedAt, checked}]
  const [uploading, setUploading] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [acting, setActing] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    loadAll();
    pollRef.current = setInterval(loadAll, 5000);
    return () => clearInterval(pollRef.current);
  }, [sessionId]);

  async function loadStatus() {
    try {
      const res = await getSyncStatus(sessionId);
      const s = res.data.data;
      setStatus(s);
      if (!selectedPath && s.candidates?.length) setSelectedPath(s.candidates[0]);
    } catch {}
  }

  async function loadPending() {
    try {
      const res = await getSyncPending(sessionId);
      const incoming = res.data.data;
      setPending((prev) =>
        incoming.map((f) => ({
          ...f,
          checked: prev.find((p) => p.filename === f.filename)?.checked ?? true,
        }))
      );
    } catch {}
  }

  async function loadAll() {
    await Promise.all([loadStatus(), loadPending()]);
  }

  async function handleStart() {
    setActing(true);
    try {
      const p = selectedPath === '__custom' ? customPath.trim() : selectedPath;
      await startSync(sessionId, p || null);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start sync');
    } finally {
      setActing(false);
    }
  }

  async function handleStop() {
    setActing(true);
    try {
      await stopSync(sessionId);
      await loadStatus();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to stop sync');
    } finally {
      setActing(false);
    }
  }

  function toggle(filename) {
    setPending((prev) =>
      prev.map((f) => (f.filename === filename ? { ...f, checked: !f.checked } : f))
    );
  }

  function toggleAll(val) {
    setPending((prev) => prev.map((f) => ({ ...f, checked: val })));
  }

  async function handleUploadSelected() {
    const selected = pending.filter((f) => f.checked).map((f) => f.filename);
    if (selected.length === 0) return;
    setUploading(true);
    try {
      await confirmSyncUpload(sessionId, selected);
      await loadPending();
      onUploaded?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDiscard() {
    if (!confirm('Discard all staged photos without uploading?')) return;
    setUploading(true);
    try {
      await confirmSyncUpload(sessionId, []); // empty = discard all
      await loadPending();
    } catch (err) {
      alert(err.response?.data?.error || 'Discard failed');
    } finally {
      setUploading(false);
    }
  }

  if (!status) return <p className="text-sm text-gray-400">Loading…</p>;

  const checkedCount = pending.filter((f) => f.checked).length;
  const thumbBase = `/api/sync/${sessionId}/pending/`;

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            status.active ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}
        />
        <span className="text-sm font-medium">
          {status.active ? `Watching "${status.watchPath}"` : 'Not watching'}
        </span>
        {status.pendingCount > 0 && (
          <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {status.pendingCount} staged
          </span>
        )}
      </div>

      {/* Errors */}
      {status.errors?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 space-y-0.5">
          {status.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">{e.error || e.file}</p>
          ))}
        </div>
      )}

      {/* Folder picker when not active */}
      {!status.active && (
        <div className="space-y-2">
          {status.candidates?.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="watchPath" value={p} checked={selectedPath === p}
                onChange={() => setSelectedPath(p)} />
              <span className="truncate text-gray-700">{p}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="watchPath" value="__custom" checked={selectedPath === '__custom'}
              onChange={() => setSelectedPath('__custom')} />
            <span className="text-gray-500">Custom path…</span>
          </label>
          {selectedPath === '__custom' && (
            <input className="input text-sm" placeholder="/path/to/folder"
              value={customPath} onChange={(e) => setCustomPath(e.target.value)} />
          )}
          <button onClick={handleStart} disabled={acting} className="btn-primary text-sm w-full">
            {acting ? 'Starting…' : '▶ Start Watching'}
          </button>
        </div>
      )}

      {/* Stop button when active */}
      {status.active && (
        <button onClick={handleStop} disabled={acting} className="btn-danger text-sm w-full">
          {acting ? 'Stopping…' : '⏹ Stop Watching'}
        </button>
      )}

      {/* Staged photos grid */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Staged — select which to upload
            </p>
            <div className="flex gap-2 text-xs">
              <button onClick={() => toggleAll(true)} className="text-brand-600 hover:underline">All</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">None</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {pending.map((f) => (
              <label key={f.filename} className="relative cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.checked}
                  onChange={() => toggle(f.filename)}
                  className="absolute top-1.5 left-1.5 z-10 w-4 h-4 accent-brand-600"
                />
                <img
                  src={`${thumbBase}${f.filename}`}
                  alt={f.originalName}
                  className={`w-full aspect-square object-cover rounded-lg border-2 transition-all ${
                    f.checked
                      ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'border-gray-200 opacity-40'
                  }`}
                />
                <p className="text-xs text-gray-500 truncate mt-0.5 px-0.5">{f.originalName}</p>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUploadSelected}
              disabled={uploading || checkedCount === 0}
              className="btn-primary text-sm flex-1"
            >
              {uploading
                ? 'Uploading…'
                : `Upload ${checkedCount} photo${checkedCount !== 1 ? 's' : ''}`}
            </button>
            <button onClick={handleDiscard} disabled={uploading} className="btn-secondary text-sm">
              Discard All
            </button>
          </div>
        </div>
      )}

      {/* Watching but nothing staged yet */}
      {status.active && pending.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-3">
          Watching for new photos… they'll appear here for review before uploading.
        </p>
      )}

      {/* Tip when idle */}
      {!status.active && pending.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
          <p className="font-medium">How it works</p>
          <p>New images saved to the watched folder are staged here. You pick which ones to upload — nothing goes to the session automatically.</p>
          <p>Tip: Export from Photos app to Downloads, then review and upload here.</p>
        </div>
      )}
    </div>
  );
}
