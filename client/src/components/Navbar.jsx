import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PlanBadge from './PlanBadge';

export default function Navbar() {
  const { user, authLogout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    authLogout();
    navigate('/');
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl text-brand-600 tracking-tight">
          📸 SnapGather
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/pricing" className="text-sm text-gray-600 hover:text-brand-600">Pricing</Link>
          {user ? (
            <>
              <Link to="/dashboard" className="text-sm text-gray-600 hover:text-brand-600">Dashboard</Link>
              <span className="text-sm text-gray-500">{user.displayName}</span>
              <PlanBadge plan={user.plan} />
              <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-gray-600 hover:text-brand-600">Login</Link>
              <Link to="/register" className="btn-primary text-sm">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
