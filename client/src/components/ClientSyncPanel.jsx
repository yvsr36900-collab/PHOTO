import { useState, useEffect, useRef } from 'react';
import { uploadPhoto } from '../api';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export default function ClientSyncPanel({ sessionId, userId, displayName, isAuthenticated, existingPhotos }) {
  const [tab, setTab] = useState('files'); // 'files' | 'folder'

  // Shared staged list: [{ id, name, file, objectUrl, checked, status }]
  // status: 'pending' | 'uploading' | 'done' | 'error'
  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Folder watch state
  const [dirHandle, setDirHandle] = useState(null);
  const [watching, setWatching] = useState(false);
  const [folderError, setFolderError] = useState('');
  const intervalRef = useRef(null);
  const seenRef = useRef(new Set());
  const existingRef = useRef(existingPhotos);
  useEffect(() => { existingRef.current = existingPhotos; }, [existingPhotos]);

  const fileInputRef = useRef();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      staged.forEach((f) => f.objectUrl && URL.revokeObjectURL(f.objectUrl));
      clearInterval(intervalRef.current);
    };
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function existingNames() {
    return new Set((existingRef.current || []).map((p) => p.originalName));
  }

  function addToStaged(files) {
    const known = existingNames();
    const current = new Set(staged.map((s) => s.name));
    const newEntries = [];

    for (const file of files) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!IMAGE_EXTS.has(ext)) continue;
      if (known.has(file.name)) continue;    // already in session
      if (current.has(file.name)) continue;  // already staged

      const objectUrl = URL.createObjectURL(file);
      newEntries.push({
        id: `${file.name}-${file.size}`,
        name: file.name,
        file,
        objectUrl,
        checked: true,
        status: 'pending',
      });
    }

    if (newEntries.length) setStaged((prev) => [...prev, ...newEntries]);
  }

  // ── File picker (all devices) ────────────────────────────────────────────────

  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    addToStaged(files);
    e.target.value = '';
  }

  // ── Folder watch (Chrome/Edge desktop) ──────────────────────────────────────

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      seenRef.current = new Set();
      // Pre-populate seen with files already in folder so they don't get staged
      for await (const [name] of handle) seenRef.current.add(name);
      setDirHandle(handle);
      setFolderError('');
      setWatching(true);
      startPolling(handle);
    } catch (err) {
      if (err.name !== 'AbortError') setFolderError('Could not open folder: ' + err.message);
    }
  }

  function startPolling(handle) {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => scanFolder(handle), 5000);
  }

  async function scanFolder(handle) {
    const known = existingNames();
    const newFiles = [];

    try {
      for await (const [name, entry] of handle) {
        if (entry.kind !== 'file') continue;
        const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
        if (!IMAGE_EXTS.has(ext)) continue;
        if (seenRef.current.has(name)) continue;
        seenRef.current.add(name);
        if (known.has(name)) continue;

        try {
          const file = await entry.getFile();
          newFiles.push(file);
        } catch {}
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setFolderError('Folder permission expired — please re-select the folder.');
        stopWatching();
        return;
      }
    }

    if (newFiles.length) addToStaged(newFiles);
  }

  function stopWatching() {
    setWatching(false);
    clearInterval(intervalRef.current);
  }

  function resumeWatching() {
    if (!dirHandle) return;
    setWatching(true);
    startPolling(dirHandle);
    scanFolder(dirHandle);
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  async function handleUpload() {
    const toUpload = staged.filter((f) => f.checked && f.status === 'pending');
    if (!toUpload.length) return;

    setUploading(true);
    setProgress({ done: 0, total: toUpload.length });

    for (let i = 0; i < toUpload.length; i++) {
      const entry = toUpload[i];

      setStaged((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: 'uploading' } : f));

      try {
        const fd = new FormData();
        fd.append('photo', entry.file, entry.name);
        if (!isAuthenticated) {
          fd.append('guestId', userId || '');
          fd.append('displayName', displayName || 'Sync');
        }
        await uploadPhoto(sessionId, fd);
        URL.revokeObjectURL(entry.objectUrl);
        setStaged((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: 'done', objectUrl: null } : f));
      } catch {
        setStaged((prev) => prev.map((f) => f.id === entry.id ? { ...f, status: 'error' } : f));
      }

      setProgress({ done: i + 1, total: toUpload.length });
    }

    // Remove done entries after a short delay
    setTimeout(() => setStaged((prev) => prev.filter((f) => f.status !== 'done')), 1000);
    setUploading(false);
    setProgress({ done: 0, total: 0 });
  }

  function toggle(id) {
    setStaged((prev) => prev.map((f) => f.id === id ? { ...f, checked: !f.checked } : f));
  }

  function toggleAll(val) {
    setStaged((prev) => prev.map((f) => f.status === 'pending' ? { ...f, checked: val } : f));
  }

  function clearStaged() {
    staged.forEach((f) => f.objectUrl && URL.revokeObjectURL(f.objectUrl));
    setStaged([]);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const pendingItems = staged.filter((f) => f.status === 'pending');
  const checkedCount = pendingItems.filter((f) => f.checked).length;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Tab switcher — only show folder tab on supported browsers */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('files')}
          className={`px-3 py-1.5 text-xs font-medium ${tab === 'files' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`}
        >
          📷 Select Photos
        </button>
        {supportsDirectoryPicker && (
          <button
            onClick={() => setTab('folder')}
            className={`px-3 py-1.5 text-xs font-medium ${tab === 'folder' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`}
          >
            📁 Watch Folder
          </button>
        )}
      </div>

      {/* Select Photos tab — works on ALL devices */}
      {tab === 'files' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary text-sm w-full"
          >
            Choose Photos
          </button>
          <p className="text-xs text-gray-400 text-center">
            Pick from your camera roll, gallery, or files — any device works.
          </p>
        </div>
      )}

      {/* Watch Folder tab — desktop Chrome/Edge only */}
      {tab === 'folder' && supportsDirectoryPicker && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${watching ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-600 flex-1 truncate">
              {watching ? `Watching "${dirHandle?.name}"` : dirHandle ? `Paused — "${dirHandle?.name}"` : 'No folder selected'}
            </span>
            <div className="flex gap-1.5">
              {!dirHandle ? (
                <button onClick={pickFolder} className="btn-primary text-xs px-3 py-1.5">Choose Folder</button>
              ) : watching ? (
                <>
                  <button onClick={pickFolder} className="btn-secondary text-xs px-2 py-1.5">Change</button>
                  <button onClick={stopWatching} className="btn-danger text-xs px-2 py-1.5">Stop</button>
                </>
              ) : (
                <>
                  <button onClick={pickFolder} className="btn-secondary text-xs px-2 py-1.5">Change</button>
                  <button onClick={resumeWatching} className="btn-primary text-xs px-2 py-1.5">Resume</button>
                </>
              )}
            </div>
          </div>
          {folderError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{folderError}</p>
          )}
          {!dirHandle && (
            <p className="text-xs text-gray-400">
              New photos saved to the folder appear here automatically every 5 seconds.
            </p>
          )}
          {watching && pendingItems.length === 0 && (
            <p className="text-xs text-gray-400">Watching for new photos…</p>
          )}
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && progress.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Uploading…</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-brand-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Staged photo grid */}
      {staged.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {pendingItems.length} photo{pendingItems.length !== 1 ? 's' : ''} ready to upload
            </p>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => toggleAll(true)} className="text-brand-600 hover:underline">All</button>
              <button onClick={() => toggleAll(false)} className="text-gray-400 hover:underline">None</button>
              <button onClick={clearStaged} className="text-gray-400 hover:underline">Clear</button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {staged.map((f) => (
              <label
                key={f.id}
                className={`relative cursor-pointer select-none ${f.status !== 'pending' ? 'pointer-events-none' : ''}`}
              >
                {f.status === 'pending' && (
                  <input
                    type="checkbox"
                    checked={f.checked}
                    onChange={() => toggle(f.id)}
                    className="absolute top-1.5 left-1.5 z-10 w-4 h-4 accent-brand-600"
                  />
                )}
                {f.status === 'done' && (
                  <span className="absolute top-1 right-1 z-10 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">✓</span>
                )}
                {f.status === 'error' && (
                  <span className="absolute top-1 right-1 z-10 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">!</span>
                )}
                {f.status === 'uploading' && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-lg">
                    <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {f.objectUrl && (
                  <img
                    src={f.objectUrl}
                    alt={f.name}
                    className={`w-full aspect-square object-cover rounded-lg border-2 transition-all ${
                      f.status === 'done' ? 'border-green-400 opacity-40'
                      : f.status === 'error' ? 'border-red-400 opacity-60'
                      : f.checked ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'border-gray-200 opacity-40'
                    }`}
                  />
                )}
              </label>
            ))}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || checkedCount === 0}
            className="btn-primary text-sm w-full disabled:opacity-50"
          >
            {uploading
              ? `Uploading ${progress.done} of ${progress.total}…`
              : `Upload ${checkedCount} photo${checkedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
