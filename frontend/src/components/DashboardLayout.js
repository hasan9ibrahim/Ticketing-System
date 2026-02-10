import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";

export default function DashboardLayout({ user, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "am", "noc"] },
    { path: "/sms-tickets", label: "SMS Tickets", icon: MessageSquare, roles: ["admin", "am", "noc"], amTypes: ["sms"] },
    { path: "/voice-tickets", label: "Voice Tickets", icon: Phone, roles: ["admin", "am", "noc"], amTypes: ["voice"] },
    { path: "/enterprises", label: "Enterprises", icon: Building2, roles: ["admin"] },
    { path: "/my-enterprises", label: "My Enterprises", icon: Briefcase, roles: ["am"] },
    { path: "/users", label: "Users", icon: Users, roles: ["admin"] },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles.includes(user.role)) return false;
    
    // For AMs with amTypes restriction, check if they match
    if (user.role === "am" && item.amTypes) {
      return item.amTypes.includes(user.am_type);
    }
    
    // For NOC and Admin, show all items in their roles
    return true;
  });

  return (
    <div className="flex h-screen bg-zinc-950" data-testid="dashboard-layout">
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
              <div className="flex items-center space-x-3 animate-fade-in">
                <Hexagon className="w-8 h-8 text-emerald-500" />
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
    </div>
  );
}
