export const PriorityIndicator = ({ priority }) => {
  const priorityConfig = {
    Low: { color: "bg-blue-500", textColor: "text-blue-500" },
    Medium: { color: "bg-yellow-500", textColor: "text-yellow-500" },
    High: { color: "bg-orange-500", textColor: "text-orange-500" },
    Urgent: { color: "bg-red-500", textColor: "text-red-500" },
  };

  const config = priorityConfig[priority] || priorityConfig.Low;

  return (
    <div className="flex items-center space-x-2" data-testid="priority-indicator">
      <div className={`w-1 h-12 ${config.color} rounded-full`}></div>
      <span className={`text-sm font-medium ${config.textColor}`}>{priority}</span>
    </div>
  );
};

export default PriorityIndicator;
