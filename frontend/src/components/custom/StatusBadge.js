export const StatusBadge = ({ status }) => {
  const statusColors = {
    Unassigned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    Resolved: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    Assigned: "bg-blue-500/20 text-blue-500 border-blue-500/30",
    "Awaiting Vendor": "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    "Awaiting Client": "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    "Awaiting AM": "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    Unresolved: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
  };

  const colorClass = statusColors[status] || "bg-zinc-500/20 text-zinc-500 border-zinc-500/30";

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${colorClass}`}
      data-testid="status-badge"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-2"></span>
      {status}
    </span>
  );
};

export default StatusBadge;
