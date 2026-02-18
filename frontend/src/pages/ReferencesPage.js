import { useState, useEffect } from "react";
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
} from "lucide-react";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`;

// Traffic types as per backend
const TRAFFIC_TYPES = [
  "OTP",
  "Phishing",
  "Spam",
  "Spam and Phishing",
  "Casino",
  "Clean Marketing",
  "Banking",
  "Other"
];

export default function ReferencesPage() {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const departmentType = user?.department_type || "all";
  const [activeSection, setActiveSection] = useState(departmentType === "voice" ? "voice" : departmentType === "sms" ? "sms" : "sms");
  const [smsLists, setSmsLists] = useState([]);
  const [voiceLists, setVoiceLists] = useState([]);
  const [smsVendorTrunks, setSmsVendorTrunks] = useState([]);
  const [voiceVendorTrunks, setVoiceVendorTrunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    destination: "",
    traffic_type: "",
    vendor_entries: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      
      // Fetch SMS data
      const smsTrunksRes = await axios.get(`${API}/references/trunks/sms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSmsVendorTrunks(smsTrunksRes.data.vendor_trunks || []);
      
      const smsListsRes = await axios.get(`${API}/references/sms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log("SMS Lists response:", smsListsRes.data);
      setSmsLists(smsListsRes.data || []);
      
      // Fetch Voice data
      const voiceTrunksRes = await axios.get(`${API}/references/trunks/voice`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVoiceVendorTrunks(voiceTrunksRes.data.vendor_trunks || []);
      
      const voiceListsRes = await axios.get(`${API}/references/voice`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVoiceLists(voiceListsRes.data || []);
      
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
        vendor_entries: list.vendor_entries || []
      });
    } else {
      setEditingList(null);
      setFormData({
        name: "",
        destination: "",
        traffic_type: "",
        vendor_entries: []
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");
      
      if (!formData.name || !formData.destination || !formData.traffic_type) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please fill in all required fields"
        });
        return;
      }

      if (editingList) {
        // Update existing list
        await axios.put(
          `${API}/references/${editingList.id}`,
          {
            name: formData.name,
            destination: formData.destination,
            traffic_type: formData.traffic_type,
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
            traffic_type: formData.traffic_type,
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

  const filteredVendorTrunks = (activeSection === "sms" ? smsVendorTrunks : voiceVendorTrunks)
    .filter(trunk => trunk.toLowerCase().includes(searchQuery.toLowerCase()));

  const filterLists = (lists) => {
    return lists.filter(list => 
      list.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      list.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      list.traffic_type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const renderReferenceTable = (list) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-zinc-800 border-zinc-700">
          <TableHead className="w-8">
            <GripVertical className="h-4 w-4 text-zinc-500" />
          </TableHead>
          <TableHead className="text-zinc-300">Vendor Trunk</TableHead>
          <TableHead className="text-zinc-300">Cost</TableHead>
          <TableHead className="text-zinc-300">Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(list.vendor_entries || []).map((vendor, idx) => (
          <TableRow key={idx} className="border-zinc-700">
            <TableCell className="w-8">
              <GripVertical className="h-4 w-4 text-zinc-500 cursor-grab" />
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

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search lists by name, destination, or traffic type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
      </div>

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
                    className="mt-4"
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
                    className="mt-4"
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
                    {TRAFFIC_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-white focus:bg-zinc-700 focus:text-white">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="destination" className="text-white">Destination *</Label>
              <Input
                id="destination"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                placeholder="e.g., USA, UK, UAE, etc."
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                        <span className="text-sm font-medium text-white">{vendor.trunk}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVendorToggle(vendor.trunk)}
                          className="text-red-400 hover:text-red-300 h-6 px-2"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
                            value={vendor.custom_field || ""}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
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
    </div>
  );
}
