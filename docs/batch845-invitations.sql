-- Reviewed deployment candidate; apply in staging first, as a single transaction.
begin;
alter table public.av_invite_codes add column if not exists expires_at timestamptz, add column if not exists recipient_email text;
alter table public.av_invite_codes enable row level security;
revoke all on public.av_invite_codes from anon, authenticated, public;
create or replace function public.av_join(invite_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare chosen public.av_invite_codes%rowtype; uid uuid := auth.uid(); verified_email text;
begin
 if uid is null then raise exception 'Please sign in first'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 if exists(select 1 from public.av_members where user_id=uid) then return true; end if;
 if invite_code is null or length(invite_code)>128 then raise exception 'Invalid or unavailable invitation'; end if;
 select lower(email) into verified_email from auth.users where id=uid and email_confirmed_at is not null;
 select * into chosen from public.av_invite_codes
 where enabled and code_hash=extensions.crypt(upper(trim(invite_code)),code_hash)
 order by id limit 1 for update;
 if not found or chosen.used_count>=chosen.max_uses or (chosen.expires_at is not null and chosen.expires_at<=now()) or (chosen.recipient_email is not null and chosen.recipient_email is distinct from verified_email) then
 raise exception 'Invalid or unavailable invitation'; end if;
 insert into public.av_members(user_id,invite_id) values(uid,chosen.id);
 update public.av_invite_codes set used_count=used_count+1 where id=chosen.id;
 return true;
end $$;
revoke all on function public.av_join(text) from public,anon;
grant execute on function public.av_join(text) to authenticated;
commit;