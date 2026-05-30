-- ============================================================================
--  "Do You Have Brains" — Leaderboard backend
--  Hosted on an existing Supabase project, fully namespaced with the dyhb_
--  prefix so it never collides with anything else living in this database.
--
--  Design goals:
--   * One row per player on the public leaderboard (their personal best run).
--   * Full run history retained for stats / future analytics.
--   * Row Level Security locked down: read is public, writes are caller-scoped.
--   * Anti-cheat plausibility ceiling enforced server-side in the submit RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  PROFILES — one per auth user (guest or Google). Holds the display name.
-- ---------------------------------------------------------------------------
create table if not exists public.dyhb_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  is_guest    boolean not null default true,
  avatar_url  text,
  best_score  integer not null default 0,
  total_runs  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dyhb_username_len check (char_length(username) between 2 and 24)
);

-- Case-insensitive unique display names keep the board clean / impersonation-free.
create unique index if not exists dyhb_profiles_username_lower_idx
  on public.dyhb_profiles (lower(username));

-- ---------------------------------------------------------------------------
--  SCORES — immutable history, every submitted run is one row.
-- ---------------------------------------------------------------------------
create table if not exists public.dyhb_scores (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  username       text not null,
  score          integer not null check (score >= 0),
  accuracy       numeric(5,2) not null default 0 check (accuracy >= 0 and accuracy <= 100),
  best_streak    integer not null default 0 check (best_streak >= 0),
  rounds_played  integer not null default 0 check (rounds_played >= 0),
  correct_count  integer not null default 0 check (correct_count >= 0),
  wrong_count    integer not null default 0 check (wrong_count >= 0),
  is_guest       boolean not null default true,
  mode           text,
  max_premises   integer,
  modifiers      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists dyhb_scores_user_idx  on public.dyhb_scores (user_id);
create index if not exists dyhb_scores_score_idx on public.dyhb_scores (score desc, created_at asc);

-- ---------------------------------------------------------------------------
--  LEADERBOARD VIEW — best run per player, globally ranked.
-- ---------------------------------------------------------------------------
create or replace view public.dyhb_leaderboard as
select
  p.user_id,
  p.username,
  p.is_guest,
  p.avatar_url,
  best.score,
  best.accuracy,
  best.best_streak,
  best.rounds_played,
  best.correct_count,
  best.wrong_count,
  best.mode,
  best.max_premises,
  best.modifiers,
  best.created_at,
  rank() over (order by best.score desc, best.created_at asc) as rank
from public.dyhb_profiles p
join lateral (
  select s.*
  from public.dyhb_scores s
  where s.user_id = p.user_id
  order by s.score desc, s.created_at asc
  limit 1
) best on true;

-- ============================================================================
--  ROW LEVEL SECURITY
-- ============================================================================
alter table public.dyhb_profiles enable row level security;
alter table public.dyhb_scores   enable row level security;

-- Public read (the leaderboard is meant to be seen by everyone).
drop policy if exists dyhb_profiles_read on public.dyhb_profiles;
create policy dyhb_profiles_read on public.dyhb_profiles
  for select using (true);

drop policy if exists dyhb_scores_read on public.dyhb_scores;
create policy dyhb_scores_read on public.dyhb_scores
  for select using (true);

-- Writes are strictly caller-scoped.
drop policy if exists dyhb_profiles_write on public.dyhb_profiles;
create policy dyhb_profiles_write on public.dyhb_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dyhb_scores_insert on public.dyhb_scores;
create policy dyhb_scores_insert on public.dyhb_scores
  for insert with check (auth.uid() = user_id);

-- ============================================================================
--  RPC: claim / update the caller's profile (username uniqueness handled here)
-- ============================================================================
create or replace function public.dyhb_upsert_profile(
  p_username   text,
  p_is_guest   boolean default true,
  p_avatar_url text default null
)
returns public.dyhb_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(p_username);
  v_row   public.dyhb_profiles;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using message = 'You must be signed in.';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'BAD_USERNAME' using message = 'Username must be 2-24 characters.';
  end if;

  -- Reject names already taken by a *different* user (case-insensitive).
  if exists (
    select 1 from public.dyhb_profiles
    where lower(username) = lower(v_name) and user_id <> v_uid
  ) then
    raise exception 'USERNAME_TAKEN' using message = 'That callsign is already in use.';
  end if;

  insert into public.dyhb_profiles (user_id, username, is_guest, avatar_url)
  values (v_uid, v_name, coalesce(p_is_guest, true), p_avatar_url)
  on conflict (user_id) do update
    set username   = excluded.username,
        is_guest   = excluded.is_guest,
        avatar_url = coalesce(excluded.avatar_url, public.dyhb_profiles.avatar_url),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
--  RPC: submit a finished run. Validates a plausibility ceiling, records the
--  run, and bumps the player's lifetime stats. Returns the run + fresh rank.
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
  -- Theoretical maximum a single perfectly-played, fully-modified round can
  -- yield (see scoring model in scoring.js). Padded so legit play never trips it.
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

  -- Global rank = how many players have a strictly higher best score, + 1.
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

-- Expose the RPCs + view to the client roles.
grant select on public.dyhb_leaderboard to anon, authenticated;
grant execute on function public.dyhb_upsert_profile(text, boolean, text) to anon, authenticated;
grant execute on function public.dyhb_submit_run(integer, numeric, integer, integer, integer, integer, text, integer, jsonb) to anon, authenticated;
