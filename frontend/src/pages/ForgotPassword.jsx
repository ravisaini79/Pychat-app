import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPassword() {
    const [step, setStep] = useState(1); // 1=email, 2=otp, 3=new password
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSendOtp(e) {
        e.preventDefault();
        setError('');
        if (!email.trim() || !email.includes('@')) {
            setError('Enter a valid email address');
            return;
        }
        setLoading(true);
        try {
            await api('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email: email.trim() }),
            });
            setSuccess('OTP sent to your email');
            setStep(2);
        } catch (err) {
            setError(err.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    }

    async function handleVerifyOtp(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (otp.trim().length !== 6) {
            setError('Enter the 6-digit OTP');
            return;
        }
        setLoading(true);
        try {
            const data = await api('/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
            });
            setResetToken(data.reset_token);
            setStep(3);
        } catch (err) {
            setError(err.message || 'Invalid OTP');
        } finally {
            setLoading(false);
        }
    }

    async function handleResetPassword(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await api('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({
                    reset_token: resetToken,
                    new_password: newPassword,
                }),
            });
            setSuccess('Password reset successfully! Redirecting...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Reset Password</h1>

                {/* ── Step 1: Enter email ── */}
                {step === 1 && (
                    <>
                        <p className="auth-subtitle">
                            Enter your registered email to receive a verification code
                        </p>
                        <form onSubmit={handleSendOtp} className="auth-form">
                            <input
                                type="email"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                disabled={loading}
                                required
                            />
                            {error && <p className="auth-error">{error}</p>}
                            <button type="submit" disabled={loading}>
                                {loading ? 'Sending...' : 'Send OTP'}
                            </button>
                        </form>
                    </>
                )}

                {/* ── Step 2: Verify OTP ── */}
                {step === 2 && (
                    <>
                        <p className="auth-subtitle">
                            Enter the 6-digit code sent to <strong>{email}</strong>
                        </p>
                        <form onSubmit={handleVerifyOtp} className="auth-form">
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="6-digit OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                autoComplete="one-time-code"
                                disabled={loading}
                                required
                            />
                            {error && <p className="auth-error">{error}</p>}
                            {success && <p className="auth-success">{success}</p>}
                            <button type="submit" disabled={loading}>
                                {loading ? 'Verifying...' : 'Verify OTP'}
                            </button>
                        </form>
                        <p className="auth-forgot">
                            <button
                                type="button"
                                className="link-btn"
                                onClick={() => { setStep(1); setError(''); setSuccess(''); setOtp(''); }}
                            >
                                Use a different email
                            </button>
                        </p>
                    </>
                )}

                {/* ── Step 3: New password ── */}
                {step === 3 && (
                    <>
                        <p className="auth-subtitle">Choose a strong new password</p>
                        <form onSubmit={handleResetPassword} className="auth-form">
                            <div className="password-field">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="New password (min 6 characters)"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
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
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                disabled={loading}
                                required
                            />
                            {error && <p className="auth-error">{error}</p>}
                            {success && <p className="auth-success">{success}</p>}
                            <button type="submit" disabled={loading}>
                                {loading ? 'Resetting...' : 'Update Password'}
                            </button>
                        </form>
                    </>
                )}

                <div className="auth-footer">
                    <Link to="/login">← Back to login</Link>
                </div>
            </div>
        </div>
    );
}
