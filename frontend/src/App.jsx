import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (user) return <Navigate to="/chat" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<PublicRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
