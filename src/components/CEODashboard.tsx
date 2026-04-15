import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, UserMinus, Clock,
  TrendingUp, AlertTriangle, Store, MapPin,
  PieChart as PieChartIcon, LineChart as LineChartIcon,
  Loader2, RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { dataService } from '../services/dataService';

type CEOMetrics = Awaited<ReturnType<typeof dataService.getCEOMetrics>>;

export default function CEODashboard() {
  const [metrics, setMetrics]                   = useState<CEOMetrics | null>(null);
  const [attendanceTrend, setAttendanceTrend]   = useState<{ name: string; present: number; absent: number }[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [isLoading, setIsLoading]               = useState(true);
  const [isRefreshing, setIsRefreshing]         = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [data, trendData] = await Promise.all([
        dataService.getCEOMetrics(),
        // Build 7-day attendance trend
        Promise.all(
          Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            const dateStr = date.toLocaleDateString('en-CA');
            return dataService.getAttendanceForDate(dateStr).then(records => ({
              name: date.toLocaleDateString('en-US', { weekday: 'short' }),
              present: records.filter(r => r.status === 'present' || r.status === 'late').length,
              absent:  records.filter(r => r.status === 'absent').length,
            }));
          })
        ),
      ]);

      setMetrics(data);
      setAttendanceTrend(trendData);

      const dist = [
        { name: 'Present', value: data.summary.present, color: '#10b981' },
        { name: 'Absent',  value: data.summary.absent,  color: '#ef4444' },
        { name: 'Late',    value: data.summary.late,    color: '#f59e0b' },
      ].filter(d => d.value > 0);
      setStatusDistribution(dist);
    } catch (err) {
      console.error('CEODashboard load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-8 pb-12">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-1">CEO Dashboard</h2>
          <p className="text-on-surface-variant font-medium">Real-time organisational overview</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-xl text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Employees', value: metrics.summary.totalEmployees, icon: Users,     color: 'text-primary',      bg: 'bg-primary/10' },
          { label: 'Present Today',   value: metrics.summary.present,        icon: UserCheck,  color: 'text-green-600',    bg: 'bg-green-600/10' },
          { label: 'Absent Today',    value: metrics.summary.absent,         icon: UserMinus,  color: 'text-error',        bg: 'bg-error/10' },
          { label: 'Late Today',      value: metrics.summary.late,           icon: Clock,      color: 'text-yellow-600',   bg: 'bg-yellow-600/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Live</span>
            </div>
            <p className="text-3xl font-black text-on-surface tracking-tighter">{stat.value}</p>
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Field & Alerts Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-6 flex items-center gap-2">
            <Store size={20} className="text-secondary" /> Field Activity Today
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: metrics.field.totalVisits,    label: 'Total Visits'  },
              { value: metrics.field.activeEmployees,label: 'Active Staff'  },
              { value: `${metrics.field.avgDuration}m`, label: 'Avg Duration' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-2xl font-black text-secondary">{s.value}</p>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-error" /> Risk & Alerts
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-error/5 p-4 rounded-2xl border border-error/10">
              <p className="text-2xl font-black text-error">{metrics.alerts.totalSuspicious}</p>
              <p className="text-[10px] font-black text-error/70 uppercase tracking-widest">Suspicious Activities</p>
            </div>
            <div className="bg-error/5 p-4 rounded-2xl border border-error/10">
              <p className="text-2xl font-black text-error">{metrics.alerts.highRiskCount}</p>
              <p className="text-[10px] font-black text-error/70 uppercase tracking-widest">High Risk Employees</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-8 flex items-center gap-2">
            <LineChartIcon size={20} className="text-primary" /> 7-Day Attendance Trend
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="present" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6' }} />
                <Line type="monotone" dataKey="absent"  stroke="#ef4444" strokeWidth={4} dot={{ r: 4, fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span className="text-xs font-bold text-on-surface-variant">Present / Late</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div><span className="text-xs font-bold text-on-surface-variant">Absent</span></div>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-8 flex items-center gap-2">
            <PieChartIcon size={20} className="text-primary" /> Status Distribution
          </h3>
          {statusDistribution.length > 0 ? (
            <>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} innerRadius={50} outerRadius={75} paddingAngle={5} dataKey="value">
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {statusDistribution.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                      <span className="text-xs font-bold text-on-surface-variant">{d.name}</span>
                    </div>
                    <span className="text-xs font-black text-on-surface">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-on-surface-variant text-sm font-medium">
              No attendance data for today
            </div>
          )}
        </div>
      </div>

      {/* Performance Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-600" /> Top 5 Performers
          </h3>
          <div className="space-y-4">
            {metrics.performance.top.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-green-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-green-600 w-4">#{i + 1}</span>
                  <span className="text-sm font-bold text-on-surface">{p.name}</span>
                </div>
                <span className="text-sm font-black text-green-600">{p.score}</span>
              </div>
            ))}
            {metrics.performance.top.length === 0 && (
              <p className="text-sm text-on-surface-variant font-medium text-center py-4">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
          <h3 className="text-lg font-black text-on-surface mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-error" /> Bottom 5 Performers
          </h3>
          <div className="space-y-4">
            {metrics.performance.bottom.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-error/5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-error w-4">#{i + 1}</span>
                  <span className="text-sm font-bold text-on-surface">{p.name}</span>
                </div>
                <span className="text-sm font-black text-error">{p.score}</span>
              </div>
            ))}
            {metrics.performance.bottom.length === 0 && (
              <p className="text-sm text-on-surface-variant font-medium text-center py-4">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Average Performance */}
      <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-on-surface">Average Performance Score</h3>
          <div className={`text-4xl font-black ${
            metrics.performance.average >= 80 ? 'text-green-600' :
            metrics.performance.average >= 60 ? 'text-yellow-500' : 'text-error'
          }`}>
            {metrics.performance.average}<span className="text-xl text-on-surface-variant font-medium">/100</span>
          </div>
        </div>
        <div className="mt-4 w-full bg-surface-container-high rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${
              metrics.performance.average >= 80 ? 'bg-green-500' :
              metrics.performance.average >= 60 ? 'bg-yellow-500' : 'bg-error'
            }`}
            style={{ width: `${metrics.performance.average}%` }}
          />
        </div>
      </div>
    </div>
  );
}
