import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Filter, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Filter field definitions
export const FILTER_FIELDS = [
  { id: "ticket_number", label: "Ticket #", type: "text", placeholder: "Enter ticket number..." },
  { id: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Urgent"] },
  { id: "status", label: "Status", type: "select", options: ["Unassigned", "Assigned", "Awaiting Vendor", "Awaiting Client", "Awaiting AM", "Resolved", "Unresolved"] },
  { id: "enterprise", label: "Enterprise", type: "search" },
  { id: "enterprise_trunk", label: "Enterprise Trunk", type: "select" },
  { id: "vendor_trunk", label: "Vendor Trunk", type: "select" },
  { id: "issue_type", label: "Issue Type", type: "select", options: ["Low DLR", "Low ASR", "0 ASR", "0 DLR", "Unsubmitted SMS", "Pending/Expired SMS", "Undelivered/Rejected SMS", "Content Modification", "SID Modification", "Fake DLR", "Bad Traffic", "Low/0 CR", "High Delay"] },
  { id: "destination", label: "Destination", type: "text", placeholder: "Enter destination..." },
  { id: "assigned_to", label: "Assigned To", type: "select" },
  // Request-specific fields
  { id: "ticket_type", label: "Ticket Type", type: "select", options: ["sms", "voice"] },
  { id: "request_type", label: "Request Type", type: "select", options: ["testing", "rating_routing", "block", "unblock"] },
  // User management fields
  { id: "name", label: "Name", type: "text", placeholder: "Enter name..." },
  { id: "username", label: "Username", type: "text", placeholder: "Enter username..." },
  { id: "email", label: "Email", type: "text", placeholder: "Enter email..." },
  { id: "phone", label: "Phone", type: "text", placeholder: "Enter phone..." },
  { id: "role", label: "Role", type: "select", options: ["admin", "noc", "am", "sm", "engineer"] },
  { id: "department", label: "Department", type: "select" },
  // Audit fields
  { id: "entity_type", label: "Entity Type", type: "select", options: ["user", "department", "client", "ticket", "request"] },
  { id: "action_type", label: "Action Type", type: "select", options: ["create", "update", "delete", "login", "logout"] },
  // Enterprise-specific fields
  { id: "enterprise_name", label: "Enterprise Name", type: "text", placeholder: "Enter enterprise name..." },
  { id: "tier", label: "Tier", type: "select", options: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] },
  { id: "contact_email", label: "Contact Email", type: "text", placeholder: "Enter contact email..." },
  { id: "assigned_am", label: "Assigned AM", type: "select" },
  // Reference-specific fields
  { id: "list_name", label: "List Name", type: "text", placeholder: "Enter list name..." },
  { id: "traffic_type", label: "Traffic Type", type: "select" },
  { id: "vendor_trunk_ref", label: "Vendor Trunk", type: "select" },
  // Voice ticket-specific fields
  { id: "ani", label: "ANI/Origination", type: "text", placeholder: "Enter ANI or origination..." },
];

// Get field options with dynamic values
export const getFieldOptions = (field, enterprises, users, statusOpts = [], issueTypeOpts = [], customerTrunkOpts = [], vendorTrunkOpts = [], customOptions = {}) => {
  if (!field) return [];
  
  if (field.id === "enterprise") {
    return enterprises.map(e => ({ value: e.id, label: e.name }));
  }
  if (field.id === "enterprise_trunk") {
    return customerTrunkOpts.map(t => ({ value: t, label: t }));
  }
  if (field.id === "vendor_trunk") {
    return vendorTrunkOpts.map(t => ({ value: t, label: t }));
  }
  if (field.id === "assigned_to") {
    const options = [{ value: "unassigned", label: "Unassigned" }];
    users.forEach(u => {
      options.push({ value: u.id, label: u.name || u.username || u.email });
    });
    return options;
  }
  if (field.id === "assigned_am") {
    const options = [{ value: "unassigned", label: "Unassigned" }];
    users.forEach(u => {
      options.push({ value: u.id, label: u.name || u.username || u.email });
    });
    return options;
  }
  // Reference-specific fields
  if (field.id === "traffic_type" && customOptions.traffic_types) {
    return customOptions.traffic_types.map(o => ({ value: o, label: o }));
  }
  if (field.id === "vendor_trunk_ref" && customOptions.vendor_trunks) {
    return customOptions.vendor_trunks.map(o => ({ value: o, label: o }));
  }
  if (field.id === "status") {
    const opts = statusOpts.length > 0 ? statusOpts : ["Unassigned", "Assigned", "Awaiting Vendor", "Awaiting Client", "Awaiting AM", "Resolved", "Unresolved"];
    // Check if customOptions.status has label-value pairs
    if (customOptions.status && customOptions.status.length > 0 && typeof customOptions.status[0] === 'object') {
      return customOptions.status;
    }
    return opts.map(o => ({ value: o, label: o }));
  }
  if (field.id === "issue_type") {
    const opts = issueTypeOpts.length > 0 ? issueTypeOpts : ["Low DLR", "Low ASR", "0 ASR", "0 DLR", "Unsubmitted SMS", "Pending/Expired SMS", "Undelivered/Rejected SMS", "Content Modification", "SID Modification", "Fake DLR", "Bad Traffic", "Low/0 CR", "High Delay"];
    return opts.map(o => ({ value: o, label: o }));
  }
  // Handle fields with custom options passed via props
  // Add a helper to capitalize first letter
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  
  if (field.id === "ticket_type" && customOptions.ticket_type) {
    return customOptions.ticket_type.map(o => ({ value: o, label: capitalize(o) }));
  }
  if (field.id === "request_type" && customOptions.request_type) {
    // Check if it's an array of objects with value/label
    if (typeof customOptions.request_type[0] === 'object') {
      return customOptions.request_type;
    }
    return customOptions.request_type.map(o => ({ value: o, label: capitalize(o) }));
  }
  if (field.id === "role" && customOptions.role) {
    // Check if options are already objects with value/label
    if (customOptions.role.length > 0 && typeof customOptions.role[0] === 'object' && 'value' in customOptions.role[0]) {
      return customOptions.role;
    }
    return customOptions.role.map(o => ({ value: o, label: capitalize(o) }));
  }
  if (field.id === "department" && customOptions.department) {
    // Check if options are already objects with value/label
    if (customOptions.department.length > 0 && typeof customOptions.department[0] === 'object' && 'value' in customOptions.department[0]) {
      return customOptions.department;
    }
    return customOptions.department.map(o => ({ value: o, label: o }));
  }
  if (field.id === "entity_type" && customOptions.entity_type) {
    return customOptions.entity_type.map(o => ({ 
      value: o, 
      label: o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' ') 
    }));
  }
  if (field.id === "action_type" && customOptions.action_type) {
    return customOptions.action_type.map(o => ({ 
      value: o, 
      label: o.charAt(0).toUpperCase() + o.slice(1) 
    }));
  }
  if (field.type === "select" && field.options) {
    return field.options.map(o => ({ value: o, label: o }));
  }
  return [];
};

export default function MultiFilter({ 
  filters = [], 
  onFilterChange, 
  enterprises = [], 
  users = [],
  statusOptions = [],
  issueTypeOptions = [],
  customerTrunkOptions = [],
  vendorTrunkOptions = [],
  customOptions = {},
  className,
  // Fields to display - if not provided, shows all fields
  fields = null
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("fields"); // "fields", "values", or "input"
  const [selectedField, setSelectedField] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [textInputValue, setTextInputValue] = useState("");

  // Check if field needs text input
  const needsTextInput = (field) => {
    return field && (field.type === "text" || field.type === "date");
  };

  // Check if field supports multi-select
  const supportsMultiSelect = (field) => {
    return field && field.type === "select";
  };

  // Handle selecting a field
  const handleSelectField = (field) => {
    setSelectedField(field);
    setSearchValue("");
    setTextInputValue("");
    
    if (needsTextInput(field)) {
      setStep("input");
    } else {
      setStep("values");
    }
  };

  // Handle text input submission
  const handleTextSubmit = () => {
    if (!selectedField || !textInputValue.trim()) return;
    
    const newFilter = {
      field: selectedField.id,
      fieldLabel: selectedField.label,
      values: [textInputValue.trim()], // Store as array for consistency
      valueLabels: [textInputValue.trim()]
    };
    
    // Check if this filter already exists
    const existingIndex = filters.findIndex(f => f.field === selectedField.id);
    if (existingIndex >= 0) {
      // Update existing filter
      const newFilters = [...filters];
      newFilters[existingIndex] = newFilter;
      onFilterChange(newFilters);
    } else {
      // Add new filter
      onFilterChange([...filters, newFilter]);
    }
    
    // Reset and close
    setOpen(false);
    setStep("fields");
    setSelectedField(null);
    setTextInputValue("");
  };

  // Handle toggling a value for multi-select
  const handleToggleValue = (value, label) => {
    if (!selectedField) return;
    
    // Get existing values for this field
    const existingFilter = filters.find(f => f.field === selectedField.id);
    const existingValues = existingFilter ? existingFilter.values : [];
    const existingLabels = existingFilter ? existingFilter.valueLabels : [];
    
    let newValues, newLabels;
    
    if (existingValues.includes(value)) {
      // Remove value if already selected
      newValues = existingValues.filter(v => v !== value);
      newLabels = existingLabels.filter((l, i) => existingValues[i] !== value);
    } else {
      // Add value
      newValues = [...existingValues, value];
      newLabels = [...existingLabels, label];
    }
    
    // If no values selected, remove the filter
    if (newValues.length === 0) {
      const newFilters = filters.filter(f => f.field !== selectedField.id);
      onFilterChange(newFilters);
      setOpen(false);
      setStep("fields");
      setSelectedField(null);
      setSearchValue("");
      return;
    }
    
    const newFilter = {
      field: selectedField.id,
      fieldLabel: selectedField.label,
      values: newValues,
      valueLabels: newLabels
    };
    
    // Check if this filter already exists
    const existingIndex = filters.findIndex(f => f.field === selectedField.id);
    if (existingIndex >= 0) {
      // Update existing filter
      const newFilters = [...filters];
      newFilters[existingIndex] = newFilter;
      onFilterChange(newFilters);
    } else {
      // Add new filter
      onFilterChange([...filters, newFilter]);
    }
    
    // Don't close - allow selecting multiple values
  };

  // Handle removing a filter
  const handleRemoveFilter = (field) => {
    const newFilters = filters.filter(f => f.field !== field);
    onFilterChange(newFilters);
  };

  // Handle removing a single value from a multi-select filter
  const handleRemoveFilterValue = (field, value) => {
    const existingFilter = filters.find(f => f.field === field);
    if (!existingFilter) return;
    
    const valueIndex = existingFilter.values.indexOf(value);
    if (valueIndex === -1) return;
    
    const newValues = existingFilter.values.filter(v => v !== value);
    const newLabels = existingFilter.valueLabels.filter((l, i) => existingFilter.values[i] !== value);
    
    // If no values left, remove the entire filter
    if (newValues.length === 0) {
      handleRemoveFilter(field);
      return;
    }
    
    const newFilter = {
      field: existingFilter.field,
      fieldLabel: existingFilter.fieldLabel,
      values: newValues,
      valueLabels: newLabels
    };
    
    const newFilters = filters.map(f => f.field === field ? newFilter : f);
    onFilterChange(newFilters);
  };

  // Handle clearing all filters
  const handleClearAll = () => {
    onFilterChange([]);
  };

  // Handle popover close
  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setStep("fields");
        setSelectedField(null);
        setSearchValue("");
        setTextInputValue("");
      }, 200);
    }
  };

  // Handle text input key press
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleTextSubmit();
    }
  };

  // Filter fields based on search and fields prop
  const availableFields = fields ? FILTER_FIELDS.filter(f => fields.includes(f.id)) : FILTER_FIELDS;
  const filteredFields = availableFields.filter(field =>
    field.label.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Get options for selected field
  const fieldOptions = getFieldOptions(selectedField, enterprises, users, statusOptions, issueTypeOptions, customerTrunkOptions, vendorTrunkOptions, customOptions);
  const filteredOptions = fieldOptions.filter(opt => {
    const label = opt.label || opt.value || "";
    return typeof label === "string" && label.toLowerCase().includes(searchValue.toLowerCase());
  });

  // Check if a value is selected in current filter
  const isValueSelected = (value) => {
    const existingFilter = filters.find(f => f.field === selectedField?.id);
    return existingFilter ? existingFilter.values.includes(value) : false;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected Filters Display */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {filters.map((filter) => (
            <Badge
              key={filter.field}
              variant="secondary"
              className="bg-zinc-800 text-white hover:bg-zinc-700 px-2 py-1 gap-1"
            >
              <span className="text-zinc-400">{filter.fieldLabel}:</span>
              {filter.values.length === 1 ? (
                <span 
                  className="font-medium cursor-pointer hover:text-red-400"
                  onClick={() => handleRemoveFilter(filter.field)}
                >
                  {filter.valueLabels[0]}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {filter.valueLabels.map((label, idx) => (
                    <span 
                      key={idx}
                      className="font-medium cursor-pointer hover:text-red-400"
                      onClick={() => handleRemoveFilterValue(filter.field, filter.values[idx])}
                    >
                      {label}{idx < filter.valueLabels.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => handleRemoveFilter(filter.field)}
                className="ml-1 hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-zinc-400 hover:text-white h-auto py-0"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Main Popover */}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 justify-start"
          >
            <Filter className="h-4 w-4 mr-2" />
            Add Filter
            {filters.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-zinc-700">
                {filters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 bg-zinc-900 border-zinc-700" align="start">
          <div className="flex flex-col max-h-[400px]">
            {/* Step indicator */}
            {(step === "values" || step === "input") && selectedField && (
              <div className="flex items-center gap-2 p-3 border-b border-zinc-700">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("fields")}
                  className="text-zinc-400 hover:text-white p-0"
                >
                  ← Back
                </Button>
                <span className="text-white font-medium">{selectedField.label}</span>
                {supportsMultiSelect(selectedField) && (
                  <span className="text-xs text-zinc-500">(multi-select)</span>
                )}
              </div>
            )}
            
            {/* Search input (for fields and dropdown values) */}
            {step !== "input" && (
              <div className="p-2 border-b border-zinc-700">
                <input
                  type="text"
                  placeholder={step === "fields" ? "Search filter fields..." : `Search ${selectedField?.label.toLowerCase()}...`}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full bg-zinc-800 text-white px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-500"
                  autoFocus
                />
              </div>
            )}

            {/* Text input for Ticket # and Destination */}
            {step === "input" && selectedField && (
              <div className="p-2 border-b border-zinc-700">
                <input
                  type="text"
                  placeholder={selectedField.placeholder || `Enter ${selectedField.label.toLowerCase()}...`}
                  value={textInputValue}
                  onChange={(e) => setTextInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full bg-zinc-800 text-white px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-500"
                  autoFocus
                />
                <Button
                  onClick={handleTextSubmit}
                  className="w-full mt-2 bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Apply Filter
                </Button>
              </div>
            )}

            {/* Options list */}
            {step !== "input" && (
              <div className="overflow-y-auto max-h-[250px]">
                {step === "fields" ? (
                  // Filter fields
                  filteredFields.length > 0 ? (
                    filteredFields.map((field) => (
                      <button
                        key={field.id}
                        onClick={() => handleSelectField(field)}
                        className="w-full text-left px-4 py-2 text-white hover:bg-zinc-800 transition-colors flex items-center justify-between"
                      >
                        {field.label}
                        {field.type === "text" && (
                          <span className="text-xs text-zinc-500">(type)</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-zinc-500 text-center">No fields found</div>
                  )
                ) : (
                  // Filter values (dropdown with multi-select support)
                  filteredOptions.length > 0 ? (
                    filteredOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleToggleValue(opt.value, opt.label)}
                        className="w-full text-left px-4 py-2 text-white hover:bg-zinc-800 transition-colors flex items-center justify-between"
                      >
                        {opt.label}
                        {isValueSelected(opt.value) && (
                          <Check className="h-4 w-4 text-emerald-500" />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-zinc-500 text-center">No options found</div>
                  )
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
