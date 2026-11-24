-- Batch 75.1: authoritative Garmin summaries, aggregate-only privacy-filtered rankings.
create schema if not exists mile_lb_internal;
revoke all on schema mile_lb_internal from public, anon;
grant usage on schema mile_lb_internal to authenticated;

create or replace function mile_lb_internal.category(t text)
returns text language sql immutable set search_path = '' as $$
select case when lower(t) ~ 'run|jog|trail' then 'Running'
when lower(t) ~ 'cycl|bik|ride|spin' then 'Cycling'
when lower(t) ~ 'swim|pool' then 'Swimming'
when lower(t) ~ 'strength|weight|resistance|gym' then 'Strength'
when lower(t) ~ 'hiit|interval|tabata|cardio|fitness|elliptical|stair|row|ski|indoor' then 'Cardio' end
$$;

create or replace function mile_lb_internal.points(cat text, secs numeric, te numeric)
returns integer language sql immutable set search_path = '' as $$
select case when cat not in ('Running','Cycling','Swimming','Strength','Cardio') or cat is null
or secs is null or secs < 600 or secs > 86400 or secs = 'NaN'::numeric then 0
else least(180,round((least(60,secs/60)+least(60,greatest(0,secs/60-60))*.5+least(60,greatest(0,secs/60-120))*.25)
*case cat when 'Cycling' then .8 when 'Swimming' then 1.2 when 'Strength' then .9 else 1 end
*case when te between 4 and 5 then 1.1 when te >=3 and te <4 then 1.05 else 1 end)::integer) end
$$;

create or replace function mile_lb_internal.weekly(p_week integer, p_scope text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid(); monday date; result jsonb;
begin
 if viewer is null or not exists(select 1 from public.av_members m where m.user_id=viewer) then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if p_week is null or p_week not between -52 and 0 or p_scope is null or p_scope not in ('friends','following','global') then
  raise exception 'Invalid leaderboard filters' using errcode='22023';
 end if;
 monday := date_trunc('week', now() at time zone 'Australia/Melbourne')::date + p_week*7;
 with eligible_profiles as (
  select p.user_id,p.username,p.display_name,p.avatar_url,
   exists(select 1 from public.mile_follows f where f.follower_id=viewer and f.following_id=p.user_id and f.status='accepted') as followed
  from public.mile_profiles p
  where p.user_id=viewer or
   (case p_scope when 'global' then p.is_private=false and p.is_discoverable=true and p.workout_privacy='anyone'
    when 'following' then exists(select 1 from public.mile_follows f where f.follower_id=viewer and f.following_id=p.user_id and f.status='accepted')
    when 'friends' then exists(select 1 from public.mile_follows f where f.follower_id=viewer and f.following_id=p.user_id and f.status='accepted')
     and exists(select 1 from public.mile_follows f where f.follower_id=p.user_id and f.following_id=viewer and f.status='accepted') end
    and p.workout_privacy in ('anyone','followers'))
 ), dedup as (
  select distinct on (a.user_id,a.garmin_activity_id) a.user_id,a.garmin_activity_id,a.activity_name,a.activity_type,a.duration_seconds,a.raw_data,a.started_at
  from private.mile_garmin_activities a join eligible_profiles p on p.user_id=a.user_id
  where a.started_at >= (monday::timestamp at time zone 'Australia/Melbourne')
    and a.started_at < ((monday+7)::timestamp at time zone 'Australia/Melbourne')
    and nullif(btrim(a.garmin_activity_id),'') is not null
    and (a.user_id=viewer or not exists (
      select 1 from public.mile_social_activities s where s.user_id=a.user_id
      and s.garmin_activity_id=a.garmin_activity_id
      and (s.visibility is null or s.visibility='private' or (p_scope='global' and s.visibility<>'public') or (s.visibility='followers' and not p.followed))
    ))
  order by a.user_id,a.garmin_activity_id,a.updated_at desc nulls last,a.id
 ), normalized as (
  select d.*,mile_lb_internal.category(d.activity_type) as cat,
  coalesce(d.raw_data->>'aerobicTrainingEffect',d.raw_data->>'trainingEffect',detail.te) as effect,
  coalesce(d.raw_data->>'isWebUpload','false')='true' as web_upload
  from dedup d left join lateral (
   select coalesce(x.raw_data->>'aerobicTrainingEffect',x.raw_data->'summary'->>'aerobicTrainingEffect',x.raw_data->'summaryDTO'->>'aerobicTrainingEffect') as te
   from private.mile_garmin_activity_details x where x.user_id=d.user_id and x.garmin_activity_id=d.garmin_activity_id
   order by x.updated_at desc nulls last,x.id limit 1
  ) detail on true
 ), scored as (
  select n.*,case when web_upload then 0 else mile_lb_internal.points(cat,duration_seconds,
  case when effect ~ '^[0-9]{1,2}([.][0-9]{1,8})?$' then effect::numeric end) end as pts
  from normalized n
 ), totals as (
  select p.user_id,p.username,p.display_name,p.avatar_url,sum(s.pts)::bigint points,count(*)::integer sessions
  from scored s join eligible_profiles p on p.user_id=s.user_id where s.pts>0
  group by p.user_id,p.username,p.display_name,p.avatar_url
 )
 select jsonb_build_object('week_start',monday,'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.points desc,t.sessions desc,t.user_id) from totals t),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',s.garmin_activity_id,'name',coalesce(s.activity_name,s.activity_type,'Garmin activity'),'type',coalesce(s.cat,'Unsupported'),'mins',case when s.duration_seconds between 0 and 86400 then round(s.duration_seconds/60) else 0 end,'points',s.pts,'reason',case when s.web_upload then 'Web upload' when s.pts=0 then 'Unsupported type or duration' else null end) order by s.pts desc,s.garmin_activity_id) from scored s where s.user_id=viewer),'[]'::jsonb)) into result;
 return result;
end $$;

revoke all on function mile_lb_internal.category(text),mile_lb_internal.points(text,numeric,numeric),mile_lb_internal.weekly(integer,text) from public,anon,authenticated;
grant execute on function mile_lb_internal.weekly(integer,text) to authenticated;
create or replace function public.mile_weekly_leaderboard(p_week integer,p_scope text)
returns jsonb language sql stable security invoker set search_path = '' as $$
select mile_lb_internal.weekly(p_week,p_scope)
$$;
revoke all on function public.mile_weekly_leaderboard(integer,text) from public,anon,authenticated;
grant execute on function public.mile_weekly_leaderboard(integer,text) to authenticated;
notify pgrst,'reload schema';