-- ============================================================
-- Migration 004: Complete clean slate + fresh accounts
--
-- Run this ONCE in Supabase SQL Editor:
--   Dashboard → SQL Editor → paste → Run
--
-- What this does:
--   1. Cleans ALL data (auth users, profiles, companies, etc.)
--   2. Fixes employee_id uniqueness to be per-company (not global)
--   3. Fixes get_email_by_employee_id overload conflict
--   4. Creates fresh company "Executive Workspace"
--   5. Creates admin + employee auth users and profiles
--   6. Rebuilds all RLS policies cleanly
-- ============================================================

-- ── DISABLE RLS temporarily to allow bulk cleanup ────────────
ALTER TABLE profiles        DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies       DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts          DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays        DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance      DISABLE ROW LEVEL SECURITY;
ALTER TABLE rules           DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_visits    DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_change_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE performance_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts    DISABLE ROW LEVEL SECURITY;

-- ── 1. CLEAN ALL APPLICATION DATA ────────────────────────────

-- Guard: only truncate tables that exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fraud_alerts') THEN
    TRUNCATE TABLE fraud_alerts RESTART IDENTITY CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='performance_scores') THEN
    TRUNCATE TABLE performance_scores RESTART IDENTITY CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shift_change_logs') THEN
    TRUNCATE TABLE shift_change_logs RESTART IDENTITY CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='store_visits') THEN
    TRUNCATE TABLE store_visits RESTART IDENTITY CASCADE;
  END IF;
  TRUNCATE TABLE attendance          RESTART IDENTITY CASCADE;
  TRUNCATE TABLE profiles            RESTART IDENTITY CASCADE;
  TRUNCATE TABLE shifts              RESTART IDENTITY CASCADE;
  TRUNCATE TABLE holidays            RESTART IDENTITY CASCADE;
  TRUNCATE TABLE rules               RESTART IDENTITY CASCADE;
  TRUNCATE TABLE companies           RESTART IDENTITY CASCADE;
END $$;

-- ── 2. CLEAN ALL AUTH USERS ──────────────────────────────────
DELETE FROM auth.users;

-- ── 3. FIX employee_id uniqueness → per-company ──────────────
-- Drop old global UNIQUE constraints (may not exist if already dropped)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_code_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_company_unique;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_code_company_unique;

-- Re-add as per-company unique (employee_id unique within a company)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_employee_id_company_unique
  UNIQUE (employee_id, company_id);

-- code unique within a company
ALTER TABLE profiles
  ADD CONSTRAINT profiles_code_company_unique
  UNIQUE (code, company_id);

-- ── 3b. FIX rules table → support multiple companies ─────────
-- The original schema enforced id=1 (single-row). Remove that constraint.
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_id_check;
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_pkey;

-- Add a proper UUID primary key
ALTER TABLE rules ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE rules ALTER COLUMN id DROP NOT NULL;

-- Make uuid_id the real PK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rules_uuid_pkey'
  ) THEN
    ALTER TABLE rules ADD CONSTRAINT rules_uuid_pkey PRIMARY KEY (uuid_id);
  END IF;
END $$;

-- ── 4. FIX get_email_by_employee_id overload conflict ─────────
-- Drop ALL versions of this function
DROP FUNCTION IF EXISTS get_email_by_employee_id(text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(text, text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(emp_id text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(emp_id text, p_company_slug text);

-- Recreate as single canonical function
CREATE OR REPLACE FUNCTION get_email_by_employee_id(
  emp_id         TEXT,
  p_company_slug TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_email      TEXT;
  v_company_id UUID;
BEGIN
  IF p_company_slug IS NOT NULL AND p_company_slug <> '' THEN
    SELECT id INTO v_company_id
      FROM companies
      WHERE slug = p_company_slug
      LIMIT 1;

    SELECT email INTO v_email
      FROM profiles
      WHERE profiles.employee_id = emp_id
        AND profiles.company_id  = v_company_id
      LIMIT 1;
  ELSE
    SELECT email INTO v_email
      FROM profiles
      WHERE profiles.employee_id = emp_id
      LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. CREATE FRESH COMPANY ───────────────────────────────────
INSERT INTO companies (id, name, slug, plan, is_active, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Executive Workspace',
  'exec-workspace',
  'free',
  true,
  now()
);

-- ── 6. CREATE ADMIN AUTH USER ─────────────────────────────────
-- email: admin@execworkspace.app  password: Admin@1234
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  aud,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'admin@execworkspace.app',
  crypt('Admin@1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin","employee_id":"admin1","role":"admin","company_id":"00000000-0000-0000-0000-000000000001"}',
  now(),
  now(),
  '',
  '',
  '',
  'authenticated',
  'authenticated'
);

-- Create identity for admin (required by Supabase Auth)
INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'admin@execworkspace.app',
  '00000000-0000-0000-0000-000000000010',
  '{"sub":"00000000-0000-0000-0000-000000000010","email":"admin@execworkspace.app"}',
  'email',
  now(),
  now(),
  now()
);

-- ── 7. CREATE EMPLOYEE AUTH USER ─────────────────────────────
-- email: emp1@execworkspace.app  password: Emp@1234
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  aud,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000000',
  'emp1@execworkspace.app',
  crypt('Emp@1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Employee 1","employee_id":"emp1","role":"employee","company_id":"00000000-0000-0000-0000-000000000001"}',
  now(),
  now(),
  '',
  '',
  '',
  'authenticated',
  'authenticated'
);

-- Create identity for employee
INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'emp1@execworkspace.app',
  '00000000-0000-0000-0000-000000000020',
  '{"sub":"00000000-0000-0000-0000-000000000020","email":"emp1@execworkspace.app"}',
  'email',
  now(),
  now(),
  now()
);

-- ── 8. SEED DEFAULT SHIFT ─────────────────────────────────────
INSERT INTO shifts (id, company_id, name, start_time, end_time, min_hours_for_full_day, min_hours_for_half_day, is_flexible)
VALUES (
  'shift-standard',
  '00000000-0000-0000-0000-000000000001',
  'Standard',
  '09:00',
  '18:00',
  8,
  4,
  false
);

-- ── 9. CREATE ADMIN PROFILE ───────────────────────────────────
INSERT INTO profiles (
  id,
  company_id,
  employee_id,
  code,
  name,
  email,
  role,
  department,
  shift_id,
  field_tracking_enabled,
  needs_attention,
  is_high_risk,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'admin1',
  'A-001',
  'Admin',
  'admin@execworkspace.app',
  'admin',
  'Management',
  'shift-standard',
  false,
  false,
  false,
  now(),
  now()
);

-- ── 10. CREATE EMPLOYEE PROFILE ───────────────────────────────
INSERT INTO profiles (
  id,
  company_id,
  employee_id,
  code,
  name,
  email,
  role,
  department,
  shift_id,
  field_tracking_enabled,
  needs_attention,
  is_high_risk,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'emp1',
  'E-001',
  'Employee 1',
  'emp1@execworkspace.app',
  'employee',
  'Operations',
  'shift-standard',
  false,
  false,
  false,
  now(),
  now()
);

-- ── 11. SEED DEFAULT RULES ────────────────────────────────────
INSERT INTO rules (company_id, policy, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{
    "lateThresholdMinutes": 15,
    "graceTimeMinutes": 5,
    "minHoursForFullDay": 8,
    "minHoursForHalfDay": 4,
    "absentAfterMinutes": 60
  }',
  '{
    "photoProofRequired": false,
    "companyName": "Executive Workspace",
    "timezone": "UTC+5:30",
    "allowManualEdits": true,
    "autoCheckoutHours": 8,
    "storeRadiusOverrides": {}
  }'
);

-- ── 12. SEED HOLIDAYS ─────────────────────────────────────────
INSERT INTO holidays (id, company_id, date, name, type)
VALUES
  ('h-2026-ny',  '00000000-0000-0000-0000-000000000001', '2026-01-01', 'New Year''s Day', 'public'),
  ('h-2026-xmas','00000000-0000-0000-0000-000000000001', '2026-12-25', 'Christmas Day',   'public')
ON CONFLICT (id) DO NOTHING;

-- ── 13. REBUILD RLS POLICIES (CLEAN STATE) ────────────────────

-- Drop ALL existing policies on every table
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── COMPANIES ─────────────────────────────────────────────────
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (id = auth_company_id() OR auth.role() = 'authenticated');

CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = auth_company_id());

-- ── PROFILES ──────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

-- ── SHIFTS ────────────────────────────────────────────────────
CREATE POLICY "shifts_company" ON shifts
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── HOLIDAYS ──────────────────────────────────────────────────
CREATE POLICY "holidays_company" ON holidays
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── RULES ─────────────────────────────────────────────────────
CREATE POLICY "rules_company" ON rules
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── ATTENDANCE ────────────────────────────────────────────────
CREATE POLICY "attendance_company" ON attendance
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── STORE VISITS ──────────────────────────────────────────────
CREATE POLICY "store_visits_company" ON store_visits
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── SHIFT CHANGE LOGS ─────────────────────────────────────────
CREATE POLICY "shift_logs_company" ON shift_change_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = shift_change_logs.user_id
        AND p.company_id = auth_company_id()
    )
  );

-- ── PERFORMANCE SCORES ────────────────────────────────────────
CREATE POLICY "perf_company" ON performance_scores
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── FRAUD ALERTS ──────────────────────────────────────────────
CREATE POLICY "fraud_company" ON fraud_alerts
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── 14. RE-ENABLE RLS ─────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_visits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts    ENABLE ROW LEVEL SECURITY;

-- ── 15. ENSURE SECURITY DEFINER FUNCTIONS ARE UP TO DATE ──────

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_profile()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── DONE ──────────────────────────────────────────────────────
-- Accounts created:
--   ADMIN:    email=admin@execworkspace.app   employee_id=admin1  password=Admin@1234
--   EMPLOYEE: email=emp1@execworkspace.app    employee_id=emp1    password=Emp@1234
--   COMPANY:  Executive Workspace  slug=exec-workspace
-- ============================================================
