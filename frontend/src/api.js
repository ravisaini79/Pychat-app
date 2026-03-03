export const BASE_URL = ''; // Keep relative for convenience or set to backend URL
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}

export async function register(mobile, name = '', password = '', email = '', imageFile = null) {
  const body = new FormData();
  body.append('mobile', mobile.trim());
  body.append('name', (name || '').trim() || 'User');
  body.append('password', password);
  body.append('email', email.trim());
  if (imageFile && imageFile instanceof File) {
    body.append('image', imageFile);
  }
  const data = await api('/auth/register', {
    method: 'POST',
    body,
  });
  return data;
}

export async function login(mobile, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ mobile: mobile.trim(), password }),
  });
  return data;
}

export async function listUsers(q) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  return api(`/chat/users?${params}`);
}

export async function listConnectionRequests() {
  return api('/chat/connection-requests');
}

export async function sendConnectionRequest(toUserId) {
  return api('/chat/connection-request', {
    method: 'POST',
    body: JSON.stringify({ to_user_id: toUserId }),
  });
}

export async function acceptConnectionRequest(requestId) {
  return api(`/chat/connection-request/${requestId}/accept`, { method: 'POST' });
}

export async function rejectConnectionRequest(requestId) {
  return api(`/chat/connection-request/${requestId}/reject`, { method: 'POST' });
}

export async function listConversations() {
  return api('/chat/conversations');
}

export async function getMessages(otherUserId, before, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return api(`/chat/messages/${otherUserId}?${params}`);
}

export async function sendMessage(receiverId, content, type = 'text') {
  return api('/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      receiver_id: receiverId,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      type: type || 'text',
    }),
  });
}

export async function deleteMessage(messageId) {
  return api(`/chat/messages/${messageId}`, { method: 'DELETE' });
}

export async function reactToMessage(messageId, emoji) {
  return api(`/chat/messages/${messageId}/react?emoji=${encodeURIComponent(emoji)}`, { method: 'POST' });
}
