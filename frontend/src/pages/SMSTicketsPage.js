import React, { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ArrowUpDown, Calendar, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import StatusBadge from "@/components/custom/StatusBadge";
import PriorityIndicator from "@/components/custom/PriorityIndicator";
import SearchableSelect from "@/components/custom/SearchableSelect";
import DateRangePickerWithRange from "@/components/custom/DateRangePickerWithRange";
import IssueTypeSelect, { SMS_ISSUE_TYPES } from "@/components/custom/IssueTypeSelect";
import OpenedViaSelect, { OPENED_VIA_OPTIONS } from "@/components/custom/OpenedViaSelect";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function SMSTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [enterpriseFilter, setEnterpriseFilter] = useState("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: new Date(), to: new Date() });
  const [sortBy, setSortBy] = useState("priority-volume-opened");
  const [activeTab, setActiveTab] = useState("unassigned");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [formData, setFormData] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState(null);
  const [sameDayDialogOpen, setSameDayDialogOpen] = useState(false);
  const [sameDayTickets, setSameDayTickets] = useState([]);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [actionsDialogOpen, setActionsDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketActions, setTicketActions] = useState([]);
  const [newActionText, setNewActionText] = useState("");
  const [loadingActions, setLoadingActions] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    fetchData();
  }, []);

  useEffect(() => {
    filterAndSortTickets();
  }, [searchTerm, priorityFilter, statusFilter, enterpriseFilter, issueTypeFilter, destinationFilter, assignedToFilter, dateRange, sortBy, activeTab, tickets]);

  // Helper to get display text for issues
  const getIssueDisplayText = (ticket) => {
    const issues = ticket.issue_types || [];
    const other = ticket.issue_other || "";
    const legacy = ticket.issue || "";
    
    // If new format exists, use it
    if (issues.length > 0 || other) {
      const parts = [...issues];
      if (other) parts.push(`Other: ${other}`);
      return parts.join(", ");
    }
    // Fall back to legacy issue field
    return legacy;
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [ticketsRes, enterprisesRes, usersRes] = await Promise.all([
        axios.get(`${API}/tickets/sms`, { headers }),
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/users`, { headers }),
      ]);

      setTickets(ticketsRes.data);
      setEnterprises(enterprisesRes.data);
      setAllUsers(usersRes.data);
      setUsers(usersRes.data.filter((u) => u.role === "noc"));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const getOpenedViaPriority = (openedVia) => {
    if (!openedVia) return 999;
    // Handle array format
    const values = Array.isArray(openedVia) ? openedVia : [openedVia];
    // Return lowest priority (highest importance) found: Monitoring > AM > Teams > Email
    let minPriority = 999;
    for (const val of values) {
      const lower = val.toLowerCase();
      if (lower.includes("monitoring")) minPriority = Math.min(minPriority, 0);
      else if (lower.includes("am")) minPriority = Math.min(minPriority, 1);
      else if (lower.includes("teams")) minPriority = Math.min(minPriority, 2);
      else if (lower.includes("email")) minPriority = Math.min(minPriority, 3);
    }
    return minPriority;
  };

  // Helper to get display text for opened via
  const getOpenedViaDisplayText = (ticket) => {
    const openedVia = ticket.opened_via;
    if (Array.isArray(openedVia)) {
      return openedVia.join(", ");
    }
    return openedVia || "";
  };

  const filterAndSortTickets = () => {
    let filtered = tickets;

    // Tab filtering
    if (activeTab === "unassigned") {
      filtered = filtered.filter((t) => t.status === "Unassigned");
    } else if (activeTab === "assigned") {
      filtered = filtered.filter((t) => t.status === "Assigned");
    } else if (activeTab === "other") {
      filtered = filtered.filter((t) => 
        !["Unassigned", "Assigned"].includes(t.status)
      );
    }

    // Text search - searches across issues
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((ticket) => {
        const issueText = getIssueDisplayText(ticket).toLowerCase();
        return (
          ticket.ticket_number.toLowerCase().includes(term) ||
          ticket.customer.toLowerCase().includes(term) ||
          issueText.includes(term)
        );
      });
    }

    // Priority filter
    if (priorityFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.priority === priorityFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.status === statusFilter);
    }

    // Enterprise filter
    if (enterpriseFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.customer_id === enterpriseFilter);
    }

    // Issue type filter
    if (issueTypeFilter !== "all") {
      filtered = filtered.filter((ticket) => {
        const types = ticket.issue_types || [];
        return types.includes(issueTypeFilter);
      });
    }

    // Destination filter
    if (destinationFilter) {
      const term = destinationFilter.toLowerCase();
      filtered = filtered.filter((ticket) => 
        ticket.destination?.toLowerCase().includes(term)
      );
    }

    // Assigned To filter
    if (assignedToFilter !== "all") {
      if (assignedToFilter === "unassigned") {
        filtered = filtered.filter((ticket) => !ticket.assigned_to);
      } else {
        filtered = filtered.filter((ticket) => ticket.assigned_to === assignedToFilter);
      }
    }

    // Date range filter
    if (dateRange?.from) {
      const fromDay = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
      const toDay = dateRange.to 
        ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate())
        : fromDay;
      
      filtered = filtered.filter((ticket) => {
        const ticketDate = new Date(ticket.date);
        const ticketDay = new Date(ticketDate.getFullYear(), ticketDate.getMonth(), ticketDate.getDate());
        return ticketDay >= fromDay && ticketDay <= toDay;
      });
    }

    // Multi-level sorting: Date (newest first) > Priority > Volume > Opened Via
    filtered.sort((a, b) => {
      // First by date only (not time) - newest to oldest
      const aDateObj = new Date(a.date);
      const bDateObj = new Date(b.date);
      const aDateOnly = new Date(aDateObj.getFullYear(), aDateObj.getMonth(), aDateObj.getDate()).getTime();
      const bDateOnly = new Date(bDateObj.getFullYear(), bDateObj.getMonth(), bDateObj.getDate()).getTime();
      if (aDateOnly !== bDateOnly) {
        return bDateOnly - aDateOnly; // Descending (newest first)
      }

      // Then by priority (highest to lowest: Urgent > High > Medium > Low)
      const priorityOrder = { "Urgent": 0, "High": 1, "Medium": 2, "Low": 3 };
      const aPriority = priorityOrder[a.priority] ?? 999;
      const bPriority = priorityOrder[b.priority] ?? 999;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Then by volume (highest to lowest)
      const aVolume = parseInt(a.volume) || 0;
      const bVolume = parseInt(b.volume) || 0;
      if (aVolume !== bVolume) {
        return bVolume - aVolume;
      }
      
      // Then by opened via (Monitoring > AM > Teams > Email)
      return getOpenedViaPriority(a.opened_via) - getOpenedViaPriority(b.opened_via);
    });

    setFilteredTickets(filtered);
  };

  const groupTicketsByDate = () => {
    const grouped = {};
    filteredTickets.forEach((ticket) => {
      const date = new Date(ticket.date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(ticket);
    });
            // Sort entries by date (newest first)
    const sortedEntries = Object.entries(grouped).sort((a, b) => {
      const aDate = new Date(a[0]).getTime();
      const bDate = new Date(b[0]).getTime();
      return bDate - aDate; // Descending (newest first)
    });
    // Also sort tickets within each date group by priority > volume > opened_via
    // IMPORTANT: Create a copy of each tickets array before sorting to avoid mutating state
    sortedEntries.forEach(([date, tickets]) => {
      const ticketsCopy = [...tickets];
      ticketsCopy.sort((a, b) => {
        // By priority (urgent to low)
        const priorityOrder = { "Urgent": 0, "High": 1, "Medium": 2, "Low": 3 };
        const aPriority = priorityOrder[a.priority] ?? 999;
        const bPriority = priorityOrder[b.priority] ?? 999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Then by volume (highest to lowest)
        const aVolume = parseInt(a.volume) || 0;
        const bVolume = parseInt(b.volume) || 0;
        if (aVolume !== bVolume) return bVolume - aVolume;
        
        // Then by opened via (Monitoring > AM > Teams > Email)
        return getOpenedViaPriority(a.opened_via) - getOpenedViaPriority(b.opened_via);
      });
            // Replace the original array with the sorted copy
      const index = sortedEntries.findIndex(entry => entry[0] === date);
      if (index !== -1) {
        sortedEntries[index][1] = ticketsCopy;
      }
    });
    return { entries: sortedEntries, grouped };
  };

  const openCreateSheet = () => {
    setEditingTicket(null);
    setFormData({
      priority: "Medium",
      status: "Unassigned",
      opened_via: ["Monitoring"],
      is_lcr: "no",
      client_or_vendor: "client",
      volume: "0",
      customer_trunk: "",
      issue_types: [],
      issue_other: ""
    });
    setSheetOpen(true);
  };

  const openEditSheet = (ticket) => {
    setEditingTicket(ticket);
    // Normalize opened_via to array
    const openedVia = Array.isArray(ticket.opened_via) 
      ? ticket.opened_via 
      : ticket.opened_via ? ticket.opened_via.split(",").map(v => v.trim()) : [];
    setFormData({
      ...ticket,
      opened_via: openedVia,
      issue_types: ticket.issue_types || [],
      issue_other: ticket.issue_other || ""
    });
    setSheetOpen(true);
  };

  const isAM = currentUser?.role === "am";
  const canModify = !isAM;

  const formatApiError = (error, fallback = "Request failed") => {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const msg = detail
      .map((d) => d?.msg)
      .filter(Boolean)
      .join(", ");
    return msg || fallback;
  }

  return fallback;
};
  
  // Check for similar tickets within the last week (must match ALL of SID, Destination, and Content)
  const findSimilarTickets = (sid, destination, content) => {
    if (!sid && !destination && !content) return [];
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return tickets.filter(ticket => {
      // Skip if it's the same ticket being edited
      if (editingTicket && ticket.id === editingTicket.id) return false;
      
      const ticketDate = new Date(ticket.date);
      if (ticketDate < oneWeekAgo) return false;
      
      // Check for SID match (if provided)
      const sidMatch = !sid || (ticket.sid && sid.toLowerCase() === ticket.sid.toLowerCase());
      // Check for Destination match (if provided)
      const destMatch = !destination || (ticket.destination && destination.toLowerCase() === ticket.destination.toLowerCase());
      // Check for Content match (if provided)
      const contentMatch = !content || (ticket.content && content.toLowerCase() === ticket.content.toLowerCase());
      
      // ALL provided fields must match
      return sidMatch && destMatch && contentMatch;
    });
  };

    // Check for same-day identical tickets (Enterprise, Trunk, Destination, Issue)
  const findSameDayIdenticalTickets = (customerId, customerTrunk, destination, issueTypes) => {
    if (!customerId) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return tickets.filter(ticket => {
      // Skip if it's the same ticket being edited
      if (editingTicket && ticket.id === editingTicket.id) return false;
      
      const ticketDate = new Date(ticket.date);
      if (ticketDate < today || ticketDate >= tomorrow) return false;
      
      // Check for Enterprise match
      const enterpriseMatch = ticket.customer_id === customerId;
      // Check for Trunk match
      const trunkMatch = !customerTrunk || (ticket.customer_trunk && customerTrunk.toLowerCase() === ticket.customer_trunk.toLowerCase());
      // Check for Destination match
      const destMatch = !destination || (ticket.destination && destination.toLowerCase() === ticket.destination.toLowerCase());
      // Check for Issue match (check if any issue types overlap)
      const ticketIssues = ticket.issue_types || [];
      const issueMatch = !issueTypes || issueTypes.length === 0 || issueTypes.some(i => ticketIssues.includes(i));
      
      return enterpriseMatch && trunkMatch && destMatch && issueMatch;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✅ Enterprise required
  if (!formData.customer_id) {
    toast.error("Enterprise is required");
    return;
  }

    // Validate opened_via
    if (!formData.opened_via || formData.opened_via.length === 0) {
      toast.error("Please select at least one 'Opened Via' option");
      return;
    }

    // Validate status - can't be "Assigned" without assigned_to
    if (formData.status === "Assigned" && !formData.assigned_to) {
      toast.error("Status cannot be 'Assigned' unless a NOC member is assigned");
      return;
    }
    
        // Validate max 3 assigned tickets per member
    if (formData.status === "Assigned" && formData.assigned_to) {
      const assignedToId = formData.assigned_to;
      const currentAssignedCount = tickets.filter(
        t => t.assigned_to === assignedToId && t.status === "Assigned" && t.id !== editingTicket?.id
      ).length;
      
      if (currentAssignedCount >= 3) {
        const user = users.find(u => u.id === assignedToId);
        toast.error(`${user?.username || 'This member'} already has 3 assigned tickets. Maximum is 3.`);
        return;
      }
    }
    
        // Check for similar tickets (only for new tickets)
    if (!editingTicket) {
      const similarTickets = findSimilarTickets(
        formData.sid,
        formData.destination,
        formData.content
      );
      
      if (similarTickets.length > 0) {
        const ticketNumbers = similarTickets.map(t => t.ticket_number).join(', ');
        toast.warning(`Similar tickets found within the last week: ${ticketNumbers}`);
      }
      
      // Check for same-day identical tickets (Enterprise, Trunk, Destination, Issue)
      const sameDayIdentical = findSameDayIdenticalTickets(
        formData.customer_id,
        formData.customer_trunk,
        formData.destination,
        formData.issue_types
      );

      if (sameDayIdentical.length > 0) {
        const ticketNumbers = sameDayIdentical.map(t => t.ticket_number).join(', ');
        setSameDayTickets(sameDayIdentical);
        setPendingFormData(formData);
        setSameDayDialogOpen(true);
        return; // Stop here, wait for user confirmation
      }
    }

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
      toast.error(formatApiError(error, "Failed to save ticket"));
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/tickets/sms/${ticketToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Ticket deleted successfully");
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete ticket");
    }
  };

    const handleConfirmedSubmit = async () => {
    if (!pendingFormData) return;
    
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/tickets/sms`, pendingFormData, { headers });
      toast.success("Ticket created successfully");
      setSameDayDialogOpen(false);
      setSameDayTickets([]);
      setPendingFormData(null);
      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(formatApiError(error, "Failed to save ticket"));
    }
  };

    const openActionsDialog = async (ticket) => {
    setSelectedTicket(ticket);
    setTicketActions(ticket.actions || []);
    setActionsDialogOpen(true);
  };

  const handleAddAction = async () => {
    if (!newActionText.trim() || !selectedTicket) return;
    
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/tickets/sms/${selectedTicket.id}/actions`,
        { text: newActionText },
        { headers }
      );
      
      setTicketActions([...ticketActions, response.data.action]);
      setNewActionText("");
      toast.success("Action added successfully");
      fetchData(); // Refresh to get updated actions
    } catch (error) {
      toast.error("Failed to add action");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading SMS tickets...</div>
      </div>
    );
  }

  const unassignedCount = tickets.filter(t => t.status === "Unassigned").length;
  const assignedCount = tickets.filter(t => t.status === "Assigned").length;
  const otherCount = tickets.filter(t => !["Unassigned", "Assigned"].includes(t.status)).length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="sms-tickets-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">SMS Tickets</h1>
          <p className="text-zinc-400 mt-1">Manage and track SMS trouble tickets</p>
        </div>
        {canModify && (
          <Button
            onClick={openCreateSheet}
            data-testid="create-sms-ticket-button"
            className="bg-emerald-500 text-black hover:bg-emerald-400 h-9"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search tickets by number, enterprise, or issue..."
            data-testid="search-sms-tickets-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>

        <DateRangePickerWithRange
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="filter-priority">
            <SelectValue placeholder="Filter by Priority" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="filter-status">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Unassigned">Unassigned</SelectItem>
            <SelectItem value="Assigned">Assigned</SelectItem>
            <SelectItem value="Awaiting Vendor">Awaiting Vendor</SelectItem>
            <SelectItem value="Awaiting Client">Awaiting Client</SelectItem>
            <SelectItem value="Awaiting AM">Awaiting AM</SelectItem>
            <SelectItem value="Resolved">Resolved</SelectItem>
            <SelectItem value="Unresolved">Unresolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Select value={enterpriseFilter} onValueChange={setEnterpriseFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="filter-enterprise">
            <SelectValue placeholder="Filter by Enterprise" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Enterprises</SelectItem>
            {enterprises.map((enterprise) => (
              <SelectItem key={enterprise.id} value={enterprise.id}>
                {enterprise.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="filter-issue-type">
            <SelectValue placeholder="Filter by Issue Type" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Issue Types</SelectItem>
            {SMS_ISSUE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by Destination..."
          data-testid="filter-destination"
          value={destinationFilter}
          onChange={(e) => setDestinationFilter(e.target.value)}
          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
        />

        <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="filter-assigned-to">
            <SelectValue placeholder="Filter by Assigned To" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="text-zinc-400 text-sm flex items-center">
              Sorted by: Date → Priority → Volume → Opened Via
        </div>

        <Button
          variant="outline"
          onClick={() => {
            setSearchTerm("");
            setPriorityFilter("all");
            setStatusFilter("all");
            setEnterpriseFilter("all");
            setIssueTypeFilter("all");
            setDestinationFilter("");
            setAssignedToFilter("all");
            setDateRange({ from: new Date(), to: new Date() });
          }}
          className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
          data-testid="clear-filters-button"
        >
          Reset to Today
        </Button>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 bg-zinc-900 border border-white/10">
          <TabsTrigger 
            value="unassigned" 
            className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black"
            data-testid="tab-unassigned"
          >
            Unassigned ({unassignedCount})
          </TabsTrigger>
          <TabsTrigger 
            value="assigned"
            className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black"
            data-testid="tab-assigned"
          >
            Assigned ({assignedCount})
          </TabsTrigger>
          <TabsTrigger 
            value="other"
            className="data-[state=active]:bg-emerald-500 data-[state=active]:text-black"
            data-testid="tab-other"
          >
            Other ({otherCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {/* Table */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Priority</TableHead>
                  <TableHead className="text-zinc-400">Volume</TableHead>
                  <TableHead className="text-zinc-400">Ticket#</TableHead>
                  <TableHead className="text-zinc-400">Enterprise Trunk</TableHead>
                  <TableHead className="text-zinc-400">Destination</TableHead>
                  <TableHead className="text-zinc-400">Issue</TableHead>
                  <TableHead className="text-zinc-400">Opened Via</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Assigned To</TableHead>
                  <TableHead className="text-zinc-400">Date Created</TableHead>
                  <TableHead className="text-zinc-400">Date Modified</TableHead>
                  <TableHead className="text-zinc-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length > 0 ? (
                  (() => {
                    const { entries: sortedEntries } = groupTicketsByDate();
                    return sortedEntries.map(([date, tickets]) => (
                      <React.Fragment key={date}>
                        {/* Date Separator */}
                        <TableRow className="bg-zinc-800/30 border-white/10">
                          <TableCell colSpan={11} className="py-2 px-4">
                            <div className="flex items-center space-x-3">
                              <Calendar className="h-4 w-4 text-emerald-500" />
                              <span className="text-sm font-semibold text-emerald-500">{date}</span>
                              <div className="flex-1 h-px bg-white/10"></div>
                              <span className="text-xs text-zinc-500">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Tickets for this date */}
                        {tickets.map((ticket) => {
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
                              <TableCell className="text-zinc-300 tabular-nums">{ticket.volume || "0"}</TableCell>
                              <TableCell className="text-white font-medium tabular-nums">{ticket.ticket_number}</TableCell>
                              <TableCell className="text-zinc-300">{ticket.customer_trunk || "-"}</TableCell>
                              <TableCell className="text-zinc-300">{ticket.destination || "-"}</TableCell>
                              <TableCell className="text-zinc-300 max-w-xs truncate">{getIssueDisplayText(ticket)}</TableCell>
                              <TableCell className="text-zinc-300">{getOpenedViaDisplayText(ticket) || "-"}</TableCell>
                              <TableCell>
                                <StatusBadge status={ticket.status} />
                              </TableCell>
                              <TableCell className="text-zinc-300">{assignedUser?.username || "Unassigned"}</TableCell>
                              <TableCell className="text-zinc-400 tabular-nums">
                                                                {new Date(ticket.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {new Date(ticket.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </TableCell>
                              <TableCell className="text-zinc-400 tabular-nums">
                                {ticket.updated_at ? `${new Date(ticket.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${new Date(ticket.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : "-"}
                              </TableCell>
                                <TableCell className="text-zinc-400">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openActionsDialog(ticket);
                                  }}
                                  className="text-zinc-400 hover:text-white"
                                >
                                  <MessageSquare className="h-4 w-4 mr-1" />
                                  {ticket.actions?.length || 0}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    ));
                  })()
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-zinc-500">
                      No tickets found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ticket Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-2xl overflow-y-auto" data-testid="sms-ticket-sheet">
          <SheetHeader>
            <SheetTitle className="text-white">{isAM ? "View SMS Ticket" : editingTicket ? "Edit SMS Ticket" : "Create SMS Ticket"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })} required>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem><SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })} required>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="Unassigned">Unassigned</SelectItem><SelectItem value="Assigned">Assigned</SelectItem>
                    <SelectItem value="Awaiting Vendor">Awaiting Vendor</SelectItem><SelectItem value="Awaiting Client">Awaiting Client</SelectItem>
                    <SelectItem value="Awaiting AM">Awaiting AM</SelectItem><SelectItem value="Resolved">Resolved</SelectItem>
                    <SelectItem value="Unresolved">Unresolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Enterprise *</Label>
              <SearchableSelect options={enterprises.map(e => ({ value: e.id, label: e.name }))} value={formData.customer_id} onChange={(value) => setFormData({ ...formData, customer_id: value })} placeholder="Search enterprise..." isRequired={true} isDisabled={!!editingTicket} />
            </div>
            <div className="space-y-2">
              <Label>Enterprise Role *</Label>
              <RadioGroup value={formData.client_or_vendor} onValueChange={(value) => setFormData({ ...formData, client_or_vendor: value })} className="flex space-x-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="client" id="client" /><Label htmlFor="client" className="font-normal cursor-pointer">Client</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="vendor" id="vendor" /><Label htmlFor="vendor" className="font-normal cursor-pointer">Vendor</Label></div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <SearchableSelect options={users.map(u => ({ value: u.id, label: u.username }))} value={formData.assigned_to} onChange={(value) => setFormData({ ...formData, assigned_to: value })} placeholder="Search NOC member..." />
            </div>
            
            {/* Issue Types - Multi-select checklist */}
            <IssueTypeSelect
              selectedTypes={formData.issue_types || []}
              otherText={formData.issue_other || ""}
              onTypesChange={(types) => setFormData({ ...formData, issue_types: types })}
              onOtherChange={(text) => setFormData({ ...formData, issue_other: text })}
              disabled={isAM}
              ticketType="sms"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Volume *</Label><Input value={formData.volume || ""} onChange={(e) => setFormData({ ...formData, volume: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required disabled={isAM} /></div>
              <div className="space-y-2"><Label>Enterprise Trunk *</Label><Input value={formData.customer_trunk || ""} onChange={(e) => setFormData({ ...formData, customer_trunk: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required disabled={isAM} /></div>
            </div>

            {/* Opened Via - Multi-select checklist */}
            <OpenedViaSelect
              selectedOptions={formData.opened_via || []}
              onChange={(options) => setFormData({ ...formData, opened_via: options })}
              disabled={isAM}
            />

            <div className="space-y-2"><Label>Destination</Label><Input value={formData.destination || ""} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" disabled={isAM} /></div>

            {/* SMS-Specific Fields */}
            <div className="border-t border-zinc-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">SMS Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>SID</Label><Input value={formData.sid || ""} onChange={(e) => setFormData({ ...formData, sid: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Message SID" disabled={isAM} /></div>
                <div className="space-y-2"><Label>Rate</Label><Input value={formData.rate || ""} onChange={(e) => setFormData({ ...formData, rate: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Rate per message" disabled={isAM} /></div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Content</Label>
                <Textarea value={formData.content || ""} onChange={(e) => setFormData({ ...formData, content: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Message content sample" rows={2} disabled={isAM} />
              </div>
            </div>

            {/* Vendor & Cost Details */}
            <div className="border-t border-zinc-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">Vendor & Cost</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Vendor Trunk</Label><Input value={formData.vendor_trunk || ""} onChange={(e) => setFormData({ ...formData, vendor_trunk: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" disabled={isAM} /></div>
                <div className="space-y-2"><Label>Cost</Label><Input value={formData.cost || ""} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="e.g., 0.005" disabled={isAM} /></div>
                <div className="space-y-2">
                  <Label>Is LCR</Label>
                  <Select value={formData.is_lcr || "no"} onValueChange={(value) => setFormData({ ...formData, is_lcr: value })} disabled={isAM}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Resolution Details */}
            <div className="border-t border-zinc-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">Resolution</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Root Cause</Label>
                  <Textarea value={formData.root_cause || ""} onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Identified root cause" rows={2} disabled={isAM} />
                </div>
                <div className="space-y-2">
                  <Label>Alternative Route/Solution</Label>
                  <Textarea value={formData.action_taken || ""} onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Alternative route or solution taken" rows={2} disabled={isAM} />
                </div>
                <div className="space-y-2">
                  <Label>Internal Notes</Label>
                  <Textarea value={formData.internal_notes || ""} onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Internal notes (not visible to client)" rows={2} disabled={isAM} />
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              {canModify && <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400">{editingTicket ? "Update Ticket" : "Create Ticket"}</Button>}
              {canModify && editingTicket && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setTicketToDelete(editingTicket);
                    setDeleteDialogOpen(true);
                  }}
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                  data-testid="delete-ticket-button"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">{isAM ? "Close" : "Cancel"}</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete ticket {ticketToDelete?.ticket_number}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-white hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 text-white hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        
      {/* Same-Day Identical Ticket Confirmation Dialog */}
      <AlertDialog open={sameDayDialogOpen} onOpenChange={setSameDayDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Same-Day Identical Ticket Found</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              A ticket with the same Enterprise, Trunk, Destination, and Issue was created today: {sameDayTickets.map(t => t.ticket_number).join(', ')}. Do you still want to create this ticket?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-white hover:bg-zinc-800" onClick={() => {
              setSameDayDialogOpen(false);
              setSameDayTickets([]);
              setPendingFormData(null);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSubmit} className="bg-emerald-500 text-black hover:bg-emerald-600">
              Create Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        
      {/* Actions/Ticket History Dialog */}
      <Dialog open={actionsDialogOpen} onOpenChange={setActionsDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ticket Actions - {selectedTicket?.ticket_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {ticketActions.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">No actions recorded yet</p>
            ) : (
              ticketActions.map((action) => (
                <div key={action.id} className="bg-zinc-800/50 rounded-lg p-3 border border-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-emerald-500 font-medium text-sm">{action.created_by_username}</span>
                    <span className="text-zinc-500 text-xs">
                      {new Date(action.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-zinc-300 text-sm whitespace-pre-wrap">{action.text}</p>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="mt-4">
            <div className="flex flex-col w-full gap-2">
              <Textarea
                value={newActionText}
                onChange={(e) => setNewActionText(e.target.value)}
                placeholder="Add a new action/update..."
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                rows={3}
              />
              <Button
                onClick={handleAddAction}
                disabled={!newActionText.trim()}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
              >
                Add Action
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
