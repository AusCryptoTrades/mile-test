-- MILE Challenges V2: execute in Supabase SQL editor before enabling feature.
-- Activity-derived scoring requires a separate trusted scorer; client score writes are denied.
create table if not exists public.mile_challenges (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(title) between 3 and 80),
 sport text not null,
 metric text not null,
 target text,
 scoring_rule text not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 visibility text not null default 'public' check(visibility in ('public','private')),
 eligibility text not null default 'all' check(eligibility in ('all','followers','invited')),
 description text not null default '',
 created_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create table if not exists public.mile_challenge_entries (
 id uuid primary key default gen_random_uuid(),
 challenge_id uuid not null references public.mile_challenges(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 score numeric not null default 0,
 unit text not null default '',
 display_name text,
 created_at timestamptz not null default now(),
 unique(challenge_id,user_id)
);
alter table public.mile_challenges enable row level security;
alter table public.mile_challenge_entries enable row level security;
drop policy if exists mile_challenges_read on public.mile_challenges;
create policy mile_challenges_read on public.mile_challenges for select to authenticated using (visibility='public' or created_by=auth.uid() or exists(select 1 from public.mile_challenge_entries e where e.challenge_id=id and e.user_id=auth.uid()));
drop policy if exists mile_challenges_create on public.mile_challenges;
create policy mile_challenges_create on public.mile_challenges for insert to authenticated with check(created_by=auth.uid());
drop policy if exists mile_entries_read on public.mile_challenge_entries;
create policy mile_entries_read on public.mile_challenge_entries for select to authenticated using(exists(select 1 from public.mile_challenges c where c.id=challenge_id and (c.visibility='public' or c.created_by=auth.uid() or user_id=auth.uid())));
drop policy if exists mile_entries_join on public.mile_challenge_entries;
create policy mile_entries_join on public.mile_challenge_entries for insert to authenticated with check(user_id=auth.uid() and score=0 and unit='' and exists(select 1 from public.mile_challenges c where c.id=challenge_id and c.visibility='public' and c.ends_at>now() and c.eligibility='all'));
-- Intentionally no UPDATE policy: scores are exclusively assigned by trusted backend.
-- Invitation, follower eligibility and verified scoring must be completed before production.
