import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Login() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    if (!password) {
      setError('Enter your password');
      return;
    }
    setLoading(true);
    try {
      await login(mobile, password);
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
        <h1>Welcome to PyChat</h1>
        <p className="auth-subtitle">Sign in with your mobile number to get started</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="tel"
            placeholder="Mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="tel"
            disabled={loading}
            required
          />

          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-forgot">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>

        <p className="auth-footer">
          New to PyChat? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
