import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  Coffee,
  Timer,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Info,
  MapPin,
  Navigation,
  Loader2,
  Store as StoreIcon,
  Building,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { User, AttendanceRecord, Shift, SystemRules, StoreVisit, PerformanceScore, FraudAlert } from '../types';
import { dataService } from '../services/dataService';
import LiveMap from './LiveMap';
import { calculateDistance } from '../lib/utils';
import { STORES } from '../lib/stores';

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const isAdmin = user.role === 'admin';

  // ── Attendance State ────────────────────────────────────────────────────
  const [checkInTime, setCheckInTime]     = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime]   = useState<string | null>(null);
  const [elapsedTime, setElapsedTime]     = useState('00h 00m');
  const [remainingTime, setRemainingTime] = useState('--h --m');
  const [progress, setProgress]           = useState(0);
  const [status, setStatus]               = useState('Not Checked In');
  const [shift, setShift]                 = useState<Shift | null>(null);
  const [rules, setRules]                 = useState<SystemRules | null>(null);

  // ── Store Visit State ───────────────────────────────────────────────────
  const [showCheckInOptions, setShowCheckInOptions]   = useState(false);
  const [isStoreCheckIn, setIsStoreCheckIn]           = useState(false);
  const [selectedStore, setSelectedStore]             = useState('');
  const [isFetchingGps, setIsFetchingGps]             = useState(false);
  const [gpsLocation, setGpsLocation]                 = useState<{ lat: number; lng: number } | null>(null);
  const [gpsTimestamp, setGpsTimestamp]               = useState<number | null>(null);
  const [gpsError, setGpsError]                       = useState<string | null>(null);
  const [storeError, setStoreError]                   = useState<string | null>(null);
  const [activeStoreVisit, setActiveStoreVisit]       = useState<StoreVisit | null>(null);
  const [storeVisitDuration, setStoreVisitDuration]   = useState('00m 00s');
  const [lastVisit, setLastVisit]                     = useState<{ storeName: string; duration: number } | null>(null);
  const [dailyFieldStats, setDailyFieldStats]         = useState({ totalVisits: 0, totalMinutes: 0 });

  // ── Performance State ───────────────────────────────────────────────────
  const [performanceScore, setPerformanceScore]   = useState<PerformanceScore | null>(null);
  const [performanceTrend, setPerformanceTrend]   = useState<PerformanceScore[]>([]);
  const [fraudAlerts, setFraudAlerts]             = useState<FraudAlert[]>([]);

  // ── Admin State ─────────────────────────────────────────────────────────
  const [activeFieldEmployees, setActiveFieldEmployees]   = useState<{ name: string; store: string; time: string; distance: number; coords: string; isSuspicious?: boolean }[]>([]);
  const [recentFieldActivity, setRecentFieldActivity]     = useState<{ name: string; store: string; duration: number; time: string; distance: number; isSuspicious?: boolean }[]>([]);
  const [teamPerformance, setTeamPerformance]             = useState<{ top: { name: string; score: number }[]; low: { name: string; score: number; needsAttention?: boolean; isHighRisk?: boolean }[]; average: number }>({ top: [], low: [], average: 0 });
  const [monthlySummary, setMonthlySummary]               = useState({ present: 0, late: 0, halfDay: 0, absent: 0, totalHours: 0 });
  const [allEmployeesSummary, setAllEmployeesSummary]     = useState({ present: 0, late: 0, halfDay: 0, absent: 0, totalHours: 0 });
  const [adminStats, setAdminStats]                       = useState({ occupancy: 0, lateCount: 0, deptStats: [] as { name: string; occupancy: number }[], recentAlerts: [] as { user: string; issue: string; time: string; color: string }[] });

  // For LiveMap (requires pre-loaded data)
  const [activeVisitsForMap, setActiveVisitsForMap] = useState<StoreVisit[]>([]);
  const [allUsersForMap, setAllUsersForMap]         = useState<User[]>([]);

  // ── Initial Data Load ───────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');

    const loadAll = async () => {
      try {
        // Auto-close stale visits before loading today's state
        dataService.autoCloseStaleVisits(user.id).catch(console.warn);

        const [record, shifts, fetchedRules, todayVisits, score, trend, allUsers] =
          await Promise.all([
            dataService.getRecord(user.id, today),
            dataService.getShifts(),
            dataService.getRules(),
            dataService.fetchTodayStoreVisits(user.id),
            dataService.calculatePerformanceScore(user.id, today),
            dataService.getPerformanceScores(user.id),
            dataService.getUsers(),
          ]);

        // Attendance
        if (record?.checkIn)  setCheckInTime(record.checkIn);
        if (record?.checkOut) setCheckOutTime(record.checkOut);

        // Shift & Rules
        const userShift = shifts.find(s => s.id === user.shiftId) ?? null;
        setShift(userShift);
        setRules(fetchedRules);

        // Store visits
        const active = todayVisits.find(v => !v.checkOutTime) ?? null;
        setActiveStoreVisit(active);

        const completed = todayVisits.filter(v => v.checkOutTime);
        if (completed.length > 0) {
          const last = completed[completed.length - 1];
          setLastVisit({ storeName: last.storeName, duration: last.duration ?? 0 });
        }
        setDailyFieldStats({
          totalVisits: completed.length,
          totalMinutes: completed.reduce((acc, v) => acc + (v.duration ?? 0), 0),
        });

        // Performance
        setPerformanceScore(score);
        dataService.savePerformanceScore(score).catch(console.warn);

        const sortedTrend = [...trend].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
        setPerformanceTrend(sortedTrend);

        // Monthly summary
        const now = new Date();
        const summary = await dataService.getMonthlySummary(user.id, now.getMonth(), now.getFullYear());
        setMonthlySummary(summary);

        // Admin-specific
        if (isAdmin) {
          await loadAdminData(allUsers, shifts, fetchedRules, today);
        }

        setAllUsersForMap(allUsers);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    };

    loadAll();
  }, [user.id, user.shiftId, isAdmin]);

  const loadAdminData = useCallback(async (
    allUsers: User[],
    shifts: Shift[],
    fetchedRules: SystemRules,
    today: string
  ) => {
    try {
      const [activeVisits, allAttendance, allAlerts] = await Promise.all([
        dataService.getActiveStoreVisits(),
        dataService.getAttendanceForDate(today),
        dataService.getFraudAlerts(),
      ]);

      setActiveVisitsForMap(activeVisits);
      setFraudAlerts(allAlerts.slice(0, 10));

      // Active field employees
      const fieldEmps = activeVisits.map(v => {
        const u = allUsers.find(u => u.id === v.employeeId);
        const mins = Math.floor((Date.now() - new Date(v.checkInTime).getTime()) / 60000);
        return {
          name: u?.name ?? 'Unknown',
          store: v.storeName,
          time: `${mins}m ago`,
          distance: v.distanceFromStore,
          coords: `${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}`,
          isSuspicious: v.isSuspicious,
        };
      });
      setActiveFieldEmployees(fieldEmps);

      // Recent field activity
      const allVisits = await dataService.getStoreVisits({ date: today });
      const recent = allVisits
        .filter(v => v.checkOutTime)
        .sort((a, b) => new Date(b.checkOutTime!).getTime() - new Date(a.checkOutTime!).getTime())
        .slice(0, 5)
        .map(v => {
          const u = allUsers.find(u => u.id === v.employeeId);
          return {
            name: u?.name ?? 'Unknown',
            store: v.storeName,
            duration: v.duration ?? 0,
            time: new Date(v.checkOutTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            distance: v.distanceFromStore,
            isSuspicious: v.isSuspicious,
          };
        });
      setRecentFieldActivity(recent);

      // Team performance
      const employees = allUsers.filter(u => u.role === 'employee');
      const scores = await Promise.all(
        employees.map(u => dataService.calculatePerformanceScore(u.id, today))
      );
      const scoredEmps = scores.map(s => ({
        name: allUsers.find(u => u.id === s.userId)?.name ?? 'Unknown',
        score: s.totalScore,
        needsAttention: allUsers.find(u => u.id === s.userId)?.needsAttention,
        isHighRisk: allUsers.find(u => u.id === s.userId)?.isHighRisk,
      }));
      const sorted = [...scoredEmps].sort((a, b) => b.score - a.score);
      const avg = scoredEmps.length > 0
        ? scoredEmps.reduce((acc, s) => acc + s.score, 0) / scoredEmps.length
        : 0;
      const lowPerformers = scoredEmps.filter(s => s.needsAttention || (s.score < 50 && s.score > 0));
      setTeamPerformance({
        top: sorted.slice(0, 3),
        low: lowPerformers.sort((a, b) => a.score - b.score).slice(0, 5),
        average: Math.round(avg),
      });

      // All employees monthly summary
      const now = new Date();
      const allSummaries = await Promise.all(
        allUsers.map(u => dataService.getMonthlySummary(u.id, now.getMonth(), now.getFullYear()))
      );
      const combined = allSummaries.reduce(
        (acc, s) => ({
          present:    acc.present    + s.present,
          late:       acc.late       + s.late,
          halfDay:    acc.halfDay    + s.halfDay,
          absent:     acc.absent     + s.absent,
          totalHours: acc.totalHours + s.totalHours,
        }),
        { present: 0, late: 0, halfDay: 0, absent: 0, totalHours: 0 }
      );
      setAllEmployeesSummary(combined);

      // Admin occupancy stats
      const presentCount = allAttendance.length;
      const occupancy = allUsers.length > 0 ? (presentCount / allUsers.length) * 100 : 0;
      const lateCount = allAttendance.filter(r => r.status === 'late').length;

      const depts = Array.from(new Set(allUsers.map(u => u.department)));
      const deptStats = depts.map(dept => {
        const deptUsers  = allUsers.filter(u => u.department === dept);
        const deptPresent = allAttendance.filter(r => {
          const u = allUsers.find(u => u.id === r.userId);
          return u?.department === dept;
        }).length;
        return {
          name: dept,
          occupancy: deptUsers.length > 0 ? (deptPresent / deptUsers.length) * 100 : 0,
        };
      });

      const recentAlerts = allAttendance
        .filter(r => r.status === 'late')
        .slice(0, 3)
        .map(r => {
          const u = allUsers.find(u => u.id === r.userId);
          return {
            user: u?.name ?? 'Unknown',
            issue: 'Late Check-in',
            time: r.checkIn
              ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '--:--',
            color: 'bg-yellow-400',
          };
        });

      setAdminStats({ occupancy, lateCount, deptStats, recentAlerts });
    } catch (err) {
      console.error('Admin data load error:', err);
    }
  }, []);

  // ── Store visit duration timer ──────────────────────────────────────────
  useEffect(() => {
    if (!activeStoreVisit) return;
    const interval = setInterval(() => {
      const start = new Date(activeStoreVisit.checkInTime).getTime();
      const diff  = Date.now() - start;
      const mins  = Math.floor(diff / 60000);
      const secs  = Math.floor((diff % 60000) / 1000);
      setStoreVisitDuration(`${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStoreVisit]);

  // ── Background location tracking for field staff ────────────────────────
  useEffect(() => {
    if (!activeStoreVisit || !user.fieldTrackingEnabled) return;

    const trackLocation = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          dataService.updateStoreVisitPath(
            activeStoreVisit.id,
            pos.coords.latitude,
            pos.coords.longitude
          ).catch(console.warn);
        },
        err => console.warn('Background tracking error:', err.message),
        { enableHighAccuracy: true }
      );
    };

    const interval = setInterval(trackLocation, 60000);
    trackLocation();
    return () => clearInterval(interval);
  }, [activeStoreVisit?.id, user.fieldTrackingEnabled]);

  // ── Clock / elapsed / remaining timer ──────────────────────────────────
  useEffect(() => {
    const updateCalculations = () => {
      if (!shift || !rules) return;

      const now      = new Date();
      const todayStr = now.toLocaleDateString('en-CA');

      // Determine current status (pure / sync helper)
      const record = null; // Loaded separately; status is derived from checkInTime state
      const currentStatus = dataService.determineStatus(
        user.id, todayStr, shift, rules,
        checkInTime
          ? { id: '', userId: user.id, date: todayStr, checkIn: checkInTime, checkOut: checkOutTime ?? undefined, status: 'present' }
          : undefined,
        user
      );

      if (currentStatus === 'holiday') {
        setStatus(`Holiday`);
      } else if (currentStatus === 'not-started') {
        setStatus('Not Checked In');
      } else if (currentStatus === 'absent') {
        setStatus('Absent');
      } else {
        setStatus(currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1));
      }

      const [endH, endM] = shift.endTime.split(':').map(Number);
      const officeEndTime = new Date(now);
      officeEndTime.setHours(endH, endM, 0, 0);

      if (checkInTime) {
        const start = new Date(checkInTime).getTime();
        const end   = checkOutTime ? new Date(checkOutTime).getTime() : now.getTime();
        const diff  = Math.max(0, end - start);
        const hours = Math.floor(diff / 3600000);
        const mins  = Math.floor((diff % 3600000) / 60000);
        setElapsedTime(`${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`);
        const goalMins = shift.minHoursForFullDay * 60;
        setProgress(Math.min(((hours * 60 + mins) / goalMins) * 100, 100));
      } else {
        setElapsedTime('00h 00m');
        setProgress(0);
      }

      if (!checkOutTime) {
        const diffRem = officeEndTime.getTime() - now.getTime();
        if (diffRem > 0) {
          const remH = Math.floor(diffRem / 3600000);
          const remM = Math.floor((diffRem % 3600000) / 60000);
          setRemainingTime(`${String(remH).padStart(2, '0')}h ${String(remM).padStart(2, '0')}m`);
        } else {
          setRemainingTime('00h 00m');
        }
      } else {
        setRemainingTime('00h 00m');
      }
    };

    updateCalculations();
    const interval = setInterval(updateCalculations, 1000);
    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime, user.id, shift, rules]);

  // ── Check-in / Check-out handlers ──────────────────────────────────────

  const handleCheckIn = async () => {
    if (checkInTime) return;
    const todayStr = new Date().toLocaleDateString('en-CA');
    try {
      const holiday = await dataService.isHoliday(todayStr);
      if (holiday) {
        alert('Cannot check in on a holiday.');
        return;
      }
      if (user.fieldTrackingEnabled) {
        setShowCheckInOptions(true);
      } else {
        await performOfficeCheckIn();
      }
    } catch (err) {
      console.error('Check-in error:', err);
      alert('Check-in failed. Please try again.');
    }
  };

  const performOfficeCheckIn = async () => {
    if (rules?.settings.photoProofRequired) {
      const confirmed = window.confirm('Photo proof is required. (Simulated: Take Photo?)');
      if (!confirmed) return;
    }

    const now    = new Date();
    const isoNow = now.toISOString();
    const today  = now.toLocaleDateString('en-CA');
    const currentStatus = shift && rules
      ? dataService.calculateStatus(now, shift, rules, user)
      : 'present';

    try {
      const created = await dataService.createAttendance({
        userId:   user.id,
        date:     today,
        checkIn:  isoNow,
        status:   currentStatus,
        location: 'Head Office',
        shiftId:  user.shiftId,
      });
      setCheckInTime(created.checkIn ?? isoNow);
    } catch (err) {
      console.error('Office check-in failed:', err);
      alert('Check-in failed. Please try again.');
    }
    setShowCheckInOptions(false);
  };

  const fetchGps = () => {
    setIsFetchingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsTimestamp(Date.now());
        setGpsError(null);
        setIsFetchingGps(false);
      },
      err => {
        setGpsError('GPS unavailable: ' + err.message);
        setGpsLocation(null);
        setGpsTimestamp(null);
        setIsFetchingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleStoreCheckIn = async () => {
    setStoreError(null);
    if (!selectedStore || !gpsLocation) return;

    // GPS freshness check — reject coordinates older than 60 seconds
    if (!gpsTimestamp || Date.now() - gpsTimestamp > 60_000) {
      setGpsError('GPS reading is stale. Please refresh your location.');
      setGpsLocation(null);
      setGpsTimestamp(null);
      return;
    }

    const store = STORES.find(s => s.name === selectedStore);
    if (!store) return;

    // Use admin-configured radius override if present, otherwise store default
    const effectiveRadius =
      rules?.settings.storeRadiusOverrides?.[store.id] ?? store.allowedRadius;

    const distance = calculateDistance(gpsLocation.lat, gpsLocation.lng, store.latitude, store.longitude);

    // Enforce geofencing — block check-in if outside allowed radius
    if (distance > effectiveRadius) {
      setStoreError(
        `Too far from store: ${Math.round(distance)}m away (allowed: ${effectiveRadius}m). Move closer and try again.`
      );
      return;
    }

    const now    = new Date();
    const isoNow = now.toISOString();
    const today  = now.toLocaleDateString('en-CA');

    try {
      // ── Server-side guard: only one active visit at a time ──────────────
      const existingActive = await dataService.fetchActiveStoreVisit(user.id);
      if (existingActive) {
        setStoreError(`Already checked in at ${existingActive.storeName}. Please check out first.`);
        setActiveStoreVisit(existingActive); // sync local state with DB
        setIsStoreCheckIn(false);
        setShowCheckInOptions(false);
        return;
      }

      // Auto-check-in for office attendance if not done yet
      if (!checkInTime) {
        const currentStatus = shift && rules
          ? dataService.calculateStatus(now, shift, rules, user)
          : 'present';
        const created = await dataService.createAttendance({
          userId:   user.id,
          date:     today,
          checkIn:  isoNow,
          status:   currentStatus,
          location: 'Field (Store)',
          shiftId:  user.shiftId,
        });
        setCheckInTime(created.checkIn ?? isoNow);
      }

      // INSERT new visit — DB generates UUID; returns the saved record
      const createdVisit = await dataService.createStoreVisit({
        employeeId:        user.id,
        storeId:           store.id,
        storeName:         selectedStore,
        latitude:          gpsLocation.lat,
        longitude:         gpsLocation.lng,
        distanceFromStore: distance,
        isSuspicious:      distance > effectiveRadius * 2,
        checkInTime:       isoNow,
        date:              today,
        path:              [],
      });

      setActiveStoreVisit(createdVisit);
      setStoreError(null);
    } catch (err) {
      console.error('Store check-in failed:', err);
      setStoreError('Store check-in failed. Please try again.');
      return;
    }

    setIsStoreCheckIn(false);
    setShowCheckInOptions(false);
    setSelectedStore('');
    setGpsLocation(null);
    setGpsTimestamp(null);
  };

  const handleStoreCheckOut = async () => {
    if (!activeStoreVisit) return;

    const now          = new Date();
    const isoNow       = now.toISOString();
    const durationMins = Math.floor(
      (now.getTime() - new Date(activeStoreVisit.checkInTime).getTime()) / 60000
    );

    try {
      // UPDATE only the checkout fields — leave check_in_time, path, etc. intact
      await dataService.updateStoreVisitCheckout(activeStoreVisit.id, isoNow, durationMins);

      const storeName = activeStoreVisit.storeName;
      setActiveStoreVisit(null);
      setLastVisit({ storeName, duration: durationMins });
      setDailyFieldStats(prev => ({
        totalVisits:  prev.totalVisits + 1,
        totalMinutes: prev.totalMinutes + durationMins,
      }));

      if (isAdmin) {
        dataService.getActiveStoreVisits().then(setActiveVisitsForMap).catch(console.warn);
      }
    } catch (err) {
      console.error('Store check-out failed:', err);
      alert('Store check-out failed. Please try again.');
    }
  };

  const handleCheckOut = async () => {
    if (!checkInTime || checkOutTime) return;

    const now    = new Date();
    const isoNow = now.toISOString();
    const today  = now.toLocaleDateString('en-CA');

    try {
      const record = await dataService.fetchAttendance(user.id, today);
      if (!record) {
        alert('No check-in record found for today.');
        return;
      }
      if (record.locked) {
        alert('This day is locked and cannot be modified.');
        return;
      }

      const hours = (now.getTime() - new Date(record.checkIn!).getTime()) / 3600000;
      const finalStatus = shift && rules
        ? dataService.calculateFinalStatus(hours, shift, record.status as 'present' | 'late', user, rules)
        : record.status;

      const updated: AttendanceRecord = {
        ...record,
        checkOut:   isoNow,
        totalHours: hours,
        status:     finalStatus as AttendanceRecord['status'],
        locked:     true,
      };

      setCheckOutTime(isoNow);
      await dataService.updateAttendance(updated);
    } catch (err) {
      console.error('Check-out failed:', err);
      alert('Check-out failed. Please try again.');
    }
  };

  const handleExportCSV = () => {
    dataService.exportToCSV(user.id).catch(console.error);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="grid grid-cols-12 gap-6">
        {/* Main Status Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="col-span-12 lg:col-span-8 bg-white p-8 rounded-3xl shadow-sm border border-outline-variant/10 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-3 w-3 relative">
                  {checkInTime && !checkOutTime && status !== 'Absent' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${
                    status === 'Present'            ? 'bg-green-500'       :
                    status === 'Late'               ? 'bg-yellow-400'      :
                    status === 'Absent'             ? 'bg-red-500'         :
                    status === 'Half-day'           ? 'bg-orange-400'      :
                    status.startsWith('Holiday')    ? 'bg-slate-400'       : 'bg-outline-variant'
                  }`}></span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Current Status</span>
              </div>
              <h3 className="text-4xl font-black tracking-tight text-on-surface mb-2">{status}</h3>
              <p className="text-on-surface-variant font-medium">
                {checkInTime
                  ? `Checked in at ${formatTime(checkInTime)}`
                  : status === 'Absent'
                    ? 'Marked Absent: No check-in recorded'
                    : 'Awaiting your check-in for today'}
                {checkOutTime && ` • Checked out at ${formatTime(checkOutTime)}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              {!checkInTime && status !== 'Absent' && !showCheckInOptions && (
                <button
                  onClick={handleCheckIn}
                  className="px-8 py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 active:scale-95 transition-all duration-200 flex items-center gap-3 uppercase tracking-widest text-xs"
                >
                  <LogIn size={18} />
                  Check In
                </button>
              )}

              {showCheckInOptions && !isStoreCheckIn && (
                <div className="flex gap-2">
                  <button onClick={performOfficeCheckIn} className="px-6 py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-[10px]">
                    <Building size={16} /> Office
                  </button>
                  <button onClick={() => setIsStoreCheckIn(true)} className="px-6 py-4 bg-secondary text-white rounded-2xl font-black shadow-xl shadow-secondary/20 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-[10px]">
                    <StoreIcon size={16} /> Store
                  </button>
                  <button onClick={() => setShowCheckInOptions(false)} className="px-4 py-4 bg-surface-container text-on-surface rounded-2xl font-black active:scale-95 transition-all text-[10px]">
                    Cancel
                  </button>
                </div>
              )}

              {isStoreCheckIn && (
                <div className="bg-surface-container-low p-4 rounded-3xl border border-outline-variant/10 flex flex-col gap-4 min-w-[300px]">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Select Store</label>
                    <select
                      value={selectedStore}
                      onChange={e => setSelectedStore(e.target.value)}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium text-sm"
                    >
                      <option value="">Choose a store...</option>
                      {STORES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={fetchGps}
                      disabled={isFetchingGps}
                      className="flex-1 px-4 py-3 bg-surface-container text-on-surface rounded-xl font-black active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
                    >
                      {isFetchingGps ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                      {gpsLocation ? 'GPS OK' : 'Fetch GPS'}
                    </button>
                    <button
                      onClick={handleStoreCheckIn}
                      disabled={!selectedStore || !gpsLocation}
                      className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                    >
                      Confirm
                    </button>
                  </div>
                  {gpsError && (
                    <p className="text-[10px] font-bold text-error px-2 flex items-center gap-1">
                      <AlertCircle size={12} /> {gpsError}
                    </p>
                  )}
                  {storeError && (
                    <p className="text-[10px] font-bold text-error px-2 flex items-center gap-1">
                      <AlertCircle size={12} /> {storeError}
                    </p>
                  )}
                  {gpsLocation && selectedStore && !gpsError && !storeError && (() => {
                    const store = STORES.find(s => s.name === selectedStore);
                    if (!store) return null;
                    const effectiveRadius = rules?.settings.storeRadiusOverrides?.[store.id] ?? store.allowedRadius;
                    const dist = calculateDistance(gpsLocation.lat, gpsLocation.lng, store.latitude, store.longitude);
                    const isValid = dist <= effectiveRadius;
                    const isStale = !gpsTimestamp || Date.now() - gpsTimestamp > 60_000;
                    if (isStale) return (
                      <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest px-2 flex items-center gap-1">
                        <AlertCircle size={12} /> GPS is stale — please refresh
                      </p>
                    );
                    return (
                      <p className={`text-[10px] font-bold uppercase tracking-widest px-2 ${isValid ? 'text-green-500' : 'text-error'}`}>
                        {isValid ? `Verified Location ✓ (${Math.round(dist)}m away)` : `Too far: ${Math.round(dist)}m (max ${effectiveRadius}m)`}
                      </p>
                    );
                  })()}
                  <button
                    onClick={() => { setIsStoreCheckIn(false); setGpsError(null); setStoreError(null); }}
                    className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center"
                  >Back</button>
                </div>
              )}

              {activeStoreVisit && (
                <div className="bg-secondary/5 p-4 rounded-3xl border border-secondary/20 flex items-center gap-6">
                  <div>
                    <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Currently at Store</p>
                    <h4 className="text-sm font-black text-on-surface">{activeStoreVisit.storeName}</h4>
                    <p className="text-[10px] font-bold text-on-surface-variant">{formatTime(activeStoreVisit.checkInTime)} • {storeVisitDuration}</p>
                  </div>
                  <button onClick={handleStoreCheckOut} className="px-4 py-2 bg-secondary text-white rounded-xl font-black shadow-lg shadow-secondary/20 active:scale-95 transition-all text-[10px] uppercase tracking-widest">
                    Check-Out
                  </button>
                </div>
              )}

              {lastVisit && !activeStoreVisit && (
                <div className="px-4 py-3 bg-surface-container-low rounded-2xl border border-outline-variant/5 flex items-center gap-3">
                  <StoreIcon size={14} className="text-secondary" />
                  <div>
                    <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">Last Visit</p>
                    <p className="text-[10px] font-bold text-on-surface">{lastVisit.storeName} • {lastVisit.duration} mins</p>
                  </div>
                </div>
              )}

              {checkInTime && !checkOutTime && !activeStoreVisit && (
                <div className="flex gap-2">
                  {user.fieldTrackingEnabled && (
                    <button onClick={() => setIsStoreCheckIn(true)} className="px-6 py-4 bg-secondary text-white rounded-2xl font-black shadow-xl shadow-secondary/20 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-xs">
                      <StoreIcon size={18} /> Store Visit
                    </button>
                  )}
                  <button onClick={handleCheckOut} className="px-8 py-4 bg-surface-container text-on-surface rounded-2xl font-black hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-xs">
                    <LogOut size={18} /> Check Out
                  </button>
                </div>
              )}

              {(checkOutTime || status === 'Absent') && (
                <div className="px-6 py-4 bg-surface-container text-on-surface-variant rounded-2xl font-black flex items-center gap-3 uppercase tracking-widest text-[10px]">
                  <CheckCircle2 size={18} className={status === 'Absent' ? 'text-error' : 'text-primary'} />
                  {status === 'Absent' ? 'Day Closed (Absent)' : 'Day Completed'}
                </div>
              )}
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/5">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-4">Work Progress</p>
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-black text-primary tracking-tighter">{elapsedTime}</span>
                <span className="text-[10px] font-bold text-on-surface-variant">Goal: {shift?.minHoursForFullDay ?? 8}h</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
            <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/5">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-4">Remaining</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-black text-on-surface tracking-tighter">{remainingTime}</span>
                <Timer size={24} className="text-primary" />
              </div>
              <p className="text-[10px] font-bold text-on-surface-variant mt-2 uppercase tracking-widest">Until end of shift</p>
            </div>
            <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/5">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-4">Break Time</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-black text-on-surface tracking-tighter">45m</span>
                <Coffee size={24} className="text-primary" />
              </div>
              <p className="text-[10px] font-bold text-on-surface-variant mt-2 uppercase tracking-widest">15 mins remaining</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Side Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`p-8 rounded-3xl relative overflow-hidden shadow-xl transition-colors duration-500 ${
              performanceScore && performanceScore.totalScore >= 80 ? 'bg-green-600 shadow-green-600/10' :
              performanceScore && performanceScore.totalScore >= 60 ? 'bg-yellow-500 shadow-yellow-500/10' :
              'bg-error shadow-error/10'
            }`}
          >
            <div className="absolute -right-8 -bottom-8 opacity-20 transform rotate-12 text-white">
              <TrendingUp size={120} />
            </div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2">Performance Score</h4>
            <div className="flex items-baseline gap-2 mb-4">
              <p className="text-6xl font-black text-white tracking-tighter">{performanceScore?.totalScore ?? 0}</p>
              <p className="text-xl font-bold text-white/70">/100</p>
            </div>
            <div className="space-y-3 relative z-10">
              {[
                { label: 'Attendance',    val: performanceScore?.breakdown.attendance  ?? 0, max: 40 },
                { label: 'Field Activity',val: performanceScore?.breakdown.field       ?? 0, max: 30 },
                { label: 'Punctuality',   val: performanceScore?.breakdown.punctuality ?? 0, max: 20 },
                { label: 'Location',      val: performanceScore?.breakdown.location    ?? 0, max: 10 },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/80 mb-1">
                    <span>{item.label}</span>
                    <span>{Math.round(item.val)} / {item.max}</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-1">
                    <div className="bg-white h-1 rounded-full" style={{ width: `${(item.val / item.max) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm flex-1"
          >
            <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4">7-Day Trend</h4>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Line type="monotone" dataKey="totalScore" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4">
              <button onClick={handleExportCSV} className="w-full py-3 rounded-xl bg-surface-container text-on-surface text-[10px] font-black uppercase tracking-widest hover:bg-surface-container-high transition-all">
                Export CSV
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {isAdmin ? (
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black tracking-tight text-on-surface">System Monthly Summary</h3>
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest">All Employees</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[
                { label: 'Present',     value: allEmployeesSummary.present },
                { label: 'Late',        value: allEmployeesSummary.late },
                { label: 'Half-Day',    value: allEmployeesSummary.halfDay },
                { label: 'Absent',      value: allEmployeesSummary.absent,     color: 'text-error' },
                { label: 'Total Hours', value: `${allEmployeesSummary.totalHours.toFixed(0)}h` },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-4 rounded-2xl text-center border border-outline-variant/10 shadow-sm">
                  <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className={`text-lg font-black text-on-surface ${stat.color ?? ''}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <LiveMap stores={STORES} activeVisits={activeVisitsForMap} users={allUsersForMap} />
            </div>

            <div className="flex items-center justify-between mt-8">
              <h3 className="text-2xl font-black tracking-tight text-on-surface">Team Performance</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Avg Score:</span>
                <span className={`text-lg font-black ${teamPerformance.average >= 80 ? 'text-green-500' : teamPerformance.average >= 60 ? 'text-yellow-500' : 'text-error'}`}>
                  {teamPerformance.average}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-4 flex items-center gap-2"><TrendingUp size={14} /> Top Performers</h4>
                <div className="space-y-4">
                  {teamPerformance.top.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px] font-black">{s.name.charAt(0)}</div>
                        <span className="text-xs font-bold text-on-surface">{s.name}</span>
                      </div>
                      <span className="text-xs font-black text-green-600">{s.score}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <h4 className="text-[10px] font-black text-error uppercase tracking-widest mb-4 flex items-center gap-2"><AlertCircle size={14} /> Needs Attention</h4>
                <div className="space-y-4">
                  {teamPerformance.low.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 text-error flex items-center justify-center text-[10px] font-black">{s.name.charAt(0)}</div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-on-surface">{s.name}</span>
                            {s.isHighRisk && <span className="px-1 py-0.5 bg-error text-white text-[6px] font-black rounded uppercase">High Risk</span>}
                          </div>
                          {s.needsAttention && <span className="text-[8px] font-black text-error uppercase tracking-widest">Chronic Low Performer</span>}
                        </div>
                      </div>
                      <span className="text-xs font-black text-error">{s.score}</span>
                    </div>
                  ))}
                  {teamPerformance.low.length === 0 && (
                    <p className="text-[10px] text-on-surface-variant font-medium text-center py-2">All employees performing well</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <h3 className="text-2xl font-black tracking-tight text-on-surface">Fraud Alerts</h3>
              <span className="px-3 py-1 bg-error/10 text-error rounded-full text-[10px] font-black uppercase tracking-widest">Recent Issues</span>
            </div>
            <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant/10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Employee</th>
                      <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Issue Type</th>
                      <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Severity</th>
                      <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {fraudAlerts.map(alert => (
                      <tr key={alert.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-on-surface">{alert.userName}</p>
                          <p className="text-[8px] text-on-surface-variant font-mono">{alert.date}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-medium text-on-surface">{alert.type}</p>
                          <p className="text-[8px] text-on-surface-variant line-clamp-1">{alert.details}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                            alert.severity === 'High'   ? 'bg-error/10 text-error' :
                            alert.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-600' :
                                                          'bg-blue-500/10 text-blue-600'
                          }`}>{alert.severity}</span>
                        </td>
                        <td className="px-6 py-4 text-[10px] font-medium text-on-surface-variant">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                    {fraudAlerts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-xs font-medium text-on-surface-variant">
                          No suspicious activity detected recently
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <h3 className="text-2xl font-black tracking-tight text-on-surface">Admin Insights</h3>
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest">Live Feed</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Active Field Staff */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary"><MapPin size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Active Field Staff</p>
                    <p className="text-2xl font-black text-on-surface">{activeFieldEmployees.length} On Site</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {activeFieldEmployees.map((emp, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-black text-white">{emp.name.charAt(0)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-on-surface">{emp.name}</p>
                          {emp.isSuspicious && <span className="px-1.5 py-0.5 bg-error/10 text-error text-[8px] font-black rounded uppercase">Suspicious</span>}
                        </div>
                        <p className="text-[10px] text-secondary font-black uppercase tracking-widest">{emp.store} • {Math.round(emp.distance)}m</p>
                        <p className="text-[8px] text-on-surface-variant font-mono">{emp.coords}</p>
                      </div>
                      <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">{emp.time}</span>
                    </div>
                  ))}
                  {activeFieldEmployees.length === 0 && <p className="text-xs font-medium text-on-surface-variant text-center py-4">No active field visits</p>}
                </div>
              </div>

              {/* Occupancy */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><CheckCircle2 size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Total Occupancy</p>
                    <p className="text-2xl font-black text-on-surface">{adminStats.occupancy.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {adminStats.deptStats.map(dept => (
                    <div key={dept.name}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-on-surface-variant">{dept.name}</span>
                        <span className={dept.occupancy < 50 ? 'text-error' : 'text-primary'}>{dept.occupancy.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-surface-container rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${dept.occupancy < 50 ? 'bg-error' : 'bg-primary'}`} style={{ width: `${dept.occupancy}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Late Arrivals */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error"><AlertCircle size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Late Arrivals</p>
                    <p className="text-2xl font-black text-on-surface">{adminStats.lateCount} Flagged</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {adminStats.recentAlerts.map((alert, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${alert.color} flex items-center justify-center text-[10px] font-black text-white`}>{alert.user.charAt(0)}</div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-on-surface">{alert.user}</p>
                        <p className="text-[10px] text-on-surface-variant font-medium">{alert.issue}</p>
                      </div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">{alert.time}</span>
                    </div>
                  ))}
                  {adminStats.recentAlerts.length === 0 && <p className="text-xs font-medium text-on-surface-variant text-center py-4">No late arrivals today</p>}
                </div>
              </div>

              {/* Recent Field Activity */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><History size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Recent Field Activity</p>
                    <p className="text-2xl font-black text-on-surface">Last 5 Visits</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {recentFieldActivity.map((activity, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">{activity.name.charAt(0)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-on-surface">{activity.name}</p>
                          {activity.isSuspicious && <span className="px-1.5 py-0.5 bg-error/10 text-error text-[8px] font-black rounded uppercase">Suspicious</span>}
                        </div>
                        <p className="text-[10px] text-on-surface-variant font-medium">{activity.store} • {activity.duration}m • {Math.round(activity.distance)}m away</p>
                      </div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">{activity.time}</span>
                    </div>
                  ))}
                  {recentFieldActivity.length === 0 && <p className="text-xs font-medium text-on-surface-variant text-center py-4">No recent activity</p>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Employee View */
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black tracking-tight text-on-surface">Monthly Summary</h3>
              <button onClick={handleExportCSV} className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                Export Full History
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[
                { label: 'Present Days',  value: monthlySummary.present },
                { label: 'Late Days',     value: monthlySummary.late },
                { label: 'Half Days',     value: monthlySummary.halfDay },
                { label: 'Absent Days',   value: monthlySummary.absent,     color: 'text-error' },
                { label: 'Total Hours',   value: `${monthlySummary.totalHours.toFixed(1)}h` },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-6 rounded-2xl text-center border border-outline-variant/10 shadow-sm">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">{stat.label}</p>
                  <p className={`text-xl font-black text-on-surface ${stat.color ?? ''}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {user.fieldTrackingEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-secondary/5 p-6 rounded-2xl border border-secondary/10">
                  <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-2">Today's Field Summary</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-2xl font-black text-on-surface">{dailyFieldStats.totalVisits}</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stores Visited</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-secondary">{dailyFieldStats.totalMinutes}m</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Field Time</p>
                    </div>
                  </div>
                </div>
                <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/5 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin size={24} className="text-secondary mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Field Tracking Active</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm h-64 flex items-end gap-4">
              {[80, 90, 85, 75, 95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-xl transition-all duration-300 cursor-pointer ${i === 4 ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/40'}`}
                    style={{ height: `${h}%` }}
                  ></div>
                  <span className="text-[10px] font-black text-on-surface-variant">{['MON', 'TUE', 'WED', 'THU', 'FRI'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-6">
          <h3 className="text-2xl font-black tracking-tight text-on-surface">Timeline</h3>
          <div className="bg-surface-container-low rounded-3xl p-2 space-y-1">
            {checkInTime && (
              <div className="p-4 bg-white rounded-2xl shadow-sm flex gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">Clocked In</p>
                  <p className="text-[10px] font-bold text-on-surface-variant mb-1">Today, {formatTime(checkInTime)}</p>
                  <span className="text-[10px] px-2 py-0.5 bg-surface-container-high rounded-full text-on-surface-variant font-bold">
                    {checkInTime ? 'Office / Field' : 'Pending'}
                  </span>
                </div>
              </div>
            )}
            {!checkInTime && (
              <div className="p-4 flex gap-4">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">Not checked in yet</p>
                  <p className="text-[10px] text-on-surface-variant font-medium">Your attendance will appear here</p>
                </div>
              </div>
            )}
            <div className="p-6 bg-gradient-to-br from-white to-surface-container-low rounded-2xl border border-outline-variant/10 text-center mt-4">
              <Info size={20} className="text-primary mx-auto mb-2" />
              <p className="text-xs text-on-surface-variant leading-relaxed font-medium">
                You have <span className="font-black text-on-surface">3 unused</span> vacation days this quarter. Don't forget to plan your rest!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
