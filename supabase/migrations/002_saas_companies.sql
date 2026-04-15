-- ============================================================
-- SaaS MVP Phase 1: Multi-company support
-- Run this against your Supabase project via the SQL editor.
--
-- PREREQUISITE: Disable "Confirm email" in Supabase Auth settings
-- (Authentication > Providers > Email > Confirm email = OFF)
-- so that newly signed-up admins get an immediate session.
-- ============================================================

-- ── 1. COMPANIES TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  plan       TEXT        NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('free', 'paid')),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ── 2. ADD company_id TO ALL TABLES ─────────────────────────
-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- shifts (previously global, now per-company)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- holidays
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- rules (previously id=1 singleton, now per-company)
ALTER TABLE rules ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- store_visits
ALTER TABLE store_visits ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- performance_scores
ALTER TABLE performance_scores ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- fraud_alerts
ALTER TABLE fraud_alerts ADD COLUMN IF NOT EXISTS
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- ── 3. HELPER FUNCTION ───────────────────────────────────────
-- Resolves the company_id of the currently authenticated user.
-- SECURITY DEFINER bypasses RLS on profiles (safe: read-only lookup).
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── 4. RLS POLICIES ──────────────────────────────────────────

-- companies --
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (id = auth_company_id());

-- Any authenticated user may create one company (signup flow).
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = auth_company_id());

-- profiles --
-- Drop any broad existing read policy before replacing it.
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (company_id = auth_company_id());

-- On signup the user inserts their own profile row (id = auth.uid()).
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (company_id = auth_company_id());

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (company_id = auth_company_id());

-- shifts --
DROP POLICY IF EXISTS "Allow authenticated users to read shifts" ON shifts;
DROP POLICY IF EXISTS "shifts_select" ON shifts;

CREATE POLICY "shifts_company" ON shifts
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- holidays --
DROP POLICY IF EXISTS "holidays_select" ON holidays;

CREATE POLICY "holidays_company" ON holidays
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- rules --
DROP POLICY IF EXISTS "rules_select" ON rules;

CREATE POLICY "rules_company" ON rules
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- attendance --
DROP POLICY IF EXISTS "attendance_select" ON attendance;

CREATE POLICY "attendance_company" ON attendance
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- store_visits --
DROP POLICY IF EXISTS "store_visits_select" ON store_visits;

CREATE POLICY "store_visits_company" ON store_visits
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- performance_scores --
CREATE POLICY "perf_company" ON performance_scores
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- fraud_alerts --
CREATE POLICY "fraud_company" ON fraud_alerts
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── 5. UPDATE get_email_by_employee_id RPC ───────────────────
-- Adds optional p_company_slug param so employee login is scoped
-- to a specific company.  Falls back to global search if omitted.
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
      WHERE employee_id = emp_id
        AND company_id  = v_company_id
      LIMIT 1;
  ELSE
    -- Backward-compatible global lookup (single-company installs)
    SELECT email INTO v_email
      FROM profiles
      WHERE employee_id = emp_id
      LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. NOTE ON EXISTING DATA ─────────────────────────────────
-- Rows created before this migration have company_id = NULL and
-- will be invisible through the new RLS policies.
-- To assign existing data to a company, run:
--
--   UPDATE profiles        SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
--   UPDATE shifts          SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
--   UPDATE holidays        SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
--   UPDATE rules           SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
--   UPDATE attendance      SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
--   UPDATE store_visits    SET company_id = '<your-company-uuid>' WHERE company_id IS NULL;
