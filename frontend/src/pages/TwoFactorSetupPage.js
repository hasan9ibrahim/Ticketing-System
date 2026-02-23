import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldCheck, ShieldOff, Smartphone, Mail, QrCode, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function TwoFactorSetupPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [method, setMethod] = useState("email");
  const [secret, setSecret] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error("Error fetching user:", error);
      toast.error("Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setSettingUp(true);
    setSecret(null);
    setQrCode(null);
    setCode("");
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/auth/2fa/setup`,
        { method },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (method === "totp") {
        console.log("TOTP setup - provisioning_uri:", response.data.provisioning_uri);
        setSecret(response.data.secret);
        setQrCode(response.data.provisioning_uri);
      } else if (method === "email") {
        // For email, we need to show the input field
        setSecret("email");
        toast.success(response.data.message || "Verification code sent to your email");
      }
    } catch (error) {
      console.error("Setup error:", error.response?.data);
      const errorMsg = error.response?.data?.detail || "Failed to start 2FA setup";
      toast.error(errorMsg);
    } finally {
      setSettingUp(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) {
      toast.error("Please enter a verification code");
      return;
    }

    setVerifying(true);
    try {
      const token = localStorage.getItem("token");
      console.log("Verifying with code:", code);
      const response = await axios.post(
        `${API}/auth/2fa/verify`,
        { code },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("2FA enabled successfully!");
      fetchUser();
      setSecret(null);
      setQrCode(null);
      setCode("");
    } catch (error) {
      console.error("Verify error:", error.response?.data);
      toast.error(error.response?.data?.detail || "Invalid verification code");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/auth/2fa/disable`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("2FA disabled successfully");
      fetchUser();
      setSecret(null);
      setQrCode(null);
      setCode("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to disable 2FA");
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-emerald-500" />
        <div>
          <h1 className="text-2xl font-bold text-white">Two-Factor Authentication</h1>
          <p className="text-zinc-400">Secure your account with 2FA</p>
        </div>
      </div>

      {user?.two_factor_enabled ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              2FA is Enabled
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Your account is protected with {user.two_factor_method === "totp" ? "Google Authenticator" : "email verification"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={handleDisable}
                variant="destructive"
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                Disable 2FA
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : secret || qrCode ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <QrCode className="h-5 w-5 text-emerald-500" />
              Setup Google Authenticator
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Scan the QR code with your Google Authenticator app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}&bgcolor=FFFFFF&color=000000`}
                  alt="QR Code"
                  className="h-48 w-48"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://chart.googleapis.com/chart?cht=qr&chl=${encodeURIComponent(qrCode)}&chs=200x200&chco=000000&chf=bg,s,FFFFFF`;
                  }}
                />
              </div>
            )}
            
            {secret && (
              <div className="space-y-2">
                <Label className="text-zinc-400">Or enter this secret manually:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-zinc-800 rounded text-zinc-300 font-mono text-sm break-all">
                    {secret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copySecret}
                    className="border-zinc-700 text-zinc-400 hover:text-white"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-white">Enter verification code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={method === "email" ? "Enter 6-digit code from your email" : "Enter 6-digit code from Google Authenticator"}
                className="bg-zinc-800 border-zinc-700 text-white"
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleVerify}
                disabled={verifying}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
              >
                {verifying ? "Verifying..." : "Verify & Enable"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setSecret(null); setQrCode(null); setCode(""); }}
                className="border-zinc-700 text-white hover:bg-zinc-800"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Enable Two-Factor Authentication</CardTitle>
            <CardDescription className="text-zinc-400">
              Choose how you want to receive verification codes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => setMethod("email")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  method === "email"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <Mail className={`h-8 w-8 mb-2 ${method === "email" ? "text-emerald-500" : "text-zinc-400"}`} />
                <div className="font-medium text-white">Email</div>
                <div className="text-sm text-zinc-400">Receive codes via email</div>
              </div>

              <div
                onClick={() => setMethod("totp")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  method === "totp"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <Smartphone className={`h-8 w-8 mb-2 ${method === "totp" ? "text-emerald-500" : "text-zinc-400"}`} />
                <div className="font-medium text-white">Authenticator</div>
                <div className="text-sm text-zinc-400">Use Google Authenticator app</div>
              </div>
            </div>

            <Button
              onClick={handleStartSetup}
              disabled={settingUp}
              className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
            >
              <Shield className="h-4 w-4 mr-2" />
              {settingUp ? "Setting up..." : `Continue with ${method === "email" ? "Email" : "Google Authenticator"}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
