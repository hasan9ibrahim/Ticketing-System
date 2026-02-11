import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const ISSUE_TYPES = [
  "Low DLR",
  "Low ASR",
  "0 ASR",
  "0 DLR",
  "Unsubmitted SMS",
  "Pending/Expired SMS",
  "Undelivered/Rejected SMS",
  "Content Modification",
  "SID Modification",
  "Fake DLR",
  "Bad Traffic",
  "Low/0 CR",
  "High Delay",
];

export default function IssueTypeSelect({ 
  selectedTypes = [], 
  otherText = "", 
  onTypesChange, 
  onOtherChange,
  disabled = false 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredIssues = ISSUE_TYPES.filter((type) =>
    type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTypeToggle = (type) => {
    if (disabled) return;
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    onTypesChange(newTypes);
  };

  const handleRemoveType = (type, e) => {
    e.stopPropagation();
    if (disabled) return;
    onTypesChange(selectedTypes.filter((t) => t !== type));
  };

  const displayValue = () => {
    const allSelected = [...selectedTypes];
    if (otherText) allSelected.push(`Other: ${otherText}`);
    
    if (allSelected.length === 0) return "Select issue types...";
    if (allSelected.length <= 2) return allSelected.join(", ");
    return `${allSelected.length} issues selected`;
  };

  return (
    <div className="space-y-3">
      <Label>Issue Types</Label>
      
      {/* Main dropdown trigger */}
      <div ref={dropdownRef} className="relative">
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`flex items-center justify-between min-h-[40px] px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md cursor-pointer hover:border-zinc-600 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="issue-type-select-trigger"
        >
          <div className="flex-1 flex flex-wrap gap-1">
            {selectedTypes.length === 0 && !otherText ? (
              <span className="text-zinc-500">{displayValue()}</span>
            ) : (
              <>
                {selectedTypes.map((type) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full"
                  >
                    {type}
                    {!disabled && (
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-emerald-300"
                        onClick={(e) => handleRemoveType(type, e)}
                      />
                    )}
                  </span>
                ))}
                {otherText && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    Other: {otherText.length > 20 ? otherText.substring(0, 20) + "..." : otherText}
                  </span>
                )}
              </>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {/* Dropdown menu */}
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-80 overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-zinc-700">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search issues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 bg-zinc-900 border-zinc-600 text-white text-sm"
                  data-testid="issue-type-search"
                />
              </div>
            </div>

            {/* Issue type checkboxes */}
            <div className="max-h-48 overflow-y-auto p-2 space-y-1">
              {filteredIssues.map((type) => (
                <div
                  key={type}
                  onClick={() => handleTypeToggle(type)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-700 cursor-pointer"
                  data-testid={`issue-type-${type.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  <Checkbox
                    checked={selectedTypes.includes(type)}
                    className="border-zinc-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  />
                  <span className="text-sm text-zinc-200">{type}</span>
                </div>
              ))}
              {filteredIssues.length === 0 && (
                <div className="text-sm text-zinc-500 text-center py-2">No matching issues</div>
              )}
            </div>

            {/* Other option */}
            <div className="border-t border-zinc-700 p-2">
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={!!otherText}
                  onCheckedChange={(checked) => {
                    if (!checked) onOtherChange("");
                  }}
                  className="border-zinc-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                />
                <span className="text-sm text-zinc-200">Other (custom)</span>
              </div>
              <Input
                placeholder="Describe other issue..."
                value={otherText}
                onChange={(e) => onOtherChange(e.target.value)}
                className="h-8 bg-zinc-900 border-zinc-600 text-white text-sm"
                data-testid="issue-type-other-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Selected issues summary for table display */}
      {(selectedTypes.length > 0 || otherText) && (
        <div className="text-xs text-zinc-500">
          {selectedTypes.length > 0 && `${selectedTypes.length} issue type(s) selected`}
          {selectedTypes.length > 0 && otherText && " + "}
          {otherText && "custom issue"}
        </div>
      )}
    </div>
  );
}

// Export the issue types list for use in filters
export { ISSUE_TYPES };
