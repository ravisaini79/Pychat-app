import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Register() {
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleImageChange = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && file.size <= 300000) {
      setImageFile(file);
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    } else if (file) {
      setError('Choose an image under 300KB');
      setImageFile(null);
      setImagePreview(null);
    } else {
      setImageFile(null);
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!mobile.trim()) {
      setError('Enter your mobile number');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(mobile, name, password, email, imageFile);
      navigate('/chat');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Join PyChat</h1>
        <p className="auth-subtitle">Create an account to start messaging</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-avatar-upload">
            <button
              type="button"
              className="avatar-preview-wrap"
              onClick={() => fileRef.current?.click()}
              aria-label="Add profile photo"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="avatar-preview-img" />
              ) : (
                <span className="avatar-placeholder">+ Profile Photo</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="auth-file-input"
            />
          </div>

          <input
            type="tel"
            placeholder="Mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="tel"
            disabled={loading}
            required
          />

          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={loading}
          />

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
            required
          />

          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
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
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
