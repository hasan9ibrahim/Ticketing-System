import React, { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Phone, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/custom/StatusBadge";
import PriorityIndicator from "@/components/custom/PriorityIndicator";
import SearchableSelect from "@/components/custom/SearchableSelect";
import DateRangePickerWithRange from "@/components/custom/DateRangePickerWithRange";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function VoiceTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [enterpriseFilter, setEnterpriseFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: new Date(), to: new Date() });
  const [activeTab, setActiveTab] = useState("unassigned");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [formData, setFormData] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    fetchData();
  }, []);

  useEffect(() => {
    filterAndSortTickets();
  }, [searchTerm, priorityFilter, statusFilter, enterpriseFilter, dateRange, activeTab, tickets]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [ticketsRes, enterprisesRes, usersRes] = await Promise.all([
        axios.get(`${API}/tickets/voice`, { headers }),
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/users`, { headers }),
      ]);

      setTickets(ticketsRes.data);
      setEnterprises(enterprisesRes.data);
      setUsers(usersRes.data.filter((u) => u.role === "noc"));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const getOpenedViaPriority = (openedVia) => {
    if (!openedVia) return 999;
    const lower = openedVia.toLowerCase();
    if (lower.includes("monitoring")) return 0;
    if (lower.includes("teams")) return 1;
    if (lower.includes("email")) return 2;
    return 3;
  };

  const filterAndSortTickets = () => {
    let filtered = tickets;

    if (activeTab === "unassigned") {
      filtered = filtered.filter((t) => t.status === "Unassigned");
    } else if (activeTab === "assigned") {
      filtered = filtered.filter((t) => t.status === "Assigned");
    } else if (activeTab === "other") {
      filtered = filtered.filter((t) => !["Unassigned", "Assigned"].includes(t.status));
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (ticket) =>
          ticket.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.issue.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.priority === priorityFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.status === statusFilter);
    }

    if (enterpriseFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.customer_id === enterpriseFilter);
    }

    if (dateRange?.from) {
      const fromDay = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
      const toDay = dateRange.to ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate()) : fromDay;
      
      filtered = filtered.filter((ticket) => {
        const ticketDate = new Date(ticket.date);
        const ticketDay = new Date(ticketDate.getFullYear(), ticketDate.getMonth(), ticketDate.getDate());
        return ticketDay >= fromDay && ticketDay <= toDay;
      });
    }

    filtered.sort((a, b) => {
      const priorityOrder = { "Urgent": 0, "High": 1, "Medium": 2, "Low": 3 };
      const aPriority = priorityOrder[a.priority] || 999;
      const bPriority = priorityOrder[b.priority] || 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      const aVolume = parseInt(a.volume) || 0;
      const bVolume = parseInt(b.volume) || 0;
      if (aVolume !== bVolume) return bVolume - aVolume;
      
      return getOpenedViaPriority(a.opened_via) - getOpenedViaPriority(b.opened_via);
    });

    setFilteredTickets(filtered);
  };

  const groupTicketsByDate = () => {
    const grouped = {};
    filteredTickets.forEach((ticket) => {
      const date = new Date(ticket.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(ticket);
    });
    return grouped;
  };

  const openCreateSheet = () => {
    setEditingTicket(null);
    setFormData({ priority: "Medium", status: "Unassigned", opened_via: "Monitoring", is_lcr: "no", client_or_vendor: "client", volume: "0", customer_trunk: "" });
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
        await axios.put(`${API}/tickets/voice/${editingTicket.id}`, formData, { headers });
        toast.success("Ticket updated successfully");
      } else {
        await axios.post(`${API}/tickets/voice`, formData, { headers });
        toast.success("Ticket created successfully");
      }
      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save ticket");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="text-emerald-500">Loading voice tickets...</div></div>;

  const unassignedCount = tickets.filter(t => t.status === "Unassigned").length;
  const assignedCount = tickets.filter(t => t.status === "Assigned").length;
  const otherCount = tickets.filter(t => !["Unassigned", "Assigned"].includes(t.status)).length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="voice-tickets-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">Voice Tickets</h1>
          <p className="text-zinc-400 mt-1">Manage and track Voice trouble tickets</p>
        </div>
        <Button onClick={openCreateSheet} data-testid="create-voice-ticket-button" className="bg-emerald-500 text-black hover:bg-emerald-400 h-9">
          <Plus className="h-4 w-4 mr-2" />New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search tickets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500" />
        </div>
        <DateRangePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Priorities</SelectItem><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Statuses</SelectItem><SelectItem value="Unassigned">Unassigned</SelectItem><SelectItem value="Assigned">Assigned</SelectItem><SelectItem value="Awaiting Vendor">Awaiting Vendor</SelectItem><SelectItem value="Awaiting Client">Awaiting Client</SelectItem><SelectItem value="Awaiting AM">Awaiting AM</SelectItem><SelectItem value="Resolved">Resolved</SelectItem><SelectItem value="Unresolved">Unresolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Select value={enterpriseFilter} onValueChange={setEnterpriseFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white"><SelectValue placeholder="Enterprise" /></SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Enterprises</SelectItem>
            {enterprises.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-zinc-400 text-sm flex items-center">Sorted by: Priority → Volume → Opened Via</div>
        <Button variant="outline" onClick={() => { setSearchTerm(""); setPriorityFilter("all"); setStatusFilter("all"); setEnterpriseFilter("all"); setDateRange({ from: new Date(), to: new Date() }); }} className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800">Reset to Today</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 bg-zinc-900 border border-white/10">
          <TabsTrigger value="unassigned" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black">Unassigned ({unassignedCount})</TabsTrigger>
          <TabsTrigger value="assigned" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black">Assigned ({assignedCount})</TabsTrigger>
          <TabsTrigger value="other" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black">Other ({otherCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Priority</TableHead><TableHead className="text-zinc-400">Ticket #</TableHead><TableHead className="text-zinc-400">Enterprise</TableHead><TableHead className="text-zinc-400">Issue</TableHead><TableHead className="text-zinc-400">Status</TableHead><TableHead className="text-zinc-400">Assigned To</TableHead><TableHead className="text-zinc-400">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length > 0 ? Object.entries(groupTicketsByDate()).map(([date, tickets]) => (
                  <React.Fragment key={date}>
                    <TableRow className="bg-zinc-800/30 border-white/10">
                      <TableCell colSpan={7} className="py-2 px-4">
                        <div className="flex items-center space-x-3">
                          <Calendar className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-semibold text-emerald-500">{date}</span>
                          <div className="flex-1 h-px bg-white/10"></div>
                          <span className="text-xs text-zinc-500">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {tickets.map((ticket) => {
                      const assignedUser = users.find((u) => u.id === ticket.assigned_to);
                      return (
                        <TableRow key={ticket.id} onClick={() => openEditSheet(ticket)} className="border-white/5 hover:bg-zinc-800/50 cursor-pointer">
                          <TableCell className="p-3"><PriorityIndicator priority={ticket.priority} /></TableCell>
                          <TableCell className="text-white font-medium tabular-nums">{ticket.ticket_number}</TableCell>
                          <TableCell className="text-zinc-300">{ticket.customer}</TableCell>
                          <TableCell className="text-zinc-300 max-w-xs truncate">{ticket.issue}</TableCell>
                          <TableCell><StatusBadge status={ticket.status} /></TableCell>
                          <TableCell className="text-zinc-300">{assignedUser?.username || "Unassigned"}</TableCell>
                          <TableCell className="text-zinc-400 tabular-nums">{new Date(ticket.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                )) : <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-500">No tickets found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle className="text-white">{editingTicket ? "Edit Voice Ticket" : "Create Voice Ticket"}</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Priority *</Label><Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })} required><SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Status *</Label><Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })} required><SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="Unassigned">Unassigned</SelectItem><SelectItem value="Assigned">Assigned</SelectItem><SelectItem value="Awaiting Vendor">Awaiting Vendor</SelectItem><SelectItem value="Awaiting Client">Awaiting Client</SelectItem><SelectItem value="Awaiting AM">Awaiting AM</SelectItem><SelectItem value="Resolved">Resolved</SelectItem><SelectItem value="Unresolved">Unresolved</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Enterprise *</Label><SearchableSelect options={enterprises.map(e => ({ value: e.id, label: e.name }))} value={formData.customer_id} onChange={(value) => setFormData({ ...formData, customer_id: value })} placeholder="Search enterprise..." isRequired={true} isDisabled={!!editingTicket} /></div>
            <div className="space-y-2"><Label>Enterprise Role *</Label><RadioGroup value={formData.client_or_vendor} onValueChange={(value) => setFormData({ ...formData, client_or_vendor: value })} className="flex space-x-4"><div className="flex items-center space-x-2"><RadioGroupItem value="client" id="client-v" /><Label htmlFor="client-v" className="font-normal cursor-pointer">Client</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="vendor" id="vendor-v" /><Label htmlFor="vendor-v" className="font-normal cursor-pointer">Vendor</Label></div></RadioGroup></div>
            <div className="space-y-2"><Label>Assigned To</Label><SearchableSelect options={users.map(u => ({ value: u.id, label: u.username }))} value={formData.assigned_to} onChange={(value) => setFormData({ ...formData, assigned_to: value })} placeholder="Search NOC member..." /></div>
            <div className="space-y-2"><Label>Issue *</Label><Textarea value={formData.issue || ""} onChange={(e) => setFormData({ ...formData, issue: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Volume *</Label><Input value={formData.volume || ""} onChange={(e) => setFormData({ ...formData, volume: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required /></div>
              <div className="space-y-2"><Label>Opened Via *</Label><Select value={formData.opened_via} onValueChange={(value) => setFormData({ ...formData, opened_via: value })} required><SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="Monitoring">Monitoring</SelectItem><SelectItem value="Email">Email</SelectItem><SelectItem value="Teams">Teams</SelectItem><SelectItem value="AM">AM</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Enterprise Trunk *</Label><Input value={formData.customer_trunk || ""} onChange={(e) => setFormData({ ...formData, customer_trunk: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required /></div>
              <div className="space-y-2"><Label>Destination</Label><Input value={formData.destination || ""} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" /></div>
            </div>
            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400">{editingTicket ? "Update" : "Create"} Ticket</Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
