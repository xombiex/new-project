create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;
create policy "own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_requests boolean not null default true,
  drive_invites boolean not null default true,
  drive_activity boolean not null default true,
  club_events boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "own notification settings" on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Written only by the notify edge function (service role); used for rate limiting.
create table public.notification_log (
  id bigint generated always as identity primary key,
  sender uuid,
  recipient uuid not null,
  type text not null,
  created_at timestamptz not null default now()
);
create index notification_log_sender_idx on public.notification_log(sender, created_at);
create index notification_log_pair_idx on public.notification_log(sender, recipient, type, created_at);
alter table public.notification_log enable row level security;
