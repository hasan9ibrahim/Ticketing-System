import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import NotificationSettings from "@/components/custom/NotificationSettings";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function MyEnterprisesPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEnterprise, setEditingEnterprise] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchEnterprises();
  }, []);

  const fetchEnterprises = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEnterprises(response.data);
    } catch (error) {
      toast.error("Failed to load enterprises");
    } finally {
      setLoading(false);
    }
  };

  const openEditSheet = (enterprise) => {
    setEditingEnterprise(enterprise);
    setFormData(enterprise);
    setSheetOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const contactData = {
        contact_person: formData.contact_person,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        noc_emails: formData.noc_emails,
        notes: formData.notes
      };
      
      await axios.put(`${API}/clients/${editingEnterprise.id}/contact`, contactData, { headers });
      toast.success("Enterprise updated successfully");
      setSheetOpen(false);
      fetchEnterprises();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update enterprise");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading your enterprises...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="my-enterprises-page">
      <div>
        <h1 className="text-4xl font-bold text-white">My Enterprises</h1>
        <p className="text-zinc-400 mt-1">Enterprises assigned to you</p>
      </div>

      {/* Notification Settings for AMs */}
      <NotificationSettings />

      {enterprises.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enterprises.map((enterprise) => (
            <Card key={enterprise.id} className="bg-zinc-900/50 border-white/10" data-testid="enterprise-card">
              <CardHeader className="flex flex-row items-center space-x-3 pb-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-white text-lg">{enterprise.name}</CardTitle>
                  {enterprise.tier && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-xs rounded-full border border-emerald-500/30">
                      {enterprise.tier}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => openEditSheet(enterprise)} className="border-emerald-500 text-emerald-500 hover:bg-emerald-500/10">Edit</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {enterprise.contact_person && (
                  <div>
                    <p className="text-xs text-zinc-500">Contact Person</p>
                    <p className="text-sm text-zinc-300">{enterprise.contact_person}</p>
                  </div>
                )}
                {enterprise.contact_email && (
                  <div>
                    <p className="text-xs text-zinc-500">Email</p>
                    <p className="text-sm text-zinc-300">{enterprise.contact_email}</p>
                  </div>
                )}
                {enterprise.contact_phone && (
                  <div>
                    <p className="text-xs text-zinc-500">Phone</p>
                    <p className="text-sm text-zinc-300">{enterprise.contact_phone}</p>
                  </div>
                )}
                {enterprise.noc_emails && (
                  <div>
                    <p className="text-xs text-zinc-500">NOC Emails</p>
                    <p className="text-sm text-zinc-300">{enterprise.noc_emails}</p>
                  </div>
                )}
                {enterprise.notes && (
                  <div>
                    <p className="text-xs text-zinc-500">Notes</p>
                    <p className="text-sm text-zinc-300">{enterprise.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-zinc-900/50 border-white/10">
          <CardContent className="py-12">
            <div className="text-center text-zinc-500">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
              <p>No enterprises assigned to you yet</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-zinc-900 border-white/10 text-white sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">Edit Enterprise</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Enterprise Name</Label>
              <Input value={formData.name || ""} className="bg-zinc-800 border-zinc-700 text-white" disabled />
            </div>
            <div className="space-y-2">
              <Label>SMS/Voice</Label>
              <Input value={formData.enterprise_type || ""} className="bg-zinc-800 border-zinc-700 text-white" disabled />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Input value={formData.tier || ""} className="bg-zinc-800 border-zinc-700 text-white" disabled />
            </div>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input value={formData.contact_person || ""} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" value={formData.contact_email || ""} onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input value={formData.contact_phone || ""} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div className="space-y-2">
              <Label>NOC Emails</Label>
              <Textarea value={formData.noc_emails || ""} onChange={(e) => setFormData({ ...formData, noc_emails: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" placeholder="email1@example.com, email2@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            
            <div className="flex space-x-3 pt-4">
              <Button type="submit" className="bg-emerald-500 text-black hover:bg-emerald-400">Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="border-zinc-700 text-white hover:bg-zinc-800">Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
