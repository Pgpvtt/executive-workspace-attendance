-- ============================================================
-- Migration 006: Fix RLS policies for performance_scores and fraud_alerts
--
-- Problem: Both tables have no company_id column, but migrations 004/005
-- created policies that reference company_id directly → INSERT violates RLS.
-- Fix: Use EXISTS subquery joining through profiles (same pattern as shift_change_logs).
-- ============================================================

-- ── performance_scores ───────────────────────────────────────
DROP POLICY IF EXISTS "perf_company" ON performance_scores;

CREATE POLICY "perf_company" ON performance_scores
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM profiles p
      WHERE p.id = performance_scores.user_id
        AND p.company_id = auth_company_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM profiles p
      WHERE p.id = performance_scores.user_id
        AND p.company_id = auth_company_id()
    )
  );

-- ── fraud_alerts ─────────────────────────────────────────────
DROP POLICY IF EXISTS "fraud_company" ON fraud_alerts;

CREATE POLICY "fraud_company" ON fraud_alerts
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM profiles p
      WHERE p.id = fraud_alerts.user_id
        AND p.company_id = auth_company_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM profiles p
      WHERE p.id = fraud_alerts.user_id
        AND p.company_id = auth_company_id()
    )
  );
