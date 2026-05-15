-- Migration 004: Final fixes
-- 1. Fix wager_reservations RLS (replace profiles subquery with auth.email() to avoid recursion)
-- 2. Add payout_settled column to event_info
-- Run in Supabase SQL Editor

-- ── Fix wager_reservations RLS ────────────────────────────────────────────
-- Drop old policies that use profiles subquery (causes 404/500 errors)
DROP POLICY IF EXISTS "Admin reads all wager reservations" ON public.wager_reservations;
DROP POLICY IF EXISTS "Admin inserts wager reservations" ON public.wager_reservations;
DROP POLICY IF EXISTS "Admin updates wager reservations" ON public.wager_reservations;
DROP POLICY IF EXISTS "Users read own wager reservation" ON public.wager_reservations;

-- Clean replacement using auth.email() — no recursion
CREATE POLICY "wager_reservations_select"
  ON public.wager_reservations FOR SELECT
  USING (
    auth.email() = 'goldeneric0807@gmail.com'
    OR lower(email) = lower(coalesce(auth.email(), ''))
  );

CREATE POLICY "wager_reservations_insert"
  ON public.wager_reservations FOR INSERT
  WITH CHECK (
    auth.email() = 'goldeneric0807@gmail.com'
  );

CREATE POLICY "wager_reservations_update"
  ON public.wager_reservations FOR UPDATE
  USING (
    auth.email() = 'goldeneric0807@gmail.com'
  );

-- ── Fix wager_change_requests RLS (same pattern) ─────────────────────────
DROP POLICY IF EXISTS "Admin reads all change requests" ON public.wager_change_requests;
DROP POLICY IF EXISTS "Admin updates change requests" ON public.wager_change_requests;

CREATE POLICY "change_requests_admin_select"
  ON public.wager_change_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.email() = 'goldeneric0807@gmail.com'
  );

CREATE POLICY "change_requests_admin_update"
  ON public.wager_change_requests FOR UPDATE
  USING (
    auth.email() = 'goldeneric0807@gmail.com'
  );

-- ── Fix profiles RLS (same pattern) ──────────────────────────────────────
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin updates profiles" ON public.profiles;

CREATE POLICY "profiles_admin_select"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR auth.email() = 'goldeneric0807@gmail.com'
  );

CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (
    auth.email() = 'goldeneric0807@gmail.com'
  );

-- ── Fix access_requests RLS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin reads requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admin updates requests" ON public.access_requests;

CREATE POLICY "access_requests_admin_select"
  ON public.access_requests FOR SELECT
  USING (auth.email() = 'goldeneric0807@gmail.com');

CREATE POLICY "access_requests_admin_update"
  ON public.access_requests FOR UPDATE
  USING (auth.email() = 'goldeneric0807@gmail.com');

-- ── Add payout_settled to event_info ─────────────────────────────────────
ALTER TABLE public.event_info
  ADD COLUMN IF NOT EXISTS payout_settled boolean DEFAULT false;

SELECT 'Migration 004 complete — RLS fixed, payout_settled added' AS result;
