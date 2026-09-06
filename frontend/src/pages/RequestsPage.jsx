import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import SearchableSelect from "@/components/custom/SearchableSelect";
import IssueTypeSelect, { SMS_ISSUE_TYPES, VOICE_ISSUE_TYPES } from "@/components/custom/IssueTypeSelect";
import { Plus, Search, Filter, Clock, CheckCircle, XCircle, AlertCircle, Edit, Trash2, Copy, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import MultiSelect from "@/components/custom/MultiSelect";
import MultiFilter from "@/components/custom/MultiFilter";
import CompactImageViewer from "@/components/custom/CompactImageViewer";
import axios from "axios";
import { useDebounce } from "@/hooks/useDebounce";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

// Request type definitions
const REQUEST_TYPES = {
  rating_routing: {
    label: "Rating and/or Routing",
    description: "Request to update client rating or routing",
    fields: ["rating", "vendor_trunks"]
  },
  testing: {
    label: "Testing Vendor Trunk",
    description: "Test vendor trunk(s) towards a destination",
    fields: ["vendor_trunks", "destination"]
  },
  translation: {
    label: "Translation Request",
    description: "Change SID or content on a trunk",
    fields: ["translation_type", "trunk_type", "trunk_name", "old_value", "new_value", "translation_destination"],
    forDepartment: "sms" // Only for SMS
  },
  lcr: {
    label: "LCR Request",
    description: "Add or drop LCR for vendor trunk",
    fields: ["vendor_trunks", "destination", "lcr_type", "lcr_change"],
    forDepartment: "voice" // Only for Voice
  },
  investigation: {
    label: "Investigation Request",
    description: "Investigate an issue for a customer trunk",
    fields: ["issue_types", "customer_trunk", "investigation_destination", "issue_description"]
  },
  trunk_request_sms: {
    label: "New Trunk Request",
    description: "Request new trunk for SMS",
    fields: ["priority", "customer_ids", "trunk_type", "direction", "with_lcr"],
    forDepartment: "sms"
  },
  trunk_request_voice: {
    label: "New Trunk Request",
    description: "Request new trunk for Voice",
    fields: ["priority", "customer_ids", "trunk_type", "direction", "with_lcr"],
    forDepartment: "voice"
  },
  open_tt: {
    label: "Open TT",
    description: "Open a TT (Trouble Ticket)",
    fields: ["priority", "ticket_id", "destination", "vendor_trunks", "open_by", "notes"]
  }
};

const PRIORITIES = [
  { value: "Low", color: "bg-gray-400 dark:bg-zinc-500", text: "text-gray-900 dark:text-zinc-100", description: "To be done in 30 mins" },
  { value: "Medium", color: "bg-blue-500", text: "text-gray-900 dark:text-white", description: "To be done in 20 mins" },
  { value: "High", color: "bg-orange-500", text: "text-gray-900 dark:text-white", description: "To be done in 10 mins" },
  { value: "Urgent", color: "bg-red-600", text: "text-gray-900 dark:text-white", description: "To be done in 5 mins (Only in case of Live Traffic)" }
];

// Trunk Types for SMS and Voice
const SMS_TRUNK_TYPES = [
  { value: "Direct", label: "Direct" },
  { value: "HQ", label: "HQ" },
  { value: "SIM", label: "SIM" },
  { value: "WHS", label: "WHS" },
  { value: "Local", label: "Local" },
  { value: "Promo", label: "Promo" },
  { value: "CS", label: "CS" }
];

const VOICE_TRUNK_TYPES = [
  { value: "PRM", label: "PRM" },
  { value: "STD", label: "STD" },
  { value: "CC", label: "CC" },
  { value: "TDM", label: "TDM" },
  { value: "ORTP", label: "ORTP" },
  { value: "ATX", label: "ATX" }
];

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-500", label: "Pending" },
  in_progress: { icon: AlertCircle, color: "text-blue-500", label: "In Progress" },
  completed: { icon: CheckCircle, color: "text-green-500", label: "Completed" },
  rejected: { icon: XCircle, color: "text-red-500", label: "Rejected" }
};

export default function RequestsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("sms");
  const [requestSubTab, setRequestSubTab] = useState("active"); // "active" or "archive" for sub-tabs
  const [requests, setRequests] = useState([]);
  
  // Get user info early to use in computations
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userRole = user?.role || "";
  const userDepartment = user?.department?.name?.toLowerCase() || "";
  
  // Compute pending request counts by priority for badge display (only for NOC/Admin)
  const getPendingByPriority = useCallback((ticketType) => {
    if (userRole !== "noc" && userRole !== "admin") return {};
    const pending = requests.filter(r => r.ticket_type === ticketType && r.status === "pending" && !r.claimed_by);
    return {
      Urgent: pending.filter(r => r.priority === "Urgent").length,
      High: pending.filter(r => r.priority === "High").length,
      Medium: pending.filter(r => r.priority === "Medium").length,
      Low: pending.filter(r => r.priority === "Low").length,
      total: pending.length
    };
  }, [userRole, requests]);

  const smsPending = useMemo(() => getPendingByPriority("sms"), [getPendingByPriority]);
  const voicePending = useMemo(() => getPendingByPriority("voice"), [getPendingByPriority]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showMyRequestsOnly, setShowMyRequestsOnly] = useState(false); // Toggle for AM to show only their own requests
  const [isLoading, setIsLoading] = useState(false);
  const [multiFilters, setMultiFilters] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState(null);
  const [viewRequestDialogOpen, setViewRequestDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [responseType, setResponseType] = useState(null); // "complete" or "reject"
  const [responseComment, setResponseComment] = useState("");
  const [responseImages, setResponseImages] = useState([]); // Array of images for testing completion
  const [responseImagePreviews, setResponseImagePreviews] = useState([]); // Array of preview URLs
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [requestToClaim, setRequestToClaim] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Refs for auto-refresh to avoid stale closures
  const activeTabRef = useRef(activeTab);
  const requestSubTabRef = useRef(requestSubTab);
  const userRoleRef = useRef(userRole);
  const userDepartmentRef = useRef(userDepartment);
  const statusFilterRef = useRef(statusFilter);
  const showMyRequestsOnlyRef = useRef(showMyRequestsOnly);

  // Update refs when values change
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    requestSubTabRef.current = requestSubTab;
  }, [requestSubTab]);

  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  useEffect(() => {
    userDepartmentRef.current = userDepartment;
  }, [userDepartment]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    showMyRequestsOnlyRef.current = showMyRequestsOnly;
  }, [showMyRequestsOnly]);
  const [editingRequest, setEditingRequest] = useState(null);
  
  // For customer and vendor trunk selection
  const [enterprises, setEnterprises] = useState([]);
  const [vendorTrunkOptions, setVendorTrunkOptions] = useState([]);
  const [customerTrunkOptions, setCustomerTrunkOptions] = useState([]);
  const [customerTrunkSearch, setCustomerTrunkSearch] = useState("");
  const [vendorTrunkSearch, setVendorTrunkSearch] = useState("");

  // Initial form data function
  const getInitialFormData = () => ({
    request_type: "",
    request_type_label: "",
    priority: "Medium",
    ticket_type: "sms", // Default ticket type
    customer: "",
    customer_id: "",
    customer_ids: [],
    enterprise_id: "",
    rating: "",
    routing: "",
    customer_trunk: "",
    // New compact structure for rating_routing: array of customer trunk configs
    // Each config has: trunk, destination, rate, and routing (vendor trunk + advanced settings)
    customer_trunk_configs: [],
    // Common routing option
    use_common_routing: false,
    common_route_rules: [],
    // Legacy structure kept for compatibility
    customer_trunks: {
      "": [{ destination: "", rate: "" }]
    },
    destination: "",
    ticket_id: "",  // Optional ticket reference
    by_loss: false,
    enable_mnp_hlr: false,
    mnp_hlr_type: "",
    // Threshold replaced with notes
    notes: "",
    via_vendor: "",
    enable_whitelisting: false,
    rating_vendor_trunks: {
      "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }]
    },
    vendor_trunks: [{ trunk: "", sid_content_pairs: [{sid: "", content: ""}] }],
    test_type: "",
    test_description: "",
    translation_type: "",
    trunk_type: "",
    trunk_name: "",
    old_value: "",
    new_value: "",
    old_sid: "",
    new_sid: "",
    word_to_remove: "",
    translation_destination: "",
    lcr_type: "",
    lcr_change: "",
    issue_types: [],
    issue_other: "",
    investigation_destination: "",
    issue_description: "",
    with_lcr: true,
    direction: null,
    open_by: "",
    open_tt_notes: ""
  });

  const [formData, setFormData] = useState(getInitialFormData());
  // Separate state for Direction and With LCR to ensure updates work correctly
  const [trunkDirection, setTrunkDirection] = useState("");
  const [trunkWithLcr, setTrunkWithLcr] = useState(true);
  
  // Initialize trunk states from formData when it changes (for editing)
  useEffect(() => {
    if (formData.request_type === "trunk_request_sms" || formData.request_type === "trunk_request_voice") {
      if (formData.direction) {
        setTrunkDirection(formData.direction);
      }
      if (formData.with_lcr !== undefined && formData.with_lcr !== null) {
        setTrunkWithLcr(formData.with_lcr);
      }
    }
  }, [formData.direction, formData.with_lcr, formData.request_type]);
  
  // Track URL for notification navigation using ref
  const prevUrlRef = React.useRef(window.location.href);
  const [urlKey, setUrlKey] = useState(0);
  
  // Track if initial load is complete
  const initialLoadComplete = useRef(false);
  
  useEffect(() => {
    // Don't clear requests here - let the new data replace old data directly
    // This prevents showing empty state briefly while fetching
    
    // Only show loading on first load, not on tab/filter changes
    const showLoading = !initialLoadComplete.current;
    if (!initialLoadComplete.current) {
      initialLoadComplete.current = true;
    }
    fetchRequests(null, showLoading);
  }, [activeTab, statusFilter, requestSubTab]);

  // Handle URL parameters for pre-filling form (e.g., from ticket pages)
  // Use useEffect to check URL params and open dialog
  const processedTicketRef = useRef(null);
  
  useEffect(() => {
    // Get ticket_id and ticket_type from search params
    const ticketId = searchParams.get('ticket_id');
    const ticketType = searchParams.get('ticket_type');
    const timestampParam = searchParams.get('t');
    // Include timestamp in key to allow reopening same request after closing dialog
    const paramKey = `${ticketId}-${timestampParam}`;
    
    console.log('RequestsPage: Checking URL params:', { ticketId, ticketType, search: location.search });
    
    // Only process if we haven't processed this exact param combination yet
    if (ticketId && processedTicketRef.current !== paramKey) {
      console.log('RequestsPage: Processing ticket_id:', ticketId);
      processedTicketRef.current = paramKey;
      
      // If ticket_type is provided and valid, set the active tab
      if (ticketType && (ticketType === 'sms' || ticketType === 'voice')) {
        setActiveTab(ticketType);
      }
      
      // Reset form and set ticket_id
      const initialData = getInitialFormData();
      setFormData({
        ...initialData,
        ticket_id: ticketId,
        // Set ticket_type based on URL param
        ...(ticketType && { ticket_type: ticketType })
      });
      
      // Open the dialog immediately after setting form data
      console.log('RequestsPage: Opening dialog with ticket_id:', ticketId);
      setDialogOpen(true);
    }
  }, [searchParams]); // Run when searchParams changes

  useEffect(() => {
    const checkUrlChange = () => {
      if (window.location.href !== prevUrlRef.current) {
        prevUrlRef.current = window.location.href;
        setUrlKey(k => k + 1);
      }
    };
    
    // Check URL periodically
    const interval = setInterval(checkUrlChange, 250);
    return () => clearInterval(interval);
  }, []);
  
  // Ref to track the last processed URL params to prevent reopening on state changes
  const lastProcessedParamsRef = useRef(null);

  // Handle request query parameter for notification navigation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("request");
    const timestampParam = params.get("t");
    // Include timestamp in key to allow reopening same request after closing dialog
    const paramKey = `request-${requestId}-${timestampParam}`;
    
    // If no request param, nothing to do
    if (!requestId) {
      lastProcessedParamsRef.current = null;
      return;
    }
    
    // Skip if we've already processed this exact URL combination
    // This prevents reopening when dialog state changes (close/open)
    if (lastProcessedParamsRef.current === paramKey) {
      return;
    }
    
    // Mark as processed
    lastProcessedParamsRef.current = paramKey;
    
    if (requestId) {
      // First try to find the request in the already loaded list
      const foundRequest = requests.find(r => r.id === requestId || r._id === requestId);
      
      if (foundRequest) {
        setSelectedRequest(foundRequest);
        setViewRequestDialogOpen(true);
      } else {
        // If not found in the list, fetch it directly from the API
        const fetchRequestById = async () => {
          try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API}/requests/${requestId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data) {
              setSelectedRequest(response.data);
              setViewRequestDialogOpen(true);
            }
          } catch (error) {
            console.error("Failed to fetch request:", error);
          }
        };
        fetchRequestById();
      }
    }
  }, [requests, urlKey]);
  

  // Fetch enterprises and vendor trunks on initial load and when tab changes
  useEffect(() => {
    fetchEnterprisesAndTrunks();
  }, [activeTab, userRole, userDepartment]);

  const fetchEnterprisesAndTrunks = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      // Determine department type based on user role and department
      const isSmsDept = userDepartment?.startsWith("sms") || userDepartment === "sms";
      const isVoiceDept = userDepartment?.startsWith("voice") || userDepartment === "voice";
      const deptType = isSmsDept ? "sms" : isVoiceDept ? "voice" : activeTab;
      
      // Fetch all data in parallel for faster loading
      const [entResponse, vendorTrunkResponse, customerTrunkResponse] = await Promise.all([
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/references/trunks/${deptType}`, { headers }),
        axios.get(`${API}/trunks/${deptType}`, { headers })
      ]);
      
      const entData = entResponse.data || [];
      const filteredEnterprises = entData.filter(e => 
        e.enterprise_type === deptType || e.enterprise_type === "all"
      );
      setEnterprises(filteredEnterprises);
      
      setVendorTrunkOptions(vendorTrunkResponse.data.vendor_trunks || []);
      setCustomerTrunkOptions(customerTrunkResponse.data.customer_trunks || []);
    } catch (error) {
      console.error("Failed to fetch enterprises/trunks:", error);
    }
  };

  // Fetch requests function - uses refs for auto-refresh, state for immediate tab switches
  const fetchRequests = async (showMineOnly = null, showLoading = true, useRefs = false) => {
    // Don't show loading indicator during auto-refresh (background updates)
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      // Use refs for auto-refresh (to avoid stale closures), state for tab switches
      let currentUserRole, currentActiveTab, currentStatusFilter, currentRequestSubTab, currentUserDepartment;
      
      if (useRefs) {
        // Auto-refresh: use refs for latest values
        currentUserRole = userRoleRef.current;
        currentActiveTab = activeTabRef.current;
        currentStatusFilter = statusFilterRef.current;
        currentRequestSubTab = requestSubTabRef.current;
        currentUserDepartment = userDepartmentRef?.current || "";
      } else {
        // Tab switch: use direct state for immediate responsiveness
        currentUserRole = userRole;
        currentActiveTab = activeTab;
        currentStatusFilter = statusFilter;
        currentRequestSubTab = requestSubTab;
        currentUserDepartment = userDepartment;
      }
      
      const isSmsDept = currentUserDepartment?.startsWith("sms") || currentUserDepartment === "sms";
      const isVoiceDept = currentUserDepartment?.startsWith("voice") || currentUserDepartment === "voice";
      const currentDisplayTab = currentUserRole === "am" 
        ? (isSmsDept ? "sms" : isVoiceDept ? "voice" : currentUserDepartment) 
        : currentActiveTab;
      
      // For NOC/Admin: fetch all requests for the department (API returns all statuses)
      // For AM: fetch requests for their department
      params.append("department", currentUserRole === "am" ? currentDisplayTab : currentActiveTab);
      
      // Add status filter if not "all"
      if (currentStatusFilter && currentStatusFilter !== "all") {
        params.append("status", currentStatusFilter);
      }
      
      // Add request sub-tab filter (active or archive)
      if (currentRequestSubTab && currentRequestSubTab !== "all") {
        params.append("sub_tab", currentRequestSubTab);
      }
      
      // Add show_mine_only parameter for AMs
      if (currentUserRole === "am") {
        const showMineOnlyValue = showMineOnly !== null ? showMineOnly : (useRefs ? showMyRequestsOnlyRef.current : showMyRequestsOnly);
        params.append("show_mine_only", showMineOnlyValue);
      }
      
      const response = await fetch(`${API}/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Only update requests if we got valid data (not empty due to error)
        if (data && Array.isArray(data)) {
          setRequests(data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  // Auto-refresh data every 10 seconds, but not while already loading
  // Use a ref to track loading state to avoid recreating the interval on every isLoading change
  const isLoadingRef = useRef(false);
  
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && !isLoadingRef.current) {
        // Auto-refresh: use refs for latest values to avoid stale closures
        fetchRequests(null, false, true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestTypeChange = (type) => {
    setFormData({
      ...formData,
      request_type: type,
      request_type_label: REQUEST_TYPES[type]?.label || "",
      // Reset all type-specific fields
      rating: "",
      routing: "",
      customer_trunk: "",
      customer_trunks: {
        "": [{ destination: "", rate: "" }]
      },
      destination: "",
      rating_vendor_trunks: {
        "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }]
      },
      destination: "",
      translation_type: "",
      trunk_type: "",
      trunk_name: "",
      old_value: "",
      new_value: "",
      old_sid: "",
      new_sid: "",
      word_to_remove: "",
      translation_destination: "",
      enterprise_id: "",
      issue_types: [],
      issue_other: "",
      customer_trunk: "",
      investigation_destination: "",
      issue_description: "",
      via_vendor: "",
      with_lcr: true,
      direction: null,
      open_by: "",
      open_tt_notes: ""
    });
    // Reset trunk states for new trunk requests
    if (type === "trunk_request_sms" || type === "trunk_request_voice") {
      setTrunkDirection("");
      setTrunkWithLcr(true);
    }
  };

  const handleVendorTrunkChange = (index, field, value) => {
    const newTrunks = [...formData.vendor_trunks];
    newTrunks[index] = { ...newTrunks[index], [field]: value };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const addVendorTrunk = () => {
    setFormData({
      ...formData,
      vendor_trunks: [...formData.vendor_trunks, { trunk: "", sid_content_pairs: [{sid: "", content: ""}] }]
    });
  };

  const removeVendorTrunk = (index) => {
    const newTrunks = formData.vendor_trunks.filter((_, i) => i !== index);
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const handleSidContentPairChange = (trunkIndex, pairIndex, field, value) => {
    const newTrunks = [...formData.vendor_trunks];
    const newPairs = [...(newTrunks[trunkIndex].sid_content_pairs || [])];
    newPairs[pairIndex] = { ...newPairs[pairIndex], [field]: value };
    newTrunks[trunkIndex] = { ...newTrunks[trunkIndex], sid_content_pairs: newPairs };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const addSidContentPair = (trunkIndex) => {
    const newTrunks = [...formData.vendor_trunks];
    const currentPairs = newTrunks[trunkIndex].sid_content_pairs || [];
    newTrunks[trunkIndex] = { 
      ...newTrunks[trunkIndex], 
      sid_content_pairs: [...currentPairs, { sid: "", content: "" }] 
    };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const removeSidContentPair = (trunkIndex, pairIndex) => {
    const newTrunks = [...formData.vendor_trunks];
    const newPairs = newTrunks[trunkIndex].sid_content_pairs.filter((_, i) => i !== pairIndex);
    newTrunks[trunkIndex] = { ...newTrunks[trunkIndex], sid_content_pairs: newPairs };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  // ANI/A-Number handlers for Voice testing
  const handleAniNumberChange = (trunkIndex, aniIndex, value) => {
    const newTrunks = [...formData.vendor_trunks];
    const aniNumbers = [...(newTrunks[trunkIndex].ani_numbers || [])];
    aniNumbers[aniIndex] = value;
    newTrunks[trunkIndex] = { ...newTrunks[trunkIndex], ani_numbers: aniNumbers };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const addAniNumber = (trunkIndex) => {
    const newTrunks = [...formData.vendor_trunks];
    const aniNumbers = newTrunks[trunkIndex].ani_numbers || [];
    newTrunks[trunkIndex] = { 
      ...newTrunks[trunkIndex], 
      ani_numbers: [...aniNumbers, ""] 
    };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  const removeAniNumber = (trunkIndex, aniIndex) => {
    const newTrunks = [...formData.vendor_trunks];
    const aniNumbers = (newTrunks[trunkIndex].ani_numbers || []).filter((_, i) => i !== aniIndex);
    newTrunks[trunkIndex] = { ...newTrunks[trunkIndex], ani_numbers: aniNumbers };
    setFormData({ ...formData, vendor_trunks: newTrunks });
  };

  // Rating vendor trunk handlers - Position-based structure
  // New structure: { "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }], "2": [...] }
  
  const handleRatingVendorChange = (position, vendorIndex, field, value) => {
    const newPositions = { ...(formData.rating_vendor_trunks || {}) };
    const positionVendors = [...(newPositions[position] || [])];
    positionVendors[vendorIndex] = { ...positionVendors[vendorIndex], [field]: value };
    newPositions[position] = positionVendors;
    setFormData({ ...formData, rating_vendor_trunks: newPositions });
  };

  const addVendorToPosition = (position) => {
    const newPositions = { ...(formData.rating_vendor_trunks || {}) };
    const positionVendors = [...(newPositions[position] || [])];
    positionVendors.push({ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" });
    newPositions[position] = positionVendors;
    setFormData({ ...formData, rating_vendor_trunks: newPositions });
  };

  const removeVendorFromPosition = (position, vendorIndex) => {
    const newPositions = { ...(formData.rating_vendor_trunks || {}) };
    const positionVendors = (newPositions[position] || []).filter((_, i) => i !== vendorIndex);
    newPositions[position] = positionVendors;
    setFormData({ ...formData, rating_vendor_trunks: newPositions });
  };

  const addPosition = () => {
    const positions = formData.rating_vendor_trunks || {};
    const positionNumbers = Object.keys(positions).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
    const newPosition = positionNumbers.length > 0 ? Math.max(...positionNumbers) + 1 : 1;
    const newPositions = {
      ...positions,
      [newPosition.toString()]: [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }]
    };
    setFormData({ ...formData, rating_vendor_trunks: newPositions });
  };

  const removePosition = (position) => {
    const newPositions = { ...formData.rating_vendor_trunks };
    delete newPositions[position];
    // Re-index remaining positions to keep them sequential
    const remainingPositions = Object.keys(newPositions).sort((a, b) => parseInt(a) - parseInt(b));
    const reindexedPositions = {};
    remainingPositions.forEach((pos, index) => {
      reindexedPositions[(index + 1).toString()] = newPositions[pos];
    });
    setFormData({ ...formData, rating_vendor_trunks: reindexedPositions });
  };

  // Calculate percentage sum for a position
  const getPositionPercentageSum = (position) => {
    const vendors = formData.rating_vendor_trunks?.[position] || [];
    return vendors.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
  };

  // Customer trunk configs - New compact structure for rating_routing
  // Structure: [{ trunk, rating_pairs: [{destination, rate}], routing: { route_rules: [{ priority, vendors: [], advanced settings }] } }]

  const addCustomerTrunkConfig = () => {
    setFormData({
      ...formData,
      customer_trunk_configs: [
        ...formData.customer_trunk_configs,
        {
          trunk: "",
          // Rating pairs for multiple destination-rate pairs
          rating_pairs: [{ destination: "", rate: "" }],
          routing: {
            route_rules: [{
              priority: 1,
              vendors: [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "", note: "" }],
              by_loss: false,
              enable_mnp_hlr: false,
              mnp_hlr_type: "",
              enable_whitelisting: false
            }],
            global_by_loss: false,
            global_enable_mnp_hlr: false,
            global_mnp_hlr_type: "",
            global_enable_whitelisting: false
          }
        }
      ]
    });
  };

  const removeCustomerTrunkConfig = (index) => {
    const newConfigs = formData.customer_trunk_configs.filter((_, i) => i !== index);
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  const updateCustomerTrunkConfig = (index, field, value) => {
    const newConfigs = [...formData.customer_trunk_configs];
    if (field.startsWith('routing.')) {
      const routingField = field.replace('routing.', '');
      newConfigs[index] = {
        ...newConfigs[index],
        routing: { ...newConfigs[index].routing, [routingField]: value }
      };
    } else {
      newConfigs[index] = { ...newConfigs[index], [field]: value };
    }
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Get all destinations from all customer trunk configs for common routing
  const getAllDestinations = () => {
    const destinations = new Set();
    (formData.customer_trunk_configs || []).forEach(config => {
      (config.rating_pairs || []).forEach(pair => {
        if (pair.destination) destinations.add(pair.destination);
      });
    });
    return Array.from(destinations);
  };

  // Common Route Rules functions
  const addCommonRouteRule = () => {
    const currentRules = formData.common_route_rules || [];
    const newPriority = currentRules.length > 0 ? Math.max(...currentRules.map(r => r.priority || 0)) + 1 : 1;
    setFormData({
      ...formData,
      common_route_rules: [
        ...currentRules,
        {
          priority: newPriority,
          destination: "",
          vendors: [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }],
          by_loss: false,
          enable_mnp_hlr: false,
          mnp_hlr_type: "",
          note: ""
        }
      ]
    });
  };

  const cloneCommonRouteRule = (ruleIndex) => {
    const currentRules = formData.common_route_rules || [];
    const sourceRule = currentRules[ruleIndex];
    const newPriority = currentRules.length > 0 ? Math.max(...currentRules.map(r => r.priority || 0)) + 1 : 1;
    // Deep clone the source rule and update priority
    const clonedRule = JSON.parse(JSON.stringify(sourceRule));
    clonedRule.priority = newPriority;
    setFormData({
      ...formData,
      common_route_rules: [...currentRules, clonedRule]
    });
  };

  const removeCommonRouteRule = (ruleIndex) => {
    const newRules = (formData.common_route_rules || []).filter((_, i) => i !== ruleIndex);
    setFormData({ ...formData, common_route_rules: newRules });
  };

  const updateCommonRouteRule = (ruleIndex, field, value) => {
    const newRules = [...(formData.common_route_rules || [])];
    newRules[ruleIndex] = { ...newRules[ruleIndex], [field]: value };
    setFormData({ ...formData, common_route_rules: newRules });
  };

  const addVendorToCommonRule = (ruleIndex) => {
    const newRules = [...(formData.common_route_rules || [])];
    newRules[ruleIndex] = {
      ...newRules[ruleIndex],
      vendors: [...(newRules[ruleIndex].vendors || []), { trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }]
    };
    setFormData({ ...formData, common_route_rules: newRules });
  };

  const removeVendorFromCommonRule = (ruleIndex, vendorIndex) => {
    const newRules = [...(formData.common_route_rules || [])];
    newRules[ruleIndex] = {
      ...newRules[ruleIndex],
      vendors: newRules[ruleIndex].vendors.filter((_, i) => i !== vendorIndex)
    };
    setFormData({ ...formData, common_route_rules: newRules });
  };

  const updateVendorInCommonRule = (ruleIndex, vendorIndex, field, value) => {
    const newRules = [...(formData.common_route_rules || [])];
    newRules[ruleIndex] = {
      ...newRules[ruleIndex],
      vendors: newRules[ruleIndex].vendors.map((v, i) => i === vendorIndex ? { ...v, [field]: value } : v)
    };
    setFormData({ ...formData, common_route_rules: newRules });
  };

  // Add route rule to a specific customer trunk config's routing
  const addRouteRule = (configIndex) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const currentRules = newConfigs[configIndex].routing.route_rules || [];
    const newPriority = currentRules.length + 1;
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: {
        ...newConfigs[configIndex].routing,
        route_rules: [
          ...currentRules,
          {
            priority: newPriority,
            vendors: [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "", note: "" }],
            by_loss: false,
            enable_mnp_hlr: false,
            mnp_hlr_type: "",
            enable_whitelisting: false
          }
        ]
      }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Clone route rule from a specific customer trunk config
  const cloneRouteRule = (configIndex, ruleIndex) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const currentRules = newConfigs[configIndex].routing.route_rules || [];
    const sourceRule = currentRules[ruleIndex];
    const newPriority = currentRules.length + 1;
    // Deep clone the source rule and update priority
    const clonedRule = JSON.parse(JSON.stringify(sourceRule));
    clonedRule.priority = newPriority;
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: {
        ...newConfigs[configIndex].routing,
        route_rules: [...currentRules, clonedRule]
      }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Remove route rule from a specific customer trunk config
  const removeRouteRule = (configIndex, ruleIndex) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const currentRules = newConfigs[configIndex].routing.route_rules || [];
    const newRules = currentRules.filter((_, i) => i !== ruleIndex);
    // Keep existing priorities - do not reindex
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: { ...newConfigs[configIndex].routing, route_rules: newRules }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Update route rule in a specific customer trunk config
  const updateRouteRule = (configIndex, ruleIndex, field, value) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const newRules = [...(newConfigs[configIndex].routing.route_rules || [])];
    if (field.startsWith('vendors.')) {
      // Update vendor in this rule
      const vendorField = field.replace('vendors.', '');
      const vendorIndex = parseInt(vendorField.split('.')[0]);
      const vendorAttr = vendorField.split('.')[1];
      const newVendors = [...newRules[ruleIndex].vendors];
      newVendors[vendorIndex] = { ...newVendors[vendorIndex], [vendorAttr]: value };
      newRules[ruleIndex] = { ...newRules[ruleIndex], vendors: newVendors };
    } else {
      newRules[ruleIndex] = { ...newRules[ruleIndex], [field]: value };
    }
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: { ...newConfigs[configIndex].routing, route_rules: newRules }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Add vendor to a specific route rule
  const addVendorToRule = (configIndex, ruleIndex) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const newRules = [...(newConfigs[configIndex].routing.route_rules || [])];
    newRules[ruleIndex] = {
      ...newRules[ruleIndex],
      vendors: [
        ...newRules[ruleIndex].vendors,
        { trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "", note: "" }
      ]
    };
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: { ...newConfigs[configIndex].routing, route_rules: newRules }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Remove vendor from a specific route rule
  const removeVendorFromRule = (configIndex, ruleIndex, vendorIndex) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const newRules = [...(newConfigs[configIndex].routing.route_rules || [])];
    newRules[ruleIndex] = {
      ...newRules[ruleIndex],
      vendors: newRules[ruleIndex].vendors.filter((_, i) => i !== vendorIndex)
    };
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: { ...newConfigs[configIndex].routing, route_rules: newRules }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Update vendor in a specific route rule
  const updateVendorInRule = (configIndex, ruleIndex, vendorIndex, field, value) => {
    const newConfigs = [...formData.customer_trunk_configs];
    const newRules = [...(newConfigs[configIndex].routing.route_rules || [])];
    const newVendors = [...newRules[ruleIndex].vendors];
    newVendors[vendorIndex] = { ...newVendors[vendorIndex], [field]: value };
    newRules[ruleIndex] = { ...newRules[ruleIndex], vendors: newVendors };
    newConfigs[configIndex] = {
      ...newConfigs[configIndex],
      routing: { ...newConfigs[configIndex].routing, route_rules: newRules }
    };
    setFormData({ ...formData, customer_trunk_configs: newConfigs });
  };

  // Calculate position numbers for vendor dropdown
  const getPositionOptions = (currentVendors, currentIndex) => {
    const usedPositions = currentVendors
      .filter((_, i) => i !== currentIndex && v.position)
      .map(v => v.position);
    const options = [];
    for (let i = 1; i <= currentVendors.length + 2; i++) {
      if (!usedPositions.includes(i.toString())) {
        options.push(i);
      }
    }
    return options;
  };

  // Customer trunk handlers - Enterprise trunk with multiple destination-rate pairs
  // Legacy structure: { "trunk_name": [{ destination: "", rate: "" }] }
  
  const handleDestinationRateChange = (trunkName, pairIndex, field, value) => {
    const newTrunks = { ...(formData.customer_trunks || {}) };
    const trunkEntries = [...(newTrunks[trunkName] || [])];
    trunkEntries[pairIndex] = { ...trunkEntries[pairIndex], [field]: value };
    newTrunks[trunkName] = trunkEntries;
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const addDestinationRatePair = (trunkName) => {
    const newTrunks = { ...(formData.customer_trunks || {}) };
    const trunkEntries = [...(newTrunks[trunkName] || [])];
    trunkEntries.push({ destination: "", rate: "" });
    newTrunks[trunkName] = trunkEntries;
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const removeDestinationRatePair = (trunkName, pairIndex) => {
    const newTrunks = { ...formData.customer_trunks };
    const trunkEntries = (newTrunks[trunkName] || []).filter((_, i) => i !== pairIndex);
    newTrunks[trunkName] = trunkEntries;
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const addEnterpriseTrunk = () => {
    const newTrunks = { ...(formData.customer_trunks || {}) };
    newTrunks[""] = [{ destination: "", rate: "" }];
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const removeEnterpriseTrunk = (trunkName) => {
    const newTrunks = { ...formData.customer_trunks };
    delete newTrunks[trunkName];
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const handleEnterpriseTrunkSelect = (oldTrunkName, newTrunkName) => {
    const newTrunks = { ...formData.customer_trunks };
    // Get the destination-rate pairs from the old trunk or create new
    const pairs = newTrunks[oldTrunkName] || [{ destination: "", rate: "" }];
    // Remove old entry if it was the empty placeholder
    if (oldTrunkName === "") {
      delete newTrunks[""];
    }
    // Add new entry with the selected trunk name
    newTrunks[newTrunkName] = pairs;
    setFormData({ ...formData, customer_trunks: newTrunks });
  };

  const handleSubmit = async () => {
    // Validate before submitting
    if (!canSubmit()) {
      // Check for percentage validation errors
      if (formData.request_type === "rating_routing") {
        const positions = formData.rating_vendor_trunks || {};
        for (const [position, vendors] of Object.entries(positions)) {
          const vendorsWithTrunk = (vendors || []).filter(v => v.trunk);
          if (vendorsWithTrunk.length > 1) {
            const percentageSum = vendorsWithTrunk.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
            if (percentageSum !== 100) {
              toast({ 
                title: "Validation Error", 
                description: `Position ${position}: Percentages must add up to 100% (currently ${percentageSum}%)`, 
                variant: "destructive" 
              });
              return;
            }
          }
        }
      }
      // Validate destination format for investigation requests
      if (formData.request_type === "investigation" && formData.investigation_destination) {
        const destinationPattern = /^[^ -]+ - [^ -]+$/;
        if (!destinationPattern.test(formData.investigation_destination.trim())) {
          toast({ 
            title: "Validation Error", 
            description: "Destination must be in 'Country - Network' format (e.g., Ghana - MTN, Nigeria - All Networks)", 
            variant: "destructive" 
          });
          return;
        }
      }

      // Validate rate and cost are numeric for rating_routing requests
      if (formData.request_type === "rating_routing") {
        const customerTrunks = formData.customer_trunks || {};
        for (const [trunk, pairs] of Object.entries(customerTrunks)) {
          for (const pair of pairs) {
            if (pair.rate && pair.rate.trim() !== "" && isNaN(parseFloat(pair.rate))) {
              toast({ 
                title: "Validation Error", 
                description: `Rate for ${trunk} must be a numeric value`, 
                variant: "destructive" 
              });
              return;
            }
          }
        }

        // Validate vendor trunk costs (cost_min, cost_max, percentage)
        const positions = formData.rating_vendor_trunks || {};
        for (const [position, vendors] of Object.entries(positions)) {
          for (const vendor of (vendors || [])) {
            if (vendor.trunk) {
              // Validate percentage
              if (vendor.percentage && vendor.percentage.trim() !== "" && isNaN(parseFloat(vendor.percentage))) {
                toast({ 
                  title: "Validation Error", 
                  description: `Percentage for vendor ${vendor.trunk} in position ${position} must be a numeric value`, 
                  variant: "destructive" 
                });
                return;
              }
              // Validate cost_min
              if (vendor.cost_min && vendor.cost_min.trim() !== "" && isNaN(parseFloat(vendor.cost_min))) {
                toast({ 
                  title: "Validation Error", 
                  description: `Cost for vendor ${vendor.trunk} in position ${position} must be a numeric value`, 
                  variant: "destructive" 
                });
                return;
              }
              // Validate cost_max (if provided)
              if (vendor.cost_max && vendor.cost_max.trim() !== "" && isNaN(parseFloat(vendor.cost_max))) {
                toast({ 
                  title: "Validation Error", 
                  description: `Max cost for vendor ${vendor.trunk} in position ${position} must be a numeric value`, 
                  variant: "destructive" 
                });
                return;
              }
            }
          }
        }
      }

      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      
      const requestData = {
        request_type: formData.request_type,
        request_type_label: formData.request_type_label,
        department: displayTab,
        priority: formData.priority,
        customer: formData.customer,
        customer_id: formData.customer_id,
        customer_ids: formData.customer_ids || [],
        ticket_id: formData.ticket_id || null,
        rating: formData.rating || null,
        customer_trunk: formData.customer_trunk || null,
        // New compact customer_trunk_configs structure
        customer_trunk_configs: formData.customer_trunk_configs || [],
        // Convert to legacy format for compatibility with existing backend
        customer_trunks: formData.customer_trunk_configs
          ? formData.customer_trunk_configs
              .filter(c => c.trunk && c.destination)
              .map(c => ({ trunk: c.trunk, destination: c.destination, rate: c.rate }))
          : Object.entries(formData.customer_trunks || {}).flatMap(
              ([trunk, pairs]) => pairs
                .filter(p => p.destination)
                .map(p => ({ trunk, destination: p.destination, rate: p.rate }))
            ),
        destination: formData.destination || null,
        by_loss: formData.by_loss || false,
        enable_mnp_hlr: formData.enable_mnp_hlr || false,
        mnp_hlr_type: formData.mnp_hlr_type || null,
        // Threshold replaced with notes
        notes: formData.notes || null,
        via_vendor: formData.via_vendor || null,
        enable_whitelisting: formData.enable_whitelisting || false,
        // Convert position-based object to array format for backend
        rating_vendor_trunks: Object.entries(formData.rating_vendor_trunks || {}).flatMap(
          ([position, vendors]) => vendors
            .filter(v => v.trunk)
            .map(v => ({ ...v, position }))
        ),
        // Common routing fields
        common_route_rules: formData.common_route_rules || [],
        use_common_routing: formData.use_common_routing || false,
        vendor_trunks: formData.vendor_trunks.filter(t => t.trunk) || [],
        translation_type: formData.translation_type || null,
        trunk_type: formData.trunk_type || null,
        trunk_name: formData.trunk_name || null,
        old_value: formData.old_value || null,
        new_value: formData.new_value || null,
        old_sid: formData.old_sid || null,
        new_sid: formData.new_sid || null,
        word_to_remove: formData.word_to_remove || null,
        translation_destination: formData.translation_destination || null,
        test_type: formData.test_type || null,
        test_description: formData.test_description || null,
        lcr_type: formData.lcr_type || null,
        lcr_change: formData.lcr_change || null,
        issue_types: formData.issue_types || [],
        issue_other: formData.issue_other || null,
        investigation_destination: formData.investigation_destination || null,
        issue_description: formData.issue_description || null,
        with_lcr: trunkWithLcr,
        direction: trunkDirection || null,
        open_by: formData.open_by || null,
        open_tt_notes: formData.open_tt_notes || null
      };

      if (isEditMode && editingRequest) {
        const response = await axios.put(`${API}/requests/${editingRequest.id}`, requestData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast({ title: "Request updated successfully" });
        const updated = response.data;
        setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        const response = await axios.post(`${API}/requests`, requestData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast({ title: "Request submitted successfully" });
        setRequests(prev => [response.data, ...prev]);
      }

      setDialogOpen(false);
      setIsEditMode(false);
      setEditingRequest(null);
      // Reset form
      setFormData(getInitialFormData());
    } catch (error) {
      console.error("Failed to submit request:", error);
      const errorMessage = error.response?.data?.detail || "Failed to submit request";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const handleEditRequest = (request) => {
    setIsEditMode(true);
    setEditingRequest(request);
    // Populate formData with the request data
    setFormData({
      request_type: request.request_type,
      request_type_label: request.request_type_label,
      priority: request.priority || "Medium",
      customer: request.customer || "",
      customer_id: request.customer_id || "",
      customer_ids: request.customer_ids || (request.customer_id ? [request.customer_id] : []),
      rating: request.rating || "",
      routing: request.routing || "",
      customer_trunk: request.customer_trunk || "",
      // Convert array format from backend to object format for customer_trunks
      customer_trunks: (() => {
        if (!request.customer_trunks || request.customer_trunks.length === 0) {
          return { "": [{ destination: "", rate: "" }] };
        }
        const grouped = {};
        request.customer_trunks.forEach(t => {
          if (!t.trunk) return;
          if (!grouped[t.trunk]) grouped[t.trunk] = [];
          grouped[t.trunk].push({ destination: t.destination || "", rate: t.rate || "" });
        });
        return Object.keys(grouped).length > 0 ? grouped : { "": [{ destination: "", rate: "" }] };
      })(),
      destination: request.destination || "",
      by_loss: request.by_loss || false,
      enable_mnp_hlr: request.enable_mnp_hlr || false,
      mnp_hlr_type: request.mnp_hlr_type || "",
      enable_threshold: request.enable_threshold || false,
      threshold_count: request.threshold_count || "",
      via_vendor: request.via_vendor || "",
      enable_whitelisting: request.enable_whitelisting || false,
      // Load customer_trunk_configs from backend for rating_routing
      customer_trunk_configs: request.customer_trunk_configs || [],
      // Load common routing from backend
      common_route_rules: request.common_route_rules || [],
      use_common_routing: request.use_common_routing || false,
      // Convert array format from backend to position-based object format
      rating_vendor_trunks: (() => {
        if (!request.rating_vendor_trunks || request.rating_vendor_trunks.length === 0) {
          return { "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }] };
        }
        const grouped = {};
        request.rating_vendor_trunks.forEach(v => {
          const pos = v.position || "1";
          if (!grouped[pos]) grouped[pos] = [];
          grouped[pos].push({ trunk: v.trunk || "", percentage: v.percentage || "", cost_type: v.cost_type || "fixed", cost_min: v.cost_min || "", cost_max: v.cost_max || "" });
        });
        return grouped;
      })(),
      vendor_trunks: request.vendor_trunks?.length > 0 ? request.vendor_trunks : [{ trunk: "", sid_content_pairs: [{sid: "", content: ""}] }],
      translation_type: request.translation_type || "",
      trunk_type: request.trunk_type || "",
      trunk_name: request.trunk_name || "",
      old_value: request.old_value || "",
      new_value: request.new_value || "",
      old_sid: request.old_sid || "",
      new_sid: request.new_sid || "",
      word_to_remove: request.word_to_remove || "",
      translation_destination: request.translation_destination || "",
      enterprise_id: request.enterprise_id || request.customer_id || "",
      test_type: request.test_type || "",
      test_description: request.test_description || "",
      lcr_type: request.lcr_type || "",
      lcr_change: request.lcr_change || "",
      issue_types: request.issue_types || [],
      issue_other: request.issue_other || "",
      investigation_destination: request.investigation_destination || "",
      issue_description: request.issue_description || "",
      with_lcr: request.with_lcr || false,
      direction: request.direction || null,
      open_by: request.open_by || "",
      open_tt_notes: request.open_tt_notes || ""
    });
    // Set the trunk states for editing trunk requests
    if (request.request_type === "trunk_request_sms" || request.request_type === "trunk_request_voice") {
      setTrunkDirection(request.direction || "");
      setTrunkWithLcr(request.with_lcr || false);
    }
    setDialogOpen(true);
  };

  const handleCloneRequest = (request) => {
    setIsEditMode(false);
    setEditingRequest(null);
    // Populate formData with the request data for cloning
    setFormData({
      request_type: request.request_type,
      request_type_label: request.request_type_label,
      priority: request.priority || "Medium",
      customer: request.customer || "",
      customer_id: request.customer_id || "",
      customer_ids: request.customer_ids || (request.customer_id ? [request.customer_id] : []),
      rating: request.rating || "",
      routing: request.routing || "",
      customer_trunk: request.customer_trunk || "",
      // Convert array format from backend to object format for customer_trunks
      customer_trunks: (() => {
        if (!request.customer_trunks || request.customer_trunks.length === 0) {
          return { "": [{ destination: "", rate: "" }] };
        }
        const grouped = {};
        request.customer_trunks.forEach(t => {
          if (!t.trunk) return;
          if (!grouped[t.trunk]) grouped[t.trunk] = [];
          grouped[t.trunk].push({ destination: t.destination || "", rate: t.rate || "" });
        });
        return Object.keys(grouped).length > 0 ? grouped : { "": [{ destination: "", rate: "" }] };
      })(),
      destination: request.destination || "",
      by_loss: request.by_loss || false,
      enable_mnp_hlr: request.enable_mnp_hlr || false,
      mnp_hlr_type: request.mnp_hlr_type || "",
      enable_threshold: request.enable_threshold || false,
      threshold_count: request.threshold_count || "",
      via_vendor: request.via_vendor || "",
      enable_whitelisting: request.enable_whitelisting || false,
      // Load customer_trunk_configs from backend for rating_routing
      customer_trunk_configs: request.customer_trunk_configs || [],
      // Load common routing from backend
      common_route_rules: request.common_route_rules || [],
      use_common_routing: request.use_common_routing || false,
      // Convert array format from backend to position-based object format
      rating_vendor_trunks: (() => {
        if (!request.rating_vendor_trunks || request.rating_vendor_trunks.length === 0) {
          return { "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }] };
        }
        const grouped = {};
        request.rating_vendor_trunks.forEach(v => {
          const pos = v.position || "1";
          if (!grouped[pos]) grouped[pos] = [];
          grouped[pos].push({ trunk: v.trunk || "", percentage: v.percentage || "", cost_type: v.cost_type || "fixed", cost_min: v.cost_min || "", cost_max: v.cost_max || "" });
        });
        return grouped;
      })(),
      vendor_trunks: request.vendor_trunks?.length > 0 ? request.vendor_trunks : [{ trunk: "", sid_content_pairs: [{sid: "", content: ""}] }],
      translation_type: request.translation_type || "",
      trunk_type: request.trunk_type || "",
      trunk_name: request.trunk_name || "",
      old_value: request.old_value || "",
      new_value: request.new_value || "",
      old_sid: request.old_sid || "",
      new_sid: request.new_sid || "",
      word_to_remove: request.word_to_remove || "",
      translation_destination: request.translation_destination || "",
      enterprise_id: request.enterprise_id || request.customer_id || "",
      test_type: request.test_type || "",
      test_description: request.test_description || "",
      lcr_type: request.lcr_type || "",
      lcr_change: request.lcr_change || "",
      issue_types: request.issue_types || [],
      issue_other: request.issue_other || "",
      investigation_destination: request.investigation_destination || "",
      issue_description: request.issue_description || "",
      with_lcr: request.with_lcr || false,
      direction: request.direction || null,
      // Missing fields - now properly cloned
      department: request.department || "",
      ticket_id: request.ticket_id || "",
      open_by: request.open_by || "",
      open_tt_notes: request.open_tt_notes || ""
    });
    // Set the trunk states for cloning trunk requests
    if (request.request_type === "trunk_request_sms" || request.request_type === "trunk_request_voice") {
      setTrunkDirection(request.direction || "");
      setTrunkWithLcr(request.with_lcr || false);
    }
    setDialogOpen(true);
  };

  // Create LCR Request from completed Testing Request for AM
  const handleCreateLcrFromTesting = (request) => {
    setIsEditMode(false);
    setEditingRequest(null);
    // Populate formData with LCR request type, pre-filling common fields from Testing request
    setFormData({
      request_type: "lcr",
      request_type_label: "LCR Request",
      priority: request.priority || "Medium",
      customer: request.customer || "",
      customer_id: request.customer_id || "",
      customer_ids: request.customer_ids || (request.customer_id ? [request.customer_id] : []),
      // Pre-fill common fields from Testing request
      ticket_id: request.ticket_id || "",
      destination: request.destination || "",
      vendor_trunks: request.vendor_trunks?.length > 0 ? request.vendor_trunks : [{ trunk: "", sid_content_pairs: [{sid: "", content: ""}] }],
      // LCR-specific fields (will be filled by AM)
      lcr_type: "",
      lcr_change: "",
      // Clear other fields not needed for LCR
      rating: "",
      routing: "",
      customer_trunk: "",
      customer_trunks: { "": [{ destination: "", rate: "" }] },
      by_loss: false,
      enable_mnp_hlr: false,
      mnp_hlr_type: "",
      enable_threshold: false,
      threshold_count: "",
      via_vendor: "",
      enable_whitelisting: false,
      rating_vendor_trunks: { "1": [{ trunk: "", percentage: "", cost_type: "fixed", cost_min: "", cost_max: "" }] },
      translation_type: "",
      trunk_type: "",
      trunk_name: "",
      old_value: "",
      new_value: "",
      old_sid: "",
      new_sid: "",
      word_to_remove: "",
      translation_destination: "",
      enterprise_id: request.enterprise_id || request.customer_id || "",
      test_type: "",
      test_description: "",
      issue_types: [],
      issue_other: "",
      investigation_destination: "",
      issue_description: "",
      with_lcr: false,
      direction: null,
      open_by: "",
      open_tt_notes: ""
    });
    setDialogOpen(true);
  };

  const handleDeleteRequest = async (requestId) => {
    setRequestToDelete(requestId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!requestToDelete) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/requests/${requestToDelete}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({ title: "Request deleted successfully" });
      setRequests(prev => prev.filter(r => r.id !== requestToDelete));
    } catch (error) {
      console.error("Failed to delete request:", error);
      const errorMessage = error.response?.data?.detail || "Failed to delete request";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    }
  };

  const handleViewRequest = (request) => {
    setSelectedRequest(request);
    setViewRequestDialogOpen(true);
  };

  const handleResponse = (request, type) => {
    setSelectedRequest(request);
    setResponseType(type);
    setResponseComment("");
    setResponseImages([]);
    setResponseImagePreviews([]);
    setResponseDialogOpen(true);
  };

  const handleImagePaste = (file) => {
    if (file && file.type.startsWith('image/')) {
      setResponseImages(prev => [...prev, file]);
      setResponseImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
    }
  };

  const handleClaimRequest = (request) => {
    setRequestToClaim(request);
    setClaimDialogOpen(true);
  };

  const submitClaim = async () => {
    if (!requestToClaim) return;
    try {
      const token = localStorage.getItem("token");
      const response = await axios.put(`${API}/requests/${requestToClaim.id}`, {
        claimed_by: user.id,
        status: "in_progress"
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({ title: "Request claimed successfully" });
      const updated = response.data;
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (error) {
      console.error("Failed to claim request:", error);
      const errorMessage = error.response?.data?.detail || "Failed to claim request";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setClaimDialogOpen(false);
      setRequestToClaim(null);
    }
  };

  const submitResponse = async () => {
    if (!selectedRequest || !responseType) return;
    try {
      const token = localStorage.getItem("token");
      const newStatus = responseType === "complete" ? "completed" : "rejected";
      
      // Convert images to base64 if present
      let testResultImagesBase64 = [];
      if (responseImages.length > 0) {
        for (const image of responseImages) {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(image);
          });
          testResultImagesBase64.push(base64);
        }
      }
      
      const response = await axios.put(`${API}/requests/${selectedRequest.id}`, {
        status: newStatus,
        response: responseComment || null,
        test_result_images: testResultImagesBase64
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({ title: `Request ${newStatus === "completed" ? "completed" : "rejected"} successfully` });
      const updated = response.data;
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (error) {
      console.error("Failed to respond to request:", error);
      const errorMessage = error.response?.data?.detail || "Failed to respond to request";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setResponseDialogOpen(false);
      setSelectedRequest(null);
      setResponseType(null);
      setResponseComment("");
      setResponseImages([]);
      setResponseImagePreviews([]);
    }
  };

  const getPriorityColor = (priority) => {
    const p = PRIORITIES.find(p => p.value === priority);
    return p ? `${p.color} ${p.text}` : "bg-gray-400 dark:bg-zinc-500 text-gray-900 dark:text-zinc-100";
  };

  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  // Memoize filtered and sorted requests to avoid recalculating on every render
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // Filter by subtab (active vs archive)
      // For NOC/Admin: API returns requests filtered by department (sms/voice)
      // For AM: API returns requests for their department, client-side doesn't need extra filtering
      if (requestSubTab === "active") {
        // Active: show pending and claimed requests
        if (req.status !== "pending" && req.status !== "in_progress") return false;
      } else {
        // Archive: show completed and rejected requests
        if (req.status !== "completed" && req.status !== "rejected") return false;
      }
      
      if (!debouncedSearchTerm) return true;
      const search = debouncedSearchTerm.toLowerCase();
      return (
        req.customer?.toLowerCase().includes(search) ||
        req.request_type_label?.toLowerCase().includes(search) ||
        req.id?.toLowerCase().includes(search)
      );
    }).filter(req => {
      // Multi-filters (OR logic within same field, AND logic between fields)
      if (multiFilters.length === 0) return true;
      
      return multiFilters.every(filter => {
        const { field, values } = filter;
        
        if (field === "status") {
          return values.includes(req.status);
        } else if (field === "ticket_type") {
          return values.includes(req.ticket_type);
        } else if (field === "request_type") {
          return values.includes(req.request_type);
        } else if (field === "enterprise") {
          return values.includes(req.customer_id);
        } else if (field === "enterprise_trunk") {
          return values.includes(req.customer_trunk);
        } else if (field === "vendor_trunk") {
          const trunks = req.vendor_trunks || [];
          return values.some(v => trunks.some(t => t.trunk === v));
        }
        return true;
      });
    });
  }, [requests, requestSubTab, debouncedSearchTerm, multiFilters]);

  // Memoize sorted requests
  const sortedRequests = useMemo(() => {
    // Sort requests: Active tab = by priority, Archive tab = by time (newest first)
    const priorityOrder = { "Urgent": 1, "High": 2, "Medium": 3, "Low": 4 };
    
    // Create a copy for sorting to avoid mutating the original array
    const sorted = [...filteredRequests];
    
    if (requestSubTab === "active") {
      // Active tab: sort by priority (Urgent -> High -> Medium -> Low)
      sorted.sort((a, b) => {
        const priorityA = priorityOrder[a.priority] || 5;
        const priorityB = priorityOrder[b.priority] || 5;
        return priorityA - priorityB;
      });
    } else {
      // Archive tab: sort by time (newest first)
      sorted.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA; // Newest first
      });
    }
    return sorted;
  }, [filteredRequests, requestSubTab]);

  // For AMs, only show their department
  // Use flexible matching to handle different department name formats
  const isSmsDepartment = userDepartment?.startsWith("sms") || userDepartment === "sms";
  const isVoiceDepartment = userDepartment?.startsWith("voice") || userDepartment === "voice";
  const displayTab = userRole === "am" 
    ? (isSmsDepartment ? "sms" : isVoiceDepartment ? "voice" : userDepartment) 
    : activeTab;

  // Validation for Rating/Routing - requires customer_trunk_configs with trunk and destination, and either rate or vendor trunk(s)
  const isRatingRoutingValid = () => {
    if (formData.request_type !== "rating_routing") return true;
    
    // Validate customer trunk configs
    const configs = formData.customer_trunk_configs || [];
    
    // At least one customer trunk config with trunk and at least one rating pair with destination is required
    const hasValidConfig = configs.some(
      config => config.trunk && (config.rating_pairs || []).some(p => p.destination)
    );
    if (!hasValidConfig) return false;
    
    // Check if any config has a rate
    const hasCustomerRate = configs.some(config => 
      (config.rating_pairs || []).some(p => p.rate && p.rate.trim())
    );
    // Check if any config has vendor trunks in route rules
    const hasVendorTrunks = configs.some(config => 
      (config.routing?.route_rules || []).some(rule => 
        (rule.vendors || []).some(v => v.trunk)
      )
    );
    
    // Either customer trunk needs rate OR vendor trunk needs to exist
    if (!hasCustomerRate && !hasVendorTrunks) return false;
    
    // Validate numeric fields
    for (const config of configs) {
      for (const pair of (config.rating_pairs || [])) {
        if (pair.rate && pair.rate.trim() && isNaN(parseFloat(pair.rate))) {
          return false;
        }
      }
      for (const rule of (config.routing?.route_rules || [])) {
        for (const vendor of (rule.vendors || [])) {
          if (vendor.trunk) {
            if (vendor.percentage && vendor.percentage.trim() && isNaN(parseFloat(vendor.percentage))) {
              return false;
            }
            if (vendor.cost_min && vendor.cost_min.trim() && isNaN(parseFloat(vendor.cost_min))) {
              return false;
            }
            if (vendor.cost_max && vendor.cost_max.trim() && isNaN(parseFloat(vendor.cost_max))) {
              return false;
            }
          }
        }
      }
    }
    
    // Validate percentages: if a rule has more than 1 vendor, percentages must add up to 100%
    for (const config of configs) {
      for (const rule of (config.routing?.route_rules || [])) {
        const vendorsWithTrunk = (rule.vendors || []).filter(v => v.trunk);
        if (vendorsWithTrunk.length > 1) {
          const percentageSum = vendorsWithTrunk.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
          if (percentageSum !== 100) {
            return false;
          }
        }
      }
    }
    
    return true;
  };

  // Validation for Testing - requires vendor trunk, destination
  // SMS: requires SID/Content pair, Voice: requires test_type (ANI is optional)
  const isTestingValid = () => {
    if (formData.request_type !== "testing") return true;
    const hasVendorTrunks = formData.vendor_trunks.some(t => t.trunk);
    const hasDestination = formData.destination && formData.destination.trim();
    
    if (displayTab === "sms") {
      // SMS: requires SID/Content pairs
      const hasSidContent = formData.vendor_trunks.some(t => 
        (t.sid_content_pairs || []).some(pair => pair.sid && pair.sid.trim() && pair.content && pair.content.trim())
      );
      return hasVendorTrunks && hasDestination && hasSidContent;
    } else {
      // Voice: requires test_type and vendor trunk, destination (ANI is optional)
      return hasVendorTrunks && hasDestination && formData.test_type;
    }
  };

  const canSubmit = () => {
    if (!formData.request_type) return false;
    // Customer is not required for testing and translation
    if (formData.request_type === "testing") return isTestingValid();
    if (formData.request_type === "rating_routing") return isRatingRoutingValid();
    if (formData.request_type === "translation") {
      if (!formData.customer_id || !formData.translation_type || !formData.trunk_type || !formData.trunk_name) return false;
      // Check based on translation type
      if (formData.translation_type === "sid_change") {
        return formData.old_value && formData.new_value;
      }
      if (formData.translation_type === "content_change") {
        return formData.old_value && formData.new_value;
      }
      if (formData.translation_type === "sid_content_change") {
        return formData.old_sid && formData.new_sid && formData.old_value && formData.new_value;
      }
      if (formData.translation_type === "remove") {
        return formData.word_to_remove;
      }
      return false;
    }
    // For other types, customer is required
    if (formData.request_type === "investigation") {
      return formData.customer_id && formData.customer_trunk;
    }
    // LCR validation - requires destination, lcr_type, lcr_change and at least one vendor trunk
    if (formData.request_type === "lcr") {
      const hasVendorTrunks = formData.vendor_trunks.some(t => t.trunk);
      return formData.destination && formData.lcr_type && formData.lcr_change && hasVendorTrunks;
    }
    // New Trunk Request validation - requires customer_ids, trunk_type, direction and with_lcr
    if (formData.request_type === "trunk_request_sms" || formData.request_type === "trunk_request_voice") {
      return formData.customer_ids && formData.customer_ids.length > 0 && formData.trunk_type && trunkDirection;
    }
    // Open TT validation - requires destination, vendor_trunks, and open_by
    if (formData.request_type === "open_tt") {
      const hasVendorTrunks = formData.vendor_trunks.some(t => t.trunk);
      return formData.destination && hasVendorTrunks && formData.open_by;
    }
    return formData.customer;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AM Requests</h1>
          <p className="text-gray-500 dark:text-zinc-400">Submit and track requests for NOC</p>
        </div>
        {userRole === "am" && (
          <Button onClick={() => {
            setFormData(getInitialFormData());
            setTrunkDirection("");
            setTrunkWithLcr(true);
            setIsEditMode(false);
            setEditingRequest(null);
            setDialogOpen(true);
          }} className="bg-amber-500 text-black hover:bg-amber-400">
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-zinc-400" />
          <Input
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
          />
        </div>
        <MultiFilter
          filters={multiFilters}
          onFilterChange={setMultiFilters}
          statusOptions={["pending", "in_progress", "completed", "rejected"]}
          customOptions={{
            status: [
              { value: "pending", label: "Pending" },
              { value: "in_progress", label: "In Progress" },
              { value: "completed", label: "Completed" },
              { value: "rejected", label: "Rejected" }
            ],
            request_type: Object.entries(REQUEST_TYPES).filter(([key, type]) => {
              // Filter by department based on activeTab
              if (type.forDepartment) {
                if (type.forDepartment !== activeTab) return false;
              }
              return true;
            }).map(([key, type]) => ({ value: key, label: type.label }))
          }}
          fields={["ticket_number", "status", "enterprise", "enterprise_trunk", "vendor_trunk", "request_type"]}
          enterprises={activeTab === "sms" ? enterprises.filter(e => e.enterprise_type === "sms") : enterprises.filter(e => e.enterprise_type === "voice")}
          customerTrunkOptions={customerTrunkOptions}
          vendorTrunkOptions={vendorTrunkOptions}
        />
        
        {/* Toggle for AM to show only their own requests */}
        {userRole === "am" && (
          <div className="flex items-center gap-2">
            <Switch
              id="show-my-requests"
              checked={showMyRequestsOnly}
              onCheckedChange={(checked) => {
                setShowMyRequestsOnly(checked);
                fetchRequests(checked);
              }}
            />
            <Label htmlFor="show-my-requests" className="text-gray-700 dark:text-zinc-300 text-sm cursor-pointer">
              Show My Requests Only
            </Label>
          </div>
        )}
      </div>

      {/* Tabs - For NOC/Admin show both SMS/Voice, for AM show only their department */}
      {userRole !== "am" ? (
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setRequestSubTab("active"); }}>
          <TabsList className="bg-gray-100 dark:bg-zinc-800">
            <TabsTrigger value="sms" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              SMS Requests
            </TabsTrigger>
            <TabsTrigger value="voice" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              Voice Requests
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        <div className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {isSmsDepartment ? "SMS Requests" : isVoiceDepartment ? "Voice Requests" : "My Requests"}
        </div>
      )}

      {/* Sub-tabs for Active/Archive - show for all users */}
      <div className="mt-4 flex gap-2">
        <Button
          variant={requestSubTab === "active" ? "default" : "outline"}
          onClick={() => setRequestSubTab("active")}
          className={requestSubTab === "active" ? "bg-green-600 hover:bg-green-700" : "border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"}
        >
          Active
        </Button>
        <Button
          variant={requestSubTab === "archive" ? "default" : "outline"}
          onClick={() => setRequestSubTab("archive")}
          className={requestSubTab === "archive" ? "bg-blue-600 hover:bg-blue-700" : "border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"}
        >
          Archive
        </Button>
      </div>

      {/* Requests List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-4"></div>
              <p className="text-gray-500 dark:text-zinc-400">Loading requests...</p>
            </CardContent>
          </Card>
        ) : sortedRequests.length === 0 ? (
          <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Filter className="h-12 w-12 text-zinc-600 mb-4" />
              <p className="text-gray-500 dark:text-zinc-400">No requests found</p>
            </CardContent>
          </Card>
        ) : (
          sortedRequests.map((request) => {
            const statusConfig = getStatusConfig(request.status);
            const StatusIcon = statusConfig.icon;
            
            return (
              <Card key={request.id} className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(request.priority)}`}>
                          {request.priority}
                        </span>
                        <Badge variant="outline" className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300">
                          {request.request_type_label}
                        </Badge>
                        <Badge variant="outline" className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 capitalize">
                          {request.department}
                        </Badge>
                      </div>
                      <h3 className="text-gray-900 dark:text-white font-medium">{request.customer}</h3>
                      <p className="text-gray-500 dark:text-zinc-400 text-sm">
                        Created by {request.created_by_username} on {new Date(request.created_at).toLocaleDateString()}
                        {request.claimed_by_username && <span className="block text-yellow-400">Claimed by {request.claimed_by_username}</span>}
                      </p>
                      
                      {/* Show relevant details based on request type */}
                      {request.request_type === "rating_routing" && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {/* Customer Trunks */}
                          {request.customer_trunks && request.customer_trunks.length > 0 && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Customer Trunk(s): </span>
                              {request.customer_trunks.map((ct, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}{ct.trunk}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Destinations */}
                          {request.customer_trunks && request.customer_trunks.length > 0 && (
                            <div>
                              <span className="text-zinc-500">Destination(s): </span>
                              {request.customer_trunks.map((ct, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}{ct.destination}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Legacy rating/routing fields */}
                          {(request.rating || request.routing) && (
                            <>
                              {request.rating && <div><span className="text-zinc-500">Rating: </span>{request.rating}</div>}
                              {request.routing && <div><span className="text-zinc-500">Routing: </span>{request.routing}</div>}
                            </>
                          )}
                        </div>
                      )}
                      
                      {(request.request_type === "testing" || request.request_type_label?.includes("Testing")) && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.vendor_trunks && request.vendor_trunks.length > 0 && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Vendor Trunk(s): </span>
                              {request.vendor_trunks.map((vt, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}{vt.trunk}
                                </span>
                              ))}
                            </div>
                          )}
                          {request.destination && (
                            <div>
                              <span className="text-zinc-500">Destination(s): </span>
                              {request.destination}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {request.request_type === "translation" && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.trunk_name && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Customer Trunk: </span>
                              {request.trunk_name}
                            </div>
                          )}
                          {request.trunk_type && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Trunk Type: </span>
                              {request.trunk_type}
                            </div>
                          )}
                          {request.translation_destination && (
                            <div>
                              <span className="text-zinc-500">Destination: </span>
                              {request.translation_destination}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {request.request_type === "lcr" && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.vendor_trunks && request.vendor_trunks.length > 0 && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Vendor Trunk(s): </span>
                              {request.vendor_trunks.map((vt, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}{vt.trunk}
                                </span>
                              ))}
                            </div>
                          )}
                          {request.destination && (
                            <div>
                              <span className="text-zinc-500">Destination(s): </span>
                              {request.destination}
                            </div>
                          )}
                        </div>
                      )}

                      {request.request_type === "investigation" && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.customer_trunk && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Customer Trunk: </span>
                              {request.customer_trunk}
                            </div>
                          )}
                          {request.investigation_destination && (
                            <div>
                              <span className="text-zinc-500">Destination: </span>
                              {request.investigation_destination}
                            </div>
                          )}
                        </div>
                      )}

                      {/* New Trunk Request Display */}
                      {(request.request_type === "trunk_request_sms" || request.request_type === "trunk_request_voice") && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.customer && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Customer(s): </span>
                              {request.customer}
                            </div>
                          )}
                          {request.trunk_type && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Trunk Type: </span>
                              {request.trunk_type}
                            </div>
                          )}
                          <div className="mb-1">
                            <span className="text-zinc-500">Direction: </span>
                            {request.direction || "Not specified"}
                          </div>
                          <div>
                            <span className="text-zinc-500">With LCR: </span>
                            {request.with_lcr ? "Yes" : "No"}
                          </div>
                        </div>
                      )}

                      {/* Open TT Display */}
                      {request.request_type === "open_tt" && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                          {request.destination && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Destination: </span>
                              {request.destination}
                            </div>
                          )}
                          {request.vendor_trunks && request.vendor_trunks.length > 0 && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Vendor Trunk(s): </span>
                              {request.vendor_trunks.map((vt, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}{vt.trunk}
                                </span>
                              ))}
                            </div>
                          )}
                          {request.open_by && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Open By: </span>
                              {request.open_by}
                            </div>
                          )}
                          {request.open_tt_notes && (
                            <div>
                              <span className="text-zinc-500">Notes: </span>
                              {request.open_tt_notes}
                            </div>
                          )}
                        </div>
                      )}

                      {request.response && (
                        <div className="mt-3 p-2 bg-gray-100 dark:bg-zinc-800 rounded text-sm text-gray-700 dark:text-zinc-300">
                          <strong>Response:</strong> {request.response}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
                      <span className={`text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </div>
                  
                  {/* Delete button for admins - shows for all requests in any state */}
                  {userRole === "admin" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDeleteRequest(request.id)}
                        className="border-gray-300 dark:border-zinc-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                  
                  {/* Edit/Delete buttons - only for AMs when request is pending and created by current user */}
                  {userRole === "am" && request.created_by === user.id && request.status === "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDeleteRequest(request.id)}
                        className="border-gray-300 dark:border-zinc-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                  
                  {/* View only for AMs who created the request - when not pending */}
                  {userRole === "am" && request.created_by === user.id && request.status !== "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}
                  
                  {/* View button for AMs to view other AMs' requests (not their own) */}
                  {userRole === "am" && request.created_by !== user.id && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}
                  
                  {/* Clone/Resend button for AMs to duplicate their own requests (not pending) */}
                  {userRole === "am" && request.created_by === user.id && request.status !== "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCloneRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Copy className="h-4 w-4 mr-1" /> Clone/Resend
                      </Button>
                    </div>
                  )}
                  
                  {/* Create LCR Request button for AMs - only for completed Testing requests in Voice */}
                  {userRole === "am" && request.created_by === user.id && request.status === "completed" && request.department === "voice" && (request.request_type === "testing" || request.request_type_label?.includes("Testing")) && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCreateLcrFromTesting(request)}
                        className="border-gray-300 dark:border-zinc-600 text-amber-400 hover:bg-amber-900/20 hover:text-amber-300"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Create LCR Request
                      </Button>
                    </div>
                  )}

                  {/* View/Respond buttons for NOC and Admin */}
                  {(userRole === "noc" || userRole === "admin") && request.status === "pending" && !request.claimed_by && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleClaimRequest(request)}
                        className="border-blue-600 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300"
                      >
                        Claim
                      </Button>
                    </div>
                  )}

                  {/* Show Complete/Reject only for the NOC user who claimed the request or responded to it */}
                  {(userRole === "noc" || userRole === "admin") && request.status === "in_progress" && (request.claimed_by === user.id || request.responded_by === user.id) && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleResponse(request, "complete")}
                        className="border-green-600 text-green-400 hover:bg-green-900/20 hover:text-green-300"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Complete
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleResponse(request, "reject")}
                        className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}

                  {/* View only for in_progress requests not claimed by current user */}
                  {(userRole === "noc" || userRole === "admin") && request.status === "in_progress" && request.claimed_by !== user.id && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}

                  {/* View only button for completed/rejected requests */}
                  {(userRole === "noc" || userRole === "admin") && (request.status === "completed" || request.status === "rejected") && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setIsEditMode(false);
          setEditingRequest(null);
          // Reset form when closing
          setFormData(getInitialFormData());
          // Reset trunk-specific states
          setTrunkDirection("");
          setTrunkWithLcr(true);
        }
      }}>
        <DialogContent disableOutsideClick className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit" : "New"} {displayTab.toUpperCase()} Request</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Request Type */}
            <div>
              <Label className="text-gray-500 dark:text-zinc-400">Request Type</Label>
              <Select value={formData.request_type} onValueChange={handleRequestTypeChange}>
                <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                  <SelectValue placeholder="Select request type" />
                </SelectTrigger>
                <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                  {Object.entries(REQUEST_TYPES).filter(([key, type]) => {
                    // Filter by department - use flexible matching for AMs
                    if (type.forDepartment) {
                      if (userRole === "am") {
                        // For AMs, check against their department
                        const deptMatch = type.forDepartment === "sms" ? isSmsDepartment : type.forDepartment === "voice" ? isVoiceDepartment : false;
                        if (!deptMatch) return false;
                      } else {
                        // For admins, check against activeTab
                        if (type.forDepartment !== activeTab) return false;
                      }
                    }
                    return true;
                  }).map(([key, type]) => (
                    <SelectItem key={key} value={key} className="text-gray-900 dark:text-white data-[highlighted]:bg-white data-[highlighted]:text-black">
                      <div className="text-left data-[highlighted]:text-black">
                        <div className="font-medium text-left">{type.label}</div>
                        <div className="text-xs text-gray-500 dark:text-zinc-400 text-left data-[highlighted]:text-black">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority - Show only when request type is selected */}
            {formData.request_type && (
              <div>
                <Label className="text-gray-500 dark:text-zinc-400">Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                    <SelectValue className="text-gray-900 dark:text-white" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-gray-900 dark:text-white">
                        <span>{p.value}</span>
                        <span className="text-gray-500 dark:text-zinc-400 text-xs ml-2">({p.description})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Ticket # - Optional field for linking to a ticket */}
            {formData.request_type && (
              <div>
                <Label className="text-gray-500 dark:text-zinc-400">Ticket # (Optional)</Label>
                <Input
                  value={formData.ticket_id || ""}
                  onChange={(e) => setFormData({ ...formData, ticket_id: e.target.value })}
                  placeholder="Enter related ticket number"
                  className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {/* Customer - Show only when request type is selected and not for Testing/Investigation/Translation/LCR/Trunk Request/Open TT */}
            {formData.request_type && formData.request_type !== "testing" && formData.request_type !== "investigation" && formData.request_type !== "translation" && formData.request_type !== "lcr" && formData.request_type !== "trunk_request_sms" && formData.request_type !== "trunk_request_voice" && formData.request_type !== "open_tt" && (
              <div>
                <Label className="text-gray-500 dark:text-zinc-400">
                  {formData.request_type === "translation" || formData.request_type === "rating_routing" ? "Customer(s)" : "Customer"}
                </Label>
                {formData.request_type === "rating_routing" ? (
                  <MultiSelect
                    options={enterprises
                      .filter(e => e.enterprise_type === displayTab || e.enterprise_type === "all")
                      .map(e => ({ id: e.id, label: e.name }))
                    }
                    value={formData.customer_ids || []}
                    onValueChange={(newIds) => {
                      setFormData({
                        ...formData,
                        customer_ids: newIds,
                        customer: newIds.map(id => enterprises.find(e => e.id === id)?.name).filter(Boolean).join(", "),
                        customer_trunks: newIds.length > 0 ? formData.customer_trunks : { "": [{ destination: "", rate: "" }] }
                      });
                    }}
                    placeholder="Select enterprises..."
                    searchPlaceholder="Search enterprises..."
                  />
                ) : (
                  <Input
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder={formData.request_type === "translation" ? "Customer name" : "Customer name"}
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                )}
              </div>
            )}

            {/* Rating/Routing Fields - Compact per-customer-trunk design */}
            {formData.request_type === "rating_routing" && (
              <>
                {/* Common Routing Option */}
                <div className="mb-4 p-3 bg-gray-100/50 dark:bg-zinc-800/50 rounded-lg border border-gray-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-gray-900 dark:text-white text-sm font-medium">Common Routing</span>
                      <p className="text-zinc-500 text-xs mt-1">Use a single routing plan for all customer trunks</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.use_common_routing || false}
                        onChange={(e) => setFormData({ ...formData, use_common_routing: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black dark:peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                    </label>
                  </div>
                  
                  {/* Common Routing Plan Section - Shown when enabled */}
                  {formData.use_common_routing && (
                    <div className="mt-4 pt-4 border-t border-gray-300 dark:border-zinc-600">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-4 bg-blue-500 rounded"></div>
                        <span className="text-blue-300 font-medium text-sm">Common Routing Plan</span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Common Route Rules */}
                        {(formData.common_route_rules || []).map((rule, ruleIndex) => {
                          const ruleVendors = rule.vendors || [];
                          const hasMultipleVendors = ruleVendors.filter(v => v.trunk).length > 1;
                          const percentageSum = ruleVendors.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
                          const isPercentageValid = percentageSum === 100;
                          
                          return (
                            <div key={ruleIndex} className="bg-white/60 dark:bg-zinc-900/60 rounded-lg p-3 border border-blue-600/30">
                              {/* Route Rule Header */}
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-blue-300 text-xs font-bold bg-blue-900/40 px-2 py-1 rounded">Route Rule {ruleIndex + 1}</span>
                                  {(formData.common_route_rules || []).length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeCommonRouteRule(ruleIndex)}
                                      className="h-5 w-5 p-0 text-zinc-500 hover:text-red-400"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                                {/* Priority and Destination fields */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500 dark:text-zinc-400 text-xs whitespace-nowrap">Priority:</span>
                                    <Input
                                      type="number"
                                      value={rule.priority || 1}
                                      onChange={(e) => updateCommonRouteRule(ruleIndex, "priority", parseInt(e.target.value) || 1)}
                                      className="bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white text-xs h-7 w-14"
                                      min={1}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500 dark:text-zinc-400 text-xs whitespace-nowrap">Dest:</span>
                                    <SearchableSelect
                                      options={[{ value: "All", label: "All" }, { value: "Rest", label: "Rest" }, ...getAllDestinations().map(d => ({ value: d, label: d }))]}
                                      value={rule.destination || ""}
                                      onChange={(value) => updateCommonRouteRule(ruleIndex, "destination", value)}
                                      placeholder="Select"
                                      className="text-xs flex-1"
                                    />
                                  </div>
                                </div>
                              </div>
                              
                              {/* Vendors in this Route Rule */}
                              <div className="space-y-2 mb-3">
                                {ruleVendors.map((vendor, vendorIndex) => (
                                  <div key={vendorIndex} className="bg-gray-100/60 dark:bg-zinc-800/60 rounded-lg p-2 border border-gray-200/30 dark:border-zinc-700/30">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-zinc-500 text-xs">Vendor {vendorIndex + 1}</span>
                                      {ruleVendors.length > 1 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeVendorFromCommonRule(ruleIndex, vendorIndex)}
                                          className="h-4 w-4 p-0 text-zinc-500 hover:text-red-400"
                                        >
                                          <X className="h-2 w-2" />
                                        </Button>
                                      )}
                                    </div>
                                    
                                    {/* Vendor Trunk Selection */}
                                    <div className="mb-2">
                                      <SearchableSelect
                                        options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                                        value={vendor.trunk || ""}
                                        onChange={(value) => updateVendorInCommonRule(ruleIndex, vendorIndex, "trunk", value)}
                                        placeholder="Select vendor trunk"
                                        className="text-xs"
                                      />
                                    </div>
                                    
                                    {/* Cost Configuration - Organized Row */}
                                    <div className="flex items-center gap-2">
                                      <Select
                                        value={vendor.cost_type || "fixed"}
                                        onValueChange={(value) => updateVendorInCommonRule(ruleIndex, vendorIndex, "cost_type", value)}
                                      >
                                        <SelectTrigger className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-16">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                                          <SelectItem value="fixed" className="text-gray-900 dark:text-white text-xs">Fixed</SelectItem>
                                          <SelectItem value="range" className="text-gray-900 dark:text-white text-xs">Range</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {vendor.cost_type === "fixed" ? (
                                        <Input
                                          value={vendor.cost_min || ""}
                                          onChange={(e) => updateVendorInCommonRule(ruleIndex, vendorIndex, "cost_min", e.target.value)}
                                          placeholder="EUR"
                                          className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 flex-1"
                                        />
                                      ) : (
                                        <div className="flex items-center gap-1 flex-1">
                                          <Input
                                            value={vendor.cost_min || ""}
                                            onChange={(e) => updateVendorInCommonRule(ruleIndex, vendorIndex, "cost_min", e.target.value)}
                                            placeholder="Min"
                                            className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                          />
                                          <span className="text-zinc-500 text-xs">-</span>
                                          <Input
                                            value={vendor.cost_max || ""}
                                            onChange={(e) => updateVendorInCommonRule(ruleIndex, vendorIndex, "cost_max", e.target.value)}
                                            placeholder="Max"
                                            className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                          />
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Percentage - Only show when multiple vendors */}
                                    {hasMultipleVendors && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <span className="text-zinc-500 text-xs w-16">Percentage:</span>
                                        <div className="flex items-center gap-1 flex-1">
                                          <Input
                                            value={vendor.percentage || ""}
                                            onChange={(e) => updateVendorInCommonRule(ruleIndex, vendorIndex, "percentage", e.target.value)}
                                            placeholder="0"
                                            className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                          />
                                          <span className="text-zinc-500 text-xs">%</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                
                                {/* Add Vendor to this Route Rule */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addVendorToCommonRule(ruleIndex)}
                                  className="text-xs text-blue-400 hover:text-blue-300 w-full"
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add Vendor
                                </Button>
                                
                                {/* Percentage validation */}
                                {hasMultipleVendors && (
                                  <div className={`text-xs text-center py-1 rounded ${isPercentageValid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                    Total: {percentageSum}% {isPercentageValid ? '✓' : '(must equal 100%)'}
                                  </div>
                                )}
                              </div>
                              
                              {/* Advanced Settings */}
                              <div className="border-t border-gray-200/50 dark:border-zinc-700/50 pt-2 mt-2">
                                <div className="text-xs text-zinc-500 mb-2">Advanced Settings</div>
                                <div className="flex flex-wrap gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      id={`common_loss_${ruleIndex}`}
                                      checked={rule.by_loss || false}
                                      onChange={(e) => updateCommonRouteRule(ruleIndex, "by_loss", e.target.checked)}
                                      className="w-3 h-3 accent-purple-500 rounded"
                                    />
                                    <label htmlFor={`common_loss_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">By Loss</label>
                                  </div>
                                  {displayTab === "sms" && (
                                    <>
                                      {/* MNP/HLR - Mutually Exclusive Checkboxes */}
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="checkbox"
                                          id={`common_mnp_${ruleIndex}`}
                                          checked={!!rule.mnp_hlr_type && rule.mnp_hlr_type === "mnp"}
                                          onChange={() => {
                                            const newRules = [...(formData.common_route_rules || [])];
                                            const currentMnpHlrType = newRules[ruleIndex].mnp_hlr_type;
                                            // If already MNP, uncheck it (toggle off)
                                            // If something else is checked, switch to MNP
                                            // If nothing is checked, tick MNP
                                            const newMnpHlrType = currentMnpHlrType === "mnp" ? "" : "mnp";
                                            newRules[ruleIndex] = {
                                              ...newRules[ruleIndex],
                                              mnp_hlr_type: newMnpHlrType,
                                              enable_mnp_hlr: newMnpHlrType !== ""
                                            };
                                            setFormData({ ...formData, common_route_rules: newRules });
                                          }}
                                          className="w-3 h-3 accent-cyan-500 rounded"
                                        />
                                        <label htmlFor={`common_mnp_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">MNP</label>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="checkbox"
                                          id={`common_hlr_${ruleIndex}`}
                                          checked={!!rule.mnp_hlr_type && rule.mnp_hlr_type === "hlr"}
                                          onChange={() => {
                                            const newRules = [...(formData.common_route_rules || [])];
                                            const currentMnpHlrType = newRules[ruleIndex].mnp_hlr_type;
                                            // If already HLR, uncheck it (toggle off)
                                            // If something else is checked, switch to HLR
                                            // If nothing is checked, tick HLR
                                            const newMnpHlrType = currentMnpHlrType === "hlr" ? "" : "hlr";
                                            newRules[ruleIndex] = {
                                              ...newRules[ruleIndex],
                                              mnp_hlr_type: newMnpHlrType,
                                              enable_mnp_hlr: newMnpHlrType !== ""
                                            };
                                            setFormData({ ...formData, common_route_rules: newRules });
                                          }}
                                          className="w-3 h-3 accent-cyan-500 rounded"
                                        />
                                        <label htmlFor={`common_hlr_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">HLR</label>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {/* Note field */}
                                <div className="mt-2">
                                  <Input
                                    value={rule.note || ""}
                                    onChange={(e) => updateCommonRouteRule(ruleIndex, "note", e.target.value)}
                                    placeholder="Add note for this route rule (optional)"
                                    className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Add Route Rule dropdown */}
                        <div className="relative group">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs w-full border-dashed border-blue-600/50 text-blue-400 hover:text-blue-300 hover:border-blue-500"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Route Rule
                          </Button>
                          <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                            <button
                              onClick={addCommonRouteRule}
                              className="w-full px-3 py-2 text-xs text-left text-blue-400 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-t-lg"
                            >
                              New Route Rule
                            </button>
                            <button
                              onClick={() => {
                                const rules = formData.common_route_rules || [];
                                if (rules.length > 0) {
                                  cloneCommonRouteRule(rules.length - 1);
                                } else {
                                  addCommonRouteRule();
                                }
                              }}
                              className="w-full px-3 py-2 text-xs text-left text-cyan-400 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-b-lg"
                            >
                              Clone Last Route Rule
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Customer Trunk Configurations - Each with Rating Plan and Routing Plan */}
                <div className="space-y-3">
                  {(formData.customer_trunk_configs || []).map((config, configIndex) => {
                    const routeRules = config.routing?.route_rules || [];
                    const destRates = config.rating_pairs || [{ destination: "", rate: "" }];
                    const showRouting = !formData.use_common_routing;
                    
                    return (
                      <div key={configIndex} className="border border-amber-600/30 rounded-lg p-4 bg-white/80 dark:bg-zinc-900/80">
                        {/* Header with customer trunk selection and remove button */}
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-amber-400 font-medium">Customer Trunk {configIndex + 1}</span>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => removeCustomerTrunkConfig(configIndex)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        {/* Customer Trunk Selection */}
                        <Select 
                          value={config.trunk || ""} 
                          onValueChange={(value) => updateCustomerTrunkConfig(configIndex, "trunk", value)}
                          required
                        >
                          <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white mb-4">
                            <SelectValue placeholder="Select customer trunk" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                            {(formData.customer_ids || []).flatMap(customerId => 
                              (enterprises.find(e => e.id === customerId)?.customer_trunks || []).map((tName) => (
                                <SelectItem key={`${customerId}-${tName}`} value={tName} className="text-gray-900 dark:text-white">
                                  {enterprises.find(e => e.id === customerId)?.name} - {tName}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        
                        {/* Two-column layout: Rating Plan | Routing Plan */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Rating Plan Section - Compact with multiple destination-rate pairs */}
                          <div className="bg-gray-100/40 dark:bg-zinc-800/40 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-1 h-4 bg-amber-500 rounded"></div>
                              <span className="text-amber-300 font-medium text-sm">Rating Plan</span>
                            </div>
                            <div className="space-y-2">
                              {/* Destination-Rate pairs */}
                              {(destRates || []).map((pair, pairIndex) => (
                                <div key={pairIndex} className="flex items-center gap-2">
                                  <Input
                                    value={pair.destination || ""}
                                    onChange={(e) => {
                                      const newPairs = [...(config.rating_pairs || [{ destination: "", rate: "" }])];
                                      newPairs[pairIndex] = { ...newPairs[pairIndex], destination: e.target.value };
                                      updateCustomerTrunkConfig(configIndex, "rating_pairs", newPairs);
                                    }}
                                    placeholder="Destination"
                                    className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-8 flex-1"
                                  />
                                  <Input
                                    value={pair.rate || ""}
                                    onChange={(e) => {
                                      const newPairs = [...(config.rating_pairs || [{ destination: "", rate: "" }])];
                                      newPairs[pairIndex] = { ...newPairs[pairIndex], rate: e.target.value };
                                      updateCustomerTrunkConfig(configIndex, "rating_pairs", newPairs);
                                    }}
                                    placeholder="Rate"
                                    className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-8 w-16"
                                  />
                                  <span className="text-zinc-500 text-xs">EUR</span>
                                  {destRates.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newPairs = destRates.filter((_, i) => i !== pairIndex);
                                        updateCustomerTrunkConfig(configIndex, "rating_pairs", newPairs);
                                      }}
                                      className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {/* Add Destination-Rate button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newPairs = [...(config.rating_pairs || [{ destination: "", rate: "" }]), { destination: "", rate: "" }];
                                  updateCustomerTrunkConfig(configIndex, "rating_pairs", newPairs);
                                }}
                                className="text-xs text-amber-400 hover:text-amber-300 w-full"
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add Destination-Rate
                              </Button>
                            </div>
                          </div>
                          
                          {/* Routing Plan Section - With Route Rules - Hidden when using Common Routing */}
                          {showRouting && (
                            <div className="bg-gray-100/40 dark:bg-zinc-800/40 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-1 h-4 bg-blue-500 rounded"></div>
                              <span className="text-blue-300 font-medium text-sm">Routing Plan</span>
                            </div>
                            
                            <div className="space-y-3">
                              {/* Route Rules */}
                              {(config.routing?.route_rules || []).map((rule, ruleIndex) => {
                                const ruleVendors = rule.vendors || [];
                                const hasMultipleVendors = ruleVendors.filter(v => v.trunk).length > 1;
                                const percentageSum = ruleVendors.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
                                const isPercentageValid = percentageSum === 100;
                                
                                return (
                                  <div key={ruleIndex} className="bg-white/60 dark:bg-zinc-900/60 rounded-lg p-3 border border-blue-600/30">
                                    {/* Route Rule Header */}
                                    <div className="mb-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-blue-300 text-xs font-bold bg-blue-900/40 px-2 py-1 rounded">Route Rule {ruleIndex + 1}</span>
                                        {(config.routing?.route_rules || []).length > 1 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeRouteRule(configIndex, ruleIndex)}
                                            className="h-5 w-5 p-0 text-zinc-500 hover:text-red-400"
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                      {/* Priority and Destination fields */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-500 dark:text-zinc-400 text-xs whitespace-nowrap">Priority:</span>
                                          <Input
                                            type="number"
                                            value={rule.priority || 1}
                                            onChange={(e) => updateRouteRule(configIndex, ruleIndex, "priority", parseInt(e.target.value) || 1)}
                                            className="bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-white text-xs h-7 w-14"
                                            min={1}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-500 dark:text-zinc-400 text-xs whitespace-nowrap">Dest:</span>
                                          <SearchableSelect
                                            options={[{ value: "All", label: "All" }, { value: "Rest", label: "Rest" }, ...(config.rating_pairs || []).filter(p => p.destination).map(p => ({ value: p.destination, label: p.destination }))]}
                                            value={rule.destination || ""}
                                            onChange={(value) => updateRouteRule(configIndex, ruleIndex, "destination", value)}
                                            placeholder="Select"
                                            className="text-xs flex-1"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Vendors in this Route Rule */}
                                    <div className="space-y-2 mb-3">
                                      {ruleVendors.map((vendor, vendorIndex) => (
                                        <div key={vendorIndex} className="bg-gray-100/60 dark:bg-zinc-800/60 rounded-lg p-2 border border-gray-200/30 dark:border-zinc-700/30">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-zinc-500 text-xs">Vendor {vendorIndex + 1}</span>
                                            {ruleVendors.length > 1 && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeVendorFromRule(configIndex, ruleIndex, vendorIndex)}
                                                className="h-4 w-4 p-0 text-zinc-500 hover:text-red-400"
                                              >
                                                <X className="h-2 w-2" />
                                              </Button>
                                            )}
                                          </div>
                                          
                                          {/* Vendor Trunk Selection */}
                                          <div className="mb-2">
                                            <SearchableSelect
                                              options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                                              value={vendor.trunk || ""}
                                              onChange={(value) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "trunk", value)}
                                              placeholder="Select vendor trunk"
                                              className="text-xs"
                                            />
                                          </div>
                                          
                                          {/* Cost Configuration - Organized Row */}
                                          <div className="flex items-center gap-2">
                                            <Select
                                              value={vendor.cost_type || "fixed"}
                                              onValueChange={(value) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "cost_type", value)}
                                            >
                                              <SelectTrigger className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-16">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                                                <SelectItem value="fixed" className="text-gray-900 dark:text-white text-xs">Fixed</SelectItem>
                                                <SelectItem value="range" className="text-gray-900 dark:text-white text-xs">Range</SelectItem>
                                              </SelectContent>
                                            </Select>
                                            {vendor.cost_type === "fixed" ? (
                                              <Input
                                                value={vendor.cost_min || ""}
                                                onChange={(e) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "cost_min", e.target.value)}
                                                placeholder="EUR"
                                                className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 flex-1"
                                              />
                                            ) : (
                                              <div className="flex items-center gap-1 flex-1">
                                                <Input
                                                  value={vendor.cost_min || ""}
                                                  onChange={(e) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "cost_min", e.target.value)}
                                                  placeholder="Min"
                                                  className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                                />
                                                <span className="text-zinc-500 text-xs">-</span>
                                                <Input
                                                  value={vendor.cost_max || ""}
                                                  onChange={(e) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "cost_max", e.target.value)}
                                                  placeholder="Max"
                                                  className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                                />
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Percentage - Only show when multiple vendors */}
                                          {hasMultipleVendors && (
                                            <div className="flex items-center gap-2 mt-2">
                                              <span className="text-zinc-500 text-xs w-16">Percentage:</span>
                                              <div className="flex items-center gap-1 flex-1">
                                                <Input
                                                  value={vendor.percentage || ""}
                                                  onChange={(e) => updateVendorInRule(configIndex, ruleIndex, vendorIndex, "percentage", e.target.value)}
                                                  placeholder="0"
                                                  className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7 w-14"
                                                />
                                                <span className="text-zinc-500 text-xs">%</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      
                                      {/* Add Vendor to this Route Rule */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => addVendorToRule(configIndex, ruleIndex)}
                                        className="text-xs text-blue-400 hover:text-blue-300 w-full"
                                      >
                                        <Plus className="h-3 w-3 mr-1" /> Add Vendor
                                      </Button>
                                      
                                      {/* Percentage validation */}
                                      {hasMultipleVendors && (
                                        <div className={`text-xs text-center py-1 rounded ${isPercentageValid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                          Total: {percentageSum}% {isPercentageValid ? '✓' : '(must equal 100%)'}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Route Rule Advanced Settings */}
                                    <div className="border-t border-gray-200/50 dark:border-zinc-700/50 pt-2 mt-2">
                                      <div className="text-xs text-zinc-500 mb-2">Advanced Settings</div>
                                      <div className="flex flex-wrap gap-3">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="checkbox"
                                            id={`rule_loss_${configIndex}_${ruleIndex}`}
                                            checked={rule.by_loss || false}
                                            onChange={(e) => updateRouteRule(configIndex, ruleIndex, "by_loss", e.target.checked)}
                                            className="w-3 h-3 accent-purple-500 rounded"
                                          />
                                          <label htmlFor={`rule_loss_${configIndex}_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">By Loss</label>
                                        </div>
                                        {displayTab === "sms" && (
                                          <>
                                            {/* MNP/HLR - Mutually Exclusive Checkboxes */}
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="checkbox"
                                                id={`rule_mnp_${configIndex}_${ruleIndex}`}
                                                checked={!!rule.mnp_hlr_type && rule.mnp_hlr_type === "mnp"}
                                                onChange={() => {
                                                  const newConfigs = formData.customer_trunk_configs ? [...formData.customer_trunk_configs] : [];
                                                  const config = newConfigs[configIndex];
                                                  if (!config || !config.routing?.route_rules) return;
                                                  const currentMnpHlrType = config.routing.route_rules[ruleIndex]?.mnp_hlr_type || "";
                                                  const newMnpHlrType = currentMnpHlrType === "mnp" ? "" : "mnp";
                                                  newConfigs[configIndex] = {
                                                    ...config,
                                                    routing: {
                                                      ...config.routing,
                                                      route_rules: config.routing.route_rules.map((r, i) => i === ruleIndex ? {
                                                        ...r,
                                                        mnp_hlr_type: newMnpHlrType,
                                                        enable_mnp_hlr: newMnpHlrType !== ""
                                                      } : r)
                                                    }
                                                  };
                                                  setFormData({ ...formData, customer_trunk_configs: newConfigs });
                                                }}
                                                className="w-3 h-3 accent-cyan-500 rounded"
                                              />
                                              <label htmlFor={`rule_mnp_${configIndex}_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">MNP</label>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="checkbox"
                                                id={`rule_hlr_${configIndex}_${ruleIndex}`}
                                                checked={!!rule.mnp_hlr_type && rule.mnp_hlr_type === "hlr"}
                                                onChange={() => {
                                                  const newConfigs = formData.customer_trunk_configs ? [...formData.customer_trunk_configs] : [];
                                                  const config = newConfigs[configIndex];
                                                  if (!config || !config.routing?.route_rules) return;
                                                  const currentMnpHlrType = config.routing.route_rules[ruleIndex]?.mnp_hlr_type || "";
                                                  const newMnpHlrType = currentMnpHlrType === "hlr" ? "" : "hlr";
                                                  newConfigs[configIndex] = {
                                                    ...config,
                                                    routing: {
                                                      ...config.routing,
                                                      route_rules: config.routing.route_rules.map((r, i) => i === ruleIndex ? {
                                                        ...r,
                                                        mnp_hlr_type: newMnpHlrType,
                                                        enable_mnp_hlr: newMnpHlrType !== ""
                                                      } : r)
                                                    }
                                                  };
                                                  setFormData({ ...formData, customer_trunk_configs: newConfigs });
                                                }}
                                                className="w-3 h-3 accent-cyan-500 rounded"
                                              />
                                              <label htmlFor={`rule_hlr_${configIndex}_${ruleIndex}`} className="text-gray-500 dark:text-zinc-400 text-xs cursor-pointer">HLR</label>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      {/* Note field for Route Rule */}
                                      <div className="mt-2">
                                        <Input
                                          value={rule.note || ""}
                                          onChange={(e) => updateRouteRule(configIndex, ruleIndex, "note", e.target.value)}
                                          placeholder="Add note for this route rule (optional)"
                                          className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white text-xs h-7"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              
                              {/* Add Route Rule dropdown */}
                              <div className="relative group">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs w-full border-dashed border-blue-600/50 text-blue-400 hover:text-blue-300 hover:border-blue-500"
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add Route Rule
                                </Button>
                                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                                  <button
                                    onClick={() => addRouteRule(configIndex)}
                                    className="w-full px-3 py-2 text-xs text-left text-blue-400 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-t-lg"
                                  >
                                    New Route Rule
                                  </button>
                                  <button
                                    onClick={() => {
                                      const rules = config.routing?.route_rules || [];
                                      if (rules.length > 0) {
                                        cloneRouteRule(configIndex, rules.length - 1);
                                      } else {
                                        addRouteRule(configIndex);
                                      }
                                    }}
                                    className="w-full px-3 py-2 text-xs text-left text-cyan-400 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-b-lg"
                                  >
                                    Clone Last Route Rule
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Add Customer Trunk Config button */}
                <Button variant="outline" size="sm" onClick={addCustomerTrunkConfig} className="mt-2">
                  <Plus className="h-4 w-4 mr-1" /> Add Customer Trunk
                </Button>
              </>
            )}

            {/* Testing Fields */}
            {formData.request_type === "testing" && (
              <>
                {/* Test Type - Only show for Voice */}
                {displayTab === "voice" && (
                  <div>
                    <Label className="text-gray-500 dark:text-zinc-400">Test Type</Label>
                    <Select value={formData.test_type || ""} onValueChange={(v) => setFormData({ ...formData, test_type: v })}>
                      <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                        <SelectValue placeholder="Select test type" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                        <SelectItem value="tool_test" className="text-gray-900 dark:text-white">Tool Test</SelectItem>
                        <SelectItem value="manual_test" className="text-gray-900 dark:text-white">Manual Test</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Test Description - Only show for Voice (optional) */}
                {displayTab === "voice" && (
                  <div>
                    <Label className="text-gray-500 dark:text-zinc-400">Test Description (Optional)</Label>
                    <Textarea
                      value={formData.test_description || ""}
                      onChange={(e) => setFormData({ ...formData, test_description: e.target.value })}
                      placeholder="Describe the test to be performed..."
                      rows={2}
                      className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Destination(s) (e.g., Country - Network)</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="Destinations (e.g., Country - Network) (comma separated for multiple)"
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunk(s) to Test</Label>
                  <p className="text-xs text-zinc-500 mb-2">At least one vendor trunk is required</p>
                  {formData.vendor_trunks.map((trunk, index) => (
                    <div key={index} className="mb-4 p-3 bg-gray-100/50 dark:bg-zinc-800/50 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <div className="flex gap-2 mb-2">
                        <SearchableSelect
                          options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                          value={trunk.trunk}
                          onChange={(value) => handleVendorTrunkChange(index, "trunk", value)}
                          placeholder="Select vendor trunk"
                          isRequired={true}
                          className="flex-1"
                        />
                        {formData.vendor_trunks.length > 1 && (
                          <Button variant="destructive" size="sm" onClick={() => removeVendorTrunk(index)}>X</Button>
                        )}
                      </div>
                      
                      {/* SMS: SID/Content Pairs - Voice: ANI/A-Numbers */}
                      {displayTab === "sms" ? (
                        /* SID/Content Pairs for SMS */
                        <div className="ml-4 space-y-2">
                          <Label className="text-zinc-500 text-xs">SID/Content Pairs</Label>
                          {(trunk.sid_content_pairs || []).map((pair, pairIndex) => (
                            <div key={pairIndex} className="flex gap-2">
                              <Input
                                value={pair.sid}
                                onChange={(e) => handleSidContentPairChange(index, pairIndex, "sid", e.target.value)}
                                placeholder="SID"
                                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 w-32"
                              />
                              <Input
                                value={pair.content}
                                onChange={(e) => handleSidContentPairChange(index, pairIndex, "content", e.target.value)}
                                placeholder="Content"
                                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 flex-1"
                              />
                              {(trunk.sid_content_pairs || []).length > 1 && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => removeSidContentPair(index, pairIndex)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  X
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => addSidContentPair(index)}
                            className="text-gray-500 dark:text-zinc-400"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add SID/Content Pair
                          </Button>
                        </div>
                      ) : (
                        /* ANI/A-Numbers for Voice */
                        <div className="ml-4 space-y-2">
                          <Label className="text-zinc-500 text-xs">ANI/A-Numbers (Optional)</Label>
                          {(trunk.ani_numbers || []).map((ani, aniIndex) => (
                            <div key={aniIndex} className="flex gap-2">
                              <Input
                                value={ani}
                                onChange={(e) => handleAniNumberChange(index, aniIndex, e.target.value)}
                                placeholder="e.g., +1234567890"
                                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 flex-1"
                              />
                              {(trunk.ani_numbers || []).length > 1 && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => removeAniNumber(index, aniIndex)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  X
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => addAniNumber(index)}
                            className="text-gray-500 dark:text-zinc-400"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add ANI/A-Number
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addVendorTrunk} className="mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Vendor Trunk
                  </Button>
                </div>
              </>
            )}

            {/* Translation Fields */}
            {formData.request_type === "translation" && (
              <>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Enterprise</Label>
                  <SearchableSelect 
                    options={enterprises.filter(e => e.enterprise_type === displayTab || e.enterprise_type === "all").map(e => ({ value: e.id, label: e.name }))} 
                    value={formData.customer_id} 
                    onChange={(value) => {
                      setFormData({ 
                        ...formData, 
                        customer_id: value,
                        customer: enterprises.find(e => e.id === value)?.name || "",
                        trunk_name: ""
                      });
                    }} 
                    placeholder="Search enterprise..." 
                    isRequired={true}
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Translation Type</Label>
                  <Select value={formData.translation_type} onValueChange={(v) => setFormData({ ...formData, translation_type: v })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="sid_change">SID Change</SelectItem>
                      <SelectItem value="content_change">Content Change</SelectItem>
                      <SelectItem value="sid_content_change">SID & Content Change</SelectItem>
                      <SelectItem value="remove">Remove from Content</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Trunk Type</Label>
                  <Select value={formData.trunk_type} onValueChange={(v) => setFormData({ ...formData, trunk_type: v, trunk_name: "" })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectValue placeholder="Select trunk type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="customer">Customer Trunk</SelectItem>
                      <SelectItem value="vendor">Vendor Trunk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Trunk Name *</Label>
                  <Select value={formData.trunk_name || ""} onValueChange={(v) => setFormData({ ...formData, trunk_name: v })} required disabled={!formData.customer_id || !formData.trunk_type}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder={formData.trunk_type ? "Select trunk" : "Select trunk type first"} />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      {(formData.trunk_type === "customer" 
                        ? enterprises.find(e => e.id === formData.customer_id)?.customer_trunks || []
                        : formData.trunk_type === "vendor"
                          ? vendorTrunkOptions.filter(vt => {
                              // Get vendor trunks for this enterprise
                              const ent = enterprises.find(e => e.id === formData.customer_id);
                              return ent?.vendor_trunks?.includes(vt);
                            })
                          : []
                      ).map((trunk) => (
                        <SelectItem key={trunk} value={trunk} className="text-gray-900 dark:text-white">{trunk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.translation_type === "sid_change" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">Old SID</Label>
                      <Input
                        value={formData.old_value}
                        onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                        placeholder="Current SID"
                        className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">New SID</Label>
                      <Input
                        value={formData.new_value}
                        onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                        placeholder="New SID"
                        className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                      />
                    </div>
                  </div>
                )}
                {formData.translation_type === "content_change" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">Old Content</Label>
                      <Input
                        value={formData.old_value}
                        onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                        placeholder="Current Content"
                        className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">New Content</Label>
                      <Input
                        value={formData.new_value}
                        onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                        placeholder="New Content"
                        className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                      />
                    </div>
                  </div>
                )}
                {formData.translation_type === "sid_content_change" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-500 dark:text-zinc-400">Old SID</Label>
                        <Input
                          value={formData.old_sid}
                          onChange={(e) => setFormData({ ...formData, old_sid: e.target.value })}
                          placeholder="Current SID"
                          className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                        />
                      </div>
                      <div>
                        <Label className="text-gray-500 dark:text-zinc-400">New SID</Label>
                        <Input
                          value={formData.new_sid}
                          onChange={(e) => setFormData({ ...formData, new_sid: e.target.value })}
                          placeholder="New SID"
                          className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label className="text-gray-500 dark:text-zinc-400">Old Content</Label>
                        <Input
                          value={formData.old_value}
                          onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                          placeholder="Current Content"
                          className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                        />
                      </div>
                      <div>
                        <Label className="text-gray-500 dark:text-zinc-400">New Content</Label>
                        <Input
                          value={formData.new_value}
                          onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                          placeholder="New Content"
                          className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                        />
                      </div>
                    </div>
                  </>
                )}
                {formData.translation_type === "remove" && (
                  <div>
                    <Label className="text-gray-500 dark:text-zinc-400">Word to Remove</Label>
                    <Input
                      value={formData.word_to_remove}
                      onChange={(e) => setFormData({ ...formData, word_to_remove: e.target.value })}
                      placeholder="Word/phrase to remove from content"
                      className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.translation_destination}
                    onChange={(e) => setFormData({ ...formData, translation_destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                </div>
              </>
            )}

            {/* Investigation Fields */}
            {formData.request_type === "investigation" && (
              <>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Enterprise</Label>
                  <SearchableSelect 
                    options={enterprises.filter(e => e.enterprise_type === displayTab || e.enterprise_type === "all").map(e => ({ value: e.id, label: e.name }))} 
                    value={formData.customer_id} 
                    onChange={(value) => {
                      setFormData({ 
                        ...formData, 
                        customer_id: value,
                        customer: enterprises.find(e => e.id === value)?.name || "",
                        customer_trunk: ""
                      });
                    }} 
                    placeholder="Search enterprise..." 
                    isRequired={true}
                  />
                </div>
                <div>
                  <IssueTypeSelect
                    selectedTypes={formData.issue_types || []}
                    otherText={formData.issue_other || ""}
                    onTypesChange={(types) => setFormData({ ...formData, issue_types: types })}
                    onOtherChange={(other) => setFormData({ ...formData, issue_other: other })}
                    ticketType={displayTab}
                    disabled={false}
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Customer Trunk *</Label>
                  <Select value={formData.customer_trunk || ""} onValueChange={(value) => setFormData({ ...formData, customer_trunk: value })} required disabled={!formData.customer_id}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder={formData.customer_id ? "Select customer trunk" : "Select customer first"} />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      {(formData.customer_id 
                        ? enterprises.find(e => e.id === formData.customer_id)?.customer_trunks || []
                        : []
                      ).map((trunk) => (
                        <SelectItem key={trunk} value={trunk} className="text-gray-900 dark:text-white">{trunk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.investigation_destination}
                    onChange={(e) => setFormData({ ...formData, investigation_destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Issue Description</Label>
                  <Textarea
                    value={formData.issue_description}
                    onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                    placeholder="Describe the issue in detail..."
                    rows={3}
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                </div>
              </>
            )}

            {/* LCR Fields - Voice Only */}
            {formData.request_type === "lcr" && (
              <>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Which LCR (PRM, STD or CC)</Label>
                  <Select value={formData.lcr_type} onValueChange={(v) => setFormData({ ...formData, lcr_type: v })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select LCR type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="PRM" className="text-gray-900 dark:text-white">PRM</SelectItem>
                      <SelectItem value="STD" className="text-gray-900 dark:text-white">STD</SelectItem>
                      <SelectItem value="CC" className="text-gray-900 dark:text-white">CC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Change</Label>
                  <Select value={formData.lcr_change} onValueChange={(v) => setFormData({ ...formData, lcr_change: v })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select change type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="add" className="text-gray-900 dark:text-white">Add</SelectItem>
                      <SelectItem value="drop" className="text-gray-900 dark:text-white">Drop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunk(s) *</Label>
                  <p className="text-xs text-zinc-500 mb-2">At least one vendor trunk is required</p>
                  {formData.vendor_trunks.map((trunk, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <SearchableSelect
                        options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                        value={trunk.trunk}
                        onChange={(value) => handleVendorTrunkChange(index, "trunk", value)}
                        placeholder="Select vendor trunk"
                        isRequired={true}
                        className="flex-1"
                      />
                      {formData.vendor_trunks.length > 1 && (
                        <Button variant="destructive" size="sm" onClick={() => removeVendorTrunk(index)}>X</Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addVendorTrunk} className="mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Vendor Trunk
                  </Button>
                </div>
              </>
            )}

            {/* New Trunk Request Fields - SMS */}
            {(formData.request_type === "trunk_request_sms" || formData.request_type === "trunk_request_voice") && (
              <>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Customer(s)</Label>
                  <MultiSelect
                    options={enterprises
                      .filter(e => e.enterprise_type === displayTab || e.enterprise_type === "all")
                      .map(e => ({ id: e.id, label: e.name }))
                    }
                    value={formData.customer_ids || []}
                    onValueChange={(newIds) => {
                      setFormData({
                        ...formData,
                        customer_ids: newIds,
                        customer: newIds.map(id => enterprises.find(e => e.id === id)?.name).filter(Boolean).join(", ")
                      });
                    }}
                    placeholder="Select enterprises..."
                    searchPlaceholder="Search enterprises..."
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Trunk Type</Label>
                  <Select value={formData.trunk_type} onValueChange={(v) => setFormData({ ...formData, trunk_type: v })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select trunk type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      {formData.request_type === "trunk_request_sms" ? (
                        <>
                          <SelectItem value="Direct" className="text-gray-900 dark:text-white">Direct</SelectItem>
                          <SelectItem value="HQ" className="text-gray-900 dark:text-white">HQ</SelectItem>
                          <SelectItem value="SIM" className="text-gray-900 dark:text-white">SIM</SelectItem>
                          <SelectItem value="WHS" className="text-gray-900 dark:text-white">WHS</SelectItem>
                          <SelectItem value="Local" className="text-gray-900 dark:text-white">Local</SelectItem>
                          <SelectItem value="Promo" className="text-gray-900 dark:text-white">Promo</SelectItem>
                          <SelectItem value="CS" className="text-gray-900 dark:text-white">CS</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="PRM" className="text-gray-900 dark:text-white">PRM</SelectItem>
                          <SelectItem value="STD" className="text-gray-900 dark:text-white">STD</SelectItem>
                          <SelectItem value="CC" className="text-gray-900 dark:text-white">CC</SelectItem>
                          <SelectItem value="TDM" className="text-gray-900 dark:text-white">TDM</SelectItem>
                          <SelectItem value="ORTP" className="text-gray-900 dark:text-white">ORTP</SelectItem>
                          <SelectItem value="ATX" className="text-gray-900 dark:text-white">ATX</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Direction *</Label>
                  <Select 
                    value={trunkDirection} 
                    onValueChange={(v) => setTrunkDirection(v)}
                  >
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select direction" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="Customer" className="text-gray-900 dark:text-white">Customer</SelectItem>
                      <SelectItem value="Vendor" className="text-gray-900 dark:text-white">Vendor</SelectItem>
                      <SelectItem value="Both" className="text-gray-900 dark:text-white">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="with_lcr"
                    type="checkbox"
                    checked={trunkWithLcr}
                    onChange={(e) => setTrunkWithLcr(e.target.checked)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <label htmlFor="with_lcr" className="text-gray-900 dark:text-white text-sm cursor-pointer">With LCR *</label>
                </div>
              </>
            )}

            {/* Open TT Fields */}
            {formData.request_type === "open_tt" && (
              <>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Destination *</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunk(s) *</Label>
                  <p className="text-xs text-zinc-500 mb-2">Select vendor trunk(s)</p>
                  {formData.vendor_trunks.map((trunk, index) => (
                    <div key={index} className="mb-3 p-3 bg-gray-100/50 dark:bg-zinc-800/50 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <div className="flex gap-2">
                        <SearchableSelect
                          options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                          value={trunk.trunk}
                          onChange={(value) => handleVendorTrunkChange(index, "trunk", value)}
                          placeholder="Select vendor trunk"
                          isRequired={true}
                          className="flex-1"
                        />
                        {formData.vendor_trunks.length > 1 && (
                          <Button variant="destructive" size="sm" onClick={() => removeVendorTrunk(index)}>X</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addVendorTrunk} className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Vendor Trunk
                  </Button>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Open By *</Label>
                  <Select value={formData.open_by} onValueChange={(v) => setFormData({ ...formData, open_by: v })}>
                    <SelectTrigger className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select how to open" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <SelectItem value="Teams" className="text-gray-900 dark:text-white">Teams</SelectItem>
                      <SelectItem value="Email" className="text-gray-900 dark:text-white">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Notes (Optional)</Label>
                  <Textarea
                    value={formData.open_tt_notes}
                    onChange={(e) => setFormData({ ...formData, open_tt_notes: e.target.value })}
                    placeholder="Additional notes..."
                    className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white"
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-gray-500 dark:text-zinc-400">
            Are you sure you want to delete this request? This action cannot be undone.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 text-gray-900 dark:text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Request Details Dialog */}
      <Dialog open={viewRequestDialogOpen} onOpenChange={setViewRequestDialogOpen}>
        <DialogContent disableOutsideClick className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Request Type</Label>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.request_type_label}</p>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Ticket #</Label>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.ticket_id || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Department</Label>
                  <p className="text-gray-900 dark:text-white capitalize">{selectedRequest.department}</p>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Priority</Label>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.priority}</p>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Status</Label>
                  <p className="text-gray-900 dark:text-white capitalize">{selectedRequest.status}</p>
                </div>
                {selectedRequest.request_type !== "testing" && selectedRequest.request_type !== "lcr" && selectedRequest.request_type !== "trunk_request_sms" && selectedRequest.request_type !== "trunk_request_voice" && (
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Customer</Label>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.customer || selectedRequest.enterprise?.name || "N/A"}</p>
                </div>
                )}
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Created By</Label>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.created_by_username}</p>
                </div>
                <div>
                  <Label className="text-gray-500 dark:text-zinc-400">Created At</Label>
                  <p className="text-gray-900 dark:text-white">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Request-specific fields */}
              {selectedRequest.request_type === "rating_routing" && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Rating/Routing Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.customer && <p className="text-gray-900 dark:text-white">Customer: {selectedRequest.customer}</p>}

                    {/* Always show customer trunks with rating plans */}
                    {(selectedRequest.customer_trunk_configs || selectedRequest.customer_trunks || []).length > 0 && (
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-amber-500 rounded"></div>
                          <span className="text-amber-300 font-medium text-sm">Customer Trunks & Rating Plans</span>
                        </div>
                        {(selectedRequest.customer_trunk_configs || selectedRequest.customer_trunks || []).map((config, i) => {
                      const isNewFormat = config.routing !== undefined;
                      const routeRules = isNewFormat ? (config.routing?.route_rules || []) : [];
                      const legacyVendors = isNewFormat ? [] : (selectedRequest.rating_vendor_trunks || []).filter(v => v.trunk);
                      
                      return (
                        <div key={i} className="border border-amber-600/30 rounded-lg p-3 bg-gray-100/30 dark:bg-zinc-800/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-amber-400 font-medium text-sm">Customer Trunk {i + 1}</span>
                          </div>
                          
                          {/* Two-column layout: Rating Plan | Routing Plan */}
                          <div className="grid grid-cols-2 gap-3">
                            {/* Rating Plan */}
                            <div className="border border-gray-200/50 dark:border-zinc-700/50 rounded p-2 bg-gray-100/20 dark:bg-zinc-800/20">
                              <div className="text-xs text-amber-300 font-medium mb-1">Rating Plan</div>
                              <div className="text-xs space-y-1">
                                <div className="text-gray-500 dark:text-zinc-400">Trunk: <span className="text-gray-900 dark:text-white">{config.trunk || config.customer_trunk || "N/A"}</span></div>
                                {isNewFormat && config.rating_pairs ? (
                                  config.rating_pairs.map((pair, pi) => (
                                    <div key={pi} className="text-gray-500 dark:text-zinc-400">
                                      Dest: <span className="text-gray-900 dark:text-white">{pair.destination || "N/A"}</span> → Rate: <span className="text-gray-900 dark:text-white">{pair.rate || "N/A"} EUR</span>
                                    </div>
                                  ))
                                ) : (
                                  <>
                                    <div className="text-gray-500 dark:text-zinc-400">Destination: <span className="text-gray-900 dark:text-white">{config.destination || "N/A"}</span></div>
                                    <div className="text-gray-500 dark:text-zinc-400">Rate: <span className="text-gray-900 dark:text-white">{config.rate || "N/A"} EUR</span></div>
                                  </>
                                )}
                              </div>
                            </div>
                            
                            {/* Routing Plan - only show if NOT using common routing */}
                            {!selectedRequest.use_common_routing && (
                              <div className="border border-gray-200/50 dark:border-zinc-700/50 rounded p-2 bg-gray-100/20 dark:bg-zinc-800/20">
                                <div className="text-xs text-blue-300 font-medium mb-1">Routing Plan</div>
                                <div className="text-xs space-y-1">
                                  {/* Route Rules (new format) */}
                                  {routeRules.length > 0 ? (
                                    routeRules.map((rule, rIdx) => (
                                      <div key={rIdx} className="border border-blue-600/30 rounded p-1.5 bg-white/30 dark:bg-zinc-900/30 mb-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-blue-300 font-medium">Route Rule (Priority: {rule.priority})</span>
                                          {rule.destination && (
                                            <span className="text-amber-300 text-xs">→ {rule.destination}</span>
                                          )}
                                        </div>
                                        {(rule.vendors || []).map((vendor, vIdx) => (
                                          <div key={vIdx} className="border border-gray-200/30 dark:border-zinc-700/30 rounded p-1 mb-1 last:mb-0">
                                            <div className="text-gray-700 dark:text-zinc-300">{vendor.trunk || "N/A"}</div>
                                            <div className="flex flex-wrap gap-2 text-gray-500 dark:text-zinc-400">
                                              {rule.vendors.length > 1 && vendor.percentage && <span>%:{vendor.percentage}%</span>}
                                              {vendor.cost_type && <span>{vendor.cost_type === "fixed" ? "Fixed" : "Range"}</span>}
                                              {vendor.cost_min && <span>{vendor.cost_type === "fixed" ? `Cost:${vendor.cost_min}` : `${vendor.cost_min}-${vendor.cost_max}`}</span>}
                                            </div>
                                          </div>
                                        ))}
                                        {rule.note && (
                                          <div className="mt-1 text-amber-300 text-xs">Note: {rule.note}</div>
                                        )}
                                        {(rule.by_loss || rule.enable_mnp_hlr || rule.mnp_hlr_type) && (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {rule.by_loss && <span className="text-green-400 text-xs bg-green-900/30 px-1 rounded">By Loss</span>}
                                            {rule.mnp_hlr_type && <span className="text-cyan-400 text-xs bg-cyan-900/30 px-1 rounded">{rule.mnp_hlr_type.toUpperCase()}</span>}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    /* Legacy format - flat vendor list */
                                    legacyVendors.length > 0 ? (
                                      legacyVendors.map((vendor, vIdx) => (
                                        <div key={vIdx} className="border border-gray-200/30 dark:border-zinc-700/30 rounded p-1.5 bg-white/30 dark:bg-zinc-900/30 mb-1">
                                          <div className="text-gray-700 dark:text-zinc-300 font-medium">{vendor.trunk || "N/A"}</div>
                                          <div className="flex flex-wrap gap-2 text-gray-500 dark:text-zinc-400">
                                            {vendor.position && <span>Pos:{vendor.position}</span>}
                                            {vendor.percentage && <span>%:{vendor.percentage}%</span>}
                                            {vendor.cost_type && <span>{vendor.cost_type === "fixed" ? "Fixed" : "Range"}</span>}
                                            {vendor.cost_min && <span>{vendor.cost_type === "fixed" ? `Cost:${vendor.cost_min}` : `${vendor.cost_min}-${vendor.cost_max}`}</span>}
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-zinc-500">No routing configured</div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                      </div>
                    )}

                    {/* Show common routing plan when enabled */}
                    {selectedRequest.use_common_routing && (
                      <div className="border border-blue-600/30 rounded-lg p-4 bg-gray-100/30 dark:bg-zinc-800/30">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 bg-blue-500 rounded"></div>
                          <span className="text-blue-300 font-medium text-sm">Common Routing Plan</span>
                        </div>
                        <div className="space-y-3">
                          {(selectedRequest.common_route_rules || []).map((rule, rIdx) => (
                            <div key={rIdx} className="border border-blue-600/30 rounded p-2 bg-white/30 dark:bg-zinc-900/30">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-blue-300 font-medium">Route Rule (Priority: {rule.priority})</span>
                                {rule.destination && (
                                  <span className="text-amber-300 text-xs">→ {rule.destination}</span>
                                )}
                              </div>
                              {(rule.vendors || []).map((vendor, vIdx) => (
                                <div key={vIdx} className="border border-gray-200/30 dark:border-zinc-700/30 rounded p-1.5 mb-1 last:mb-0">
                                  <div className="text-gray-700 dark:text-zinc-300">{vendor.trunk || "N/A"}</div>
                                  <div className="flex flex-wrap gap-2 text-gray-500 dark:text-zinc-400 text-xs">
                                    {rule.vendors.length > 1 && vendor.percentage && <span>%:{vendor.percentage}%</span>}
                                    {vendor.cost_type && <span>{vendor.cost_type === "fixed" ? "Fixed" : "Range"}</span>}
                                    {vendor.cost_min && <span>{vendor.cost_type === "fixed" ? `Cost:${vendor.cost_min}` : `${vendor.cost_min}-${vendor.cost_max}`}</span>}
                                  </div>
                                </div>
                              ))}
                              {rule.note && (
                                <div className="mt-1 text-amber-300 text-xs">Note: {rule.note}</div>
                              )}
                              {(rule.by_loss || rule.enable_mnp_hlr || rule.mnp_hlr_type) && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rule.by_loss && <span className="text-green-400 text-xs bg-green-900/30 px-1 rounded">By Loss</span>}
                                  {rule.mnp_hlr_type && <span className="text-cyan-400 text-xs bg-cyan-900/30 px-1 rounded">{rule.mnp_hlr_type.toUpperCase()}</span>}
                                </div>
                              )}
                            </div>
                          ))}
                          {(selectedRequest.common_route_rules || []).length === 0 && (
                            <div className="text-zinc-500">No common routing rules configured</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Legacy vendor trunks section (for backward compatibility) */}
                    {!selectedRequest.customer_trunk_configs && (selectedRequest.rating_vendor_trunks || []).length > 0 && (
                      <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-4 mt-3 bg-gray-100/30 dark:bg-zinc-800/30">
                        <Label className="text-gray-700 dark:text-zinc-300 font-semibold block mb-3">Vendor Trunks (Position-based)</Label>
                        {(() => {
                          const grouped = {};
                          (selectedRequest.rating_vendor_trunks || []).forEach(trunk => {
                            const pos = trunk.position || "1";
                            if (!grouped[pos]) grouped[pos] = [];
                            grouped[pos].push(trunk);
                          });
                          return Object.entries(grouped).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([position, trunks]) => (
                            <div key={position} className="mb-3 last:mb-0">
                              <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-2 mb-2">
                                <p className="text-gray-900 dark:text-white font-medium text-sm">{position === "1" ? "Position 1 (First)" : `Position ${position}`}</p>
                              </div>
                              {trunks.map((trunk, i) => (
                                <div key={i} className="ml-2 p-2 bg-gray-100/50 dark:bg-zinc-800/50 rounded border border-gray-200 dark:border-zinc-700">
                                  <p className="text-gray-900 dark:text-white text-sm">{trunk.trunk}</p>
                                  <div className="flex flex-wrap gap-2 text-xs mt-1">
                                    {trunk.percentage && <span className="text-gray-500 dark:text-zinc-400">%:{trunk.percentage}%</span>}
                                    {trunk.cost_type && <span className="text-gray-500 dark:text-zinc-400">{trunk.cost_type === "fixed" ? "Fixed" : "Range"}</span>}
                                    {trunk.cost_min && <span className="text-gray-500 dark:text-zinc-400">{trunk.cost_type === "fixed" ? `Cost:${trunk.cost_min}` : `${trunk.cost_min}-${trunk.cost_max}`}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(selectedRequest.request_type === "testing" || selectedRequest.request_type_label?.includes("Testing")) && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Testing Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.destination && <p className="text-gray-900 dark:text-white">Destination: {selectedRequest.destination}</p>}
                    {(selectedRequest.test_type || selectedRequest.test_description) && (
                      <>
                        {selectedRequest.test_type && <p className="text-gray-900 dark:text-white">Test Type: {selectedRequest.test_type === "tool_test" ? "Tool Test" : selectedRequest.test_type === "manual_test" ? "Manual Test" : selectedRequest.test_type}</p>}
                        {selectedRequest.test_description && <p className="text-gray-900 dark:text-white">Test Description: {selectedRequest.test_description}</p>}
                      </>
                    )}
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunks:</Label>
                      {(selectedRequest.vendor_trunks || []).map((trunk, i) => (
                        <div key={i} className="text-gray-900 dark:text-white ml-2">
                          - {trunk.trunk}
                          {/* Show SID/Content only for SMS requests (Voice uses ANI/A-Numbers) */}
                          {selectedRequest.department === "sms" && (trunk.sid_content_pairs || []).length > 0 && (
                            <div className="ml-2 text-gray-500 dark:text-zinc-400">
                              SID/Content: {trunk.sid_content_pairs.map(p => `${p.sid}: ${p.content}`).join(", ")}
                            </div>
                          )}
                          {(trunk.ani_numbers || []).length > 0 && (
                            <div className="ml-2 text-gray-500 dark:text-zinc-400">
                              ANI/A-Numbers: {trunk.ani_numbers.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "translation" && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Translation Details</Label>
                  <div className="mt-2 space-y-2">
                    <p className="text-gray-900 dark:text-white">Translation Type: {selectedRequest.translation_type === "sid_change" ? "SID Change" : selectedRequest.translation_type === "content_change" ? "Content Change" : selectedRequest.translation_type === "sid_content_change" ? "SID & Content Change" : selectedRequest.translation_type === "remove" ? "Remove from Content" : selectedRequest.translation_type}</p>
                    <p className="text-gray-900 dark:text-white">Trunk Type: {selectedRequest.trunk_type}</p>
                    <p className="text-gray-900 dark:text-white">Trunk Name: {selectedRequest.trunk_name}</p>
                    {selectedRequest.translation_type === "remove" ? (
                      selectedRequest.word_to_remove && <p className="text-gray-900 dark:text-white">Word Removed: {selectedRequest.word_to_remove}</p>
                    ) : (
                      <>
                        {selectedRequest.old_value && <p className="text-gray-900 dark:text-white">Old Value: {selectedRequest.old_value}</p>}
                        {selectedRequest.new_value && <p className="text-gray-900 dark:text-white">New Value: {selectedRequest.new_value}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "investigation" && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Investigation Details</Label>
                  <div className="mt-2 space-y-2">
                    {(selectedRequest.issue_types && selectedRequest.issue_types.length > 0) && (
                      <p className="text-gray-900 dark:text-white">Issue Type: {selectedRequest.issue_types.join(", ")}</p>
                    )}
                    {(selectedRequest.issue_other) && (
                      <p className="text-gray-900 dark:text-white">Other: {selectedRequest.issue_other}</p>
                    )}
                    <p className="text-gray-900 dark:text-white">Customer Trunk: {selectedRequest.customer_trunk}</p>
                    <p className="text-gray-900 dark:text-white">Destination: {selectedRequest.investigation_destination}</p>
                    {selectedRequest.issue_description && <p className="text-gray-900 dark:text-white">Description: {selectedRequest.issue_description}</p>}
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "lcr" && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">LCR Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.lcr_type && <p className="text-gray-900 dark:text-white">LCR Type: {selectedRequest.lcr_type}</p>}
                    {selectedRequest.lcr_change && <p className="text-gray-900 dark:text-white">Change: {selectedRequest.lcr_change === "add" ? "Add" : selectedRequest.lcr_change === "drop" ? "Drop" : selectedRequest.lcr_change}</p>}
                    {selectedRequest.destination && <p className="text-gray-900 dark:text-white">Destination: {selectedRequest.destination}</p>}
                    <div>
                      <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunks:</Label>
                      {(selectedRequest.vendor_trunks || []).map((trunk, i) => (
                        <p key={i} className="text-gray-900 dark:text-white ml-2">- {trunk.trunk}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(selectedRequest.request_type === "trunk_request_sms" || selectedRequest.request_type === "trunk_request_voice") && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">New Trunk Request Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.customer && <p className="text-gray-900 dark:text-white">Customer(s): {selectedRequest.customer}</p>}
                    {selectedRequest.trunk_type && <p className="text-gray-900 dark:text-white">Trunk Type: {selectedRequest.trunk_type}</p>}
                    <p className="text-gray-900 dark:text-white">Direction: {selectedRequest.direction || "Not specified"}</p>
                    <p className="text-gray-900 dark:text-white">With LCR: {selectedRequest.with_lcr ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "open_tt" && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Open TT Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.destination && <p className="text-gray-900 dark:text-white">Destination: {selectedRequest.destination}</p>}
                    {selectedRequest.vendor_trunks && selectedRequest.vendor_trunks.length > 0 && (
                      <div>
                        <Label className="text-gray-500 dark:text-zinc-400">Vendor Trunk(s):</Label>
                        {selectedRequest.vendor_trunks.map((trunk, i) => (
                          <p key={i} className="text-gray-900 dark:text-white ml-2">- {trunk.trunk}</p>
                        ))}
                      </div>
                    )}
                    {selectedRequest.open_by && <p className="text-gray-900 dark:text-white">Open By: {selectedRequest.open_by}</p>}
                    {selectedRequest.open_tt_notes && <p className="text-gray-900 dark:text-white">Notes: {selectedRequest.open_tt_notes}</p>}
                  </div>
                </div>
              )}

              {selectedRequest.response && (
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
                  <Label className="text-gray-500 dark:text-zinc-400">Response</Label>
                  <p className="text-gray-900 dark:text-white mt-2">{selectedRequest.response}</p>
                </div>
              )}

              {/* Test Result Image - Legacy single image */}
              {selectedRequest.test_result_image && !selectedRequest.test_result_images && (
                <CompactImageViewer 
                  images={[selectedRequest.test_result_image]} 
                  title="Test Result Image"
                />
              )}

              {/* Test Result Images - Multiple images */}
              {selectedRequest.test_result_images && selectedRequest.test_result_images.length > 0 && (
                <CompactImageViewer 
                  images={selectedRequest.test_result_images} 
                  title="Test Result Images"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Claim Dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent disableOutsideClick className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>Claim Request</DialogTitle>
          </DialogHeader>
          <p className="text-gray-500 dark:text-zinc-400">
            Are you sure you want to claim this request? Once claimed, only you can complete or reject it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimDialogOpen(false)} className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={submitClaim} 
              className="bg-blue-600 text-gray-900 dark:text-white hover:bg-blue-700"
            >
              Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Response Dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent disableOutsideClick className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>{responseType === "complete" ? "Complete" : "Reject"} Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Image upload for Testing requests when completing */}
            {selectedRequest?.request_type === "testing" && responseType === "complete" && (
              <div>
                <Label className="text-gray-500 dark:text-zinc-400">Attach Test Result Images (Optional)</Label>
                <div 
                  className="mt-2 border-2 border-dashed border-gray-300 dark:border-zinc-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 dark:hover:border-zinc-400 transition-colors"
                  onClick={() => document.getElementById('responseImageInput').click()}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                          const blob = items[i].getAsFile();
                          handleImagePaste(blob);
                        }
                      }
                    }
                  }}
                >
                  {responseImagePreviews.length > 0 ? (
                    <div className="space-y-2">
                      {responseImagePreviews.map((preview, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-100/50 dark:bg-zinc-800/50 rounded-lg p-2 border border-gray-200 dark:border-zinc-700">
                          <div className="flex items-center gap-2">
                            <img src={preview} alt={`Test result ${index + 1}`} className="w-10 h-10 rounded object-cover" />
                            <span className="text-sm text-gray-900 dark:text-white">image_{index + 1}</span>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResponseImages(prev => prev.filter((_, i) => i !== index));
                              setResponseImagePreviews(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="bg-red-600 text-gray-900 dark:text-white rounded-full p-1 w-6 h-6 flex items-center justify-center hover:bg-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 dark:text-zinc-400">
                      <p>Click to upload or paste from clipboard</p>
                      <p className="text-xs text-zinc-500 mt-1">Supports: JPG, PNG, GIF (Multiple images allowed)</p>
                    </div>
                  )}
                </div>
                <input
                  id="responseImageInput"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => {
                      if (file.type.startsWith('image/')) {
                        setResponseImages(prev => [...prev, file]);
                        setResponseImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
                      }
                    });
                    e.target.value = '';
                  }}
                />
              </div>
            )}
            <div>
              <Label className="text-gray-500 dark:text-zinc-400">Comment (Optional)</Label>
              <Textarea
                value={responseComment}
                onChange={(e) => setResponseComment(e.target.value)}
                placeholder={responseType === "complete" ? "Add completion notes..." : "Reason for rejection..."}
                className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseDialogOpen(false)} className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={submitResponse} 
              className={responseType === "complete" ? "bg-green-600 text-gray-900 dark:text-white hover:bg-green-700" : "bg-red-600 text-gray-900 dark:text-white hover:bg-red-700"}
            >
              {responseType === "complete" ? "Complete" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
