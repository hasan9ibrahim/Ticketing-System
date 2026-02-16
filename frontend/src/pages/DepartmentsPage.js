import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterDepartments();
  }, [searchTerm, departments]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDepartments(response.data);
      setFilteredDepartments(response.data);
    } catch (error) {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  const filterDepartments = () => {
    if (!searchTerm) {
      setFilteredDepartments(departments);
      return;
    }
    const filtered = departments.filter((dept) =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDepartments(filtered);
  };

  const openCreateSheet = () => {
    setEditingDepartment(null);
    setFormData({
      name: "",
      description: "",
      department_type: "all",  // Default to all
      can_view_enterprises: true,
      can_edit_enterprises: false,
      can_create_enterprises: false,
      can_delete_enterprises: false,
      can_view_tickets: true,
      can_create_tickets: false,
      can_edit_tickets: false,
      can_delete_tickets: false,
      can_view_users: false,
      can_edit_users: false,
      can_view_all_tickets: true,
    });
    setSheetOpen(true);
  };

  const openEditSheet = (dept) => {
    setEditingDepartment(dept);
    setFormData(dept);
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      if (editingDepartment) {
        await axios.put(`${API}/departments/${editingDepartment.id}`, formData, { headers });
        toast.success("Department updated successfully");
      } else {
        await axios.post(`${API}/departments`, formData, { headers });
        toast.success("Department created successfully");
      }
      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save department");
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/departments/${departmentToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Department deleted successfully");
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete department");
    }
  };

  const isDefaultDepartment = (deptId) => {
    return ["dept_admin", "dept_sms_sales", "dept_voice_sales", "dept_noc"].includes(deptId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading departments...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-white">Departments</h1>
          <p className="text-zinc-400 mt-1">Manage departments and permissions</p>
        </div>
        <Button onClick={openCreateSheet} className="bg-emerald-500 text-black hover:bg-emerald-400 h-9">
          <Plus className="h-4 w-4 mr-2" />New Department
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search departments..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Type</TableHead>
              <TableHead className="text-zinc-400">Description</TableHead>
              <TableHead className="text-zinc-400">Enterprises</TableHead>
              <TableHead className="text-zinc-400">Tickets</TableHead>
              <TableHead className="text-zinc-400">Users</TableHead>
              <TableHead className="text-zinc-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length > 0 ? (
              filteredDepartments.map((dept) => (
                <TableRow key={dept.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell className="text-white font-medium">
                    {dept.name}
                    {isDefaultDepartment(dept.id) && (
                      <span className="ml-2 text-xs text-zinc-500">(Default)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {dept.department_type === "all" ? "All" : dept.department_type === "sms" ? "SMS" : "Voice"}
                  </TableCell>
                  <TableCell className="text-zinc-400">{dept.description || "-"}</TableCell>
                  <TableCell className="text-zinc-400">
                    <div className="flex space-x-1 text-xs">
                      {dept.can_view_enterprises && <span className="text-emerald-500">View</span>}
                      {dept.can_edit_enterprises && <span className="text-emerald-500">Edit</span>}
                      {dept.can_create_enterprises && <span className="text-emerald-500">Create</span>}
                      {dept.can_delete_enterprises && <span className="text-emerald-500">Delete</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    <div className="flex space-x-1 text-xs">
                      {dept.can_view_tickets && <span className="text-emerald-500">View</span>}
                      {dept.can_create_tickets && <span className="text-emerald-500">Create</span>}
                      {dept.can_edit_tickets && <span className="text-emerald-500">Edit</span>}
                      {dept.can_delete_tickets && <span className="text-emerald-500">Delete</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    <div className="flex space-x-1 text-xs">
                      {dept.can_view_users && <span className="text-emerald-500">View</span>}
                      {dept.can_edit_users && <span className="text-emerald-500">Edit</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditSheet(dept)}
                        className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                      >
                        Edit
                      </Button>
                      {!isDefaultDepartment(dept.id) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDepartmentToDelete(dept);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  No departments found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">
              {editingDepartment ? "Edit Department" : "Create Department"}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Department Name *</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            {/* Department Type */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.department_type || "all"}
                onValueChange={(value) => setFormData({ ...formData, department_type: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select department type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="all" className="text-zinc-300">All (SMS & Voice)</SelectItem>
                  <SelectItem value="sms" className="text-zinc-300">SMS Only</SelectItem>
                  <SelectItem value="voice" className="text-zinc-300">Voice Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">Determines which tickets this department can access</p>
            </div>

            {/* Enterprises Permissions */}
            <div className="border-t border-zinc-700 pt-4">
              <Label className="text-zinc-400 mb-2 block">Enterprises Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_view_enterprises"
                    checked={formData.can_view_enterprises}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_view_enterprises: checked })}
                  />
                  <label htmlFor="can_view_enterprises" className="text-sm text-zinc-300">View</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_edit_enterprises"
                    checked={formData.can_edit_enterprises}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_edit_enterprises: checked })}
                  />
                  <label htmlFor="can_edit_enterprises" className="text-sm text-zinc-300">Edit</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_create_enterprises"
                    checked={formData.can_create_enterprises}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_create_enterprises: checked })}
                  />
                  <label htmlFor="can_create_enterprises" className="text-sm text-zinc-300">Create</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_delete_enterprises"
                    checked={formData.can_delete_enterprises}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_delete_enterprises: checked })}
                  />
                  <label htmlFor="can_delete_enterprises" className="text-sm text-zinc-300">Delete</label>
                </div>
              </div>
            </div>

            {/* Tickets Permissions */}
            <div className="border-t border-zinc-700 pt-4">
              <Label className="text-zinc-400 mb-2 block">Tickets Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_view_tickets"
                    checked={formData.can_view_tickets}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_view_tickets: checked })}
                  />
                  <label htmlFor="can_view_tickets" className="text-sm text-zinc-300">View</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_create_tickets"
                    checked={formData.can_create_tickets}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_create_tickets: checked })}
                  />
                  <label htmlFor="can_create_tickets" className="text-sm text-zinc-300">Create</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_edit_tickets"
                    checked={formData.can_edit_tickets}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_edit_tickets: checked })}
                  />
                  <label htmlFor="can_edit_tickets" className="text-sm text-zinc-300">Edit</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_delete_tickets"
                    checked={formData.can_delete_tickets}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_delete_tickets: checked })}
                  />
                  <label htmlFor="can_delete_tickets" className="text-sm text-zinc-300">Delete</label>
                </div>
              </div>
            </div>

            {/* Users Permissions */}
            <div className="border-t border-zinc-700 pt-4">
              <Label className="text-zinc-400 mb-2 block">Users Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_view_users"
                    checked={formData.can_view_users}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_view_users: checked })}
                  />
                  <label htmlFor="can_view_users" className="text-sm text-zinc-300">View</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="can_edit_users"
                    checked={formData.can_edit_users}
                    onCheckedChange={(checked) => setFormData({ ...formData, can_edit_users: checked })}
                  />
                  <label htmlFor="can_edit_users" className="text-sm text-zinc-300">Edit</label>
                </div>
              </div>
            </div>

            {/* Other Permissions */}
            <div className="border-t border-zinc-700 pt-4">
              <Label className="text-zinc-400 mb-2 block">Other Permissions</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can_view_all_tickets"
                  checked={formData.can_view_all_tickets}
                  onCheckedChange={(checked) => setFormData({ ...formData, can_view_all_tickets: checked })}
                />
                <label htmlFor="can_view_all_tickets" className="text-sm text-zinc-300">View All Tickets (not just assigned)</label>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400">
                {editingDepartment ? "Update Department" : "Create Department"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Department</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete {departmentToDelete?.name}? This action cannot be undone.
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
    </div>
  );
}
