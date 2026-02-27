import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, Paperclip, Image as ImageIcon, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

const API = `${process.env.REACT_APP_API_URL}/api`;

export default function Chat({ user, openChats, setOpenChats, activeChat, setActiveChat }) {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [showChatList, setShowChatList] = useState(true);
  const [minimized, setMinimized] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
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

  // WebSocket for real-time chat
  useEffect(() => {
    if (!token || !user?.id) return;

    // Connect to WebSocket
    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8000'}/api/ws/chat/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
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
      console.log('WebSocket disconnected');
      wsConnectedRef.current = false;
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (!wsConnectedRef.current && token && user?.id) {
          const reconnectWs = new WebSocket(wsUrl);
          wsRef.current = reconnectWs;
        }
      }, 3000);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [token, user?.id]);

  // Also fetch conversations on mount (for initial load)
  useEffect(() => {
    if (!token || !user?.id) return;

    const fetchConversations = async () => {
      try {
        const convResponse = await axios.get(`${API}/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setConversations(convResponse.data);
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    };

    fetchConversations();
  }, [token, user?.id]);

  // Send message via WebSocket
  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // Callback to directly add message to ChatWindowView's local state for instant display
  const handleMessageSent = useCallback((messageData) => {
    const { conversationId, message } = messageData;
    
    // Update openChats with the new message
    setOpenChats((prev) => prev.map(chat =>
      chat.conversation_id === conversationId
        ? { ...chat, messages: [...(chat.messages || []), message] }
        : chat
    ));
    
    // Also update activeChat if it's the same conversation
    if (activeChat && activeChat.conversation_id === conversationId) {
      setActiveChat((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), message],
      }));
    }
    
    // Update conversations
    setConversations((prev) => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, unread_count: 0, last_message: message.content, last_message_time: message.created_at, last_message_sender_id: message.sender_id }
        : conv
    ));
  }, [activeChat]);

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
      default:
        break;
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
    // Update messages as read in the active conversation
    // When user B reads messages from user A, data.read_by = user B's ID
    // We want to mark messages from user A as read (messages where sender_id != read_by)
    if (activeChat && data.conversation_id === activeChat.conversation_id) {
      setActiveChat((prev) => ({
        ...prev,
        messages: prev.messages?.map((msg) => ({
          ...msg,
          // Mark as read if the message sender is NOT the one who read (i.e., it's a message from the other person)
          is_read: msg.sender_id !== data.read_by ? true : msg.is_read,
        })) || [],
      }));
    }

    // Also update messages in openChats for consistency
    setOpenChats((prev) =>
      prev.map((chat) => {
        if (chat.conversation_id === data.conversation_id) {
          return {
            ...chat,
            messages: chat.messages?.map((msg) => ({
              ...msg,
              is_read: msg.sender_id !== data.read_by ? true : msg.is_read,
            })) || [],
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

  // Periodic refresh for online status (every 30 seconds)
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      fetchConversations();
      fetchUsers();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [token]);

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

  const startConversation = async (otherUser) => {
    console.log("startConversation called with:", otherUser);
    try {
      const response = await axios.post(
        `${API}/chat/conversations`,
        { participant_id: otherUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Conversation created:", response.data);
      const conversation = response.data;

      // Check if already in open chats
      const existingChat = openChats.find((c) => c.conversation_id === conversation.id);
      if (existingChat) {
        // If minimized, maximize it
        if (existingChat.minimized) {
          setOpenChats(prev => prev.map(chat => 
            chat.conversation_id === conversation.id 
              ? { ...chat, minimized: false } 
              : chat
          ));
        }
        setActiveChat(existingChat);
      } else {
        // Add to open chats with user info
        const newChat = {
          conversation_id: conversation.id,
          participant: conversation.participants[0],
          messages: [],
          unreadCount: 0,
          minimized: false,
        };
        console.log("Adding new chat to openChats:", newChat);
        setOpenChats((prev) => [...prev, newChat]);
        setActiveChat(newChat);
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
      console.error("Error response:", error.response?.data);
    }
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

    // Send to API
    try {
      await axios.post(
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
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const sendTyping = (conversationId = null) => {
    // Send typing indicator via WebSocket
    const targetConvId = conversationId || (activeChat ? activeChat.conversation_id : null);
    if (!targetConvId) return;
    
    const targetChat = conversationId 
      ? openChats.find(c => c.conversation_id === conversationId)
      : activeChat;
    
    if (!targetChat?.participant) return;
    
    sendWebSocketMessage({
      type: "typing",
      conversation_id: targetConvId,
      user_id: user.id,
      recipient_id: targetChat.participant.id
    });
  };

  const markAsRead = async (conversationId = null) => {
    const targetConvId = conversationId || (activeChat ? activeChat.conversation_id : null);
    const targetChat = conversationId 
      ? openChats.find(c => c.conversation_id === conversationId)
      : activeChat;
    
    if (!targetConvId || !targetChat?.participant) return;
    
    const otherUserId = targetChat.participant.id;
    
    // Mark as read via API
    try {
      await axios.post(
        `${API}/chat/messages/read`,
        {
          conversation_id: targetConvId,
          other_user_id: otherUserId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Notify other user via WebSocket for real-time update
      sendWebSocketMessage({
        type: "message_read",
        conversation_id: targetConvId,
        read_by: user.id,
        recipient_id: otherUserId
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
    
    // Update local message read status for messages from the other user
    const updateMessagesReadStatus = (msgs) => {
      return (msgs || []).map(msg => {
        // Mark as read if it's from the other user
        if (msg.sender_id === otherUserId) {
          return { ...msg, is_read: true };
        }
        return msg;
      });
    };
    
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

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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
          className={`fixed z-40 flex flex-col bg-black border border-zinc-700 text-white transition-all duration-300 ${
            chat.minimized 
              ? "bottom-2" 
              : "bottom-2"
          }`}
          style={{ 
            right: `${rightPos}px`,
            width: chat.minimized ? "150px" : "380px",
            height: chat.minimized ? "50px" : "500px"
          }}
        >
          {/* Chat Header - only show when minimized */}
          {chat.minimized && (
            <div 
              className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-700 cursor-pointer hover:bg-zinc-800"
              onClick={() => handleChatTabClick(chat)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-medium truncate text-sm flex items-center gap-1 mr-6">
                  {chat.participant?.name || chat.participant?.username}
                  {chat.unreadCount > 0 && (
                    <Badge className="bg-red-500 text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Badge>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 text-zinc-400 hover:text-red-400"
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
                onSendMessage={(content, type, fileData) => sendMessage(content, type, fileData, chat.conversation_id)}
                onRegisterMessageCallback={registerMessageCallback}
                onTyping={sendTyping}
                onMarkAsRead={() => markAsRead(chat.conversation_id)}
                typingUser={typingUsers[chat.conversation_id]}
                onFileUpload={(e, t) => handleFileUpload(e, t, chat.conversation_id)}
                fileInputRef={fileInputRef}
                imageInputRef={imageInputRef}
                getInitials={getInitials}
                onClose={() => closeChatWindow(chat.conversation_id)}
                onMinimize={() => toggleChatMinimize(chat.conversation_id)}
                isFloating={true}
              />
            </div>
          )}
        </div>
      );
      })}

      {/* Main Chat Widget */}
      <div
        className={`fixed bottom-0 right-4 z-50 flex flex-col bg-black border border-zinc-800 ${
          minimized ? "h-12" : "h-[500px]"
        } transition-all duration-300 text-white`}
        style={{ width: minimized ? "60px" : "380px" }}
      >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-white/10 rounded-t-lg cursor-pointer hover:bg-zinc-800"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {minimized && totalUnread > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center p-0">
                {totalUnread > 99 ? '99+' : totalUnread}
              </Badge>
            )}
          </div>
          {!minimized && <span className="font-medium">Messages</span>}
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {!minimized && (
        <>
          {/* Chat List View - Coming soon message instead */}
          <div className="flex flex-col flex-1 bg-black border border-t-0 border-gray-800 rounded-b-lg overflow-hidden p-4">
            <div className="flex-1 flex items-center justify-center">
              <div className="text-white text-lg">Coming soon...</div>
            </div>
          </div>
        </>
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
    </>
  );
}

// Chat List View Component
function ChatListView({
  conversations,
  users,
  onSelectConversation,
  onStartConversation,
  userId,
  getInitials,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const participant = conv.participants?.[0];
    return (
      participant?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  // Get users who don't have a conversation yet
  const conversationUserIds = new Set(conversations.map(c => c.participants?.[0]?.id));
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
    <div className="flex flex-col flex-1 bg-black border border-t-0 border-gray-800 rounded-b-lg overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-zinc-800">
        <Input
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* List - Combined list showing conversations and users without conversations */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {/* Show conversations */}
          {filteredConversations.length > 0 && filteredConversations.map((conv) => {
            const participant = conv.participants?.[0];
            return (
              <div
                key={conv.id}
                className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded-lg cursor-pointer"
                onClick={() => onSelectConversation(conv)}
              >
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-emerald-600 text-white">
                      {getInitials(participant?.name)}
                    </AvatarFallback>
                  </Avatar>
                  {participant?.is_online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium truncate text-white">{participant?.name}</div>
                    <div className="text-xs text-zinc-500">
                      {formatTime(conv.last_message_time)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-400 truncate">
                      {conv.last_message_sender_id === userId && "You: "}
                      {conv.last_message || "No messages yet"}
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
          {filteredConversations.length === 0 && (
            <div className="text-center text-gray-400 py-8">No conversations yet</div>
          )}
          
          {/* Show users without conversations */}
          {usersWithoutConversations.length > 0 && (
            <>
              {filteredConversations.length > 0 && (
                <div className="text-xs text-gray-500 mt-4 mb-2 px-2">Other Users</div>
              )}
              {usersWithoutConversations.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded-lg cursor-pointer"
                  onClick={() => onStartConversation(user)}
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-emerald-600 text-white">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    {user.is_online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-white">{user.name}</div>
                    <div className="text-xs text-gray-500 truncate">{user.is_online ? 'Online' : 'Offline'}</div>
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
  onSendMessage,
  onRegisterMessageCallback,
  onTyping,
  onMarkAsRead,
  typingUser,
  onFileUpload,
  fileInputRef,
  imageInputRef,
  getInitials,
  onClose,
  onMinimize,
}) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [hasLoadedFromApi, setHasLoadedFromApi] = useState(false);
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesContainerRef = useRef(null);

  // Register callback for direct message addition when sending messages
  useEffect(() => {
    if (onRegisterMessageCallback) {
      onRegisterMessageCallback((messageData) => {
        // Directly add message to local state for instant display
        setMessages(prev => [...prev, messageData.message]);
      });
    }
  }, [onRegisterMessageCallback]);

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
        // Merge parent messages with local read status preserved
        const mergedMessages = chat.messages.map(parentMsg => {
          const localMsg = messages.find(m => m.id === parentMsg.id);
          // If local has is_read=true, preserve it - never overwrite with false
          if (localMsg?.is_read === true) {
            return { ...parentMsg, is_read: true };
          }
          return { ...parentMsg, is_read: parentMsg.is_read || false };
        });
        
        // Add any local-only messages (should be rare)
        const localOnlyMessages = messages.filter(m => !parentIds.has(m.id));
        
        setMessages([...mergedMessages, ...localOnlyMessages]);
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

    messages.forEach((msg) => {
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
    <div className="flex flex-col flex-1 bg-black border border-t-0 border-gray-800 rounded-b-lg overflow-hidden" style={{ minHeight: 0 }}>
      {/* Chat Header */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-white/10 bg-zinc-900">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-emerald-600 text-white text-xs">
                {getInitials(chat.participant?.name)}
              </AvatarFallback>
            </Avatar>
            {chat.participant?.is_online && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-gray-800" />
            )}
          </div>
          <div>
            <div className="font-medium text-sm text-white">{chat.participant?.name}</div>
            <div className="text-[10px] text-zinc-400">
              {chat.participant?.is_online ? "Online" : "Offline"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-zinc-400 hover:text-white"
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
              className="p-1 h-6 w-6 text-zinc-400 hover:text-red-400"
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
          <div className="text-center text-zinc-400 py-4">Loading...</div>
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

          return (
            <div
              key={msg.id}
              className={`flex mb-1 ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded px-2 py-1 text-sm ${
                  isOwn
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-100"
                }`}
              >
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
                      isOwn ? "text-emerald-200 hover:text-white" : "text-emerald-400 hover:text-emerald-300"
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
                            isOwn ? "text-emerald-200 hover:text-white" : "text-emerald-400 hover:text-emerald-300"
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

                {/* Timestamp */}
                <div
                  className={`text-[10px] mt-0.5 ${
                    isOwn ? "text-emerald-200" : "text-gray-400"
                  }`}
                >
                  {formatTime(msg.created_at)}
                  {isOwn && msg.is_read && " • Read"}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUser && typingUser.user_id !== user.id && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
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
      <div className="flex items-center gap-1 px-2 py-1 border-t border-white/10 bg-zinc-900">
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-8 w-8"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip className="w-4 h-4 text-zinc-400" />
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
        <Input
          ref={inputRef}
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          className="flex-1 h-8 text-sm bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-400"
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
  );
}
