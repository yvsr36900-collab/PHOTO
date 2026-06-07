import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <main className="max-w-5xl mx-auto px-4 py-20 text-center">
      <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
        Share Every <span className="text-brand-600">Moment</span><br />From Your Event
      </h1>
      <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
        Create a photo-sharing session in seconds. Guests join with a code or QR scan — no app required.
      </p>
      <div className="flex items-center justify-center gap-4 mb-16">
        {user ? (
          <Link to="/dashboard" className="btn-primary text-lg px-8 py-3">Go to Dashboard</Link>
        ) : (
          <>
            <Link to="/register" className="btn-primary text-lg px-8 py-3">Start for Free</Link>
            <Link to="/pricing" className="btn-secondary text-lg px-8 py-3">See Plans</Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {[
          { icon: '🔗', title: 'Instant Join', desc: 'Share a 6-character code or QR code. Guests join in one tap — no signup needed.' },
          { icon: '📸', title: 'Live Photo Grid', desc: 'Photos appear in real-time as guests upload. Everyone sees the memories as they happen.' },
          { icon: '📦', title: 'Easy Export', desc: 'Download all photos as a ZIP. Premium users can push straight to Google Drive.' },
        ].map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-lg mb-1">{f.title}</h3>
            <p className="text-gray-500 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
