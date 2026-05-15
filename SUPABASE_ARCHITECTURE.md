# RvC Wager Hub — Supabase Backend Architecture
## Completely separate from Regestra. New project, new credentials.

---

## 1. Create a Brand-New Supabase Project

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `rvc-wager-hub`
3. Region: US East (or closest to your users)
4. Save the **Project URL** and **anon/service_role keys** separately from Regestra

---

## 2. Authentication Setup

### Disable public signups
In Supabase Dashboard → **Authentication → Settings**:
- **Disable** "Enable email signups" (no one can self-register)
- **Enable** "Enable email confirmations"
- Set Site URL: `https://yourdomain.com`
- Set Redirect URLs: `https://yourdomain.com/auth/callback`

### Invite-only flow
Users only get in through admin-sent invite emails.
Supabase has a built-in invite API:
```js
// Admin backend call (never expose service_role key to client)
const { data, error } = await supabase.auth.admin.inviteUserByEmail('user@email.com', {
  data: { invited_by: 'admin', wager_amount: 250 }
})
```

---

## 3. Database Schema

Run this in Supabase SQL Editor:

```sql
-- ════════════════════════════════════════
-- PROFILES table (extends auth.users)
-- ════════════════════════════════════════
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ════════════════════════════════════════
-- ACCESS_REQUESTS table
-- (for people who click "Request Access" 
--  before admin invites them)
-- ════════════════════════════════════════
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  referred_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now()
);

-- ════════════════════════════════════════
-- WAGERS table
-- ════════════════════════════════════════
create table public.wagers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  
  -- Pick: only admin or the fighter names
  pick text not null check (pick in ('rousey', 'carano')),
  
  -- Amount set by admin only — never by the user
  amount numeric(10,2) not null default 0 check (amount >= 0),
  
  -- Admin must confirm the wager before it's "live"
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  
  -- Admin notes (internal only, never shown to user)
  admin_notes text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ════════════════════════════════════════
-- EVENT INFO table
-- (admin can update fight details)
-- ════════════════════════════════════════
create table public.event_info (
  id int primary key default 1,  -- single row
  fight_name text default 'Rousey vs Carano',
  fight_date timestamptz default '2026-05-16 21:00:00+00',
  venue text default 'Intuit Dome, Inglewood CA',
  broadcast text default 'Netflix',
  rousey_odds text default '-535',
  carano_odds text default '+400',
  result text,  -- null until fight is over
  winner text check (winner in ('rousey', 'carano', null)),
  updated_at timestamptz default now()
);

-- Seed event info
insert into event_info (id) values (1);

-- ════════════════════════════════════════
-- Updated_at triggers
-- ════════════════════════════════════════
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger wagers_updated_at
  before update on wagers
  for each row execute function update_updated_at();
```

---

## 4. Row Level Security (RLS) Policies

Run this after the schema:

```sql
-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.wagers enable row level security;
alter table public.access_requests enable row level security;
alter table public.event_info enable row level security;

-- ── PROFILES policies ──────────────────

-- Users can read their own profile
create policy "Users read own profile"
  on profiles for select
  using (auth.uid() = id);

-- Admin can read all profiles
create policy "Admin reads all profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admin can update any profile
create policy "Admin updates profiles"
  on profiles for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- New profiles created via trigger (see below)
create policy "Insert own profile on signup"
  on profiles for insert
  with check (auth.uid() = id);

-- ── WAGERS policies ────────────────────

-- Users can read their own wager
create policy "Users read own wager"
  on wagers for select
  using (auth.uid() = user_id);

-- Users can also see OTHER wagers (pool visibility)
-- but only amount, pick, and status — not admin_notes
-- We handle this via a VIEW (see below)
create policy "Users read all confirmed wagers"
  on wagers for select
  using (status = 'confirmed');

-- Admin can read all wagers
create policy "Admin reads all wagers"
  on wagers for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin ONLY can insert/update wagers (amount, pick, status)
create policy "Admin inserts wagers"
  on wagers for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin updates wagers"
  on wagers for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ── ACCESS REQUESTS policies ───────────

-- Anyone (even unauthenticated) can submit a request
create policy "Public submits access request"
  on access_requests for insert
  with check (true);

-- Admin can read and update requests
create policy "Admin reads requests"
  on access_requests for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin updates requests"
  on access_requests for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ── EVENT INFO policies ────────────────

-- Everyone (including unauthenticated) can read event info
create policy "Public reads event info"
  on event_info for select
  using (true);

-- Only admin can update event info
create policy "Admin updates event info"
  on event_info for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
```

---

## 5. Pool View (safe public wager summary)

Creates a view that masks admin_notes but shows picks and amounts for the pool:

```sql
create view public.wager_pool as
  select
    w.id,
    p.full_name,
    w.pick,
    w.amount,
    w.status
  from wagers w
  join profiles p on p.id = w.user_id
  where w.status = 'confirmed'
  order by w.amount desc;

-- Allow all authenticated users to read the pool view
grant select on public.wager_pool to authenticated;
```

---

## 6. Auto-Create Profile on Signup Trigger

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Member'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    'approved'  -- invited users are pre-approved
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 7. Admin Setup

After setting up the schema, manually set yourself as admin:

```sql
-- First sign up / confirm your own account, then run:
update profiles
  set role = 'admin'
  where email = 'goldeneric0807@gmail.com';
```

---

## 8. Frontend Integration (React + TypeScript)

### Install
```bash
npm create vite@latest rvc-wager-frontend -- --template react-ts
cd rvc-wager-frontend
npm install @supabase/supabase-js
```

### supabase.ts
```ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

### .env
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
# Never put service_role key in frontend .env
```

### Admin server actions (Edge Function or separate backend)
```ts
// supabase/functions/admin-invite/index.ts
// Use service_role key server-side ONLY
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { email, fullName, wagerAmount, pick } = await req.json()
  
  // 1. Invite the user
  const { data: user, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role: 'member' }
  })
  if (error) return new Response(JSON.stringify({ error }), { status: 400 })
  
  // 2. Create their wager record immediately
  await adminClient.from('wagers').insert({
    user_id: user.user.id,
    pick: pick,          // 'rousey' or 'carano'
    amount: wagerAmount, // admin-set
    status: 'confirmed'
  })
  
  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
```

---

## 9. Key Flows Summary

| Flow | Who | How |
|------|-----|-----|
| New user requests access | Public | Fills form → `access_requests` table |
| Admin approves & invites | Admin | Calls Edge Function → Supabase invite email sent |
| User sets password | Invited user | Clicks email link → sets password |
| User logs in | Member | `supabase.auth.signInWithPassword()` |
| User sees their wager | Member | RLS: reads own row from `wagers` |
| User sees full pool | Member | Reads `wager_pool` view (no admin_notes) |
| Admin sets wager amount | Admin only | Updates `wagers.amount` — user cannot |
| Admin sees everything | Admin | RLS admin policies allow all reads |
| Fight result posted | Admin | Updates `event_info.winner` |

---

## 10. Environment Separation Checklist

- [ ] Separate Supabase project (NOT shared with Regestra)
- [ ] Separate .env file (rvc-wager/.env)
- [ ] Separate Netlify/Vercel site
- [ ] Separate domain (e.g. rvcwager.com)
- [ ] Service role key NEVER in frontend code
- [ ] Admin invite-only (public signup disabled)
