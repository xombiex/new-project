-- Findings from Supabase's performance advisor.
--
-- The three "unused index" findings are left alone on purpose: the database has almost no rows
-- yet, so nothing has had a reason to use them. They back the refund lookup and the push rate
-- limit, and both will matter with real traffic.

-- Foreign keys without an index.
create index message_sends_sent_by_idx on public.message_sends(sent_by);
create index message_sends_target_user_idx on public.message_sends(target_user);
create index profiles_primary_car_idx on public.profiles(primary_car_id) where primary_car_id is not null;

-- Two read policies on one table are both run for every row. One policy each, same rules.
drop policy "members read drive" on public.group_drives;
drop policy "club members see club drives" on public.group_drives;
create policy "members and club members read drive" on public.group_drives
  for select to authenticated
  using (
    private.is_drive_member(id, (select auth.uid()))
    or (club_id is not null and private.club_role(club_id, (select auth.uid())) is not null)
  );

drop policy "owner manages location" on public.user_locations;
drop policy "friends read active shares" on public.user_locations;
create policy "owner and friends read location" on public.user_locations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (share_until > now() and private.are_friends(user_id, (select auth.uid())))
  );
create policy "owner adds location" on public.user_locations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner updates location" on public.user_locations
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner removes location" on public.user_locations
  for delete to authenticated using (user_id = (select auth.uid()));
