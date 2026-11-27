-- Preserve the original prescription semantics and receipts for legacy programmes.
begin;
alter function mile_running_private.reduce_aerobic_workout(jsonb, integer, numeric)
  rename to reduce_aerobic_workout_legacy;

create function mile_running_private.reduce_aerobic_workout(
  original jsonb, old_revision integer, p_distance_factor numeric
) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  validated jsonb;
  step jsonb;
  target jsonb;
  old_meters numeric;
  new_meters numeric;
  seconds_after numeric;
  detail text;
  zone_name text;
begin
  if original->'runningPlanVersion' is distinct from '3'::jsonb then
    return mile_running_private.reduce_aerobic_workout_legacy(original, old_revision, p_distance_factor);
  end if;

  -- The existing reducer validates the target, version-independent totals and
  -- distance-step invariants. Its fractional reduction is discarded below.
  validated := mile_running_private.reduce_aerobic_workout_legacy(
    jsonb_set(original, '{runningPlanVersion}', '1'::jsonb), old_revision, p_distance_factor
  );
  step := original#>'{structuredSteps,0}';
  target := step->'target';
  old_meters := (original->>'meters')::numeric;
  if jsonb_array_length(original->'structuredSteps') <> 1
    or step->>'intensity' is distinct from 'active'
    or mod(old_meters, 1000) <> 0
    or p_distance_factor is null or p_distance_factor < 0.8 or p_distance_factor >= 1 then
    raise sqlstate 'PT422' using message = 'Only continuous whole-kilometre aerobic sessions can receive this reduction';
  end if;

  -- Nearest whole kilometre with a downward tie. Retain the existing 20% guard.
  new_meters := ceil(old_meters * p_distance_factor / 1000 - 0.5) * 1000;
  if new_meters < old_meters * 0.8 or new_meters >= old_meters then
    raise sqlstate 'PT422' using message = 'No safe whole-kilometre adjustment fits this workout';
  end if;
  seconds_after := ceil((original->>'estimatedSeconds')::numeric * new_meters / old_meters);
  zone_name := case target->>'zone' when 'Z1' then 'Z1 Recovery' when 'Z2' then 'Z2 Easy aerobic'
    when 'Z3' then 'Z3 Steady' when 'Z4' then 'Z4 Threshold' when 'Z5' then 'Z5 High intensity' end;
  detail := 'Run: ' || (new_meters / 1000)::integer || ' km';
  if target->>'kind' <> 'open' then
    detail := detail || ' · ' || coalesce(zone_name || ' · ', '') || split_part(validated->>'detail', ' · ', 2);
  else
    detail := detail || '.';
  end if;
  return original || jsonb_build_object(
    'revision', old_revision + 1, 'meters', new_meters, 'km', new_meters / 1000,
    'estimatedSeconds', seconds_after, 'plannedMinutes', ceil(seconds_after / 60),
    'structuredSteps', jsonb_build_array(jsonb_set(step, '{duration,meters}', to_jsonb(new_meters))),
    'detail', detail, 'structuredDetail', detail
  );
end;
$$;
revoke all on function mile_running_private.reduce_aerobic_workout(jsonb, integer, numeric)
  from public, anon, authenticated, service_role;
commit;
