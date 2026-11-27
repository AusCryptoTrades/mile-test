-- Run only after the isolated receiver responds to an authenticated disabled-mode drain.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Scheduled calls do not place any credentials in the URL or job definition.
select cron.schedule('mile-fit-drain-v1','* * * * *',$fit$
 select net.http_post(
 url:='https://mgixvokjlytjuypzcfzz.supabase.co/functions/v1/garmin-fit-files/drain',
 headers:=jsonb_build_object('Content-Type','application/json','x-mile-fit-drain',s.decrypted_secret),
 body:='{}'::jsonb,timeout_milliseconds:=60000)
 from private.mile_fit_control c join vault.decrypted_secrets s on s.id=c.drain_secret_id
 where c.id=1 and c.enabled
$fit$);
