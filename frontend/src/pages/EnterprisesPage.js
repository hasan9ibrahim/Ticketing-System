import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function EnterprisesPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [filteredEnterprises, setFilteredEnterprises] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEnterprise, setEditingEnterprise] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [enterpriseToDelete, setEnterpriseToDelete] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const isAM = currentUser?.role === "am";
  const isAdmin = currentUser?.role === "admin";
  const canDelete = isAdmin;
  const canCreate = isAdmin || currentUser?.role === "noc";
  
  // Trunk management
  const [customerTrunks, setCustomerTrunks] = useState([]);
  const [vendorTrunks, setVendorTrunks] = useState([]);
  const [newCustomerTrunk, setNewCustomerTrunk] = useState("");
  const [newVendorTrunk, setNewVendorTrunk] = useState("");

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { filterEnterprises(); }, [searchTerm, enterprises]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [enterprisesRes, usersRes, userRes] = await Promise.all([
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/users`, { headers }),
        axios.get(`${API}/auth/me`, { headers }),
      ]);
      setEnterprises(enterprisesRes.data);
      setFilteredEnterprises(enterprisesRes.data);
      setUsers(usersRes.data.filter((u) => u.role === "am"));
      setCurrentUser(userRes.data);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const filterEnterprises = () => {
    if (!searchTerm) {
      setFilteredEnterprises(enterprises);
      return;
    }
    const filtered = enterprises.filter(
      (ent) =>
        ent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ent.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredEnterprises(filtered);
  };

  const openCreateSheet = () => {
    setEditingEnterprise(null);
    setFormData({});
    setCustomerTrunks([]);
    setVendorTrunks([]);
    setNewCustomerTrunk("");
    setNewVendorTrunk("");
    setSheetOpen(true);
  };

  const openEditSheet = (enterprise) => {
    setEditingEnterprise(enterprise);
    setFormData(enterprise);
    setCustomerTrunks(enterprise.customer_trunks || []);
    setVendorTrunks(enterprise.vendor_trunks || []);
    setNewCustomerTrunk("");
    setNewVendorTrunk("");
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      // For AMs, only allow updating contact fields
      if (isAM && editingEnterprise) {
        const contactData = {
          contact_person: formData.contact_person,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          noc_emails: formData.noc_emails,
          notes: formData.notes
        };
        await axios.put(`${API}/clients/${editingEnterprise.id}/contact`, contactData, { headers });
        toast.success("Contact updated successfully");
        setSheetOpen(false);
        fetchData();
        return;
      }
      
      const dataToSubmit = {
        ...formData,
        customer_trunks: customerTrunks,
        vendor_trunks: vendorTrunks
      };
      if (editingEnterprise) {
        await axios.put(`${API}/clients/${editingEnterprise.id}`, dataToSubmit, { headers });
        toast.success("Enterprise updated successfully");
      } else {
        await axios.post(`${API}/clients`, dataToSubmit, { headers });
        toast.success("Enterprise created successfully");
      }
      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save enterprise");
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/clients/${enterpriseToDelete.id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Enterprise deleted successfully");
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete enterprise");
    }
  };

  // Trunk management functions
  const addCustomerTrunk = () => {
    if (newCustomerTrunk.trim() && !customerTrunks.includes(newCustomerTrunk.trim())) {
      setCustomerTrunks([...customerTrunks, newCustomerTrunk.trim()]);
      setNewCustomerTrunk("");
    }
  };

  const removeCustomerTrunk = (index) => {
    setCustomerTrunks(customerTrunks.filter((_, i) => i !== index));
  };

  const addVendorTrunk = () => {
    if (newVendorTrunk.trim() && !vendorTrunks.includes(newVendorTrunk.trim())) {
      setVendorTrunks([...vendorTrunks, newVendorTrunk.trim()]);
      setNewVendorTrunk("");
    }
  };

  const removeVendorTrunk = (index) => {
    setVendorTrunks(vendorTrunks.filter((_, i) => i !== index));
  };

  // Separate enterprises by type
  const smsEnterprises = filteredEnterprises.filter(ent => ent.enterprise_type === "sms");
  const voiceEnterprises = filteredEnterprises.filter(ent => ent.enterprise_type === "voice");

  const renderEnterpriseTable = (enterprisesList, title, emptyMessage) => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-400">Enterprise Name</TableHead>
              <TableHead className="text-zinc-400">Tier</TableHead>
              <TableHead className="text-zinc-400">Contact Person</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Phone</TableHead>
              <TableHead className="text-zinc-400">Assigned AM</TableHead>
              <TableHead className="text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enterprisesList.length > 0 ? enterprisesList.map((ent) => {
              const assignedAM = users.find((u) => u.id === ent.assigned_am_id);
              return (
                <TableRow key={ent.id} className="border-white/5 hover:bg-zinc-800/50" data-testid="enterprise-row">
                  <TableCell className="text-white font-medium">{ent.name}</TableCell>
                  <TableCell className="text-zinc-300">{ent.tier || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{ent.contact_person || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{ent.contact_email || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{ent.contact_phone || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{assignedAM?.username || "Unassigned"}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditSheet(ent)} className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10">Edit</Button>
                      {canDelete && <Button size="sm" variant="ghost" onClick={() => { setEnterpriseToDelete(ent); setDeleteDialogOpen(true); }} className="text-red-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }) : <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-500">{emptyMessage}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderTrunksTable = (trunks, onRemove, title, newValue, setNewValue, onAdd) => (
    <div className="space-y-2">
      <Label className="text-zinc-300">{title}</Label>
      <div className="flex space-x-2">
        <Input 
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          onKeyPress={(e) => e.key === 'Enter' && onAdd()}
          placeholder={`Add ${title.toLowerCase().replace(' ', '')}`}
          className="bg-zinc-800 border-zinc-700 text-white" 
        />
        <Button type="button" onClick={onAdd} size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {trunks.length > 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-md max-h-40 overflow-y-auto">
          <Table>
            <TableBody>
              {trunks.map((trunk, index) => (
                <TableRow key={index} className="border-zinc-700">
                  <TableCell className="text-white">{trunk}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => onRemove(index)} className="text-red-500 hover:text-red-400 h-6 w-6 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-zinc-500 text-sm py-2">No trunks added yet</div>
      )}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-full"><div className="text-emerald-500">Loading enterprises...</div></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="enterprises-page">
      <div className="flex items-center justify-between">
        <div><h1 className="text-4xl font-bold text-white">Enterprises</h1><p className="text-zinc-400 mt-1">Manage enterprise accounts and assignments</p></div>
        {canCreate && <Button onClick={openCreateSheet} data-testid="create-enterprise-button" className="bg-emerald-500 text-black hover:bg-emerald-400 h-9"><Plus className="h-4 w-4 mr-2" />New Enterprise</Button>}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input placeholder="Search enterprises..." data-testid="search-enterprises-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500" />
      </div>

      {/* SMS Enterprises Table */}
      {renderEnterpriseTable(smsEnterprises, "SMS Enterprises", "No SMS enterprises found")}

      {/* Voice Enterprises Table */}
      {renderEnterpriseTable(voiceEnterprises, "Voice Enterprises", "No Voice enterprises found")}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-2xl overflow-y-auto" data-testid="enterprise-sheet">
          <SheetHeader><SheetTitle className="text-white">{editingEnterprise ? "Edit Enterprise" : "Create Enterprise"}</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2"><Label>Enterprise Name *</Label><Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" data-testid="enterprise-name-input" required /></div>
            <div className="space-y-2"><Label>SMS/Voice *</Label><Select value={formData.enterprise_type || ""} onValueChange={(value) => setFormData({ ...formData, enterprise_type: value })} required><SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="enterprise-type-select"><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="sms">SMS</SelectItem><SelectItem value="voice">Voice</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Tier *</Label><Select value={formData.tier} onValueChange={(value) => setFormData({ ...formData, tier: value })} required><SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="tier-select"><SelectValue placeholder="Select tier" /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="Tier 1">Tier 1</SelectItem><SelectItem value="Tier 2">Tier 2</SelectItem><SelectItem value="Tier 3">Tier 3</SelectItem><SelectItem value="Tier 4">Tier 4</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Contact Person</Label><Input value={formData.contact_person || ""} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" /></div>
            <div className="space-y-2"><Label>Contact Email *</Label><Input type="email" value={formData.contact_email || ""} onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" required /></div>
            <div className="space-y-2"><Label>Contact Phone</Label><Input value={formData.contact_phone || ""} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" /></div>
            <div className="space-y-2"><Label>Assigned Account Manager</Label><Select value={formData.assigned_am_id} onValueChange={(value) => setFormData({ ...formData, assigned_am_id: value })}><SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="assigned-am-select"><SelectValue placeholder="Select AM" /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700">{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.username}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>NOC Emails *</Label><Textarea value={formData.noc_emails || ""} onChange={(e) => setFormData({ ...formData, noc_emails: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="email1@example.com, email2@example.com" required /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" /></div>
            
            {/* Customer Trunks and Vendor Trunks in adjacent columns */}
            <div className="grid grid-cols-2 gap-4">
              {renderTrunksTable(
                customerTrunks, 
                removeCustomerTrunk, 
                "Customer Trunks", 
                newCustomerTrunk, 
                setNewCustomerTrunk, 
                addCustomerTrunk
              )}
              {renderTrunksTable(
                vendorTrunks, 
                removeVendorTrunk, 
                "Vendor Trunks", 
                newVendorTrunk, 
                setNewVendorTrunk, 
                addVendorTrunk
              )}
            </div>
            
            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400" data-testid="save-enterprise-button">{editingEnterprise ? "Update Enterprise" : "Create Enterprise"}</Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader><AlertDialogTitle className="text-white">Delete Enterprise</AlertDialogTitle><AlertDialogDescription className="text-zinc-400">Are you sure you want to delete {enterpriseToDelete?.name}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-white hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 text-white hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
