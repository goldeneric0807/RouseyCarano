-- ════════════════════════════════════════════════════════════════════════════
-- SEED SCRIPT — RvC Wager Hub (Updated)
-- ════════════════════════════════════════════════════════════════════════════
-- PRE-REQUISITES:
--   All users must exist in Supabase Auth (Authentication → Users).
--   Invite them first: Auth → Users → Invite user → enter email.
--   Then run this after they've clicked their invite links and have profile rows.
--
-- Users:
--   goldeneric0807@gmail.com     (admin / Eric)
--   ajwoodpdx@comcast.net        (Aaron)
--   CaScot.34@gmail.com          (Rhonda)
--   ricky@armoredrestoration.com (Ricky)
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — Set Eric as admin (permanent)
UPDATE public.profiles
SET role = 'admin', full_name = 'Eric'
WHERE lower(email) = 'goldeneric0807@gmail.com';

-- STEP 2 — Full names for members
UPDATE public.profiles SET full_name = 'Aaron'  WHERE lower(email) = 'ajwoodpdx@comcast.net';
UPDATE public.profiles SET full_name = 'Rhonda' WHERE lower(email) = lower('CaScot.34@gmail.com');
UPDATE public.profiles SET full_name = 'Ricky'  WHERE lower(email) = 'ricky@armoredrestoration.com';

-- STEP 3 — Create/update wagers
-- Eric (admin) — $100 on Carano (admin exception)
INSERT INTO public.wagers (user_id, pick, amount, status, admin_notes)
SELECT id, 'carano', 100, 'confirmed', 'Admin account - exception limit'
FROM public.profiles WHERE lower(email) = 'goldeneric0807@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET pick = 'carano', amount = 100, status = 'confirmed';

-- Aaron — $20 on Rousey
INSERT INTO public.wagers (user_id, pick, amount, status)
SELECT id, 'rousey', 20, 'confirmed'
FROM public.profiles WHERE lower(email) = 'ajwoodpdx@comcast.net'
ON CONFLICT (user_id) DO UPDATE SET pick = 'rousey', amount = 20, status = 'confirmed';

-- Rhonda — $20 on Rousey
INSERT INTO public.wagers (user_id, pick, amount, status)
SELECT id, 'rousey', 20, 'confirmed'
FROM public.profiles WHERE lower(email) = lower('CaScot.34@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET pick = 'rousey', amount = 20, status = 'confirmed';

-- Ricky — $20 on Rousey
INSERT INTO public.wagers (user_id, pick, amount, status)
SELECT id, 'rousey', 20, 'confirmed'
FROM public.profiles WHERE lower(email) = 'ricky@armoredrestoration.com'
ON CONFLICT (user_id) DO UPDATE SET pick = 'rousey', amount = 20, status = 'confirmed';

-- STEP 4 — Ensure event_info exists with betting open
INSERT INTO public.event_info (id, betting_locked)
VALUES (1, false)
ON CONFLICT (id) DO UPDATE SET betting_locked = false;

-- STEP 5 — Verify
SELECT
  p.full_name,
  p.email,
  p.role,
  w.pick,
  w.amount,
  w.status
FROM public.wagers w
JOIN public.profiles p ON p.id = w.user_id
ORDER BY w.amount DESC;
