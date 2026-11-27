-- Only a hashed, one-time, 90-second drain capability is stored.
-- Never put the reusable Vault secret or Garmin webhook credential into pg_net.
create table if not exists private.mile_fit_drain_tickets(
 token_hash bytea primary key check(octet_length(token_hash)=32),
 expires_at timestamptz not null
);
alter table private.mile_fit_drain_tickets enable row level security;
revoke all privileges on private.mile_fit_drain_tickets from public,anon,authenticated;
