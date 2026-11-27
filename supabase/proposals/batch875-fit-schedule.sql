-- Schedule only after the one-time-token receiver passes a disabled-mode probe.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('mile-fit-drain-v1','* * * * *',$fit$
 delete from private.mile_fit_drain_tickets where expires_at<=clock_timestamp();
 with token as materialized (
  select replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') as value
  from private.mile_fit_control where id=1 and enabled
 ), issued as (
  insert into private.mile_fit_drain_tickets(token_hash,expires_at)
  select sha256(convert_to(value,'UTF8')),clock_timestamp()+interval '90 seconds' from token
  returning token_hash
 )
 select net.http_post(
  url:='https://mgixvokjlytjuypzcfzz.supabase.co/functions/v1/garmin-fit-files/drain',
  headers:=jsonb_build_object('Content-Type','application/json','x-mile-fit-drain',token.value),
  body:='{}'::jsonb,timeout_milliseconds:=60000)
 from token join issued on issued.token_hash=sha256(convert_to(token.value,'UTF8'))
$fit$);
