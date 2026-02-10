import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export const DateRangePicker = ({ date, onDateChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800 hover:text-white"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-700" align="start">
        <div className="p-3 border-b border-zinc-700">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDateChange(new Date());
                setIsOpen(false);
              }}
              className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDateChange(null);
                setIsOpen(false);
              }}
              className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              All Dates
            </Button>
          </div>
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            onDateChange(newDate);
            setIsOpen(false);
          }}
          initialFocus
          className="bg-zinc-900 text-white"
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
