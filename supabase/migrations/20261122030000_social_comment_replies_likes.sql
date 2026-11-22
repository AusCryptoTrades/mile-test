alter table public.mile_activity_comments add column if not exists parent_comment_id uuid references public.mile_activity_comments(id) on delete cascade;
create index if not exists mile_activity_comments_parent_idx on public.mile_activity_comments(parent_comment_id);
create table if not exists public.mile_comment_likes (
 comment_id uuid not null references public.mile_activity_comments(id) on delete cascade,
 user_id uuid not null references public.mile_profiles(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(comment_id,user_id)
);
alter table public.mile_comment_likes enable row level security;
grant select,insert,delete on public.mile_comment_likes to authenticated;
drop policy if exists "View likes for visible comments" on public.mile_comment_likes;
create policy "View likes for visible comments" on public.mile_comment_likes for select to authenticated using (
 exists(select 1 from public.mile_activity_comments c where c.id=comment_id)
);
drop policy if exists "Like visible comments as self" on public.mile_comment_likes;
create policy "Like visible comments as self" on public.mile_comment_likes for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.mile_activity_comments c where c.id=comment_id)
);
drop policy if exists "Unlike own comments" on public.mile_comment_likes;
create policy "Unlike own comments" on public.mile_comment_likes for delete to authenticated using (user_id=(select auth.uid()));
create schema if not exists mile_private;
create or replace function mile_private.comment_reply_guard_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare parent record;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Comment author mismatch' using errcode='42501'; end if;
 if new.parent_comment_id is null then return new; end if;
 if new.parent_comment_id=new.id then raise exception 'Cannot reply to self'; end if;
 select id,activity_id,user_id,parent_comment_id into parent from public.mile_activity_comments where id=new.parent_comment_id;
 if not found or parent.activity_id<>new.activity_id or parent.parent_comment_id is not null then
  raise exception 'Replies must target a top-level comment on the same activity';
 end if;
 if parent.user_id<>new.user_id then
  insert into public.mile_app_notifications(recipient_id,actor_id,kind,entity_id,message)
  values(parent.user_id,new.user_id,'comment',new.id::text,'replied to your comment');
 end if;
 return new;
end $$;
revoke all on function mile_private.comment_reply_guard_notify() from public,anon,authenticated;
drop trigger if exists mile_comment_reply_guard_notify on public.mile_activity_comments;
create trigger mile_comment_reply_guard_notify before insert on public.mile_activity_comments for each row execute function mile_private.comment_reply_guard_notify();