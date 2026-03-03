import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import {
  listConversations,
  listUsers,
  listConnectionRequests,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  getMessages,
  sendMessage as apiSendMessage,
  deleteMessage as apiDeleteMessage,
  reactToMessage as apiReactToMessage,
} from '../api';
import { useWebSocket } from '../useWebSocket';
import './Chat.css';

function Avatar({ user, className = '' }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt="" className={`avatar-img ${className}`} />;
  }
  return (
    <span className={`avatar-initial ${className}`}>
      {user?.name?.charAt(0) || '?'}
    </span>
  );
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function MessageBubble({ msg, isSent, onDelete, onReact }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const type = msg.type || 'text';
  const isDeleted = msg.deleted_at;
  const reactions = msg.reactions && typeof msg.reactions === 'object' ? Object.values(msg.reactions) : [];

  const content = () => {
    if (type === 'image') {
      return (
        <div className="message-bubble message-media">
          <img src={msg.content} alt="Shared" className="msg-image" />
        </div>
      );
    }
    if (type === 'video') {
      return (
        <div className="message-bubble message-media">
          <video src={msg.content} controls className="msg-video" />
        </div>
      );
    }
    if (type === 'contact') {
      try {
        const c = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        return (
          <div className="message-bubble message-contact">
            <span className="msg-contact-name">{c.name || 'Contact'}</span>
            <a href={`tel:${c.number || ''}`} className="msg-contact-number">{c.number || ''}</a>
          </div>
        );
      } catch (_) {
        return <div className="message-bubble">{msg.content}</div>;
      }
    }
    if (type === 'location') {
      try {
        const loc = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        const url = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
        return (
          <div className="message-bubble message-location">
            <a href={url} target="_blank" rel="noopener noreferrer" className="msg-location-link">
              {loc.label || 'Location'}
            </a>
            <span className="msg-location-coords">{loc.lat?.toFixed(4)}, {loc.lng?.toFixed(4)}</span>
          </div>
        );
      } catch (_) {
        return <div className="message-bubble">{msg.content}</div>;
      }
    }
    return <div className="message-bubble">{msg.content}</div>;
  };

  if (isDeleted) {
    return (
      <div className="message-bubble message-deleted">
        <em>This message was deleted</em>
      </div>
    );
  }

  return (
    <div className="message-bubble-wrap">
      <div
        className="message-touch-area"
        onClick={() => { setMenuOpen(false); setReactOpen(false); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); setReactOpen(false); }}
      >
        {content()}
        {reactions.length > 0 && (
          <div className="message-reactions">
            {reactions.map((em, i) => (
              <span key={i} className="msg-emoji">{em}</span>
            ))}
          </div>
        )}
      </div>
      {(menuOpen || reactOpen) && (
        <div className="message-menu">
          {reactOpen ? (
            <div className="message-menu-emojis">
              {QUICK_EMOJIS.map((em) => (
                <button key={em} type="button" className="msg-emoji-btn" onClick={() => { onReact?.(em); setReactOpen(false); setMenuOpen(false); }}>{em}</button>
              ))}
            </div>
          ) : (
            <>
              <button type="button" onClick={() => { setMenuOpen(false); setReactOpen(true); }}>React</button>
              {isSent && onDelete && <button type="button" onClick={() => { onDelete?.(); setMenuOpen(false); }}>Delete</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [connectionRequests, setConnectionRequests] = useState({ incoming: [], outgoing: [] });
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadConversations = async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch (_) {}
  };

  const loadConnectionRequests = async () => {
    try {
      const data = await listConnectionRequests();
      setConnectionRequests({ incoming: data.incoming || [], outgoing: data.outgoing || [] });
    } catch (_) {}
  };

  useEffect(() => {
    loadConversations();
    loadConnectionRequests();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      return;
    }
    if (selectedUser.connection_status !== 'connected') return;
    let cancelled = false;
    setLoading(true);
    getMessages(selectedUser.id)
      .then((list) => {
        if (!cancelled) setMessages(list);
      })
      .catch(() => { if (!cancelled) setMessages([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedUser?.id, selectedUser?.connection_status]);

  useEffect(() => {
    if (!selectedUser || selectedUser.connection_status !== 'connected') return;
    pollRef.current = setInterval(() => {
      getMessages(selectedUser.id).then(setMessages).catch(() => {});
      loadConversations();
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedUser?.id, selectedUser?.connection_status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const list = await listUsers(q);
      setSearchResults(list);
    } catch (_) {
      setSearchResults([]);
    }
  };

  const selectUser = (u) => {
    setSelectedUser(u);
    setSearchQuery('');
    setSearchResults([]);
    setSidebarOpen(false);
  };

  const handleSendRequest = async (u) => {
    try {
      await sendConnectionRequest(u.id);
      const list = await listUsers(searchQuery);
      setSearchResults(list);
      loadConnectionRequests();
    } catch (_) {}
  };

  const handleAccept = async (r) => {
    try {
      const data = await acceptConnectionRequest(r.id);
      loadConnectionRequests();
      await loadConversations();
      if (data.user) {
        selectUser({ ...data.user, connection_status: 'connected' });
      }
    } catch (_) {}
  };

  const handleReject = async (requestId) => {
    try {
      await rejectConnectionRequest(requestId);
      loadConnectionRequests();
    } catch (_) {}
  };

  const sendTextMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedUser || sending) return;
    if (selectedUser.connection_status !== 'connected') return;
    setSending(true);
    try {
      const msg = await apiSendMessage(selectedUser.id, input.trim(), 'text');
      setMessages((prev) => [...prev, msg]);
      setInput('');
      loadConversations();
    } catch (_) {}
    finally { setSending(false); }
  };

  const sendMediaMessage = async (type, content) => {
    if (!selectedUser || sending) return;
    setSending(true);
    setAttachOpen(false);
    try {
      const msg = await apiSendMessage(selectedUser.id, content, type);
      setMessages((prev) => [...prev, msg]);
      loadConversations();
    } catch (_) {}
    finally { setSending(false); }
  };

  const onImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => sendMediaMessage('image', reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const onVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && (file.type.startsWith('video/') || file.type === 'video/mp4')) {
      const reader = new FileReader();
      reader.onload = () => sendMediaMessage('video', reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const sendContact = () => {
    if (!contactName.trim() && !contactNumber.trim()) return;
    sendMediaMessage('contact', JSON.stringify({ name: contactName.trim(), number: contactNumber.trim() }));
    setContactModal(false);
    setContactName('');
    setContactNumber('');
  };

  const sendLocation = () => {
    if (!navigator.geolocation) {
      alert('Location not supported');
      return;
    }
    setAttachOpen(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendMediaMessage('location', JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'My location',
        }));
      },
      () => alert('Could not get location'),
    );
  };

  const incomingCount = connectionRequests.incoming?.length || 0;

  return (
    <div className="chat-layout wa-theme">
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-user">
            <Avatar user={user} className="sidebar-avatar" />
            <div className="sidebar-user-info">
              <strong>{user?.name || 'User'}</strong>
              <span className="sidebar-mobile">{user?.mobile}</span>
            </div>
          </div>
          <div className="sidebar-header-actions">
            <button type="button" className="btn-menu btn-icon" onClick={() => setSidebarOpen(false)} aria-label="Close">×</button>
            <button type="button" className="btn-logout" onClick={logout}>Logout</button>
          </div>
        </div>
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search by mobile or name"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {incomingCount > 0 && (
          <div className="sidebar-section connection-requests-section">
            <h3 className="sidebar-section-title">
              Requests <span className="notification-badge">{incomingCount}</span>
            </h3>
            <div className="request-list">
              {connectionRequests.incoming.map((r) => (
                <div key={r.id} className="request-item">
                  <Avatar user={r.from_user} className="convo-avatar" />
                  <div className="request-info">
                    <span className="convo-name">{r.from_user?.name}</span>
                    <span className="convo-mobile">{r.from_user?.mobile}</span>
                  </div>
                  <div className="request-actions">
                    <button type="button" className="btn-accept" onClick={() => handleAccept(r)}>Accept</button>
                    <button type="button" className="btn-reject" onClick={() => handleReject(r.id)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="sidebar-section search-results">
            <h3 className="sidebar-section-title">Search</h3>
            {searchResults.map((u) => (
              <div key={u.id} className="convo-item-wrap">
                <button
                  type="button"
                  className={`convo-item ${selectedUser?.id === u.id ? 'active' : ''}`}
                  onClick={() => selectUser(u)}
                >
                  <Avatar user={u} className="convo-avatar" />
                  <div className="convo-info">
                    <span className="convo-name">{u.name}</span>
                    <span className="convo-mobile">{u.mobile}</span>
                  </div>
                  {u.connection_status === 'connected' && <span className="status-tag connected">Chat</span>}
                  {u.connection_status === 'pending_sent' && <span className="status-tag pending">Pending</span>}
                  {u.connection_status === 'pending_received' && <span className="status-tag received">Accept above</span>}
                  {u.connection_status === 'none' && (
                    <button type="button" className="btn-connect" onClick={(e) => { e.stopPropagation(); handleSendRequest(u); }}>Connect</button>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-section convo-list">
          <h3 className="sidebar-section-title">Chats</h3>
          {conversations.length === 0 && searchResults.length === 0 && (
            <p className="sidebar-empty">No chats yet. Search and send a connection request.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`convo-item ${selectedUser?.id === c.id ? 'active' : ''}`}
              onClick={() => selectUser({ ...c, connection_status: 'connected' })}
            >
              <div className="convo-avatar-wrap">
                <Avatar user={c} className="convo-avatar" />
                {c.unread_count > 0 && <span className="unread-badge">{c.unread_count > 99 ? '99+' : c.unread_count}</span>}
              </div>
              <div className="convo-info">
                <span className="convo-name">{c.name}</span>
                <span className="convo-preview">{c.last_message || 'No messages yet'}</span>
              </div>
              <span className="convo-time">{formatTime(c.last_at)}</span>
            </button>
          ))}
        </div>
      </aside>

      <button type="button" className="btn-menu btn-menu-open" onClick={() => setSidebarOpen(true)} aria-label="Menu">
        <span className="hamburger" />
      </button>

      <main className="chat-main">
        {selectedUser ? (
          selectedUser.connection_status === 'connected' ? (
            <>
              <div className="chat-header">
                <button type="button" className="btn-back" onClick={() => setSidebarOpen(true)} aria-label="Back">‹</button>
                <Avatar user={selectedUser} className="chat-header-avatar" />
                <div className="chat-header-info">
                  <strong>{selectedUser.name}</strong>
                  <span className="chat-header-mobile">{selectedUser.mobile}</span>
                </div>
              </div>
              <div className="chat-messages">
                {loading ? (
                  <div className="messages-loading">Loading…</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`message ${m.sender_id === user?.id ? 'sent' : 'received'}`}>
                      <MessageBubble msg={m} isSent={m.sender_id === user?.id} />
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="chat-input-form" onSubmit={sendTextMessage}>
                <div className="attach-wrap">
                  <button type="button" className="btn-attach" onClick={() => setAttachOpen(!attachOpen)} aria-label="Attach">⊕</button>
                  {attachOpen && (
                    <div className="attach-menu">
                      <button type="button" onClick={() => { fileInputRef.current?.click(); }}>
                        Photo
                      </button>
                      <button type="button" onClick={() => { videoInputRef.current?.click(); }}>
                        Video
                      </button>
                      <button type="button" onClick={() => { setAttachOpen(false); setContactModal(true); }}>
                        Contact
                      </button>
                      <button type="button" onClick={sendLocation}>
                        Location
                      </button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageSelect} className="hidden-input" />
                  <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden-input" />
                </div>
                <input
                  type="text"
                  placeholder="Message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={sending}
                  className="chat-input"
                />
                <button type="submit" className="btn-send" disabled={sending || !input.trim()} aria-label="Send">➤</button>
              </form>
            </>
          ) : (
            <div className="chat-empty chat-connect-prompt">
              <p>
                {selectedUser.connection_status === 'pending_sent'
                  ? 'Request sent. Wait for them to accept.'
                  : selectedUser.connection_status === 'pending_received'
                    ? 'Accept their request in the Requests section.'
                    : 'Send a connection request to chat.'}
              </p>
              {selectedUser.connection_status === 'none' && (
                <button type="button" className="btn-connect-large" onClick={() => handleSendRequest(selectedUser)}>Send request</button>
              )}
            </div>
          )
        ) : (
          <div className="chat-empty">
            <p>Open a chat from the list or search and send a connection request.</p>
          </div>
        )}
      </main>

      {contactModal && (
        <div className="modal-overlay" onClick={() => setContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Share contact</h3>
            <input type="text" placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <input type="tel" placeholder="Number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
            <div className="modal-actions">
              <button type="button" onClick={() => setContactModal(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={sendContact}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
