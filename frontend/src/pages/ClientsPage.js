import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterClients();
  }, [searchTerm, clients]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [clientsRes, usersRes] = await Promise.all([
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/users`, { headers }),
      ]);

      setClients(clientsRes.data);
      setFilteredClients(clientsRes.data);
      setUsers(usersRes.data.filter((u) => u.role === "am"));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const filterClients = () => {
    if (!searchTerm) {
      setFilteredClients(clients);
      return;
    }

    const filtered = clients.filter(
      (client) =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredClients(filtered);
  };

  const openCreateSheet = () => {
    setEditingClient(null);
    setFormData({});
    setSheetOpen(true);
  };

  const openEditSheet = (client) => {
    setEditingClient(client);
    setFormData(client);
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      if (editingClient) {
        await axios.put(`${API}/clients/${editingClient.id}`, formData, { headers });
        toast.success("Client updated successfully");
      } else {
        await axios.post(`${API}/clients`, formData, { headers });
        toast.success("Client created successfully");
      }

      setSheetOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save client");
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/clients/${clientToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Client deleted successfully");
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete client");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading clients...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="clients-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">Clients</h1>
          <p className="text-zinc-400 mt-1">Manage client accounts and assignments</p>
        </div>
        <Button
          onClick={openCreateSheet}
          data-testid="create-client-button"
          className="bg-emerald-500 text-black hover:bg-emerald-400 h-9"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search clients by name or contact person..."
          data-testid="search-clients-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-400">Client Name</TableHead>
              <TableHead className="text-zinc-400">Contact Person</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Phone</TableHead>
              <TableHead className="text-zinc-400">Assigned AM</TableHead>
              <TableHead className="text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => {
                const assignedAM = users.find((u) => u.id === client.assigned_am_id);
                return (
                  <TableRow
                    key={client.id}
                    className="border-white/5 hover:bg-zinc-800/50"
                    data-testid="client-row"
                  >
                    <TableCell className="text-white font-medium">{client.name}</TableCell>
                    <TableCell className="text-zinc-300">{client.contact_person || "-"}</TableCell>
                    <TableCell className="text-zinc-300">{client.contact_email || "-"}</TableCell>
                    <TableCell className="text-zinc-300">{client.contact_phone || "-"}</TableCell>
                    <TableCell className="text-zinc-300">{assignedAM?.username || "Unassigned"}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditSheet(client)}
                          className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          data-testid="edit-client-button"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setClientToDelete(client);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          data-testid="delete-client-button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  No clients found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Client Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-lg overflow-y-auto" data-testid="client-sheet">
          <SheetHeader>
            <SheetTitle className="text-white">{editingClient ? "Edit Client" : "Create Client"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Client Name *</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="client-name-input"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                value={formData.contact_person || ""}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={formData.contact_email || ""}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                value={formData.contact_phone || ""}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Assigned Account Manager</Label>
              <Select
                value={formData.assigned_am_id}
                onValueChange={(value) => setFormData({ ...formData, assigned_am_id: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="assigned-am-select">
                  <SelectValue placeholder="Select AM" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400" data-testid="save-client-button">
                {editingClient ? "Update Client" : "Create Client"}
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
            <AlertDialogTitle className="text-white">Delete Client</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete {clientToDelete?.name}? This action cannot be undone.
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
