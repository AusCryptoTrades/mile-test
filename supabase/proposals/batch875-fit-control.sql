-- Keep ingestion disabled until the real receiver and scheduled drain have been verified.
create table if not exists private.mile_fit_control (
 id integer primary key check(id=1),
 enabled boolean not null default false,
 drain_secret_id uuid not null
);
alter table private.mile_fit_control enable row level security;
revoke all on private.mile_fit_control from public, anon, authenticated;
do $fit$
declare secret_id uuid;
begin
 select id into secret_id from vault.secrets where name='mile_fit_drain_v1';
 if secret_id is null then
   select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'mile_fit_drain_v1','Private MILE FIT scheduled processing token') into secret_id;
 end if;
 insert into private.mile_fit_control(id,enabled,drain_secret_id) values (1,false,secret_id) on conflict(id) do nothing;
end $fit$;
