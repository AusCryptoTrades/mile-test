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

-- Server-computed provisional leaderboard. Activity rows are still client-imported,
-- so this is NOT a trusted anti-cheat scoring pipeline.
alter table public.mile_challenge_entries add column if not exists qualifying_count integer not null default 0;
create or replace function public.mile_challenge_recalculate(p_challenge uuid,p_athlete uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.mile_challenges%rowtype; v numeric; n integer; u text;
begin
 select * into c from public.mile_challenges where id=p_challenge;
 if not found then return; end if;
 -- Restrict activity metrics to data genuinely available in social summaries.
 select count(*),case
 when c.metric='Total distance' then coalesce(sum(a.distance_m),0)/1000
 when c.metric='Total duration' then coalesce(sum(a.duration_s),0)/60
 when c.metric='Most sessions' then count(*)::numeric
 when c.metric='Fastest 5K' then min(case when a.distance_m between 4900 and 5100 then a.duration_s end)
 when c.metric='Fastest 10K' then min(case when a.distance_m between 9900 and 10100 then a.duration_s end)
 when c.metric='Fastest full SIM' then min(case when lower(a.activity_type) like '%hyrox%sim%' then a.duration_s end)
 else null end
 into n,v
 from public.mile_social_activities a
 where a.user_id=p_athlete
 and a.activity_at between c.starts_at and c.ends_at
 and (
 (c.sport='Running' and (lower(a.activity_type) like '%run%'))
 or (c.sport='Cycling' and (lower(a.activity_type) like '%cycl%' or lower(a.activity_type) like '%bike%'))
 or (c.sport='Swimming' and lower(a.activity_type) like '%swim%')
 or (c.sport='Strength' and (lower(a.activity_type) like '%strength%' or lower(a.activity_type) like '%weight%'))
 or (c.sport='HYROX' and lower(a.activity_type) like '%hyrox%')
 or c.sport='Multisport'
 );
 if c.metric in ('Fastest 5K','Fastest 10K','Fastest full SIM') then
   select count(*) into n from public.mile_social_activities a where a.user_id=p_athlete
   and a.activity_at between c.starts_at and c.ends_at
   and ( (c.metric='Fastest 5K' and a.distance_m between 4900 and 5100 and lower(a.activity_type) like '%run%')
      or (c.metric='Fastest 10K' and a.distance_m between 9900 and 10100 and lower(a.activity_type) like '%run%')
      or (c.metric='Fastest full SIM' and lower(a.activity_type) like '%hyrox%sim%'));
 end if;
 u:=case when c.metric='Total distance' then 'km' when c.metric='Total duration' then 'min'
   when c.metric like 'Fastest%' then 'sec' else 'sessions' end;
 update public.mile_challenge_entries set score=coalesce(v,0),unit=u,qualifying_count=coalesce(n,0)
 where challenge_id=p_challenge and user_id=p_athlete;
end $$;
revoke all on function public.mile_challenge_recalculate(uuid,uuid) from public,anon,authenticated;
create or replace function public.mile_challenge_on_join() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.mile_challenge_recalculate(new.challenge_id,new.user_id);
 return new;
end $$;
drop trigger if exists mile_challenge_join_score on public.mile_challenge_entries;
create trigger mile_challenge_join_score after insert on public.mile_challenge_entries for each row execute function public.mile_challenge_on_join();
create or replace function public.mile_challenge_activity_score() returns trigger language plpgsql security definer set search_path=public as $$
declare c record; athlete uuid;
begin
 athlete:=coalesce(new.user_id,old.user_id);
 for c in select e.challenge_id from public.mile_challenge_entries e
 join public.mile_challenges ch on ch.id=e.challenge_id
 where e.user_id=athlete and ch.ends_at>=now()-interval '30 days'
 loop
 perform public.mile_challenge_recalculate(c.challenge_id,athlete);
 end loop;
 return coalesce(new,old);
end $$;
drop trigger if exists mile_challenge_activity_score on public.mile_social_activities;
create trigger mile_challenge_activity_score after insert or update or delete on public.mile_social_activities
for each row execute function public.mile_challenge_activity_score();
-- Do not allow arbitrary activity types/metrics that have no reliable scoring support.
alter table public.mile_challenges drop constraint if exists mile_challenges_supported_metrics;
alter table public.mile_challenges add constraint mile_challenges_supported_metrics check(
 (sport='Running' and metric in ('Total distance','Fastest 5K','Fastest 10K','Most sessions'))
 or (sport='Cycling' and metric in ('Total distance','Most sessions'))
 or (sport='Swimming' and metric in ('Total distance','Most sessions'))
 or (sport='Strength' and metric='Most sessions')
 or (sport='HYROX' and metric in ('Fastest full SIM','Most sessions'))
 or (sport='Multisport' and metric in ('Most sessions','Total duration'))
);
-- Until follower/invitation enforcement is built, public/all is the only creatable scope.
drop policy if exists mile_challenges_create on public.mile_challenges;
create policy mile_challenges_create on public.mile_challenges for insert to authenticated
with check(created_by=auth.uid() and visibility='public' and eligibility='all');
