-- Keep a private tombstone so automatic Garmin sharing cannot recreate a deleted post.
alter table public.mile_social_activities add column if not exists social_deleted boolean not null default false;
notify pgrst,'reload schema';