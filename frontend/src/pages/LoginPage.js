import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL =
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:8000";

const API = `${BACKEND_URL}/api`;

export default function LoginPage({ setUser }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState("");
  const [userId, setUserId] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetStep, setResetStep] = useState(1); // 1: enter username, 2: enter code, 3: new password
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetMethod, setResetMethod] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, {
        identifier,
        password,
      });

      // Check if 2FA is required
      if (response.data.two_factor_required) {
        setTwoFactorRequired(true);
        setTwoFactorMethod(response.data.method);
        setUserId(response.data.user_id);
        if (response.data.message) {
          toast.info(response.data.message);
        }
        setLoading(false);
        return;
      }

      // Normal login - 2FA not enabled
      const token = response.data.access_token;
      localStorage.setItem("token", token);
      
      // Fetch department info
      let user = response.data.user;
      try {
        const deptResponse = await axios.get(`${API}/my-department`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (deptResponse.data) {
          user = {
            ...user,
            department_id: deptResponse.data.id,
            department_type: deptResponse.data.department_type,
            department: deptResponse.data,
          };
        }
      } catch (deptError) {
        console.error("Failed to fetch department:", deptError);
      }
      
      localStorage.setItem("user", JSON.stringify(user));
      setUser(user);
      toast.success("Login successful");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setVerifying2FA(true);

    try {
      const response = await axios.post(`${API}/auth/2fa/login`, {
        user_id: userId,
        code: twoFactorCode,
      });

      const token = response.data.access_token;
      localStorage.setItem("token", token);
      
      // Fetch department info
      let user = response.data.user;
      try {
        const deptResponse = await axios.get(`${API}/my-department`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (deptResponse.data) {
          user = {
            ...user,
            department_id: deptResponse.data.id,
            department_type: deptResponse.data.department_type,
            department: deptResponse.data,
          };
        }
      } catch (deptError) {
        console.error("Failed to fetch department:", deptError);
      }
      
      localStorage.setItem("user", JSON.stringify(user));
      setUser(user);
      toast.success("Login successful");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "2FA verification failed");
    } finally {
      setVerifying2FA(false);
    }
  };

  const resetToLogin = () => {
    setTwoFactorRequired(false);
    setTwoFactorCode("");
    setUserId("");
    setTwoFactorMethod("");
  };

  // Password Reset Functions
  const handlePasswordResetRequest = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/auth/password-reset/request`, {
        identifier: resetIdentifier
      });
      // For both email and TOTP, show the code input field
      setResetMethod(response.data.method);
      setResetStep(2);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request password reset");
    }
  };

  const handlePasswordResetVerify = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/auth/password-reset/verify`, {
        identifier: resetIdentifier,
        code: resetCode
      });
      setResetStep(3);
      toast.success("Code verified. Enter your new password.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Invalid verification code");
    }
  };

  const handlePasswordResetComplete = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await axios.post(`${API}/auth/password-reset/confirm`, {
        identifier: resetIdentifier,
        code: resetCode,
        new_password: newPassword
      });
      toast.success("Password reset successfully! You can now login with your new password.");
      setShowPasswordReset(false);
      setResetStep(1);
      setResetIdentifier("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reset password");
    }
  };

  return (
    <div className="h-screen w-screen flex" data-testid="login-page">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="flex flex-col items-center mb-6">
  <img src="/Logo.png" alt="Logo" className="w-64 h-auto mb-1" />
  <p className="text-zinc-400 text-sm tracking-wide">
    NOC Ticketing System
  </p>
</div>
          {twoFactorRequired ? (
            <form onSubmit={handleVerify2FA} className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white">Two-Factor Authentication</h2>
                <p className="text-zinc-400 text-sm mt-2">
                  {twoFactorMethod === "email" 
                    ? "Enter the code sent to your email" 
                    : "Enter the code from your Google Authenticator app"}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode" className="text-zinc-300">
                  Verification Code
                </Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  maxLength={6}
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={verifying2FA || twoFactorCode.length < 6}
                className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
              >
                {verifying2FA ? "Verifying..." : "Verify"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                onClick={resetToLogin}
                className="w-full text-zinc-400 hover:text-white"
              >
                Back to Login
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-zinc-300">
                  Username
                </Label>
                <Input
                  id="identifier"
                  type="text"
                  placeholder="Enter your username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowPasswordReset(true)}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">Reset Password</h2>
            
            {resetStep === 1 && (
              <form onSubmit={handlePasswordResetRequest} className="space-y-4">
                <div>
                  <Label htmlFor="resetIdentifier" className="text-zinc-300">
                    Username or Email
                  </Label>
                  <Input
                    id="resetIdentifier"
                    type="text"
                    placeholder="Enter your username or email"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Send Verification Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPasswordReset(false)}
                  className="w-full text-zinc-400 hover:text-white"
                >
                  Cancel
                </Button>
              </form>
            )}

            {resetStep === 2 && (
              <form onSubmit={handlePasswordResetVerify} className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  {resetMethod === "email" 
                    ? "Enter the code sent to your email" 
                    : "Enter the code from your Google Authenticator app"}
                </p>
                <div>
                  <Label htmlFor="resetCode" className="text-zinc-300">
                    Verification Code
                  </Label>
                  <Input
                    id="resetCode"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    maxLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Verify Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setResetStep(1)}
                  className="w-full text-zinc-400 hover:text-white"
                >
                  Back
                </Button>
              </form>
            )}

            {resetStep === 3 && (
              <form onSubmit={handlePasswordResetComplete} className="space-y-4">
                <div>
                  <Label htmlFor="newPassword" className="text-zinc-300">
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="text-zinc-300">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Reset Password
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Right Side - Background Image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }} />
        <div className="absolute inset-0 bg-black/50" />
      </div>
    </div>
  );
}
