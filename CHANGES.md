# RvC Wager App — Change Log

## What Was Fixed & Added

---

### 1. Admin Panel Not Rendering — ROOT CAUSE & FIX

**Root cause:** `ProtectedRoute` was checking `profile?.role !== 'admin'`, but if `fetchProfile` 
hadn't resolved yet (race condition on load), `profile` was `null` and the admin was 
redirected to `/dashboard` before auth finished. Also, `isAdmin` in `Nav` depended purely 
on the DB profile, so if the DB row had the wrong role, no Admin link appeared at all.

**Fixes applied:**
- `AuthContext.tsx`: Added `ADMIN_EMAIL` guard — if the logged-in email matches 
  `goldeneric0807@gmail.com`, `isAdmin` is `true` regardless of DB state (belt + suspenders).
- `AuthContext.tsx`: Auto-patches the DB role to `admin` for the admin email if it's wrong.
- `ProtectedRoute.tsx`: Now uses `isAdmin` (from context) instead of raw `profile?.role` check.
- `Nav.tsx`: Admin Panel link now uses `isAdmin` from context — shows on desktop AND in mobile 
  drawer for any admin user.
- Database trigger (`MIGRATION_001`): `enforce_admin_email_trigger` ensures the DB row for 
  `goldeneric0807@gmail.com` is always `role = 'admin'` on insert/update.

---

### 2. Admin Panel — New Features

**New "Controls" tab:**
- 🔒 Lock / re-open betting with one click
- 🏆 Record fight winner (Rousey or Carano) — locks betting and saves result
- ➕ Manual pool adjustment — add an entry without a user account (useful for off-system bets)
- Event info summary display

**Wagers tab:**
- Added ✕ Remove button to delete a wager row (with confirmation prompt)

**Members tab:**
- Now shows ALL user profiles (name, email, role, status, joined date)
- Pending reservations table still present

**Admin role persistence:**
- Migration adds `enforce_admin_email_trigger` on the `profiles` table: the admin email 
  can never have its role changed away from `admin` at the DB level.

---

### 3. User Editable Wagers

**Dashboard changes:**
- ✏ Edit Wager button appears when:
  - Wager status is `confirmed`
  - Betting is open (`event_info.betting_locked = false`)
- Edit modal features:
  - Fighter picker (visual buttons)
  - Amount input with − / + controls
  - Live payout preview that recalculates with the proposed new values
  - Validates min $1 / max $20 (members) or max $100 (admin)
- Quick adjust buttons: − $5 / + $5 / Custom amount
- Betting locked indicator in page header

**RLS policy added (Migration 001):**
```sql
CREATE POLICY "Users update own wager pick and amount"
  ON public.wagers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```
The application layer enforces the $1–$20 / $1–$100 limits before calling Supabase.

---

### 4. Bet Limits

| User type | Min | Max |
|-----------|-----|-----|
| Regular member | $1 | $20 |
| Admin (goldeneric0807@gmail.com) | $1 | $100 |

Constants defined in `src/types/database.ts`:
```ts
export const MAX_WAGER_MEMBER = 20
export const MIN_WAGER = 1
export const MAX_WAGER_ADMIN = 100
```

---

### 5. Database Changes

**New column:** `event_info.betting_locked` (boolean, default false)

**New RLS policies on `wagers`:**
- `Users update own wager pick and amount` — lets confirmed users edit their own row
- `Users insert own wager` — lets confirmed users create a row if none exists

**New trigger:** `enforce_admin_email_trigger` on `profiles`

**Updated function:** `handle_new_user` auto-assigns `admin` role for the admin email

---

### 6. Files Changed

| File | Change |
|------|--------|
| `src/types/database.ts` | Added `betting_locked` to `EventInfo`, added constants |
| `src/context/AuthContext.tsx` | `ADMIN_EMAIL` guard, `refreshProfile`, DB role auto-patch |
| `src/components/ProtectedRoute.tsx` | Uses `isAdmin` instead of raw profile check |
| `src/components/Nav.tsx` | Admin link uses `isAdmin`, shows in mobile drawer |
| `src/pages/Dashboard.tsx` | Edit wager modal, quick adjust, betting lock status |
| `src/pages/Admin.tsx` | Controls tab, delete wager, all profiles view |
| `MIGRATION_001_BETTING_LOCK_AND_USER_EDITS.sql` | **New** — all DB changes |
| `SEED_MEMBERS.sql` | Updated with betting_locked seed |

---

### 7. Deployment Steps

1. **Run migration:** Open Supabase SQL Editor → paste & run `MIGRATION_001_BETTING_LOCK_AND_USER_EDITS.sql`
2. **Run seed** (if needed): paste & run `SEED_MEMBERS.sql` (only after all 4 users have signed in)
3. **Deploy code:** push updated `src/` files to Netlify/Vercel
4. **Verify admin:** Log in as `goldeneric0807@gmail.com` → you should see Admin Panel in nav immediately

No environment variable changes needed.
