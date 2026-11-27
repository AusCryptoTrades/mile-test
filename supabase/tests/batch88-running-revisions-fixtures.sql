-- Isolated PostgreSQL fixture. Run against an empty disposable database only.
-- Roles are shared by the separate Garmin fixture databases in CI.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
  )::uuid;
$$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create table public.av_members (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.av_members enable row level security;
grant select on public.av_members to authenticated;
create policy own_member on public.av_members for select to authenticated using (user_id = (select auth.uid()));
insert into auth.users values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
insert into public.av_members values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

create schema private;
create table public.av_training_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.av_training_data enable row level security;
grant select, insert, update on public.av_training_data to authenticated;
create policy own_training_select on public.av_training_data for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select from public.av_members where user_id = (select auth.uid())
  ));
create policy own_training_insert on public.av_training_data for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select from public.av_members where user_id = (select auth.uid())
  ));
create policy own_training_update on public.av_training_data for update to authenticated
  using (user_id = (select auth.uid()) and exists (
    select from public.av_members where user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select from public.av_members where user_id = (select auth.uid())
  ));

\ir ../proposals/batch87-garmin-publications.sql

create function pg_temp.running_workout(id text, days_ahead integer)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'date', (now() at time zone interval '+14:00')::date + days_ahead, 'revision', 1,
    'runningPlanVersion', 1, 'kind', 'easy', 'sport', 'Running',
    'name', 'Easy aerobic run', 'block', 'fixture-running-plan', 'phase', 'base',
    'meters', 5000, 'km', 5, 'estimatedSeconds', 1775, 'plannedMinutes', 30,
    'estimatedPaceSeconds', 355, 'paceEstimateOnly', false,
    'purpose', 'Build aerobic endurance.', 'focus', 'Run at a conversational effort.',
    'detail', 'Warm-up: 0.75 km · 5:45–6:15/km. Main: 3.75 km · 130–148 bpm. Cooldown: 0.5 km · effort-based.',
    'structuredDetail', 'Warm-up: 0.75 km · 5:45–6:15/km. Main: 3.75 km · 130–148 bpm. Cooldown: 0.5 km · effort-based.',
    'status', 'planned', 'note', '', 'rpe', null, 'matchId', null,
    'targetRpe', 3, 'structuredSteps', '[
      {"kind":"step","intensity":"warmup","description":"Ease into the run","duration":{"kind":"distance","meters":750},"target":{"kind":"pace","fastSecondsPerKm":345,"slowSecondsPerKm":375}},
      {"kind":"step","intensity":"active","description":"Run at a conversational effort.","duration":{"kind":"distance","meters":3750},"target":{"kind":"heart_rate","lowBpm":130,"highBpm":148}},
      {"kind":"step","intensity":"cooldown","description":"Relaxed running","duration":{"kind":"distance","meters":500},"target":{"kind":"open"}}
    ]'::jsonb
  );
$$;

insert into public.av_training_data (user_id, training_data) values
  ('00000000-0000-4000-8000-000000000001', jsonb_build_object(
    'settings', '{"units":"metric"}'::jsonb,
    'activities', '[]'::jsonb,
    'workouts', jsonb_build_array(
      pg_temp.running_workout('00000000-0000-4000-8000-000000000011', 5),
      pg_temp.running_workout('00000000-0000-4000-8000-000000000012', 6) || '{"status":"done"}',
      pg_temp.running_workout('00000000-0000-4000-8000-000000000013', 7) || '{"matchId":"existing-activity"}',
      pg_temp.running_workout('00000000-0000-4000-8000-000000000014', -1),
      pg_temp.running_workout('00000000-0000-4000-8000-000000000015', 8),
      pg_temp.running_workout('00000000-0000-4000-8000-000000000016', 9),
      pg_temp.running_workout('00000000-0000-4000-8000-000000000017', 10),
      pg_temp.running_workout('00000000-0000-4000-8000-000000000018', 11) || '{"kind":"threshold"}',
      pg_temp.running_workout('00000000-0000-4000-8000-000000000020', 12) || '{"revision":9}'
    )
  )),
  ('00000000-0000-4000-8000-000000000002', '{"workouts":[]}'),
  ('00000000-0000-4000-8000-000000000003', jsonb_build_object('workouts', jsonb_build_array(
    pg_temp.running_workout('00000000-0000-4000-8000-000000000019', 5)
  )));
