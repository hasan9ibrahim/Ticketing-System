import { useEffect, useRef, useCallback } from "react";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

export function useChatSocket(onMessage, onReconnect) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const hasConnectedBeforeRef = useRef(false);

  // Refs to the latest callbacks - the socket itself is only ever set up
  // once per mount, but dispatching through a ref means it always runs the
  // current render's closure (current activeChat/openChats/conversations)
  // instead of whatever they were when the effect first ran. That staleness
  // was the root cause of unread counts, focus detection and toasts going
  // stale after the very first message.
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    let cancelled = false;
    const wsUrl = `${API.replace(/^http/, "ws")}/ws/chat/${token}`;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        if (hasConnectedBeforeRef.current) {
          console.log("[Chat] WebSocket reconnected - resyncing");
          onReconnectRef.current?.();
        } else {
          console.log("[Chat] WebSocket connected");
        }
        hasConnectedBeforeRef.current = true;
      };

      ws.onmessage = (event) => {
        try {
          onMessageRef.current?.(JSON.parse(event.data));
        } catch (error) {
          console.error("[Chat] Failed to parse WebSocket message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("[Chat] WebSocket closed:", event.code, event.reason);
        if (cancelled) return;
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(3000 * attempt, 15000);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (error) => {
        console.error("[Chat] WebSocket error:", error);
      };
    };

    connect();

    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(1000, "unmounting");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  return { send };
}

export default useChatSocket;
