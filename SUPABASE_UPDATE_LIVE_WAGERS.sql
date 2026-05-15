-- RVC Wager Hub live pool update
-- Run this once in Supabase SQL Editor after deploying the updated code.

create table if not exists public.wager_reservations (
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

alter table public.wager_reservations enable row level security;

drop trigger if exists wager_reservations_updated_at on public.wager_reservations;
create trigger wager_reservations_updated_at
before update on public.wager_reservations
for each row execute function update_updated_at();

drop policy if exists "Admin reads all wager reservations" on public.wager_reservations;
drop policy if exists "Admin inserts wager reservations" on public.wager_reservations;
drop policy if exists "Admin updates wager reservations" on public.wager_reservations;
drop policy if exists "Users read own wager reservation" on public.wager_reservations;

create policy "Admin reads all wager reservations"
on public.wager_reservations for select
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admin inserts wager reservations"
on public.wager_reservations for insert
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admin updates wager reservations"
on public.wager_reservations for update
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Users read own wager reservation"
on public.wager_reservations for select
using (lower(email) = lower(coalesce(auth.email(), '')));

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

drop view if exists public.wager_pool;
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
