import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import MultiFilter from "@/components/custom/MultiFilter";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [multiFilters, setMultiFilters] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formData, setFormData] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, users, multiFilters]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
      setFilteredUsers(response.data);
    } catch (error) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDepartments(response.data);
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Multi-filters
    if (multiFilters.length > 0) {
      filtered = filtered.filter(user => {
        return multiFilters.every(filter => {
          const { field, values } = filter;
          const searchValue = values[0]?.toLowerCase() || "";

          if (field === "role") {
            return values.includes(user.role);
          } else if (field === "department") {
            return values.includes(user.department);
          } else if (field === "name") {
            return user.name?.toLowerCase().includes(searchValue);
          } else if (field === "username") {
            return user.username?.toLowerCase().includes(searchValue);
          } else if (field === "email") {
            return user.email?.toLowerCase().includes(searchValue);
          } else if (field === "phone") {
            return user.phone?.toLowerCase().includes(searchValue);
          }
          return true;
        });
      });
    }

    if (!searchTerm) {
      setFilteredUsers(filtered);
      return;
    }

    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (user) =>
        user.username.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
  };

  const openCreateSheet = () => {
    setEditingUser(null);
    setFormData({ role: "noc" });
    setSheetOpen(true);
  };

  const openEditSheet = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      username: user.username || "",
      email: user.email || "",
      phone: user.phone || "",
      department_id: user.department_id || "",
      role: user.role || "noc",
      am_type: user.am_type || "",
    });
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");
      
      if (editingUser) {
        // Update existing user
        await axios.put(`${API}/users/${editingUser.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("User updated successfully");
      } else {
        // Create new user
        await axios.post(`${API}/auth/register`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("User created successfully");
      }
      
      setSheetOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || (editingUser ? "Failed to update user" : "Failed to create user"));
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/users/${userToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="users-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">Users</h1>
          <p className="text-zinc-400 mt-1">Manage system users and roles</p>
        </div>
        <Button
          onClick={openCreateSheet}
          data-testid="create-user-button"
          className="bg-emerald-500 text-black hover:bg-emerald-400 h-9"
        >
          <Plus className="h-4 w-4 mr-2" />
          New User
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search users by username, email, or role..."
            data-testid="search-users-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <MultiFilter
          filters={multiFilters}
          onFilterChange={setMultiFilters}
          customOptions={{
            role: [
              { value: "admin", label: "Admin" },
              { value: "am", label: "AM" },
              { value: "noc", label: "NOC" }
            ],
            department: [
              { value: "Admin", label: "Admin" },
              { value: "SMS Sales", label: "SMS Sales" },
              { value: "Voice Sales", label: "Voice Sales" },
              { value: "NOC", label: "NOC" }
            ]
          }}
          fields={["name", "username", "email", "phone", "role", "department"]}
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Username</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Phone</TableHead>
              <TableHead className="text-zinc-400">Department</TableHead>
              <TableHead className="text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className="border-white/5 hover:bg-zinc-800/50" data-testid="user-row">
                  <TableCell className="text-white font-medium">{user.name || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{user.username}</TableCell>
                  <TableCell className="text-zinc-300">{user.email || "-"}</TableCell>
                  <TableCell className="text-zinc-300">{user.phone || "-"}</TableCell>
                  <TableCell>
                    {user.department_id ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-500 border border-purple-500/30">
                        {departments.find(d => d.id === user.department_id)?.name || user.department_id}
                      </span>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditSheet(user)}
                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                        data-testid="edit-user-button"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setUserToDelete(user);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        data-testid="delete-user-button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* User Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-lg overflow-y-auto" data-testid="user-sheet">
          <SheetHeader>
            <SheetTitle className="text-white">{editingUser ? "Edit User" : "Create User"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
                      <Label>Full Name *</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="name-input"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                value={formData.username || ""}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="username-input"
                required
              />
            </div>

            <div className="space-y-2">
                <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                       data-testid="email-input"
                 required
              />
            </div>

            <div className="space-y-2">
                <Label>Phone *</Label>
              <Input
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Password {editingUser ? "" : "*"}</Label>
              <Input
                type="password"
                value={formData.password || ""}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="password-input"
                required={!editingUser}
              />
            </div>

            <div className="space-y-2">
              <Label>Department *</Label>
              <Select
                value={formData.department_id}
                onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                required
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="department-select">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name} ({dept.department_type || 'all'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Legacy role field - kept for backward compatibility */}
            <div className="space-y-2">
              <Label>Role (Legacy)</Label>
              <Select
                value={formData.role || "noc"}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="am">Account Manager</SelectItem>
                  <SelectItem value="noc">NOC Member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400" data-testid="save-user-button">
                {editingUser ? "Update User" : "Create User"}
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
            <AlertDialogTitle className="text-white">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete {userToDelete?.username}? This action cannot be undone.
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
