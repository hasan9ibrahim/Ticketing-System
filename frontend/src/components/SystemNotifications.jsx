import { useCallback, useEffect } from "react";
import { X, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import useDataUpdates from "@/hooks/useDataUpdates";
import { playNotificationSound } from "@/lib/notificationSound";
import { requestNotificationPermission, showNativeNotification } from "@/lib/nativeNotification";

// Renders nothing - listens on the general system WebSocket (/ws/data,
// separate from Chat.jsx's own /ws/chat socket) and raises toast+sound
// popups for app-wide events. Mounted once, globally, in DashboardLayout,
// so it's alive regardless of which page is open and independent of chat.
export default function SystemNotifications({ user }) {
  // So a Windows/OS-level notification can fire even when this tab isn't
  // the visible one - as long as it's still open somewhere.
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleRequestStatusChange = useCallback((data, status) => {
    if (user?.role !== "am") return;

    const isCompleted = status === "completed";
    playNotificationSound(isCompleted ? "success" : "error");

    const title = `${data.request_type_label || "Request"} ${isCompleted ? "Completed" : "Rejected"}`;
    const preview = (data.message || "").split("\n")[0] || title;
    // Only worth a native OS popup when this tab isn't the one they're
    // looking at - the in-page toast below already covers that case.
    if (document.hidden) {
      showNativeNotification(title, preview);
    }

    const goToRequest = () => {
      window.location.href = `/requests?request=${data.request_id}&t=${Date.now()}`;
    };

    toast.custom(
      (t) => (
        <div
          onClick={goToRequest}
          className={`relative w-full max-w-sm cursor-pointer rounded-lg border bg-white dark:bg-zinc-900 p-3 pr-7 shadow-lg ${
            isCompleted ? "border-emerald-200 dark:border-emerald-900" : "border-red-200 dark:border-red-900"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(t);
            }}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div
            className={`mb-1 flex items-center gap-1.5 text-sm font-medium ${
              isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {data.request_type_label || "Request"} {isCompleted ? "Completed" : "Rejected"}
          </div>
          <div className="line-clamp-4 whitespace-pre-line text-xs text-gray-700 dark:text-zinc-300">
            {data.message}
          </div>
        </div>
      ),
      { position: "bottom-right", duration: 8000 }
    );
  }, [user]);

  const handleDataUpdate = useCallback((message) => {
    switch (message.type) {
      case "request_completed":
        handleRequestStatusChange(message, "completed");
        break;
      case "request_rejected":
        handleRequestStatusChange(message, "rejected");
        break;
      default:
        break;
    }
  }, [handleRequestStatusChange]);

  useDataUpdates(handleDataUpdate);

  return null;
}
