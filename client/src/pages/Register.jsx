import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { authLogin } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await register(form);
      authLogin(res.data.data.token, res.data.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input className="input" type="text" value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input className="input" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input className="input" type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Already have an account? <Link to="/login" className="text-brand-600 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
