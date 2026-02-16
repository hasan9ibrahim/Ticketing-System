import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePickerWithRange } from "@/components/custom/DateRangePickerWithRange";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

const ENTITY_TYPES = [
  { value: "all", label: "All Types" },
  { value: "user", label: "Users" },
  { value: "department", label: "Departments" },
  { value: "client", label: "Enterprises" },
  { value: "client_contact", label: "Enterprise Contacts" },
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

const formatFieldName = (field) => {
  // Convert camelCase to Title Case with spaces
  const fieldMap = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    department_id: "Department",
    role: "Role",
    priority: "Priority",
    status: "Status",
    assigned_to: "Assigned To",
    customer: "Customer",
    customer_id: "Customer",
    department_type: "Department Type",
    description: "Description",
    can_view_enterprises: "Can View Enterprises",
    can_edit_enterprises: "Can Edit Enterprises",
    can_create_enterprises: "Can Create Enterprises",
    can_delete_enterprises: "Can Delete Enterprises",
    can_view_tickets: "Can View Tickets",
    can_create_tickets: "Can Create Tickets",
    can_edit_tickets: "Can Edit Tickets",
    can_delete_tickets: "Can Delete Tickets",
    can_view_users: "Can View Users",
    can_edit_users: "Can Edit Users",
    can_view_all_tickets: "Can View All Tickets",
    contact_person: "Contact Person",
    contact_email: "Contact Email",
    contact_phone: "Contact Phone",
    noc_emails: "NOC Emails",
    notes: "Notes",
    ticket_number: "Ticket Number",
    date: "Date",
    updated_at: "Updated At",
    created_at: "Created At",
  };
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const formatChangeValue = (value, getUsernameById) => {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  // Check if it looks like a UUID (user ID)
  if (typeof value === "string" && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // This might be a user ID - try to resolve it
    const userId = value;
    if (getUsernameById) {
      const username = getUsernameById(userId);
      return username !== userId ? username : value;
    }
  }
  return String(value);
};

const formatChanges = (changes, getUsernameById) => {
  if (!changes) return null;
  
  if (changes.before && changes.after) {
    // This is an update operation
    const changedFields = [];
    const before = changes.before;
    const after = changes.after;
    
    // Only iterate over keys in the "after" object (these are the fields that were changed)
    Object.keys(after).forEach((key) => {
      // Skip internal fields
      if (key === "updated_at" || key === "_id" || key === "password_hash") return;
      
      const oldValue = before?.[key];
      const newValue = after[key];
      
      // Compare values properly
      const oldStr = JSON.stringify(oldValue);
      const newStr = JSON.stringify(newValue);
      
      if (oldStr !== newStr) {
        changedFields.push(
          <div key={key} className="text-xs">
            <span className="text-zinc-400">{formatFieldName(key)}:</span>{" "}
            <span className="text-red-400">{formatChangeValue(oldValue, getUsernameById)}</span>
            {" → "}
            <span className="text-emerald-400">{formatChangeValue(newValue, getUsernameById)}</span>
          </div>
        );
      }
    });
    
    return changedFields.length > 0 ? changedFields : <span className="text-zinc-500 text-xs">No significant changes</span>;
  } else if (changes.deleted_user || changes.deleted_department || changes.deleted_client || changes.deleted_ticket) {
    // This is a delete operation
    return (
      <div className="text-xs text-red-400">
        Record deleted
      </div>
    );
  } else {
    // This is a create operation - show the created fields
    const createdFields = [];
    Object.keys(changes).forEach((key) => {
      if (key === "updated_at" || key === "_id" || key === "password_hash") return;
      createdFields.push(
        <div key={key} className="text-xs">
          <span className="text-zinc-400">{formatFieldName(key)}:</span>{" "}
          <span className="text-emerald-400">{formatChangeValue(changes[key], getUsernameById)}</span>
        </div>
      );
    });
    return createdFields.length > 0 ? createdFields : <span className="text-zinc-500 text-xs">Created</span>;
  }
};

export default function AuditPage() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [dateRange, setDateRange] = useState(null);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [entityType, actionType, dateRange, pagination.offset, pagination.limit]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const getUsernameById = (userId) => {
    if (!userId) return "None";
    const user = users.find(u => u.id === userId);
    return user ? user.username : userId;
  };

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
      if (dateRange?.from) {
        const fromDate = dateRange.from;
        const year = fromDate.getFullYear();
        const month = String(fromDate.getMonth() + 1).padStart(2, '0');
        const day = String(fromDate.getDate()).padStart(2, '0');
        params.append("date_from", `${year}-${month}-${day}`);
      }
      if (dateRange?.to) {
        const toDate = dateRange.to;
        const year = toDate.getFullYear();
        const month = String(toDate.getMonth() + 1).padStart(2, '0');
        const day = String(toDate.getDate()).padStart(2, '0');
        params.append("date_to", `${year}-${month}-${day}`);
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
      if (dateRange?.from) {
        const fromDate = dateRange.from;
        const year = fromDate.getFullYear();
        const month = String(fromDate.getMonth() + 1).padStart(2, '0');
        const day = String(fromDate.getDate()).padStart(2, '0');
        countParams.append("date_from", `${year}-${month}-${day}`);
      }
      if (dateRange?.to) {
        const toDate = dateRange.to;
        const year = toDate.getFullYear();
        const month = String(toDate.getMonth() + 1).padStart(2, '0');
        const day = String(toDate.getDate()).padStart(2, '0');
        countParams.append("date_to", `${year}-${month}-${day}`);
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
    setDateRange(null);
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

            {/* Date Range Picker */}
            <DateRangePickerWithRange
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />

            {/* Clear Filters */}
            <Button
              variant="outline"
              onClick={clearFilters}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4 mr-2" />
              Clear
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
                    <TableCell className="text-white font-mono text-sm whitespace-nowrap">
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
                    <TableCell className="text-zinc-400 text-sm max-w-xs">
                      {formatChanges(log.changes, getUsernameById)}
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
