import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Save, FileText } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_API_URL}/api`;

// Get auth header
const getAuthHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
});

// Get current user
const getCurrentUser = () => {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
};

// Helper functions
const getMonthName = (month) => {
  const months = ["January", "February", "March", "April", "May", "June", 
                 "July", "August", "September", "October", "November", "December"];
  return months[month - 1];
};

const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month - 1, 1).getDay();
};

const getDayName = (dayOfWeek) => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[dayOfWeek];
};

// Shift types configuration - fixed colors
const SHIFT_TYPES = [
  { id: "shift_a", label: "Shift A", time: "5 AM - 1 PM", color: "bg-blue-600", textColor: "text-blue-100" },
  { id: "shift_b", label: "Shift B", time: "8 AM - 4 PM", color: "bg-orange-600", textColor: "text-orange-100" },
  { id: "shift_c", label: "Shift C", time: "9 AM - 5 PM", color: "bg-emerald-600", textColor: "text-emerald-100" },
  { id: "shift_d", label: "Shift D", time: "4 PM - 12 AM", color: "bg-purple-600", textColor: "text-purple-100" },
  { id: "off", label: "Off", time: "", color: "bg-red-600", textColor: "text-red-100" },
  { id: "holiday", label: "Holiday", time: "", color: "bg-zinc-600", textColor: "text-zinc-100" },
];

const getShiftConfig = (shiftType) => {
  return SHIFT_TYPES.find(s => s.id === shiftType) || SHIFT_TYPES[4]; // Default to "off"
};

export default function NOCSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [nocUsers, setNocUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [monthlyNote, setMonthlyNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";
  const canEdit = isAdmin;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    fetchNOCUsers();
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchMonthlyNote();
  }, [year, month]);

  // Auto-refresh data every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchSchedules();
        fetchMonthlyNote();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [year, month]);

  const fetchNOCUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`, getAuthHeader());
      const users = response.data || [];
      // Filter to NOC users who are active
      const nocOnly = users.filter(u => u.role === "noc" && u.is_active !== false);
      setNocUsers(nocOnly);
    } catch (error) {
      console.error("Error fetching NOC users:", error);
      try {
        const altResponse = await axios.get(`${API}/chat/users`, getAuthHeader());
        setNocUsers(altResponse.data || []);
      } catch (altError) {
        console.error("Alternative fetch also failed:", altError);
      }
    }
  };

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/noc-schedule?year=${year}&month=${month}`, getAuthHeader());
      console.log("Fetched schedules:", response.data);
      
      const scheduleMap = {};
      response.data.forEach(s => {
        const key = `${s.noc_user_id}-${s.date}`;
        scheduleMap[key] = s;
      });
      setSchedules(scheduleMap);
    } catch (error) {
      console.error("Error fetching schedules:", error);
    }
    setLoading(false);
  };

  const fetchMonthlyNote = async () => {
    setNoteLoading(true);
    try {
      const response = await axios.get(`${API}/noc-schedule/monthly-note?year=${year}&month=${month}`, getAuthHeader());
      setMonthlyNote(response.data?.note || "");
    } catch (error) {
      console.error("Error fetching monthly note:", error);
      setMonthlyNote("");
    }
    setNoteLoading(false);
  };

  const saveMonthlyNote = async () => {
    if (!canEdit) return;
    try {
      await axios.post(`${API}/noc-schedule/monthly-note`, {
        year,
        month,
        note: monthlyNote
      }, getAuthHeader());
      toast.success("Monthly note saved");
    } catch (error) {
      console.error("Error saving monthly note:", error);
      toast.error("Error saving note");
    }
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getScheduleKey = (userId, day) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return `${userId}-${dateStr}`;
  };

  const getScheduleForCell = (userId, day) => {
    const key = getScheduleKey(userId, day);
    return schedules[key];
  };

  const openEditDialog = (userId, day) => {
    if (!canEdit) return;
    
    const schedule = getScheduleForCell(userId, day);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const nocUser = nocUsers.find(u => u.id === userId);
    
    console.log("Opening dialog for:", { userId, day, schedule, nocUser });
    
    setEditData({
      userId,
      userName: nocUser?.name || nocUser?.username || "Unknown",
      day,
      date: dateStr,
      scheduleId: schedule?.id || null,
      shiftType: schedule?.shift_type || "off",
      notes: schedule?.notes || ""
    });
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editData) return;
    
    console.log("Saving edit:", editData);
    
    try {
      let result;
      if (editData.scheduleId) {
        // Update existing
        const response = await axios.put(`${API}/noc-schedule/${editData.scheduleId}`, {
          shift_type: editData.shiftType,
          notes: editData.notes
        }, getAuthHeader());
        result = response.data;
        toast.success("Schedule updated");
      } else {
        // Check if schedule already exists - if so, update it
        const checkKey = getScheduleKey(editData.userId, editData.day);
        const existingSchedule = schedules[checkKey];
        
        if (existingSchedule) {
          // Update existing
          const response = await axios.put(`${API}/noc-schedule/${existingSchedule.id}`, {
            shift_type: editData.shiftType,
            notes: editData.notes
          }, getAuthHeader());
          result = response.data;
          toast.success("Schedule updated");
        } else {
          // Create new - use exact date from editData
          const response = await axios.post(`${API}/noc-schedule`, {
            noc_user_id: editData.userId,
            date: editData.date,
            shift_type: editData.shiftType,
            notes: editData.notes
          }, getAuthHeader());
          result = response.data;
          toast.success("Schedule created");
        }
      }
      
      console.log("Save result:", result);
      
      setEditDialogOpen(false);
      
      // Force refresh with a small delay to ensure DB is updated
      setTimeout(() => {
        fetchSchedules();
      }, 100);
    } catch (error) {
      console.error("Error saving schedule:", error);
      const errorMsg = error.response?.data?.detail || "Error saving schedule";
      toast.error(errorMsg);
    }
  };

  const deleteSchedule = async () => {
    if (!editData?.scheduleId) return;
    
    try {
      await axios.delete(`${API}/noc-schedule/${editData.scheduleId}`, getAuthHeader());
      toast.success("Schedule deleted");
      setEditDialogOpen(false);
      fetchSchedules();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.error("Error deleting schedule");
    }
  };

  // Generate calendar days
  const renderCalendarDays = () => {
    if (nocUsers.length === 0) {
      return (
        <div className="p-8 text-center text-zinc-400">
          No NOC users found. Please add NOC users first.
        </div>
      );
    }

    const daysInMonth = getDaysInMonth(year, month);
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = new Date().getDate() === day && 
                      new Date().getMonth() + 1 === month && 
                      new Date().getFullYear() === year;

      days.push(
        <div 
          key={day} 
          className={`flex items-center border-b border-zinc-800 ${isToday ? 'bg-emerald-900/20' : ''} ${isWeekend ? 'bg-zinc-900/30' : ''}`}
        >
          {/* Day column */}
          <div className="w-16 flex-shrink-0 p-2 border-r border-zinc-800">
            <div className={`text-sm font-medium ${isToday ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {day}
            </div>
            <div className="text-xs text-zinc-500">{getDayName(dayOfWeek)}</div>
          </div>
          
          {/* NOC user cells */}
          <div className="flex-1 flex">
            {nocUsers.map(nocUser => {
              const schedule = getScheduleForCell(nocUser.id, day);
              const shiftConfig = schedule ? getShiftConfig(schedule.shift_type) : null;
              
              return (
                <div 
                  key={nocUser.id}
                  className={`flex-1 min-w-[80px] h-12 border-r border-zinc-800 flex items-center justify-center cursor-pointer transition-colors
                    ${canEdit ? 'hover:opacity-80' : ''}
                    ${shiftConfig ? shiftConfig.color : 'bg-zinc-900'}`}
                  onClick={() => openEditDialog(nocUser.id, day)}
                  title={schedule ? `${shiftConfig.label} - ${shiftConfig.time || 'No shift'}` : "Click to assign shift"}
                >
                  {schedule && (
                    <span className={`text-xs font-medium truncate px-1 ${shiftConfig.textColor}`}>
                      {shiftConfig.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return days;
  };

  return (
    <div className="p-6 bg-black min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">NOC Schedule</h1>
          <p className="text-zinc-400 mt-1">Monthly schedule for NOC team</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-lg font-medium min-w-[150px] text-center">
              {getMonthName(month)} {year}
            </span>
            <Button variant="outline" size="sm" onClick={goToNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {SHIFT_TYPES.map(shift => (
          <div key={shift.id} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${shift.color}`}></div>
            <span className="text-sm text-zinc-400">
              {shift.label}
              {shift.time && <span className="text-zinc-500 ml-1">({shift.time})</span>}
            </span>
          </div>
        ))}
      </div>

      {/* NOC Users Info */}
      <div className="mb-4 p-3 bg-zinc-900 rounded-lg">
        <span className="text-sm text-zinc-400">NOC Team Members: </span>
        {nocUsers.length > 0 ? (
          <span className="text-sm text-white">
            {nocUsers.map(u => u.name || u.username).join(", ")}
          </span>
        ) : (
          <span className="text-sm text-red-400">No NOC users found</span>
        )}
      </div>

      {/* Calendar */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-6">
        {/* Header row */}
        <div className="flex bg-zinc-900 border-b border-zinc-800">
          <div className="w-16 flex-shrink-0 p-2 border-r border-zinc-800">
            <span className="text-sm font-medium text-zinc-400">Day</span>
          </div>
          {nocUsers.map(nocUser => (
            <div 
              key={nocUser.id} 
              className="flex-1 min-w-[80px] p-2 border-r border-zinc-800 text-center"
            >
              <div className="text-sm font-medium text-white truncate">
                {nocUser.name || nocUser.username}
              </div>
            </div>
          ))}
        </div>
        
        {/* Calendar body */}
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : (
          renderCalendarDays()
        )}
      </div>

      {/* Monthly Note */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-zinc-400" />
            <CardTitle className="text-white text-lg">Monthly Notes</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={monthlyNote}
            onChange={(e) => setMonthlyNote(e.target.value)}
            placeholder={canEdit ? "Add notes for this month (visible to all)..." : "No notes for this month"}
            className="bg-zinc-800 border-zinc-700 text-white min-h-[100px]"
            disabled={!canEdit}
          />
          {canEdit && (
            <div className="mt-3 flex justify-end">
              <Button onClick={saveMonthlyNote} size="sm">
                <Save className="w-4 h-4 mr-2" /> Save Note
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit Schedule - {editData?.userName} - Day {editData?.day}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Shift</label>
              <Select 
                value={editData?.shiftType || "off"} 
                onValueChange={(value) => setEditData({ ...editData, shiftType: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {SHIFT_TYPES.map(shift => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.label} {shift.time && `(${shift.time})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Notes (optional)</label>
              <Input
                value={editData?.notes || ""}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            {editData?.scheduleId && (
              <Button variant="destructive" onClick={deleteSchedule}>
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions for non-admin */}
      {!canEdit && (
        <p className="text-center text-zinc-500 text-sm mt-4">
          Contact an admin to modify the schedule
        </p>
      )}
    </div>
  );
}
