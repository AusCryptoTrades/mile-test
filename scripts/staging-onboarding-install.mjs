import { readFile } from 'node:fs/promises';

// The reviewed migration is re-runnable in production. Staging has never had
// onboarding, so omit its replacement branches and fail if anything exists.
const path = new URL('../supabase/migrations/20261127084450_athlete_onboarding.sql', import.meta.url);
const source = await readFile(path, 'utf8');
const initial = source
  .replace(/^  drop constraint if exists av_members_onboarding_completion,\r?\n/m, '')
  .replace(/^drop policy if exists "MILE members (create profiles|edit profiles|upload avatars|replace avatars)" on (?:public\.mile_profiles|storage\.objects);\r?\n/gm, '')
  .replace(/^create or replace (function|trigger) /gm, 'create $1 ')
  .replace('create schema if not exists mile_onboarding_private;', 'create schema mile_onboarding_private;')
  .replace(/^  add column if not exists /gm, '  add column ');
if (!initial.startsWith('begin;') || /^\s*drop\s|\bcreate or replace\b/im.test(initial)) {
  throw new Error('The reviewed initial-install transformation is out of date.');
}
const guard = `
do $$
begin
 if not exists (select from supabase_migrations.schema_migrations where name='staging_onboarding_prerequisites')
    or to_regnamespace('mile_onboarding_private') is not null
    or exists (select from auth.users) or exists (select from public.av_members)
    or exists (select from public.av_training_data) then
  raise exception 'Expected the verified empty MILE Staging prerequisites for initial onboarding install';
 end if;
end;
$$;
`;
process.stdout.write(initial.replace('begin;', () => 'begin;' + guard));
