-- ============================================================================
--  Fix: dyhb_submit_run had an ambiguous `best_score` reference in the final
--  RETURN QUERY (the RETURNS TABLE output column collided with the table
--  column inside the rank subquery). Compute rank + best into locals and
--  return scalar values so there is no name collision.
-- ============================================================================
create or replace function public.dyhb_submit_run(
  p_score        integer,
  p_accuracy     numeric,
  p_best_streak  integer,
  p_rounds       integer,
  p_correct      integer,
  p_wrong        integer,
  p_mode         text default null,
  p_max_premises integer default null,
  p_modifiers    jsonb default '{}'::jsonb
)
returns table (
  score      integer,
  rank       bigint,
  best_score integer,
  total_runs integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.dyhb_profiles;
  v_round_cap  integer := 1400;
  v_score      integer := greatest(coalesce(p_score, 0), 0);
  v_rounds     integer := greatest(coalesce(p_rounds, 0), 0);
  v_rank       bigint;
  v_best       integer;
  v_total      integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using message = 'You must be signed in.';
  end if;

  select * into v_profile from public.dyhb_profiles where user_id = v_uid;
  if v_profile.user_id is null then
    raise exception 'NO_PROFILE' using message = 'Set a username before submitting.';
  end if;

  -- Anti-cheat: a run can never exceed (rounds * per-round ceiling).
  if v_score > greatest(v_rounds, 1) * v_round_cap then
    raise exception 'IMPLAUSIBLE_SCORE' using message = 'Score failed validation.';
  end if;

  insert into public.dyhb_scores (
    user_id, username, score, accuracy, best_streak, rounds_played,
    correct_count, wrong_count, is_guest, mode, max_premises, modifiers
  ) values (
    v_uid, v_profile.username, v_score,
    least(greatest(coalesce(p_accuracy, 0), 0), 100),
    greatest(coalesce(p_best_streak, 0), 0),
    v_rounds,
    greatest(coalesce(p_correct, 0), 0),
    greatest(coalesce(p_wrong, 0), 0),
    v_profile.is_guest, p_mode, p_max_premises,
    coalesce(p_modifiers, '{}'::jsonb)
  );

  update public.dyhb_profiles
    set best_score = greatest(public.dyhb_profiles.best_score, v_score),
        total_runs = public.dyhb_profiles.total_runs + 1,
        updated_at = now()
  where user_id = v_uid
  returning public.dyhb_profiles.best_score, public.dyhb_profiles.total_runs
  into v_best, v_total;

  select count(*) + 1
    into v_rank
    from public.dyhb_profiles pp
   where pp.best_score > v_best;

  score := v_score;
  rank := v_rank;
  best_score := v_best;
  total_runs := v_total;
  return next;
end;
$$;

grant execute on function public.dyhb_submit_run(integer, numeric, integer, integer, integer, integer, text, integer, jsonb) to anon, authenticated;
