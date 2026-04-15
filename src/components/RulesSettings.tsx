import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, Save, Plus, Loader2 } from 'lucide-react';
import { User, SystemRules, Shift } from '../types';
import { dataService } from '../services/dataService';

interface RulesSettingsProps {
  user: User;
}

export default function RulesSettings({ user }: RulesSettingsProps) {
  const [rules, setRules]     = useState<SystemRules | null>(null);
  const [shifts, setShifts]   = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [fetchedRules, fetchedShifts] = await Promise.all([
          dataService.getRules(),
          dataService.getShifts(),
        ]);
        setRules(fetchedRules);
        setShifts(fetchedShifts);
      } catch (err) {
        console.error('RulesSettings load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules) return;
    setIsSaving(true);
    try {
      await dataService.saveRules(rules);
    } catch (err) {
      console.error('Save rules error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShift = async (shift: Shift) => {
    try {
      await dataService.saveShift(shift);
      const updated = await dataService.getShifts();
      setShifts(updated);
    } catch (err) {
      console.error('Save shift error:', err);
    }
  };

  if (isLoading || !rules) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-2">Policy Rules</h2>
          <p className="text-on-surface-variant font-medium">Define attendance thresholds, shifts, and compliance logic.</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveRules}
            disabled={isSaving}
            className="bg-primary text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center gap-2 disabled:opacity-70"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Policy'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-7 space-y-10">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Clock size={24} />
                </div>
                <div>
                  <h3 className="font-black text-lg">Shift Management</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Define working hours for different shifts</p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    const newShift: Shift = {
                      id: `shift-${Date.now()}`,
                      name: 'New Shift',
                      startTime: '09:00',
                      endTime: '18:00',
                      minHoursForFullDay: 8,
                      minHoursForHalfDay: 4,
                    };
                    handleSaveShift(newShift);
                  }}
                  className="p-2 bg-surface-container rounded-xl text-primary hover:bg-primary/10 transition-all"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>

            <div className="space-y-6">
              {shifts.map((shift) => (
                <div key={shift.id} className="p-6 bg-surface-container-low rounded-3xl border border-outline-variant/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <input
                      className="bg-transparent border-none font-black text-lg p-0 focus:ring-0 w-32"
                      defaultValue={shift.name}
                      onBlur={(e) => handleSaveShift({ ...shift, name: e.target.value })}
                      disabled={!isAdmin}
                    />
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${shift.isFlexible ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                        {shift.isFlexible ? 'Flexible' : 'Fixed'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">Start Time</p>
                      <input
                        type="time"
                        defaultValue={shift.startTime}
                        onBlur={(e) => handleSaveShift({ ...shift, startTime: e.target.value })}
                        disabled={!isAdmin}
                        className="w-full bg-white border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">End Time</p>
                      <input
                        type="time"
                        defaultValue={shift.endTime}
                        onBlur={(e) => handleSaveShift({ ...shift, endTime: e.target.value })}
                        disabled={!isAdmin}
                        className="w-full bg-white border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-10">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">Attendance Policy</h3>
                <p className="text-xs text-on-surface-variant font-medium">Penalty thresholds and grace periods</p>
              </div>
            </div>
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Late Threshold</label>
                  <span className="text-sm font-black text-primary">{rules.policy.lateThresholdMinutes} Minutes</span>
                </div>
                <input
                  type="range" min="0" max="60"
                  value={rules.policy.lateThresholdMinutes}
                  onChange={(e) => setRules({ ...rules, policy: { ...rules.policy, lateThresholdMinutes: parseInt(e.target.value) } })}
                  disabled={!isAdmin}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Grace Time</label>
                  <span className="text-sm font-black text-primary">{rules.policy.graceTimeMinutes} Minutes</span>
                </div>
                <input
                  type="range" min="0" max="30"
                  value={rules.policy.graceTimeMinutes}
                  onChange={(e) => setRules({ ...rules, policy: { ...rules.policy, graceTimeMinutes: parseInt(e.target.value) } })}
                  disabled={!isAdmin}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Min Hours (Full Day)</label>
                  <span className="text-sm font-black text-primary">{rules.policy.minHoursForFullDay} Hours</span>
                </div>
                <input
                  type="range" min="4" max="12"
                  value={rules.policy.minHoursForFullDay}
                  onChange={(e) => setRules({ ...rules, policy: { ...rules.policy, minHoursForFullDay: parseInt(e.target.value) } })}
                  disabled={!isAdmin}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Min Hours (Half Day)</label>
                  <span className="text-sm font-black text-primary">{rules.policy.minHoursForHalfDay} Hours</span>
                </div>
                <input
                  type="range" min="1" max="6"
                  value={rules.policy.minHoursForHalfDay}
                  onChange={(e) => setRules({ ...rules, policy: { ...rules.policy, minHoursForHalfDay: parseInt(e.target.value) } })}
                  disabled={!isAdmin}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Absent Threshold</label>
                  <span className="text-sm font-black text-primary">{rules.policy.absentAfterMinutes} Minutes</span>
                </div>
                <p className="text-[9px] text-on-surface-variant font-medium mb-1">Mark absent after shift end + threshold</p>
                <input
                  type="range" min="0" max="240" step="15"
                  value={rules.policy.absentAfterMinutes}
                  onChange={(e) => setRules({ ...rules, policy: { ...rules.policy, absentAfterMinutes: parseInt(e.target.value) } })}
                  disabled={!isAdmin}
                  className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
