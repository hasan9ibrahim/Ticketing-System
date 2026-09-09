import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, Paperclip, Image as ImageIcon, Users, Plus, Check, CheckCheck, Info, LogOut, Smile, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import MultiSelect from "@/components/custom/MultiSelect";
import axios from "axios";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

// A small curated set rather than a full emoji library/dependency - covers
// the common reactions people actually reach for in a work chat.
const EMOJI_OPTIONS = [
  "😀", "😂", "😅", "🙂", "😉", "😊", "😍", "😘", "🤔", "😎",
  "😴", "😢", "😭", "😡", "😱", "🤗", "🤝", "👋", "👍", "👎",
  "👏", "🙏", "💪", "🎉", "🔥", "❤️", "💯", "✅", "❌", "⚠️",
  "📌", "📎", "📷", "🚀", "⭐", "✨", "💡", "😇", "🥳", "🎊",
];

const API = `${process.env.REACT_APP_API_URL}/api`;
// Derive the WebSocket origin from the API URL (http->ws, https->wss) instead
// of relying on a separate REACT_APP_WS_URL env var, which isn't set in
// production and would silently fall back to a dead ws://localhost:8000.
const WS_BASE = (process.env.REACT_APP_API_URL || "http://localhost:8000").replace(/^http/, "ws");

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

// "Active now" / "Active 5m ago" / "Last seen yesterday" style presence text,
// the way Facebook/WhatsApp show it.
const formatPresence = (isOnline, lastActive) => {
  if (isOnline) return "Active now";
  if (!lastActive) return "Offline";
  let dateStr = lastActive;
  if (!dateStr.endsWith("Z") && !dateStr.includes("+")) dateStr = dateStr + "Z";
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  if (isNaN(diff)) return "Offline";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Active now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days}d ago`;
  return `Last seen ${date.toLocaleDateString()}`;
};

// A group's own name, or a DM partner's name/username.
const chatTitle = (chat) => {
  if (chat.is_group) return chat.name || "Group";
  return chat.participant?.name || chat.participant?.username || "Unknown";
};

export default function Chat({ user, openChats, setOpenChats, activeChat, setActiveChat }) {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [minimized, setMinimized] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Get token
  const token = localStorage.getItem("token");
  const wsRef = useRef(null);
  const wsConnectedRef = useRef(false);

  // Ref to store callback for direct message addition in ChatWindowView
  const messageSentRef = useRef(null);

  // Function for ChatWindowView to register its callback
  const registerMessageCallback = useCallback((callback) => {
    messageSentRef.current = callback;
  }, []);

  // Ref for swapping a just-sent message's temporary local id for its real,
  // server-assigned one once the POST resolves. This can't be left to the
  // WebSocket echo alone (isOwnMessageEcho in handleNewMessage) - if the
  // socket is down or the echo is missed, the message keeps a fake id
  // forever and editing/deleting it 404s against the backend.
  const messageConfirmedRef = useRef(null);
  const registerMessageConfirmedCallback = useCallback((callback) => {
    messageConfirmedRef.current = callback;
  }, []);

  // Ask for OS notification permission once, so an incoming message can
  // raise a native notification when the browser tab itself isn't visible
  // (not just the chat widget being minimized, which the in-app toast covers).
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Native OS notification, for when the browser tab itself isn't visible
  // (an in-app toast wouldn't be seen at all in that case).
  const showNativeNotification = (title, body) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch (error) {
      // Ignore - notification is a nice-to-have, never worth failing chat over
    }
  };

  // WebSocket for real-time chat
  useEffect(() => {
    if (!token || !user?.id) return;

    // Connect to WebSocket
    const wsUrl = `${WS_BASE}/api/ws/chat/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      wsConnectedRef.current = true;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      wsConnectedRef.current = false;
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (!wsConnectedRef.current && token && user?.id) {
          const reconnectWs = new WebSocket(wsUrl);
          wsRef.current = reconnectWs;
        }
      }, 3000);
    };

    // Heartbeat so "last active"/online status stays fresh while the tab is
    // open even if the user isn't triggering any HTTP requests.
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 60000);

    return () => {
      clearInterval(heartbeat);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [token, user?.id]);

  // Send message via WebSocket
  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case "new_message":
        handleNewMessage(data.message);
        break;
      case "typing":
        handleTyping(data);
        break;
      case "message_read":
        handleMessageRead(data);
        break;
      case "group_updated":
        handleGroupUpdated(data);
        break;
      case "message_edited":
        handleMessageEdited(data);
        break;
      case "message_deleted":
        handleMessageDeleted(data);
        break;
      case "conversation_cleared":
        handleConversationCleared(data);
        break;
      default:
        break;
    }
  };

  // Apply a field update to one message across activeChat/openChats
  const patchMessage = (conversationId, messageId, patch) => {
    const apply = (msgs) => (msgs || []).map((m) => (m.id === messageId ? { ...m, ...patch } : m));
    setActiveChat((prev) =>
      prev && prev.conversation_id === conversationId ? { ...prev, messages: apply(prev.messages) } : prev
    );
    setOpenChats((prev) =>
      prev.map((c) => (c.conversation_id === conversationId ? { ...c, messages: apply(c.messages) } : c))
    );
  };

  const handleMessageEdited = (data) => {
    patchMessage(data.conversation_id, data.message_id, { content: data.content, edited: true, edited_at: data.edited_at });
  };

  const handleMessageDeleted = (data) => {
    patchMessage(data.conversation_id, data.message_id, { is_deleted: true, content: "", file_url: null, file_name: null });
  };

  // Empty out a conversation's messages - used both right after we clear it
  // ourselves and when the WS tells us the other participant cleared it.
  // clearedAt (rather than just messages: []) is what ChatWindowView
  // actually watches, since replacing an already-empty array wouldn't
  // otherwise be a detectable change.
  const resetConversationMessages = (conversationId) => {
    const clearedAt = Date.now();
    setActiveChat((prev) =>
      prev && prev.conversation_id === conversationId ? { ...prev, messages: [], clearedAt } : prev
    );
    setOpenChats((prev) =>
      prev.map((c) => (c.conversation_id === conversationId ? { ...c, messages: [], clearedAt } : c))
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, last_message: null, last_message_time: null, unread_count: 0 } : c
      )
    );
  };

  const handleConversationCleared = (data) => {
    resetConversationMessages(data.conversation_id);
  };

  // A group's name/membership changed (or it was disbanded by the last
  // member leaving) - refresh it, or close the window if we were removed.
  const handleGroupUpdated = async (data) => {
    const { conversation_id, participant_ids } = data;
    const stillMember = !participant_ids || participant_ids.includes(user?.id);
    if (!stillMember) {
      setOpenChats((prev) => prev.filter((c) => c.conversation_id !== conversation_id));
      setActiveChat((prev) => (prev?.conversation_id === conversation_id ? null : prev));
      setConversations((prev) => prev.filter((c) => c.id !== conversation_id));
      return;
    }
    try {
      const response = await axios.get(`${API}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(response.data);
      const fresh = response.data.find((c) => c.id === conversation_id);
      if (fresh) {
        setOpenChats((prev) => prev.map((c) =>
          c.conversation_id === conversation_id ? { ...c, name: fresh.name, participants: fresh.participants } : c
        ));
        setActiveChat((prev) =>
          prev?.conversation_id === conversation_id ? { ...prev, name: fresh.name, participants: fresh.participants } : prev
        );
      }
    } catch (error) {
      console.error("Error refreshing group:", error);
    }
  };

  const handleNewMessage = (message) => {
    // Prevent duplicate messages - check if message already exists by ID or by content+sender+time
    const isDuplicate = (msg) => {
      // Check by ID first - handle both string and number IDs
      if (String(msg.id) === String(message.id)) return true;
      // Check for duplicate local messages (within 5 seconds) - same sender, same conversation, same content
      const msgTime = new Date(msg.created_at).getTime();
      const newMsgTime = new Date(message.created_at).getTime();
      const timeDiff = Math.abs(msgTime - newMsgTime);
      // Also check if it's the same message based on content + sender + conversation
      return (
        msg.sender_id === message.sender_id &&
        msg.conversation_id === message.conversation_id &&
        msg.content === message.content &&
        timeDiff < 5000 // Within 5 seconds
      );
    };

    // Check if this is an echo of our own message (sent by us, within last 5 seconds)
    // If so, we want to replace the local temp message with the server's version
    const isOwnMessageEcho = () => {
      const msgTime = new Date(message.created_at).getTime();
      const now = Date.now();
      const timeDiff = Math.abs(msgTime - now);
      return (
        message.sender_id === user?.id &&
        timeDiff < 10000 // Within 10 seconds
      );
    };

    // Add message to the conversation if it's open
    if (activeChat && message.conversation_id === activeChat.conversation_id) {
      setActiveChat((prev) => {
        // Check if message already exists
        const exists = (prev.messages || []).some(isDuplicate);
        if (exists) {
          // Check if this is an echo of our own message - replace the temp message with server version
          if (isOwnMessageEcho()) {
            const updatedMessages = (prev.messages || []).map((msg) => {
              // Find the local message that matches this server message
              const isLocalVersion = (
                msg.sender_id === message.sender_id &&
                msg.conversation_id === message.conversation_id &&
                msg.content === message.content &&
                !msg.id?.includes('-') // Local temp IDs are numeric strings, server IDs are UUIDs
              );
              if (isLocalVersion) {
                return message; // Replace with server version
              }
              return msg;
            });
            return { ...prev, messages: updatedMessages };
          }
          return prev;
        }
        return {
          ...prev,
          messages: [...(prev.messages || []), message],
        };
      });
    }

    // Also update the message in openChats for consistency
    setOpenChats((prev) =>
      prev.map((chat) => {
        if (chat.conversation_id === message.conversation_id) {
          // Check if message already exists
          const exists = (chat.messages || []).some(isDuplicate);
          if (exists) {
            // Check if this is an echo of our own message
            if (isOwnMessageEcho()) {
              const updatedMessages = (chat.messages || []).map((msg) => {
                const isLocalVersion = (
                  msg.sender_id === message.sender_id &&
                  msg.conversation_id === message.conversation_id &&
                  msg.content === message.content &&
                  !msg.id?.includes('-')
                );
                if (isLocalVersion) {
                  return message;
                }
                return msg;
              });
              return { ...chat, messages: updatedMessages };
            }
            return chat;
          }
          return {
            ...chat,
            messages: [...(chat.messages || []), message],
          };
        }
        return chat;
      })
    );

    // Update conversations list - don't increment unread count for own messages
    const isOwnMessage = message.sender_id === user?.id;
    setConversations((prev) => {
      return prev.map((conv) => {
        if (conv.id === message.conversation_id) {
          return {
            ...conv,
            last_message: message.content,
            last_message_time: message.created_at,
            last_message_sender_id: message.sender_id,
            unread_count: isOwnMessage || activeChat?.conversation_id === message.conversation_id
              ? 0
              : (conv.unread_count || 0) + 1,
          };
        }
        return conv;
      });
    });

    // Toast + sound (+ native notification if the tab itself isn't visible)
    // for messages arriving in a conversation whose window isn't open and
    // expanded right now - mirrors how FB/WhatsApp/Teams surface a message
    // you'd otherwise miss.
    if (!isOwnMessage) {
      const windowChat = openChats.find((c) => c.conversation_id === message.conversation_id);
      const isFocused = windowChat && !windowChat.minimized;
      if (!isFocused) {
        const preview = message.message_type === "image" ? "📷 Photo" : message.message_type === "file" ? `📎 ${message.file_name || "File"}` : message.content;
        const convForToast = conversations.find((c) => c.id === message.conversation_id);
        toast(message.sender_name || "New message", {
          description: preview,
          action: convForToast ? { label: "Open", onClick: () => openConversationWindow(convForToast) } : undefined,
        });
        playNotificationSound();
        if (document.hidden) {
          showNativeNotification(message.sender_name || "New message", preview);
        }
      }
    }
  };

  const handleTyping = (data) => {
    setTypingUsers((prev) => ({
      ...prev,
      [data.conversation_id]: data,
    }));

    // Clear typing after 3 seconds
    setTimeout(() => {
      setTypingUsers((prev) => {
        const newState = { ...prev };
        delete newState[data.conversation_id];
        return newState;
      });
    }, 3000);
  };

  const handleMessageRead = (data) => {
    // Someone (data.read_by) read the conversation - record them as a
    // reader on every message NOT authored by them (matches the backend's
    // "read by anyone but the sender" semantics, and keeps read_by - which
    // drives the per-message tick/receipt UI - live instead of only is_read).
    const addReader = (msg) => {
      if (msg.sender_id === data.read_by) return msg;
      const currentReadBy = msg.read_by || [];
      if (currentReadBy.includes(data.read_by)) return msg;
      return { ...msg, is_read: true, read_by: [...currentReadBy, data.read_by] };
    };

    if (activeChat && data.conversation_id === activeChat.conversation_id) {
      setActiveChat((prev) => ({
        ...prev,
        messages: prev.messages?.map(addReader) || [],
      }));
    }

    // Also update messages in openChats for consistency
    setOpenChats((prev) =>
      prev.map((chat) => {
        if (chat.conversation_id === data.conversation_id) {
          return {
            ...chat,
            messages: chat.messages?.map(addReader) || [],
          };
        }
        return chat;
      })
    );

    // Also update conversations list to reset unread count
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === data.conversation_id) {
          return { ...conv, unread_count: 0 };
        }
        return conv;
      })
    );
  };

  // Fetch conversations and users
  useEffect(() => {
    if (token) {
      fetchConversations();
      fetchUsers();
    }
  }, [token]);

  // Periodic refresh for online status. New messages/read-receipts already
  // arrive over the WebSocket above, so this poll only exists to refresh
  // participants' online/offline indicator - only worth doing while the chat
  // panel is actually open and the tab is in the foreground, and every 60s
  // is plenty for a presence indicator (was every 30s regardless of state).
  useEffect(() => {
    if (!token || minimized) return;

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchConversations();
        fetchUsers();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [token, minimized]);

  const fetchConversations = async () => {
    try {
      const response = await axios.get(`${API}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Merge API response with existing local state to preserve local changes (like unread_count: 0)
      const apiConversations = response.data;
      setConversations(prevConversations => {
        // Create a map of existing conversations for quick lookup
        const existingConvMap = new Map(prevConversations.map(c => [c.id, c]));

        // Merge: use API data but preserve local unread_count if it's 0 (meaning user already read)
        return apiConversations.map(apiConv => {
          const existingConv = existingConvMap.get(apiConv.id);
          if (existingConv && existingConv.unread_count === 0) {
            // Preserve local unread_count: 0
            return { ...apiConv, unread_count: 0 };
          }
          return apiConv;
        });
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/chat/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Open (or focus, if already open) a floating window for a conversation
  // returned by the API - used for a freshly-started DM, a freshly-created
  // group, and clicking an existing conversation in the list.
  const openConversationWindow = (conv) => {
    const existingChat = openChats.find((c) => c.conversation_id === conv.id);
    if (existingChat) {
      if (existingChat.minimized) {
        setOpenChats((prev) => prev.map((chat) =>
          chat.conversation_id === conv.id ? { ...chat, minimized: false } : chat
        ));
      }
      setActiveChat(existingChat);
      return;
    }

    const newChat = {
      conversation_id: conv.id,
      is_group: !!conv.is_group,
      name: conv.name || null,
      participants: conv.participants || [],
      participant: conv.participants?.[0] || null,
      messages: [],
      unreadCount: conv.unread_count || 0,
      minimized: false,
    };
    setOpenChats((prev) => [...prev, newChat]);
    setActiveChat(newChat);
  };

  const startConversation = async (otherUser) => {
    try {
      const response = await axios.post(
        `${API}/chat/conversations`,
        { participant_id: otherUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openConversationWindow(response.data);
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const createGroup = async (name, participantIds) => {
    const response = await axios.post(
      `${API}/chat/conversations/group`,
      { name, participant_ids: participantIds },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setConversations((prev) => [response.data, ...prev]);
    openConversationWindow(response.data);
    setNewGroupOpen(false);
  };

  const updateGroup = async (conversationId, name, participantIds) => {
    const response = await axios.put(
      `${API}/chat/conversations/${conversationId}/group`,
      { name, participant_ids: participantIds },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const updated = response.data;
    setOpenChats((prev) => prev.map((c) =>
      c.conversation_id === conversationId ? { ...c, name: updated.name, participants: updated.participants } : c
    ));
    setActiveChat((prev) =>
      prev?.conversation_id === conversationId ? { ...prev, name: updated.name, participants: updated.participants } : prev
    );
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, ...updated } : c)));
  };

  const leaveGroup = async (conversationId) => {
    await axios.post(
      `${API}/chat/conversations/${conversationId}/leave`,
      null,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setOpenChats((prev) => prev.filter((c) => c.conversation_id !== conversationId));
    setActiveChat((prev) => (prev?.conversation_id === conversationId ? null : prev));
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
  };

  const sendMessage = async (content, messageType = "text", fileData = null, conversationId = null) => {
    // Use provided conversationId or fall back to activeChat
    const targetConversationId = conversationId || (activeChat ? activeChat.conversation_id : null);

    if (!targetConversationId || (!content.trim() && !fileData)) return;

    // Create local message immediately for better UX
    const localMessage = {
      id: Date.now().toString(),
      conversation_id: targetConversationId,
      sender_id: user.id,
      sender_name: user.name,
      content: content.trim(),
      message_type: messageType,
      file_url: fileData?.file_url,
      file_name: fileData?.file_name,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // Update local state immediately
    if (activeChat && activeChat.conversation_id === targetConversationId) {
      setActiveChat((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), localMessage],
      }));
    }

    setOpenChats((prev) => prev.map(chat =>
      chat.conversation_id === targetConversationId
        ? { ...chat, messages: [...(chat.messages || []), localMessage] }
        : chat
    ));

    setConversations((prev) => prev.map(conv =>
      conv.id === targetConversationId
        ? { ...conv, unread_count: 0, last_message: content.trim(), last_message_time: localMessage.created_at, last_message_sender_id: user.id }
        : conv
    ));

    // Call the callback for instant update in ChatWindowView
    if (messageSentRef.current) {
      messageSentRef.current(localMessage);
    }

    // Send to API, then swap the temp local message for the server-confirmed
    // one everywhere it's tracked (real id, read_by, etc.) - required for
    // edit/delete to ever work on it, and more reliable than waiting on the
    // WebSocket to echo it back.
    try {
      const response = await axios.post(
        `${API}/chat/messages`,
        {
          conversation_id: targetConversationId,
          content: content.trim(),
          message_type: messageType,
          file_url: fileData?.file_url,
          file_name: fileData?.file_name,
          file_size: fileData?.file_size,
          file_mime_type: fileData?.file_mime_type,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const realMessage = response.data;
      patchMessage(targetConversationId, localMessage.id, realMessage);
      if (messageConfirmedRef.current) {
        messageConfirmedRef.current(localMessage.id, realMessage);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    }
  };

  const sendTyping = (conversationId = null) => {
    // Send typing indicator via WebSocket
    const targetConvId = conversationId || (activeChat ? activeChat.conversation_id : null);
    if (!targetConvId) return;

    sendWebSocketMessage({
      type: "typing",
      conversation_id: targetConvId,
      user_id: user.id,
    });
  };

  const markAsRead = async (conversationId = null) => {
    const targetConvId = conversationId || (activeChat ? activeChat.conversation_id : null);
    if (!targetConvId) return;

    // Mark as read via API. other_user_id/conversation_id are query params
    // on the backend, not a JSON body.
    try {
      await axios.post(
        `${API}/chat/messages/read`,
        null,
        {
          params: { conversation_id: targetConvId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Notify other participant(s) via WebSocket for real-time update
      sendWebSocketMessage({
        type: "read",
        conversation_id: targetConvId,
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }

    // Update local message read status for every message not sent by me
    const updateMessagesReadStatus = (msgs) =>
      (msgs || []).map((msg) => (msg.sender_id !== user.id ? { ...msg, is_read: true } : msg));

    // Update activeChat if it's the target conversation
    if (activeChat && activeChat.conversation_id === targetConvId) {
      setActiveChat(prev => ({
        ...prev,
        messages: updateMessagesReadStatus(prev.messages)
      }));
    }

    // Update openChats
    setOpenChats(prev => prev.map(chat => {
      if (chat.conversation_id === targetConvId) {
        return {
          ...chat,
          unreadCount: 0,
          messages: updateMessagesReadStatus(chat.messages)
        };
      }
      return chat;
    }));

    setConversations(prev => prev.map(conv =>
      conv.id === targetConvId
        ? { ...conv, unread_count: 0 }
        : conv
    ));
  };

  const editMessage = async (conversationId, messageId, content) => {
    const response = await axios.put(
      `${API}/chat/messages/${messageId}`,
      { content },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    patchMessage(conversationId, messageId, { content: response.data.content, edited: true, edited_at: response.data.edited_at });
  };

  const deleteMessage = async (conversationId, messageId) => {
    await axios.delete(`${API}/chat/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    patchMessage(conversationId, messageId, { is_deleted: true, content: "", file_url: null, file_name: null });
  };

  const clearChat = async (conversationId) => {
    await axios.delete(`${API}/chat/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    resetConversationMessages(conversationId);
  };

  const handleFileUpload = async (event, type = "file", conversationId = null) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API}/chat/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      const fileData = response.data;
      const messageType = type === "image" || fileData.is_image ? "image" : "file";
      sendMessage(file.name, messageType, fileData, conversationId);
    } catch (error) {
      console.error("Error uploading file:", error);
    }

    // Reset input
    event.target.value = "";
  };

  // Calculate total unread
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // Handle minimize/maximize individual chat windows
  const toggleChatMinimize = (conversationId) => {
    setOpenChats(prev => {
      const updated = prev.map(chat =>
        chat.conversation_id === conversationId
          ? { ...chat, minimized: !chat.minimized }
          : chat
      );
      // Find the chat after update to set activeChat
      const expanded = updated.find(c => c.conversation_id === conversationId);
      if (expanded && !expanded.minimized) {
        // Use callback form to ensure we have latest state
        setActiveChat(expanded);
      }
      return updated;
    });
  };

  // Handle close individual chat window
  const closeChatWindow = (conversationId, e) => {
    if (e) e.stopPropagation();
    setOpenChats(prev => prev.filter(c => c.conversation_id !== conversationId));
    if (activeChat?.conversation_id === conversationId) {
      setActiveChat(openChats.find(c => c.conversation_id !== conversationId) || null);
    }
  };

  // Handle click on chat tab - always toggle minimize/maximize
  const handleChatTabClick = (chat) => {
    toggleChatMinimize(chat.conversation_id);
  };

  const isAdmin = user?.role === "admin";

  return (
    <>
      {/* Floating Chat Windows - positioned to the left of the main button */}
      {openChats.map((chat, index) => {
        // Calculate right position based on the cumulative width of all chats after this one
        // Also account for main tab's width (380px maximized, 60px minimized)
        const mainTabWidth = minimized ? 60 : 380;
        const chatsAfter = openChats.slice(index + 1);
        const offsetAfter = chatsAfter.reduce((sum, c) => sum + (c.minimized ? 158 : 388), 0);
        const rightPos = 16 + mainTabWidth + 4 + offsetAfter;

        return (
        <div
          key={chat.conversation_id}
          className="fixed z-40 flex flex-col bg-white dark:bg-black border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white transition-all duration-300 bottom-2"
          style={{
            right: `${rightPos}px`,
            width: chat.minimized ? "150px" : "380px",
            height: chat.minimized ? "50px" : "500px"
          }}
        >
          {/* Chat Header - only show when minimized */}
          {chat.minimized && (
            <div
              className="flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
              onClick={() => handleChatTabClick(chat)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-medium truncate text-sm flex items-center gap-1 mr-6">
                  {chatTitle(chat)}
                  {chat.unreadCount > 0 && (
                    <Badge className="bg-red-500 text-gray-900 dark:text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Badge>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-red-400"
                  onClick={(e) => closeChatWindow(chat.conversation_id, e)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Chat Content - shown inside floating window */}
          {!chat.minimized && (
            <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
              <ChatWindowView
                chat={chat}
                user={user}
                allUsers={users}
                onSendMessage={(content, type, fileData) => sendMessage(content, type, fileData, chat.conversation_id)}
                onRegisterMessageCallback={registerMessageCallback}
                onRegisterMessageConfirmedCallback={registerMessageConfirmedCallback}
                onTyping={sendTyping}
                onMarkAsRead={() => markAsRead(chat.conversation_id)}
                typingUser={typingUsers[chat.conversation_id]}
                onFileUpload={(e, t) => handleFileUpload(e, t, chat.conversation_id)}
                fileInputRef={fileInputRef}
                imageInputRef={imageInputRef}
                onClose={() => closeChatWindow(chat.conversation_id)}
                onMinimize={() => toggleChatMinimize(chat.conversation_id)}
                onUpdateGroup={(name, participantIds) => updateGroup(chat.conversation_id, name, participantIds)}
                onLeaveGroup={() => leaveGroup(chat.conversation_id)}
                onEditMessage={(messageId, content) => editMessage(chat.conversation_id, messageId, content)}
                onDeleteMessage={(messageId) => deleteMessage(chat.conversation_id, messageId)}
                onClearChat={() => clearChat(chat.conversation_id)}
                isFloating={true}
              />
            </div>
          )}
        </div>
      );
      })}

      {/* Main Chat Widget */}
      <div
        className={`fixed bottom-0 right-4 z-50 flex flex-col bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 ${
          minimized ? "h-12" : "h-[500px]"
        } transition-all duration-300 text-gray-900 dark:text-white`}
        style={{ width: minimized ? "60px" : "380px" }}
      >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-900 border-b border-black/10 dark:border-white/10 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {minimized && totalUnread > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-red-500 text-gray-900 dark:text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                {totalUnread > 99 ? '99+' : totalUnread}
              </Badge>
            )}
          </div>
          {!minimized && <span className="font-medium">Messages</span>}
        </div>
        <div className="flex items-center gap-1">
          {!minimized && isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-7 w-7 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              title="New group"
              onClick={(e) => {
                e.stopPropagation();
                setNewGroupOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {!minimized && (
        <ChatListView
          conversations={conversations}
          users={users}
          onSelectConversation={openConversationWindow}
          onStartConversation={startConversation}
          userId={user?.id}
        />
      )}

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => handleFileUpload(e, "file")}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
      />
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        onChange={(e) => handleFileUpload(e, "image")}
        accept="image/*"
      />
    </div>

      {isAdmin && (
        <NewGroupDialog
          open={newGroupOpen}
          onOpenChange={setNewGroupOpen}
          users={users}
          onCreate={createGroup}
        />
      )}
    </>
  );
}

// Admin-only dialog to create a group conversation with specific members
function NewGroupDialog({ open, onOpenChange, users, onCreate }) {
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setMemberIds([]);
      setSubmitting(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim() || memberIds.length === 0) return;
    setSubmitting(true);
    try {
      await onCreate(name.trim(), memberIds);
    } catch (error) {
      console.error("Error creating group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
        <DialogHeader>
          <DialogTitle>New Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-gray-500 dark:text-zinc-400">Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NOC Team"
              className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-500 dark:text-zinc-400">Members</Label>
            <MultiSelect
              options={users.map((u) => ({ value: u.id, label: u.name || u.username }))}
              value={memberIds}
              onValueChange={setMemberIds}
              placeholder="Select members..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-200 dark:border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || memberIds.length === 0 || submitting}
            className="bg-emerald-500 text-black hover:bg-emerald-400"
          >
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Chat List View Component
function ChatListView({
  conversations,
  users,
  onSelectConversation,
  onStartConversation,
  userId,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const title = conv.is_group ? conv.name : conv.participants?.[0]?.name;
    return (
      title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    return (
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Get users who already have a 1:1 conversation, so "Other Users" only
  // lists people you haven't DM'd yet. Group membership doesn't count - you
  // can always start a separate direct message with someone in a group.
  const conversationUserIds = new Set(
    conversations.filter((c) => !c.is_group).map((c) => c.participants?.[0]?.id)
  );
  const usersWithoutConversations = filteredUsers.filter(u => !conversationUserIds.has(u.id));

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    // Parse the date - if no timezone info, append 'Z' to treat as UTC
    // JavaScript will then convert to local time for display
    let dateStrWithTz = dateStr;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.endsWith('Z')) {
      dateStrWithTz = dateStr + 'Z';
    }
    const date = new Date(dateStrWithTz);
    const now = new Date();

    // Use local time for comparison
    const dateTime = date.getTime();
    const nowTime = now.getTime();

    // Handle invalid dates
    if (isNaN(dateTime)) return "";

    const diff = nowTime - dateTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-black border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-lg overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-gray-200 dark:border-zinc-800">
        <Input
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-zinc-500"
        />
      </div>

      {/* List - Combined list showing conversations and users without conversations */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {/* Show conversations */}
          {filteredConversations.length > 0 && filteredConversations.map((conv) => {
            const participant = conv.participants?.[0];
            const title = conv.is_group ? conv.name : participant?.name;
            return (
              <div
                key={conv.id}
                className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                onClick={() => onSelectConversation(conv)}
              >
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className={conv.is_group ? "bg-blue-600 text-gray-900 dark:text-white" : "bg-emerald-600 text-gray-900 dark:text-white"}>
                      {conv.is_group ? <Users className="w-5 h-5" /> : getInitials(participant?.name)}
                    </AvatarFallback>
                  </Avatar>
                  {!conv.is_group && participant?.is_online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium truncate text-gray-900 dark:text-white">{title}</div>
                    <div className="text-xs text-zinc-500">
                      {formatTime(conv.last_message_time)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-400 truncate">
                      {conv.last_message_sender_id === userId && "You: "}
                      {conv.last_message || (conv.is_group ? `${(conv.participants?.length || 0) + 1} members` : "No messages yet")}
                    </div>
                    {conv.unread_count > 0 && (
                      <Badge className="bg-emerald-600 text-gray-900 dark:text-white text-xs min-w-[20px] h-5 flex items-center justify-center">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredConversations.length === 0 && (
            <div className="text-center text-gray-400 py-8">No conversations yet</div>
          )}

          {/* Show users without conversations */}
          {usersWithoutConversations.length > 0 && (
            <>
              {filteredConversations.length > 0 && (
                <div className="text-xs text-gray-500 mt-4 mb-2 px-2">Other Users</div>
              )}
              {usersWithoutConversations.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                  onClick={() => onStartConversation(u)}
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-emerald-600 text-gray-900 dark:text-white">
                        {getInitials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    {u.is_online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-gray-900 dark:text-white">{u.name}</div>
                    <div className="text-xs text-gray-500 truncate">{formatPresence(u.is_online, u.last_active)}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Chat Window View Component
function ChatWindowView({
  chat,
  user,
  allUsers,
  onSendMessage,
  onRegisterMessageCallback,
  onRegisterMessageConfirmedCallback,
  onTyping,
  onMarkAsRead,
  typingUser,
  onFileUpload,
  fileInputRef,
  imageInputRef,
  onClose,
  onMinimize,
  onUpdateGroup,
  onLeaveGroup,
  onEditMessage,
  onDeleteMessage,
  onClearChat,
}) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [hasLoadedFromApi, setHasLoadedFromApi] = useState(false);
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [deleteMessageId, setDeleteMessageId] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesContainerRef = useRef(null);

  const isGroup = !!chat.is_group;
  const memberCount = (chat.participants?.length || 0) + 1; // + self

  // Register callback for direct message addition when sending messages.
  // sendMessage() passes the message object itself (see registerMessageCallback
  // in the parent), not a {message: ...} wrapper.
  useEffect(() => {
    if (onRegisterMessageCallback) {
      onRegisterMessageCallback((message) => {
        // Directly add message to local state for instant display
        if (message) setMessages(prev => [...prev, message]);
      });
    }
  }, [onRegisterMessageCallback]);

  // Register callback that swaps a just-sent message's temporary local id
  // for the real, server-assigned one once the send POST resolves.
  useEffect(() => {
    if (onRegisterMessageConfirmedCallback) {
      onRegisterMessageConfirmedCallback((tempId, realMessage) => {
        setMessages(prev => prev.map(m => (m.id === tempId ? realMessage : m)));
      });
    }
  }, [onRegisterMessageConfirmedCallback]);

  // Load messages function wrapped in useCallback - must be defined before useEffect that uses it
  const loadMessages = useCallback(async () => {
    if (!chat.conversation_id) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/chat/conversations/${chat.conversation_id}/messages?limit=50`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      const apiMessages = response.data;
      setHasMore(apiMessages.length === 50);

      // Merge API messages with any existing local messages (e.g., messages sent while loading)
      // Use functional update to avoid stale closure
      setMessages(prevMessages => {
        if (prevMessages.length === 0) {
          // No local messages - just use API messages
          return apiMessages;
        }

        // There are local messages - need to merge
        // Get IDs from API messages to check what's already on server
        const apiMessageIds = new Set(apiMessages.map(m => m.id));

        // Filter local messages that are NOT in API response
        // These are messages that were sent locally but not yet acknowledged by server
        const localOnlyMessages = prevMessages.filter(m => !apiMessageIds.has(m.id));

        // Combine API messages with local-only messages
        return [...apiMessages, ...localOnlyMessages];
      });
      setHasLoadedFromApi(true);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
    setLoading(false);
  }, [chat.conversation_id]);

  // Reset loaded state when conversation changes
  useEffect(() => {
    if (chat.conversation_id) {
      setHasLoadedFromApi(false);
      setHasMarkedAsRead(false);
    }
  }, [chat.conversation_id]);

  // The chat was just cleared (by us or the other participant) - empty the
  // local view. clearedAt (a timestamp) rather than chat.messages itself is
  // what's watched here, since going from some messages to an empty array
  // needs an explicit signal separate from the regular merge-sync effect
  // below (which only ever adds messages, never removes them).
  useEffect(() => {
    if (chat.clearedAt) {
      setMessages([]);
    }
  }, [chat.clearedAt]);

  // Load and sync messages when conversation changes
  useEffect(() => {
    if (!chat.conversation_id) return;

    // Load from API if we haven't loaded yet
    if (!loading && messages.length === 0) {
      loadMessages();
      return;
    }

    // Sync messages from parent to local state
    // Always sync when parent has messages to ensure UI stays up to date
    if (hasLoadedFromApi && chat.messages) {
      // Check if parent has different messages than local state
      const parentIds = new Set(chat.messages.map(m => m.id));
      const localIds = new Set(messages.map(m => m.id));

      // Check if there's any message in parent that's not in local
      const hasNewMessages = chat.messages.some(m => !localIds.has(m.id));

      // Also check if local has messages not in parent (shouldn't happen but handle it)
      const hasLocalOnly = messages.some(m => !parentIds.has(m.id));

      // Sync if there are new messages or local-only messages
      if (hasNewMessages || hasLocalOnly) {
        // Merge by id and re-sort chronologically - never assume either
        // side's array order reflects the full picture. The parent's copy
        // only ever gets messages appended to it (it never receives the
        // initially-loaded history), so concatenating "parent's messages"
        // then "local-only messages" put whatever the parent had first,
        // shoving the actual older history after it.
        const byId = new Map(messages.map(m => [m.id, m]));
        for (const parentMsg of chat.messages) {
          const localMsg = byId.get(parentMsg.id);
          // If local has is_read=true, preserve it - never overwrite with false
          byId.set(parentMsg.id, {
            ...parentMsg,
            is_read: localMsg?.is_read === true ? true : (parentMsg.is_read || false),
          });
        }

        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(merged);
      }
    }
  }, [chat.conversation_id, chat.messages, hasLoadedFromApi, loadMessages, loading, messages.length]);

  // Mark as read after messages are loaded - only mark as read when there are UNREAD messages
  useEffect(() => {
    if (chat.conversation_id && messages.length > 0 && !hasMarkedAsRead && hasLoadedFromApi) {
      // Check if there are any unread messages from other users
      const hasUnreadMessages = messages.some(msg =>
        msg.sender_id !== user?.id && msg.is_read !== true
      );

      // Only mark as read if there are unread messages
      if (hasUnreadMessages) {
        setHasMarkedAsRead(true);
        onMarkAsRead?.();
      } else {
        // Already all read, just mark as done
        setHasMarkedAsRead(true);
      }
    }
  }, [chat.conversation_id, messages.length, hasLoadedFromApi, hasMarkedAsRead, user, onMarkAsRead]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    onSendMessage(message);
    setMessage("");
  };

  const insertEmoji = (emoji) => {
    setMessage((prev) => prev + emoji);
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const startEditingMessage = (msg) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.content);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const saveEditingMessage = async () => {
    if (!editingText.trim() || !editingMessageId) return;
    const messageId = editingMessageId;
    const content = editingText.trim();
    setEditingMessageId(null);
    setEditingText("");
    try {
      await onEditMessage?.(messageId, content);
    } catch (error) {
      console.error("Error editing message:", error);
      toast.error("Failed to edit message");
    }
  };

  const handleDeleteMessage = (messageId) => {
    setDeleteMessageId(messageId);
  };

  const handleConfirmDeleteMessage = async () => {
    if (!deleteMessageId) return;
    setDeletingMessage(true);
    try {
      await onDeleteMessage?.(deleteMessageId);
      setDeleteMessageId(null);
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");
    } finally {
      setDeletingMessage(false);
    }
  };

  const handleConfirmClearChat = async () => {
    setClearingChat(true);
    try {
      await onClearChat?.();
      setClearChatOpen(false);
    } catch (error) {
      console.error("Error clearing chat:", error);
      toast.error("Failed to clear chat");
    } finally {
      setClearingChat(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      // Send typing indicator with debounce
      clearTimeout(window.typingTimeout);
      onTyping();
      window.typingTimeout = setTimeout(() => {}, 500);
    }
  };

  const handleScroll = async () => {
    if (!messagesContainerRef.current || loading || !hasMore) return;

    const { scrollTop } = messagesContainerRef.current;
    if (scrollTop === 0) {
      // Load more messages
      setLoading(true);
      try {
        const oldestMessage = messages[0];
        const response = await axios.get(
          `${API}/chat/conversations/${chat.conversation_id}/messages?limit=50&before=${oldestMessage.created_at}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        setMessages((prev) => [...response.data, ...prev]);
        setHasMore(response.data.length === 50);
      } catch (error) {
        console.error("Error loading more messages:", error);
      }
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    // Parse the date - if no timezone info, append 'Z' to treat as UTC
    // JavaScript will then convert to local time for display
    let dateStrWithTz = dateStr;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.endsWith('Z')) {
      dateStrWithTz = dateStr + 'Z';
    }
    const date = new Date(dateStrWithTz);
    // Use toLocaleTimeString which automatically converts UTC to local timezone
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    // Parse the date - if no timezone info, append 'Z' to treat as UTC
    let dateStrWithTz = dateStr;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.endsWith('Z')) {
      dateStrWithTz = dateStr + 'Z';
    }
    const date = new Date(dateStrWithTz);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString();
  };

  const groupMessagesByDate = () => {
    const groups = [];
    let currentDate = null;

    messages.filter(Boolean).forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ type: "date", date: msg.created_at });
      }
      groups.push({ type: "message", data: msg });
    });

    return groups;
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const formData = new FormData();
        formData.append("file", file);

        try {
          const response = await axios.post(
            `${API}/chat/upload`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "multipart/form-data",
              },
            }
          );
          onSendMessage(file.name, "image", response.data);
        } catch (error) {
          console.error("Error uploading pasted image:", error);
        }
        break;
      }
    }
  };

  return (
    <>
    <div className="flex flex-col flex-1 bg-white dark:bg-black border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-lg overflow-hidden" style={{ minHeight: 0 }}>
      {/* Chat Header */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <Avatar className="w-8 h-8">
              <AvatarFallback className={isGroup ? "bg-blue-600 text-gray-900 dark:text-white text-xs" : "bg-emerald-600 text-gray-900 dark:text-white text-xs"}>
                {isGroup ? <Users className="w-4 h-4" /> : getInitials(chat.participant?.name)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && chat.participant?.is_online && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{chatTitle(chat)}</div>
            <div className="text-[10px] text-gray-500 dark:text-zinc-400 truncate">
              {isGroup ? `${memberCount} members` : formatPresence(chat.participant?.is_online, chat.participant?.last_active)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isGroup && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              onClick={() => setGroupInfoOpen(true)}
              title="Group info"
            >
              <Info className="w-3.5 h-3.5" />
            </Button>
          )}
          {!isGroup && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-red-400"
              onClick={() => setClearChatOpen(true)}
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          {onMinimize && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              onClick={onMinimize}
              title="Minimize"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-red-400"
              onClick={onClose}
              title="Close"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 p-2 overflow-y-auto"
        style={{ flex: '1 1 auto', minHeight: '0' }}
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-zinc-400 py-4">Loading...</div>
        )}
        {groupMessagesByDate().map((item, index) => {
          if (item.type === "date") {
            return (
              <div key={`date-${index}`} className="text-center text-[10px] text-zinc-500 my-1">
                {formatDate(item.date)}
              </div>
            );
          }

          const msg = item.data;
          const isOwn = msg.sender_id === user.id;
          const isImage = msg.message_type === "image";
          const isEditing = editingMessageId === msg.id;

          // Per-message read receipt: how many OTHER participants have read
          // it vs. how many there are. For a 1:1 DM otherCount is always 1,
          // so this collapses to the old binary sent/read behavior; for a
          // group it distinguishes "read by some" from "read by everyone".
          const otherCount = chat.participants?.length || 0;
          const readByCount = (msg.read_by || []).length;
          const readByNames = isGroup
            ? (msg.read_by || []).map((id) => chat.participants?.find((p) => p.id === id)?.name).filter(Boolean)
            : [];

          return (
            <div
              key={msg.id}
              className={`group flex mb-1 items-end gap-1 ${isOwn ? "justify-end" : "justify-start"}`}
            >
              {isOwn && !msg.is_deleted && !isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {msg.message_type === "text" && (
                    <button
                      onClick={() => startEditingMessage(msg)}
                      className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      title="Edit message"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="p-1 text-gray-400 hover:text-red-400"
                    title="Delete message"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div
                className={`max-w-[70%] rounded px-2 py-1 text-sm ${
                  isOwn
                    ? "bg-emerald-600 text-gray-900 dark:text-white"
                    : "bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-zinc-100"
                }`}
              >
                {/* Sender name - only useful in a group, where messages can come from more than one other person */}
                {isGroup && !isOwn && (
                  <div className="text-[10px] font-medium text-emerald-500 mb-0.5">{msg.sender_name}</div>
                )}

                {msg.is_deleted ? (
                  <div className="italic text-xs opacity-70">This message was deleted</div>
                ) : isEditing ? (
                  <div className="space-y-1 min-w-[160px]">
                    <Input
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEditingMessage();
                        } else if (e.key === "Escape") {
                          cancelEditingMessage();
                        }
                      }}
                      className="h-7 text-sm bg-white/20 border-white/30 text-gray-900 dark:text-white placeholder:text-gray-300"
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button onClick={cancelEditingMessage} className="underline opacity-80 hover:opacity-100">Cancel</button>
                      <button onClick={saveEditingMessage} disabled={!editingText.trim()} className="underline font-medium disabled:opacity-50">Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Image message */}
                    {isImage && msg.file_url && (
                      <div className="mb-1">
                        <img
                          src={`${API.replace("/api", "")}${msg.file_url}`}
                          alt={msg.file_name || "Image"}
                          className="max-w-full rounded"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* File message */}
                    {msg.message_type === "file" && msg.file_url && (
                      <a
                        href={`${API.replace("/api", "")}${msg.file_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 mb-1 ${
                          isOwn ? "text-emerald-200 hover:text-gray-900 dark:hover:text-white" : "text-emerald-400 hover:text-emerald-300"
                        }`}
                      >
                        <Paperclip className="w-3 h-3" />
                        <span className="text-xs underline">{msg.file_name || "File"}</span>
                      </a>
                    )}

                    {/* Text content - detect links */}
                    {msg.content && (
                      <div className="break-words">
                        {msg.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                          part.match(/https?:\/\/[^\s]+/) ? (
                            <a
                              key={i}
                              href={part}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`underline ${
                                isOwn ? "text-emerald-200 hover:text-gray-900 dark:hover:text-white" : "text-emerald-400 hover:text-emerald-300"
                              }`}
                            >
                              {part}
                            </a>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Timestamp + edited tag + read receipt (WhatsApp-style ticks, own messages only) */}
                {!isEditing && (
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${
                      isOwn ? "text-emerald-200" : "text-gray-400"
                    }`}
                  >
                    <span>{formatTime(msg.created_at)}</span>
                    {msg.edited && !msg.is_deleted && <span className="italic">(edited)</span>}
                    {isOwn && !msg.is_deleted && (
                      readByCount === 0 ? (
                        <Check className="w-3 h-3" title="Sent" />
                      ) : (
                        <CheckCheck
                          className={`w-3 h-3 ${isGroup && readByCount < otherCount ? "opacity-60" : ""}`}
                          title={isGroup ? (readByNames.length ? `Read by ${readByNames.join(", ")}` : "Read") : "Read"}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUser && typingUser.user_id !== user.id && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 mb-1">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>{typingUser.user_name} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-8 w-8"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-8 w-8"
          onClick={() => imageInputRef.current?.click()}
          title="Send image"
        >
          <ImageIcon className="w-4 h-4 text-zinc-500" />
        </Button>
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="p-1 h-8 w-8" title="Emoji">
              <Smile className="w-4 h-4 text-zinc-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700">
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_OPTIONS.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => insertEmoji(emoji)}
                  className="text-lg leading-none p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          ref={inputRef}
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          className="flex-1 h-8 text-sm bg-gray-200 dark:bg-zinc-700 border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
        />
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-8 w-8"
          onClick={handleSend}
          disabled={!message.trim()}
        >
          <Send className={`w-4 h-4 ${message.trim() ? "text-emerald-400" : "text-gray-500"}`} />
        </Button>
      </div>
    </div>
    {isGroup && (
      <GroupInfoDialog
        open={groupInfoOpen}
        onOpenChange={setGroupInfoOpen}
        chat={chat}
        currentUser={user}
        allUsers={allUsers || []}
        onSave={onUpdateGroup}
        onLeave={() => {
          setGroupInfoOpen(false);
          onLeaveGroup?.();
        }}
      />
    )}
    {!isGroup && (
      <Dialog open={clearChatOpen} onOpenChange={(open) => !clearingChat && setClearChatOpen(open)}>
        <DialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>Clear chat?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 dark:text-zinc-300">
            This permanently deletes all messages in this conversation with {chat.participant?.name || "this user"} for both of you. This can't be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearChatOpen(false)} disabled={clearingChat} className="border-gray-200 dark:border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClearChat}
              disabled={clearingChat}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {clearingChat ? "Clearing..." : "Clear Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    <Dialog open={!!deleteMessageId} onOpenChange={(open) => !deletingMessage && !open && setDeleteMessageId(null)}>
      <DialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
        <DialogHeader>
          <DialogTitle>Delete message?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-700 dark:text-zinc-300">This can't be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteMessageId(null)} disabled={deletingMessage} className="border-gray-200 dark:border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteMessage}
            disabled={deletingMessage}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {deletingMessage ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// Admin can rename the group / add-remove members here; any member can leave.
function GroupInfoDialog({ open, onOpenChange, chat, currentUser, allUsers, onSave, onLeave }) {
  const isAdmin = currentUser?.role === "admin";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(chat?.name || "");
      setMemberIds([
        ...(currentUser?.id ? [currentUser.id] : []),
        ...((chat?.participants || []).map((p) => p.id)),
      ]);
      setEditing(false);
    }
  }, [open, chat, currentUser]);

  const handleSave = async () => {
    if (!name.trim() || memberIds.length < 2) return;
    setSubmitting(true);
    try {
      await onSave(name.trim(), memberIds);
      setEditing(false);
    } catch (error) {
      console.error("Error updating group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Group" : chat?.name || "Group"}</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-gray-500 dark:text-zinc-400">Group name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500 dark:text-zinc-400">Members</Label>
              <MultiSelect
                options={allUsers.map((u) => ({ value: u.id, label: u.name || u.username }))}
                value={memberIds.filter((id) => id !== currentUser?.id)}
                onValueChange={(ids) => setMemberIds([...(currentUser?.id ? [currentUser.id] : []), ...ids])}
                placeholder="Select members..."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">{(chat?.participants?.length || 0) + 1} members</div>
            <div className="flex items-center gap-2 p-1.5">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-emerald-600 text-gray-900 dark:text-white text-xs">{getInitials(currentUser?.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{currentUser?.name} (you)</span>
            </div>
            {(chat?.participants || []).map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-1.5">
                <div className="relative">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-emerald-600 text-gray-900 dark:text-white text-xs">{getInitials(p.name)}</AvatarFallback>
                  </Avatar>
                  {p.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white dark:border-black" />}
                </div>
                <div>
                  <div className="text-sm">{p.name}</div>
                  <div className="text-[10px] text-gray-500 dark:text-zinc-400">{formatPresence(p.is_online, p.last_active)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between sm:justify-between w-full">
          <Button
            variant="outline"
            onClick={onLeave}
            className="border-red-300 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Leave
          </Button>
          <div className="flex gap-2">
            {isAdmin && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)} className="border-gray-200 dark:border-zinc-700">
                Edit
              </Button>
            )}
            {isAdmin && editing && (
              <>
                <Button variant="outline" onClick={() => setEditing(false)} className="border-gray-200 dark:border-zinc-700">
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!name.trim() || memberIds.length < 2 || submitting}
                  className="bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
