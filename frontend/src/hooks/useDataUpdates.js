import { useEffect, useRef, useCallback, useState } from 'react';

const API = `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api`;

export function useDataUpdates(onDataUpdate) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
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
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  return { isConnected };
}

export default useDataUpdates;
