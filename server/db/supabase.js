const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Mappers: DB snake_case → app camelCase ───────────────────────────────────

function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    plan: u.plan,
    googleAccessToken: u.google_access_token,
    googleRefreshToken: u.google_refresh_token,
    createdAt: u.created_at,
  };
}

function mapSession(s) {
  if (!s) return null;
  return {
    id: s.id,
    joinCode: s.join_code,
    name: s.name,
    occasionType: s.occasion_type,
    hostUserId: s.host_user_id,
    durationMinutes: s.duration_minutes,
    expiresAt: s.expires_at,
    status: s.status,
    stoppedAt: s.stopped_at,
    guestListEnabled: s.guest_list_enabled,
    createdAt: s.created_at,
  };
}

function mapPhoto(p) {
  if (!p) return null;
  return {
    id: p.id,
    sessionId: p.session_id,
    uploadedByUserId: p.uploaded_by_user_id,
    uploadedByName: p.uploaded_by_name,
    storagePath: p.storage_path,
    url: p.url,
    filename: p.url,        // kept for any legacy references
    originalName: p.original_name,
    uploadedAt: p.uploaded_at,
  };
}

function mapMember(m) {
  if (!m) return null;
  return {
    id: m.id,
    sessionId: m.session_id,
    userId: m.user_id,
    displayName: m.display_name,
    lastSeenAt: m.last_seen_at,
    joinedAt: m.joined_at,
  };
}

function mapRsvp(r) {
  if (!r) return null;
  return {
    id: r.id,
    sessionId: r.session_id,
    guestName: r.guest_name,
    status: r.status,
    createdAt: r.created_at,
  };
}

function mapAllowlistEntry(e) {
  if (!e) return null;
  return {
    id: e.id,
    sessionId: e.session_id,
    name: e.name,
    addedAt: e.added_at,
  };
}

module.exports = {
  supabase,
  mapUser,
  mapSession,
  mapPhoto,
  mapMember,
  mapRsvp,
  mapAllowlistEntry,
};
