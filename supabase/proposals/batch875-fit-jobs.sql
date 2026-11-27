-- Staged proposal; no existing Garmin tables changed.
create table if not exists private.mile_fit_jobs (
 user_id uuid not null references auth.users(id) on delete cascade,
 activity_id text not null check(activity_id ~ '^[0-9]{5,20}$'),
 garmin_user_id text not null check(length(garmin_user_id) between 1 and 128),
 summary_id text not null check(length(summary_id) between 1 and 128),
 start_epoch bigint not null check(start_epoch between 946684800 and 4102444800),
 encrypted_callback text,
 state text not null default 'pending' check(state in ('pending','downloading','downloaded','decoding','ready','rejected','expired','uncertain')),
 received_at timestamptz not null default now(),
 download_claimed_at timestamptz,
 claimed_at timestamptz,
 claim_id uuid,
 raw_fit bytea check(octet_length(raw_fit)<=10485760),
 laps jsonb check(laps is null or (jsonb_typeof(laps)='array' and jsonb_array_length(laps) between 1 and 1000)),
 error_code text,
 primary key(user_id,activity_id),
 check(state<>'ready' or (laps is not null and raw_fit is null and encrypted_callback is null)),
 check(state<>'pending' or encrypted_callback is not null)
);
alter table private.mile_fit_jobs enable row level security;
revoke all on private.mile_fit_jobs from public,anon,authenticated;
create index if not exists mile_fit_queue_state on private.mile_fit_jobs(state,received_at);
create index if not exists mile_fit_download_rate on private.mile_fit_jobs(download_claimed_at) where download_claimed_at is not null;
