import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell } from "lucide-react";

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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

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

  const handleToggle = async (key) => {
    const newValue = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: newValue }));
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/users/me/notification-preferences`,
        { [key]: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Notification preference updated");
    } catch (error) {
      // Revert on error
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
      toast.error("Failed to update preference");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading...</div>
      </div>
    );
  }

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
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_created" className="text-white">
                New Ticket Created
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a new ticket is created for your enterprise
              </p>
            </div>
            <Switch
              id="notify_on_ticket_created"
              checked={preferences.notify_on_ticket_created}
              onCheckedChange={() => handleToggle("notify_on_ticket_created")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_assigned" className="text-white">
                Assigned to NOC
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a ticket is assigned to a NOC member
              </p>
            </div>
            <Switch
              id="notify_on_ticket_assigned"
              checked={preferences.notify_on_ticket_assigned}
              onCheckedChange={() => handleToggle("notify_on_ticket_assigned")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_awaiting_vendor" className="text-white">
                Awaiting Vendor
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a ticket status changes to "Awaiting Vendor"
              </p>
            </div>
            <Switch
              id="notify_on_ticket_awaiting_vendor"
              checked={preferences.notify_on_ticket_awaiting_vendor}
              onCheckedChange={() => handleToggle("notify_on_ticket_awaiting_vendor")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_awaiting_client" className="text-white">
                Awaiting Client
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a ticket status changes to "Awaiting Client"
              </p>
            </div>
            <Switch
              id="notify_on_ticket_awaiting_client"
              checked={preferences.notify_on_ticket_awaiting_client}
              onCheckedChange={() => handleToggle("notify_on_ticket_awaiting_client")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_awaiting_am" className="text-white">
                Awaiting Your Response
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a ticket status changes to "Awaiting AM"
              </p>
            </div>
            <Switch
              id="notify_on_ticket_awaiting_am"
              checked={preferences.notify_on_ticket_awaiting_am}
              onCheckedChange={() => handleToggle("notify_on_ticket_awaiting_am")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_resolved" className="text-white">
                Ticket Resolved
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a ticket is resolved
              </p>
            </div>
            <Switch
              id="notify_on_ticket_resolved"
              checked={preferences.notify_on_ticket_resolved}
              onCheckedChange={() => handleToggle("notify_on_ticket_resolved")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_unresolved" className="text-white">
                Ticket Unresolved
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified when a resolved ticket is marked as unresolved
              </p>
            </div>
            <Switch
              id="notify_on_ticket_unresolved"
              checked={preferences.notify_on_ticket_unresolved}
              onCheckedChange={() => handleToggle("notify_on_ticket_unresolved")}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notify_on_ticket_other" className="text-white">
                Other Status Changes
              </Label>
              <p className="text-sm text-zinc-400">
                Get notified about other status changes (e.g., in progress, etc.)
              </p>
            </div>
            <Switch
              id="notify_on_ticket_other"
              checked={preferences.notify_on_ticket_other}
              onCheckedChange={() => handleToggle("notify_on_ticket_other")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
