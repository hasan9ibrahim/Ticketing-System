import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare, X, Send, Paperclip, Image as ImageIcon, Users, Plus,
  Check, CheckCheck, Info, LogOut, Smile, Pencil, Trash2, Loader2, Minus,
} from "lucide-react";
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
import { requestNotificationPermission, showNativeNotification } from "@/lib/nativeNotification";
import { useChatSocket } from "@/hooks/useChatSocket";

// A small curated set rather than a full emoji library/dependency - covers
// the common reactions people actually reach for in a work chat.
const EMOJI_OPTIONS = [
  "😀", "😂", "😅", "🙂", "😉", "😊", "😍", "😘", "🤔", "😎",
  "😴", "😢", "😭", "😡", "😱", "🤗", "🤝", "👋", "👍", "👎",
  "👏", "🙏", "💪", "🎉", "🔥", "❤️", "💯", "✅", "❌", "⚠️",
  "📌", "📎", "📷", "🚀", "⭐", "✨", "💡", "😇", "🥳", "🎊",
];

const API = `${process.env.REACT_APP_API_URL}/api`;
// Attachments live on the backend's own origin, not the /api-suffixed API
// base - build that separately rather than string-munging API at render
// time (a previous version did `API.replace("/api", "")`, which silently
// breaks if the configured URL ever contains "/api" more than once).
const FILE_ORIGIN = process.env.REACT_APP_API_URL || "";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function makeClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// "Active now" / "Active 5m ago" / "Last seen yesterday" style presence text.
function formatPresence(isOnline, lastActive) {
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
}

// A group's own name, or a DM partner's name/username.
function chatTitle(chat) {
  if (chat.is_group) return chat.name || "Group";
  return chat.participant?.name || chat.participant?.username || "Unknown";
}

function withTz(dateStr) {
  if (!dateStr) return null;
  return dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
}

function formatRelativeTime(dateStr) {
  const iso = withTz(dateStr);
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

function formatTimeLabel(dateStr) {
  const iso = withTz(dateStr);
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(dateStr) {
  const iso = withTz(dateStr);
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString();
}

export default function Chat({ user, openChats, setOpenChats, activeChat, setActiveChat }) {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  // Single source of truth for every conversation's messages, keyed by
  // conversation_id: { items, loaded, loading, loadingOlder, hasMore }.
  // Every previous version of this feature kept a second (or third) copy of
  // this same data inside openChats/activeChat, and the sync logic between
  // those copies is exactly where the "message shows late", "read receipt
  // doesn't update", and "unread count is stale" bugs kept coming from.
  // There is nowhere else in this file that owns message state.
  const [messagesByConv, setMessagesByConv] = useState({});
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  // Which window's conversation a click on its attach/image button is for -
  // the file/image <input> elements are shared (one file picker for the
  // whole widget), so without this, picking a file always uploaded to
  // whichever conversation happened to be active instead of the window
  // whose button was actually clicked.
  const pendingUploadConversationRef = useRef(null);
  // Tracks in-flight/completed loads synchronously so re-opening or
  // reconnecting can't fire two overlapping fetches for the same
  // conversation (React state updates are async, so checking
  // messagesByConv itself here would race).
  const loadedConvsRef = useRef(new Set());

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const fetchConversations = useCallback(async () => {
    const response = await axios.get(`${API}/chat/conversations`, { headers: authHeaders() });
    setConversations(response.data);
  }, []);

  const fetchUsers = useCallback(async () => {
    const response = await axios.get(`${API}/chat/users`, { headers: authHeaders() });
    setUsers(response.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([fetchConversations(), fetchUsers()]);
        if (!cancelled) setLoadError(false);
      } catch (error) {
        console.error("Error loading chat data:", error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchConversations, fetchUsers]);

  // Presence refresh - messages/read-receipts/edits arrive over the socket,
  // this poll only exists to refresh online/offline dots, so it's fine to
  // keep it slow and only run while the dock is open and the tab is visible.
  useEffect(() => {
    if (minimized) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchConversations().catch(() => {});
        fetchUsers().catch(() => {});
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [minimized, fetchConversations, fetchUsers]);

  // A conversation only counts as "currently being looked at" if its
  // floating window is open AND expanded. activeChat alone isn't enough -
  // minimizing a window never clears/updates activeChat (only its entry in
  // openChats), so activeChat can keep naming a conversation that's no
  // longer actually visible.
  const isConversationFocused = useCallback(
    (conversationId) => {
      if (!activeChat || activeChat.conversation_id !== conversationId) return false;
      const entry = openChats.find((c) => c.conversation_id === conversationId);
      return !!entry && !entry.minimized;
    },
    [activeChat, openChats]
  );

  const markAsRead = useCallback(
    async (conversationId) => {
      if (!conversationId) return;
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)));
      setOpenChats((prev) => prev.map((c) => (c.conversation_id === conversationId ? { ...c, unreadCount: 0 } : c)));
      setMessagesByConv((prev) => {
        const entry = prev[conversationId];
        if (!entry) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...entry,
            items: entry.items.map((m) =>
              m.sender_id !== user?.id && !(m.read_by || []).includes(user?.id)
                ? { ...m, read_by: [...(m.read_by || []), user.id] }
                : m
            ),
          },
        };
      });
      try {
        await axios.post(`${API}/chat/messages/read`, { conversation_id: conversationId }, { headers: authHeaders() });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    },
    [user?.id, setOpenChats]
  );

  const patchMessage = useCallback((conversationId, messageId, patch) => {
    setMessagesByConv((prev) => {
      const entry = prev[conversationId];
      if (!entry) return prev;
      return {
        ...prev,
        [conversationId]: { ...entry, items: entry.items.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) },
      };
    });
  }, []);

  const openConversationWindow = useCallback(
    (conv) => {
      const participant = conv.participants?.[0];
      const existingChat = openChats.find((c) => c.conversation_id === conv.id);
      if (existingChat) {
        setOpenChats((prev) => prev.map((c) => (c.conversation_id === conv.id ? { ...c, minimized: false } : c)));
        setActiveChat({ ...existingChat, minimized: false });
      } else {
        const newChat = {
          conversation_id: conv.id,
          is_group: !!conv.is_group,
          name: conv.name || null,
          participants: conv.participants || [],
          participant: participant || null,
          minimized: false,
          unreadCount: 0,
        };
        setOpenChats((prev) => [...prev, newChat]);
        setActiveChat(newChat);
      }
      ensureMessagesLoaded(conv.id);
      markAsRead(conv.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openChats, setOpenChats, setActiveChat, markAsRead]
  );

  const applyIncomingMessage = useCallback(
    (message) => {
      const isOwn = message.sender_id === user?.id;
      const focused = isConversationFocused(message.conversation_id);

      setMessagesByConv((prev) => {
        const entry = prev[message.conversation_id] || { items: [], loaded: false, loading: false, hasMore: true };
        if (entry.items.some((m) => m.id === message.id)) return prev;
        const clientIdx = message.client_id
          ? entry.items.findIndex((m) => m.client_id && m.client_id === message.client_id)
          : -1;
        const items =
          clientIdx >= 0
            ? entry.items.map((m, i) => (i === clientIdx ? message : m))
            : [...entry.items, message];
        return { ...prev, [message.conversation_id]: { ...entry, items } };
      });

      const preview =
        message.message_type === "image" ? "📷 Photo" : message.message_type === "file" ? `📎 ${message.file_name || "File"}` : message.content;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === message.conversation_id
            ? {
                ...c,
                last_message: preview,
                last_message_time: message.created_at,
                last_message_sender_id: message.sender_id,
                unread_count: isOwn || focused ? 0 : (c.unread_count || 0) + 1,
              }
            : c
        )
      );

      if (isOwn) return;

      if (!focused) {
        setOpenChats((prev) =>
          prev.map((c) =>
            c.conversation_id === message.conversation_id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
          )
        );
        const convForToast = conversations.find((c) => c.id === message.conversation_id);
        toast(message.sender_name || "New message", {
          description: preview,
          action: convForToast ? { label: "Open", onClick: () => openConversationWindow(convForToast) } : undefined,
        });
        playNotificationSound();
        if (document.hidden) showNativeNotification(message.sender_name || "New message", preview);
      } else {
        markAsRead(message.conversation_id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, isConversationFocused, conversations, markAsRead, setOpenChats, openConversationWindow]
  );

  const applyReadReceipt = useCallback((conversationId, readBy) => {
    setMessagesByConv((prev) => {
      const entry = prev[conversationId];
      if (!entry) return prev;
      return {
        ...prev,
        [conversationId]: {
          ...entry,
          items: entry.items.map((m) =>
            m.sender_id !== readBy && !(m.read_by || []).includes(readBy)
              ? { ...m, read_by: [...(m.read_by || []), readBy] }
              : m
          ),
        },
      };
    });
  }, []);

  const handleGroupUpdated = useCallback(
    async (data) => {
      const { conversation_id, participant_ids } = data;
      const stillMember = !participant_ids || participant_ids.includes(user?.id);
      if (!stillMember) {
        setOpenChats((prev) => prev.filter((c) => c.conversation_id !== conversation_id));
        setActiveChat((prev) => (prev?.conversation_id === conversation_id ? null : prev));
        setConversations((prev) => prev.filter((c) => c.id !== conversation_id));
        return;
      }
      try {
        const response = await axios.get(`${API}/chat/conversations`, { headers: authHeaders() });
        setConversations(response.data);
        const fresh = response.data.find((c) => c.id === conversation_id);
        if (fresh) {
          setOpenChats((prev) =>
            prev.map((c) => (c.conversation_id === conversation_id ? { ...c, name: fresh.name, participants: fresh.participants } : c))
          );
          setActiveChat((prev) =>
            prev?.conversation_id === conversation_id ? { ...prev, name: fresh.name, participants: fresh.participants } : prev
          );
        }
      } catch (error) {
        console.error("Error refreshing group:", error);
      }
    },
    [user?.id, setOpenChats, setActiveChat]
  );

  const handleSocketMessage = (data) => {
    switch (data.type) {
      case "new_message":
        applyIncomingMessage(data.message);
        break;
      case "typing":
        setTypingUsers((prev) => ({ ...prev, [data.conversation_id]: data }));
        setTimeout(() => {
          setTypingUsers((prev) => {
            if (prev[data.conversation_id] !== data) return prev;
            const next = { ...prev };
            delete next[data.conversation_id];
            return next;
          });
        }, 3000);
        break;
      case "message_read":
        applyReadReceipt(data.conversation_id, data.read_by);
        break;
      case "message_edited":
        patchMessage(data.conversation_id, data.message_id, { content: data.content, edited: true, edited_at: data.edited_at });
        break;
      case "message_deleted":
        patchMessage(data.conversation_id, data.message_id, { is_deleted: true, content: "", file_url: null, file_name: null });
        break;
      case "group_updated":
        handleGroupUpdated(data);
        break;
      default:
        break;
    }
  };

  // The chat socket just came back up after a drop (a flaky network, a host
  // that idles/restarts the backend - it can happen for reasons outside
  // this app's control). Refresh the conversation list and mark every
  // currently-open window's messages as stale so they re-fetch, instead of
  // silently sitting on whatever they last had until the user notices and
  // manually closes/reopens something.
  const handleSocketReconnected = () => {
    fetchConversations().catch(() => {});
    openChats.forEach((chat) => {
      loadedConvsRef.current.delete(chat.conversation_id);
      setMessagesByConv((prev) => {
        const entry = prev[chat.conversation_id];
        return entry ? { ...prev, [chat.conversation_id]: { ...entry, loaded: false } } : prev;
      });
      ensureMessagesLoaded(chat.conversation_id);
    });
  };

  const { send: sendSocket } = useChatSocket(handleSocketMessage, handleSocketReconnected);

  const ensureMessagesLoaded = useCallback(async (conversationId) => {
    if (loadedConvsRef.current.has(conversationId)) return;
    loadedConvsRef.current.add(conversationId);

    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: { items: prev[conversationId]?.items || [], loaded: false, loading: true, hasMore: true },
    }));

    try {
      const response = await axios.get(`${API}/chat/conversations/${conversationId}/messages?limit=50`, {
        headers: authHeaders(),
      });
      const items = response.data;
      setMessagesByConv((prev) => {
        // Keep any optimistic message sent locally while this fetch was in flight.
        const existing = prev[conversationId]?.items || [];
        const localOnly = existing.filter(
          (m) => !items.some((fetched) => fetched.id === m.id || (m.client_id && fetched.client_id === m.client_id))
        );
        return {
          ...prev,
          [conversationId]: { items: [...items, ...localOnly], loaded: true, loading: false, hasMore: items.length === 50 },
        };
      });
    } catch (error) {
      console.error("Error loading messages:", error);
      loadedConvsRef.current.delete(conversationId);
      setMessagesByConv((prev) => {
        const entry = prev[conversationId] || { items: [], hasMore: true };
        return { ...prev, [conversationId]: { ...entry, loaded: false, loading: false } };
      });
    }
  }, []);

  const loadOlderMessages = useCallback(
    async (conversationId) => {
      const entry = messagesByConv[conversationId];
      if (!entry || entry.loadingOlder || !entry.hasMore || entry.items.length === 0) return;
      setMessagesByConv((prev) => ({ ...prev, [conversationId]: { ...prev[conversationId], loadingOlder: true } }));
      try {
        const oldest = entry.items[0];
        const response = await axios.get(
          `${API}/chat/conversations/${conversationId}/messages?limit=50&before=${encodeURIComponent(oldest.created_at)}`,
          { headers: authHeaders() }
        );
        setMessagesByConv((prev) => {
          const current = prev[conversationId];
          return {
            ...prev,
            [conversationId]: {
              ...current,
              items: [...response.data, ...current.items],
              hasMore: response.data.length === 50,
              loadingOlder: false,
            },
          };
        });
      } catch (error) {
        console.error("Error loading older messages:", error);
        setMessagesByConv((prev) => ({ ...prev, [conversationId]: { ...prev[conversationId], loadingOlder: false } }));
      }
    },
    [messagesByConv]
  );

  const startConversation = async (otherUser) => {
    try {
      const response = await axios.post(`${API}/chat/conversations`, { participant_id: otherUser.id }, { headers: authHeaders() });
      setConversations((prev) => (prev.some((c) => c.id === response.data.id) ? prev : [response.data, ...prev]));
      openConversationWindow(response.data);
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const createGroup = async (name, participantIds) => {
    const response = await axios.post(`${API}/chat/conversations/group`, { name, participant_ids: participantIds }, { headers: authHeaders() });
    setConversations((prev) => [response.data, ...prev]);
    openConversationWindow(response.data);
    setNewGroupOpen(false);
  };

  const updateGroup = async (conversationId, name, participantIds) => {
    const response = await axios.put(
      `${API}/chat/conversations/${conversationId}/group`,
      { name, participant_ids: participantIds },
      { headers: authHeaders() }
    );
    const updated = response.data;
    setOpenChats((prev) =>
      prev.map((c) => (c.conversation_id === conversationId ? { ...c, name: updated.name, participants: updated.participants } : c))
    );
    setActiveChat((prev) =>
      prev?.conversation_id === conversationId ? { ...prev, name: updated.name, participants: updated.participants } : prev
    );
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, ...updated } : c)));
  };

  const leaveGroup = async (conversationId) => {
    await axios.post(`${API}/chat/conversations/${conversationId}/leave`, null, { headers: authHeaders() });
    setOpenChats((prev) => prev.filter((c) => c.conversation_id !== conversationId));
    setActiveChat((prev) => (prev?.conversation_id === conversationId ? null : prev));
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
  };

  const sendMessage = async (conversationId, content, messageType = "text", fileData = null) => {
    const trimmed = content.trim();
    if (!trimmed && !fileData) return;

    const clientId = makeClientId();
    const localMessage = {
      id: clientId,
      client_id: clientId,
      conversation_id: conversationId,
      sender_id: user.id,
      sender_name: user.name,
      content: trimmed,
      message_type: messageType,
      file_url: fileData?.file_url,
      file_name: fileData?.file_name,
      file_size: fileData?.file_size,
      file_mime_type: fileData?.file_mime_type,
      read_by: [],
      edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
    };

    setMessagesByConv((prev) => {
      const entry = prev[conversationId] || { items: [], loaded: true, hasMore: false };
      return { ...prev, [conversationId]: { ...entry, items: [...entry.items, localMessage] } };
    });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              unread_count: 0,
              last_message: trimmed || (messageType === "image" ? "📷 Photo" : `📎 ${fileData?.file_name || "File"}`),
              last_message_time: localMessage.created_at,
              last_message_sender_id: user.id,
            }
          : c
      )
    );

    try {
      const response = await axios.post(
        `${API}/chat/messages`,
        {
          conversation_id: conversationId,
          content: trimmed,
          message_type: messageType,
          file_url: fileData?.file_url,
          file_name: fileData?.file_name,
          file_size: fileData?.file_size,
          file_mime_type: fileData?.file_mime_type,
          client_id: clientId,
        },
        { headers: authHeaders() }
      );
      applyIncomingMessage(response.data);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessagesByConv((prev) => {
        const entry = prev[conversationId];
        if (!entry) return prev;
        return {
          ...prev,
          [conversationId]: { ...entry, items: entry.items.map((m) => (m.id === clientId ? { ...m, failed: true } : m)) },
        };
      });
    }
  };

  const editMessage = async (conversationId, messageId, content) => {
    const response = await axios.put(`${API}/chat/messages/${messageId}`, { content }, { headers: authHeaders() });
    patchMessage(conversationId, messageId, { content: response.data.content, edited: true, edited_at: response.data.edited_at });
  };

  const deleteMessage = async (conversationId, messageId) => {
    await axios.delete(`${API}/chat/messages/${messageId}`, { headers: authHeaders() });
    patchMessage(conversationId, messageId, { is_deleted: true, content: "", file_url: null, file_name: null });
  };

  const sendTyping = (conversationId) => {
    sendSocket({ type: "typing", conversation_id: conversationId });
  };

  const uploadFile = async (file, type, conversationId) => {
    if (!file || !conversationId) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await axios.post(`${API}/chat/upload`, formData, {
        headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
      });
      const fileData = response.data;
      const messageType = type === "image" || fileData.is_image ? "image" : "file";
      sendMessage(conversationId, file.name, messageType, fileData);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error(error.response?.status === 413 ? "That file is too large (8MB max)." : "Could not upload the file.");
    }
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const toggleChatMinimize = (conversationId) => {
    setOpenChats((prev) => {
      const updated = prev.map((c) => (c.conversation_id === conversationId ? { ...c, minimized: !c.minimized } : c));
      const target = updated.find((c) => c.conversation_id === conversationId);
      if (target && !target.minimized) {
        setActiveChat(target);
        ensureMessagesLoaded(conversationId);
        markAsRead(conversationId);
      }
      return updated;
    });
  };

  const closeChatWindow = (conversationId, e) => {
    if (e) e.stopPropagation();
    setOpenChats((prev) => prev.filter((c) => c.conversation_id !== conversationId));
    if (activeChat?.conversation_id === conversationId) {
      const remaining = openChats.filter((c) => c.conversation_id !== conversationId);
      setActiveChat(remaining.length ? remaining[remaining.length - 1] : null);
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <>
      {/* Floating Chat Windows - positioned to the left of the main button */}
      {openChats.map((chat, index) => {
        const mainTabWidth = minimized ? 60 : 380;
        const chatsAfter = openChats.slice(index + 1);
        const offsetAfter = chatsAfter.reduce((sum, c) => sum + (c.minimized ? 158 : 388), 0);
        const rightPos = 16 + mainTabWidth + 4 + offsetAfter;
        const entry = messagesByConv[chat.conversation_id] || { items: [], loaded: false, loading: false, hasMore: false };

        return (
          <div
            key={chat.conversation_id}
            className="fixed z-40 flex flex-col bg-white dark:bg-black border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white transition-all duration-300 bottom-2"
            style={{ right: `${rightPos}px`, width: chat.minimized ? "150px" : "380px", height: chat.minimized ? "50px" : "500px" }}
          >
            {chat.minimized && (
              <div
                className="flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                onClick={() => toggleChatMinimize(chat.conversation_id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium truncate text-sm flex items-center gap-1 mr-6">
                    {chatTitle(chat)}
                    {chat.unreadCount > 0 && (
                      <Badge className="bg-red-500 text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                        {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                      </Badge>
                    )}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-red-400"
                  onClick={(e) => closeChatWindow(chat.conversation_id, e)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

            {!chat.minimized && (
              <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
                <ChatWindowView
                  chat={chat}
                  user={user}
                  allUsers={users}
                  messages={entry.items}
                  loaded={entry.loaded}
                  loading={entry.loading}
                  hasMore={entry.hasMore}
                  loadingOlder={entry.loadingOlder}
                  onLoadOlder={() => loadOlderMessages(chat.conversation_id)}
                  onSendMessage={(content, type, fileData) => sendMessage(chat.conversation_id, content, type, fileData)}
                  onTyping={() => sendTyping(chat.conversation_id)}
                  typingUser={typingUsers[chat.conversation_id]}
                  onAttachFileClick={() => {
                    pendingUploadConversationRef.current = chat.conversation_id;
                    fileInputRef.current?.click();
                  }}
                  onAttachImageClick={() => {
                    pendingUploadConversationRef.current = chat.conversation_id;
                    imageInputRef.current?.click();
                  }}
                  onPasteFile={(file) => uploadFile(file, "image", chat.conversation_id)}
                  onClose={() => closeChatWindow(chat.conversation_id)}
                  onMinimize={() => toggleChatMinimize(chat.conversation_id)}
                  onUpdateGroup={(name, ids) => updateGroup(chat.conversation_id, name, ids)}
                  onLeaveGroup={() => leaveGroup(chat.conversation_id)}
                  onEditMessage={(messageId, content) => editMessage(chat.conversation_id, messageId, content)}
                  onDeleteMessage={(messageId) => deleteMessage(chat.conversation_id, messageId)}
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
        <div
          className="flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-900 border-b border-black/10 dark:border-white/10 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
          onClick={() => setMinimized(!minimized)}
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {minimized && totalUnread > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                  {totalUnread > 99 ? "99+" : totalUnread}
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
            loading={initialLoading}
            error={loadError}
            onRetry={() => {
              setInitialLoading(true);
              Promise.all([fetchConversations(), fetchUsers()])
                .then(() => setLoadError(false))
                .catch(() => setLoadError(true))
                .finally(() => setInitialLoading(false));
            }}
            onSelectConversation={openConversationWindow}
            onStartConversation={startConversation}
            userId={user?.id}
          />
        )}

        {/* Hidden file inputs - shared by every open window, so which
            conversation an upload belongs to comes from
            pendingUploadConversationRef (set when a window's attach/image
            button triggers the click), not activeChat. */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (file && pendingUploadConversationRef.current) uploadFile(file, "file", pendingUploadConversationRef.current);
          }}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
        />
        <input
          type="file"
          ref={imageInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (file && pendingUploadConversationRef.current) uploadFile(file, "image", pendingUploadConversationRef.current);
          }}
          accept="image/*"
        />
      </div>

      {isAdmin && <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} users={users} onCreate={createGroup} />}
    </>
  );
}

function ChatListView({ conversations, users, loading, error, onRetry, onSelectConversation, onStartConversation, userId }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const title = conv.is_group ? conv.name : conv.participants?.[0]?.name;
    const q = searchQuery.toLowerCase();
    return title?.toLowerCase().includes(q) || conv.last_message?.toLowerCase().includes(q);
  });

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
  });

  // "Other Users" only lists people you haven't DM'd yet - group membership
  // doesn't count, since you can always start a separate DM with someone
  // in a group.
  const conversationUserIds = new Set(conversations.filter((c) => !c.is_group).map((c) => c.participants?.[0]?.id));
  const usersWithoutConversations = filteredUsers.filter((u) => !conversationUserIds.has(u.id));

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-black border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-lg overflow-hidden">
      <div className="p-2 border-b border-gray-200 dark:border-zinc-800">
        <Input
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-zinc-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-400 py-10">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading conversations...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-400 py-10 px-4 text-center">
            <span className="text-sm">Couldn't load your messages.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && (
          <div className="p-2">
            {filteredConversations.map((conv) => {
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
                      <AvatarFallback className={conv.is_group ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"}>
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
                      <div className="text-xs text-zinc-500">{formatRelativeTime(conv.last_message_time)}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-400 truncate">
                        {conv.last_message_sender_id === userId && "You: "}
                        {conv.last_message || (conv.is_group ? `${(conv.participants?.length || 0) + 1} members` : "No messages yet")}
                      </div>
                      {conv.unread_count > 0 && (
                        <Badge className="bg-emerald-600 text-white text-xs min-w-[20px] h-5 flex items-center justify-center">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {usersWithoutConversations.length > 0 && (
              <>
                {filteredConversations.length > 0 && <div className="text-xs text-gray-500 mt-4 mb-2 px-2">Other Users</div>}
                {usersWithoutConversations.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                    onClick={() => onStartConversation(u)}
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-emerald-600 text-white">{getInitials(u.name)}</AvatarFallback>
                      </Avatar>
                      {u.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-gray-900 dark:text-white">{u.name}</div>
                      <div className="text-xs text-gray-500 truncate">{formatPresence(u.is_online, u.last_active)}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {filteredConversations.length === 0 && usersWithoutConversations.length === 0 && (
              <div className="text-center text-gray-400 py-10 px-4 text-sm">{searchQuery ? "No matches." : "No one to message yet."}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
      setMemberIds([...(currentUser?.id ? [currentUser.id] : []), ...(chat?.participants || []).map((p) => p.id)]);
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
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white" />
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
                <AvatarFallback className="bg-emerald-600 text-white text-xs">{getInitials(currentUser?.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{currentUser?.name} (you)</span>
            </div>
            {(chat?.participants || []).map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-1.5">
                <div className="relative">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-emerald-600 text-white text-xs">{getInitials(p.name)}</AvatarFallback>
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
          <Button variant="outline" onClick={onLeave} className="border-red-300 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
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
                <Button onClick={handleSave} disabled={!name.trim() || memberIds.length < 2 || submitting} className="bg-emerald-500 text-black hover:bg-emerald-400">
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

function ChatWindowView({
  chat,
  user,
  allUsers,
  messages,
  loaded,
  loading,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onSendMessage,
  onTyping,
  typingUser,
  onAttachFileClick,
  onAttachImageClick,
  onPasteFile,
  onClose,
  onMinimize,
  onUpdateGroup,
  onLeaveGroup,
  onEditMessage,
  onDeleteMessage,
}) {
  const [message, setMessage] = useState("");
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const prevMessageCountRef = useRef(0);

  const isGroup = !!chat.is_group;
  const memberCount = (chat.participants?.length || 0) + 1; // + self

  useEffect(() => {
    // Only auto-scroll for genuinely new messages, not while prepending
    // older history from a scroll-up load.
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    onSendMessage(message);
    setMessage("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    if (!typingTimeoutRef.current) {
      onTyping();
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    }
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current || loadingOlder || !hasMore) return;
    if (messagesContainerRef.current.scrollTop === 0) onLoadOlder();
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        onPasteFile(items[i].getAsFile());
        break;
      }
    }
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

  const groups = [];
  let currentDate = null;
  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groups.push({ type: "date", date: msg.created_at });
    }
    groups.push({ type: "message", data: msg });
  });

  return (
    <>
      <div className="flex flex-col flex-1 bg-white dark:bg-black border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-lg overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <Avatar className="w-8 h-8">
                <AvatarFallback className={isGroup ? "bg-blue-600 text-white text-xs" : "bg-emerald-600 text-white text-xs"}>
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
              <Button variant="ghost" size="sm" className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white" onClick={() => setGroupInfoOpen(true)} title="Group info">
                <Info className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400" onClick={onMinimize} title="Minimize">
              <Minus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="p-1 h-6 w-6 text-gray-500 dark:text-zinc-400 hover:text-red-400" onClick={onClose} title="Close">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 p-2 overflow-y-auto" style={{ flex: "1 1 auto", minHeight: "0" }} ref={messagesContainerRef} onScroll={handleScroll}>
          {loadingOlder && (
            <div className="flex justify-center py-1">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}

          {!loaded && loading && (
            <div className="flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-zinc-400 py-8">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Loading messages...</span>
            </div>
          )}

          {loaded && messages.length === 0 && (
            <div className="flex items-center justify-center text-center text-gray-400 text-sm py-8 px-4">
              No messages yet. Say hi to {chatTitle(chat)}!
            </div>
          )}

          {groups.map((item, index) => {
            if (item.type === "date") {
              return (
                <div key={`date-${index}`} className="text-center text-[10px] text-zinc-500 my-1">
                  {formatDateLabel(item.date)}
                </div>
              );
            }

            const msg = item.data;
            const isOwn = msg.sender_id === user.id;
            const isImage = msg.message_type === "image";
            const isEditing = editingMessageId === msg.id;
            const otherCount = chat.participants?.length || 0;
            const readByCount = (msg.read_by || []).length;
            const readByNames = isGroup ? (msg.read_by || []).map((id) => chat.participants?.find((p) => p.id === id)?.name).filter(Boolean) : [];

            return (
              <div key={msg.id} className={`group flex mb-1 items-end gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                {isOwn && !msg.is_deleted && !isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {msg.message_type === "text" && (
                      <button onClick={() => startEditingMessage(msg)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" title="Edit message">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => setDeleteMessageId(msg.id)} className="p-1 text-gray-400 hover:text-red-400" title="Delete message">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className={`max-w-[70%] rounded px-2 py-1 text-sm ${isOwn ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-zinc-100"}`}>
                  {isGroup && !isOwn && <div className="text-[10px] font-medium text-emerald-500 mb-0.5">{msg.sender_name}</div>}

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
                        className="h-7 text-sm bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                      />
                      <div className="flex justify-end gap-2 text-[10px]">
                        <button onClick={cancelEditingMessage} className="underline opacity-80 hover:opacity-100">Cancel</button>
                        <button onClick={saveEditingMessage} disabled={!editingText.trim()} className="underline font-medium disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isImage && msg.file_url && (
                        <div className="mb-1">
                          <img src={`${FILE_ORIGIN}${msg.file_url}`} alt={msg.file_name || "Image"} className="max-w-full rounded" loading="lazy" />
                        </div>
                      )}

                      {msg.message_type === "file" && msg.file_url && (
                        <a
                          href={`${FILE_ORIGIN}${msg.file_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 mb-1 ${isOwn ? "text-emerald-100 hover:text-white" : "text-emerald-600 dark:text-emerald-400"}`}
                        >
                          <Paperclip className="w-3 h-3" />
                          <span className="text-xs underline">{msg.file_name || "File"}</span>
                        </a>
                      )}

                      {msg.content && (
                        <div className="break-words">
                          {msg.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                            /^https?:\/\/[^\s]+$/.test(part) ? (
                              <a
                                key={i}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline ${isOwn ? "text-emerald-100 hover:text-white" : "text-emerald-600 dark:text-emerald-400"}`}
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

                  {!isEditing && (
                    <div className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${isOwn ? "text-emerald-100" : "text-gray-500 dark:text-zinc-400"}`}>
                      <span>{formatTimeLabel(msg.created_at)}</span>
                      {msg.edited && !msg.is_deleted && <span className="italic">(edited)</span>}
                      {isOwn && msg.failed && <span>Failed to send</span>}
                      {isOwn && !msg.failed && !msg.is_deleted && (
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

        <div className="flex items-center gap-1 px-2 py-1 border-t border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
          <Button variant="ghost" size="sm" className="p-1 h-8 w-8" onClick={onAttachFileClick} title="Attach file">
            <Paperclip className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
          </Button>
          <Button variant="ghost" size="sm" className="p-1 h-8 w-8" onClick={onAttachImageClick} title="Send image">
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
                  <button key={idx} onClick={() => insertEmoji(emoji)} className="text-lg leading-none p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800">
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
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="flex-1 h-8 text-sm bg-gray-200 dark:bg-zinc-700 border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
          />
          <Button variant="ghost" size="sm" className="p-1 h-8 w-8" onClick={handleSend} disabled={!message.trim()}>
            <Send className={`w-4 h-4 ${message.trim() ? "text-emerald-500" : "text-gray-400"}`} />
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
            <Button onClick={handleConfirmDeleteMessage} disabled={deletingMessage} className="bg-red-600 text-white hover:bg-red-700">
              {deletingMessage ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
