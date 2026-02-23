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
  const [resetStep, setResetStep] = useState(1);
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

      const token = response.data.access_token;
      localStorage.setItem("token", token);
      
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

  const handlePasswordResetRequest = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/auth/password-reset/request`, {
        identifier: resetIdentifier
      });
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
    <div className="min-h-screen w-full flex relative overflow-hidden" data-testid="login-page">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
          {/* Signal Waves - Left */}
          <div className="absolute left-0 top-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute left-20 top-1/3 w-64 h-64 bg-emerald-400/3 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          
          {/* Signal Waves - Right */}
          <div className="absolute right-0 bottom-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute right-20 bottom-1/3 w-64 h-64 bg-emerald-400/3 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
          
          {/* Grid Pattern Overlay */}
          <div className="absolute inset-0 opacity-[0.03]" 
               style={{ 
                 backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
                 backgroundSize: '50px 50px'
               }}>
          </div>
        </div>
      </div>

      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-10 animate-fade-in-down">
            <div className="relative mb-4">
              {/* Glow Effect Behind Logo */}
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full"></div>
              <img 
                src="/Logo.png" 
                alt="Wii Telecom" 
                className="w-56 h-auto relative z-10 drop-shadow-2xl" 
              />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-emerald-500"></div>
              <span className="text-emerald-500 text-xs tracking-[0.3em] uppercase font-medium">NOC Ticketing System</span>
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-emerald-500"></div>
            </div>
            <p className="text-slate-400 text-sm">
              Wii Gather the World
            </p>
          </div>

          {/* Telecom Icons */}
          <div className="flex justify-center gap-8 mb-8">
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-slate-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <span className="text-xs font-medium">SMS</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-slate-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Voice</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-slate-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Network</span>
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
            {twoFactorRequired ? (
              <form onSubmit={handleVerify2FA} className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-white">Two-Factor Authentication</h2>
                  <p className="text-slate-400 text-sm mt-2">
                    {twoFactorMethod === "email" 
                      ? "Enter the code sent to your email" 
                      : "Enter the code from your authenticator app"}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="twoFactorCode" className="text-slate-300 text-sm font-medium">
                    Verification Code
                  </Label>
                  <Input
                    id="twoFactorCode"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 h-12 text-center text-lg tracking-[0.5em] font-mono"
                    maxLength={6}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={verifying2FA || twoFactorCode.length < 6}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-semibold hover:from-emerald-400 hover:to-emerald-300 h-12 transition-all duration-300 shadow-lg shadow-emerald-500/20"
                >
                  {verifying2FA ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying...
                    </span>
                  ) : "Verify"}
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetToLogin}
                  className="w-full text-slate-400 hover:text-white hover:bg-slate-700/50"
                >
                  Back to Login
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6" data-testid="login-form">
                <div className="space-y-2">
                  <Label htmlFor="identifier" className="text-slate-300 text-sm font-medium">
                    Username
                  </Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <Input
                      id="identifier"
                      type="text"
                      placeholder="Enter your username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 pl-12 h-12 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 pl-12 h-12 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-semibold hover:from-emerald-400 hover:to-emerald-300 h-12 transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : "Sign In"}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="text-sm text-emerald-500/80 hover:text-emerald-400 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-slate-500 text-xs">
              © 2024 Wii Telecom. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Visual Display */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {/* Abstract Telecom Visualization */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              {/* Central Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
              
              {/* Connection Lines */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                    <stop offset="50%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Horizontal Lines */}
                <line x1="0" y1="25" x2="100" y2="25" stroke="url(#lineGradient)" strokeWidth="0.2" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="url(#lineGradient)" strokeWidth="0.2" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="url(#lineGradient)" strokeWidth="0.2" />
                {/* Vertical Lines */}
                <line x1="25" y1="0" x2="25" y2="100" stroke="url(#lineGradient)" strokeWidth="0.2" />
                <line x1="50" y1="0" x2="50" y2="100" stroke="url(#lineGradient)" strokeWidth="0.2" />
                <line x1="75" y1="0" x2="75" y2="100" stroke="url(#lineGradient)" strokeWidth="0.2" />
              </svg>

              {/* Signal Dots */}
              <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
              <div className="absolute top-1/3 right-1/3 w-2 h-2 bg-emerald-400 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-emerald-500 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
              <div className="absolute bottom-1/4 right-1/4 w-2 h-2 bg-emerald-400 rounded-full animate-ping" style={{ animationDelay: '1.5s' }}></div>

              {/* Text Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <h2 className="text-4xl font-light text-white/90 tracking-wider text-center">
                  Wii <span className="text-emerald-500 font-medium">Gather the World</span>
                </h2>
                <p className="text-slate-400 mt-4 text-sm tracking-widest uppercase">
                  Seamless SMS & Voice Solutions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-fade-in-up">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-white">Reset Password</h2>
            </div>
            
            {resetStep === 1 && (
              <form onSubmit={handlePasswordResetRequest} className="space-y-4">
                <div>
                  <Label htmlFor="resetIdentifier" className="text-slate-300 text-sm font-medium">
                    Username or Email
                  </Label>
                  <Input
                    id="resetIdentifier"
                    type="text"
                    placeholder="Enter your username or email"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 mt-1 h-12 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-semibold h-12 transition-all duration-300 shadow-lg shadow-emerald-500/20"
                >
                  Send Verification Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPasswordReset(false)}
                  className="w-full text-slate-400 hover:text-white hover:bg-slate-700/50"
                >
                  Cancel
                </Button>
              </form>
            )}

            {resetStep === 2 && (
              <form onSubmit={handlePasswordResetVerify} className="space-y-4">
                <p className="text-slate-400 text-sm text-center mb-4">
                  {resetMethod === "email" 
                    ? "Enter the code sent to your email" 
                    : "Enter the code from your Google Authenticator app"}
                </p>
                <div>
                  <Label htmlFor="resetCode" className="text-slate-300 text-sm font-medium">
                    Verification Code
                  </Label>
                  <Input
                    id="resetCode"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 mt-1 h-12 text-center text-lg tracking-[0.5em] font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                    maxLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-semibold h-12 transition-all duration-300 shadow-lg shadow-emerald-500/20"
                >
                  Verify Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setResetStep(1)}
                  className="w-full text-slate-400 hover:text-white hover:bg-slate-700/50"
                >
                  Back
                </Button>
              </form>
            )}

            {resetStep === 3 && (
              <form onSubmit={handlePasswordResetComplete} className="space-y-4">
                <div>
                  <Label htmlFor="newPassword" className="text-slate-300 text-sm font-medium">
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 mt-1 h-12 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="text-slate-300 text-sm font-medium">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-slate-900/50 border-slate-600/50 text-white placeholder:text-slate-500 mt-1 h-12 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-900 font-semibold h-12 transition-all duration-300 shadow-lg shadow-emerald-500/20"
                >
                  Reset Password
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Custom CSS for animations */}
      <style>{`
        @keyframes fade-in-down {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out forwards;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
