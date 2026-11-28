-- MILE Staging SQL gate. Synthetic Auth rows and metadata are transaction-local.
-- This verifies hosted database behaviour. Storage HTTP and email delivery are separate.
begin;
do $$
begin
 if not exists (select from supabase_migrations.schema_migrations where name='staging_running_core_baseline')
    or exists (select from auth.users) or exists (select from public.av_members)
    or not exists (select from storage.buckets where id='mile-avatars' and not public) then
  raise exception 'Expected the empty, private-bucket MILE Staging baseline';
 end if;
end;
$$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('89000000-0000-4000-8000-000000000001','owner@example.test',now(),'{"mile_training_disclaimer":"2026-11-26"}'),
 ('89000000-0000-4000-8000-000000000002','follower@example.test',now(),'{"mile_training_disclaimer":"2026-11-26"}'),
 ('89000000-0000-4000-8000-000000000003','unrelated@example.test',now(),'{"mile_training_disclaimer":"2026-11-26"}'),
 ('89000000-0000-4000-8000-000000000004','no-consent@example.test',now(),'{}'),
 ('89000000-0000-4000-8000-000000000005','no-confirmation@example.test',null,'{"mile_training_disclaimer":"2026-11-26"}');
insert into public.av_invite_codes(id,code_hash,recipient_email,max_uses)
 overriding system value values
 (8911,extensions.crypt('RC-OWNER-INVITE',extensions.gen_salt('bf')),'owner@example.test',1),
 (8912,extensions.crypt('RC-NO-CONSENT',extensions.gen_salt('bf')),'no-consent@example.test',1),
 (8913,extensions.crypt('RC-UNCONFIRMED',extensions.gen_salt('bf')),'no-confirmation@example.test',1);
insert into public.av_members (user_id,onboarding_stage) values
 ('89000000-0000-4000-8000-000000000002',null),
 ('89000000-0000-4000-8000-000000000003',null);
insert into public.mile_profiles(user_id,username,display_name) values
 ('89000000-0000-4000-8000-000000000002','rc_pending_follower','Synthetic follower'),
 ('89000000-0000-4000-8000-000000000003','rc_unrelated_athlete','Synthetic member');
insert into public.av_training_data(user_id,training_data) values
 ('89000000-0000-4000-8000-000000000002','{"workouts":[{"id":"preserved-session","status":"done","date":"2026-01-01"}],"settings":{"preferences776":{"appearance":{"distance":"mi"}}}}');

create function pg_temp.expected_failure(statement text, code text) returns void language plpgsql as $$
begin
 execute statement;
 raise exception 'Expected request to fail with %',code;
exception when others then
 if sqlstate<>code then raise; end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000004';
select pg_temp.expected_failure($$select public.av_join('RC-NO-CONSENT')$$,'PT412');
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000005';
select pg_temp.expected_failure($$select public.av_join('RC-UNCONFIRMED')$$,'P0001');
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
select public.av_join('RC-OWNER-INVITE');
select pg_temp.expected_failure($$select public.mile_onboarding_save(1,0,'{"username":"admin_root","display_name":"Reserved"}')$$,'PT422');
select public.mile_onboarding_save(1,0,'{"username":"RC_OWNER","display_name":"Synthetic athlete"}')->>'stage';
select public.mile_onboarding_save(2,1,'{"disciplines":["Running","HYROX"],"primary_sport":"Running"}')->>'stage';
select public.mile_onboarding_save(3,2,'{"units":"metric","experience":"regular"}')->>'stage';
select public.mile_onboarding_save(4,3,'{}')->>'stage';
select public.mile_onboarding_save(5,4,'{"is_private":true}')->>'stage';
do $$
begin
 if public.mile_onboarding_state()->>'stage' is distinct from '6'
    or not exists (select from public.mile_profiles where user_id=auth.uid() and is_private and not auto_share_activities) then
  raise exception 'Private onboarding completion failed';
 end if;
end;
$$;
reset role;
do $$
begin
 if not exists (select from mile_onboarding_private.training_disclaimer_acceptances
  where user_id='89000000-0000-4000-8000-000000000001' and document_version='2026-11-26'
   and document_sha256='3b8f4565ed7a16af47c421760ecc99d9304885b344f0f1679292cea9a19d01b1'
   and accepted_at between transaction_timestamp() and clock_timestamp()) then
  raise exception 'Consent version, fingerprint, or timestamp mismatch';
 end if;
end;
$$;

-- Catalog-only objects, rolled back. No binary bytes or real customer paths.
insert into storage.objects(bucket_id,name) values
 ('mile-avatars','89000000-0000-4000-8000-000000000001/avatar.jpg'),
 ('mile-avatars','89000000-0000-4000-8000-000000000001/cover.jpg');
insert into public.mile_follows(follower_id,following_id,status)
values('89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000001','pending');
create function pg_temp.image_count(expected integer) returns void language plpgsql as $$
begin
 if (select count(*) from storage.objects where bucket_id='mile-avatars'
   and name like '89000000-0000-4000-8000-000000000001/%')<>expected then
  raise exception 'Unexpected number of visible private objects';
 end if;
end;
$$;
set local role anon;
select pg_temp.image_count(0);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
select pg_temp.image_count(2);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
select pg_temp.image_count(0);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000004';
select pg_temp.image_count(0);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000002';
select pg_temp.image_count(0);
do $$
begin
 if public.mile_onboarding_state()->>'stage' is not null or
    not exists (select from public.av_training_data where user_id=auth.uid()
     and training_data#>>'{workouts,0,id}'='preserved-session'
     and training_data#>>'{settings,preferences776,appearance,distance}'='mi') or
    public.mile_onboarding_username('Rc_OwNeR') then
  raise exception 'Legacy member, preferences or username uniqueness changed';
 end if;
end;
$$;

set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
update public.mile_follows set status='accepted' where following_id=auth.uid();
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000002';
select pg_temp.image_count(2);
reset role;
update public.mile_follows set status='pending'
 where follower_id='89000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.image_count(0);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
update public.mile_profiles set is_discoverable=true,is_private=false where user_id=auth.uid();
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
select pg_temp.image_count(2);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000004';
select pg_temp.image_count(0);
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
update public.mile_profiles set is_private=true where user_id=auth.uid();
set local request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
select pg_temp.image_count(0);
reset role;

select 'Onboarding, consent and Storage viewer database matrix passed' as result;
rollback;
