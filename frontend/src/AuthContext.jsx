import React, { createContext, useContext, useState, useEffect } from 'react';
import { register as apiRegister, login as apiLogin } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (token && saved) {
      try {
        const u = JSON.parse(saved);
        setUser({ ...u, token });
      } catch (_) { }
    }
    setLoading(false);
  }, []);

  const login = async (mobile, password) => {
    const data = await apiLogin(mobile, password);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser({ ...data.user, token: data.access_token });
    return data.user;
  };

  const registerUser = async (mobile, name, password, email, imageFile = null) => {
    const data = await apiRegister(mobile, name, password, email, imageFile);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser({ ...data.user, token: data.access_token });
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register: registerUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
