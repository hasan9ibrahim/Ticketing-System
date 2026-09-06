import { Calendar as CalendarIcon } from "lucide-react";
import { addDays, format, startOfWeek, endOfWeek } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useState } from "react";

export const DateRangePickerWithRange = ({ dateRange, onDateRangeChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Helper to get current week's Monday and Sunday
  const getThisWeek = () => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 }); // Week starts on Monday
    const sunday = endOfWeek(today, { weekStartsOn: 1 }); // Week ends on Sunday
    return { from: monday, to: sunday };
  };

  // Helper to get today
  const getToday = () => {
    const today = new Date();
    return { from: today, to: today };
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-[200px] justify-start text-left font-normal bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white h-9"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, "MMM dd")} -{" "}
                {format(dateRange.to, "MMM dd, yyyy")}
              </>
            ) : (
              format(dateRange.from, "LLL dd, yyyy")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700" align="start">
        <div className="p-2 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex gap-1 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDateRangeChange(getToday());
              }}
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 h-7 px-2"
            >
              Show Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDateRangeChange(getThisWeek());
              }}
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 h-7 px-2"
            >
              This Week
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                onDateRangeChange({ from: addDays(today, -7), to: today });
              }}
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 h-7 px-2"
            >
              Last 7 Days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDateRangeChange(null);
              }}
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 h-7 px-2"
            >
              All
            </Button>
          </div>
        </div>
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={(range) => {
            onDateRangeChange(range);
            if (range?.from && range?.to) {
              setIsOpen(false);
            }
          }}
          className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
        />
      </PopoverContent>
    </Popover>
  );
};
