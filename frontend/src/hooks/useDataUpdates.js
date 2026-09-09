import { useEffect, useRef, useCallback, useState } from 'react';

const API = `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api`;

export function useDataUpdates(onDataUpdate) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = `${API.replace('http', 'ws')}/ws/data/${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[DataUpdates] Connected to WebSocket');
      setIsConnected(true);
      // Keep the connection alive - matches the chat socket's heartbeat so
      // this channel doesn't get dropped as idle by a proxy/browser.
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 60000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[DataUpdates] Received:', message.type);
        
        // Call the callback with the message
        if (onDataUpdate) {
          onDataUpdate(message);
        }
      } catch (error) {
        console.error('[DataUpdates] Error parsing message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('[DataUpdates] WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Attempt to reconnect after 3 seconds if not a clean close
      if (event.code !== 1000) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[DataUpdates] Attempting to reconnect...');
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('[DataUpdates] WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [onDataUpdate]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  return { isConnected };
}

export default useDataUpdates;
