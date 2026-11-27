\set ON_ERROR_STOP on
insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values
 ('89000000-0000-4000-8000-000000000006','consent@example.test',null,
  '{"mile_training_disclaimer":"2026-11-26","accepted_at":"2001-01-01","user_id":"89000000-0000-4000-8000-000000000007"}'),
 ('89000000-0000-4000-8000-000000000007','pending@example.test',now(),'{}'),
 ('89000000-0000-4000-8000-000000000008','old-version@example.test',now(),'{"mile_training_disclaimer":"2026-11-25"}');
insert into public.av_invite_codes(id,code_hash,recipient_email)
values (6,extensions.crypt('FIXTURE-CONSENT',extensions.gen_salt('bf')),'consent@example.test'),
 (7,extensions.crypt('FIXTURE-PENDING',extensions.gen_salt('bf')),'pending@example.test'),
 (8,extensions.crypt('FIXTURE-OLD',extensions.gen_salt('bf')),'old-version@example.test');

do $$
begin
 if (select count(*) from mile_onboarding_private.training_disclaimer_acceptances)<>1
  or not exists (
   select from mile_onboarding_private.training_disclaimer_acceptances
   where user_id='89000000-0000-4000-8000-000000000006' and document_version='2026-11-26'
   and document_sha256='3b8f4565ed7a16af47c421760ecc99d9304885b344f0f1679292cea9a19d01b1'
   and accepted_at between now()-interval '1 minute' and now()
  ) then raise exception 'Signup receipt identity, version, fingerprint or timestamp incorrect'; end if;
end;
$$;

set role anon;
select pg_temp.expect_state($$select public.mile_accept_training_disclaimer('2026-11-26')$$,'42501');
reset role;
set role authenticated;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000006';
select pg_temp.expect_state($$select public.mile_accept_training_disclaimer('2026-11-26')$$,'PT403');
select pg_temp.expect_state($$select public.av_join('FIXTURE-CONSENT')$$,'P0001');
select pg_temp.expect_state($$select * from mile_onboarding_private.training_disclaimer_acceptances$$,'42501');
select pg_temp.expect_state($$insert into mile_onboarding_private.training_disclaimer_acceptances(user_id,document_version,document_sha256)
 values ('89000000-0000-4000-8000-000000000007','2026-11-26',repeat('0',64))$$,'42501');

reset role;
update auth.users set email_confirmed_at=now() where id='89000000-0000-4000-8000-000000000006';
update auth.users set raw_user_meta_data='{"mile_training_disclaimer":"2026-11-26"}' where id='89000000-0000-4000-8000-000000000007';
set role authenticated;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000006';
select public.av_join('FIXTURE-CONSENT');
select pg_temp.expect_state($$select public.mile_accept_training_disclaimer('2026-11-26')$$,'PT409');
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000008';
select pg_temp.expect_state($$select public.av_join('FIXTURE-OLD')$$,'PT412');
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000007';
select pg_temp.expect_state($$select public.av_join('FIXTURE-PENDING')$$,'PT412');
select pg_temp.expect_state($$select public.mile_accept_training_disclaimer('2026-11-25')$$,'PT409');
select public.mile_accept_training_disclaimer('2026-11-26');
reset role;
create temporary table receipt_clock as select accepted_at
from mile_onboarding_private.training_disclaimer_acceptances where user_id='89000000-0000-4000-8000-000000000007';
set role authenticated;
select public.mile_accept_training_disclaimer('2026-11-26');
select public.av_join('FIXTURE-PENDING');
reset role;
do $$
begin
 if (select accepted_at from mile_onboarding_private.training_disclaimer_acceptances
  where user_id='89000000-0000-4000-8000-000000000007') <> (select accepted_at from receipt_clock)
  or not exists(select from public.av_members where user_id='89000000-0000-4000-8000-000000000001' and onboarding_stage is null)
 then raise exception 'Receipt timestamp or preexisting member changed'; end if;
end;
$$;

-- The three images model existing object keys. Membership and profile
-- visibility are tested using the actual Storage RLS policies.
insert into storage.objects values
 ('mile-avatars','89000000-0000-4000-8000-000000000003/avatar.jpg'),
 ('mile-avatars','89000000-0000-4000-8000-000000000003/cover.jpg'),
 ('mile-avatars','89000000-0000-4000-8000-000000000002/avatar.jpg');
grant select on storage.objects to anon;
create policy fixture_unrelated_anon_read on storage.objects for select to anon using (true);

set role anon;
do $$
begin
 if exists(select from storage.objects where bucket_id='mile-avatars') then raise exception 'Anonymous avatar access'; end if;
end;
$$;
reset role;
set role authenticated;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000005';
do $$
begin
 if exists(select from storage.objects where bucket_id='mile-avatars') then raise exception 'Uninvited user could read images'; end if;
end;
$$;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000006';
do $$
begin
 if (select count(*) from storage.objects where bucket_id='mile-avatars')<>1
  or not exists(select from storage.objects where name like '%000002/avatar.jpg')
 then raise exception 'Public profile photo unavailable or private profile photo leaked'; end if;
end;
$$;
reset role;
insert into public.mile_follows values ('89000000-0000-4000-8000-000000000006','89000000-0000-4000-8000-000000000003','pending');
set role authenticated;
do $$
begin
 if exists(select from storage.objects where name like '%000003/%') then raise exception 'Pending follower could read images'; end if;
end;
$$;
reset role;
update public.mile_follows set status='accepted';
set role authenticated;
do $$
begin
 if (select count(*) from storage.objects where name like '%000003/%')<>2 then raise exception 'Accepted follower could not read existing images'; end if;
end;
$$;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
do $$
begin
 if (select count(*) from storage.objects where name like '%000003/%')<>2 then raise exception 'Owner could not read existing images'; end if;
end;
$$;
reset role;
delete from public.mile_follows where follower_id='89000000-0000-4000-8000-000000000006';
set role authenticated;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000006';
do $$
begin
 if exists(select from storage.objects where name like '%000003/%') then raise exception 'Revoked follower could still read images'; end if;
end;
$$;
reset role;
