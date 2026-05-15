-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 001 — Betting lock, user wager edits, admin persistence
-- Run this in Supabase SQL Editor AFTER your existing schema is in place.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add betting_locked column to event_info (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_info'
      AND column_name = 'betting_locked'
  ) THEN
    ALTER TABLE public.event_info ADD COLUMN betting_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Ensure event_info row exists
INSERT INTO public.event_info (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3. Permanently set goldeneric0807@gmail.com as admin
-- (Run after you've signed in at least once so the profile row exists)
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = 'goldeneric0807@gmail.com';

-- 4. Add RLS policy allowing users to update their OWN wager pick+amount
--    (only when betting is open — enforced in application layer)
--    Drop old policies and replace with expanded set.

-- Drop existing user wager policies
DROP POLICY IF EXISTS "Users read own wager" ON public.wagers;
DROP POLICY IF EXISTS "Users read all confirmed wagers" ON public.wagers;
DROP POLICY IF EXISTS "Admin reads all wagers" ON public.wagers;
DROP POLICY IF EXISTS "Admin inserts wagers" ON public.wagers;
DROP POLICY IF EXISTS "Admin updates wagers" ON public.wagers;
DROP POLICY IF EXISTS "Users update own wager" ON public.wagers;

-- Recreate with user self-update included
CREATE POLICY "Users read own wager"
  ON public.wagers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users read all confirmed wagers"
  ON public.wagers FOR SELECT
  USING (status = 'confirmed');

CREATE POLICY "Admin reads all wagers"
  ON public.wagers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin inserts wagers"
  ON public.wagers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin updates wagers"
  ON public.wagers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Allow users to update pick and amount on their own wager
-- (amount validated by application layer: $1–$20 for members, $1–$100 for admin)
CREATE POLICY "Users update own wager pick and amount"
  ON public.wagers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow confirmed members to insert their own wager row if none exists yet
CREATE POLICY "Users insert own wager"
  ON public.wagers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Admin profile auto-fix trigger
--    Ensures goldeneric0807@gmail.com is always set to admin on login
CREATE OR REPLACE FUNCTION public.enforce_admin_email()
RETURNS trigger AS $$
BEGIN
  IF lower(NEW.email) = 'goldeneric0807@gmail.com' THEN
    NEW.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_admin_email_trigger ON public.profiles;
CREATE TRIGGER enforce_admin_email_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_email();

-- 6. Update handle_new_user to enforce admin email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  reserved public.wager_reservations%rowtype;
  assigned_role text;
BEGIN
  -- Auto-assign admin role to the designated admin email
  IF lower(NEW.email) = 'goldeneric0807@gmail.com' THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := coalesce(NEW.raw_user_meta_data->>'role', 'member');
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', 'New Member'),
    NEW.email,
    assigned_role,
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    role = CASE
      WHEN lower(excluded.email) = 'goldeneric0807@gmail.com' THEN 'admin'
      ELSE COALESCE(public.profiles.role, excluded.role)
    END,
    full_name = CASE
      WHEN public.profiles.full_name = 'New Member' THEN excluded.full_name
      ELSE public.profiles.full_name
    END;

  -- Link reservation if one exists for this email
  SELECT * INTO reserved
  FROM public.wager_reservations
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF reserved.id IS NOT NULL THEN
    INSERT INTO public.wagers (user_id, pick, amount, status, admin_notes)
    VALUES (NEW.id, reserved.pick, reserved.amount, reserved.status, 'Created from wager reservation')
    ON CONFLICT (user_id) DO UPDATE SET
      pick = excluded.pick,
      amount = excluded.amount,
      status = excluded.status;

    UPDATE public.wager_reservations
    SET fulfilled_user_id = NEW.id
    WHERE id = reserved.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Seed: Eric (goldeneric0807@gmail.com) — admin + $100 on Carano
-- Run this after goldeneric0807@gmail.com has a profile row
INSERT INTO public.wagers (user_id, pick, amount, status, admin_notes)
SELECT id, 'carano', 100, 'confirmed', 'Admin seed wager'
FROM public.profiles
WHERE lower(email) = 'goldeneric0807@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET
  pick = 'carano',
  amount = 100,
  status = 'confirmed';

-- 8. Verification query — run after migration to confirm
SELECT
  p.full_name,
  p.email,
  p.role,
  w.pick,
  w.amount,
  w.status,
  e.betting_locked
FROM public.profiles p
LEFT JOIN public.wagers w ON w.user_id = p.id
CROSS JOIN public.event_info e
WHERE e.id = 1
ORDER BY p.role DESC, w.amount DESC NULLS LAST;
