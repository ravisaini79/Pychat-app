import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { api, BASE_URL } from '../api';
import useWebSocket from '../useWebSocket';
import CallOverlay from './CallOverlay';
import './Chat.css';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

export default function Chat() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('chats'); // 'chats', 'contacts', 'requests'
  const [conversations, setConversations] = useState([]);
  const [globalUsers, setGlobalUsers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [reactionMenu, setReactionMenu] = useState(null); // { messageId, x, y }
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]); // Array of user objects
  const [groupName, setGroupName] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const { lastMessage, sendJson } = useWebSocket(user?.token);

  // ── WebRTC States ──
  const [callStatus, setCallStatus] = useState('idle'); // 'idle' | 'calling' | 'incoming' | 'active'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null); // PeerConnection
  const iceCandidatesQueue = useRef([]);

  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  const initPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate && selectedConvo) {
        sendJson({
          event: "webrtc_signal",
          to: selectedConvo.type === 'private' ? selectedConvo.id : null,
          group_id: selectedConvo.type === 'group' ? selectedConvo.id : null,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pcRef.current = pc;
    return pc;
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get media devices:', err);
      return null;
    }
  };

  const initiateCall = async () => {
    if (!selectedConvo) return;
    setCallStatus('calling');
    const stream = await startLocalStream();
    if (!stream) return;

    const pc = initPeerConnection();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendJson({
      event: "webrtc_signal",
      to: selectedConvo.type === 'private' ? selectedConvo.id : null,
      group_id: selectedConvo.type === 'group' ? selectedConvo.id : null,
      signal: { type: 'offer', sdp: offer.sdp }
    });
  };

  const handleIncomingCall = async (fromId, signal, groupId) => {
    // Only auto-show if we are idle
    if (callStatus !== 'idle') return;
    setCallStatus('incoming');
    // Store signaling data to process after acceptance
    pcRef.current_signal = signal;
    pcRef.current_from = fromId;
    pcRef.current_group_id = groupId;
    iceCandidatesQueue.current = []; // Reset queue for new call
  };

  const acceptCall = async () => {
    const stream = await startLocalStream();
    if (!stream) return;

    const pc = initPeerConnection();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const signal = pcRef.current_signal;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendJson({
      event: "webrtc_signal",
      to: pcRef.current_from,
      group_id: pcRef.current_group_id,
      signal: { type: 'answer', sdp: answer.sdp }
    });

    // Process any queued candidates that arrived before acceptance
    iceCandidatesQueue.current.forEach(cand => {
      pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.error("Error adding queued candidate", e));
    });
    iceCandidatesQueue.current = [];

    setCallStatus('active');
  };

  const endCall = () => {
    if (pcRef.current) pcRef.current.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
  };

  // ── Fetch Initial Data ──
  const fetchConversations = async () => {
    try {
      const data = await api('/chat/conversations');
      setConversations(data);
      if (selectedConvo) {
        const updated = data.find(c => c.id === selectedConvo.id);
        if (updated) setSelectedConvo(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      console.error('Failed to fetch convos:', err);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const data = await api('/chat/connection-requests');
      setPendingRequests(data.incoming || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  };

  useEffect(() => {
    async function init() {
      if (!user) return;
      setLoading(true);
      await Promise.all([fetchConversations(), fetchPendingRequests()]);
      setLoading(false);
    }
    init();
  }, [user]);

  // ── Global User Search ──
  useEffect(() => {
    if (activeTab !== 'contacts' || searchQuery.length < 2) {
      setGlobalUsers([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await api(`/chat/users?q=${searchQuery}`);
        setGlobalUsers(data);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeTab]);

  // ── Fetch Messages when convo changes ──
  useEffect(() => {
    async function fetchMessages() {
      if (!selectedConvo) return;
      try {
        const data = await api(`/chat/messages/${selectedConvo.id}`);
        setMessages(data);
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    }
    fetchMessages();
  }, [selectedConvo?.id]);

  // ── Handle incoming WebSocket events ──
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.event === 'new_message') {
      const msg = lastMessage.message;
      const isCurrentConvo = selectedConvo && (
        (msg.group_id && msg.group_id === selectedConvo.id) ||
        (!msg.group_id && (msg.sender_id === selectedConvo.id || msg.receiver_id === selectedConvo.id))
      );

      if (isCurrentConvo) {
        setMessages((prev) => {
          const exists = prev.some(m => m.id === msg.id);
          if (exists) return prev;
          return [...prev, msg];
        });
      }
      fetchConversations();
    }
    else if (lastMessage.event === 'new_group') {
      fetchConversations();
    }
    else if (lastMessage.event === 'new_connection_request') {
      fetchPendingRequests();
    }
    else if (lastMessage.event === 'connection_accepted') {
      fetchConversations();
    }
    else if (lastMessage.event === 'message_reacted') {
      const { message_id, reactions } = lastMessage;
      setMessages(prev => prev.map(m =>
        m.id === message_id ? { ...m, reactions } : m
      ));
    }
    else if (lastMessage.event === 'user_presence') {
      const { user_id, status } = lastMessage;
      setConversations(prev => prev.map(c =>
        c.id === user_id ? { ...c, is_online: status === 'online' } : c
      ));
      if (selectedConvo?.id === user_id) {
        setSelectedConvo(prev => ({ ...prev, is_online: status === 'online' }));
      }
    }
    else if (lastMessage.event === 'webrtc_signal') {
      const { from, signal, group_id } = lastMessage;
      if (signal.type === 'offer') {
        handleIncomingCall(from, signal, group_id);
      } else if (signal.type === 'answer') {
        if (pcRef.current) {
          pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          // Process queued candidates
          iceCandidatesQueue.current.forEach(cand => {
            pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.error("Error adding queued candidate", e));
          });
          iceCandidatesQueue.current = [];
        }
      } else if (signal.type === 'candidate') {
        if (pcRef.current && pcRef.current.remoteDescription) {
          pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.error("Error adding candidate", e));
        } else {
          iceCandidatesQueue.current.push(signal.candidate);
        }
      }
    }
  }, [lastMessage, selectedConvo?.id, callStatus]);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Filtering Conversations (Search) ──
  const filteredConvos = useMemo(() => {
    if (activeTab !== 'chats') return [];
    return conversations.filter(c =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.mobile?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery, activeTab]);

  const handleSendMessage = async (e, type = 'text', contentString = null) => {
    if (e) e.preventDefault();
    if (!selectedConvo) return;

    const content = contentString || newMessage.trim();
    if (type === 'text' && !content) return;
    if (type === 'text') setNewMessage('');

    const now = new Date().toISOString();
    const tempId = 'temp-' + Date.now();

    const tempMsg = {
      id: tempId,
      sender_id: user.id,
      receiver_id: selectedConvo.type === 'private' ? selectedConvo.id : null,
      group_id: selectedConvo.type === 'group' ? selectedConvo.id : null,
      content: content,
      type: type,
      created_at: now,
      status: 'sending'
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const sentMsg = await api('/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: selectedConvo.type === 'private' ? selectedConvo.id : null,
          group_id: selectedConvo.type === 'group' ? selectedConvo.id : null,
          content: content,
          type: type
        })
      });

      setMessages(prev => prev.map(m => m.id === tempId ? { ...sentMsg, status: 'sent' } : m));
      fetchConversations();
    } catch (err) {
      console.error('Send failed:', err);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const toggleMemberSelection = (u) => {
    setSelectedMembers(prev => {
      const exists = prev.find(m => m.id === u.id);
      if (exists) return prev.filter(m => m.id !== u.id);
      return [...prev, u];
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    try {
      const g = await api('/chat/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: groupName,
          members: selectedMembers.map(m => m.id)
        })
      });
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedMembers([]);
      fetchConversations();
      setSelectedConvo({ ...g, type: 'group' });
    } catch (err) {
      alert('Failed to create group');
    }
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    setAttachmentMenu(false);

    // 1. Upload file
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { url } = await api('/chat/upload', {
        method: 'POST',
        body: formData
      });

      // 2. Send message with URL
      await handleSendMessage(null, type, url);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };

  const handleShareLocation = () => {
    setAttachmentMenu(false);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locationJson = JSON.stringify({ lat: latitude, lng: longitude });
        handleSendMessage(null, 'location', locationJson);
      },
      () => {
        alert('Unable to retrieve your location');
      }
    );
  };

  const handleShareContact = (targetUser) => {
    setShowContactPicker(false);
    const contactJson = JSON.stringify({
      id: targetUser.id,
      name: targetUser.name,
      mobile: targetUser.mobile,
      avatar: targetUser.avatar
    });
    handleSendMessage(null, 'contact', contactJson);
  };

  const handleConnect = async (targetUserId) => {
    try {
      await api('/chat/connection-request', {
        method: 'POST',
        body: JSON.stringify({ to_user_id: targetUserId })
      });
      const data = await api(`/chat/users?q=${searchQuery}`);
      setGlobalUsers(data);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAcceptRequest = async (requestId, fromUser) => {
    try {
      await api(`/chat/connection-request/${requestId}/accept`, { method: 'POST' });
      await Promise.all([fetchConversations(), fetchPendingRequests()]);

      const newConvo = {
        id: fromUser.id,
        name: fromUser.name,
        avatar: fromUser.avatar,
        mobile: fromUser.mobile,
        is_online: true,
        type: 'private'
      };
      setSelectedConvo(newConvo);
      setActiveTab('chats');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMessageAction = (e, messageId) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setReactionMenu({
      messageId,
      x: rect.left + rect.width / 2,
      y: rect.top - 40
    });
  };

  const addReaction = async (emoji) => {
    if (!reactionMenu) return;
    const { messageId } = reactionMenu;
    setReactionMenu(null);

    try {
      const data = await api(`/chat/messages/${messageId}/react?emoji=${encodeURIComponent(emoji)}`, {
        method: 'POST'
      });
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, reactions: data.reactions } : m
      ));
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  };

  const renderMessageContent = (msg) => {
    switch (msg.type) {
      case 'image':
        return (
          <div className="media-container">
            <img src={`${BASE_URL}${msg.content}`} className="message-image" alt="Shared" />
            <a href={`${BASE_URL}${msg.content}`} download className="btn-download" title="Download">⬇️</a>
          </div>
        );
      case 'video':
        return (
          <div className="media-container">
            <video controls className="message-video">
              <source src={`${BASE_URL}${msg.content}`} />
              Your browser does not support the video tag.
            </video>
            <a href={`${BASE_URL}${msg.content}`} download className="btn-download" title="Download">⬇️</a>
          </div>
        );
      case 'location':
        try {
          const loc = JSON.parse(msg.content);
          const mapUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
          return (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="message-location">
              <div className="location-icon">📍</div>
              <div className="location-text">
                <strong>Current Location</strong>
                <span>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
              </div>
            </a>
          );
        } catch (_) { return msg.content; }
      case 'contact':
        try {
          const contact = JSON.parse(msg.content);
          return (
            <div className="message-contact">
              <img src={contact.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} alt={contact.name} />
              <div className="contact-info">
                <strong>{contact.name}</strong>
                <span>{contact.mobile}</span>
              </div>
              <button
                className="btn-chat-contact"
                onClick={() => {
                  const existing = conversations.find(c => c.id === contact.id);
                  if (existing) setSelectedConvo(existing);
                  else setSelectedConvo({ ...contact, is_online: false, type: 'private' });
                }}
              >
                Message
              </button>
            </div>
          );
        } catch (_) { return msg.content; }
      default:
        return <div className="message-text">{msg.content}</div>;
    }
  };

  if (loading) return <div className="app-loading">Loading PyChat...</div>;

  return (
    <div className={`chat-layout ${selectedConvo ? 'chat-selected' : ''}`} onClick={() => { setReactionMenu(null); setAttachmentMenu(false); }}>

      {/* ── Sidebar ── */}
      <aside className="chat-sidebar">
        <header className="sidebar-header">
          <div className="sidebar-user">
            <img
              src={user?.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}
              className="sidebar-avatar"
              alt="Profile"
            />
            <button className="btn-icon btn-new-group-plus" title="New Group" onClick={() => setShowCreateGroup(true)}>➕</button>
          </div>
          <div className="sidebar-header-actions">
            <button
              className={`btn-icon ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => { setActiveTab('chats'); setSearchQuery(''); }}
            >
              💬
            </button>
            <button
              className={`btn-icon ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => { setActiveTab('contacts'); setSearchQuery(''); }}
            >
              👥
            </button>
            <button
              className={`btn-icon ${activeTab === 'requests' ? 'active' : ''} btn-requests-tab`}
              onClick={() => { setActiveTab('requests'); setSearchQuery(''); }}
            >
              📩
              {pendingRequests.length > 0 && <span className="tab-badge">{pendingRequests.length}</span>}
            </button>
            <button className="btn-icon" onClick={logout}>🚪</button>
          </div>
        </header>

        <div className="sidebar-search">
          <div className="search-input-wrap">
            <span>🔍</span>
            <input
              type="text"
              placeholder={activeTab === 'chats' ? "Search chats" : "Search mobile or name"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-section-title">
            {activeTab === 'chats' ? 'RECENT CHATS' : activeTab === 'contacts' ? 'FIND PEOPLE' : 'PENDING REQUESTS'}
          </div>

          {activeTab === 'chats' && (
            filteredConvos.length > 0 ? (
              filteredConvos.map((convo) => (
                <button
                  key={convo.id}
                  className={`convo-item ${selectedConvo?.id === convo.id ? 'active' : ''}`}
                  onClick={() => setSelectedConvo(convo)}
                >
                  <div className="avatar-wrap">
                    <img src={convo.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} className="convo-avatar" alt={convo.name} />
                    {convo.is_online && <span className="online-dot"></span>}
                  </div>
                  <div className="convo-info">
                    <div className="convo-name-wrap">
                      <span className="convo-name">{convo.name || convo.mobile}</span>
                      <span className="convo-time">{convo.last_at ? formatTime(convo.last_at) : ''}</span>
                    </div>
                    <div className="convo-preview-wrap">
                      <span className="convo-preview">{convo.last_message || 'No messages yet'}</span>
                      {convo.unread_count > 0 && <span className="unread-badge">{convo.unread_count}</span>}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <p className="no-results">No chats found</p>
            )
          )}

          {activeTab === 'contacts' && (
            searchQuery.length < 2 ? (
              <p className="no-results">Type at least 2 characters to search</p>
            ) : globalUsers.map((u) => (
              <div key={u.id} className="convo-item contact-item">
                <img src={u.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} className="convo-avatar" alt={u.name} />
                <div className="convo-info">
                  <div className="convo-name-wrap"><span className="convo-name">{u.name}</span></div>
                  <div className="convo-preview">{u.mobile}</div>
                </div>
                <div className="contact-actions">
                  {u.connection_status === 'none' && <button className="btn-connect" onClick={() => handleConnect(u.id)}>Connect</button>}
                  {u.connection_status === 'pending_sent' && <span className="status-label">Requested</span>}
                  {u.connection_status === 'pending_received' && <span className="status-label">Accept in Requests</span>}
                  {u.connection_status === 'connected' && (
                    <button className="btn-chat-now" onClick={() => { setActiveTab('chats'); setSelectedConvo({ ...u, type: 'private' }); }}>Chat</button>
                  )}
                </div>
              </div>
            ))
          )}

          {activeTab === 'requests' && (
            pendingRequests.length === 0 ? (
              <p className="no-results">No pending requests</p>
            ) : (
              pendingRequests.map((req) => (
                <div key={req.id} className="convo-item contact-item">
                  <img src={req.from_user.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} className="convo-avatar" alt={req.from_user.name} />
                  <div className="convo-info">
                    <div className="convo-name-wrap"><span className="convo-name">{req.from_user.name}</span></div>
                    <div className="convo-preview">{req.from_user.mobile}</div>
                  </div>
                  <div className="contact-actions">
                    <button className="btn-connect" onClick={() => handleAcceptRequest(req.id, req.from_user)}>Accept</button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </aside>

      {/* ── Main Chat ── */}
      <main className="chat-main">
        {selectedConvo ? (
          <>
            <header className="chat-header">
              <button className="btn-icon btn-back" onClick={() => setSelectedConvo(null)}>←</button>
              <div className="avatar-wrap">
                <img src={selectedConvo.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} className="convo-avatar" alt={selectedConvo.name} />
                {selectedConvo.is_online && <span className="online-dot"></span>}
              </div>
              <div className="chat-header-info">
                <span className="chat-header-name">{selectedConvo.name || selectedConvo.mobile}</span>
                <span className="chat-header-status">
                  {selectedConvo.type === 'group' ? `${selectedConvo.members_count || 0} members` : (selectedConvo.is_online ? 'online' : 'offline')}
                </span>
              </div>
              <div className="sidebar-header-actions">
                <button className="btn-icon" title="Video Call" onClick={initiateCall}>📹</button>
                <button className="btn-icon" title="Voice Call">📞</button>
                <button className="btn-icon">🔍</button>
                <button className="btn-icon">⋮</button>
              </div>
            </header>

            <div className="chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-wrap ${msg.sender_id === user.id ? 'sent' : 'received'} ${msg.status === 'sending' ? 'msg-sending' : ''} type-${msg.type}`}
                  onContextMenu={(e) => handleMessageAction(e, msg.id)}
                >
                  <div className="message-bubble">
                    <div className="message-content-wrap">
                      {renderMessageContent(msg)}
                    </div>

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="message-reactions">
                        {Object.values(msg.reactions).map((emoji, idx) => (
                          <span key={idx} className="reaction-emoji">{emoji}</span>
                        ))}
                      </div>
                    )}

                    <div className="message-meta">
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                      {msg.sender_id === user.id && (
                        <span className={`message-status ${msg.status || ''}`}>
                          {msg.status === 'sending' ? '🕒' : msg.status === 'failed' ? '⚠️' : '✓✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={(e) => handleSendMessage(e)}>
              <div className="input-actions">
                <button type="button" className="btn-icon">😊</button>
                <div className="attachment-wrap">
                  <button
                    type="button"
                    className={`btn-icon ${attachmentMenu ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setAttachmentMenu(!attachmentMenu); }}
                  >
                    📎
                  </button>
                  {attachmentMenu && (
                    <div className="attachment-menu" onClick={(e) => e.stopPropagation()}>
                      <button className="attach-btn" onClick={() => fileInputRef.current.click()}>
                        <span className="attach-icon image">🖼️</span>
                        <span>Gallery</span>
                      </button>
                      <button className="attach-btn" onClick={() => videoInputRef.current.click()}>
                        <span className="attach-icon video">📹</span>
                        <span>Video</span>
                      </button>
                      <button className="attach-btn" onClick={handleShareLocation}>
                        <span className="attach-icon location">📍</span>
                        <span>Location</span>
                      </button>
                      <button className="attach-btn" onClick={() => setShowContactPicker(true)}>
                        <span className="attach-icon contact">👤</span>
                        <span>Contact</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="chat-input-wrap">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Type a message"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-send" disabled={!newMessage.trim()}>
                {newMessage.trim() ? '➤' : '🎤'}
              </button>

              <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
              <input type="file" hidden ref={videoInputRef} accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} />
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <div className="empty-icon">📱</div>
            <h1 className="empty-title">PyChat Web</h1>
            <p className="empty-text">
              Send and receive messages without keeping your phone online. <br />
              Use PyChat on up to 4 linked devices and 1 phone at the same time.
            </p>
          </div>
        )}

        {/* Reaction Menu Overlay */}
        {reactionMenu && (
          <div
            className="reaction-menu"
            style={{ left: reactionMenu.x, top: reactionMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {REACTION_EMOJIS.map(emoji => (
              <button key={emoji} onClick={() => addReaction(emoji)}>{emoji}</button>
            ))}
          </div>
        )}

        {/* Contact Picker Modal */}
        {showContactPicker && (
          <div className="contact-picker-overlay" onClick={() => setShowContactPicker(false)}>
            <div className="contact-picker-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Share Contact</h3>
                <button onClick={() => setShowContactPicker(false)}>✕</button>
              </div>
              <div className="modal-body">
                {conversations.map(c => (
                  <button key={c.id} className="picker-item" onClick={() => handleShareContact(c)}>
                    <img src={c.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} alt={c.name} />
                    <strong>{c.name}</strong>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
      {/* ── Group Creation Modal ── */}
      {showCreateGroup && (
        <div className="contact-picker-overlay">
          <div className="contact-picker-modal">
            <div className="modal-header">
              <h3>Create New Group</h3>
              <button className="btn-icon" onClick={() => setShowCreateGroup(false)}>✕</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                className="group-name-input"
                placeholder="Group Name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <div className="member-selection-list">
                <p className="section-label">Select Members</p>
                {conversations.filter(c => c.type === 'private').map(u => (
                  <div
                    key={u.id}
                    className={`picker-item ${selectedMembers.find(m => m.id === u.id) ? 'selected' : ''}`}
                    onClick={() => toggleMemberSelection(u)}
                  >
                    <img src={u.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'} alt={u.name} />
                    <div className="convo-info">
                      <div className="convo-name">{u.name}</div>
                    </div>
                    <div className="selection-check">
                      {selectedMembers.find(m => m.id === u.id) ? '✅' : '○'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-create-final"
                disabled={!groupName.trim() || selectedMembers.length === 0}
                onClick={handleCreateGroup}
              >
                Create Group ({selectedMembers.length})
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Call Overlay ── */}
      {callStatus !== 'idle' && (
        <CallOverlay
          onEnd={endCall}
          localStream={localStream}
          remoteStream={remoteStream}
          isIncoming={callStatus === 'incoming'}
          onAccept={acceptCall}
          callerName={
            callStatus === 'incoming'
              ? (conversations.find(c => c.id === pcRef.current_from)?.name || 'User')
              : (selectedConvo?.name || 'User')
          }
        />
      )}
    </div>
  );
}
