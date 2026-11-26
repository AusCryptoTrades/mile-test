-- Batch 87 proposal only; not applied to production.
-- Server-only durable publication journal. One record per athlete, verified
-- provider identity and stable session. Revision changes require reconciliation,
-- not a fresh create. No direct browser access, no credentials stored here.
create table private.mile_garmin_publications (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  garmin_identity text not null check (length(garmin_identity) between 1 and 256),
  session_id uuid not null,
  revision integer not null check (revision >= 1),
  scheduled_date date not null check (isfinite(scheduled_date)),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null unique,
  state text not null default 'claimed' check (state in (
    'claimed','creating','created','scheduling','scheduled','verified','delivery_confirmed',
    'create_uncertain','schedule_uncertain'
  )),
  workout_id bigint check (workout_id > 0),
  schedule_id bigint check (schedule_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id,garmin_identity,session_id),
  check (
    (state in ('claimed','creating','create_uncertain') and workout_id is null and schedule_id is null)
    or (state in ('created','scheduling','schedule_uncertain') and workout_id is not null and schedule_id is null)
    or (state in ('scheduled','verified','delivery_confirmed') and workout_id is not null and schedule_id is not null)
  )
);
create unique index mile_garmin_publications_workout_unique
  on private.mile_garmin_publications (garmin_identity,workout_id) where workout_id is not null;
create unique index mile_garmin_publications_schedule_unique
  on private.mile_garmin_publications (garmin_identity,schedule_id) where schedule_id is not null;
alter table private.mile_garmin_publications enable row level security;
revoke all on private.mile_garmin_publications from public,anon,authenticated;
-- No client policies. An authorized server worker must enforce athlete consent
-- and verified identity, and perform compare-and-set transitions before writes.
-- A crashed creating/scheduling operation is deliberately never auto-retried.
-- A revision or provider-identity change must not silently create duplicates.
