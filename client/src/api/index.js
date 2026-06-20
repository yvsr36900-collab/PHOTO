import api from './axios';

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Sessions
export const createSession = (data) => api.post('/sessions', data);
export const getMySessions = () => api.get('/sessions');
export const getSessionById = (id) => api.get(`/sessions/${id}`);
export const getSessionByCode = (code) => api.get(`/sessions/code/${code}`);
export const joinSession = (data) => api.post('/sessions/join', data);
export const addTime = (id, minutes) => api.post(`/sessions/${id}/add-time`, { minutes });
export const stopSession = (id) => api.post(`/sessions/${id}/stop`);
export const restartSession = (id) => api.post(`/sessions/${id}/restart`);
export const getSessionQR = (id) => api.get(`/sessions/${id}/qr`);
export const getSessionMembers = (id) => api.get(`/sessions/${id}/members`);
export const sendHeartbeat = (id, guestId) => api.post(`/sessions/${id}/heartbeat`, { guestId });
export const kickMember = (id, userId) => api.delete(`/sessions/${id}/members/${userId}`);

// Photos
export const uploadPhoto = (sessionId, formData) =>
  api.post(`/photos/session/${sessionId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const getPhotos = (sessionId) => api.get(`/photos/session/${sessionId}`);
export const deletePhoto = (photoId, guestId) =>
  api.delete(`/photos/${photoId}`, { data: { guestId } });

// Export
export const downloadZip = (sessionId) =>
  api.get(`/export/zip/${sessionId}`, { responseType: 'blob' });
export const exportToDrive = (sessionId) => api.post(`/export/drive/${sessionId}`);

// Google Drive
export const getGoogleAuthUrl = () => api.get('/auth/google/connect');
export const getGoogleStatus = () => api.get('/auth/google/status');
export const disconnectGoogle = () => api.post('/auth/google/disconnect');

// Guest Allowlist
export const getAllowlist = (sessionId) => api.get(`/sessions/${sessionId}/allowlist`);
export const addToAllowlist = (sessionId, name) => api.post(`/sessions/${sessionId}/allowlist`, { name });
export const removeFromAllowlist = (sessionId, entryId) => api.delete(`/sessions/${sessionId}/allowlist/${entryId}`);

// RSVP
export const submitRsvp = (joinCode, data) => api.post(`/rsvp/${joinCode}`, data);
export const getRsvps = (sessionId) => api.get(`/rsvp/${sessionId}`);

// Photo Sync
export const getSyncStatus = (sessionId) => api.get(`/sync/${sessionId}/status`);
export const startSync = (sessionId, watchPath) => api.post(`/sync/${sessionId}/start`, { watchPath });
export const stopSync = (sessionId) => api.post(`/sync/${sessionId}/stop`);
export const getSyncPending = (sessionId) => api.get(`/sync/${sessionId}/pending`);
export const confirmSyncUpload = (sessionId, selected) => api.post(`/sync/${sessionId}/confirm`, { selected });
