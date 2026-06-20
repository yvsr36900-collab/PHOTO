import { useState } from 'react';
import { deletePhoto } from '../api';

export default function PhotoCard({ photo, currentUserId, isHost, onDeleted }) {
  const [hovering, setHovering] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete = isHost || photo.uploadedByUserId === String(currentUserId);

  async function handleDelete() {
    if (!confirm('Delete this photo?')) return;
    setDeleting(true);
    try {
      const guestId = currentUserId?.startsWith?.('guest_') ? currentUserId : undefined;
      await deletePhoto(photo.id, guestId);
      onDeleted(photo.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <img
        src={photo.url}
        alt={photo.originalName}
        className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
        loading="lazy"
      />
      {hovering && (
        <div className="absolute inset-0 bg-black/50 flex flex-col justify-end p-2">
          <p className="text-white text-xs font-medium truncate">{photo.uploadedByName}</p>
          <p className="text-white/70 text-xs">{new Date(photo.uploadedAt).toLocaleString()}</p>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={deleting}
              className="mt-1 text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition-colors"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
