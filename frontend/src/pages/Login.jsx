import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Login() {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!mobile.trim()) {
      setError('Enter your mobile number');
      return;
    }
    setLoading(true);
    try {
      await login(mobile);
      navigate('/chat');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>AI Chat</h1>
        <p className="auth-subtitle">Sign in with your mobile number</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="tel"
            placeholder="Mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="tel"
            disabled={loading}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-footer">
          New here? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
