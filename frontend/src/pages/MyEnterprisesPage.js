import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

export default function MyEnterprisesPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);

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
    </div>
  );
}
