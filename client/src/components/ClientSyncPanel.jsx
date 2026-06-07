import { useState, useEffect, useRef } from 'react';
import { uploadPhoto } from '../api';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export default function ClientSyncPanel({ sessionId, userId, displayName, isAuthenticated, existingPhotos }) {
  const [dirHandle, setDirHandle] = useState(null);
  const [active, setActive] = useState(false);
  // [{name, file, objectUrl, checked, uploading, done}]
  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const seen = useRef(new Set());
  const intervalRef = useRef(null);
  // Refs so interval callback always reads latest values without stale closure
  const existingPhotosRef = useRef(existingPhotos);
  useEffect(() => { existingPhotosRef.current = existingPhotos; }, [existingPhotos]);

  useEffect(() => {
    return () => {
      staged.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      clearInterval(intervalRef.current);
    };
  }, []);

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      // Pre-populate seen so files already in the folder aren't staged
      seen.current = new Set();
      for await (const [name] of handle) seen.current.add(name);
      setDirHandle(handle);
      setError('');
      setActive(true);
      beginPolling(handle);
    } catch (err) {
      if (err.name !== 'AbortError') setError('Could not open folder: ' + err.message);
    }
  }

  function beginPolling(handle) {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => scan(handle), 5000);
  }

  async function scan(handle) {
    const existingNames = new Set(
      (existingPhotosRef.current || []).map((p) => p.originalName)
    );
    const newEntries = [];

    try {
      for await (const [name, entry] of handle) {
        if (entry.kind !== 'file') continue;
        const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
        if (!IMAGE_EXTS.includes(ext)) continue;
        if (seen.current.has(name)) continue;
        seen.current.add(name); // mark immediately so next scan skips it

        if (existingNames.has(name)) continue; // duplicate — already in session

        try {
          const file = await entry.getFile();
          const objectUrl = URL.createObjectURL(file);
          newEntries.push({ name, file, objectUrl, checked: true, uploading: false, done: false });
        } catch {}
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Folder permission expired — please re-select the folder.');
        stopSync();
        return;
      }
    }

    if (newEntries.length > 0) {
      setStaged((prev) => [...prev, ...newEntries]);
    }
  }

  function stopSync() {
    setActive(false);
    clearInterval(intervalRef.current);
  }

  function resumeSync() {
    if (!dirHandle) return;
    setActive(true);
    beginPolling(dirHandle);
    scan(dirHandle);
  }

  function toggle(name) {
    setStaged((prev) => prev.map((f) => (f.name === name ? { ...f, checked: !f.checked } : f)));
  }

  function toggleAll(val) {
    setStaged((prev) => prev.map((f) => (f.done ? f : { ...f, checked: val })));
  }

  async function handleUploadSelected() {
    const toUpload = staged.filter((f) => f.checked && !f.done);
    if (toUpload.length === 0) return;
    setUploading(true);

    for (const entry of toUpload) {
      setStaged((prev) =>
        prev.map((f) => (f.name === entry.name ? { ...f, uploading: true } : f))
      );
      try {
        const fd = new FormData();
        fd.append('photo', entry.file, entry.name);
        if (!isAuthenticated) {
          fd.append('guestId', userId || '');
          fd.append('displayName', displayName || 'Sync');
        }
        await uploadPhoto(sessionId, fd);
        URL.revokeObjectURL(entry.objectUrl);
        setStaged((prev) =>
          prev.map((f) => (f.name === entry.name ? { ...f, uploading: false, done: true } : f))
        );
      } catch (err) {
        setStaged((prev) =>
          prev.map((f) => (f.name === entry.name ? { ...f, uploading: false } : f))
        );
        console.warn('[ClientSync] upload failed:', entry.name, err.message);
      }
    }

    setTimeout(() => setStaged((prev) => prev.filter((f) => !f.done)), 800);
    setUploading(false);
  }

  function handleClear() {
    staged.forEach((f) => URL.revokeObjectURL(f.objectUrl));
    setStaged([]);
  }

  const supported = 'showDirectoryPicker' in window;
  if (!supported) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
        Folder sync requires Chrome or Edge. Use the Upload button to add photos manually.
      </div>
    );
  }

  const checkedCount = staged.filter((f) => f.checked && !f.done).length;
  const pendingCount = staged.filter((f) => !f.done).length;

  return (
    <div className="space-y-3">
      {/* Folder control row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            active ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}
        />
        <span className="text-sm text-gray-600">
          {active
            ? `Watching "${dirHandle?.name}"`
            : dirHandle
            ? `Paused — "${dirHandle?.name}"`
            : 'No folder selected'}
        </span>
        <div className="ml-auto flex gap-2">
          {!dirHandle ? (
            <button onClick={pickFolder} className="btn-primary text-xs px-3 py-1.5">
              📁 Choose Folder
            </button>
          ) : active ? (
            <>
              <button onClick={pickFolder} className="btn-secondary text-xs px-3 py-1.5">Change</button>
              <button onClick={stopSync} className="btn-danger text-xs px-3 py-1.5">⏹ Stop</button>
            </>
          ) : (
            <>
              <button onClick={pickFolder} className="btn-secondary text-xs px-3 py-1.5">Change</button>
              <button onClick={resumeSync} className="btn-primary text-xs px-3 py-1.5">▶ Resume</button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}

      {/* Staged photos grid */}
      {staged.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {pendingCount} photo{pendingCount !== 1 ? 's' : ''} to review
            </p>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => toggleAll(true)} className="text-brand-600 hover:underline">All</button>
              <button onClick={() => toggleAll(false)} className="text-gray-400 hover:underline">None</button>
              <button onClick={handleClear} className="text-gray-400 hover:underline">Clear</button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {staged.map((f) => (
              <label
                key={f.name}
                className={`relative cursor-pointer ${f.done ? 'pointer-events-none' : ''}`}
              >
                {!f.done && (
                  <input
                    type="checkbox"
                    checked={f.checked}
                    onChange={() => toggle(f.name)}
                    className="absolute top-1.5 left-1.5 z-10 w-4 h-4 accent-brand-600"
                  />
                )}
                {f.done && (
                  <span className="absolute top-1 right-1 z-10 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    ✓
                  </span>
                )}
                {f.uploading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-lg">
                    <span className="text-xs text-gray-500">…</span>
                  </div>
                )}
                <img
                  src={f.objectUrl}
                  alt={f.name}
                  className={`w-full aspect-square object-cover rounded-lg border-2 transition-all ${
                    f.done
                      ? 'border-green-400 opacity-50'
                      : f.checked
                      ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'border-gray-200 opacity-40'
                  }`}
                />
              </label>
            ))}
          </div>

          <button
            onClick={handleUploadSelected}
            disabled={uploading || checkedCount === 0}
            className="btn-primary text-sm w-full"
          >
            {uploading ? 'Uploading…' : `Upload ${checkedCount} selected photo${checkedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Idle hint */}
      {!dirHandle && (
        <p className="text-xs text-gray-400">
          Choose a folder to watch — new photos saved there appear here for review before uploading.
        </p>
      )}
      {active && staged.length === 0 && (
        <p className="text-xs text-gray-400">
          Watching for new photos — they'll appear here for review.
        </p>
      )}
    </div>
  );
}
