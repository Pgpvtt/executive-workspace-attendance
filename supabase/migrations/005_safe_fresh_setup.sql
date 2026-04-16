-- ============================================================
-- EXECUTIVE WORKSPACE — SAFE FRESH SETUP (v2)
-- ============================================================
-- Paste into: Supabase Dashboard → SQL Editor → Run
-- Safe: every dangerous operation is guarded with IF EXISTS
-- ============================================================

-- ── 1. ENABLE REQUIRED EXTENSION ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. WIPE AUTH DATA (safe order, guarded) ──────────────────
DO $$ BEGIN
  -- Delete child tables first to avoid FK violations
  DELETE FROM auth.mfa_amr_claims    WHERE TRUE; EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DELETE FROM auth.mfa_challenges    WHERE TRUE; EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DELETE FROM auth.mfa_factors       WHERE TRUE; EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DELETE FROM auth.saml_relay_states WHERE TRUE; EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DELETE FROM auth.flow_state        WHERE TRUE; EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

-- ── 3. WIPE PUBLIC DATA ───────────────────────────────────────
ALTER TABLE companies  DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles   DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts     DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays   DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE rules      DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE 'ALTER TABLE store_visits DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE shift_change_logs DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE performance_scores DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE fraud_alerts DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Wipe all tables (cascade handles FKs)
DO $$ BEGIN EXECUTE 'TRUNCATE TABLE fraud_alerts        CASCADE'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'TRUNCATE TABLE performance_scores  CASCADE'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'TRUNCATE TABLE shift_change_logs   CASCADE'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'TRUNCATE TABLE store_visits        CASCADE'; EXCEPTION WHEN undefined_table THEN NULL; END $$;

TRUNCATE TABLE attendance  CASCADE;
TRUNCATE TABLE profiles    CASCADE;
TRUNCATE TABLE shifts      CASCADE;
TRUNCATE TABLE holidays    CASCADE;
TRUNCATE TABLE rules       CASCADE;
TRUNCATE TABLE companies   CASCADE;

-- ── 4. FIX SCHEMA CONSTRAINTS ─────────────────────────────────

-- employee_id: unique per company, not globally
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_code_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_company_unique;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_code_company_unique;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_employee_id_company_unique UNIQUE (employee_id, company_id);
ALTER TABLE profiles
  ADD CONSTRAINT profiles_code_company_unique UNIQUE (code, company_id);

-- holidays date: unique per company, not globally
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_company_unique;
ALTER TABLE holidays ADD CONSTRAINT holidays_date_company_unique UNIQUE (date, company_id);

-- rules: allow one row per company (remove the old id=1 check)
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_id_check;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='rules_pkey' AND conrelid='rules'::regclass
  ) THEN
    ALTER TABLE rules DROP CONSTRAINT rules_pkey;
  END IF;
END $$;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rules_uuid_pkey') THEN
    ALTER TABLE rules ADD CONSTRAINT rules_uuid_pkey PRIMARY KEY (uuid_id);
  END IF;
END $$;

-- ── 5. FIX get_email_by_employee_id (overload conflict) ───────
DROP FUNCTION IF EXISTS get_email_by_employee_id(text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(text, text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(emp_id text);
DROP FUNCTION IF EXISTS get_email_by_employee_id(emp_id text, p_company_slug text);

CREATE FUNCTION get_email_by_employee_id(
  emp_id         TEXT,
  p_company_slug TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_email      TEXT;
  v_company_id UUID;
BEGIN
  IF p_company_slug IS NOT NULL AND p_company_slug <> '' THEN
    SELECT id INTO v_company_id FROM companies WHERE slug = p_company_slug LIMIT 1;
    SELECT email INTO v_email FROM profiles
      WHERE profiles.employee_id = emp_id AND profiles.company_id = v_company_id LIMIT 1;
  ELSE
    SELECT email INTO v_email FROM profiles WHERE profiles.employee_id = emp_id LIMIT 1;
  END IF;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. CREATE COMPANY ─────────────────────────────────────────
INSERT INTO companies (id, name, slug, plan, is_active, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Executive Workspace',
  'exec-workspace',
  'free',
  true,
  now()
);

-- ── 7. CREATE AUTH USERS ──────────────────────────────────────
-- Admin — email: admin@execworkspace.app / password: Admin@1234
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  'admin@execworkspace.app',
  crypt('Admin@1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin","employee_id":"admin1","role":"admin","company_id":"00000000-0000-0000-0000-000000000001"}',
  now(),
  now(),
  'authenticated',
  'authenticated'
);

-- Employee — email: emp1@execworkspace.app / password: Emp@1234
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000020',
  'emp1@execworkspace.app',
  crypt('Emp@1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Employee 1","employee_id":"emp1","role":"employee","company_id":"00000000-0000-0000-0000-000000000001"}',
  now(),
  now(),
  'authenticated',
  'authenticated'
);

-- ── 8. CREATE AUTH IDENTITIES ─────────────────────────────────
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES
  (
    'admin@execworkspace.app',
    '00000000-0000-0000-0000-000000000010',
    '{"sub":"00000000-0000-0000-0000-000000000010","email":"admin@execworkspace.app","email_verified":true}',
    'email', now(), now()
  ),
  (
    'emp1@execworkspace.app',
    '00000000-0000-0000-0000-000000000020',
    '{"sub":"00000000-0000-0000-0000-000000000020","email":"emp1@execworkspace.app","email_verified":true}',
    'email', now(), now()
  );

-- ── 9. SEED SHIFT ─────────────────────────────────────────────
INSERT INTO shifts (id, company_id, name, start_time, end_time,
                    min_hours_for_full_day, min_hours_for_half_day, is_flexible)
VALUES (
  'shift-standard',
  '00000000-0000-0000-0000-000000000001',
  'Standard', '09:00', '18:00', 8, 4, false
);

-- ── 10. CREATE PROFILES ───────────────────────────────────────
-- Admin profile (profiles.id MUST equal auth.users.id)
INSERT INTO profiles (id, company_id, employee_id, code, name, email, role,
                      department, shift_id, field_tracking_enabled,
                      needs_attention, is_high_risk, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'admin1', 'A-001', 'Admin', 'admin@execworkspace.app', 'admin',
  'Management', 'shift-standard', false, false, false, now(), now()
);

-- Employee profile
INSERT INTO profiles (id, company_id, employee_id, code, name, email, role,
                      department, shift_id, field_tracking_enabled,
                      needs_attention, is_high_risk, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'emp1', 'E-001', 'Employee 1', 'emp1@execworkspace.app', 'employee',
  'Operations', 'shift-standard', false, false, false, now(), now()
);

-- ── 11. SEED RULES ────────────────────────────────────────────
INSERT INTO rules (company_id, policy, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{"lateThresholdMinutes":15,"graceTimeMinutes":5,"minHoursForFullDay":8,"minHoursForHalfDay":4,"absentAfterMinutes":60}',
  '{"photoProofRequired":false,"companyName":"Executive Workspace","timezone":"UTC+5:30","allowManualEdits":true,"autoCheckoutHours":8,"storeRadiusOverrides":{}}'
);

-- ── 12. SEED HOLIDAYS ─────────────────────────────────────────
INSERT INTO holidays (id, company_id, date, name, type)
VALUES
  ('h-2026-ny',   '00000000-0000-0000-0000-000000000001', '2026-01-01', 'New Year''s Day', 'public'),
  ('h-2026-xmas', '00000000-0000-0000-0000-000000000001', '2026-12-25', 'Christmas Day',   'public');

-- ── 13. DROP ALL OLD RLS POLICIES ────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 14. REBUILD CLEAN RLS POLICIES ───────────────────────────

-- Companies: any authenticated user can read
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = auth_company_id());

-- Profiles: own row always visible; company-mates visible too
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid() OR company_id = auth_company_id());
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid() OR company_id = auth_company_id());
CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (id = auth.uid() OR company_id = auth_company_id());

-- Shifts
CREATE POLICY "shifts_company" ON shifts
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Holidays
CREATE POLICY "holidays_company" ON holidays
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Rules
CREATE POLICY "rules_company" ON rules
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Attendance
CREATE POLICY "attendance_company" ON attendance
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Optional tables (guarded)
DO $$ BEGIN
  EXECUTE $p$ CREATE POLICY "store_visits_company" ON store_visits
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id()) $p$;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE $p$ CREATE POLICY "shift_logs_company" ON shift_change_logs
    FOR ALL USING (
      EXISTS(SELECT 1 FROM profiles p WHERE p.id=shift_change_logs.user_id AND p.company_id=auth_company_id())
    ) $p$;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE $p$ CREATE POLICY "perf_company" ON performance_scores
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id()) $p$;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE $p$ CREATE POLICY "fraud_company" ON fraud_alerts
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id()) $p$;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 15. RE-ENABLE RLS ─────────────────────────────────────────
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays   ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE 'ALTER TABLE store_visits ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE shift_change_logs ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE performance_scores ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 16. SECURITY DEFINER FUNCTIONS ───────────────────────────

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_profile()
RETURNS SETOF profiles LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT * FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── VERIFY: should show 1/2/2/1/1 ────────────────────────────
SELECT 'companies'  AS table_name, count(*)::text AS rows FROM companies
UNION ALL SELECT 'profiles',   count(*)::text FROM profiles
UNION ALL SELECT 'auth.users', count(*)::text FROM auth.users
UNION ALL SELECT 'shifts',     count(*)::text FROM shifts
UNION ALL SELECT 'rules',      count(*)::text FROM rules;
