const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

const activeWatchers = new Map();
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const BLOCKED_PATTERNS = [/Photos Library\.photoslibrary/, /\.photoslibrary/];

const PENDING_BASE = path.join(__dirname, '..', 'pending');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function pendingDir(sessionId) {
  return path.join(PENDING_BASE, String(sessionId));
}

function candidatePaths() {
  const home = os.homedir();
  return [
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Pictures'),
  ].filter((p) => {
    if (BLOCKED_PATTERNS.some((re) => re.test(p))) return false;
    try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
  });
}

function defaultWatchPath() {
  return candidatePaths()[0] || os.homedir();
}

function startWatcher(sessionId, watchPath, uploaderName) {
  const key = String(sessionId);
  if (activeWatchers.has(key)) {
    activeWatchers.get(key).watcher.close();
  }

  const resolvedPath = watchPath || defaultWatchPath();
  const dir = pendingDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const seenFiles = new Set();
  let ready = false;

  const watcher = chokidar.watch(resolvedPath, {
    persistent: true,
    ignoreInitial: false,
    depth: 8,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    ignored: /(^|[/\\])\../,
  });

  const state = {
    watcher,
    watchPath: resolvedPath,
    uploaderName: uploaderName || 'Photos Sync',
    // filename -> {filename, originalName, detectedAt}
    pending: new Map(),
    errors: [],
  };

  activeWatchers.set(key, state);

  watcher.on('add', (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return;

    if (!ready) {
      seenFiles.add(filePath);
      return;
    }
    if (seenFiles.has(filePath)) return;
    seenFiles.add(filePath);

    try {
      const originalName = path.basename(filePath);

      // Skip if already uploaded to this session
      const alreadyUploaded = db.prepare(
        'SELECT id FROM photos WHERE sessionId = ? AND originalName = ?'
      ).get(sessionId, originalName);
      if (alreadyUploaded) {
        console.log(`[Sync:${sessionId}] skipping duplicate: ${originalName}`);
        return;
      }

      // Skip if already staged (same original name)
      const alreadyStaged = [...state.pending.values()].some((m) => m.originalName === originalName);
      if (alreadyStaged) return;

      const filename = `${uuidv4()}${ext}`;
      const destPath = path.join(dir, filename);
      fs.copyFileSync(filePath, destPath);

      state.pending.set(filename, { filename, originalName, detectedAt: new Date().toISOString() });
      console.log(`[Sync:${sessionId}] staged "${originalName}"`);
    } catch (err) {
      state.errors.unshift({ file: path.basename(filePath), error: err.message, at: new Date().toISOString() });
      if (state.errors.length > 5) state.errors.pop();
      console.error(`[Sync:${sessionId}] stage error:`, err.message);
    }
  });

  watcher.on('ready', () => {
    ready = true;
    console.log(`[Sync:${sessionId}] watching "${resolvedPath}"`);
  });

  watcher.on('error', (err) => {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.warn(`[Sync:${sessionId}] permission denied — stopping watcher`);
      state.errors.unshift({ error: 'Cannot watch this folder (permission denied). Choose Downloads or Desktop instead.', at: new Date().toISOString() });
      state.watcher.close();
      activeWatchers.delete(key);
      return;
    }
    state.errors.unshift({ error: err.message, at: new Date().toISOString() });
    if (state.errors.length > 5) state.errors.pop();
    console.error(`[Sync:${sessionId}] watcher error:`, err.message);
  });

  return state;
}

function stopWatcher(sessionId) {
  const key = String(sessionId);
  const state = activeWatchers.get(key);
  if (!state) return false;
  state.watcher.close();
  activeWatchers.delete(key);
  console.log(`[Sync:${sessionId}] stopped`);
  return true;
}

function getStatus(sessionId) {
  const key = String(sessionId);
  const state = activeWatchers.get(key);
  const dir = pendingDir(sessionId);

  let pendingCount = 0;
  try { pendingCount = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0; } catch {}

  if (!state) return { active: false, pendingCount, defaultWatchPath: defaultWatchPath(), candidates: candidatePaths() };

  return {
    active: true,
    watchPath: state.watchPath,
    pendingCount,
    errors: state.errors,
    defaultWatchPath: defaultWatchPath(),
    candidates: candidatePaths(),
  };
}

function getPending(sessionId) {
  const key = String(sessionId);
  const state = activeWatchers.get(key);
  const dir = pendingDir(sessionId);

  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir).map((filename) => {
    const meta = state?.pending.get(filename);
    return { filename, originalName: meta?.originalName || filename, detectedAt: meta?.detectedAt || null };
  });
}

function confirmUpload(sessionId, selectedFilenames) {
  const key = String(sessionId);
  const state = activeWatchers.get(key);
  const db = getDb();
  const dir = pendingDir(sessionId);

  if (!fs.existsSync(dir)) return { uploaded: 0, discarded: 0 };

  const allPending = fs.readdirSync(dir);
  const selectedSet = new Set(selectedFilenames);
  const uploaderName = state?.uploaderName || 'Photo Sync';

  let uploaded = 0;
  let discarded = 0;

  for (const filename of allPending) {
    const srcPath = path.join(dir, filename);
    if (selectedSet.has(filename)) {
      try {
        fs.copyFileSync(srcPath, path.join(UPLOADS_DIR, filename));
        fs.unlinkSync(srcPath);
        const meta = state?.pending.get(filename);
        db.prepare(
          'INSERT INTO photos (sessionId, uploadedByUserId, uploadedByName, filename, originalName) VALUES (?, ?, ?, ?, ?)'
        ).run(sessionId, `sync_${sessionId}`, uploaderName, filename, meta?.originalName || filename);
        if (state) state.pending.delete(filename);
        uploaded++;
      } catch (err) {
        console.error(`[Sync:${sessionId}] confirm error for ${filename}:`, err.message);
      }
    } else {
      try { fs.unlinkSync(srcPath); } catch {}
      if (state) state.pending.delete(filename);
      discarded++;
    }
  }

  return { uploaded, discarded };
}

module.exports = { startWatcher, stopWatcher, getStatus, getPending, confirmUpload };
