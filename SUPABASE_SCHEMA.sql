-- RvC Wager Hub — Full Schema
-- Run this entire file in Supabase SQL Editor

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  referred_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now()
);

create table public.wagers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  pick text not null check (pick in ('rousey', 'carano')),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


create table public.wager_reservations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  pick text not null check (pick in ('rousey', 'carano')),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  fulfilled_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.event_info (
  id int primary key default 1,
  fight_name text default 'Rousey vs Carano',
  fight_date timestamptz default '2026-05-16 21:00:00+00',
  venue text default 'Intuit Dome, Inglewood CA',
  broadcast text default 'Netflix',
  rousey_odds text default '-535',
  carano_odds text default '+400',
  result text,
  winner text check (winner in ('rousey', 'carano', null)),
  updated_at timestamptz default now()
);

insert into public.event_info (id) values (1);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles for each row execute function update_updated_at();
create trigger wagers_updated_at before update on public.wagers for each row execute function update_updated_at();
create trigger wager_reservations_updated_at before update on public.wager_reservations for each row execute function update_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
declare
  reserved public.wager_reservations%rowtype;
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Member'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    'approved'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case
      when public.profiles.full_name = 'New Member' then excluded.full_name
      else public.profiles.full_name
    end;

  select * into reserved
  from public.wager_reservations
  where lower(email) = lower(new.email)
  order by created_at desc
  limit 1;

  if reserved.id is not null then
    insert into public.wagers (user_id, pick, amount, status, admin_notes)
    values (new.id, reserved.pick, reserved.amount, reserved.status, 'Created from wager reservation')
    on conflict (user_id) do update set
      pick = excluded.pick,
      amount = excluded.amount,
      status = excluded.status;

    update public.wager_reservations
    set fulfilled_user_id = new.id
    where id = reserved.id;
  end if;

  return new;
end;
$$ language plpgsql security definer;


create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wagers enable row level security;
alter table public.wager_reservations enable row level security;
alter table public.access_requests enable row level security;
alter table public.event_info enable row level security;

create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Admin reads all profiles" on profiles for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin updates profiles" on profiles for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Insert own profile on signup" on profiles for insert with check (auth.uid() = id);

create policy "Users read own wager" on wagers for select using (auth.uid() = user_id);
create policy "Users read all confirmed wagers" on wagers for select using (status = 'confirmed');
create policy "Admin reads all wagers" on wagers for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin inserts wagers" on wagers for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin updates wagers" on wagers for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Admin reads all wager reservations" on wager_reservations for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin inserts wager reservations" on wager_reservations for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin updates wager reservations" on wager_reservations for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Users read own wager reservation" on wager_reservations for select using (lower(email) = lower(coalesce(auth.email(), '')));


create policy "Public submits access request" on access_requests for insert with check (true);
create policy "Admin reads requests" on access_requests for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admin updates requests" on access_requests for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Public reads event info" on event_info for select using (true);
create policy "Admin updates event info" on event_info for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create view public.wager_pool as
  select w.id, p.full_name, w.pick, w.amount, w.status
  from public.wagers w
  join public.profiles p on p.id = w.user_id
  where w.status = 'confirmed'

  union all

  select r.id, r.full_name, r.pick, r.amount, r.status
  from public.wager_reservations r
  where r.status = 'confirmed'
    and r.fulfilled_user_id is null
  order by amount desc;

grant select on public.wager_pool to anon;
grant select on public.wager_pool to authenticated;
grant select, insert, update on public.wager_reservations to authenticated;

-- Run this AFTER creating your account (goldeneric0807@gmail.com):
-- update public.profiles set role = 'admin' where email = 'goldeneric0807@gmail.com';
