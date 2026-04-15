import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Info, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { User, AttendanceRecord, Shift, SystemRules, Holiday } from '../types';
import { dataService } from '../services/dataService';

interface AttendanceCalendarProps {
  user: User;
}

export default function AttendanceCalendar({ user }: AttendanceCalendarProps) {
  const [currentDate, setCurrentDate]       = useState(new Date());
  const [attendance, setAttendance]         = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate]     = useState<AttendanceRecord | null>(null);
  const [shift, setShift]                   = useState<Shift | null>(null);
  const [rules, setRules]                   = useState<SystemRules | null>(null);
  const [holidays, setHolidays]             = useState<Holiday[]>([]);
  const [isLoading, setIsLoading]           = useState(true);

  // ── Load all data needed for the calendar ─────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [records, shifts, fetchedRules, fetchedHolidays] = await Promise.all([
          dataService.getAttendanceForUser(user.id),
          dataService.getShifts(),
          dataService.getRules(),
          dataService.getHolidays(),
        ]);
        setAttendance(records);
        setShift(shifts.find(s => s.id === user.shiftId) ?? null);
        setRules(fetchedRules);
        setHolidays(fetchedHolidays);
      } catch (err) {
        console.error('AttendanceCalendar load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user.id, user.shiftId]);

  const daysInMonth       = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth   = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const days              = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays          = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const monthYear         = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build a fast lookup map for holidays by date string
  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach(h => map.set(h.date, h));
    return map;
  }, [holidays]);

  /**
   * Pure function — no async calls, uses pre-loaded state.
   */
  const getDayStatus = (day: number) => {
    if (!shift || !rules) return null;

    const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const record    = attendance.find(r => r.date === dateStr);
    const holiday   = holidayMap.get(dateStr);

    const status = dataService.determineStatus(
      user.id, dateStr, shift, rules, record, user, holiday
    );

    if (status === 'not-started') return null;

    if (status === 'holiday') {
      return { type: 'holiday', label: holiday?.name };
    }

    return { type: status, record };
  };

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  // ── Stats (based on all records, not filtered by month) ───────────────
  const stats = useMemo(() => {
    const monthRecords = attendance.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });
    const withHours = monthRecords.filter(r => r.totalHours);
    return {
      present: monthRecords.filter(r => r.status === 'present').length,
      late:    monthRecords.filter(r => r.status === 'late').length,
      absent:  monthRecords.filter(r => r.status === 'absent').length,
      avgHours: withHours.length > 0
        ? (withHours.reduce((acc, r) => acc + (r.totalHours ?? 0), 0) / withHours.length).toFixed(1)
        : '0.0',
    };
  }, [attendance, currentDate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Days Present', value: stats.present, total: '/ month', color: 'text-primary' },
          { label: 'Late Entries', value: stats.late,    total: 'Total',   color: 'text-secondary' },
          { label: 'Absent Days',  value: stats.absent,  total: 'Total',   color: 'text-error' },
          { label: 'Avg. Hours',   value: stats.avgHours,total: 'Hrs / Day',color: 'text-on-surface' },
        ].map(stat => (
          <div key={stat.label} className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <h2 className={`text-3xl font-black ${stat.color}`}>{stat.value}</h2>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">{stat.total}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-white rounded-[2rem] shadow-sm border border-outline-variant/10 overflow-hidden"
        >
          <div className="p-8 flex flex-col md:flex-row justify-between items-center border-b border-surface-container gap-6">
            <div className="flex items-center gap-6">
              <h2 className="text-2xl font-black tracking-tight text-on-surface">{monthYear}</h2>
              <div className="flex gap-2">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
              {[
                { color: 'bg-green-500',  label: 'Present' },
                { color: 'bg-yellow-400', label: 'Late'    },
                { color: 'bg-orange-400', label: 'Half Day'},
                { color: 'bg-red-500',    label: 'Absent'  },
                { color: 'bg-slate-400',  label: 'Holiday' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${l.color}`}></div>
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 bg-surface-container/20">
            {weekDays.map(day => (
              <div key={day} className="p-4 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant border-b border-surface-container">
                {day}
              </div>
            ))}

            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="p-4 min-h-[100px] bg-surface-container-low/30 border-r border-b border-surface-container" />
            ))}

            {days.map(day => {
              const statusInfo = getDayStatus(day);
              const isWeekend  = (day + firstDayOfMonth - 1) % 7 === 0 || (day + firstDayOfMonth - 1) % 7 === 6;

              let bgColor  = 'bg-white';
              let dotColor = '';

              if (statusInfo) {
                if (statusInfo.type === 'holiday')   { bgColor = 'bg-surface-container-low'; dotColor = 'bg-slate-400'; }
                else if (statusInfo.type === 'present')  dotColor = 'bg-green-500';
                else if (statusInfo.type === 'late')     dotColor = 'bg-yellow-400';
                else if (statusInfo.type === 'absent')   dotColor = 'bg-red-500';
                else if (statusInfo.type === 'half-day') dotColor = 'bg-orange-400';
              }

              const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

              return (
                <div
                  key={day}
                  onClick={() => {
                    if (statusInfo?.record) {
                      setSelectedDate(statusInfo.record);
                    } else if (statusInfo?.type === 'absent') {
                      setSelectedDate({ id: 'absent', userId: user.id, date: dateStr, status: 'absent' });
                    }
                  }}
                  className={`p-4 min-h-[100px] border-r border-b border-surface-container transition-all duration-200 cursor-pointer relative ${
                    isWeekend ? 'bg-surface-container-low/30' : bgColor
                  } hover:bg-surface-container-low`}
                >
                  <span className={`text-sm font-black ${isWeekend ? 'text-on-surface-variant/30' : 'text-on-surface-variant'}`}>
                    {day < 10 ? `0${day}` : day}
                  </span>
                  {dotColor && (
                    <div className={`absolute bottom-4 right-4 w-2 h-2 rounded-full ${dotColor}`} />
                  )}
                  {statusInfo?.type === 'holiday' && (
                    <div className="mt-1 text-[8px] font-bold text-on-surface-variant uppercase truncate">
                      {statusInfo.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Day Detail Panel */}
        <div className="space-y-6">
          <h3 className="text-2xl font-black tracking-tight text-on-surface">Day Details</h3>
          {selectedDate ? (
            <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm space-y-6">
              <div>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Date</p>
                <p className="text-lg font-black text-on-surface">{selectedDate.date}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Check In</p>
                  <p className="text-sm font-bold text-on-surface">
                    {selectedDate.checkIn ? new Date(selectedDate.checkIn).toLocaleTimeString() : '--:--'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Check Out</p>
                  <p className="text-sm font-bold text-on-surface">
                    {selectedDate.checkOut ? new Date(selectedDate.checkOut).toLocaleTimeString() : '--:--'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Total Hours</p>
                <p className="text-xl font-black text-primary">{(selectedDate.totalHours ?? 0).toFixed(2)} hrs</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Status</p>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  selectedDate.status === 'present'  ? 'bg-green-100 text-green-700'   :
                  selectedDate.status === 'late'     ? 'bg-yellow-100 text-yellow-700' :
                  selectedDate.status === 'half-day' ? 'bg-orange-100 text-orange-700' :
                                                       'bg-red-100 text-red-700'
                }`}>
                  {selectedDate.status}
                </span>
              </div>
              {selectedDate.notes && (
                <div>
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Notes</p>
                  <p className="text-sm text-on-surface-variant font-medium">{selectedDate.notes}</p>
                </div>
              )}
              {selectedDate.isManual && (
                <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="text-[10px] font-black text-yellow-700 uppercase tracking-widest">Manual Override</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface-container-low p-8 rounded-3xl border border-dashed border-outline-variant/20 text-center">
              <Info size={32} className="mx-auto text-on-surface-variant/20 mb-4" />
              <p className="text-sm font-medium text-on-surface-variant">Select a marked date to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
