import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Edit2, Filter, Trash2, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Shift } from '../types';
import { dataService } from '../services/dataService';

interface TeamDirectoryProps {
  user: User;
}

export default function TeamDirectory({ user: currentUser }: TeamDirectoryProps) {
  const [employees, setEmployees]             = useState<User[]>([]);
  const [shifts, setShifts]                   = useState<Shift[]>([]);
  const [searchTerm, setSearchTerm]           = useState('');
  const [isModalOpen, setIsModalOpen]         = useState(false);
  const [isReportModalOpen, setIsReportModalOpen]   = useState(false);
  const [isManualModalOpen, setIsManualModalOpen]   = useState(false);
  const [editingEmployee, setEditingEmployee]       = useState<User | null>(null);
  const [selectedEmployee, setSelectedEmployee]     = useState<User | null>(null);
  const [shiftLogs, setShiftLogs]                   = useState<Awaited<ReturnType<typeof dataService.getShiftLogs>>>([]);
  const [isLoading, setIsLoading]                   = useState(true);
  const [isSaving, setIsSaving]                     = useState(false);
  const [saveError, setSaveError]                   = useState<string | null>(null);
  const [reportFilters, setReportFilters]           = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    status: 'all',
  });
  const [reportData, setReportData] = useState<{
    summary: Record<string, number>;
    records: Awaited<ReturnType<typeof dataService.getAttendance>>;
  } | null>(null);

  const isAdmin = currentUser.role === 'admin';

  // ── Load initial data ─────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [users, fetchedShifts, logs] = await Promise.all([
          dataService.getUsers(),
          dataService.getShifts(),
          dataService.getShiftLogs(),
        ]);
        setEmployees(users);
        setShifts(fetchedShifts);
        setShiftLogs(logs);
      } catch (err) {
        console.error('TeamDirectory load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ── Load report when selected employee or filters change ──────────────
  useEffect(() => {
    if (!selectedEmployee || !isReportModalOpen) return;
    const load = async () => {
      const [summary, records] = await Promise.all([
        dataService.getMonthlySummary(selectedEmployee.id, reportFilters.month, reportFilters.year),
        dataService.getAttendance({ userId: selectedEmployee.id }),
      ]);
      setReportData({ summary, records });
    };
    load();
  }, [selectedEmployee, reportFilters, isReportModalOpen]);

  const filteredEmployees = employees.filter(
    emp =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Save employee (create or update via Edge Function) ─────────────────
  const handleSaveEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    const formData = new FormData(e.currentTarget);

    // Input validation
    const name       = (formData.get('name') as string).trim();
    const email      = (formData.get('email') as string).trim();
    const employeeId = (formData.get('employeeId') as string).trim();
    const password   = (formData.get('password') as string).trim();
    const code       = (formData.get('code') as string).trim();
    const department = formData.get('department') as string;
    const role       = formData.get('role') as 'admin' | 'employee';
    const shiftId    = formData.get('shiftId') as string;

    if (!name || !email || !employeeId || !code || !shiftId) {
      setSaveError('All fields are required.');
      setIsSaving(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSaveError('Please enter a valid email address.');
      setIsSaving(false);
      return;
    }
    if (!editingEmployee && !password) {
      setSaveError('Password is required for new employees.');
      setIsSaving(false);
      return;
    }

    try {
      if (editingEmployee) {
        // UPDATE — pass the existing auth UUID so the Edge Function patches in-place
        const employeeData: User & { password?: string } = {
          id:                   editingEmployee.id,
          companyId:            editingEmployee.companyId,
          name,
          email,
          employeeId,
          password:             password || undefined,
          code,
          department,
          role,
          shiftId,
          fieldTrackingEnabled: formData.get('fieldTrackingEnabled') === 'on',
          overrides: {
            lateThresholdMinutes: Number(formData.get('lateThreshold')) || undefined,
            minHoursForFullDay:   Number(formData.get('minHours')) || undefined,
          },
        };
        await dataService.updateEmployee(employeeData, editingEmployee.shiftId);
      } else {
        // CREATE — no id yet; Edge Function + Supabase Auth generate the UUID
        const employeeData: Omit<User, 'id'> & { password: string } = {
          companyId:            '',   // set server-side by Edge Function via requireCompany()
          name,
          email,
          employeeId,
          password,
          code,
          department,
          role,
          shiftId,
          fieldTrackingEnabled: formData.get('fieldTrackingEnabled') === 'on',
          overrides: {
            lateThresholdMinutes: Number(formData.get('lateThreshold')) || undefined,
            minHoursForFullDay:   Number(formData.get('minHours')) || undefined,
          },
        };
        await dataService.createEmployee(employeeData);
      }

      const updated = await dataService.fetchEmployees();
      setEmployees(updated);
      setIsModalOpen(false);
      setEditingEmployee(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this employee? This cannot be undone.')) return;
    try {
      await dataService.deleteEmployee(id);
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete employee.');
    }
  };

  const handleManualEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const formData    = new FormData(e.currentTarget);
    const date        = formData.get('date') as string;
    const statusVal   = formData.get('status') as string;
    const checkInTime = formData.get('checkIn') as string;
    const checkOutTime= formData.get('checkOut') as string;

    // id is left empty — saveAttendance will let the DB auto-generate a UUID
    // on INSERT, and the upsert conflict on (user_id, date) handles UPDATE.
    const record: Parameters<typeof dataService.saveAttendance>[0] = {
      id: '',
      userId: selectedEmployee.id,
      date,
      status: statusVal as any,
      isManual: true,
      locked: true,
    };

    if (checkInTime) {
      const [h, m] = checkInTime.split(':');
      const d = new Date(date);
      d.setHours(Number(h), Number(m));
      record.checkIn = d.toISOString();
    }
    if (checkOutTime) {
      const [h, m] = checkOutTime.split(':');
      const d = new Date(date);
      d.setHours(Number(h), Number(m));
      record.checkOut = d.toISOString();
      if (record.checkIn) {
        record.totalHours = (d.getTime() - new Date(record.checkIn).getTime()) / 3600000;
      }
    }

    try {
      await dataService.updateAttendanceManual(record);
      setIsManualModalOpen(false);
      alert('Manual record saved.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save manual entry.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-2">Team Directory</h2>
          <p className="text-on-surface-variant font-medium">Manage all active organizational employees.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditingEmployee(null); setSaveError(null); setIsModalOpen(true); }}
            className="bg-primary text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all uppercase tracking-widest text-xs"
          >
            <UserPlus size={18} /> Add Employee
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Employee List */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4">
            <Search size={20} className="text-outline-variant" />
            <input
              type="text"
              placeholder="Search by name, code or department..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none focus:ring-0 w-full text-on-surface font-medium"
            />
            <button className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Filter size={20} className="text-on-surface-variant" />
            </button>
          </div>

          <div className="space-y-4">
            {filteredEmployees.map(emp => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-5 rounded-3xl flex items-center justify-between group hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 border border-outline-variant/10"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-xl font-black text-primary">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-on-surface font-black text-lg tracking-tight">{emp.name}</h4>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                      {emp.code} • {emp.department} • {shifts.find(s => s.id === emp.shiftId)?.name ?? 'No Shift'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => { setSelectedEmployee(emp); setIsReportModalOpen(true); }}
                      className="flex items-center gap-2 text-primary font-black hover:bg-primary/5 px-4 py-2 rounded-xl transition-colors uppercase tracking-widest text-[10px]"
                    >Report</button>
                    <button
                      onClick={() => { setSelectedEmployee(emp); setIsManualModalOpen(true); }}
                      className="flex items-center gap-2 text-secondary font-black hover:bg-secondary/5 px-4 py-2 rounded-xl transition-colors uppercase tracking-widest text-[10px]"
                    >Manual</button>
                    <button
                      onClick={() => { setEditingEmployee(emp); setSaveError(null); setIsModalOpen(true); }}
                      className="flex items-center gap-2 text-on-surface-variant font-black hover:bg-surface-container px-4 py-2 rounded-xl transition-colors uppercase tracking-widest text-[10px]"
                    ><Edit2 size={14} /> Edit</button>
                    <button
                      onClick={() => handleDeleteEmployee(emp.id)}
                      className="flex items-center gap-2 text-error font-black hover:bg-error/5 px-4 py-2 rounded-xl transition-colors uppercase tracking-widest text-[10px]"
                    ><Trash2 size={14} /> Delete</button>
                  </div>
                )}
              </motion.div>
            ))}
            {filteredEmployees.length === 0 && (
              <div className="text-center py-12 text-on-surface-variant font-medium">
                No employees found matching your search.
              </div>
            )}
          </div>
        </div>

        {/* Stats Side Panel */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10 sticky top-28">
            <h3 className="text-xl font-black text-on-surface mb-6 tracking-tight">System Stats</h3>
            <div className="space-y-4">
              <div className="p-4 bg-surface-container-low rounded-2xl">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Total Employees</p>
                <p className="text-2xl font-black text-on-surface">{employees.length}</p>
              </div>
              <div className="p-4 bg-surface-container-low rounded-2xl">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Active Shifts</p>
                <p className="text-2xl font-black text-on-surface">{shifts.length}</p>
              </div>
              <div className="p-4 bg-surface-container-low rounded-2xl">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">Recent Shift Changes</p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {shiftLogs.slice(0, 5).map(log => {
                    const emp  = employees.find(e => e.id === log.userId);
                    const oldS = shifts.find(s => s.id === log.oldShiftId);
                    const newS = shifts.find(s => s.id === log.newShiftId);
                    return (
                      <div key={log.id} className="text-[9px] font-bold text-on-surface-variant border-b border-outline-variant/10 pb-2">
                        <span className="text-primary">{emp?.name ?? 'Unknown'}</span>: {oldS?.name} → {newS?.name}
                        <p className="opacity-50">{new Date(log.timestamp).toLocaleDateString()}</p>
                      </div>
                    );
                  })}
                  {shiftLogs.length === 0 && (
                    <p className="text-[9px] text-on-surface-variant opacity-50 italic">No shift changes tracked yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-surface-container flex justify-between items-center">
                <h3 className="text-2xl font-black text-on-surface">
                  {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                <form onSubmit={handleSaveEmployee} className="p-8 space-y-6">
                  {saveError && (
                    <div className="bg-error/10 border border-error/20 text-error rounded-2xl px-4 py-3 text-sm font-semibold">
                      {saveError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Full Name</label>
                      <input name="name" defaultValue={editingEmployee?.name} required
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Email</label>
                      <input name="email" type="email" defaultValue={editingEmployee?.email} required
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Employee ID (Login)</label>
                      <input name="employeeId" defaultValue={editingEmployee?.employeeId} required
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">
                        Password {editingEmployee && <span className="normal-case font-medium text-outline-variant">(leave blank to keep)</span>}
                      </label>
                      <input name="password" type="password" placeholder={editingEmployee ? 'Leave blank to keep' : 'Required'}
                        required={!editingEmployee}
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Employee Code</label>
                      <input name="code" defaultValue={editingEmployee?.code} required
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Department</label>
                      <select name="department" defaultValue={editingEmployee?.department}
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium">
                        {['Engineering','Marketing','Sales','HR','Warehouse','Field','Management'].map(d => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Role</label>
                      <select name="role" defaultValue={editingEmployee?.role ?? 'employee'}
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium">
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Field Tracking</label>
                      <div className="flex items-center h-[56px] px-4 bg-surface-container-low rounded-2xl">
                        <input type="checkbox" name="fieldTrackingEnabled"
                          defaultChecked={editingEmployee?.fieldTrackingEnabled}
                          className="w-5 h-5 rounded border-none bg-surface-container-high text-primary focus:ring-primary/20" />
                        <span className="ml-3 text-xs font-bold text-on-surface">Enable Tracking</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Assigned Shift</label>
                    <select name="shiftId" defaultValue={editingEmployee?.shiftId ?? shifts[0]?.id}
                      className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium">
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Late Threshold (Mins)</label>
                      <input name="lateThreshold" type="number" min="0"
                        defaultValue={editingEmployee?.overrides?.lateThresholdMinutes ?? 15}
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Min Hours (Full Day)</label>
                      <input name="minHours" type="number" min="1" max="24"
                        defaultValue={editingEmployee?.overrides?.minHoursForFullDay ?? 8}
                        className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                    </div>
                  </div>
                  <button type="submit" disabled={isSaving}
                    className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all uppercase tracking-widest text-xs mt-4 flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : (editingEmployee ? 'Update Employee' : 'Create Employee')}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Report Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isReportModalOpen && selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsReportModalOpen(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-surface-container flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-on-surface">Attendance Report</h3>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{selectedEmployee.name} • {selectedEmployee.code}</p>
                </div>
                <div className="flex items-center gap-4">
                  <select value={reportFilters.month} onChange={e => setReportFilters(f => ({ ...f, month: parseInt(e.target.value) }))}
                    className="bg-surface-container px-4 py-2 rounded-xl border-none text-xs font-black">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                    ))}
                  </select>
                  <select value={reportFilters.status} onChange={e => setReportFilters(f => ({ ...f, status: e.target.value }))}
                    className="bg-surface-container px-4 py-2 rounded-xl border-none text-xs font-black">
                    <option value="all">All Status</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="half-day">Half Day</option>
                    <option value="absent">Absent</option>
                  </select>
                  <button onClick={() => dataService.exportToCSV(selectedEmployee.id).catch(console.error)}
                    className="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Export CSV</button>
                  <button onClick={() => setIsReportModalOpen(false)} className="p-2 hover:bg-surface-container rounded-xl transition-colors"><X size={24} /></button>
                </div>
              </div>
              <div className="p-8 overflow-y-auto space-y-8">
                {reportData ? (
                  <>
                    <div className="grid grid-cols-5 gap-4">
                      {Object.entries(reportData.summary).map(([key, value]) => (
                        <div key={key} className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/5">
                          <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest mb-1">{key.replace(/([A-Z])/g, ' $1')}</p>
                          <p className="text-xl font-black text-on-surface">{typeof value === 'number' && key === 'totalHours' ? value.toFixed(1) : value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-sm font-black uppercase tracking-widest text-on-surface-variant">Daily Breakdown</h4>
                      <div className="bg-surface-container-low rounded-3xl overflow-hidden border border-outline-variant/10">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-surface-container/50">
                              {['Date','Check In','Check Out','Status','Hours'].map(h => (
                                <th key={h} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/10">
                            {reportData.records
                              .filter(r => {
                                const d = new Date(r.date);
                                const matchMonth  = d.getMonth() === reportFilters.month && d.getFullYear() === reportFilters.year;
                                const matchStatus = reportFilters.status === 'all' || r.status === reportFilters.status;
                                return matchMonth && matchStatus;
                              })
                              .sort((a, b) => b.date.localeCompare(a.date))
                              .map(record => (
                                <tr key={record.id} className="hover:bg-white/50 transition-colors">
                                  <td className="px-6 py-4 text-xs font-bold text-on-surface">{record.date}</td>
                                  <td className="px-6 py-4 text-xs font-medium text-on-surface-variant">{record.checkIn ? new Date(record.checkIn).toLocaleTimeString() : '--:--'}</td>
                                  <td className="px-6 py-4 text-xs font-medium text-on-surface-variant">{record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : '--:--'}</td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                      record.status === 'present'  ? 'bg-green-100 text-green-700'   :
                                      record.status === 'late'     ? 'bg-yellow-100 text-yellow-700' :
                                      record.status === 'half-day' ? 'bg-orange-100 text-orange-700' :
                                                                     'bg-red-100 text-red-700'
                                    }`}>{record.status}</span>
                                  </td>
                                  <td className="px-6 py-4 text-xs font-black text-primary">{record.totalHours?.toFixed(2) ?? '0.00'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-primary" />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Manual Entry Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isManualModalOpen && selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsManualModalOpen(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-surface-container flex justify-between items-center">
                <h3 className="text-2xl font-black text-on-surface">Manual Entry</h3>
                <button onClick={() => setIsManualModalOpen(false)} className="p-2 hover:bg-surface-container rounded-xl transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleManualEntry} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Date</label>
                  <input name="date" type="date" required defaultValue={new Date().toLocaleDateString('en-CA')}
                    className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Status Override</label>
                  <select name="status"
                    className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium">
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="half-day">Half Day</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Check In</label>
                    <input name="checkIn" type="time"
                      className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Check Out</label>
                    <input name="checkOut" type="time"
                      className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium" />
                  </div>
                </div>
                <button type="submit"
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dim active:scale-[0.98] transition-all uppercase tracking-widest text-xs mt-4">
                  Save Manual Entry
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
