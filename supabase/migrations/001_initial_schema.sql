-- ============================================================
-- Executive Workspace - Office Attendance System
-- Initial Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SHIFTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,        -- HH:mm
  end_time TEXT NOT NULL,          -- HH:mm
  min_hours_for_full_day NUMERIC NOT NULL DEFAULT 8,
  min_hours_for_half_day NUMERIC NOT NULL DEFAULT 4,
  is_flexible BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default shifts
INSERT INTO shifts (id, name, start_time, end_time, min_hours_for_full_day, min_hours_for_half_day, is_flexible)
VALUES
  ('shift-1', 'Corporate',  '09:00', '18:00', 8, 4, FALSE),
  ('shift-2', 'Warehouse',  '08:00', '17:00', 8, 4, FALSE),
  ('shift-3', 'Field',      '00:00', '23:59', 8, 4, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,   -- Login ID (e.g. "admin", "emp1")
  code TEXT UNIQUE NOT NULL,          -- Employee code (e.g. "E-9942")
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  department TEXT NOT NULL DEFAULT 'General',
  shift_id TEXT REFERENCES shifts(id) DEFAULT 'shift-1',
  field_tracking_enabled BOOLEAN DEFAULT FALSE,
  needs_attention BOOLEAN DEFAULT FALSE,
  is_high_risk BOOLEAN DEFAULT FALSE,
  late_threshold_minutes INTEGER,     -- Override (null = use policy default)
  min_hours_for_full_day NUMERIC,     -- Override (null = use policy default)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'holiday', 'half-day')),
  location TEXT,
  total_hours NUMERIC,
  shift_id TEXT REFERENCES shifts(id),
  photo_proof TEXT,
  is_manual BOOLEAN DEFAULT FALSE,
  notes TEXT,
  locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STORE_VISITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS store_visits (
  id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  distance_from_store NUMERIC NOT NULL DEFAULT 0,
  is_suspicious BOOLEAN DEFAULT FALSE,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  duration INTEGER,                  -- minutes
  date DATE NOT NULL,
  path JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HOLIDAYS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public', 'corporate', 'regional')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default holidays
INSERT INTO holidays (id, date, name, type)
VALUES
  ('h1', '2026-01-01', 'New Year''s Day', 'public'),
  ('h2', '2026-12-25', 'Christmas', 'public')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RULES TABLE (single-row settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Enforce single row
  policy JSONB NOT NULL DEFAULT '{
    "lateThresholdMinutes": 15,
    "graceTimeMinutes": 5,
    "minHoursForFullDay": 8,
    "minHoursForHalfDay": 4,
    "absentAfterMinutes": 60
  }',
  settings JSONB NOT NULL DEFAULT '{
    "photoProofRequired": false,
    "companyName": "Executive Workspace",
    "timezone": "UTC+5:30",
    "allowManualEdits": true
  }',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default rules
INSERT INTO rules (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SHIFT_CHANGE_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_change_logs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_shift_id TEXT REFERENCES shifts(id),
  new_shift_id TEXT REFERENCES shifts(id),
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE_SCORES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  attendance_score INTEGER DEFAULT 0,
  field_score INTEGER DEFAULT 0,
  punctuality_score INTEGER DEFAULT 0,
  location_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- ============================================================
-- FRAUD_ALERTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Short Visit', 'Too Many Stores', 'Location Mismatch', 'Unrealistic Movement')),
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High')),
  date DATE NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date, type)   -- Prevent duplicate alerts
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Look up email by employee_id (for login flow)
CREATE OR REPLACE FUNCTION get_email_by_employee_id(emp_id TEXT)
RETURNS TEXT AS $$
  SELECT email FROM profiles
  WHERE employee_id = emp_id OR code = emp_id
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

-- PROFILES: All authenticated users can read (for directory). Only admin can write.
CREATE POLICY "profiles_read_authenticated" ON profiles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated USING (is_admin() OR id = auth.uid());

CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE TO authenticated USING (is_admin());

-- ATTENDANCE: Employees read own, admin reads all. Write: employees write own, admin writes all.
CREATE POLICY "attendance_read" ON attendance
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND NOT locked) OR is_admin()
  );

-- STORE_VISITS: Employees read own + admin reads all. Write: own only + admin.
CREATE POLICY "store_visits_read" ON store_visits
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "store_visits_insert" ON store_visits
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR is_admin());

CREATE POLICY "store_visits_update" ON store_visits
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR is_admin());

-- HOLIDAYS: All authenticated read. Only admin writes.
CREATE POLICY "holidays_read" ON holidays
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "holidays_write" ON holidays
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- RULES: All authenticated read. Only admin writes.
CREATE POLICY "rules_read" ON rules
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "rules_update" ON rules
  FOR UPDATE TO authenticated USING (is_admin());

-- SHIFTS: All authenticated read. Only admin writes.
CREATE POLICY "shifts_read" ON shifts
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "shifts_write" ON shifts
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- SHIFT LOGS: Admin reads all. Employees read own.
CREATE POLICY "shift_logs_read" ON shift_change_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "shift_logs_insert" ON shift_change_logs
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- PERFORMANCE SCORES: Employees read own. Admin reads all.
CREATE POLICY "performance_read" ON performance_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "performance_write" ON performance_scores
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- FRAUD ALERTS: Admin reads all. No employee self-read needed.
CREATE POLICY "fraud_alerts_read" ON fraud_alerts
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "fraud_alerts_write" ON fraud_alerts
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
