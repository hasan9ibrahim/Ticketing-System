import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Phone, TrendingUp, Activity } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { toast } from "sonner";
import StatusBadge from "@/components/custom/StatusBadge";
import PriorityIndicator from "@/components/custom/PriorityIndicator";
import DateRangePickerWithRange from "@/components/custom/DateRangePickerWithRange";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
            
      let url = `${API}/dashboard/stats`;
      const params = new URLSearchParams();
      
      if (dateRange?.from) {
        params.append('date_from', dateRange.from.toISOString().split('T')[0]);
      }
      if (dateRange?.to) {
        params.append('date_to', dateRange.to.toISOString().split('T')[0]);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
    } catch (error) {
      toast.error("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading dashboard...</div>
      </div>
    );
  }

  const statusColors = {
    Resolved: "#10b981",
    Assigned: "#3b82f6",
    "Awaiting Vendor": "#f59e0b",
    "Awaiting Client": "#f59e0b",
    "Awaiting AM": "#f59e0b",
    Unresolved: "#71717a",
  };

  const smsStatusData = Object.entries(stats?.sms_by_status || {}).map(([name, value]) => ({
    name,
    value,
    color: statusColors[name] || "#71717a",
  }));

  const voiceStatusData = Object.entries(stats?.voice_by_status || {}).map(([name, value]) => ({
    name,
    value,
    color: statusColors[name] || "#71717a",
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="dashboard-page">
           {/* Header with Date Filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400">Overview of ticket status and metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <DateRangePickerWithRange
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
          {dateRange && (
            <button
              onClick={() => setDateRange(null)}
              className="text-sm text-zinc-400 hover:text-white underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/50 border-white/10 grid-border" data-testid="sms-tickets-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total SMS Tickets</CardTitle>
            <MessageSquare className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white tabular-nums">{stats?.total_sms_tickets || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/10 grid-border" data-testid="voice-tickets-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Voice Tickets</CardTitle>
            <Phone className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white tabular-nums">{stats?.total_voice_tickets || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/10 grid-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Open Tickets</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white tabular-nums">
              {(stats?.total_sms_tickets || 0) +
                (stats?.total_voice_tickets || 0) -
                ((stats?.sms_by_status?.Resolved || 0) + (stats?.voice_by_status?.Resolved || 0))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/10 grid-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Resolved Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white tabular-nums">
              {(stats?.sms_by_status?.Resolved || 0) + (stats?.voice_by_status?.Resolved || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">SMS Tickets by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {smsStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={smsStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {smsStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid rgba(255,255,255,0.1)" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-zinc-500">No SMS tickets yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Voice Tickets by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {voiceStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={voiceStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {voiceStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid rgba(255,255,255,0.1)" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-zinc-500">No voice tickets yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card className="bg-zinc-900/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Recent Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recent_tickets && stats.recent_tickets.length > 0 ? (
            <div className="space-y-3" data-testid="recent-tickets-list">
              {stats.recent_tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
                  data-testid="recent-ticket-item"
                >
                  <div className="flex items-center space-x-4">
                    <PriorityIndicator priority={ticket.priority} />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-medium">{ticket.ticket_number}</span>
                        <span className="text-xs text-zinc-500">({ticket.type})</span>
                      </div>
                      <p className="text-sm text-zinc-400">{ticket.customer}</p>
                    </div>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500">No recent tickets</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
