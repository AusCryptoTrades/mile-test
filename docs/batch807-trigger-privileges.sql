-- Already applied and verified in production.
revoke execute on function public.mile_notify_social_event() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
