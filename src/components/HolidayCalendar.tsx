import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Holiday } from '../types';
import { dataService } from '../services/dataService';

interface HolidayCalendarProps {
  user: User;
}

export default function HolidayCalendar({ user }: HolidayCalendarProps) {
  const [holidays, setHolidays]       = useState<Holiday[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading]     = useState(true);
  const [isSaving, setIsSaving]       = useState(false);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await dataService.getHolidays();
        setHolidays(data);
      } catch (err) {
        console.error('HolidayCalendar load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleAddHoliday = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newHoliday: Holiday = {
      id: `h-${Date.now()}`,
      name: formData.get('name') as string,
      date: formData.get('date') as string,
      type: formData.get('type') as any,
    };

    setIsSaving(true);
    try {
      await dataService.saveHoliday(newHoliday);
      const updated = await dataService.getHolidays();
      setHolidays(updated);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Save holiday error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    try {
      await dataService.deleteHoliday(id);
      const updated = await dataService.getHolidays();
      setHolidays(updated);
    } catch (err) {
      console.error('Delete holiday error:', err);
    }
  };

  const sortedHolidays    = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const upcomingHolidays  = sortedHolidays.filter(h => new Date(h.date) >= new Date()).slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-black text-on-surface">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                className="p-2 hover:bg-surface-container rounded-xl transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                className="p-2 hover:bg-surface-container rounded-xl transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px bg-outline-variant/15 rounded-2xl overflow-hidden">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
              <div key={d} className="bg-surface-container-low py-4 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{d}</div>
            ))}
            {Array.from({ length: 35 }).map((_, i) => {
              const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
              const day = i - firstDay + 1;
              const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
              const isCurrentMonth = day > 0 && day <= daysInMonth;
              const dateStr = isCurrentMonth
                ? `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
                : '';
              const holiday = isCurrentMonth ? holidays.find(h => h.date === dateStr) : null;

              return (
                <div key={i} className={`bg-white h-24 p-3 font-bold text-sm border-r border-b border-outline-variant/5 ${!isCurrentMonth ? 'bg-surface-container-low/30' : ''}`}>
                  <span className={!isCurrentMonth ? 'text-on-surface-variant/20' : 'text-on-surface-variant'}>
                    {isCurrentMonth ? day : ''}
                  </span>
                  {holiday && (
                    <div className="mt-1 p-1 bg-primary/10 rounded text-[8px] font-black text-primary uppercase truncate">
                      {holiday.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-primary text-white p-8 rounded-[2rem] shadow-xl shadow-primary/10">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/70">Total Observances</h4>
              {isAdmin && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black">{holidays.length}</span>
              <span className="text-white/80 font-medium text-sm">Days in {currentDate.getFullYear()}</span>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <h3 className="text-xl font-black text-on-surface mb-6 tracking-tight">Upcoming</h3>
            <div className="space-y-6">
              {upcomingHolidays.map(holiday => (
                <div key={holiday.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-surface-container rounded-xl flex flex-col items-center justify-center text-on-surface-variant">
                      <span className="text-[8px] font-black uppercase">{new Date(holiday.date).toLocaleString('default', { month: 'short' })}</span>
                      <span className="text-lg font-black">{new Date(holiday.date).getDate()}</span>
                    </div>
                    <div>
                      <p className="font-black text-on-surface">{holiday.name}</p>
                      <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{holiday.type} Holiday</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      className="p-2 hover:bg-error/5 rounded-xl text-error opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {upcomingHolidays.length === 0 && (
                <p className="text-xs font-medium text-on-surface-variant text-center py-4">No upcoming holidays</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-surface-container flex justify-between items-center">
                <h3 className="text-2xl font-black text-on-surface">Add Holiday</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddHoliday} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Holiday Name</label>
                  <input name="name" required className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" placeholder="e.g. New Year's Day" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Date</label>
                  <input name="date" type="date" required className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Type</label>
                  <select name="type" className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium">
                    <option value="public">Public Holiday</option>
                    <option value="office">Office Closure</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all uppercase tracking-widest text-xs mt-4 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Holiday'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
