import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/custom/StatusBadge";
import PriorityIndicator from "@/components/custom/PriorityIndicator";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SMSTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTickets();
  }, [searchTerm, tickets]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [ticketsRes, clientsRes, usersRes] = await Promise.all([
        axios.get(`${API}/tickets/sms`, { headers }),
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/users`, { headers }),
      ]);

      setTickets(ticketsRes.data);
      setFilteredTickets(ticketsRes.data);
      setClients(clientsRes.data);
      setUsers(usersRes.data.filter((u) => u.role === "noc"));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const filterTickets = () => {
    if (!searchTerm) {
      setFilteredTickets(tickets);
      return;
    }

    const filtered = tickets.filter(
      (ticket) =>
        ticket.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.issue.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredTickets(filtered);
  };

  const openCreateSheet = () => {
    setEditingTicket(null);
    setFormData({
      priority: "Medium",
      status: "Assigned",
      opened_via: "Monitoring",
      is_lcr: "no",
    });
    setSheetOpen(true);
  };

  const openEditSheet = (ticket) => {
    setEditingTicket(ticket);
    setFormData(ticket);
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      if (editingTicket) {
        await axios.put(`${API}/tickets/sms/${editingTicket.id}`, formData, { headers });
        toast.success("Ticket updated successfully");
      } else {
        await axios.post(`${API}/tickets/sms`, formData, { headers });
        toast.success("Ticket created successfully");
      }

      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save ticket");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading SMS tickets...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="sms-tickets-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">SMS Tickets</h1>
          <p className="text-zinc-400 mt-1">Manage and track SMS trouble tickets</p>
        </div>
        <Button
          onClick={openCreateSheet}
          data-testid="create-sms-ticket-button"
          className="bg-emerald-500 text-black hover:bg-emerald-400 h-9"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search tickets by number, customer, or issue..."
          data-testid="search-sms-tickets-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-400">Priority</TableHead>
              <TableHead className="text-zinc-400">Ticket #</TableHead>
              <TableHead className="text-zinc-400">Customer</TableHead>
              <TableHead className="text-zinc-400">Issue</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Assigned To</TableHead>
              <TableHead className="text-zinc-400">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length > 0 ? (
              filteredTickets.map((ticket) => {
                const assignedUser = users.find((u) => u.id === ticket.assigned_to);
                return (
                  <TableRow
                    key={ticket.id}
                    onClick={() => openEditSheet(ticket)}
                    className="border-white/5 hover:bg-zinc-800/50 cursor-pointer"
                    data-testid="sms-ticket-row"
                  >
                    <TableCell className="p-3">
                      <PriorityIndicator priority={ticket.priority} />
                    </TableCell>
                    <TableCell className="text-white font-medium tabular-nums">{ticket.ticket_number}</TableCell>
                    <TableCell className="text-zinc-300">{ticket.customer}</TableCell>
                    <TableCell className="text-zinc-300 max-w-xs truncate">{ticket.issue}</TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell className="text-zinc-300">{assignedUser?.username || "Unassigned"}</TableCell>
                    <TableCell className="text-zinc-400 tabular-nums">
                      {new Date(ticket.date).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  No tickets found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Ticket Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-2xl overflow-y-auto" data-testid="sms-ticket-sheet">
          <SheetHeader>
            <SheetTitle className="text-white">{editingTicket ? "Edit SMS Ticket" : "Create SMS Ticket"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  required
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                  required
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="Assigned">Assigned</SelectItem>
                    <SelectItem value="Awaiting Vendor">Awaiting Vendor</SelectItem>
                    <SelectItem value="Awaiting Client">Awaiting Client</SelectItem>
                    <SelectItem value="Awaiting AM">Awaiting AM</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                    <SelectItem value="Unresolved">Unresolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                required
                disabled={!!editingTicket}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="customer-select">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select
                value={formData.assigned_to}
                onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="assigned-to-select">
                  <SelectValue placeholder="Select NOC member" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Issue *</Label>
              <Textarea
                value={formData.issue || ""}
                onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="issue-textarea"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Volume</Label>
                <Input
                  value={formData.volume || ""}
                  onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="e.g., 10000"
                />
              </div>
              <div className="space-y-2">
                <Label>Opened Via *</Label>
                <Select
                  value={formData.opened_via}
                  onValueChange={(value) => setFormData({ ...formData, opened_via: value })}
                  required
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="opened-via-select">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="Monitoring">Monitoring</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Teams">Teams</SelectItem>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="Monitoring, Email">Monitoring, Email</SelectItem>
                    <SelectItem value="Monitoring, Teams">Monitoring, Teams</SelectItem>
                    <SelectItem value="Email, Teams">Email, Teams</SelectItem>
                    <SelectItem value="Email, AM">Email, AM</SelectItem>
                    <SelectItem value="Teams, AM">Teams, AM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Trunk</Label>
                <Input
                  value={formData.customer_trunk || ""}
                  onChange={(e) => setFormData({ ...formData, customer_trunk: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Destination</Label>
                <Input
                  value={formData.destination || ""}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SID</Label>
                <Input
                  value={formData.sid || ""}
                  onChange={(e) => setFormData({ ...formData, sid: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Rate</Label>
                <Input
                  value={formData.rate || ""}
                  onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  value={formData.cost || ""}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor Trunk</Label>
                <Input
                  value={formData.vendor_trunk || ""}
                  onChange={(e) => setFormData({ ...formData, vendor_trunk: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Is LCR</Label>
                <Select
                  value={formData.is_lcr}
                  onValueChange={(value) => setFormData({ ...formData, is_lcr: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={formData.content || ""}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Root Cause</Label>
              <Textarea
                value={formData.root_cause || ""}
                onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Action Taken</Label>
              <Textarea
                value={formData.action_taken || ""}
                onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={formData.internal_notes || ""}
                onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400" data-testid="save-ticket-button">
                {editingTicket ? "Update Ticket" : "Create Ticket"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
