import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const OPENED_VIA_OPTIONS = ["Monitoring", "Teams", "Email", "AM"];

export { OPENED_VIA_OPTIONS };

export default function OpenedViaSelect({ selectedOptions = [], onChange, disabled = false }) {
  const handleToggle = (option) => {
    if (disabled) return;
    
    const newSelection = selectedOptions.includes(option)
      ? selectedOptions.filter(o => o !== option)
      : [...selectedOptions, option];
    
    onChange(newSelection);
  };

  return (
    <div className="space-y-2">
      <Label>Opened Via *</Label>
      <div className="grid grid-cols-2 gap-2 p-3 bg-zinc-800 border border-zinc-700 rounded-md">
        {OPENED_VIA_OPTIONS.map((option) => (
          <div key={option} className="flex items-center space-x-2">
            <Checkbox
              id={`opened-via-${option}`}
              checked={selectedOptions.includes(option)}
              onCheckedChange={() => handleToggle(option)}
              disabled={disabled}
              className="border-zinc-600 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
              data-testid={`opened-via-${option.toLowerCase()}`}
            />
            <Label
              htmlFor={`opened-via-${option}`}
              className="font-normal cursor-pointer text-sm text-zinc-300"
            >
              {option}
            </Label>
          </div>
        ))}
      </div>
      {selectedOptions.length === 0 && !disabled && (
        <p className="text-xs text-emerald-500">Please select at least one option</p>
      )}
    </div>
  );
}
