-- Applied to production and verified using rollback-only role simulation.
-- All admin reads and changes now go via the server-verified audited endpoint.
revoke update, delete, truncate, trigger, references on public.mile_beta_reports from public, anon, authenticated;
drop policy if exists "beta report admin update" on public.mile_beta_reports;
drop policy if exists "beta report read own or admin" on public.mile_beta_reports;
drop policy if exists "beta report read own" on public.mile_beta_reports;
create policy "beta report read own" on public.mile_beta_reports for select to authenticated using ((select auth.uid()) = reporter_id);
