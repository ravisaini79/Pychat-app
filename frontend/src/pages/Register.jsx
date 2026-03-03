import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Register() {
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
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
    setLoading(true);
    try {
      await register(mobile, name, imageFile);
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
        <h1>Create account</h1>
        <p className="auth-subtitle">Register with your mobile number</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-avatar-upload">
            <button
              type="button"
              className="avatar-preview-wrap"
              onClick={() => fileRef.current?.click()}
              aria-label="Add photo"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="avatar-preview-img" />
              ) : (
                <span className="avatar-placeholder">+ Photo</span>
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
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={loading}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
