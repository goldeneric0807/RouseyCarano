-- Migration 002: Fix RLS so admin can insert their own wager
-- Run this in Supabase SQL Editor

-- Allow users to insert their own wager row (needed for admin self-wager)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users insert own wager' AND tablename = 'wagers'
  ) THEN
    CREATE POLICY "Users insert own wager"
      ON public.wagers FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Allow users to update their own wager (needed for admin self-wager edit)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users update own wager pick and amount' AND tablename = 'wagers'
  ) THEN
    CREATE POLICY "Users update own wager pick and amount"
      ON public.wagers FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Add betting_locked column to event_info if it doesn't exist
ALTER TABLE public.event_info ADD COLUMN IF NOT EXISTS betting_locked boolean DEFAULT false;

-- Confirm your profile is admin
UPDATE public.profiles SET role = 'admin', status = 'approved' WHERE email = 'goldeneric0807@gmail.com';

SELECT 'Migration 002 complete' as result;
