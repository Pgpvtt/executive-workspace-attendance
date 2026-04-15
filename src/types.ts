export type UserRole = 'admin' | 'employee';

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'paid';
  isActive: boolean;
  createdAt: string;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  minHoursForFullDay: number;
  minHoursForHalfDay: number;
  isFlexible?: boolean;
}

export interface User {
  id: string;
  companyId: string;
  code: string; // Employee Code
  employeeId: string; // Login ID
  password?: string; // Added for security
  name: string;
  email: string;
  role: UserRole;
  department: string;
  avatar?: string;
  shiftId: string;
  fieldTrackingEnabled?: boolean;
  needsAttention?: boolean;
  isHighRisk?: boolean;
  overrides?: {
    lateThresholdMinutes?: number;
    minHoursForFullDay?: number;
  };
}

export interface Store {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadius: number; // in meters
}

export interface StoreVisit {
  id: string;
  employeeId: string;
  storeId: string;
  storeName: string;
  latitude: number; // actualLatitude
  longitude: number; // actualLongitude
  distanceFromStore: number;
  isSuspicious?: boolean;
  checkInTime: string; // ISO String
  checkOutTime?: string; // ISO String
  duration?: number; // Minutes
  date: string; // YYYY-MM-DD
  path?: { lat: number; lng: number; timestamp: string }[];
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // ISO String
  checkOut?: string; // ISO String
  status: 'present' | 'absent' | 'late' | 'holiday' | 'half-day';
  location?: string;
  totalHours?: number;
  shiftId?: string;
  photoProof?: string;
  isManual?: boolean;
  notes?: string;
  locked?: boolean;
}

export interface ShiftChangeLog {
  id: string;
  userId: string;
  oldShiftId: string;
  newShiftId: string;
  changedBy: string;
  timestamp: string;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: 'public' | 'corporate' | 'regional';
}

export interface AttendancePolicy {
  lateThresholdMinutes: number;
  graceTimeMinutes: number;
  minHoursForFullDay: number;
  minHoursForHalfDay: number;
  absentAfterMinutes: number; // Minutes after shift end to mark absent
}

export interface AppSettings {
  photoProofRequired: boolean;
  companyName: string;
  timezone: string;
  allowManualEdits: boolean;
  autoCheckoutHours: number;           // Auto-close visits open longer than this; 0 = disabled
  storeRadiusOverrides: Record<string, number>; // storeId → radius in metres
}

export interface SystemRules {
  policy: AttendancePolicy;
  settings: AppSettings;
}

export interface PerformanceScore {
  userId: string;
  date: string; // YYYY-MM-DD
  totalScore: number;
  breakdown: {
    attendance: number;
    field: number;
    punctuality: number;
    location: number;
  };
}

export interface FraudAlert {
  id: string;
  userId: string;
  userName: string;
  type: 'Short Visit' | 'Too Many Stores' | 'Location Mismatch' | 'Unrealistic Movement';
  severity: 'Low' | 'Medium' | 'High';
  date: string; // YYYY-MM-DD
  details: string;
  timestamp: string;
}
