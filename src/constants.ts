import { User, AttendanceRecord, Holiday, SystemRules } from './types';

export const MOCK_USER: User = {
  id: '1',
  companyId: '',
  employeeId: 'admin',
  code: 'E-9942',
  name: 'Alex Rivera',
  email: 'alex.rivera@executive.com',
  role: 'admin',
  department: 'Operations',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  shiftId: 'shift-1'
};

export const MOCK_EMPLOYEES: User[] = [
  MOCK_USER,
  {
    id: '2',
    companyId: '',
    employeeId: 'emp1',
    code: 'E-8812',
    name: 'Sarah Chen',
    email: 'sarah.chen@executive.com',
    role: 'employee',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    shiftId: 'shift-1'
  },
  {
    id: '3',
    companyId: '',
    employeeId: 'emp2',
    code: 'E-7201',
    name: 'Marcus Holloway',
    email: 'marcus.h@executive.com',
    role: 'employee',
    department: 'Sales',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    shiftId: 'shift-2'
  },
];

export const MOCK_HOLIDAYS: Holiday[] = [
  { id: '1', date: '2024-12-25', name: 'Christmas Day', type: 'public' },
  { id: '2', date: '2024-12-26', name: 'Boxing Day', type: 'public' },
  { id: '3', date: '2025-01-01', name: "New Year's Day", type: 'public' },
  { id: '4', date: '2025-01-15', name: 'Foundation Day', type: 'corporate' },
];

export const DEFAULT_RULES: SystemRules = {
  policy: {
    lateThresholdMinutes: 15,
    graceTimeMinutes: 5,
    minHoursForFullDay: 8,
    minHoursForHalfDay: 4,
    absentAfterMinutes: 60,
  },
  settings: {
    photoProofRequired: false,
    companyName: 'Executive Workspace',
    timezone: 'UTC+5:30',
    allowManualEdits: true,
    autoCheckoutHours: 8,
    storeRadiusOverrides: {},
  }
};

export const MOCK_ATTENDANCE: AttendanceRecord[] = [
  {
    id: '1',
    userId: '1',
    date: '2023-10-23',
    checkIn: '09:12',
    checkOut: '18:15',
    status: 'present',
    location: 'Main Lobby',
    totalHours: 9.05,
  },
  {
    id: '2',
    userId: '1',
    date: '2023-10-24',
    checkIn: '09:15',
    checkOut: '18:00',
    status: 'late',
    location: 'Tech Hub',
    totalHours: 8.75,
  },
];
