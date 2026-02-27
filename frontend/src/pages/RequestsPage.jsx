import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
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
import { Plus, Search, Filter, Clock, CheckCircle, XCircle, AlertCircle, Edit, Trash2, Copy } from "lucide-react";
import MultiSelect from "@/components/custom/MultiSelect";
import MultiFilter from "@/components/custom/MultiFilter";
import axios from "axios";

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
  }
};

const PRIORITIES = [
  { value: "Low", color: "bg-zinc-500", text: "text-zinc-100", description: "To be done in 30 mins" },
  { value: "Medium", color: "bg-blue-500", text: "text-white", description: "To be done in 20 mins" },
  { value: "High", color: "bg-orange-500", text: "text-white", description: "To be done in 10 mins" },
  { value: "Urgent", color: "bg-red-600", text: "text-white", description: "To be done in 5 mins" }
];

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-500", label: "Pending" },
  in_progress: { icon: AlertCircle, color: "text-blue-500", label: "In Progress" },
  completed: { icon: CheckCircle, color: "text-green-500", label: "Completed" },
  rejected: { icon: XCircle, color: "text-red-500", label: "Rejected" }
};

export default function RequestsPage() {
  const { toast } = useToast();
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
  const getPendingByPriority = (ticketType) => {
    if (userRole !== "noc" && userRole !== "admin") return {};
    const pending = requests.filter(r => r.ticket_type === ticketType && r.status === "pending" && !r.claimed_by);
    return {
      Urgent: pending.filter(r => r.priority === "Urgent").length,
      High: pending.filter(r => r.priority === "High").length,
      Medium: pending.filter(r => r.priority === "Medium").length,
      Low: pending.filter(r => r.priority === "Low").length,
      total: pending.length
    };
  };
  
  const smsPending = getPendingByPriority("sms");
  const voicePending = getPendingByPriority("voice");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [multiFilters, setMultiFilters] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState(null);
  const [viewRequestDialogOpen, setViewRequestDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [responseType, setResponseType] = useState(null); // "complete" or "reject"
  const [responseComment, setResponseComment] = useState("");
  const [responseImage, setResponseImage] = useState(null); // For testing completion images
  const [responseImagePreview, setResponseImagePreview] = useState(null); // Preview URL
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [requestToClaim, setRequestToClaim] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Refs for auto-refresh to avoid stale closures
  const activeTabRef = useRef(activeTab);
  const requestSubTabRef = useRef(requestSubTab);
  const userRoleRef = useRef(userRole);
  const statusFilterRef = useRef(statusFilter);

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
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);
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
    customer_trunks: {
      "": [{ destination: "", rate: "" }]
    },
    destination: "",
    ticket_id: "",  // Optional ticket reference
    by_loss: false,
    enable_mnp_hlr: false,
    mnp_hlr_type: "",
    enable_threshold: false,
    threshold_count: "",
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
    issue_description: ""
  });

  const [formData, setFormData] = useState(getInitialFormData());
  
  // Track URL for notification navigation using ref
  const prevUrlRef = React.useRef(window.location.href);
  const [urlKey, setUrlKey] = useState(0);
  
  useEffect(() => {
    fetchRequests();
  }, [activeTab, statusFilter, requestSubTab]);

  // Handle URL parameters for pre-filling form (e.g., from ticket pages)
  // Use useEffect to check URL params and open dialog
  const processedTicketRef = useRef(null);
  
  useEffect(() => {
    // Get ticket_id and ticket_type from search params
    const ticketId = searchParams.get('ticket_id');
    const ticketType = searchParams.get('ticket_type');
    
    console.log('RequestsPage: Checking URL params:', { ticketId, ticketType, search: location.search });
    
    // Only process if we haven't processed this ticket_id yet
    if (ticketId && processedTicketRef.current !== ticketId) {
      console.log('RequestsPage: Processing ticket_id:', ticketId);
      processedTicketRef.current = ticketId;
      
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
  
  // Handle request query parameter for notification navigation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("request");
    
    if (requestId) {
      // First try to find the request in the already loaded list
      const foundRequest = requests.find(r => r.id === requestId || r._id === requestId);
      
      if (foundRequest) {
        setSelectedRequest(foundRequest);
        setViewRequestDialogOpen(true);
        // Clear the query parameter from URL
        window.history.replaceState({}, document.title, window.location.pathname);
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
          } finally {
            // Clear the query parameter from URL
            window.history.replaceState({}, document.title, window.location.pathname);
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
      
      // Fetch all enterprises (not just assigned ones)
      const entResponse = await axios.get(`${API}/clients`, { headers });
      const entData = entResponse.data || [];
      
      const filteredEnterprises = entData.filter(e => 
        e.enterprise_type === deptType || e.enterprise_type === "all"
      );
      setEnterprises(filteredEnterprises);
      
      // Fetch vendor and customer trunks
      const vendorTrunkResponse = await axios.get(`${API}/references/trunks/${deptType}`, { headers });
      const customerTrunkResponse = await axios.get(`${API}/trunks/${deptType}`, { headers });
      setVendorTrunkOptions(vendorTrunkResponse.data.vendor_trunks || []);
      setCustomerTrunkOptions(customerTrunkResponse.data.customer_trunks || []);
    } catch (error) {
      console.error("Failed to fetch enterprises/trunks:", error);
    }
  };

  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      // Compute displayTab using refs to avoid stale closures
      const currentUserRole = userRoleRef.current;
      const currentActiveTab = activeTabRef.current;
      const isSmsDept = userDepartment?.startsWith("sms") || userDepartment === "sms";
      const isVoiceDept = userDepartment?.startsWith("voice") || userDepartment === "voice";
      const currentDisplayTab = currentUserRole === "am" 
        ? (isSmsDept ? "sms" : isVoiceDept ? "voice" : userDepartment) 
        : currentActiveTab;
      
      // For NOC/Admin: fetch all requests for the department (API returns all statuses)
      // For AM: fetch requests for their department
      params.append("department", currentUserRole === "am" ? currentDisplayTab : currentActiveTab);
      
      const response = await fetch(`${API}/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRequests(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    }
  };

  // Auto-refresh data every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchRequests();
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
      via_vendor: ""
    });
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

  // Customer trunk handlers - Enterprise trunk with multiple destination-rate pairs
  // New structure: { "trunk_name": [{ destination: "", rate: "" }] }
  
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
        // Convert object format to array format for backend
        customer_trunks: Object.entries(formData.customer_trunks || {}).flatMap(
          ([trunk, pairs]) => pairs
            .filter(p => p.destination)
            .map(p => ({ trunk, destination: p.destination, rate: p.rate }))
        ),
        destination: formData.destination || null,
        by_loss: formData.by_loss || false,
        enable_mnp_hlr: formData.enable_mnp_hlr || false,
        mnp_hlr_type: formData.mnp_hlr_type || null,
        enable_threshold: formData.enable_threshold || false,
        threshold_count: formData.threshold_count || null,
        via_vendor: formData.via_vendor || null,
        enable_whitelisting: formData.enable_whitelisting || false,
        // Convert position-based object to array format for backend
        rating_vendor_trunks: Object.entries(formData.rating_vendor_trunks || {}).flatMap(
          ([position, vendors]) => vendors
            .filter(v => v.trunk)
            .map(v => ({ ...v, position }))
        ),
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
        issue_description: formData.issue_description || null
      };

      if (isEditMode && editingRequest) {
        await axios.put(`${API}/requests/${editingRequest.id}`, requestData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast({ title: "Request updated successfully" });
      } else {
        await axios.post(`${API}/requests`, requestData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast({ title: "Request submitted successfully" });
      }
      
      setDialogOpen(false);
      setIsEditMode(false);
      setEditingRequest(null);
      fetchRequests();
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
      issue_description: request.issue_description || ""
    });
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
      issue_description: request.issue_description || ""
    });
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
      issue_description: ""
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
      fetchRequests();
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
    setResponseImage(null);
    setResponseImagePreview(null);
    setResponseDialogOpen(true);
  };

  const handleImagePaste = (file) => {
    if (file && file.type.startsWith('image/')) {
      setResponseImage(file);
      setResponseImagePreview(URL.createObjectURL(file));
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
      await axios.put(`${API}/requests/${requestToClaim.id}`, {
        claimed_by: user.id,
        status: "in_progress"
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({ title: "Request claimed successfully" });
      fetchRequests();
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
      
      // Convert image to base64 if present
      let testResultImageBase64 = null;
      if (responseImage) {
        testResultImageBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(responseImage);
        });
      }
      
      await axios.put(`${API}/requests/${selectedRequest.id}`, {
        status: newStatus,
        response: responseComment || null,
        test_result_image: testResultImageBase64
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({ title: `Request ${newStatus === "completed" ? "completed" : "rejected"} successfully` });
      fetchRequests();
    } catch (error) {
      console.error("Failed to respond to request:", error);
      const errorMessage = error.response?.data?.detail || "Failed to respond to request";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setResponseDialogOpen(false);
      setSelectedRequest(null);
      setResponseType(null);
      setResponseComment("");
      setResponseImage(null);
      setResponseImagePreview(null);
    }
  };

  const getPriorityColor = (priority) => {
    const p = PRIORITIES.find(p => p.value === priority);
    return p ? `${p.color} ${p.text}` : "bg-zinc-500 text-zinc-100";
  };

  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  const filteredRequests = requests.filter(req => {
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
    
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
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

  // Sort requests: Active tab = by priority, Archive tab = by time (newest first)
  const priorityOrder = { "Urgent": 1, "High": 2, "Medium": 3, "Low": 4 };
  
  // Create a copy for sorting to avoid mutating the original array
  const sortedRequests = [...filteredRequests];
  
  if (requestSubTab === "active") {
    // Active tab: sort by priority (Urgent -> High -> Medium -> Low)
    sortedRequests.sort((a, b) => {
      const priorityA = priorityOrder[a.priority] || 5;
      const priorityB = priorityOrder[b.priority] || 5;
      return priorityA - priorityB;
    });
  } else {
    // Archive tab: sort by time (newest first)
    sortedRequests.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA; // Newest first
    });
  }

  // For AMs, only show their department
  // Use flexible matching to handle different department name formats
  const isSmsDepartment = userDepartment?.startsWith("sms") || userDepartment === "sms";
  const isVoiceDepartment = userDepartment?.startsWith("voice") || userDepartment === "voice";
  const displayTab = userRole === "am" 
    ? (isSmsDepartment ? "sms" : isVoiceDepartment ? "voice" : userDepartment) 
    : activeTab;

  // Validation for Rating/Routing - requires customer_trunks with trunk and destination, and either rate or vendor trunk(s)
  const isRatingRoutingValid = () => {
    if (formData.request_type !== "rating_routing") return true;
    
    // Validate customer trunk rates are numeric
    const customerTrunks = formData.customer_trunks || {};
    for (const [trunk, pairs] of Object.entries(customerTrunks)) {
      for (const pair of (pairs || [])) {
        if (pair.rate && pair.rate.trim() !== "" && isNaN(parseFloat(pair.rate))) {
          return false;
        }
      }
    }

    // Validate vendor trunk costs are numeric
    const positions = formData.rating_vendor_trunks || {};
    for (const [position, vendors] of Object.entries(positions)) {
      for (const vendor of (vendors || [])) {
        if (vendor.trunk) {
          if (vendor.percentage && vendor.percentage.trim() !== "" && isNaN(parseFloat(vendor.percentage))) {
            return false;
          }
          if (vendor.cost_min && vendor.cost_min.trim() !== "" && isNaN(parseFloat(vendor.cost_min))) {
            return false;
          }
          if (vendor.cost_max && vendor.cost_max.trim() !== "" && isNaN(parseFloat(vendor.cost_max))) {
            return false;
          }
        }
      }
    }
    
    // At least one customer trunk with trunk and destination is required
    // New structure: { "trunk_name": [{ destination, rate }] }
    const hasCustomerTrunks = Object.entries(formData.customer_trunks || {}).some(
      ([trunk, pairs]) => trunk && (pairs || []).some(p => p.destination)
    );
    if (!hasCustomerTrunks) return false;
    
    // Check if any customer trunk has a rate
    const hasCustomerRate = Object.values(formData.customer_trunks || {}).some(
      (pairs) => (pairs || []).some(p => p.rate && p.rate.trim())
    );
    // Check if any vendor trunk exists in any position
    const hasVendorTrunks = Object.values(formData.rating_vendor_trunks || {}).some(
      (vendors) => (vendors || []).some(v => v.trunk)
    );
    
    // Either customer trunk needs rate OR vendor trunk needs to exist
    if (!hasCustomerRate && !hasVendorTrunks) return false;
    
    // Validate percentages: if a position has more than 1 vendor, percentages must add up to 100%
    const positionsCheck = formData.rating_vendor_trunks || {};
    for (const [position, vendors] of Object.entries(positionsCheck)) {
      const vendorsWithTrunk = (vendors || []).filter(v => v.trunk);
      if (vendorsWithTrunk.length > 1) {
        const percentageSum = vendorsWithTrunk.reduce((sum, v) => sum + (parseFloat(v.percentage) || 0), 0);
        if (percentageSum !== 100) {
          return false;
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
    return formData.customer;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">AM Requests</h1>
          <p className="text-zinc-400">Submit and track requests for NOC</p>
        </div>
        {userRole === "am" && (
          <Button onClick={() => {
            setFormData(getInitialFormData());
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white"
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
      </div>

      {/* Tabs - For NOC/Admin show both SMS/Voice, for AM show only their department */}
      {userRole !== "am" ? (
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setRequestSubTab("active"); }}>
          <TabsList className="bg-zinc-800">
            <TabsTrigger value="sms" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              SMS Requests
            </TabsTrigger>
            <TabsTrigger value="voice" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              Voice Requests
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        <div className="text-lg font-semibold text-white mb-2">
          {isSmsDepartment ? "SMS Requests" : isVoiceDepartment ? "Voice Requests" : "My Requests"}
        </div>
      )}

      {/* Sub-tabs for Active/Archive - show for all users */}
      <div className="mt-4 flex gap-2">
        <Button
          variant={requestSubTab === "active" ? "default" : "outline"}
          onClick={() => setRequestSubTab("active")}
          className={requestSubTab === "active" ? "bg-green-600 hover:bg-green-700" : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"}
        >
          Active
        </Button>
        <Button
          variant={requestSubTab === "archive" ? "default" : "outline"}
          onClick={() => setRequestSubTab("archive")}
          className={requestSubTab === "archive" ? "bg-blue-600 hover:bg-blue-700" : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"}
        >
          Archive
        </Button>
      </div>

      {/* Requests List */}
      <div className="grid gap-4">
        {sortedRequests.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Filter className="h-12 w-12 text-zinc-600 mb-4" />
              <p className="text-zinc-400">No requests found</p>
            </CardContent>
          </Card>
        ) : (
          sortedRequests.map((request) => {
            const statusConfig = getStatusConfig(request.status);
            const StatusIcon = statusConfig.icon;
            
            return (
              <Card key={request.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(request.priority)}`}>
                          {request.priority}
                        </span>
                        <Badge variant="outline" className="border-zinc-600 text-zinc-300">
                          {request.request_type_label}
                        </Badge>
                        <Badge variant="outline" className="border-zinc-600 text-zinc-300 capitalize">
                          {request.department}
                        </Badge>
                      </div>
                      <h3 className="text-white font-medium">{request.customer}</h3>
                      <p className="text-zinc-400 text-sm">
                        Created by {request.created_by_username} on {new Date(request.created_at).toLocaleDateString()}
                        {request.claimed_by_username && <span className="block text-yellow-400">Claimed by {request.claimed_by_username}</span>}
                      </p>
                      
                      {/* Show relevant details based on request type */}
                      {request.request_type === "rating_routing" && (
                        <div className="mt-2 text-sm text-zinc-400">
                          {/* Enterprise Trunks */}
                          {request.customer_trunks && request.customer_trunks.length > 0 && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Enterprise Trunk(s): </span>
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
                        <div className="mt-2 text-sm text-zinc-400">
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
                        <div className="mt-2 text-sm text-zinc-400">
                          {request.trunk_name && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Enterprise Trunk: </span>
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
                        <div className="mt-2 text-sm text-zinc-400">
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
                        <div className="mt-2 text-sm text-zinc-400">
                          {request.customer_trunk && (
                            <div className="mb-1">
                              <span className="text-zinc-500">Enterprise Trunk: </span>
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
                      
                      {request.response && (
                        <div className="mt-3 p-2 bg-zinc-800 rounded text-sm text-zinc-300">
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
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDeleteRequest(request.id)}
                        className="border-zinc-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                  
                  {/* Edit/Delete buttons - only for AMs when request is pending and created by current user */}
                  {userRole === "am" && request.created_by === user.id && request.status === "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDeleteRequest(request.id)}
                        className="border-zinc-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                  
                  {/* View only for AMs who created the request - when not pending */}
                  {userRole === "am" && request.created_by === user.id && request.status !== "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}
                  
                  {/* Clone/Resend button for AMs to duplicate their own requests (not pending) */}
                  {userRole === "am" && request.created_by === user.id && request.status !== "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCloneRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4 mr-1" /> Clone/Resend
                      </Button>
                    </div>
                  )}
                  
                  {/* Create LCR Request button for AMs - only for completed Testing requests in Voice */}
                  {userRole === "am" && request.created_by === user.id && request.status === "completed" && (request.request_type === "testing" || request.request_type_label?.includes("Testing")) && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCreateLcrFromTesting(request)}
                        className="border-zinc-600 text-amber-400 hover:bg-amber-900/20 hover:text-amber-300"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Create LCR Request
                      </Button>
                    </div>
                  )}

                  {/* View/Respond buttons for NOC and Admin */}
                  {(userRole === "noc" || userRole === "admin") && request.status === "pending" && !request.claimed_by && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <Search className="h-4 w-4 mr-1" /> View
                      </Button>
                    </div>
                  )}

                  {/* View only button for completed/rejected requests */}
                  {(userRole === "noc" || userRole === "admin") && (request.status === "completed" || request.status === "rejected") && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewRequest(request)}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
        }
      }}>
        <DialogContent disableOutsideClick className="bg-zinc-900 border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit" : "New"} {displayTab.toUpperCase()} Request</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Request Type */}
            <div>
              <Label className="text-zinc-400">Request Type</Label>
              <Select value={formData.request_type} onValueChange={handleRequestTypeChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select request type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
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
                    <SelectItem key={key} value={key} className="text-white data-[highlighted]:bg-white data-[highlighted]:text-black">
                      <div className="text-left data-[highlighted]:text-black">
                        <div className="font-medium text-left">{type.label}</div>
                        <div className="text-xs text-zinc-400 text-left data-[highlighted]:text-black">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority - Show only when request type is selected */}
            {formData.request_type && (
              <div>
                <Label className="text-zinc-400">Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue className="text-white" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-white">
                        <span>{p.value}</span>
                        <span className="text-zinc-400 text-xs ml-2">({p.description})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Ticket # - Optional field for linking to a ticket */}
            {formData.request_type && (
              <div>
                <Label className="text-zinc-400">Ticket # (Optional)</Label>
                <Input
                  value={formData.ticket_id || ""}
                  onChange={(e) => setFormData({ ...formData, ticket_id: e.target.value })}
                  placeholder="Enter related ticket number"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            )}

            {/* Customer/Enterprise - Show only when request type is selected and not for Testing/Investigation/Translation/LCR */}
            {formData.request_type && formData.request_type !== "testing" && formData.request_type !== "investigation" && formData.request_type !== "translation" && formData.request_type !== "lcr" && (
              <div>
                <Label className="text-zinc-400">
                  {formData.request_type === "translation" || formData.request_type === "rating_routing" ? "Enterprise(s)" : "Customer"}
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
                    placeholder={formData.request_type === "translation" ? "Enterprise name" : "Customer name"}
                    className="bg-zinc-800 border-zinc-700"
                  />
                )}
              </div>
            )}

            {/* Rating/Routing Fields */}
            {formData.request_type === "rating_routing" && (
              <>
                <div>
                  <Label className="text-zinc-400">Enterprise Trunks</Label>
                  <p className="text-xs text-zinc-500 mb-2">Each enterprise trunk can have multiple destination-rate pairs</p>
                  
                  {Object.entries(formData.customer_trunks || {}).map(([trunkName, destRates]) => (
                    <div key={trunkName} className="border border-zinc-700 rounded-lg p-3 mb-3 bg-zinc-900/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Select 
                          value={trunkName} 
                          onValueChange={(value) => handleEnterpriseTrunkSelect(trunkName, value)}
                          required
                        >
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white flex-1">
                            <SelectValue placeholder="Select enterprise trunk" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700">
                            {(formData.customer_ids || []).flatMap(customerId => 
                              (enterprises.find(e => e.id === customerId)?.customer_trunks || []).map((tName) => (
                                <SelectItem key={`${customerId}-${tName}`} value={tName} className="text-white">
                                  {enterprises.find(e => e.id === customerId)?.name} - {tName}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {trunkName && Object.keys(formData.customer_trunks || {}).length > 0 && (
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => removeEnterpriseTrunk(trunkName)}
                            className="shrink-0"
                          >
                            X
                          </Button>
                        )}
                      </div>
                      
                      {/* Destination-Rate pairs for this trunk */}
                      {(destRates || []).map((pair, pairIndex) => (
                        <div key={pairIndex} className="flex gap-2 mb-2 items-start ml-2">
                          <Input
                            value={pair.destination}
                            onChange={(e) => handleDestinationRateChange(trunkName, pairIndex, "destination", e.target.value)}
                            placeholder="Destination (e.g., Country - Network)"
                            className="bg-zinc-800 border-zinc-700 flex-1"
                          />
                          <Input
                            value={pair.rate}
                            onChange={(e) => handleDestinationRateChange(trunkName, pairIndex, "rate", e.target.value)}
                            placeholder="Rate"
                            className="bg-zinc-800 border-zinc-700 w-24"
                          />
                          {(destRates || []).length > 1 && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => removeDestinationRatePair(trunkName, pairIndex)}
                              className="shrink-0"
                            >
                              X
                            </Button>
                          )}
                        </div>
                      ))}
                      
                      {/* Add destination-rate pair button */}
                      {trunkName && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => addDestinationRatePair(trunkName)}
                          className="mt-1 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Destination-Rate
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  <Button variant="outline" size="sm" onClick={addEnterpriseTrunk} className="mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Enterprise Trunk
                  </Button>
                </div>
                <div>
                  <Label className="text-zinc-400">Vendor Trunk Positions</Label>
                  <p className="text-xs text-zinc-500 mb-2">Each position can have multiple vendors. Percentages within a position must add up to 100%.</p>
                  
                  {Object.entries(formData.rating_vendor_trunks || {}).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([position, vendors]) => {
                    const vendorsWithTrunk = (vendors || []).filter(v => v.trunk);
                    const hasMultipleVendors = vendorsWithTrunk.length > 1;
                    const percentageSum = getPositionPercentageSum(position);
                    const isPercentageValid = percentageSum === 100;
                    const positionLabel = position === "1" ? "Position 1 (First)" : `Position ${position}`;
                    
                    return (
                      <div key={position} className="border border-zinc-700 rounded-lg p-3 mb-3 bg-zinc-900/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{positionLabel}</span>
                            {hasMultipleVendors && (
                              <span className={`text-xs px-2 py-0.5 rounded ${isPercentageValid ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                {percentageSum}%
                              </span>
                            )}
                          </div>
                          {Object.keys(formData.rating_vendor_trunks || {}).length > 1 && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => removePosition(position)}
                              className="h-6 w-6 p-0"
                            >
                              X
                            </Button>
                          )}
                        </div>
                        
                        {/* Vendor entries for this position */}
                        {(vendors || []).map((trunk, vendorIndex) => (
                          <div key={vendorIndex} className="flex gap-2 mb-2 items-start">
                            <SearchableSelect
                              options={vendorTrunkOptions.map(vt => ({ value: vt, label: vt }))}
                              value={trunk.trunk}
                              onChange={(value) => handleRatingVendorChange(position, vendorIndex, "trunk", value)}
                              placeholder="Select vendor trunk"
                              isRequired={true}
                              className="flex-1 min-w-[150px]"
                            />
                            {/* Show percentage only when there are multiple vendors */}
                            {hasMultipleVendors && (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={trunk.percentage}
                                  onChange={(e) => handleRatingVendorChange(position, vendorIndex, "percentage", e.target.value)}
                                  placeholder="%"
                                  className="bg-zinc-800 border-zinc-700 w-16"
                                />
                                <span className="text-zinc-400 text-xs">%</span>
                              </div>
                            )}
                            {/* Cost type and cost fields - always shown */}
                            <Select
                              value={trunk.cost_type || "fixed"}
                              onValueChange={(v) => handleRatingVendorChange(position, vendorIndex, "cost_type", v)}
                            >
                              <SelectTrigger className="bg-zinc-800 border-zinc-700 w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700">
                                <SelectItem value="fixed">Fixed</SelectItem>
                                <SelectItem value="range">Range</SelectItem>
                              </SelectContent>
                            </Select>
                            {trunk.cost_type === "fixed" ? (
                              <Input
                                value={trunk.cost_min}
                                onChange={(e) => handleRatingVendorChange(position, vendorIndex, "cost_min", e.target.value)}
                                placeholder="Cost"
                                className="bg-zinc-800 border-zinc-700 w-24"
                              />
                            ) : (
                              <div className="flex gap-1 w-24">
                                <Input
                                  value={trunk.cost_min}
                                  onChange={(e) => handleRatingVendorChange(position, vendorIndex, "cost_min", e.target.value)}
                                  placeholder="Min"
                                  className="bg-zinc-800 border-zinc-700 w-12"
                                />
                                <Input
                                  value={trunk.cost_max}
                                  onChange={(e) => handleRatingVendorChange(position, vendorIndex, "cost_max", e.target.value)}
                                  placeholder="Max"
                                  className="bg-zinc-800 border-zinc-700 w-12"
                                />
                              </div>
                            )}
                            {(vendors || []).length > 1 && (
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={() => removeVendorFromPosition(position, vendorIndex)}
                                className="shrink-0"
                              >
                                X
                              </Button>
                            )}
                          </div>
                        ))}
                        
                        {/* Add vendor to position button */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => addVendorToPosition(position)}
                          className="mt-1 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Vendor to Position {position}
                        </Button>
                      </div>
                    );
                  })}
                  
                  {/* Add new position button */}
                  <Button variant="outline" size="sm" onClick={addPosition} className="mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Position
                  </Button>
                </div>
                
                {/* Advanced Settings */}
                <div className="border-t border-zinc-700 pt-4 mt-4">
                  <Label className="text-zinc-400">Advanced Settings</Label>
                  <div className="mt-2 space-y-2">
                    {/* By Loss - available for both SMS and Voice */}
                    <div className="flex items-center gap-2">
                      <input
                        id="by_loss"
                        type="checkbox"
                        checked={formData.by_loss || false}
                        onChange={(e) => setFormData({ ...formData, by_loss: e.target.checked })}
                        className="w-4 h-4 accent-blue-500"
                      />
                      <label htmlFor="by_loss" className="text-white text-sm cursor-pointer">By Loss</label>
                    </div>
                    
                    {/* SMS-only Advanced Settings */}
                    {displayTab === "sms" && (
                      <>
                        {/* Enable MNP/HLR */}
                        <div className="flex items-center gap-2">
                          <input
                            id="enable_mnp_hlr"
                            type="checkbox"
                            checked={formData.enable_mnp_hlr || false}
                            onChange={(e) => setFormData({ ...formData, enable_mnp_hlr: e.target.checked, mnp_hlr_type: e.target.checked ? formData.mnp_hlr_type : "" })}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <label htmlFor="enable_mnp_hlr" className="text-white text-sm cursor-pointer">Enable MNP/HLR</label>
                        </div>
                        {formData.enable_mnp_hlr && (
                          <Select 
                            value={formData.mnp_hlr_type || ""} 
                            onValueChange={(value) => setFormData({ ...formData, mnp_hlr_type: value })}
                          >
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white w-40">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                              <SelectItem value="MNP" className="text-white">MNP</SelectItem>
                              <SelectItem value="HLR" className="text-white">HLR</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        
                        {/* Enable Threshold */}
                        <div className="flex items-center gap-2">
                          <input
                            id="enable_threshold"
                            type="checkbox"
                            checked={formData.enable_threshold || false}
                            onChange={(e) => setFormData({ ...formData, enable_threshold: e.target.checked, threshold_count: e.target.checked ? formData.threshold_count : "" })}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <label htmlFor="enable_threshold" className="text-white text-sm cursor-pointer">Enable Threshold</label>
                        </div>
                        {formData.enable_threshold && (
                          <div className="flex flex-col gap-2 mt-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={formData.threshold_count}
                                onChange={(e) => setFormData({ ...formData, threshold_count: e.target.value })}
                                placeholder="Number of messages"
                                className="bg-zinc-800 border-zinc-700 w-40"
                              />
                            </div>
                            {/* Via Vendor - Select from picked vendor trunks */}
                            <div className="flex items-center gap-2">
                              <Label className="text-zinc-400 text-sm">Via Vendor:</Label>
                              <Select
                                value={formData.via_vendor || ""}
                                onValueChange={(value) => setFormData({ ...formData, via_vendor: value })}
                              >
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white w-48">
                                  <SelectValue placeholder="Select vendor trunk" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700">
                                  {Object.entries(formData.rating_vendor_trunks || {}).flatMap(([position, vendors]) => 
                                    (vendors || []).filter(v => v.trunk).map((v, idx) => (
                                      <SelectItem key={`${position}-${idx}-${v.trunk}`} value={v.trunk} className="text-white">
                                        {v.trunk}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                        
                        {/* Enable Numbers Whitelisting */}
                        <div className="flex items-center gap-2">
                          <input
                            id="enable_whitelisting"
                            type="checkbox"
                            checked={formData.enable_whitelisting || false}
                            onChange={(e) => setFormData({ ...formData, enable_whitelisting: e.target.checked })}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <label htmlFor="enable_whitelisting" className="text-white text-sm cursor-pointer">Enable Numbers Whitelisting</label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Testing Fields */}
            {formData.request_type === "testing" && (
              <>
                {/* Test Type - Only show for Voice */}
                {displayTab === "voice" && (
                  <div>
                    <Label className="text-zinc-400">Test Type</Label>
                    <Select value={formData.test_type || ""} onValueChange={(v) => setFormData({ ...formData, test_type: v })}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue placeholder="Select test type" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="tool_test" className="text-white">Tool Test</SelectItem>
                        <SelectItem value="manual_test" className="text-white">Manual Test</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Test Description - Only show for Voice (optional) */}
                {displayTab === "voice" && (
                  <div>
                    <Label className="text-zinc-400">Test Description (Optional)</Label>
                    <Textarea
                      value={formData.test_description || ""}
                      onChange={(e) => setFormData({ ...formData, test_description: e.target.value })}
                      placeholder="Describe the test to be performed..."
                      rows={2}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-zinc-400">Destination(s) (e.g., Country - Network)</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="Destinations (e.g., Country - Network) (comma separated for multiple)"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400">Vendor Trunk(s) to Test</Label>
                  <p className="text-xs text-zinc-500 mb-2">At least one vendor trunk is required</p>
                  {formData.vendor_trunks.map((trunk, index) => (
                    <div key={index} className="mb-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
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
                                className="bg-zinc-800 border-zinc-700 w-32"
                              />
                              <Input
                                value={pair.content}
                                onChange={(e) => handleSidContentPairChange(index, pairIndex, "content", e.target.value)}
                                placeholder="Content"
                                className="bg-zinc-800 border-zinc-700 flex-1"
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
                            className="text-zinc-400"
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
                                className="bg-zinc-800 border-zinc-700 flex-1"
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
                            className="text-zinc-400"
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
                  <Label className="text-zinc-400">Enterprise</Label>
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
                  <Label className="text-zinc-400">Translation Type</Label>
                  <Select value={formData.translation_type} onValueChange={(v) => setFormData({ ...formData, translation_type: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="sid_change">SID Change</SelectItem>
                      <SelectItem value="content_change">Content Change</SelectItem>
                      <SelectItem value="sid_content_change">SID & Content Change</SelectItem>
                      <SelectItem value="remove">Remove from Content</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400">Trunk Type</Label>
                  <Select value={formData.trunk_type} onValueChange={(v) => setFormData({ ...formData, trunk_type: v, trunk_name: "" })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select trunk type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="customer">Customer Trunk</SelectItem>
                      <SelectItem value="vendor">Vendor Trunk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400">Trunk Name *</Label>
                  <Select value={formData.trunk_name || ""} onValueChange={(v) => setFormData({ ...formData, trunk_name: v })} required disabled={!formData.customer_id || !formData.trunk_type}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder={formData.trunk_type ? "Select trunk" : "Select trunk type first"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
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
                        <SelectItem key={trunk} value={trunk} className="text-white">{trunk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.translation_type === "sid_change" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-zinc-400">Old SID</Label>
                      <Input
                        value={formData.old_value}
                        onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                        placeholder="Current SID"
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-400">New SID</Label>
                      <Input
                        value={formData.new_value}
                        onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                        placeholder="New SID"
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                  </div>
                )}
                {formData.translation_type === "content_change" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-zinc-400">Old Content</Label>
                      <Input
                        value={formData.old_value}
                        onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                        placeholder="Current Content"
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-400">New Content</Label>
                      <Input
                        value={formData.new_value}
                        onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                        placeholder="New Content"
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                  </div>
                )}
                {formData.translation_type === "sid_content_change" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400">Old SID</Label>
                        <Input
                          value={formData.old_sid}
                          onChange={(e) => setFormData({ ...formData, old_sid: e.target.value })}
                          placeholder="Current SID"
                          className="bg-zinc-800 border-zinc-700"
                        />
                      </div>
                      <div>
                        <Label className="text-zinc-400">New SID</Label>
                        <Input
                          value={formData.new_sid}
                          onChange={(e) => setFormData({ ...formData, new_sid: e.target.value })}
                          placeholder="New SID"
                          className="bg-zinc-800 border-zinc-700"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label className="text-zinc-400">Old Content</Label>
                        <Input
                          value={formData.old_value}
                          onChange={(e) => setFormData({ ...formData, old_value: e.target.value })}
                          placeholder="Current Content"
                          className="bg-zinc-800 border-zinc-700"
                        />
                      </div>
                      <div>
                        <Label className="text-zinc-400">New Content</Label>
                        <Input
                          value={formData.new_value}
                          onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                          placeholder="New Content"
                          className="bg-zinc-800 border-zinc-700"
                        />
                      </div>
                    </div>
                  </>
                )}
                {formData.translation_type === "remove" && (
                  <div>
                    <Label className="text-zinc-400">Word to Remove</Label>
                    <Input
                      value={formData.word_to_remove}
                      onChange={(e) => setFormData({ ...formData, word_to_remove: e.target.value })}
                      placeholder="Word/phrase to remove from content"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.translation_destination}
                    onChange={(e) => setFormData({ ...formData, translation_destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </>
            )}

            {/* Investigation Fields */}
            {formData.request_type === "investigation" && (
              <>
                <div>
                  <Label className="text-zinc-400">Enterprise</Label>
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
                  <Label className="text-zinc-400">Enterprise Trunk *</Label>
                  <Select value={formData.customer_trunk || ""} onValueChange={(value) => setFormData({ ...formData, customer_trunk: value })} required disabled={!formData.customer_id}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder={formData.customer_id ? "Select enterprise trunk" : "Select enterprise first"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {(formData.customer_id 
                        ? enterprises.find(e => e.id === formData.customer_id)?.customer_trunks || []
                        : []
                      ).map((trunk) => (
                        <SelectItem key={trunk} value={trunk} className="text-white">{trunk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.investigation_destination}
                    onChange={(e) => setFormData({ ...formData, investigation_destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400">Issue Description</Label>
                  <Textarea
                    value={formData.issue_description}
                    onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                    placeholder="Describe the issue in detail..."
                    rows={3}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </>
            )}

            {/* LCR Fields - Voice Only */}
            {formData.request_type === "lcr" && (
              <>
                <div>
                  <Label className="text-zinc-400">Destination (e.g., Country - Network)</Label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="e.g., Ghana - MTN, Nigeria - All Networks"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400">Which LCR (PRM, STD or CC)</Label>
                  <Select value={formData.lcr_type} onValueChange={(v) => setFormData({ ...formData, lcr_type: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select LCR type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="PRM" className="text-white">PRM</SelectItem>
                      <SelectItem value="STD" className="text-white">STD</SelectItem>
                      <SelectItem value="CC" className="text-white">CC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400">Change</Label>
                  <Select value={formData.lcr_change} onValueChange={(v) => setFormData({ ...formData, lcr_change: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select change type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="add" className="text-white">Add</SelectItem>
                      <SelectItem value="drop" className="text-white">Drop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400">Vendor Trunk(s) *</Label>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
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
        <AlertDialogContent className="bg-zinc-900 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-zinc-400">
            Are you sure you want to delete this request? This action cannot be undone.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Request Details Dialog */}
      <Dialog open={viewRequestDialogOpen} onOpenChange={setViewRequestDialogOpen}>
        <DialogContent disableOutsideClick className="bg-zinc-900 border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-400">Request Type</Label>
                  <p className="text-white">{selectedRequest.request_type_label}</p>
                </div>
                <div>
                  <Label className="text-zinc-400">Department</Label>
                  <p className="text-white capitalize">{selectedRequest.department}</p>
                </div>
                <div>
                  <Label className="text-zinc-400">Priority</Label>
                  <p className="text-white">{selectedRequest.priority}</p>
                </div>
                <div>
                  <Label className="text-zinc-400">Status</Label>
                  <p className="text-white capitalize">{selectedRequest.status}</p>
                </div>
                {selectedRequest.request_type !== "testing" && selectedRequest.request_type !== "lcr" && (
                <div>
                  <Label className="text-zinc-400">Customer/Enterprise</Label>
                  <p className="text-white">{selectedRequest.customer || selectedRequest.enterprise?.name || "N/A"}</p>
                </div>
                )}
                <div>
                  <Label className="text-zinc-400">Created By</Label>
                  <p className="text-white">{selectedRequest.created_by_username}</p>
                </div>
                <div>
                  <Label className="text-zinc-400">Created At</Label>
                  <p className="text-white">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Request-specific fields */}
              {selectedRequest.request_type === "rating_routing" && (
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">Rating/Routing Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.customer && <p className="text-white">Customer: {selectedRequest.customer}</p>}
                    {(selectedRequest.customer_trunks || selectedRequest.customer_ids) && (
                      <div className="border border-zinc-700 rounded-lg p-4 mt-3 bg-zinc-800/30">
                        <Label className="text-zinc-300 font-semibold text-lg block mb-3">Enterprise Trunks</Label>
                        {(selectedRequest.customer_trunks || []).length > 0 ? (
                          <div className="space-y-2">
                            {(selectedRequest.customer_trunks || []).map((trunk, i) => (
                              <div key={i} className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                                <p className="text-white font-semibold">{trunk.trunk}</p>
                                <div className="flex flex-wrap gap-3 mt-1 text-sm">
                                  {trunk.destination && (
                                    <span className="text-zinc-300">
                                      <span className="text-zinc-500">Destination:</span> {trunk.destination}
                                    </span>
                                  )}
                                  {trunk.rate && (
                                    <span className="text-zinc-300">
                                      <span className="text-zinc-500">Rate:</span> {trunk.rate}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          selectedRequest.customer_trunk && (
                            <div className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                              <p className="text-white font-semibold">{selectedRequest.customer_trunk}</p>
                              {selectedRequest.destination && (
                                <p className="text-zinc-300 text-sm mt-1">
                                  <span className="text-zinc-500">Destination:</span> {selectedRequest.destination}
                                </p>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                    {selectedRequest.rating && <p className="text-white mt-3">Rating: {selectedRequest.rating}</p>}
                    {selectedRequest.routing && <p className="text-white mt-1">Routing: {selectedRequest.routing}</p>}
                    
                    {/* Advanced Settings */}
                    {(selectedRequest.by_loss || selectedRequest.enable_mnp_hlr || selectedRequest.enable_threshold || selectedRequest.enable_whitelisting) && (
                      <div className="border-t border-zinc-700 pt-2 mt-2">
                        <Label className="text-zinc-400">Advanced Settings:</Label>
                        {selectedRequest.by_loss && <p className="text-white ml-2">- By Loss</p>}
                        {selectedRequest.enable_mnp_hlr && <p className="text-white ml-2">- MNP/HLR: {selectedRequest.mnp_hlr_type}</p>}
                        {selectedRequest.enable_threshold && (
                          <>
                            <p className="text-white ml-2">- Threshold: {selectedRequest.threshold_count} messages</p>
                            <p className="text-white ml-2">- Via Vendor: {selectedRequest.via_vendor || "Not specified"}</p>
                          </>
                        )}
                        {selectedRequest.enable_whitelisting && <p className="text-white ml-2">- Numbers Whitelisting: Enabled</p>}
                      </div>
                    )}
                    
                    {(selectedRequest.rating_vendor_trunks || []).length > 0 && (
                      <div className="border border-zinc-700 rounded-lg p-4 mt-3 bg-zinc-800/30">
                        <Label className="text-zinc-300 font-semibold text-lg block mb-3">Vendor Trunks</Label>
                        {(() => {
                          // Group by position
                          const grouped = {};
                          (selectedRequest.rating_vendor_trunks || []).forEach(trunk => {
                            const pos = trunk.position || "1";
                            if (!grouped[pos]) grouped[pos] = [];
                            grouped[pos].push(trunk);
                          });
                          return Object.entries(grouped).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([position, trunks]) => (
                            <div key={position} className="mb-4 last:mb-0">
                              <div className="bg-zinc-700/50 rounded-md p-3 mb-2">
                                <p className="text-white font-medium text-base">{position === "1" ? "Position 1 (First)" : `Position ${position}`}</p>
                              </div>
                              {trunks.map((trunk, i) => (
                                <div key={i} className="ml-4 mt-2 p-2 bg-zinc-800/50 rounded border border-zinc-700">
                                  <p className="text-white font-semibold">{trunk.trunk}</p>
                                  <div className="flex flex-wrap gap-3 mt-1 text-sm">
                                    {trunk.percentage && (
                                      <span className="text-zinc-300">
                                        <span className="text-zinc-500">Percentage:</span> {trunk.percentage}%
                                      </span>
                                    )}
                                    {trunk.cost_type && (
                                      <span className="text-zinc-300">
                                        <span className="text-zinc-500">Cost Type:</span> {trunk.cost_type === "fixed" ? "Fixed" : "Range"}
                                      </span>
                                    )}
                                    {trunk.cost_min && (
                                      <span className="text-zinc-300">
                                        {trunk.cost_type === "fixed" ? (
                                          <><span className="text-zinc-500">Cost:</span> {trunk.cost_min}</>
                                        ) : (
                                          <><span className="text-zinc-500">Cost Range:</span> {trunk.cost_min} - {trunk.cost_max}</>
                                        )}
                                      </span>
                                    )}
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
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">Testing Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.destination && <p className="text-white">Destination: {selectedRequest.destination}</p>}
                    {(selectedRequest.test_type || selectedRequest.test_description) && (
                      <>
                        {selectedRequest.test_type && <p className="text-white">Test Type: {selectedRequest.test_type === "tool_test" ? "Tool Test" : selectedRequest.test_type === "manual_test" ? "Manual Test" : selectedRequest.test_type}</p>}
                        {selectedRequest.test_description && <p className="text-white">Test Description: {selectedRequest.test_description}</p>}
                      </>
                    )}
                    <div>
                      <Label className="text-zinc-400">Vendor Trunks:</Label>
                      {(selectedRequest.vendor_trunks || []).map((trunk, i) => (
                        <div key={i} className="text-white ml-2">
                          - {trunk.trunk}
                          {/* Show SID/Content only for SMS requests (Voice uses ANI/A-Numbers) */}
                          {selectedRequest.department === "sms" && (trunk.sid_content_pairs || []).length > 0 && (
                            <div className="ml-2 text-zinc-400">
                              SID/Content: {trunk.sid_content_pairs.map(p => `${p.sid}: ${p.content}`).join(", ")}
                            </div>
                          )}
                          {(trunk.ani_numbers || []).length > 0 && (
                            <div className="ml-2 text-zinc-400">
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
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">Translation Details</Label>
                  <div className="mt-2 space-y-2">
                    <p className="text-white">Translation Type: {selectedRequest.translation_type === "sid_change" ? "SID Change" : selectedRequest.translation_type === "content_change" ? "Content Change" : selectedRequest.translation_type === "sid_content_change" ? "SID & Content Change" : selectedRequest.translation_type === "remove" ? "Remove from Content" : selectedRequest.translation_type}</p>
                    <p className="text-white">Trunk Type: {selectedRequest.trunk_type}</p>
                    <p className="text-white">Trunk Name: {selectedRequest.trunk_name}</p>
                    {selectedRequest.translation_type === "remove" ? (
                      selectedRequest.word_to_remove && <p className="text-white">Word Removed: {selectedRequest.word_to_remove}</p>
                    ) : (
                      <>
                        {selectedRequest.old_value && <p className="text-white">Old Value: {selectedRequest.old_value}</p>}
                        {selectedRequest.new_value && <p className="text-white">New Value: {selectedRequest.new_value}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "investigation" && (
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">Investigation Details</Label>
                  <div className="mt-2 space-y-2">
                    {(selectedRequest.issue_types && selectedRequest.issue_types.length > 0) && (
                      <p className="text-white">Issue Type: {selectedRequest.issue_types.join(", ")}</p>
                    )}
                    {(selectedRequest.issue_other) && (
                      <p className="text-white">Other: {selectedRequest.issue_other}</p>
                    )}
                    <p className="text-white">Customer Trunk: {selectedRequest.customer_trunk}</p>
                    <p className="text-white">Destination: {selectedRequest.investigation_destination}</p>
                    {selectedRequest.issue_description && <p className="text-white">Description: {selectedRequest.issue_description}</p>}
                  </div>
                </div>
              )}

              {selectedRequest.request_type === "lcr" && (
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">LCR Details</Label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.lcr_type && <p className="text-white">LCR Type: {selectedRequest.lcr_type}</p>}
                    {selectedRequest.lcr_change && <p className="text-white">Change: {selectedRequest.lcr_change === "add" ? "Add" : selectedRequest.lcr_change === "drop" ? "Drop" : selectedRequest.lcr_change}</p>}
                    {selectedRequest.destination && <p className="text-white">Destination: {selectedRequest.destination}</p>}
                    <div>
                      <Label className="text-zinc-400">Vendor Trunks:</Label>
                      {(selectedRequest.vendor_trunks || []).map((trunk, i) => (
                        <p key={i} className="text-white ml-2">- {trunk.trunk}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.response && (
                <div className="border-t border-zinc-700 pt-4">
                  <Label className="text-zinc-400">Response</Label>
                  <p className="text-white mt-2">{selectedRequest.response}</p>
                </div>
              )}

              {/* Test Result Image */}
              {selectedRequest.test_result_image && (
                <div className="border-t border-zinc-700 pt-4 mt-4">
                  <Label className="text-zinc-400">Test Result Image</Label>
                  <div className="mt-2">
                    <img 
                      src={selectedRequest.test_result_image} 
                      alt="Test Result" 
                      className="max-w-full h-auto rounded border border-zinc-600"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Claim Dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent disableOutsideClick className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Claim Request</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-400">
            Are you sure you want to claim this request? Once claimed, only you can complete or reject it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimDialogOpen(false)} className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={submitClaim} 
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Response Dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent disableOutsideClick className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{responseType === "complete" ? "Complete" : "Reject"} Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Image upload for Testing requests when completing */}
            {selectedRequest?.request_type === "testing" && responseType === "complete" && (
              <div>
                <Label className="text-zinc-400">Attach Test Result Image (Optional)</Label>
                <div 
                  className="mt-2 border-2 border-dashed border-zinc-600 rounded-lg p-4 text-center cursor-pointer hover:border-zinc-400 transition-colors"
                  onClick={() => document.getElementById('responseImageInput').click()}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                          const blob = items[i].getAsFile();
                          handleImagePaste(blob);
                          break;
                        }
                      }
                    }
                  }}
                >
                  {responseImagePreview ? (
                    <div className="relative">
                      <img src={responseImagePreview} alt="Test result" className="max-h-48 mx-auto rounded" />
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResponseImage(null);
                          setResponseImagePreview(null);
                        }}
                        className="absolute top-0 right-0 bg-red-600 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="text-zinc-400">
                      <p>Click to upload or paste from clipboard</p>
                      <p className="text-xs text-zinc-500 mt-1">Supports: JPG, PNG, GIF</p>
                    </div>
                  )}
                </div>
                <input
                  id="responseImageInput"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setResponseImage(file);
                      setResponseImagePreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </div>
            )}
            <div>
              <Label className="text-zinc-400">Comment (Optional)</Label>
              <Textarea
                value={responseComment}
                onChange={(e) => setResponseComment(e.target.value)}
                placeholder={responseType === "complete" ? "Add completion notes..." : "Reason for rejection..."}
                className="bg-zinc-800 border-zinc-700 mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseDialogOpen(false)} className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={submitResponse} 
              className={responseType === "complete" ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"}
            >
              {responseType === "complete" ? "Complete" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
