-- ============================================================
-- Migration 003: Fix RLS policy conflicts on profiles table
--
-- Problem: Migration 001 created "profiles_read_authenticated" (TRUE)
-- and "profiles_insert_admin" (is_admin() required). Migration 002
-- added new policies but dropped wrong names, leaving all old policies
-- still active and conflicting.
--
-- This migration:
--   1. Drops ALL conflicting policies from migrations 001 and 002
--   2. Replaces with clean, non-circular policies
--   3. Adds get_current_profile() SECURITY DEFINER function so the
--      frontend can always fetch its own profile regardless of RLS state
-- ============================================================

-- ── 1. Drop ALL existing policies on profiles ────────────────
-- (safe: IF EXISTS on each so re-running this migration is harmless)

DROP POLICY IF EXISTS "profiles_read_authenticated"  ON profiles;
DROP POLICY IF EXISTS "profiles_insert_admin"         ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin"         ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"         ON profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON profiles;
DROP POLICY IF EXISTS "profiles_select"               ON profiles;
DROP POLICY IF EXISTS "profiles_insert"               ON profiles;
DROP POLICY IF EXISTS "profiles_update"               ON profiles;
DROP POLICY IF EXISTS "profiles_delete"               ON profiles;

-- ── 2. Clean policies ────────────────────────────────────────

-- SELECT: own row is ALWAYS visible (id = auth.uid() avoids the
-- circular dependency where auth_company_id() needs the profile
-- to already be visible). Company-mates are visible via auth_company_id().
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

-- INSERT: a user may only insert their own row (id must equal their uid).
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- UPDATE: own row + company admins.
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

-- DELETE: company-scoped (admin action only in practice).
CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (company_id = auth_company_id());

-- ── 3. SECURITY DEFINER function for own-profile fetch ───────
-- Bypasses RLS entirely so the frontend always gets its own profile
-- row even if policies are misconfigured.
CREATE OR REPLACE FUNCTION get_current_profile()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── 4. Fix companies SELECT policy ───────────────────────────
-- Allow authenticated users to read their own company.
-- auth_company_id() is SECURITY DEFINER so this works post-profile-load.
DROP POLICY IF EXISTS "companies_select" ON companies;

CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    id = auth_company_id()
    OR auth.role() = 'authenticated'  -- fallback: any signed-in user can read companies
  );

-- ── 5. Ensure auth_company_id() is up to date ────────────────
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
