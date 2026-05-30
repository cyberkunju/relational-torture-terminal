-- ============================================================================
--  Hardening pass — resolves advisor findings for the dyhb_ leaderboard.
-- ============================================================================

-- 1) Make the leaderboard view run with the CALLER's permissions (respects RLS
--    on the base tables, which already allow public read). Clears the
--    security_definer_view ERROR.
alter view public.dyhb_leaderboard set (security_invoker = on);

-- 2) Optimise RLS auth checks: wrap auth.uid() in a scalar subselect so it is
--    evaluated once per statement, not once per row (auth_rls_initplan).
-- 3) Remove the SELECT overlap by scoping writes to write-only actions instead
--    of FOR ALL (multiple_permissive_policies).

-- profiles ----------------------------------------------------------------
drop policy if exists dyhb_profiles_write  on public.dyhb_profiles;
drop policy if exists dyhb_profiles_read   on public.dyhb_profiles;

create policy dyhb_profiles_read on public.dyhb_profiles
  for select using (true);

create policy dyhb_profiles_insert on public.dyhb_profiles
  for insert with check ((select auth.uid()) = user_id);

create policy dyhb_profiles_update on public.dyhb_profiles
  for update using ((select auth.uid()) = user_id)
             with check ((select auth.uid()) = user_id);

create policy dyhb_profiles_delete on public.dyhb_profiles
  for delete using ((select auth.uid()) = user_id);

-- scores ------------------------------------------------------------------
drop policy if exists dyhb_scores_insert on public.dyhb_scores;
create policy dyhb_scores_insert on public.dyhb_scores
  for insert with check ((select auth.uid()) = user_id);
