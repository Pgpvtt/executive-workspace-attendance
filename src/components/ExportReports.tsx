import React, { useState, useEffect } from 'react';
import {
  FileDown,
  Calendar,
  Loader2,
  CheckCircle2,
  Store,
  TrendingUp
} from 'lucide-react';
import { motion } from 'motion/react';
import { dataService } from '../services/dataService';
import type { User } from '../types';

export default function ExportReports() {
  const [loading, setLoading]   = useState<string | null>(null);
  const [users, setUsers]       = useState<User[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [filters, setFilters]   = useState({
    startDate:  new Date().toLocaleDateString('en-CA'),
    endDate:    new Date().toLocaleDateString('en-CA'),
    userId:     '',
    department: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const allUsers = await dataService.getUsers();
        const employees = allUsers.filter(u => u.role === 'employee');
        setUsers(employees);
        setDepartments(Array.from(new Set(employees.map(u => u.department))));
      } catch (err) {
        console.error('ExportReports load error:', err);
      }
    };
    load();
  }, []);

  const handleExport = async (type: 'attendance' | 'field' | 'performance') => {
    setLoading(type);
    try {
      if (type === 'attendance') {
        await dataService.exportAttendanceReport(filters);
      } else if (type === 'field') {
        await dataService.exportFieldVisitReport(filters);
      } else if (type === 'performance') {
        await dataService.exportPerformanceReport({ date: filters.startDate, department: filters.department });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Filters Section */}
      <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
        <h3 className="text-lg font-black text-on-surface mb-6 flex items-center gap-2">
          <Calendar size={20} className="text-primary" />
          Report Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Employee (Optional)</label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold bg-white"
            >
              <option value="">All Employees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Department (Optional)</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-bold bg-white"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            id: 'attendance',
            title: 'Attendance Report',
            desc: 'Daily check-in/out, total hours, and status summary.',
            icon: CheckCircle2,
            color: 'bg-primary/10 text-primary',
          },
          {
            id: 'field',
            title: 'Field Visit Report',
            desc: 'Store visit details, duration, and GPS validation.',
            icon: Store,
            color: 'bg-secondary/10 text-secondary',
          },
          {
            id: 'performance',
            title: 'Performance Report',
            desc: 'Employee scores, breakdowns, and rankings.',
            icon: TrendingUp,
            color: 'bg-green-600/10 text-green-600',
          },
        ].map((report) => (
          <motion.div
            key={report.id}
            whileHover={{ y: -5 }}
            className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm flex flex-col h-full"
          >
            <div className={`w-14 h-14 rounded-2xl ${report.color} flex items-center justify-center mb-6`}>
              <report.icon size={28} />
            </div>
            <h4 className="text-lg font-black text-on-surface mb-2">{report.title}</h4>
            <p className="text-xs font-medium text-on-surface-variant leading-relaxed mb-8 flex-1">
              {report.desc}
            </p>
            <button
              onClick={() => handleExport(report.id as any)}
              disabled={loading !== null}
              className="w-full py-4 rounded-2xl bg-surface-container text-on-surface font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-surface-container-high transition-all disabled:opacity-50"
            >
              {loading === report.id ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  Export CSV
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>

      {/* Info Box */}
      <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <FileDown size={20} />
        </div>
        <div>
          <h5 className="text-sm font-black text-primary uppercase tracking-widest mb-1">Export Note</h5>
          <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
            Reports are generated in CSV format which is compatible with Microsoft Excel, Google Sheets, and other spreadsheet software.
            For Performance reports, the "Start Date" filter is used as the target date.
          </p>
        </div>
      </div>
    </div>
  );
}
