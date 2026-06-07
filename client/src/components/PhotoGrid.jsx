import PhotoCard from './PhotoCard';

export default function PhotoGrid({ photos, currentUserId, isHost, onDeleted }) {
  if (photos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-2">🖼️</p>
        <p>No photos yet. Be the first to upload!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          currentUserId={currentUserId}
          isHost={isHost}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
