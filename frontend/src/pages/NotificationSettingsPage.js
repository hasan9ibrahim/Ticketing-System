import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, User } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState({
    notify_on_ticket_created: true,
    notify_on_ticket_assigned: true,
    notify_on_ticket_awaiting_vendor: true,
    notify_on_ticket_awaiting_client: true,
    notify_on_ticket_awaiting_am: true,
    notify_on_ticket_resolved: true,
    notify_on_ticket_unresolved: true,
    notify_on_ticket_other: true,
    // Alert notifications
    notify_on_alert_created: true,
    notify_on_alert_commented: true,
    notify_on_alert_alt_vendor: true,
    notify_on_alert_resolved: true,
    // NOC notifications
    notify_on_am_action: true,
    notify_on_noc_ticket_modification: true,
  });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [amUsers, setAmUsers] = useState([]);
  const [nocUsers, setNocUsers] = useState([]);
  const [selectedAm, setSelectedAm] = useState(null);
  const [selectedNoc, setSelectedNoc] = useState(null);
  const [userType, setUserType] = useState("am"); // 'am' or 'noc'
  const [loadingAms, setLoadingAms] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userRole = user?.role || "";

  useEffect(() => {
    setIsAdmin(userRole === "admin");
    if (userRole === "admin") {
      fetchAllAmPreferences();
    } else {
      fetchPreferences();
    }
  }, [userRole]);

  const fetchPreferences = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users/me/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreferences(response.data);
    } catch (error) {
      console.error("Failed to fetch notification preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAmPreferences = async () => {
    setLoadingAms(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Separate AM and NOC users based on role
      const allUsers = response.data;
      const amList = allUsers.filter(u => u.role === 'am');
      const nocList = allUsers.filter(u => u.role === 'noc');
      
      setAmUsers(amList);
      setNocUsers(nocList);
      
      if (amList.length > 0) {
        setSelectedAm(amList[0]);
        setPreferences(extractPreferences(amList[0]));
      } else if (nocList.length > 0) {
        setSelectedNoc(nocList[0]);
        setPreferences(extractPreferences(nocList[0]));
      }
    } catch (error) {
      console.error("Failed to fetch notification preferences:", error);
    } finally {
      setLoading(false);
      setLoadingAms(false);
    }
  };

  const extractPreferences = (amUser) => {
    return {
      notify_on_ticket_created: amUser.notify_on_ticket_created ?? true,
      notify_on_ticket_assigned: amUser.notify_on_ticket_assigned ?? true,
      notify_on_ticket_awaiting_vendor: amUser.notify_on_ticket_awaiting_vendor ?? true,
      notify_on_ticket_awaiting_client: amUser.notify_on_ticket_awaiting_client ?? true,
      notify_on_ticket_awaiting_am: amUser.notify_on_ticket_awaiting_am ?? true,
      notify_on_ticket_resolved: amUser.notify_on_ticket_resolved ?? true,
      notify_on_ticket_unresolved: amUser.notify_on_ticket_unresolved ?? true,
      notify_on_alert_created: amUser.notify_on_alert_created ?? true,
      notify_on_alert_commented: amUser.notify_on_alert_commented ?? true,
      notify_on_alert_alt_vendor: amUser.notify_on_alert_alt_vendor ?? true,
      notify_on_alert_resolved: amUser.notify_on_alert_resolved ?? true,
      // NOC notifications
      notify_on_am_action: amUser.notify_on_am_action ?? true,
      notify_on_noc_ticket_modification: amUser.notify_on_noc_ticket_modification ?? true,
    };
  };

  const handleToggle = async (key) => {
    const newValue = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: newValue }));
    
    try {
      const token = localStorage.getItem("token");
      
      if (isAdmin && (selectedAm || selectedNoc)) {
        // Admin updating an AM's or NOC's preferences
        const targetUser = selectedAm || selectedNoc;
        await axios.put(
          `${API}/users/${targetUser.id}/notification-preferences`,
          { [key]: newValue },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(`Notification preference updated for ${targetUser.username}`);
        // Update local state
        if (selectedAm) {
          setAmUsers(prev => prev.map(am => 
            am.id === selectedAm.id ? { ...am, [key]: newValue } : am
          ));
        } else {
          setNocUsers(prev => prev.map(noc => 
            noc.id === selectedNoc.id ? { ...noc, [key]: newValue } : noc
          ));
        }
      } else {
        // User updating their own preferences
        await axios.put(
          `${API}/users/me/notification-preferences`,
          { [key]: newValue },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Notification preference updated");
      }
    } catch (error) {
      // Revert on error
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
      toast.error("Failed to update preference");
    }
  };

  const handleSelectAm = (am) => {
    setSelectedAm(am);
    setSelectedNoc(null);
    setPreferences(extractPreferences(am));
  };

  const handleSelectNoc = (noc) => {
    setSelectedNoc(noc);
    setSelectedAm(null);
    setPreferences(extractPreferences(noc));
  };

  const handleUserTypeChange = (type) => {
    setUserType(type);
    if (type === 'am' && amUsers.length > 0) {
      setSelectedAm(amUsers[0]);
      setSelectedNoc(null);
      setPreferences(extractPreferences(amUsers[0]));
    } else if (type === 'noc' && nocUsers.length > 0) {
      setSelectedNoc(nocUsers[0]);
      setSelectedAm(null);
      setPreferences(extractPreferences(nocUsers[0]));
    }
  };

  const NotificationToggle = ({ id, title, description, checked, onChange }) => (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-white">
          {title}
        </Label>
        <p className="text-sm text-zinc-400">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );

  if (loading || loadingAms) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading...</div>
      </div>
    );
  }

  // Admin view - show all AMs and NOCs with their notification settings
  if (isAdmin) {
    const currentUsers = userType === 'am' ? amUsers : nocUsers;
    const currentSelected = userType === 'am' ? selectedAm : selectedNoc;
    
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto">
        <div>
          <h1 className="text-4xl font-bold text-white">Notification Settings</h1>
          <p className="text-zinc-400 mt-1">Manage notification preferences for Account Managers and NOC users</p>
        </div>

        {/* User Type Selector */}
        <Card className="bg-zinc-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              Select User Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <button
                onClick={() => handleUserTypeChange('am')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  userType === 'am'
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                Account Managers ({amUsers.length})
              </button>
              <button
                onClick={() => handleUserTypeChange('noc')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  userType === 'noc'
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                NOC Users ({nocUsers.length})
              </button>
            </div>
          </CardContent>
        </Card>

        {/* User Selector */}
        <Card className="bg-zinc-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              Select {userType === 'am' ? 'Account Manager' : 'NOC User'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentUsers.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {currentUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => userType === 'am' ? handleSelectAm(user) : handleSelectNoc(user)}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      currentSelected?.id === user.id
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <div className="font-medium">{user.username}</div>
                    <div className="text-xs opacity-75">{user.am_type?.toUpperCase() || user.role?.toUpperCase()}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-zinc-400">No {userType === 'am' ? 'Account Managers' : 'NOC Users'} found.</p>
            )}
          </CardContent>
        </Card>

        {/* Selected User's Notification Settings */}
        {currentSelected && (
          <Card className="bg-zinc-900/50 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications for {currentSelected.username}
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Configure which notifications {currentSelected.username} will receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* AM-specific notifications - only show for AM users */}
              {userType === 'am' && (
                <>
                  <NotificationToggle
                    id="notify_on_ticket_created"
                    title="New Ticket Created"
                    description="Notify when a new ticket is created for their enterprises"
                    checked={preferences.notify_on_ticket_created}
                    onChange={() => handleToggle("notify_on_ticket_created")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_assigned"
                    title="Assigned to NOC"
                    description="Notify when a ticket is assigned to a NOC member"
                    checked={preferences.notify_on_ticket_assigned}
                    onChange={() => handleToggle("notify_on_ticket_assigned")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_awaiting_vendor"
                    title="Awaiting Vendor"
                    description="Notify when ticket status changes to Awaiting Vendor"
                    checked={preferences.notify_on_ticket_awaiting_vendor}
                    onChange={() => handleToggle("notify_on_ticket_awaiting_vendor")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_awaiting_client"
                    title="Awaiting Client"
                    description="Notify when ticket status changes to Awaiting Client"
                    checked={preferences.notify_on_ticket_awaiting_client}
                    onChange={() => handleToggle("notify_on_ticket_awaiting_client")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_awaiting_am"
                    title="Awaiting AM"
                    description="Notify when ticket status changes to Awaiting AM"
                    checked={preferences.notify_on_ticket_awaiting_am}
                    onChange={() => handleToggle("notify_on_ticket_awaiting_am")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_resolved"
                    title="Ticket Resolved"
                    description="Notify when a ticket is resolved"
                    checked={preferences.notify_on_ticket_resolved}
                    onChange={() => handleToggle("notify_on_ticket_resolved")}
                  />
                  <NotificationToggle
                    id="notify_on_ticket_unresolved"
                    title="Ticket Unresolved"
                    description="Notify when a resolved ticket becomes unresolved"
                    checked={preferences.notify_on_ticket_unresolved}
                    onChange={() => handleToggle("notify_on_ticket_unresolved")}
                  />
                </>
              )}

              {/* Alert Notifications - show for both AM and NOC */}
              <NotificationToggle
                id="notify_on_alert_created"
                title="New Alert Created"
                description="Notify when a new alert is created"
                checked={preferences.notify_on_alert_created}
                onChange={() => handleToggle("notify_on_alert_created")}
              />
              <NotificationToggle
                id="notify_on_alert_commented"
                title="Alert Commented"
                description="Notify when a comment is added to an alert"
                checked={preferences.notify_on_alert_commented}
                onChange={() => handleToggle("notify_on_alert_commented")}
              />
              <NotificationToggle
                id="notify_on_alert_alt_vendor"
                title="Alert Alternative Vendor"
                description="Notify when an alternative vendor is suggested for an alert"
                checked={preferences.notify_on_alert_alt_vendor}
                onChange={() => handleToggle("notify_on_alert_alt_vendor")}
              />
              <NotificationToggle
                id="notify_on_alert_resolved"
                title="Alert Resolved"
                description="Notify when an alert is resolved"
                checked={preferences.notify_on_alert_resolved}
                onChange={() => handleToggle("notify_on_alert_resolved")}
              />

              {/* NOC Notifications Section */}
              <div className="mt-6 mb-2">
                <h3 className="text-lg font-semibold text-white mb-2">NOC Notifications</h3>
                <p className="text-sm text-zinc-400 mb-4">Notifications about AM activities</p>
              </div>
              <NotificationToggle
                id="notify_on_am_action"
                title="AM Adds Action"
                description="Notify when an AM adds an action to a ticket assigned to you"
                checked={preferences.notify_on_am_action}
                onChange={() => handleToggle("notify_on_am_action")}
              />
              <NotificationToggle
                id="notify_on_noc_ticket_modification"
                title="Ticket Modified"
                description="Notify when a ticket assigned to you is modified"
                checked={preferences.notify_on_noc_ticket_modification}
                onChange={() => handleToggle("notify_on_noc_ticket_modification")}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // AM view - their own notification settings
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-white">Notification Settings</h1>
        <p className="text-zinc-400 mt-1">Configure your notification preferences</p>
      </div>

      <Card className="bg-zinc-900/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Choose which notifications you want to receive for your assigned enterprises
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <NotificationToggle
            id="notify_on_ticket_created"
            title="New Ticket Created"
            description="Get notified when a new ticket is created for your enterprise"
            checked={preferences.notify_on_ticket_created}
            onChange={() => handleToggle("notify_on_ticket_created")}
          />
          <NotificationToggle
            id="notify_on_ticket_assigned"
            title="Assigned to NOC"
            description="Get notified when a ticket is assigned to a NOC member"
            checked={preferences.notify_on_ticket_assigned}
            onChange={() => handleToggle("notify_on_ticket_assigned")}
          />
          <NotificationToggle
            id="notify_on_ticket_awaiting_vendor"
            title="Awaiting Vendor"
            description="Get notified when ticket status changes to Awaiting Vendor"
            checked={preferences.notify_on_ticket_awaiting_vendor}
            onChange={() => handleToggle("notify_on_ticket_awaiting_vendor")}
          />
          <NotificationToggle
            id="notify_on_ticket_awaiting_client"
            title="Awaiting Client"
            description="Get notified when ticket status changes to Awaiting Client"
            checked={preferences.notify_on_ticket_awaiting_client}
            onChange={() => handleToggle("notify_on_ticket_awaiting_client")}
          />
          <NotificationToggle
            id="notify_on_ticket_awaiting_am"
            title="Awaiting AM"
            description="Get notified when ticket status changes to Awaiting AM"
            checked={preferences.notify_on_ticket_awaiting_am}
            onChange={() => handleToggle("notify_on_ticket_awaiting_am")}
          />
          <NotificationToggle
            id="notify_on_ticket_resolved"
            title="Ticket Resolved"
            description="Get notified when a ticket is resolved"
            checked={preferences.notify_on_ticket_resolved}
            onChange={() => handleToggle("notify_on_ticket_resolved")}
          />
          <NotificationToggle
            id="notify_on_ticket_unresolved"
            title="Ticket Unresolved"
            description="Get notified when a resolved ticket becomes unresolved"
            checked={preferences.notify_on_ticket_unresolved}
            onChange={() => handleToggle("notify_on_ticket_unresolved")}
          />
          <NotificationToggle
            id="notify_on_alert_created"
            title="New Alert Created"
            description="Get notified when a new alert is created"
            checked={preferences.notify_on_alert_created}
            onChange={() => handleToggle("notify_on_alert_created")}
          />
          <NotificationToggle
            id="notify_on_alert_commented"
            title="Alert Commented"
            description="Get notified when a comment is added to an alert"
            checked={preferences.notify_on_alert_commented}
            onChange={() => handleToggle("notify_on_alert_commented")}
          />
          <NotificationToggle
            id="notify_on_alert_alt_vendor"
            title="Alert Alternative Vendor"
            description="Get notified when an alternative vendor is suggested for an alert"
            checked={preferences.notify_on_alert_alt_vendor}
            onChange={() => handleToggle("notify_on_alert_alt_vendor")}
          />
          <NotificationToggle
            id="notify_on_alert_resolved"
            title="Alert Resolved"
            description="Get notified when an alert is resolved"
            checked={preferences.notify_on_alert_resolved}
            onChange={() => handleToggle("notify_on_alert_resolved")}
          />
          {/* NOC Notifications Section */}
          <div className="mt-6 mb-2">
            <h3 className="text-lg font-semibold text-white mb-2">NOC Notifications</h3>
            <p className="text-sm text-zinc-400 mb-4">Notifications for NOC users about ticket activity</p>
          </div>
          <NotificationToggle
            id="notify_on_am_action"
            title="AM Action on Ticket"
            description="Get notified when an AM adds an action to a ticket assigned to you"
            checked={preferences.notify_on_am_action}
            onChange={() => handleToggle("notify_on_am_action")}
          />
          <NotificationToggle
            id="notify_on_noc_ticket_modification"
            title="NOC Ticket Modification"
            description="Get notified when another NOC modifies a ticket assigned to you"
            checked={preferences.notify_on_noc_ticket_modification}
            onChange={() => handleToggle("notify_on_noc_ticket_modification")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
