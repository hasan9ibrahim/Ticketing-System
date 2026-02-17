import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Building2, UserCheck, CheckCircle, XCircle, Loader2 } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

export default function NotificationSettings({ user, onSettingsChange }) {
  const [settings, setSettings] = useState({
    notify_ticket_created_for_enterprise: true,
    notify_ticket_assigned_to_noc: true,
    notify_ticket_resolved: true,
    notify_ticket_unresolved: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotificationSettings();
  }, []);

  const fetchNotificationSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users/notification-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data) {
        setSettings({
          notify_ticket_created_for_enterprise: response.data.notify_ticket_created_for_enterprise ?? true,
          notify_ticket_assigned_to_noc: response.data.notify_ticket_assigned_to_noc ?? true,
          notify_ticket_resolved: response.data.notify_ticket_resolved ?? true,
          notify_ticket_unresolved: response.data.notify_ticket_unresolved ?? true,
        });
      }
    } catch (error) {
      console.error("Failed to fetch notification settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const newValue = !settings[key];
    const newSettings = { ...settings, [key]: newValue };
    setSettings(newSettings);
    setSaving(true);

    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/users/notification-settings`,
        { [key]: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (onSettingsChange) {
        onSettingsChange(newSettings);
      }
    } catch (error) {
      console.error("Failed to update notification settings:", error);
      // Revert on error
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          <span className="ml-2 text-zinc-400">Loading settings...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Bell className="h-5 w-5 text-emerald-500" />
          Notification Settings
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Customize when you receive notifications about tickets related to your enterprises
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enterprise Ticket Created */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="notify_ticket_created_for_enterprise" className="text-white flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-400" />
              Ticket Created for My Enterprise
            </Label>
            <p className="text-sm text-zinc-400">
              Get notified when a new ticket is created for one of your assigned enterprises
            </p>
          </div>
          <Switch
            id="notify_ticket_created_for_enterprise"
            checked={settings.notify_ticket_created_for_enterprise}
            onCheckedChange={() => handleToggle("notify_ticket_created_for_enterprise")}
            disabled={saving}
          />
        </div>

        {/* Ticket Assigned to NOC */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="notify_ticket_assigned_to_noc" className="text-white flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-zinc-400" />
              Ticket Assigned to NOC
            </Label>
            <p className="text-sm text-zinc-400">
              Get notified when a ticket for your enterprise is assigned to a NOC member
            </p>
          </div>
          <Switch
            id="notify_ticket_assigned_to_noc"
            checked={settings.notify_ticket_assigned_to_noc}
            onCheckedChange={() => handleToggle("notify_ticket_assigned_to_noc")}
            disabled={saving}
          />
        </div>

        {/* Ticket Resolved */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="notify_ticket_resolved" className="text-white flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-zinc-400" />
              Ticket Resolved
            </Label>
            <p className="text-sm text-zinc-400">
              Get notified when a ticket assigned to you is marked as resolved
            </p>
          </div>
          <Switch
            id="notify_ticket_resolved"
            checked={settings.notify_ticket_resolved}
            onCheckedChange={() => handleToggle("notify_ticket_resolved")}
            disabled={saving}
          />
        </div>

        {/* Ticket Unresolved */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="notify_ticket_unresolved" className="text-white flex items-center gap-2">
              <XCircle className="h-4 w-4 text-zinc-400" />
              Ticket Reopened (Unresolved)
            </Label>
            <p className="text-sm text-zinc-400">
              Get notified when a resolved ticket is reopened
            </p>
          </div>
          <Switch
            id="notify_ticket_unresolved"
            checked={settings.notify_ticket_unresolved}
            onCheckedChange={() => handleToggle("notify_ticket_unresolved")}
            disabled={saving}
          />
        </div>

        {saving && (
          <div className="flex items-center justify-center text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Saving changes...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
