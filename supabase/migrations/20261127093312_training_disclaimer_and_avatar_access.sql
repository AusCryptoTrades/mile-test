begin;

-- Approved MILE website disclaimer, effective 26 November 2026.
-- Source: AusCryptoTrades/mile-website at db458cebe4d159c3cd44228b0f40edcd1339511f.
create function mile_onboarding_private.training_disclaimer_version() returns text
language sql immutable set search_path = '' as $$ select '2026-11-26'::text $$;

create table mile_onboarding_private.training_disclaimer_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_version text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (user_id, document_version)
);
alter table mile_onboarding_private.training_disclaimer_acceptances enable row level security;
revoke all on mile_onboarding_private.training_disclaimer_acceptances from public, anon, authenticated, service_role;

create function mile_onboarding_private.record_training_disclaimer(athlete uuid, version text) returns void
language plpgsql set search_path = '' as $$
begin
  if version is distinct from mile_onboarding_private.training_disclaimer_version() then
    raise sqlstate 'PT409' using message = 'The Training Disclaimer has changed. Reload MILE and review it again.';
  end if;
  insert into mile_onboarding_private.training_disclaimer_acceptances (user_id, document_version, document_sha256)
  values (athlete, version, '3b8f4565ed7a16af47c421760ecc99d9304885b344f0f1679292cea9a19d01b1')
  on conflict (user_id, document_version) do nothing;
end;
$$;

-- Capture the explicit version submitted with account creation. Editing Auth
-- user metadata later cannot create or alter a receipt.
create function mile_onboarding_private.capture_training_disclaimer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare version text := new.raw_user_meta_data->>'mile_training_disclaimer';
begin
  if not coalesce(new.is_anonymous, false) and version = mile_onboarding_private.training_disclaimer_version() then
    perform mile_onboarding_private.record_training_disclaimer(new.id, version);
  end if;
  return new;
end;
$$;
create trigger mile_capture_training_disclaimer after insert on auth.users
  for each row execute function mile_onboarding_private.capture_training_disclaimer();

-- An in-flight registration can accept after verification, before redemption.
create function mile_onboarding_private.accept_training_disclaimer(p_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare athlete uuid := auth.uid();
begin
  if athlete is null or not exists (
    select from auth.users where id = athlete and email_confirmed_at is not null and not coalesce(is_anonymous, false)
  ) then
    raise sqlstate 'PT403' using message = 'Confirm your email before accepting the Training Disclaimer.';
  end if;
  if exists (select from public.av_members where user_id = athlete) then
    raise sqlstate 'PT409' using message = 'This account is already active.';
  end if;
  perform mile_onboarding_private.record_training_disclaimer(athlete, p_version);
  return true;
end;
$$;

create function public.mile_accept_training_disclaimer(p_version text) returns boolean
language sql security invoker set search_path = '' as $$
  select mile_onboarding_private.accept_training_disclaimer(p_version)
$$;

create function mile_onboarding_private.require_training_disclaimer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare athlete uuid := auth.uid();
begin
  -- Existing memberships are never rewritten. Staff provisioning without a
  -- user JWT remains available through the existing restricted database path.
  if athlete is null then return new; end if;
  if athlete is distinct from new.user_id or not exists (
    select from auth.users where id = athlete and email_confirmed_at is not null and not coalesce(is_anonymous, false)
  ) then
    raise sqlstate 'PT403' using message = 'Confirm your email before activating a MILE account.';
  end if;
  if not exists (
    select from mile_onboarding_private.training_disclaimer_acceptances
    where user_id = athlete and document_version = mile_onboarding_private.training_disclaimer_version()
  ) then
    raise sqlstate 'PT412' using message = 'Accept the Training Disclaimer to activate your account.';
  end if;
  return new;
end;
$$;
create trigger mile_require_training_disclaimer before insert on public.av_members
  for each row execute function mile_onboarding_private.require_training_disclaimer();

revoke all on function mile_onboarding_private.training_disclaimer_version(),
  mile_onboarding_private.record_training_disclaimer(uuid,text),
  mile_onboarding_private.capture_training_disclaimer(),
  mile_onboarding_private.accept_training_disclaimer(text),
  mile_onboarding_private.require_training_disclaimer(),
  public.mile_accept_training_disclaimer(text) from public, anon, authenticated, service_role;
grant execute on function mile_onboarding_private.accept_training_disclaimer(text),
  public.mile_accept_training_disclaimer(text) to authenticated;

-- Keep existing object keys. The client resolves legacy public URLs via the
-- authenticated Storage API. Make the bucket private only after compatible
-- clients are deployed and the hosted access matrix passes (see runbook).
create policy "MILE authorised profile avatar read" on storage.objects
  for select to authenticated using (
    bucket_id = 'mile-avatars'
    and name in ((storage.foldername(name))[1] || '/avatar.jpg', (storage.foldername(name))[1] || '/cover.jpg')
    and exists (
      -- mile_profiles RLS admits the owner, accepted followers and discoverable public profiles.
      select from public.mile_profiles p
      where p.user_id = case when (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        then ((storage.foldername(storage.objects.name))[1])::uuid end
    )
  );
create policy "MILE avatars require authenticated reads" on storage.objects as restrictive
  for select to anon using (bucket_id <> 'mile-avatars');
create policy "MILE avatar viewers are members" on storage.objects as restrictive
  for select to authenticated using (bucket_id <> 'mile-avatars' or
    exists (select from public.av_members where user_id = (select auth.uid())));

commit;
