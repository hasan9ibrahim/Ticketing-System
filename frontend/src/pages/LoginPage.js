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
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, {
        identifier,
        password,
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
            department: deptResponse.data,  // Include full department object with permissions
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
          <form onSubmit={handleLogin} className="space-y-6" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-zinc-300">
                Username
              </Label>
              <Input
                id="identifier"
                data-testid="login-identifier-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:ring-emerald-500"
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:ring-emerald-500"
                placeholder="Enter your password"
                required
              />
            </div>

            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={loading}
              className="w-full h-11 bg-emerald-500 text-black hover:bg-emerald-400 font-semibold transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="text-center text-sm text-zinc-500">
            <p>Contact your administrator for account access</p>
          </div>
        </div>
      </div>

      {/* Right Side - Background Image with Overlay */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('/background.png')`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <h2 className="text-5xl font-bold text-white">Welcome Back</h2>
            <p className="text-xl text-zinc-300">Manage your SMS & Voice tickets efficiently</p>
          </div>
        </div>
      </div>
      <div className="fixed bottom-4 right-4 z-50">
  <div className="rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-xl">
    Made by Hasan Ibrahim and his NOC Team
  </div>
</div>
    </div>
  );
}
