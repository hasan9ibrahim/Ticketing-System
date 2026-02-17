import { useState, useEffect } from "react";
import { toast } from "sonner";
import axios from "axios";
import { 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Search, 
  ChevronDown, 
  MessageSquare, 
  Phone,
  Check,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Traffic types for reference lists
const TRAFFIC_TYPES = [
  "OTP",
  "Spam",
  "Phishing",
  "Spam and Phishing",
  "Casino",
  "Clean Marketing",
  "Banking",
  "Other"
];

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

export default function ReferencesAndAlertsPage() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("sms");
  const [referenceLists, setReferenceLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addVendorDialogOpen, setAddVendorDialogOpen] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  const [availableVendors, setAvailableVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState("");
  
  // Form states
  const [newListForm, setNewListForm] = useState({
    name: "",
    destination: "",
    traffic_type: ""
  });
  const [newVendorForm, setNewVendorForm] = useState({
    trunk: "",
    cost: "",
    custom_field: "",
    is_working: true,
    is_backup: false
  });
  const [editingVendor, setEditingVendor] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      
      // Set default tab based on department type
      if (parsedUser.department_type === "sms") {
        setActiveTab("sms");
      } else if (parsedUser.department_type === "voice") {
        setActiveTab("voice");
      } else {
        setActiveTab("sms"); // Default for admin/noc
      }
    }
  }, []);

  useEffect(() => {
    if (user && activeTab) {
      fetchReferenceLists(activeTab);
    }
  }, [user, activeTab]);

  const fetchReferenceLists = async (type) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/references?list_type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReferenceLists(response.data || []);
    } catch (error) {
      console.error("Failed to fetch reference lists:", error);
      toast.error("Failed to load reference lists");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableVendors = async (listId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/references/${listId}/vendors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvailableVendors(response.data.available_vendors || []);
    } catch (error) {
      console.error("Failed to fetch available vendors:", error);
      toast.error("Failed to load available vendors");
    }
  };

  const handleCreateList = async () => {
    if (!newListForm.name || !newListForm.destination || !newListForm.traffic_type) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/references`,
        {
          ...newListForm,
          list_type: activeTab
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Reference list created successfully");
      setCreateDialogOpen(false);
      setNewListForm({ name: "", destination: "", traffic_type: "" });
      fetchReferenceLists(activeTab);
    } catch (error) {
      console.error("Failed to create reference list:", error);
      toast.error(error.response?.data?.detail || "Failed to create reference list");
    }
  };

  const handleDeleteList = async (listId) => {
    if (!confirm("Are you sure you want to delete this reference list?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/references/${listId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      toast.success("Reference list deleted successfully");
      fetchReferenceLists(activeTab);
    } catch (error) {
      console.error("Failed to delete reference list:", error);
      toast.error("Failed to delete reference list");
    }
  };

  const handleOpenAddVendor = async (list) => {
    setSelectedList(list);
    setNewVendorForm({
      trunk: "",
      cost: "",
      custom_field: "",
      is_working: true,
      is_backup: false
    });
    await fetchAvailableVendors(list.id);
    setAddVendorDialogOpen(true);
  };

  const handleAddVendor = async () => {
    if (!newVendorForm.trunk) {
      toast.error("Please select a vendor");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/references/${selectedList.id}/vendors`,
        newVendorForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Vendor added successfully");
      setAddVendorDialogOpen(false);
      fetchReferenceLists(activeTab);
    } catch (error) {
      console.error("Failed to add vendor:", error);
      toast.error(error.response?.data?.detail || "Failed to add vendor");
    }
  };

  const handleUpdateVendor = async (listId, vendorIndex, updates) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/references/${listId}/vendors/${vendorIndex}`,
        updates,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Vendor updated successfully");
      fetchReferenceLists(activeTab);
      setEditingVendor(null);
    } catch (error) {
      console.error("Failed to update vendor:", error);
      toast.error("Failed to update vendor");
    }
  };

  const handleDeleteVendor = async (listId, vendorIndex) => {
    if (!confirm("Are you sure you want to remove this vendor?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/references/${listId}/vendors/${vendorIndex}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      toast.success("Vendor removed successfully");
      fetchReferenceLists(activeTab);
    } catch (error) {
      console.error("Failed to remove vendor:", error);
      toast.error("Failed to remove vendor");
    }
  };

  const filteredAvailableVendors = availableVendors.filter(vendor =>
    vendor.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  // Check if user can access a tab
  const canAccessTab = (tab) => {
    if (!user) return false;
    const deptType = user.department_type;
    const role = user.role;
    
    // Admin and NOC can access both
    if (role === "admin" || role === "noc") return true;
    
    // AMs can only access their department type
    if (deptType === "all") return true;
    return deptType === tab;
  };

  // Get visible tabs based on user permissions
  const getVisibleTabs = () => {
    const tabs = [];
    if (canAccessTab("sms")) tabs.push("sms");
    if (canAccessTab("voice")) tabs.push("voice");
    return tabs;
  };

  const visibleTabs = getVisibleTabs();

  // Auto-switch tab if current tab is not accessible
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs]);

  if (!user) {
    return <div className="p-8 text-center text-zinc-400">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">References and Alerts</h1>
          <p className="text-zinc-400">Manage working and backup vendor references</p>
        </div>
        <Button 
          onClick={() => setCreateDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create New List
        </Button>
      </div>

      {/* Tabs */}
      {visibleTabs.length > 1 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-800">
            {visibleTabs.includes("sms") && (
              <TabsTrigger value="sms" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </TabsTrigger>
            )}
            {visibleTabs.includes("voice") && (
              <TabsTrigger value="voice" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Voice
              </TabsTrigger>
            )}
          </TabsList>

          {visibleTabs.includes("sms") && (
            <TabsContent value="sms" className="mt-4">
              <ReferenceListsTable
                lists={referenceLists.filter(l => l.list_type === "sms")}
                loading={loading}
                onDelete={handleDeleteList}
                onAddVendor={handleOpenAddVendor}
                onUpdateVendor={handleUpdateVendor}
                onDeleteVendor={handleDeleteVendor}
                listType="sms"
              />
            </TabsContent>
          )}

          {visibleTabs.includes("voice") && (
            <TabsContent value="voice" className="mt-4">
              <ReferenceListsTable
                lists={referenceLists.filter(l => l.list_type === "voice")}
                loading={loading}
                onDelete={handleDeleteList}
                onAddVendor={handleOpenAddVendor}
                onUpdateVendor={handleUpdateVendor}
                onDeleteVendor={handleDeleteVendor}
                listType="voice"
              />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <ReferenceListsTable
          lists={referenceLists}
          loading={loading}
          onDelete={handleDeleteList}
          onAddVendor={handleOpenAddVendor}
          onUpdateVendor={handleUpdateVendor}
          onDeleteVendor={handleDeleteVendor}
          listType={activeTab}
        />
      )}

      {/* Create List Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Reference List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-300">List Name</Label>
              <Input
                value={newListForm.name}
                onChange={(e) => setNewListForm({ ...newListForm, name: e.target.value })}
                placeholder="e.g., USA OTP Working Vendors"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-300">Destination</Label>
              <Input
                value={newListForm.destination}
                onChange={(e) => setNewListForm({ ...newListForm, destination: e.target.value })}
                placeholder="e.g., USA, UK, UAE"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-300">Traffic Type</Label>
              <Select
                value={newListForm.traffic_type}
                onValueChange={(value) => setNewListForm({ ...newListForm, traffic_type: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select traffic type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {TRAFFIC_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-white">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="bg-zinc-800 text-white hover:bg-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleCreateList} className="bg-emerald-600 hover:bg-emerald-700">
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Vendor Dialog */}
      <Dialog open={addVendorDialogOpen} onOpenChange={setAddVendorDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Vendor to {selectedList?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-300">Select Vendor</Label>
              <div className="relative">
                <Input
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Search vendors..."
                  className="bg-zinc-800 border-zinc-700 text-white pr-10"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto border border-zinc-700 rounded-md">
                {filteredAvailableVendors.length === 0 ? (
                  <div className="p-4 text-zinc-400 text-center">
                    {vendorSearch ? "No vendors found" : "No available vendors"}
                  </div>
                ) : (
                  filteredAvailableVendors.map((vendor) => (
                    <div
                      key={vendor}
                      onClick={() => setNewVendorForm({ ...newVendorForm, trunk: vendor })}
                      className={`p-3 cursor-pointer hover:bg-zinc-800 flex items-center justify-between ${
                        newVendorForm.trunk === vendor ? "bg-zinc-800" : ""
                      }`}
                    >
                      <span className="text-white">{vendor}</span>
                      {newVendorForm.trunk === vendor && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label className="text-zinc-300">Cost (optional)</Label>
              <Input
                value={newVendorForm.cost}
                onChange={(e) => setNewVendorForm({ ...newVendorForm, cost: e.target.value })}
                placeholder="e.g., 0.005"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-300">Custom Field (optional)</Label>
              <Input
                value={newVendorForm.custom_field}
                onChange={(e) => setNewVendorForm({ ...newVendorForm, custom_field: e.target.value })}
                placeholder="Additional info"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newVendorForm.is_working}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, is_working: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-zinc-300">Working</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newVendorForm.is_backup}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, is_backup: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-zinc-300">Backup</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVendorDialogOpen(false)} className="bg-zinc-800 text-white hover:bg-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleAddVendor} className="bg-emerald-600 hover:bg-emerald-700">
              Add Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Reference Lists Table Component
function ReferenceListsTable({ 
  lists, 
  loading, 
  onDelete, 
  onAddVendor, 
  onUpdateVendor,
  onDeleteVendor,
  listType 
}) {
  const [expandedLists, setExpandedLists] = useState({});

  const toggleExpand = (listId) => {
    setExpandedLists(prev => ({
      ...prev,
      [listId]: !prev[listId]
    }));
  };

  if (loading) {
    return <div className="text-center py-8 text-zinc-400">Loading...</div>;
  }

  if (lists.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Reference Lists</h3>
          <p className="text-zinc-400">Create your first reference list to get started</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {lists.map((list) => (
        <Card key={list.id} className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleExpand(list.id)}
                  className="p-1 hover:bg-zinc-800 rounded"
                >
                  <ChevronDown 
                    className={`h-5 w-5 text-zinc-400 transition-transform ${
                      expandedLists[list.id] ? "rotate-180" : ""
                    }`} 
                  />
                </button>
                <div>
                  <CardTitle className="text-white text-lg">{list.name}</CardTitle>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                      {list.destination}
                    </Badge>
                    <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                      {list.traffic_type}
                    </Badge>
                    <Badge className={`${listType === 'sms' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                      {listType.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddVendor(list)}
                  className="border-zinc-700 hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Vendor
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(list.id)}
                  className="border-red-700 text-red-400 hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2 ml-14">
              Created by {list.created_by_username} on {new Date(list.created_at).toLocaleDateString()}
            </p>
          </CardHeader>
          
          {expandedLists[list.id] && list.vendors && list.vendors.length > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Vendor Trunk</TableHead>
                    <TableHead className="text-zinc-400">Cost</TableHead>
                    <TableHead className="text-zinc-400">Custom Field</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                    <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.vendors.map((vendor, index) => (
                    <VendorRow
                      key={`${list.id}-${index}`}
                      vendor={vendor}
                      listId={list.id}
                      vendorIndex={index}
                      onUpdate={onUpdateVendor}
                      onDelete={onDeleteVendor}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

// Vendor Row Component with inline editing
function VendorRow({ vendor, listId, vendorIndex, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    cost: vendor.cost || "",
    custom_field: vendor.custom_field || "",
    is_working: vendor.is_working,
    is_backup: vendor.is_backup
  });

  const handleSave = () => {
    onUpdate(listId, vendorIndex, editForm);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditForm({
      cost: vendor.cost || "",
      custom_field: vendor.custom_field || "",
      is_working: vendor.is_working,
      is_backup: vendor.is_backup
    });
    setEditing(false);
  };

  return (
    <TableRow className="border-zinc-800">
      <TableCell className="text-white font-medium">{vendor.trunk}</TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={editForm.cost}
            onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white h-8"
            placeholder="Cost"
          />
        ) : (
          <span className="text-zinc-300">{vendor.cost || "-"}</span>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={editForm.custom_field}
            onChange={(e) => setEditForm({ ...editForm, custom_field: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white h-8"
            placeholder="Custom field"
          />
        ) : (
          <span className="text-zinc-300">{vendor.custom_field || "-"}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {vendor.is_working && (
            <Badge className="bg-green-600">Working</Badge>
          )}
          {vendor.is_backup && (
            <Badge className="bg-amber-600">Backup</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              className="text-emerald-400 hover:text-emerald-300"
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="text-zinc-400 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="text-zinc-400 hover:text-zinc-300"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(listId, vendorIndex)}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
