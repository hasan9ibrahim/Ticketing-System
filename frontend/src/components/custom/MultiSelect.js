import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MultiSelect({ 
  options = [], 
  value = [], 
  onValueChange, 
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  className = "" 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  
  const filteredOptions = options.filter(option => 
    option.label?.toLowerCase().includes(search.toLowerCase()) ||
    option.name?.toLowerCase().includes(search.toLowerCase())
  );
  
  const selectedLabels = value.map(val => {
    const option = options.find(o => o.id === val || o.value === val);
    return option?.label || option?.name || val;
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionId) => {
    const newValue = value.includes(optionId)
      ? value.filter(id => id !== optionId)
      : [...value, optionId];
    onValueChange(newValue);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onValueChange([]);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[40px] bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md px-3 py-2 cursor-pointer flex items-center justify-between gap-2 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors"
      >
        <div className="flex-1 flex flex-wrap gap-1 overflow-hidden">
          {value.length === 0 ? (
            <span className="text-zinc-500">{placeholder}</span>
          ) : (
            selectedLabels.map((label, idx) => (
              <span 
                key={idx} 
                className="bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-white text-sm px-2 py-0.5 rounded flex items-center gap-1"
              >
                {label}
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-red-400" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(value[idx]);
                  }}
                />
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-1">
          {value.length > 0 && (
            <X 
              className="w-4 h-4 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white cursor-pointer" 
              onClick={handleClear}
            />
          )}
          <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-zinc-700">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white h-8"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-40">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-gray-500 dark:text-zinc-400 text-sm text-center">No options found</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = value.includes(option.id) || value.includes(option.value);
                return (
                  <div
                    key={option.id || option.value}
                    onClick={() => handleSelect(option.id || option.value)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-200 dark:hover:bg-zinc-700 ${
                      isSelected ? 'bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-zinc-300'
                    }`}
                  >
                    <span className="text-sm">{option.label || option.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
