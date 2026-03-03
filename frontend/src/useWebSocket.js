import { useEffect, useRef, useState, useCallback } from 'react';

function getWsUrl() {
  const base = window.location.origin.replace(/^http/, 'ws');
  const path = '/api/ws';
  return `${base}${path}`;
}

export default function useWebSocket(token) {
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const connect = useCallback(() => {
    if (!token) {
      console.log('WS: No token, skipping connection');
      return;
    }
    const wsUrl = getWsUrl();
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
    console.log('WS: Connecting to', wsUrl);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WS: Connection Established ✅');
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS: Received Event 📩', data.event, data);
        setLastMessage(data);
      } catch (err) {
        console.error('WS: Parse Error ❌', err);
      }
    };

    ws.onclose = (event) => {
      console.log('WS: Disconnected ⚠️', event.code, event.reason);
      wsRef.current = null;
      // Reconnect after 3 seconds
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.error('WS not connected');
    }
  }, []);

  return { lastMessage, sendMessage, ws: wsRef.current };
}
