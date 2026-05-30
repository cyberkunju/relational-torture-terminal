-- Add the scores table to the realtime publication so the leaderboard can
-- live-update as new runs land. Wrapped so re-running is harmless.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dyhb_scores'
  ) then
    alter publication supabase_realtime add table public.dyhb_scores;
  end if;
end $$;
