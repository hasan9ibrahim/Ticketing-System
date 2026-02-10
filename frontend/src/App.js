import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardLayout from "./components/DashboardLayout";
import DashboardPage from "./pages/DashboardPage";
import SMSTicketsPage from "./pages/SMSTicketsPage";
import VoiceTicketsPage from "./pages/VoiceTicketsPage";
import ClientsPage from "./pages/ClientsPage";
import UsersPage from "./pages/UsersPage";
import MyClientsPage from "./pages/MyClientsPage";
import { Toaster } from "@/components/ui/sonner";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-zinc-950"><div className="text-emerald-500">Loading...</div></div>;
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage setUser={setUser} /> : <Navigate to="/" />} />
          <Route path="/" element={user ? <DashboardLayout user={user} setUser={setUser} /> : <Navigate to="/login" />}>
            <Route index element={<DashboardPage />} />
            <Route path="sms-tickets" element={<SMSTicketsPage />} />
            <Route path="voice-tickets" element={<VoiceTicketsPage />} />
            <Route path="clients" element={user?.role === "admin" ? <ClientsPage /> : <Navigate to="/my-clients" />} />
            <Route path="my-clients" element={user?.role === "am" ? <MyClientsPage /> : <Navigate to="/" />} />
            <Route path="users" element={user?.role === "admin" ? <UsersPage /> : <Navigate to="/" />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
