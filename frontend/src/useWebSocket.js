import { useEffect, useRef, useCallback } from 'react';

function getWsUrl() {
  const base = window.location.origin.replace(/^http/, 'ws');
  const path = '/api/ws';
  return `${base}${path}`;
}

export function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!token) return;
    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => {};
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

  return { ws: wsRef.current };
}
