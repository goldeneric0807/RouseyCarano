-- Migration 003: Wager Change Requests
-- Members can request the admin change their pick or amount.
-- Admin sees requests in the Admin Panel and can approve or deny.
-- Run this in Supabase SQL Editor.

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wager_change_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Snapshot of the wager at time of request
  current_pick      text NOT NULL CHECK (current_pick IN ('rousey', 'carano')),
  current_amount    numeric(10,2) NOT NULL,

  -- What the member is requesting
  requested_pick    text NOT NULL CHECK (requested_pick IN ('rousey', 'carano')),
  requested_amount  numeric(10,2) NOT NULL CHECK (requested_amount >= 0),

  -- Optional reason from the member
  reason            text,

  -- Admin action
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  admin_response    text,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER wager_change_requests_updated_at
  BEFORE UPDATE ON public.wager_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.wager_change_requests ENABLE ROW LEVEL SECURITY;

-- Members can submit a new request
CREATE POLICY "Members insert own change requests"
  ON wager_change_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Members can read their own requests (to see status / admin response)
CREATE POLICY "Members read own change requests"
  ON wager_change_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can read all change requests
CREATE POLICY "Admin reads all change requests"
  ON wager_change_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admin can update (approve / deny) any request
CREATE POLICY "Admin updates change requests"
  ON wager_change_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Grant table access
GRANT SELECT, INSERT ON public.wager_change_requests TO authenticated;
GRANT UPDATE ON public.wager_change_requests TO authenticated;

SELECT 'Migration 003 complete — wager_change_requests table created' AS result;
