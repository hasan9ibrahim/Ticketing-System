import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SMS_ISSUE_TYPES = [
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

const VOICE_ISSUE_TYPES = [
  "Low ASR",
  "Low ACD",
  "High ASR",
  "Rejections",
  "High PDD",
  "Bad Traffic",
  "FAS",
  "Modified CLI",
  "Low/0 Callback",
];

export default function IssueTypeSelect({ 
  selectedTypes = [], 
  otherText = "",
  fasType = "",
  onTypesChange, 
  onOtherChange,
  onFasTypeChange,
  disabled = false,
  ticketType = "sms" // "sms" or "voice"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const ISSUE_TYPES = ticketType === "voice" ? VOICE_ISSUE_TYPES : SMS_ISSUE_TYPES;

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
    
    // Clear FAS type if FAS is unchecked
    if (type === "FAS" && selectedTypes.includes("FAS") && onFasTypeChange) {
      onFasTypeChange("");
    }
  };

  const handleRemoveType = (type, e) => {
    e.stopPropagation();
    if (disabled) return;
    onTypesChange(selectedTypes.filter((t) => t !== type));
    if (type === "FAS" && onFasTypeChange) {
      onFasTypeChange("");
    }
  };

  const displayValue = () => {
    const allSelected = [...selectedTypes];
    if (fasType && selectedTypes.includes("FAS")) {
      const fasIndex = allSelected.indexOf("FAS");
      if (fasIndex > -1) {
        allSelected[fasIndex] = `FAS: ${fasType}`;
      }
    }
    if (otherText) allSelected.push(`Other: ${otherText}`);
    
    if (allSelected.length === 0) return "Select issue types...";
    if (allSelected.length <= 2) return allSelected.join(", ");
    return `${allSelected.length} issues selected`;
  };

  const isFasSelected = selectedTypes.includes("FAS");

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
                    {type === "FAS" && fasType ? `FAS: ${fasType}` : type}
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
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-96 overflow-hidden">
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
            <div className="max-h-52 overflow-y-auto p-2 space-y-1">
              {filteredIssues.map((type) => {
                const isChecked = selectedTypes.includes(type);
                return (
                  <div key={type}>
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-700 cursor-pointer"
                      onClick={() => handleTypeToggle(type)}
                      data-testid={`issue-type-${type.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    >
                      <div 
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isChecked 
                            ? 'bg-emerald-500 border-emerald-500' 
                            : 'border-zinc-500 bg-transparent'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTypeToggle(type);
                        }}
                      >
                        {isChecked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-zinc-200 flex-1">
                        {type}
                      </span>
                    </div>
                    {/* FAS type input - only for Voice tickets when FAS is selected */}
                    {type === "FAS" && isChecked && ticketType === "voice" && onFasTypeChange && (
                      <div className="ml-6 mt-1 mb-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          placeholder="Specify FAS type..."
                          value={fasType}
                          onChange={(e) => onFasTypeChange(e.target.value)}
                          className="h-7 bg-zinc-900 border-zinc-600 text-white text-xs"
                          data-testid="fas-type-input"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredIssues.length === 0 && (
                <div className="text-sm text-zinc-500 text-center py-2">No matching issues</div>
              )}
            </div>

            {/* Other option */}
            <div className="border-t border-zinc-700 p-2">
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                    otherText 
                      ? 'bg-amber-500 border-amber-500' 
                      : 'border-zinc-500 bg-transparent'
                  }`}
                  onClick={() => {
                    if (otherText) onOtherChange("");
                  }}
                >
                  {otherText && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
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

// Export the issue types lists for use in filters
export { SMS_ISSUE_TYPES, VOICE_ISSUE_TYPES };
