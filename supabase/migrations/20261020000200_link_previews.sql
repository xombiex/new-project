-- Link previews ("embeds"): when a Convoy link is pasted into iMessage, Discord, WhatsApp, etc., the
-- website fills in a title, a line of detail and a picture. This returns only what the link itself
-- already gives away to whoever holds it: a friend invite shows that person's public card, a drive
-- or club code shows what you'd see right after joining with it. Nothing for ended drives.
create or replace function public.link_preview(p_kind text, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'user' then (
      select jsonb_build_object(
        'name', coalesce(nullif(btrim(p.display_name), ''), p.username), 'username', p.username, 'color', p.avatar_color,
        'car', nullif(btrim(concat_ws(' ', c.year, c.make, c.model)), ''), 'nickname', c.nickname,
        'vehicle', p.vehicle, 'vehicle_color', p.vehicle_color)
      from public.profiles p
      left join public.cars c on c.id = p.primary_car_id
      where p.username = lower(btrim(p_key)))
    when 'drive' then (
      select jsonb_build_object(
        'name', d.name, 'destination', d.destination_name,
        'host', coalesce(nullif(split_part(btrim(o.display_name), ' ', 1), ''), o.username), 'color', o.avatar_color,
        'members', (select count(*) from public.group_members m where m.drive_id = d.id))
      from public.group_drives d
      left join public.profiles o on o.id = d.owner_id
      where d.code = upper(btrim(p_key)) and d.status = 'active')
    when 'club' then (
      select jsonb_build_object(
        'name', c.name, 'description', left(c.description, 200), 'color', c.color,
        'members', (select count(*) from public.club_members m where m.club_id = c.id))
      from public.clubs c
      where c.invite_code = upper(btrim(p_key)))
  end;
$$;

revoke execute on function public.link_preview(text, text) from public;
grant execute on function public.link_preview(text, text) to anon, authenticated;
