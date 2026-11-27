-- Use only the MILE Staging SQL Editor (project fnyfeelynaozxtftrrga).
-- Replace the two placeholders with inboxes controlled by the owner and tester.
-- Keep the returned codes private. Valid for 48 hours and one redemption each.
with recipients(label,email) as (
 values ('Running beta owner','REPLACE_OWNER_EMAIL'), ('Running beta tester','REPLACE_TESTER_EMAIL')
), checked as (
 select lower(trim(email)) email, label, upper(replace(gen_random_uuid()::text,'-','')) code
 from recipients
 where (select count(distinct lower(trim(email))) from recipients) = 2
 and (select bool_and(email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') from recipients)
 and not exists (select 1 from public.av_invite_codes
   where public.av_invite_codes.label like 'Running beta %' and enabled and expires_at > now())
), inserted as (
 insert into public.av_invite_codes(code_hash,label,max_uses,used_count,enabled,expires_at,recipient_email)
 select extensions.crypt(code,extensions.gen_salt('bf')), label, 1, 0, true, now()+interval '48 hours', email
 from checked
 returning label,expires_at
)
select inserted.label,checked.code,inserted.expires_at from inserted join checked using(label) order by label;
