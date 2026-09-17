import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Send, Save } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function SmtpSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    from_email: "",
    use_tls: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/admin/smtp-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings((prev) => ({
        ...prev,
        smtp_host: response.data.smtp_host || "",
        smtp_port: response.data.smtp_port || 587,
        smtp_username: response.data.smtp_username || "",
        from_email: response.data.from_email || "",
        use_tls: response.data.use_tls,
        smtp_password: "",
      }));
      setPasswordSet(response.data.smtp_password_set);
    } catch (error) {
      console.error("Failed to fetch SMTP settings:", error);
      toast.error("Failed to load SMTP settings");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        smtp_host: settings.smtp_host,
        smtp_port: Number(settings.smtp_port),
        smtp_username: settings.smtp_username,
        from_email: settings.from_email,
        use_tls: settings.use_tls,
      };
      // Only send the password if the admin actually typed a new one -
      // an empty field must never overwrite the stored credential.
      if (settings.smtp_password) {
        payload.smtp_password = settings.smtp_password;
      }

      const response = await axios.put(`${API}/admin/smtp-settings`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPasswordSet(response.data.smtp_password_set);
      setSettings((prev) => ({ ...prev, smtp_password: "" }));
      toast.success("SMTP settings saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter an email address to send the test to");
      return;
    }
    setTesting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/smtp-settings/test`,
        { to_email: testEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send test email");
    } finally {
      setTesting(false);
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
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Email Settings</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">
          Configure the SMTP account used to send 2FA codes and password reset emails to users
        </p>
      </div>

      <Card className="bg-white/50 dark:bg-zinc-900/50 border-black/10 dark:border-white/10">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5" />
            SMTP Configuration
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-zinc-400">
            Emails (2FA codes, password resets) are sent from this account to the email address on each user's profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label className="text-gray-900 dark:text-white">SMTP Host</Label>
              <Input
                value={settings.smtp_host}
                onChange={(e) => handleChange("smtp_host", e.target.value)}
                placeholder="smtp.gmail.com"
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">Port</Label>
              <Input
                type="number"
                value={settings.smtp_port}
                onChange={(e) => handleChange("smtp_port", e.target.value)}
                placeholder="587"
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">SMTP Username</Label>
              <Input
                value={settings.smtp_username}
                onChange={(e) => handleChange("smtp_username", e.target.value)}
                placeholder="noreply@yourcompany.com"
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">SMTP Password</Label>
              <Input
                type="password"
                value={settings.smtp_password}
                onChange={(e) => handleChange("smtp_password", e.target.value)}
                placeholder={passwordSet ? "•••••••• (leave blank to keep current)" : "Enter SMTP password"}
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-white">From Email</Label>
            <Input
              value={settings.from_email}
              onChange={(e) => handleChange("from_email", e.target.value)}
              placeholder="noreply@yourcompany.com"
              className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
            />
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              The "From" address shown on 2FA and password reset emails. Defaults to the SMTP username if left blank.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="space-y-1">
              <Label className="text-gray-900 dark:text-white">Use STARTTLS</Label>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Enable for most providers (Gmail, Office 365, etc. on port 587)
              </p>
            </div>
            <Switch
              checked={settings.use_tls}
              onCheckedChange={(checked) => handleChange("use_tls", checked)}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/50 dark:bg-zinc-900/50 border-black/10 dark:border-white/10">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Test Email
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-zinc-400">
            Verify the saved SMTP configuration actually works before relying on it for 2FA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white flex-1"
            />
            <Button
              onClick={handleTest}
              disabled={testing}
              variant="outline"
              className="border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
            >
              {testing ? "Sending..." : "Send Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
