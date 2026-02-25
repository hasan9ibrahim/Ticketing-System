import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import MultiFilter from "@/components/custom/MultiFilter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Edit,
  Search,
  Database,
  Phone,
  MessageSquare,
  GripVertical,
  Bell,
  X,
  ArrowUp,
  ArrowDown,
  Save,
} from "lucide-react";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

// Traffic types - different for SMS and Voice
const SMS_TRAFFIC_TYPES = [
  "OTP",
  "Promo",
  "Casino",
  "Clean Marketing",
  "Banking",
  "Other"
];

const VOICE_TRAFFIC_TYPES = [
  "CLI",
  "NCLI",
  "CC",
  "TDM",
  "Other"
];

// Get traffic types based on section (sms or voice)
const getTrafficTypes = (section) => section === "voice" ? VOICE_TRAFFIC_TYPES : SMS_TRAFFIC_TYPES;

export default function ReferencesPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const departmentType = user?.department_type || "all";
  const [mainTab, setMainTab] = useState("references"); // "references" or "alerts"
  const [activeSection, setActiveSection] = useState(() => {
    // Ensure activeSection is always a valid value ("sms" or "voice")
    const deptType = user?.department_type;
    return deptType === "voice" ? "voice" : "sms";
  });
  const [smsLists, setSmsLists] = useState([]);
  const [voiceLists, setVoiceLists] = useState([]);
  const [smsAlerts, setSmsAlerts] = useState([]);
  const [voiceAlerts, setVoiceAlerts] = useState([]);
  
  // Compute unresolved alert counts (exclude resolved alerts from badge count)
  const unresolvedSmsAlerts = smsAlerts.filter(a => !a.resolved);
  const unresolvedVoiceAlerts = voiceAlerts.filter(a => !a.resolved);
  const totalUnresolvedAlerts = unresolvedSmsAlerts.length + unresolvedVoiceAlerts.length;
  const [smsVendorTrunks, setSmsVendorTrunks] = useState([]);
  const [voiceVendorTrunks, setVoiceVendorTrunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");  // Separate search for vendor trunks in dialog
  const [filters, setFilters] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [alternativeVendor, setAlternativeVendor] = useState("");
  const [alertToDelete, setAlertToDelete] = useState(null);
  const [alertToResolve, setAlertToResolve] = useState(null);
  const [searchParams] = useSearchParams();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    destination: "",
    traffic_type: "",
    custom_traffic_type: "",
    vendor_entries: []
  });

  useEffect(() => {
    fetchData();
    handlePendingAlert();
  }, []);

  // Clear filters when switching between SMS and Voice sections
  useEffect(() => {
    setFilters([]);
    setSearchQuery("");
  }, [activeSection]);

  // Handle alert query parameter - open specific alert when navigating from notification
  useEffect(() => {
    const alertParam = searchParams.get("alert");
    // Also check localStorage for direct navigation
    const storedParam = localStorage.getItem('openTicketParam');
    const paramToUse = alertParam || (storedParam?.startsWith('alert=') ? storedParam.replace('alert=', '').split('&')[0] : null);
    
    if (paramToUse || alertParam) {
      // Switch to alerts tab
      setMainTab("alerts");
      
      // Find the alert in either smsAlerts or voiceAlerts
      const findAlert = (alerts) => alerts.find(a => 
        a.ticket_number === (paramToUse || alertParam) || 
        a.id === (paramToUse || alertParam) || 
        a.alert_id === (paramToUse || alertParam)
      );
      
      const tryFindAndOpenAlert = () => {
        const foundAlert = findAlert(smsAlerts) || findAlert(voiceAlerts);
        if (foundAlert) {
          setSelectedAlert(foundAlert);
          // Set the active section based on alert type
          setActiveSection(foundAlert.ticket_type || "sms");
          return true;
        }
        return false;
      };
      
      // Try immediately first
      if (!tryFindAndOpenAlert()) {
        // Alerts might not be loaded yet, try again after a short delay
        const timer = setTimeout(() => {
          tryFindAndOpenAlert();
        }, 1000);
        return () => clearTimeout(timer);
      }
      // Clear localStorage after use
      if (storedParam) {
        localStorage.removeItem('openTicketParam');
      }
    }
  }, [searchParams, smsAlerts, voiceAlerts]);

  const alertProcessedRef = useRef(false);

  // Handle pending alert from ticket page
  const handlePendingAlert = async () => {
    const pendingAlert = localStorage.getItem("pendingAlert");
    // Prevent duplicate processing - check both ref and localStorage
    if (alertProcessedRef.current || !pendingAlert) {
      return;
    }
    alertProcessedRef.current = true;
    try {
      const alertData = JSON.parse(pendingAlert);
      const token = localStorage.getItem("token");
      
      // Create the alert in the backend
      await axios.post(`${API}/alerts`, alertData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({
        title: "Success",
        description: "Alert sent to References page"
      });
      
      // Clear pending alert and switch to alerts tab
      localStorage.removeItem("pendingAlert");
      setMainTab("alerts");
      setActiveSection(alertData.ticket_type);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error("Failed to create alert:", error);
      // Reset the ref on error so it can be tried again
      alertProcessedRef.current = false;
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send alert"
      });
      localStorage.removeItem("pendingAlert");
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const deptType = user?.department_type || "all";
      
      // Fetch SMS data - only if user has access
      if (deptType === "all" || deptType === "sms") {
        try {
          const smsTrunksRes = await axios.get(`${API}/references/trunks/sms`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSmsVendorTrunks(smsTrunksRes.data.vendor_trunks || []);
          
          const smsListsRes = await axios.get(`${API}/references/sms`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSmsLists(smsListsRes.data || []);
        } catch (e) {
          console.log("SMS data fetch error:", e.message);
        }
      }
      
      // Fetch SMS Alerts - only if user has access to SMS
      if (deptType === "all" || deptType === "sms") {
        try {
          const smsAlertsRes = await axios.get(`${API}/alerts/sms`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSmsAlerts(smsAlertsRes.data || []);
        } catch (e) {
          console.log("SMS alerts fetch error (may be access denied):", e.message);
          setSmsAlerts([]);
        }
      }
      
      // Fetch Voice data - only if user has access
      if (deptType === "all" || deptType === "voice") {
        try {
          const voiceTrunksRes = await axios.get(`${API}/references/trunks/voice`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setVoiceVendorTrunks(voiceTrunksRes.data.vendor_trunks || []);
          
          const voiceListsRes = await axios.get(`${API}/references/voice`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setVoiceLists(voiceListsRes.data || []);
        } catch (e) {
          console.log("Voice data fetch error:", e.message);
        }
      }
      
      // Fetch Voice Alerts - only if user has access to Voice
      if (deptType === "all" || deptType === "voice") {
        try {
          const voiceAlertsRes = await axios.get(`${API}/alerts/voice`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setVoiceAlerts(voiceAlertsRes.data || []);
        } catch (e) {
          console.log("Voice alerts fetch error:", e.response?.data || e.message);
          setVoiceAlerts([]);
        }
      }
      
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load reference data"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (section, list = null) => {
    setActiveSection(section);
    if (list) {
      console.log("Editing list:", list);
      setEditingList(list);
      setFormData({
        name: list.name,
        destination: list.destination,
        traffic_type: list.traffic_type,
        custom_traffic_type: list.custom_traffic_type || "",
        vendor_entries: list.vendor_entries || []
      });
    } else {
      setEditingList(null);
      setFormData({
        name: "",
        destination: "",
        traffic_type: "",
        custom_traffic_type: "",
        vendor_entries: []
      });
      setVendorSearchQuery("");  // Reset vendor search when opening dialog
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");
      
      // For "Other", require custom_traffic_type
      const finalTrafficType = formData.traffic_type === "Other" 
        ? formData.custom_traffic_type 
        : formData.traffic_type;
      
      if (!formData.name || !formData.destination || !formData.traffic_type) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please fill in all required fields"
        });
        return;
      }
      
      if (formData.traffic_type === "Other" && !formData.custom_traffic_type) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please enter custom traffic type"
        });
        return;
      }

      // Validate destination format ("Country - Network")
      const destinationPattern = /^[^ -]+ - [^ -]+$/;
      if (!destinationPattern.test(formData.destination.trim())) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Destination must be in 'Country - Network' format (e.g., Ghana - MTN, Nigeria - All Networks)"
        });
        return;
      }

      // Validate vendor entries have numeric cost
      for (const entry of formData.vendor_entries) {
        if (entry.cost && isNaN(parseFloat(entry.cost))) {
          toast({
            variant: "destructive",
            title: "Error",
            description: `Cost for vendor ${entry.trunk} must be a numeric value`
          });
          return;
        }
      }

      if (editingList) {
        // Update existing list
        await axios.put(
          `${API}/references/${editingList.id}`,
          {
            name: formData.name,
            destination: formData.destination,
            traffic_type: finalTrafficType,
            custom_traffic_type: formData.custom_traffic_type,
            vendor_entries: formData.vendor_entries
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast({
          title: "Success",
          description: "Reference list updated successfully"
        });
      } else {
        // Create new list
        await axios.post(
          `${API}/references`,
          {
            name: formData.name,
            section: activeSection,
            destination: formData.destination,
            traffic_type: finalTrafficType,
            custom_traffic_type: formData.custom_traffic_type,
            vendor_entries: formData.vendor_entries
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast({
          title: "Success",
          description: "Reference list created successfully"
        });
      }

      setDialogOpen(false);
      setVendorSearchQuery("");  // Reset vendor search when closing dialog
      fetchData();
    } catch (error) {
      console.error("Failed to save:", error);
      console.error("Error response:", error.response);
      const errorMessage = error.response?.data?.detail || error.message || "Failed to save reference list";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    }
  };

  const handleDelete = async (list) => {
    // Support both passing full list object or just the id
    // Generate id from list properties if missing (fallback)
    const listId = list?.id || list?._id || `${list?.name}-${list?.destination}-${list?.section}`;
    if (!listId || listId.includes('undefined')) {
      console.error("List object:", list);
      console.error("List ID is undefined! Both id and _id are missing");
      toast({
        variant: "destructive",
        title: "Error",
        description: "Cannot delete: List ID is missing. Please refresh the page and try again."
      });
      return;
    }
    
    // Use custom dialog instead of browser confirm()
    setListToDelete(list);
    setDeleteDialogOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!listToDelete) return;
    
    const listId = listToDelete?.id || listToDelete?._id || `${listToDelete?.name}-${listToDelete?.destination}-${listToDelete?.section}`;
    
    try {
      const token = localStorage.getItem("token");
      console.log("Deleting list with id:", listId);
      await axios.delete(`${API}/references/${listId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast({
        title: "Success",
        description: "Reference list deleted successfully"
      });
      setDeleteDialogOpen(false);
      setListToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Failed to delete:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete reference list"
      });
    }
  };

  // Handle adding a comment to an alert
  const handleAddComment = async () => {
    if (!selectedAlert) return;
    
    const hasText = commentText.trim();
    const hasAltVendor = alternativeVendor.trim();
    
    if (!hasText && !hasAltVendor) return;
    
    try {
      const token = localStorage.getItem("token");
      console.log("Submitting comment with:", { text: commentText, alternative_vendor: alternativeVendor });
      
      const response = await axios.post(
        `${API}/alerts/${selectedAlert.id}/comments`,
        { text: commentText, alternative_vendor: alternativeVendor },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log("Comment response:", response.data);
      
      toast({
        title: "Success",
        description: "Comment added successfully"
      });
      
      // Create the new comment object directly from the request
      const newComment = {
        id: Date.now().toString(),
        text: commentText,
        alternative_vendor: alternativeVendor,
        created_by: "current_user",
        created_at: new Date().toISOString()
      };
      
      // Update selectedAlert immediately with the new comment
      const updatedComments = [...(selectedAlert.comments || []), newComment];
      console.log("Updated comments:", updatedComments);
      setSelectedAlert({
        ...selectedAlert,
        comments: updatedComments
      });
      
      setCommentText("");
      setAlternativeVendor("");
      
      // Also refresh all alerts in background
      fetchData();
      
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.detail || "Failed to add comment"
      });
    }
  };

  // Handle deleting an alert
  const handleDeleteAlert = async () => {
    if (!alertToDelete) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/alerts/${alertToDelete}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({
        title: "Success",
        description: "Alert deleted successfully"
      });
      
      setSelectedAlert(null);
      setAlertToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Failed to delete alert:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete alert"
      });
    }
  };

  // Handle resolving an alert
  const handleResolveAlert = async () => {
    if (!alertToResolve) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/alerts/${alertToResolve}/resolve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({
        title: "Success",
        description: "Alert resolved successfully"
      });
      
      setAlertToResolve(null);
      fetchData();
      
      // Refresh selected alert to get updated resolved status
      if (selectedAlert && selectedAlert.id === alertToResolve) {
        setSelectedAlert({...selectedAlert, resolved: true});
      }
    } catch (error) {
      console.error("Failed to resolve alert:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.detail || "Failed to resolve alert"
      });
    }
  };

  const handleVendorToggle = (trunk) => {
    const exists = formData.vendor_entries.find(v => v.trunk === trunk);
    if (exists) {
      setFormData({
        ...formData,
        vendor_entries: formData.vendor_entries.filter(v => v.trunk !== trunk)
      });
    } else {
      setFormData({
        ...formData,
        vendor_entries: [...formData.vendor_entries, { trunk, cost: "", notes: "" }]
      });
    }
  };

  const handleVendorFieldChange = (trunk, field, value) => {
    setFormData({
      ...formData,
      vendor_entries: formData.vendor_entries.map(v => 
        v.trunk === trunk ? { ...v, [field]: value } : v
      )
    });
  };

  // Move vendor up in the list
  const moveVendorUp = (index) => {
    if (index === 0) return;
    const newEntries = [...formData.vendor_entries];
    [newEntries[index - 1], newEntries[index]] = [newEntries[index], newEntries[index - 1]];
    setFormData({ ...formData, vendor_entries: newEntries });
  };

  // Move vendor down in the list
  const moveVendorDown = (index) => {
    if (index === formData.vendor_entries.length - 1) return;
    const newEntries = [...formData.vendor_entries];
    [newEntries[index], newEntries[index + 1]] = [newEntries[index + 1], newEntries[index]];
    setFormData({ ...formData, vendor_entries: newEntries });
  };

  const filteredVendorTrunks = (activeSection === "sms" ? smsVendorTrunks : voiceVendorTrunks)
    .filter(trunk => trunk.toLowerCase().includes(vendorSearchQuery.toLowerCase()));

  const filterLists = (lists) => {
    let filtered = lists;
    
    // Apply search query
    if (searchQuery) {
      filtered = filtered.filter(list =>
        list.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        list.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
        list.traffic_type.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply MultiFilter filters
    filters.forEach((filter) => {
      if (filter.field === "list_name" && filter.values.length > 0) {
        const searchValue = filter.values[0].toLowerCase();
        filtered = filtered.filter(list => 
          list.name?.toLowerCase().includes(searchValue)
        );
      }
      if (filter.field === "traffic_type" && filter.values.length > 0) {
        filtered = filtered.filter(list => 
          filter.values.includes(list.traffic_type)
        );
      }
      if (filter.field === "destination" && filter.values.length > 0) {
        const searchValue = filter.values[0].toLowerCase();
        filtered = filtered.filter(list => 
          list.destination?.toLowerCase().includes(searchValue)
        );
      }
      if (filter.field === "vendor_trunk_ref" && filter.values.length > 0) {
        filtered = filtered.filter(list => 
          list.vendor_entries?.some(v => filter.values.includes(v.trunk))
        );
      }
    });
    
    return filtered;
  };

  const renderAlertsTab = (section) => {
    const alerts = section === "sms" ? smsAlerts : voiceAlerts;
    
    if (alerts.length === 0) {
      return (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400">No alerts yet</p>
            <p className="text-zinc-500 text-sm mt-2">Send alerts from ticket pages to see them here</p>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <div className="grid gap-4">
        {alerts.map((alert) => (
          <Card 
            key={alert.id} 
            className={`bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-600 ${selectedAlert?.id === alert.id ? 'border-emerald-500' : ''} ${alert.resolved ? 'opacity-60' : ''}`}
            onClick={() => setSelectedAlert(alert)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg text-white">
                    {alert.ticket_number}
                    {alert.resolved && <Badge variant="outline" className="ml-2 bg-emerald-500/20 text-emerald-400 border-emerald-500">Resolved</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    <Badge variant="outline" className="mr-2 bg-zinc-800 text-zinc-300 border-zinc-600">
                      {alert.customer}
                    </Badge>
                    <Badge variant="secondary" className="bg-zinc-700 text-zinc-300">
                      {alert.destination || "No destination"}
                    </Badge>
                  </CardDescription>
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        
        {/* Alert Details Sidebar */}
        {selectedAlert && (
          <div className="fixed inset-y-0 right-0 w-96 bg-zinc-900 border-l border-zinc-800 p-4 overflow-y-auto shadow-lg z-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Alert Details</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedAlert(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {/* Ticket Info */}
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Ticket Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ticket:</span>
                    <span className="text-white">{selectedAlert.ticket_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Customer:</span>
                    <span className="text-white">{selectedAlert.customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Destination:</span>
                    <span className="text-white">{selectedAlert.destination || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Issue Types:</span>
                    <span className="text-white">{selectedAlert.issue_types?.join(", ") || "-"}</span>
                  </div>
                </div>
              </div>
              
              {/* Vendor Info */}
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Vendor Information</h4>
                <div className="space-y-2 text-sm">
                  {/* Get vendor info from vendor_trunks array */}
                  {(selectedAlert.vendor_trunks && selectedAlert.vendor_trunks.length > 0) ? (
                    selectedAlert.vendor_trunks.map((vendor, idx) => (
                      <div key={idx} className="border-b border-zinc-700 pb-2 last:border-0">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Vendor Trunk:</span>
                          <span className="text-white">{vendor.trunk || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Cost:</span>
                          <span className="text-white">{vendor.cost || "-"}</span>
                        </div>
                        {/* Show position instead of percentage when position is available */}
                        {vendor.position ? (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Position:</span>
                            <span className="text-white">{vendor.position}</span>
                          </div>
                        ) : vendor.percentage ? (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Percentage:</span>
                            <span className="text-white">{vendor.percentage}%</span>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    /* Fallback to single vendor_trunk and cost fields */
                    <>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Vendor Trunk:</span>
                        <span className="text-white">{selectedAlert.vendor_trunk || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Cost:</span>
                        <span className="text-white">{selectedAlert.cost || "-"}</span>
                      </div>
                    </>
                  )}
                  {/* Always show Rate */}
                  <div className="flex justify-between pt-2">
                    <span className="text-zinc-500">Rate:</span>
                    <span className="text-white">{selectedAlert.rate || "-"}</span>
                  </div>
                </div>
              </div>
              
              {/* SMS Details for SMS alerts */}
              {selectedAlert.ticket_type === "sms" && selectedAlert.sms_details?.length > 0 && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">SMS Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAlert.sms_details.map((sms, idx) => (
                      <div key={idx} className="border-b border-zinc-700 pb-2 last:border-0">
                        <div className="text-zinc-500">SID: <span className="text-white">{sms.sid || "-"}</span></div>
                        <div className="text-zinc-500">Content: <span className="text-white">{sms.content || "-"}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Comments */}
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Comments ({selectedAlert.comments?.length || 0})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedAlert.comments?.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No comments yet</p>
                  ) : (
                    selectedAlert.comments?.map((comment, idx) => (
                      <div key={idx} className="border-b border-zinc-700 pb-2 last:border-0">
                        <div className="flex justify-between items-start">
                          <span className="text-emerald-500 text-sm">{comment.created_by}</span>
                          <span className="text-zinc-500 text-xs">
                            {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {/* Show either comment text OR alternative vendor, not both */}
                        {comment.text && comment.text.trim() ? (
                          <p className="text-white text-sm mt-1">{comment.text}</p>
                        ) : comment.alternative_vendor ? (
                          <div className="mt-1 text-emerald-500 text-sm">
                            Alternative Vendor: {comment.alternative_vendor}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* Add Comment Form - Only show if alert is not resolved */}
              {!selectedAlert.resolved && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">Add Comment</h4>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 mb-2"
                    rows={3}
                  />
                  {/* Alternative vendor trunk - Only for NOC and Admin, not for AMs */}
                  {user?.role !== "am" && (
                    <Input
                      value={alternativeVendor}
                      onChange={(e) => setAlternativeVendor(e.target.value)}
                      placeholder="Alternative vendor trunk (optional)"
                      className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 mb-2"
                    />
                  )}
                  <Button 
                    onClick={handleAddComment} 
                    disabled={!commentText.trim() && !alternativeVendor}
                    className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                  >
                    Add Comment
                  </Button>
                </div>
              )}
              
              {/* Show resolved message if alert is resolved */}
              {selectedAlert.resolved && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-400 text-sm">This alert has been resolved and archived.</p>
                </div>
              )}
              
              {/* Action Buttons - Only show for NOC and Admin, not for AMs */}
              {user?.role !== "am" && (
                <>
                  {!selectedAlert.resolved ? (
                    <>
                      <Button
                        onClick={() => setAlertToResolve(selectedAlert.id)}
                        className="w-full bg-emerald-500 text-black hover:bg-emerald-400 mb-2"
                      >
                        Resolve Alert
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setAlertToDelete(selectedAlert.id)}
                        className="w-full"
                      >
                        Delete Alert
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setAlertToDelete(selectedAlert.id)}
                      className="w-full"
                    >
                      Delete Alert
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const renderReferenceTable = (list) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-zinc-800 border-zinc-700">
          <TableHead className="w-16 text-zinc-300">Order</TableHead>
          <TableHead className="text-zinc-300">Vendor Trunk</TableHead>
          <TableHead className="text-zinc-300">Cost</TableHead>
          <TableHead className="text-zinc-300">Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(list.vendor_entries || []).map((vendor, idx) => (
          <TableRow key={idx} className="border-zinc-700">
            <TableCell className="w-16">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-700 text-xs font-medium text-white">
                {idx + 1}
              </span>
            </TableCell>
            <TableCell className="font-medium text-white">{vendor.trunk}</TableCell>
            <TableCell className="text-zinc-300">{vendor.cost || "-"}</TableCell>
            <TableCell className="text-zinc-300">{vendor.notes || "-"}</TableCell>
          </TableRow>
        ))}
        {(list.vendor_entries || []).length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-zinc-500 py-4">
              No vendors added yet
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="container mx-auto py-6 bg-zinc-950 min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-zinc-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 bg-zinc-950 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">References & Alerts</h1>
            <p className="text-zinc-400">Manage backup vendor references by destination and traffic type</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-4 items-start">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search lists by name, destination, or traffic type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="w-[300px]">
          <MultiFilter
            filters={filters}
            onFilterChange={setFilters}
            fields={["list_name", "traffic_type", "destination", "vendor_trunk_ref"]}
            customOptions={{
              traffic_types: activeSection === "voice" ? VOICE_TRAFFIC_TYPES : SMS_TRAFFIC_TYPES,
              vendor_trunks: activeSection === "voice" ? voiceVendorTrunks : smsVendorTrunks
            }}
          />
        </div>
      </div>

      {/* Main Tabs: References vs Alerts */}
      <Tabs defaultValue={mainTab} onValueChange={setMainTab} className="bg-zinc-900">
        <TabsList className="mb-4 bg-zinc-800">
          <TabsTrigger value="references" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
            <Database className="h-4 w-4" />
            References
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
            <Bell className="h-4 w-4" />
            Alerts
            {(totalUnresolvedAlerts) > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {totalUnresolvedAlerts}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* References Tab */}
        {mainTab === "references" && (
          <>
          <Tabs defaultValue={activeSection} onValueChange={setActiveSection} className="bg-zinc-900">
            <TabsList className="mb-4 bg-zinc-800">
          {(departmentType === "all" || departmentType === "sms") && (
            <TabsTrigger value="sms" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
              <MessageSquare className="h-4 w-4" />
              SMS
            </TabsTrigger>
          )}
          {(departmentType === "all" || departmentType === "voice") && (
            <TabsTrigger value="voice" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
              <Phone className="h-4 w-4" />
              Voice
            </TabsTrigger>
          )}
        </TabsList>

        {(departmentType === "all" || departmentType === "sms") && (
          <TabsContent value="sms" className="bg-zinc-900 p-4 rounded-md">
            <div className="flex justify-end mb-4">
              <Button onClick={() => handleOpenDialog("sms")} className="gap-2">
                <Plus className="h-4 w-4" />
                Add SMS Reference List
              </Button>
            </div>
            
            {filterLists(smsLists).length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-zinc-600 mb-4" />
                  <p className="text-zinc-400">No SMS reference lists yet</p>
                  <Button 
                    variant="outline" 
                    className="mt-4 text-white border-zinc-600 hover:bg-zinc-800"
                    onClick={() => handleOpenDialog("sms")}
                  >
                    Create your first SMS reference list
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filterLists(smsLists).map((list) => (
                  <Card key={list.id || list._id} className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{list.name}</CardTitle>
                          <CardDescription className="mt-1">
                            <Badge variant="outline" className="mr-2 bg-zinc-800 text-zinc-300 border-zinc-600">{list.destination}</Badge>
                            <Badge variant="secondary" className="bg-zinc-700 text-zinc-300">{list.traffic_type}</Badge>
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog("sms", list)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(list)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {renderReferenceTable(list)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {(departmentType === "all" || departmentType === "voice") && (
          <TabsContent value="voice" className="bg-zinc-900 p-4 rounded-md">
            <div className="flex justify-end mb-4">
              <Button onClick={() => handleOpenDialog("voice")} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Voice Reference List
              </Button>
            </div>
            
            {filterLists(voiceLists).length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Phone className="h-12 w-12 text-zinc-600 mb-4" />
                  <p className="text-zinc-400">No Voice reference lists yet</p>
                  <Button 
                    variant="outline" 
                    className="mt-4 text-white border-zinc-600 hover:bg-zinc-800"
                    onClick={() => handleOpenDialog("voice")}
                  >
                    Create your first Voice reference list
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filterLists(voiceLists).map((list) => (
                  <Card key={list.id} className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg text-white">{list.name}</CardTitle>
                          <CardDescription className="mt-1">
                            <Badge variant="outline" className="mr-2 bg-zinc-800 text-zinc-300 border-zinc-600">{list.destination}</Badge>
                            <Badge variant="secondary" className="bg-zinc-700 text-zinc-300">{list.traffic_type}</Badge>
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog("voice", list)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(list)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {renderReferenceTable(list)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
      </>
      )}

      {/* Alerts Tab Content */}
      {mainTab === "alerts" && (
        <>
        <Tabs defaultValue={activeSection} onValueChange={setActiveSection} className="bg-zinc-900">
          <TabsList className="mb-4 bg-zinc-800">
            {(departmentType === "all" || departmentType === "sms") && (
              <TabsTrigger value="sms" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                <MessageSquare className="h-4 w-4" />
                SMS Alerts
                {unresolvedSmsAlerts.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unresolvedSmsAlerts.length}</Badge>
                )}
              </TabsTrigger>
            )}
            {(departmentType === "all" || departmentType === "voice") && (
              <TabsTrigger value="voice" className="gap-2 text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                <Phone className="h-4 w-4" />
                Voice Alerts
                {unresolvedVoiceAlerts.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unresolvedVoiceAlerts.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>
          
          {(departmentType === "all" || departmentType === "sms") && (
            <TabsContent value="sms" className="bg-zinc-900 p-4 rounded-md">
              {renderAlertsTab("sms")}
            </TabsContent>
          )}
          
          {(departmentType === "all" || departmentType === "voice") && (
            <TabsContent value="voice" className="bg-zinc-900 p-4 rounded-md">
              {renderAlertsTab("voice")}
            </TabsContent>
          )}
        </Tabs>
      </>)}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingList ? "Edit Reference List" : "Create Reference List"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeSection === "sms" ? "SMS" : "Voice"} reference list for backup vendors
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Basic Info */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white">List Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Backup Vendors USA OTP"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="traffic_type" className="text-white">Traffic Type *</Label>
                <Select
                  value={formData.traffic_type}
                  onValueChange={(value) => setFormData({ ...formData, traffic_type: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select traffic type" className="text-zinc-400" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {getTrafficTypes(activeSection).map((type) => (
                      <SelectItem key={type} value={type} className="text-white focus:bg-zinc-700 focus:text-white">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.traffic_type === "Other" && (
                  <Input
                    value={formData.custom_traffic_type || ""}
                    onChange={(e) => setFormData({ ...formData, custom_traffic_type: e.target.value })}
                    placeholder="Enter custom traffic type"
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mt-2"
                  />
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="destination" className="text-white">Destination *</Label>
              <Input
                id="destination"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                placeholder="Country - Network (e.g., USA - Verizon, UK - Vodafone)"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            {/* Vendor Selection */}
            <div className="space-y-2">
              <Label className="text-white">Select Vendor Trunks *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search vendor trunks..."
                  value={vendorSearchQuery}
                  onChange={(e) => setVendorSearchQuery(e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              
              <div className="border border-zinc-700 rounded-md max-h-48 overflow-y-auto mt-2 bg-zinc-900">
                {filteredVendorTrunks.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">
                    No vendor trunks available
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {filteredVendorTrunks.map((trunk) => {
                      const isSelected = formData.vendor_entries.some(v => v.trunk === trunk);
                      return (
                        <div
                          key={trunk}
                          className="flex items-center space-x-2 p-3 hover:bg-zinc-800 cursor-pointer"
                          onClick={() => handleVendorToggle(trunk)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {}}
                            className="border-zinc-600"
                          />
                          <span className="text-sm text-white">{trunk}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {formData.vendor_entries.length > 0 && (
                <p className="text-xs text-zinc-400">
                  {formData.vendor_entries.length} vendor(s) selected
                </p>
              )}
            </div>

            {/* Selected Vendors with Cost and Custom Field */}
            {formData.vendor_entries.length > 0 && (
              <div className="space-y-2">
                <Label className="text-white">Vendor Details</Label>
                <div className="border border-zinc-700 rounded-md divide-y divide-zinc-800 bg-zinc-900">
                  {formData.vendor_entries.map((vendor, idx) => (
                    <div key={idx} className="p-3 bg-zinc-800/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{vendor.trunk}</span>
                          {formData.vendor_entries.length > 1 && (
                            <span className="text-xs text-zinc-500">#{idx + 1}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveVendorUp(idx)}
                            disabled={idx === 0}
                            className="text-zinc-400 hover:text-white h-6 px-2 disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveVendorDown(idx)}
                            disabled={idx === formData.vendor_entries.length - 1}
                            className="text-zinc-400 hover:text-white h-6 px-2 disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVendorToggle(vendor.trunk)}
                            className="text-red-400 hover:text-red-300 h-6 px-2"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-zinc-400">Cost</Label>
                          <Input
                            value={vendor.cost || ""}
                            onChange={(e) => handleVendorFieldChange(vendor.trunk, "cost", e.target.value)}
                            placeholder="e.g., 0.005"
                            className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-zinc-400">Note</Label>
                          <Input
                            value={vendor.notes || ""}
                            onChange={(e) => handleVendorFieldChange(vendor.trunk, "notes", e.target.value)}
                            placeholder="Notes..."
                            className="bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-500 h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setVendorSearchQuery(""); }} className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {editingList ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reference List</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{listToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Resolve Alert Confirmation Dialog */}
      <AlertDialog open={!!alertToResolve} onOpenChange={() => setAlertToResolve(null)}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Alert</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to resolve this alert? It will be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolveAlert} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Resolve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete Alert Confirmation Dialog */}
      <AlertDialog open={!!alertToDelete} onOpenChange={() => setAlertToDelete(null)}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete this alert? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlert} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </Tabs>
    </div>
  );
}
