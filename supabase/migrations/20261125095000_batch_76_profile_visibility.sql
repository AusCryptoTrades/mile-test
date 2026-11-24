alter table public.mile_social_activities add column if not exists hidden_from_profile boolean not null default false;
notify pgrst,'reload schema';