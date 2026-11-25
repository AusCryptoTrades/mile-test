-- Batch 80.6/80.7 staged database deployment. Review and run as a single transaction before enabling the new endpoints.
begin;
create table if not exists private.mile_admin_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(title) between 3 and 100),
 body text not null check(char_length(body) between 5 and 600),
 kind text not null check(kind in ('announcement','release')),
 status text not null default 'draft' check(status in ('draft','published')),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 published_at timestamptz,
 recipient_count integer check(recipient_count>=0)
);
create table if not exists private.mile_admin_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null,
 action text not null,
 target_id uuid not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table private.mile_admin_announcements enable row level security;
alter table private.mile_admin_audit enable row level security;
revoke all on private.mile_admin_announcements,private.mile_admin_audit from public,anon,authenticated;
create index if not exists mile_admin_audit_created_idx on private.mile_admin_audit(created_at desc,id);
alter table public.mile_app_notifications drop constraint mile_app_notifications_kind_check;
alter table public.mile_app_notifications add constraint mile_app_notifications_kind_check check(kind in ('message','follow','follow_request','follow_accepted','like','comment','pb','announcement'));
commit;
