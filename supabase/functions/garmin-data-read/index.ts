import {withFitLaps} from "./fit-read.mjs";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

// MILE Garmin Data Reader V2
// GET (no activityId): backwards-compatible health/activity summary response.
// GET ?activityId=<Garmin ID>: detailed data for the authenticated owner only.
const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!DB_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Server configuration incomplete" }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json({ error: "Authentication required" }, 401);
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json({ error: "Could not validate session" }, 503);
  }
  if (!authResponse.ok) return json({ error: "Invalid or expired session" }, 401);
  const authUser = await authResponse.json().catch(() => null);
  const userId = authUser?.id;
  if (typeof userId !== "string" || !userId) {
    return json({ error: "Authenticated user missing" }, 401);
  }

  const url = new URL(req.url);
  const activityId = url.searchParams.get("activityId");
  if (activityId !== null && !/^\d{5,20}$/.test(activityId)) {
    return json({ error: "Invalid Garmin activity ID" }, 400);
  }

  const sql = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    if (activityId !== null) {
      // The database lookup is ALWAYS scoped to the authenticated user.
      // Never accept user_id from the browser, and never return connection credentials.
      const [details, summaries] = await Promise.all([
        sql`
          SELECT garmin_activity_id, summary_id, raw_data, received_at, updated_at
          FROM private.mile_garmin_activity_details
          WHERE user_id = ${userId} AND garmin_activity_id = ${activityId}
          LIMIT 1
        `,
        sql`
          SELECT garmin_activity_id, activity_type, activity_name, started_at,
                 duration_seconds, distance_metres, raw_data, updated_at
          FROM private.mile_garmin_activities
          WHERE user_id = ${userId} AND garmin_activity_id = ${activityId}
          LIMIT 1
        `,
      ]);
      if (!details.length && !summaries.length) {
        return json({ error: "Activity not found" }, 404);
      }
      const detail = details[0] ?? null;
      const summary = summaries[0] ?? null;
      const recorded = await withFitLaps(sql,userId,activityId,detail?.raw_data ?? null);
      return json({
        success: true,
        activity_id: activityId,
        summary,
        detail: recorded,
        has_details: Boolean(recorded),
        // These are convenient indicators, not substitutes for actual recorded data.
        sample_count: Array.isArray(recorded?.samples) ? recorded.samples.length : 0,
        lap_count: Array.isArray(recorded?.laps) ? recorded.laps.length : 0,
      });
    }

    // Original V1 response retained for existing MILE Dashboard consumers.
    const [health, activities, latest] = await Promise.all([
      sql`
        SELECT data_type, recorded_at, raw_data, updated_at
        FROM private.mile_garmin_health
        WHERE user_id = ${userId}
          AND data_type IN ('dailies', 'sleeps', 'hrv', 'userMetrics', 'stressDetails')
        ORDER BY recorded_at DESC NULLS LAST, updated_at DESC
        LIMIT 500
      `,
      sql`
        SELECT garmin_activity_id, activity_type, activity_name, started_at,
               duration_seconds, distance_metres, raw_data, updated_at
        FROM private.mile_garmin_activities
        WHERE user_id = ${userId}
        ORDER BY started_at DESC NULLS LAST, updated_at DESC
        LIMIT 200
      `,
      sql`
        SELECT GREATEST(
          COALESCE((SELECT MAX(updated_at) FROM private.mile_garmin_health WHERE user_id = ${userId}), 'epoch'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM private.mile_garmin_activities WHERE user_id = ${userId}), 'epoch'::timestamptz)
        ) AS latest_import
      `,
    ]);
    return json({
      success: true,
      health,
      activities,
      latest_import: latest[0]?.latest_import ?? null,
    });
  } catch (error) {
    console.error("Garmin data read failed", error instanceof Error ? error.name : "Unknown");
    return json({ error: "Could not load Garmin data" }, 500);
  } finally {
    await sql.end();
  }
});
