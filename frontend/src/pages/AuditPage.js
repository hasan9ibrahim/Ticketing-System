import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

const ENTITY_TYPES = [
  { value: "all", label: "All Types" },
  { value: "user", label: "Users" },
  { value: "department", label: "Departments" },
  { value: "client", label: "Clients" },
  { value: "client_contact", label: "Client Contacts" },
  { value: "ticket_sms", label: "SMS Tickets" },
  { value: "ticket_voice", label: "Voice Tickets" },
];

const ACTION_COLORS = {
  create: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  update: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delete: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ENTITY_LABELS = {
  user: "User",
  department: "Department",
  client: "Enterprise",
  client_contact: "Enterprise Contact",
  ticket_sms: "SMS Ticket",
  ticket_voice: "Voice Ticket",
};

export default function AuditPage() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });

  useEffect(() => {
    fetchAuditLogs();
  }, [entityType, actionType, dateFrom, dateTo, pagination.offset, pagination.limit]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      const params = new URLSearchParams();
      params.append("limit", pagination.limit);
      params.append("offset", pagination.offset);
      
      if (entityType && entityType !== "all") {
        params.append("entity_type", entityType);
      }
      if (actionType && actionType !== "all") {
        params.append("action", actionType);
      }
      if (dateFrom) {
        params.append("date_from", dateFrom);
      }
      if (dateTo) {
        params.append("date_to", dateTo);
      }
      
      const response = await axios.get(`${API}/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAuditLogs(response.data);
      
      // Get total count
      const countParams = new URLSearchParams();
      if (entityType && entityType !== "all") {
        countParams.append("entity_type", entityType);
      }
      if (actionType && actionType !== "all") {
        countParams.append("action", actionType);
      }
      if (dateFrom) {
        countParams.append("date_from", dateFrom);
      }
      if (dateTo) {
        countParams.append("date_to", dateTo);
      }
      
      const countResponse = await axios.get(`${API}/audit-logs/count?${countParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setPagination(prev => ({ ...prev, total: countResponse.data.total }));
    } catch (error) {
      toast.error("Failed to load audit logs");
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = searchTerm
    ? auditLogs.filter(
        (log) =>
          log.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.entity_type.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : auditLogs;

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const handlePreviousPage = () => {
    if (pagination.offset > 0) {
      setPagination((prev) => ({ ...prev, offset: prev.offset - prev.limit }));
    }
  };

  const handleNextPage = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const clearFilters = () => {
    setEntityType("all");
    setActionType("all");
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
          <p className="text-zinc-400 mt-1">
            Track all changes made in the system
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search user, entity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white"
              />
            </div>

            {/* Entity Type */}
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {ENTITY_TYPES.map((type) => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="text-white focus:bg-zinc-800"
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Type */}
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-white focus:bg-zinc-800">
                  All Actions
                </SelectItem>
                <SelectItem value="create" className="text-white focus:bg-zinc-800">
                  Created
                </SelectItem>
                <SelectItem value="update" className="text-white focus:bg-zinc-800">
                  Updated
                </SelectItem>
                <SelectItem value="delete" className="text-white focus:bg-zinc-800">
                  Deleted
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Date From */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white"
              />
            </div>

            {/* Date To */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          </div>

          {/* Clear Filters */}
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={clearFilters}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-zinc-900">
                <TableHead className="text-zinc-400">Timestamp</TableHead>
                <TableHead className="text-zinc-400">User</TableHead>
                <TableHead className="text-zinc-400">Action</TableHead>
                <TableHead className="text-zinc-400">Entity Type</TableHead>
                <TableHead className="text-zinc-400">Entity Name</TableHead>
                <TableHead className="text-zinc-400">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                    Loading audit logs...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="text-white font-mono text-sm">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {log.username}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border ${ACTION_COLORS[log.action] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}
                      >
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {ENTITY_LABELS[log.entity_type] || log.entity_type}
                    </TableCell>
                    <TableCell className="text-white font-medium">
                      {log.entity_name}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">
                      {log.changes ? (
                        <span className="text-xs">
                          {log.action === "update" && log.changes.before && log.changes.after ? (
                            <span>
                              {Object.keys(log.changes.after).filter(k => k !== "updated_at").join(", ")}
                            </span>
                          ) : (
                            <span>View details</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-zinc-400 text-sm">
          Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} entries
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={pagination.offset === 0}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-zinc-400 text-sm">
            Page {currentPage} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
