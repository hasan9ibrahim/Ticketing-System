import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function MyClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(response.data);
    } catch (error) {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-emerald-500">Loading your clients...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto" data-testid="my-clients-page">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">My Clients</h1>
        <p className="text-zinc-400 mt-1">Clients assigned to you</p>
      </div>

      {/* Client Cards Grid */}
      {clients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Card key={client.id} className="bg-zinc-900/50 border-white/10" data-testid="client-card">
              <CardHeader className="flex flex-row items-center space-x-3 pb-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-emerald-500" />
                </div>
                <CardTitle className="text-white text-lg">{client.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {client.contact_person && (
                  <div>
                    <p className="text-xs text-zinc-500">Contact Person</p>
                    <p className="text-sm text-zinc-300">{client.contact_person}</p>
                  </div>
                )}
                {client.contact_email && (
                  <div>
                    <p className="text-xs text-zinc-500">Email</p>
                    <p className="text-sm text-zinc-300">{client.contact_email}</p>
                  </div>
                )}
                {client.contact_phone && (
                  <div>
                    <p className="text-xs text-zinc-500">Phone</p>
                    <p className="text-sm text-zinc-300">{client.contact_phone}</p>
                  </div>
                )}
                {client.notes && (
                  <div>
                    <p className="text-xs text-zinc-500">Notes</p>
                    <p className="text-sm text-zinc-300">{client.notes}</p>
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
              <p>No clients assigned to you yet</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
