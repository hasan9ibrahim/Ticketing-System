import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import axios from "axios";
import Chat from "@/components/Chat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LayoutDashboard,
  MessageSquare,
  Phone,
  Building2,
  Users,
  LogOut,
  Menu,
  X,
  Hexagon,
  Briefcase,
  Settings,
  Shield,
  AlertTriangle,
  ClipboardList,
  Bell,
  FileText,
  Database,
  Calendar,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export default function DashboardLayout({ user, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [ticketModificationNotifications, setTicketModificationNotifications] = useState([]);
  const [assignedReminders, setAssignedReminders] = useState([]);
  const [showReminders, setShowReminders] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [alertNotifications, setAlertNotifications] = useState([]);  // Alert notifications for References page
  const [sidebarSmsAlerts, setSidebarSmsAlerts] = useState([]);  // SMS alerts for sidebar badge
  const [sidebarVoiceAlerts, setSidebarVoiceAlerts] = useState([]);  // Voice alerts for sidebar badge
  const [sidebarPendingRequests, setSidebarPendingRequests] = useState([]);  // Pending requests for sidebar badge
  const [requestNotifications, setRequestNotifications] = useState([]);  // Request update notifications for AMs
  const [showAlertNotifications, setShowAlertNotifications] = useState(false);  // Toggle notification popover
  // Chat state
  const [openChats, setOpenChats] = useState([]);  // Array of open chat conversations
  const [activeChat, setActiveChat] = useState(null);  // Currently active chat
  // Load read notification IDs from localStorage to persist across login/logout
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    const saved = localStorage.getItem("readNotificationIds");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [selectedNotification, setSelectedNotification] = useState(null);  // For detail popup
  const [notificationKey, setNotificationKey] = useState(0);  // Force re-render when same notification clicked
  // Track dismissed notifications - permanently removed by X button
  const [dismissedNotifications, setDismissedNotifications] = useState(() => {
    const saved = localStorage.getItem("dismissedNotifications");
    return saved ? JSON.parse(saved) : {};
  });
  
  // Use ref to always have current dismissedNotifications in interval callbacks
  const dismissedNotificationsRef = useRef(dismissedNotifications);
  useEffect(() => {
    dismissedNotificationsRef.current = dismissedNotifications;
  }, [dismissedNotifications]);

  // Load read ticket notifications from localStorage to persist across login/logout
  const [readTicketNotifications, setReadTicketNotifications] = useState(() => {
    const saved = localStorage.getItem("readTicketNotifications");
    return saved ? JSON.parse(saved) : [];
  });
  // Load read alert notifications from localStorage to persist across login/logout
  const [readAlertNotifications, setReadAlertNotifications] = useState(() => {
    const saved = localStorage.getItem("readAlertNotifications");
    return saved ? JSON.parse(saved) : [];
  });

  // Helper to get unread count (excluding dismissed notifications)
  const getUnreadCount = () => {
    const ticketUnread = ticketModificationNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length;
    const alertUnread = alertNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length;
    // Add request notifications (AM role gets request update notifications)
    const requestUnread = user.role === "am" ? requestNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length : 0;
    return ticketUnread + alertUnread + requestUnread;
  };

  // Helper to get the highest priority notification type for badge color
  // Priority: Alert (red) > Ticket (blue) > Request (green)
  const getHighestPriorityNotificationType = () => {
    const alertUnread = alertNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length;
    const ticketUnread = ticketModificationNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length;
    const requestUnread = user.role === "am" ? requestNotifications
      .filter(n => !dismissedNotifications[n.id] && !readNotificationIds.has(n.id)).length : 0;
    
    if (alertUnread > 0) return 'alert';
    if (ticketUnread > 0) return 'ticket';
    if (requestUnread > 0) return 'request';
    return 'none';
  };

  // Persist readNotificationIds to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("readNotificationIds", JSON.stringify([...readNotificationIds]));
  }, [readNotificationIds]);

  // Persist dismissedNotifications to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("dismissedNotifications", JSON.stringify(dismissedNotifications));
  }, [dismissedNotifications]);

  // Handle clicking on ticket notification - mark as read and navigate to ticket
  const handleTicketNotificationClick = async (notification) => {
    if (!readNotificationIds.has(notification.id)) {
      try {
        const token = localStorage.getItem("token");
        await axios.post(`${API}/dashboard/ticket-modifications/${notification.id}/read`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Add to read list but keep in UI (notification stays until dismissed with X)
        setReadNotificationIds(prev => new Set([...prev, notification.id]));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    // Navigate to the ticket based on ticket type
    const ticketType = notification.ticket_type || 'sms';
    const ticketId = notification.ticket_id || notification.ticket_number;
    if (ticketId) {
      const targetPath = ticketType === 'voice' ? '/voice-tickets' : '/sms-tickets';
      navigate(`${targetPath}?ticket=${ticketId}`);
    }
    // Close the popover
    setShowAlertNotifications(false);
  };

  // Handle clicking on alert notification - mark as read and navigate to alert
  const handleAlertNotificationClick = async (notification) => {
    if (!readNotificationIds.has(notification.id)) {
      try {
        const token = localStorage.getItem("token");
        await axios.post(`${API}/users/me/alert-notifications/${notification.id}/read`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Add to read list but keep in UI (notification stays until dismissed with X)
        setReadNotificationIds(prev => new Set([...prev, notification.id]));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    // Navigate to the alert
    if (notification.alert_ticket_number) {
      navigate(`/references?alert=${notification.alert_ticket_number}`);
    }
    // Close the popover
    setShowAlertNotifications(false);
  };

  // Handle clicking on request notification - mark as read and navigate to request
  const handleRequestNotificationClick = async (notification) => {
    if (!readNotificationIds.has(notification.id)) {
      try {
        const token = localStorage.getItem("token");
        await axios.post(`${API}/users/me/request-notifications/${notification.id}/read`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Add to read list but keep in UI (notification stays until dismissed with X)
        setReadNotificationIds(prev => new Set([...prev, notification.id]));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    // Navigate to the request
    if (notification.request_id) {
      const uniqueKey = Date.now();
      // Store the request ID in localStorage with a unique key for re-navigation
      localStorage.setItem('openRequestParam', `request=${notification.request_id}&key=${uniqueKey}`);
      // Navigate to requests page
      navigate(`/requests?request=${notification.request_id}&key=${uniqueKey}`);
    }
    // Close the popover
    setShowAlertNotifications(false);
  };

  // Combine all notifications from backend (both read and unread)
  // Filter out dismissed notifications
  const getAllTicketNotifications = () => {
    // Return all notifications minus dismissed ones
    return ticketModificationNotifications.filter(n => !dismissedNotifications[n.id]);
  };

  const getAllAlertNotifications = () => {
    // Return all notifications minus dismissed ones
    return alertNotifications.filter(n => !dismissedNotifications[n.id]);
  };

  // Get all notifications combined and sorted by time (newest first)
  const getAllNotificationsSorted = () => {
    const ticketNotifs = getAllTicketNotifications();
    const alertNotifs = getAllAlertNotifications();
    // Add request notifications for AM users
    const requestNotifs = user.role === "am" 
      ? requestNotifications.filter(n => !dismissedNotifications[n.id])
      : [];
    
    // Combine all notifications
    const all = [...ticketNotifs, ...alertNotifs, ...requestNotifs];
    
    // Sort by created_at descending (newest first)
    return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  // Handle closing notification detail popup
  const handleCloseNotificationDetail = () => {
    setSelectedNotification(null);
  };

  // Handle permanent removal via X button - mark as read AND dismiss locally
  const handleRemoveTicketNotification = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/dashboard/ticket-modifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Add to dismissed list so it doesn't come back
      setDismissedNotifications(prev => ({ ...prev, [notificationId]: Date.now() }));
      // Remove from UI
      setTicketModificationNotifications(prev => prev.filter(n => n.id !== notificationId));
      setReadNotificationIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    } catch (error) {
      console.error("Failed to remove notification:", error);
    }
  };

  // Handle permanent removal via X button - mark as read AND dismiss locally
  const handleRemoveAlertNotification = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/users/me/alert-notifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Add to dismissed list so it doesn't come back
      setDismissedNotifications(prev => ({ ...prev, [notificationId]: Date.now() }));
      // Remove from UI
      setAlertNotifications(prev => prev.filter(n => n.id !== notificationId));
      setReadNotificationIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    } catch (error) {
      console.error("Failed to remove notification:", error);
    }
  };

  // Handle permanent removal via X button for request notifications
  const handleRemoveRequestNotification = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/users/me/request-notifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Add to dismissed list so it doesn't come back
      setDismissedNotifications(prev => ({ ...prev, [notificationId]: Date.now() }));
      // Remove from UI
      setRequestNotifications(prev => prev.filter(n => n.id !== notificationId));
      setReadNotificationIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    } catch (error) {
      console.error("Failed to remove notification:", error);
    }
  };

  const [currentTime, setCurrentTime] = useState(new Date());  // Current date/time for clock
  // Track dismissed reminders: { [reminderId]: timestamp when dismissed }
  const [dismissedReminders, setDismissedReminders] = useState(() => {
    const saved = localStorage.getItem("dismissedReminders");
    return saved ? JSON.parse(saved) : {};
  });
  // Track dismissed unassigned alerts: { [alertId]: timestamp when dismissed }
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    const saved = localStorage.getItem("dismissedAlerts");
    return saved ? JSON.parse(saved) : {};
  });
  
  // Get interval in milliseconds based on priority
  const getPriorityIntervalMs = (priority) => {
    switch (priority) {
      case "Urgent": return 5 * 60 * 1000;   // 5 minutes
      case "High": return 10 * 60 * 1000;   // 10 minutes
      case "Medium": return 20 * 60 * 1000; // 20 minutes
      case "Low": return 30 * 60 * 1000;   // 30 minutes
      default: return 20 * 60 * 1000;      // Default to Medium (20 min)
    }
  };
  const navigate = useNavigate();
  const location = useLocation();

  const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

  // Helper function to format notification time
  const formatNotificationTime = (createdAt) => {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Fetch alert notifications function (defined first so it can be used in useEffect)
  const fetchAlertNotifications = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users/me/alert-notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const notifications = response.data || [];
      // Filter out dismissed notifications to prevent them reappearing after refetch
      const currentDismissed = dismissedNotificationsRef.current;
      setAlertNotifications(notifications.filter(n => !currentDismissed[n.id]));
    } catch (error) {
      // Silently handle errors - notifications are not critical
      console.log("Alert notifications unavailable:", error.message);
      setAlertNotifications([]);
    }
  };

  const markAlertNotificationAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/users/me/alert-notifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlertNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Failed to mark alert notification as read:", error);
    }
  };

  // Fetch alerts for sidebar badge count
  const fetchSidebarAlerts = async () => {
    try {
      const token = localStorage.getItem("token");
      // Fetch SMS alerts
      const smsRes = await axios.get(`${API}/alerts/sms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSidebarSmsAlerts(smsRes.data || []);
      
      // Fetch Voice alerts
      const voiceRes = await axios.get(`${API}/alerts/voice`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSidebarVoiceAlerts(voiceRes.data || []);
    } catch (error) {
      console.log("Sidebar alerts fetch error:", error.message);
    }
  };

  // Fetch pending requests for sidebar badge (NOC/Admin only)
  const fetchSidebarRequests = async () => {
    // Only fetch for NOC and Admin users
    if (user.role !== "noc" && user.role !== "admin") {
      setSidebarPendingRequests([]);
      return;
    }
    try {
      const token = localStorage.getItem("token");
      // Fetch all requests (we'll filter for pending ones)
      const res = await axios.get(`${API}/requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter for pending requests (status=pending AND not claimed)
      const pending = (res.data || []).filter(r => r.status === "pending" && !r.claimed_by);
      setSidebarPendingRequests(pending);
    } catch (error) {
      console.log("Sidebar requests fetch error:", error.message);
    }
  };

  // Fetch request update notifications (for AMs when their request is completed/rejected)
  const fetchRequestNotifications = async () => {
    // Only fetch for AM users
    if (user.role !== "am") {
      setRequestNotifications([]);
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/users/me/request-notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const notifications = res.data || [];
      // Filter out dismissed notifications to prevent them reappearing after refetch
      const currentDismissed = dismissedNotificationsRef.current;
      setRequestNotifications(notifications.filter(n => !currentDismissed[n.id]));
    } catch (error) {
      console.log("Request notifications fetch error:", error.message);
    }
  };

  // Compute unresolved alert counts for sidebar badge
  const unresolvedSmsCount = sidebarSmsAlerts.filter(a => !a.resolved).length;
  const unresolvedVoiceCount = sidebarVoiceAlerts.filter(a => !a.resolved).length;
  const totalUnresolvedAlerts = unresolvedSmsCount + unresolvedVoiceCount;
  
  // Determine badge count based on department type
  const getAlertBadgeCount = () => {
    const deptType = user?.department_type;
    if (deptType === "sms") return unresolvedSmsCount;
    if (deptType === "voice") return unresolvedVoiceCount;
    return totalUnresolvedAlerts;  // "all" or undefined shows total
  };
  const alertBadgeCount = getAlertBadgeCount();

  // Compute pending requests count by priority for sidebar badge (NOC/Admin only)
  const getPendingRequestsByPriority = () => {
    if (user.role !== "noc" && user.role !== "admin") return { total: 0, Urgent: 0, High: 0, Medium: 0, Low: 0 };
    return {
      total: sidebarPendingRequests.length,
      Urgent: sidebarPendingRequests.filter(r => r.priority === "Urgent").length,
      High: sidebarPendingRequests.filter(r => r.priority === "High").length,
      Medium: sidebarPendingRequests.filter(r => r.priority === "Medium").length,
      Low: sidebarPendingRequests.filter(r => r.priority === "Low").length,
    };
  };
  const pendingRequestsByPriority = getPendingRequestsByPriority();
  const pendingRequestsCount = pendingRequestsByPriority.total;

  // Refresh sidebar alerts when navigating to References page
  useEffect(() => {
    if (location.pathname === '/references') {
      fetchSidebarAlerts();
    }
    // Also refresh requests when navigating to Requests page
    if (location.pathname === '/requests') {
      fetchSidebarRequests();
    }
  }, [location.pathname]);

  // Update current time every second for the clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch alerts for NOC/Admin users
  useEffect(() => {
    if (user && (user.role === "noc" || user.role === "admin" || user?.department?.can_view_all_tickets)) {
      fetchAlerts(true); // true = is initial load
      // Refresh alerts every 30 seconds for faster updates when tickets are assigned
      const alertInterval = setInterval(() => fetchAlerts(false), 30000);
      return () => clearInterval(alertInterval);
    }
  }, [user]);

  // Fetch ticket modification notifications for all users
  useEffect(() => {
    if (user) {
      fetchTicketModifications();
      // Refresh every 10 seconds to catch notifications quickly
      const notificationInterval = setInterval(fetchTicketModifications, 10000);
      return () => clearInterval(notificationInterval);
    }
  }, [user]);

  // Fetch assigned ticket reminders for all users
  useEffect(() => {
    if (user) {
      fetchAssignedReminders(true); // true = is initial load
      // Refresh every 30 seconds to check for overdue tickets
      const reminderInterval = setInterval(() => fetchAssignedReminders(false), 30000);
      return () => clearInterval(reminderInterval);
    }
  }, [user]);

  // Fetch Alert notifications for all users (AMs and NOC)
  useEffect(() => {
    if (user) {
      fetchAlertNotifications();
      fetchSidebarAlerts();
      fetchSidebarRequests();
      fetchRequestNotifications();
      // Refresh every 30 seconds
      const alertNotifInterval = setInterval(fetchAlertNotifications, 30000);
      // Refresh sidebar alerts every 10 seconds to stay in sync with References page
      const sidebarAlertsInterval = setInterval(fetchSidebarAlerts, 10000);
      // Refresh sidebar requests every 10 seconds to stay in sync with Requests page
      const sidebarRequestsInterval = setInterval(fetchSidebarRequests, 10000);
      // Refresh request notifications every 30 seconds
      const requestNotifInterval = setInterval(fetchRequestNotifications, 30000);
      return () => {
        clearInterval(alertNotifInterval);
        clearInterval(sidebarAlertsInterval);
        clearInterval(sidebarRequestsInterval);
        clearInterval(requestNotifInterval);
      };
    }
  }, [user]);

  const fetchAlerts = async (isInitial = false) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/dashboard/unassigned-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fetchedAlerts = response.data || [];
      setAlerts(fetchedAlerts);
      
      // Filter out dismissed alerts that haven't expired yet (based on priority)
      const now = Date.now();
      const activeAlerts = fetchedAlerts.filter(a => {
        const dismissedTime = dismissedAlerts[a.id];
        if (!dismissedTime) return true;
        const intervalMs = getPriorityIntervalMs(a.priority);
        return (now - dismissedTime) >= intervalMs;
      });
      
      // Show alerts if there are active ones
      // On initial load AND on interval checks
      if (activeAlerts.length > 0) {
        setShowAlerts(true);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  };

  const fetchTicketModifications = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/dashboard/ticket-modifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const notifications = response.data || [];
      
      // Filter out notifications that have been dismissed (permanently removed by user)
      // Use ref to get current value in interval callback
      const currentDismissed = dismissedNotificationsRef.current;
      const filteredNotifications = notifications.filter(n => !currentDismissed[n.id]);
      setTicketModificationNotifications(filteredNotifications);
      
      // Don't auto-show popup - just show in bell dropdown
      // if (notifications.length > 0 && !currentNotification) {
      //   setCurrentNotification(notifications[0]);
      // }
    } catch (error) {
      console.error("Failed to fetch ticket modifications:", error);
    }
  };

  const fetchAssignedReminders = async (isInitial = false) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/dashboard/assigned-ticket-reminders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reminders = response.data || [];
      setAssignedReminders(reminders);
      
      const now = Date.now();
      
      // Filter out dismissed reminders that haven't expired yet (based on priority)
      const activeReminders = reminders.filter(r => {
        const dismissedTime = dismissedReminders[r.id];
        if (!dismissedTime) return true; // Not dismissed
        const intervalMs = getPriorityIntervalMs(r.priority);
        // Show again if priority-based interval has passed since dismissal
        return (now - dismissedTime) >= intervalMs;
      });
      
      // Show reminders if there are active ones
      // On initial load AND on interval checks
      if (activeReminders.length > 0) {
        setShowReminders(true);
      }
    } catch (error) {
      console.error("Failed to fetch assigned ticket reminders:", error);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("token");
      // Call backend logout endpoint to mark user as offline
      await axios.post(
        `${API}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      // Continue with logout even if API call fails
      console.error("Logout API call failed:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      navigate("/login");
    }
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "am", "noc"] },
    { path: "/sms-tickets", label: "SMS Tickets", icon: MessageSquare, roles: ["admin", "am", "noc"], ticketType: "sms" },
    { path: "/voice-tickets", label: "Voice Tickets", icon: Phone, roles: ["admin", "am", "noc"], ticketType: "voice" },
    { path: "/references", label: "References & Alerts", icon: Database, roles: ["admin", "am", "noc"], badgeCount: alertBadgeCount },
    { path: "/requests", label: "Requests", icon: FileText, roles: ["admin", "am", "noc"], badgeCount: pendingRequestsCount, priorityBadge: pendingRequestsByPriority },
    { path: "/enterprises", label: "Enterprises", icon: Building2, roles: ["admin", "noc"] },
    { path: "/my-enterprises", label: "My Enterprises", icon: Briefcase, roles: ["am"] },
    { path: "/users", label: "Users", icon: Users, roles: ["admin"] },
    { path: "/departments", label: "Departments", icon: Settings, roles: ["admin"] },
    { path: "/audit", label: "Audit Logs", icon: ClipboardList, roles: ["admin"] },
    { path: "/notifications", label: "Notifications", icon: Bell, roles: ["admin"] },
    { path: "/two-factor-setup", label: "2FA Setup", icon: Shield, roles: ["admin", "noc", "am"] },
    { path: "/noc-schedule", label: "NOC Schedule", icon: Calendar, roles: ["admin", "noc", "am"] },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles.includes(user.role)) return false;
    
    // Check department_type if available (new system)
    if (user.department_type && user.department_type !== "all") {
      // If user has a specific ticket type restriction, only show matching pages
      if (item.ticketType && item.ticketType !== user.department_type) {
        return false;
      }
    }
    
    // Legacy: For AMs with amTypes restriction, check if they match (backward compatibility)
    if (user.role === "am" && user.am_type && item.amTypes) {
      return item.amTypes.includes(user.am_type);
    }
    
    // For NOC and Admin, show all items in their roles
    return true;
  });

  // Compute active reminders (filter out those dismissed less than priority-based interval ago)
  const now = Date.now();
  const activeReminders = assignedReminders.filter(r => {
    const dismissedTime = dismissedReminders[r.id];
    if (!dismissedTime) return true;
    const intervalMs = getPriorityIntervalMs(r.priority);
    return (now - dismissedTime) >= intervalMs;
  });
  
  // Compute active alerts (filter out those dismissed less than priority-based interval ago)
  const activeAlerts = alerts.filter(a => {
    const dismissedTime = dismissedAlerts[a.id];
    if (!dismissedTime) return true;
    const intervalMs = getPriorityIntervalMs(a.priority);
    return (now - dismissedTime) >= intervalMs;
  });

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-zinc-950" data-testid="dashboard-layout">
      {/* Unassigned Tickets Alert - Top Left Notification */}
      {showAlerts && activeAlerts.length > 0 && (
        <div className="fixed top-4 left-4 z-50 max-w-md">
          <div className="bg-red-950/95 border border-red-500/50 rounded-lg shadow-lg p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <span className="text-red-400 font-semibold">Unassigned Tickets Alert</span>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full ml-auto">
                {activeAlerts.length}
              </span>
              <button
                onClick={() => {
                  // Dismiss all current alerts with timestamp
                  const now = Date.now();
                  const newDismissed = { ...dismissedAlerts };
                  alerts.forEach(a => {
                    newDismissed[a.id] = now;
                  });
                  setDismissedAlerts(newDismissed);
                  localStorage.setItem("dismissedAlerts", JSON.stringify(newDismissed));
                  setShowAlerts(false);
                }}
                className="ml-2 text-red-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {alerts.slice(0, 5).map((alert) => (
                <div
                  key={`${alert.type}-${alert.id}`}
                  className="flex items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded text-sm"
                >
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    alert.priority === "Urgent" ? "bg-red-500" :
                    alert.priority === "High" ? "bg-orange-500" :
                    alert.priority === "Medium" ? "bg-yellow-500" : "bg-blue-500"
                  }`} />
                  <span className="text-white font-medium">{alert.ticket_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    alert.priority === "Urgent" ? "bg-red-500/20 text-red-400" :
                    alert.priority === "High" ? "bg-orange-500/20 text-orange-400" :
                    alert.priority === "Medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                  }`}>
                    {alert.priority}
                  </span>
                  <span className="text-zinc-400 text-xs ml-auto">{alert.type.toUpperCase()}</span>
                </div>
              ))}
              {alerts.length > 5 && (
                <p className="text-zinc-400 text-xs text-center pt-2">
                  +{alerts.length - 5} more tickets
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assigned Ticket Reminders - Top Left */}
      {showReminders && activeReminders.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 max-w-md">
          <div className="bg-emerald-950/95 border border-emerald-500/50 rounded-lg shadow-lg p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Pending Assigned Tickets</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full ml-auto">
                {activeReminders.length}
              </span>
              <button
                onClick={() => {
                  // Dismiss all current reminders with timestamp
                  const now = Date.now();
                  const newDismissed = { ...dismissedReminders };
                  assignedReminders.forEach(r => {
                    newDismissed[r.id] = now;
                  });
                  setDismissedReminders(newDismissed);
                  localStorage.setItem("dismissedReminders", JSON.stringify(newDismissed));
                  setShowReminders(false);
                }}
                className="ml-2 text-emerald-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {activeReminders.slice(0, 5).map((reminder) => (
                <div
                  key={`${reminder.type}-${reminder.id}`}
                  className="flex items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded text-sm"
                >
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    reminder.priority === "Urgent" ? "bg-red-500" :
                    reminder.priority === "High" ? "bg-orange-500" :
                    reminder.priority === "Medium" ? "bg-yellow-500" : "bg-blue-500"
                  }`} />
                  <span className="text-white font-medium">{reminder.ticket_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    reminder.priority === "Urgent" ? "bg-red-500/20 text-red-400" :
                    reminder.priority === "High" ? "bg-orange-500/20 text-orange-400" :
                    reminder.priority === "Medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                  }`}>
                    {reminder.priority}
                  </span>
                  <span className="text-zinc-400 text-xs ml-auto">{reminder.type.toUpperCase()}</span>
                </div>
              ))}
              {activeReminders.length > 5 && (
                <p className="text-zinc-400 text-xs text-center pt-2">
                  +{activeReminders.length - 5} more tickets
                </p>
              )}
            </div>
            <p className="text-emerald-200 text-xs mt-2">
              These tickets have been assigned for too long. Please update their status.
            </p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0 lg:w-20"
        } bg-zinc-900 border-r border-white/5 transition-all duration-300 flex-shrink-0`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
            {sidebarOpen && (
              <div className="flex items-center gap-3">
  <img
    src="/Logo.png"
    alt="Wii Telecom"
    className="h-9 w-auto object-contain"
  />
                <span className="font-bold text-white text-lg">Wii NOC</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
              data-testid="sidebar-toggle"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 py-4 overflow-y-auto">
            <nav className="space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                const navButton = (
                  <Button
                    key={item.path}
                    variant="ghost"
                    data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    onClick={() => navigate(item.path)}
                    className={`w-full justify-start h-11 ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                    } transition-colors`}
                  >
                    <Icon className="h-5 w-5" />
                    {sidebarOpen && <span className="ml-3">{item.label}</span>}
                    {item.priorityBadge ? (
                      <div className="ml-auto flex gap-1">
                        {item.priorityBadge.Urgent > 0 && (
                          <Badge className="h-5 px-1.5 text-xs bg-red-600 hover:bg-red-700 min-w-[20px] justify-center">{item.priorityBadge.Urgent}</Badge>
                        )}
                        {item.priorityBadge.High > 0 && (
                          <Badge className="h-5 px-1.5 text-xs bg-orange-500 hover:bg-orange-600 min-w-[20px] justify-center">{item.priorityBadge.High}</Badge>
                        )}
                        {item.priorityBadge.Medium > 0 && (
                          <Badge className="h-5 px-1.5 text-xs bg-blue-600 hover:bg-blue-700 min-w-[20px] justify-center">{item.priorityBadge.Medium}</Badge>
                        )}
                        {item.priorityBadge.Low > 0 && (
                          <Badge className="h-5 px-1.5 text-xs bg-gray-500 hover:bg-gray-600 min-w-[20px] justify-center">{item.priorityBadge.Low}</Badge>
                        )}
                      </div>
                    ) : item.badgeCount > 0 ? (
                      <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">
                        {item.badgeCount}
                      </Badge>
                    ) : null}
                  </Button>
                );
                
                // Show tooltip only when sidebar is minimized
                if (!sidebarOpen) {
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        {navButton}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.label}
                        {item.priorityBadge && item.priorityBadge.total > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.priorityBadge.Urgent > 0 && (
                              <span className="text-red-400">U:{item.priorityBadge.Urgent}</span>
                            )}
                            {item.priorityBadge.High > 0 && (
                              <span className="text-orange-400">H:{item.priorityBadge.High}</span>
                            )}
                            {item.priorityBadge.Medium > 0 && (
                              <span className="text-blue-400">M:{item.priorityBadge.Medium}</span>
                            )}
                            {item.priorityBadge.Low > 0 && (
                              <span className="text-gray-400">L:{item.priorityBadge.Low}</span>
                            )}
                          </div>
                        )}
                        {!item.priorityBadge && item.badgeCount > 0 && (
                          <span className="ml-2 text-red-400">({item.badgeCount})</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                
                return navButton;
              })}
            </nav>
          </div>

          {/* User Info */}
          <div className="p-4 border-t border-white/5">
            {sidebarOpen ? (
              <div className="space-y-3 animate-fade-in">
                <div className="text-sm">
                  <p className="text-white font-medium">{user.username}</p>
                  <p className="text-zinc-500 capitalize">{user.role}</p>
                </div>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  data-testid="logout-button"
                  className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Logout
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-auto">
        {/* Top Header Bar with Notifications */}
        <header className="h-14 bg-zinc-900 border-b border-white/5 flex items-center justify-between px-4 gap-4">
          {/* Mobile Sidebar Expand Button - Only shows on mobile when sidebar is collapsed */}
          {!sidebarOpen ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <Menu className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          {/* Combined Notifications Bell Icon - Shows both Alert and Ticket notifications */}
          <Popover open={showAlertNotifications} onOpenChange={setShowAlertNotifications}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-zinc-400 hover:text-white">
                <Bell className="h-5 w-5" />
                {getUnreadCount() > 0 && (
                  <span className={`absolute -top-1 -right-1 h-4 w-4 rounded-full text-[10px] font-bold text-black flex items-center justify-center ${getHighestPriorityNotificationType() === 'alert' ? 'bg-red-500' : getHighestPriorityNotificationType() === 'ticket' ? 'bg-blue-500' : 'bg-green-500'}`}>
                    {getUnreadCount() > 9 ? '9+' : getUnreadCount()}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-zinc-900 border-zinc-700 text-white" align="end">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-700">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notifications
                  </h3>
                  <span className="text-xs text-zinc-400">{getUnreadCount()} unread</span>
                </div>
                {/* Notification type legend */}
                <div className="flex gap-3 text-xs pb-2 border-b border-zinc-700">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Alerts</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Tickets</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Requests</span>
                </div>
                <div className="max-h-80 overflow-y-auto overflow-x-hidden space-y-2">
                  {/* All Notifications Combined and Sorted by Time (Newest First) */}
                  {getAllNotificationsSorted().map((notification) => {
                    // Determine if this is an alert or request notification
                    const isAlert = !!notification.alert_ticket_number;
                    const isRequest = notification.type === "request_update" || !!notification.request_id;
                    
                    // Determine color based on notification type
                    const borderColor = isAlert ? 'border-red-500' : isRequest ? 'border-green-500' : 'border-blue-500';
                    const bgColor = isAlert ? 'bg-red-500/10' : isRequest ? 'bg-green-500/10' : 'bg-blue-500/10';
                    const indicatorColor = isAlert ? 'bg-red-500' : isRequest ? 'bg-green-500' : 'bg-blue-500';
                    
                    return (
                      <div 
                        key={notification.id} 
                        className={`flex items-start justify-between gap-2 p-2 rounded border-l-2 w-full ${readNotificationIds.has(notification.id) ? 'border-zinc-600 bg-zinc-800/30 opacity-60' : `${borderColor} ${bgColor}`}`}
                        onClick={() => isRequest ? handleRequestNotificationClick(notification) : isAlert ? handleAlertNotificationClick(notification) : handleTicketNotificationClick(notification)}
                      >
                        <div className="flex items-center gap-2">
                          {!readNotificationIds.has(notification.id) && (
                            <span className={`h-2 w-2 rounded-full ${indicatorColor} shrink-0`} />
                          )}
                          <div className="flex-1 min-w-0 cursor-pointer overflow-hidden">
                            {/* Title based on notification type */}
                            {isRequest ? (
                              <div className={`text-sm font-bold mb-1 ${readNotificationIds.has(notification.id) ? 'text-zinc-500' : 'text-green-400'}`}>
                                Request Update
                              </div>
                            ) : (
                              <div className={`text-sm font-bold mb-1 ${readNotificationIds.has(notification.id) ? 'text-zinc-500' : isAlert ? 'text-red-400' : 'text-blue-400'}`}>
                                {isAlert ? (
                                  notification.notification_type === 'created' ? 'New Alert' : 'Alert Update'
                                ) : (
                                  notification.event_type === 'created' ? 'New Ticket' : 'Ticket Update'
                                )}
                              </div>
                            )}
                            {/* For request notifications, show the full message */}
                            {isRequest ? (
                              <div className={`text-xs whitespace-pre-wrap ${readNotificationIds.has(notification.id) ? 'text-zinc-600' : 'text-zinc-300'}`}>
                                {notification.message}
                                <div className="mt-1 text-zinc-500">
                                  {formatNotificationTime(notification.created_at)}
                                  {readNotificationIds.has(notification.id) && ' (Read)'}
                                </div>
                              </div>
                            ) : (
                            /* Structured details for ticket/alert notifications */
                            <div className={`space-y-0.5 text-xs ${readNotificationIds.has(notification.id) ? 'text-zinc-600' : 'text-zinc-300'}`}>
                              {notification.priority && (
                                <div className="flex gap-1">
                                  <span className="text-zinc-500 shrink-0">Priority:</span>
                                  <span className={`font-medium ${
                                    notification.priority === 'Urgent' ? 'text-red-400' :
                                    notification.priority === 'High' ? 'text-orange-400' :
                                    notification.priority === 'Medium' ? 'text-blue-400' : 'text-zinc-400'
                                  }`}>{notification.priority}</span>
                                </div>
                              )}
                              <div className="flex gap-1">
                                <span className="text-zinc-500 shrink-0">{isAlert ? 'Enterprise:' : 'Customer:'}</span>
                                <span>{notification.customer_trunk || notification.vendor_trunk || notification.customer || '-'}</span>
                              </div>
                              {notification.destination && (
                                <div className="flex gap-1">
                                  <span className="text-zinc-500 shrink-0">Destination:</span>
                                  <span>{notification.destination}</span>
                                </div>
                              )}
                              {notification.issue_type && (
                                <div className="flex gap-1">
                                  <span className="text-zinc-500 shrink-0">Issue:</span>
                                  <span>{notification.issue_type}</span>
                                </div>
                              )}
                              {notification.status && (
                                <div className="flex gap-1">
                                  <span className="text-zinc-500 shrink-0">Status:</span>
                                  <span>{notification.status}</span>
                                </div>
                              )}
                              {notification.assigned_noc && !notification.alert_ticket_number && notification.status !== 'unassigned' && notification.status !== 'Pending' && notification.assigned_noc !== 'unassigned' && (
                                <div className="flex gap-1">
                                  <span className="text-zinc-500 shrink-0">NOC Assigned:</span>
                                  <span>{notification.assigned_noc}</span>
                                </div>
                              )}
                              <div className="flex gap-1 mt-1">
                                <span className="text-zinc-600">{formatNotificationTime(notification.created_at)}</span>
                                {readNotificationIds.has(notification.id) && <span className="italic">(Read)</span>}
                              </div>
                            </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isRequest) {
                              handleRemoveRequestNotification(notification.id);
                            } else if (isAlert) {
                              handleRemoveAlertNotification(notification.id);
                            } else {
                              handleRemoveTicketNotification(notification.id);
                            }
                          }}
                          className="text-zinc-400 hover:text-white hover:bg-zinc-700 shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  {getAllNotificationsSorted().length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-4">
                      No new notifications
                    </p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {/* Date and Time Clock - Shows in user's local timezone */}
          <div className="text-sm text-zinc-400 flex items-center gap-2">
            <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
            <span className="text-white font-medium">{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>

      {/* Chat Component */}
      {user && (
        <Chat
          user={user}
          openChats={openChats}
          setOpenChats={setOpenChats}
          activeChat={activeChat}
          setActiveChat={setActiveChat}
        />
      )}

      {/* Notification Detail Dialog */}
      <AlertDialog key={notificationKey} open={!!selectedNotification} onOpenChange={(open) => !open && handleCloseNotificationDetail()}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Details
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {selectedNotification && (
                <>
                  <div className="mt-2 p-3 bg-zinc-800 rounded-lg">
                    <p className="text-white font-medium">{selectedNotification.message}</p>
                    <div className="mt-2 text-sm text-zinc-400">
                      {selectedNotification.ticket_number && (
                        <p>Ticket: {selectedNotification.ticket_number}</p>
                      )}
                      {selectedNotification.alert_ticket_number && (
                        <p>Alert: {selectedNotification.alert_ticket_number}</p>
                      )}
                      <p>Type: {selectedNotification.ticket_type?.toUpperCase() || selectedNotification.ticket_type?.toUpperCase()}</p>
                      <p>Time: {formatNotificationTime(selectedNotification.created_at)}</p>
                    </div>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => {
                if (selectedNotification) {
                  // Navigate to the ticket or alert
                  const ticketType = selectedNotification.ticket_type;
                  const ticketNumber = selectedNotification.ticket_number || selectedNotification.ticket_id;
                  const alertTicketNumber = selectedNotification.alert_ticket_number;
                  
                  // Determine target route
                  let targetPath = '/';
                  let queryParam = '';
                  
                  if (alertTicketNumber) {
                    // This is an alert - navigate to References page with alert parameter
                    targetPath = `/references`;
                    queryParam = `alert=${encodeURIComponent(alertTicketNumber)}`;
                  } else if (ticketNumber) {
                    // This is a ticket - navigate to the appropriate tickets page
                    // Use ticket_type to determine route, fallback to checking message content
                    let route = '/sms-tickets';
                    if (ticketType === 'voice') {
                      route = '/voice-tickets';
                    } else if (selectedNotification.message && selectedNotification.message.toLowerCase().includes('voice')) {
                      route = '/voice-tickets';
                    }
                    targetPath = route;
                    queryParam = `ticket=${encodeURIComponent(ticketNumber)}`;
                  }
                  
                  // Check if we're already on the target page
                  const currentPath = location.pathname;
                  const isAlreadyOnTargetPage = currentPath === targetPath || 
                    (targetPath === '/sms-tickets' && currentPath.includes('/sms')) ||
                    (targetPath === '/voice-tickets' && currentPath.includes('/voice')) ||
                    (targetPath === '/references' && currentPath.includes('/references'));
                  
                  if (isAlreadyOnTargetPage) {
                    // Already on correct page - add unique key to force re-render
                    const uniqueKey = Date.now();
                    const newUrl = queryParam ? `${targetPath}?${queryParam}&_=${uniqueKey}` : `${targetPath}?_=${uniqueKey}`;
                    navigate(newUrl, { replace: true });
                  } else {
                    // Navigate to new page with query param
                    const uniqueKey = Date.now();
                    const newUrl = queryParam ? `${targetPath}?${queryParam}&_=${uniqueKey}` : targetPath;
                    navigate(newUrl);
                  }
                }
                handleCloseNotificationDetail();
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-black"
            >
              View Details
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
