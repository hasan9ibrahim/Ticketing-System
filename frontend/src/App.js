import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardLayout from "./components/DashboardLayout";
import DashboardPage from "./pages/DashboardPage";
import SMSTicketsPage from "./pages/SMSTicketsPage";
import VoiceTicketsPage from "./pages/VoiceTicketsPage";
import EnterprisesPage from "./pages/EnterprisesPage";
import UsersPage from "./pages/UsersPage";
import MyEnterprisesPage from "./pages/MyEnterprisesPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import { Toaster } from "@/components/ui/sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_API_URL}/api`;

// Component to save current path to localStorage on navigation
function PathTracker() {
  const location = useLocation();
  const [user] = useState(() => {
    const userData = localStorage.getItem("user");
    return userData ? JSON.parse(userData) : null;
  });
  
  useEffect(() => {
    // Save current path with user-specific key (except login and root)
    if (user && location.pathname !== "/login" && location.pathname !== "/") {
      localStorage.setItem(`lastPath_${user.id}`, location.pathname);
    }
  }, [location, user]);
  
  return null;
}

function App() {
  const [user, setUser] = useState(() => {
    // Check localStorage for existing user on initial load
    const userData = localStorage.getItem("user");
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(true);

  // Get user-specific last path
  const getLastPath = () => {
    if (user && user.id) {
      return localStorage.getItem(`lastPath_${user.id}`) || "/";
    }
    return "/";
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      const parsedUser = JSON.parse(userData);
      // Fetch department info to get department_type
      fetchUserDepartment(parsedUser, token);
    }
    setLoading(false);
  }, []);

  const fetchUserDepartment = async (currentUser, token) => {
    try {
      const response = await axios.get(`${API}/my-department`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data) {
        const updatedUser = {
          ...currentUser,
          department_id: response.data.id,
          department_type: response.data.department_type,
          department: response.data,  // Include full department object with permissions
        };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      } else {
        setUser(currentUser);
      }
    } catch (error) {
      console.error("Failed to fetch department:", error);
      setUser(currentUser);
    }
  };

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-zinc-950"><div className="text-emerald-500">Loading...</div></div>;
  }

  return (
    <div className="App">
      <BrowserRouter>
        <PathTracker />
        <Routes>
          <Route path="/login" element={!user ? <LoginPage setUser={setUser} /> : <Navigate to={getLastPath()} />} />
          <Route path="/" element={user ? <DashboardLayout user={user} setUser={setUser} /> : <Navigate to="/login" />}>
            <Route index element={<DashboardPage />} />
            <Route path="sms-tickets" element={<SMSTicketsPage />} />
            <Route path="voice-tickets" element={<VoiceTicketsPage />} />
            <Route path="enterprises" element={user?.role === "admin" || user?.role === "noc" || user?.department?.can_view_enterprises ? <EnterprisesPage /> : <Navigate to="/my-enterprises" />} />
            <Route path="my-enterprises" element={user?.role === "am" || user?.department_type ? <MyEnterprisesPage /> : <Navigate to="/" />} />
            <Route path="users" element={user?.role === "admin" || user?.department?.can_edit_users ? <UsersPage /> : <Navigate to="/" />} />
            <Route path="departments" element={user?.role === "admin" ? <DepartmentsPage /> : <Navigate to="/" />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-left" />
    </div>
  );
}

export default App;
