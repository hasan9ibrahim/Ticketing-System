import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import axios from "axios";
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
  AlertTriangle,
} from "lucide-react";

export default function DashboardLayout({ user, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [ticketModificationNotifications, setTicketModificationNotifications] = useState([]);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [assignedReminders, setAssignedReminders] = useState([]);
  const [showReminders, setShowReminders] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

  // Fetch alerts for NOC/Admin users
  useEffect(() => {
    if (user && (user.role === "noc" || user.role === "admin" || user?.department?.can_view_all_tickets)) {
      fetchAlerts();
      // Refresh alerts every 30 seconds for faster updates when tickets are assigned
      const alertInterval = setInterval(fetchAlerts, 30000);
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
      fetchAssignedReminders();
      // Refresh every minute to check for overdue tickets
      const reminderInterval = setInterval(fetchAssignedReminders, 60000);
      return () => clearInterval(reminderInterval);
    }
  }, [user]);

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/dashboard/unassigned-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(response.data || []);
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
      setTicketModificationNotifications(notifications);
      
      // Show the first unread notification as an alert dialog
      if (notifications.length > 0 && !currentNotification) {
        setCurrentNotification(notifications[0]);
      }
    } catch (error) {
      console.error("Failed to fetch ticket modifications:", error);
    }
  };

  const handleNotificationAcknowledged = async () => {
    if (currentNotification) {
      try {
        const token = localStorage.getItem("token");
        await axios.post(
          `${API}/dashboard/ticket-modifications/${currentNotification.id}/read`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Remove the acknowledged notification from the list
        setTicketModificationNotifications((prev) => 
          prev.filter((n) => n.id !== currentNotification.id)
        );
        
        // Show the next notification if available
        const remaining = ticketModificationNotifications.filter(
          (n) => n.id !== currentNotification.id
        );
        if (remaining.length > 0) {
          setCurrentNotification(remaining[0]);
        } else {
          setCurrentNotification(null);
        }
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        setCurrentNotification(null);
      }
    }
  };

  const fetchAssignedReminders = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/dashboard/assigned-ticket-reminders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reminders = response.data || [];
      setAssignedReminders(reminders);
      
      // Show reminders if there are any
      if (reminders.length > 0) {
        setShowReminders(true);
        // Auto-hide after 30 seconds
        setTimeout(() => {
          setShowReminders(false);
        }, 30000);
      }
    } catch (error) {
      console.error("Failed to fetch assigned ticket reminders:", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "am", "noc"] },
    { path: "/sms-tickets", label: "SMS Tickets", icon: MessageSquare, roles: ["admin", "am", "noc"], ticketType: "sms" },
    { path: "/voice-tickets", label: "Voice Tickets", icon: Phone, roles: ["admin", "am", "noc"], ticketType: "voice" },
    { path: "/enterprises", label: "Enterprises", icon: Building2, roles: ["admin", "noc"] },
    { path: "/my-enterprises", label: "My Enterprises", icon: Briefcase, roles: ["am"] },
    { path: "/users", label: "Users", icon: Users, roles: ["admin"] },
    { path: "/departments", label: "Departments", icon: Settings, roles: ["admin"] },
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

  return (
    <div className="flex h-screen bg-zinc-950" data-testid="dashboard-layout">
      {/* Unassigned Tickets Alert - Top Left Notification */}
      {alerts.length > 0 && (
        <div className="fixed top-4 left-4 z-50 max-w-md">
          <div className="bg-red-950/95 border border-red-500/50 rounded-lg shadow-lg p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <span className="text-red-400 font-semibold">Unassigned Tickets Alert</span>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full ml-auto">
                {alerts.length}
              </span>
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

      {/* Assigned Ticket Reminders - Top Left (Below Unassigned Alerts) */}
      {showReminders && assignedReminders.length > 0 && (
        <div className="fixed top-4 left-4 z-40 max-w-md mt-[350px]">
          <div className="bg-amber-950/95 border border-amber-500/50 rounded-lg shadow-lg p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span className="text-amber-400 font-semibold">Pending Assigned Tickets</span>
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full ml-auto">
                {assignedReminders.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {assignedReminders.slice(0, 5).map((reminder) => (
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
              {assignedReminders.length > 5 && (
                <p className="text-zinc-400 text-xs text-center pt-2">
                  +{assignedReminders.length - 5} more tickets
                </p>
              )}
            </div>
            <p className="text-amber-200 text-xs mt-2">
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
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              data-testid="sidebar-toggle"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 py-4">
            <nav className="space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
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
                  </Button>
                );
              })}
            </nav>
          </ScrollArea>

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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Ticket Modification Alert Dialog */}
      <AlertDialog open={!!currentNotification} onOpenChange={(open) => !open && handleNotificationAcknowledged()}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Ticket Modified
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {currentNotification && (
                <>
                  Your assigned ticket <strong>{currentNotification.ticket_number}</strong> ({currentNotification.ticket_type.toUpperCase()}) 
                  was modified by <strong>{currentNotification.modified_by_username}</strong>.
                  <br /><br />
                  Please review the changes.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleNotificationAcknowledged}>
              Okay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
