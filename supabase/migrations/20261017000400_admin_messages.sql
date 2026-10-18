-- Admin messages: an in-app inbox per user, filled by admins (one person or an audience), plus a
-- push notification sent by the notify edge function for each send.

create table public.message_sends (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id) on delete set null,
  audience text not null check (audience in ('user', 'everyone', 'pro', 'free')),
  target_user uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  recipients int not null default 0,
  pushed int,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.message_sends enable row level security; -- admins read it through admin_list_sends()

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  send_id uuid references public.message_sends(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_user_idx on public.messages(user_id, created_at desc);
create index messages_send_idx on public.messages(send_id);
alter table public.messages enable row level security;
create policy "read own messages" on public.messages for select to authenticated using (user_id = (select auth.uid()));

-- Inbox: mark everything read (users can't edit message text, so no update policy).
create or replace function public.mark_messages_read()
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now() where user_id = (select auth.uid()) and read_at is null;
$$;
revoke all on function public.mark_messages_read() from public, anon;
grant execute on function public.mark_messages_read() to authenticated;

-- Send to one person or an audience. Returns the send id and how many inboxes got it.
create or replace function public.admin_send_message(p_audience text, p_title text, p_body text, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_send uuid;
  v_count int;
  v_title text := btrim(p_title);
  v_body text := btrim(p_body);
begin
  if p_audience not in ('user', 'everyone', 'pro', 'free') then raise exception 'unknown audience'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception 'title must be 1–80 characters'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'message must be 1–1000 characters'; end if;
  if p_audience = 'user' and (p_user is null or not exists (select 1 from public.profiles where id = p_user)) then
    raise exception 'pick a user';
  end if;

  insert into public.message_sends (sent_by, audience, target_user, title, body)
  values (v_admin, p_audience, case when p_audience = 'user' then p_user end, v_title, v_body)
  returning id into v_send;

  insert into public.messages (user_id, send_id, title, body)
  select p.id, v_send, v_title, v_body
  from public.profiles p
  where case p_audience
    when 'user' then p.id = p_user
    when 'pro' then private.has_entitlement(p.id, 'pro')
    when 'free' then not private.has_entitlement(p.id, 'pro')
    else true
  end;
  get diagnostics v_count = row_count;

  update public.message_sends set recipients = v_count where id = v_send;
  perform private.audit('send_message', coalesce(p_user::text, p_audience), jsonb_build_object('title', v_title, 'recipients', v_count));
  return jsonb_build_object('send_id', v_send, 'recipients', v_count);
end;
$$;

create or replace function public.admin_list_sends(p_limit int default 50)
returns table (id uuid, audience text, target text, title text, body text, recipients int, pushed int, read_count bigint, created_at timestamptz, sent_by text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select s.id, s.audience, pr.username, s.title, s.body, s.recipients, s.pushed,
           (select count(*) from public.messages m where m.send_id = s.id and m.read_at is not null),
           s.created_at, au.email::text
    from public.message_sends s
    left join public.profiles pr on pr.id = s.target_user
    left join auth.users au on au.id = s.sent_by
    order by s.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.admin_send_message(text, text, text, uuid) from public, anon;
revoke all on function public.admin_list_sends(int) from public, anon;
grant execute on function public.admin_send_message(text, text, text, uuid) to authenticated;
grant execute on function public.admin_list_sends(int) to authenticated;

-- "Announcements from Convoy" push setting (in-app inbox always gets the message).
alter table public.notification_settings add column if not exists announcements boolean not null default true;
