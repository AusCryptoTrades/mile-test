import {withFitLaps} from "./fit-read.mjs";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

// MILE shared Garmin reader — release candidate. Verified against supplied table columns and status values.
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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

function redactLocation(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactLocation);
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).filter(([key]) =>
      !/(latitude|longitude|(^lat$)|(^lon$)|(^lng$)|(^gps$)|route|polyline|coordinate|location)/i.test(key)
    ).map(([key, value]) => [key, redactLocation(value)]));
  }
  return input;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!DB_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "Server configuration incomplete" }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: "Authentication required" }, 401);
  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch { return json({ error: "Could not validate session" }, 503); }
  if (!authResponse.ok) return json({ error: "Invalid or expired session" }, 401);
  const authUser = await authResponse.json().catch(() => null);
  const viewerId = authUser?.id;
  if (typeof viewerId !== "string" || !viewerId) return json({ error: "Authenticated user missing" }, 401);

  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
    return json({ error: "Invalid post ID" }, 400);
  }

  const sql = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    // The post audience is authoritative; never infer access from discoverability.
    const posts = await sql`
      SELECT id, user_id, title, activity_type, activity_at, distance_m,
             duration_s, average_pace_s_km, average_hr, calories,
             elevation_gain_m, visibility, share_route,
             garmin_activity_id, source_activity_id
      FROM public.mile_social_activities WHERE id = ${postId} LIMIT 1
    `;
    const post = posts[0];
    if (!post) return json({ error: "Activity not found" }, 404);
    const ownerId = String(post.user_id);
    let allowed = viewerId === ownerId || post.visibility === "public";
    if (!allowed && post.visibility === "followers") {
      const follows = await sql`
        SELECT 1 FROM public.mile_follows
        WHERE follower_id = ${viewerId} AND following_id = ${ownerId}
          AND status = 'accepted' LIMIT 1
      `;
      allowed = follows.length > 0;
    }
    if (!allowed) return json({ error: "You do not have permission to view this activity" }, 403);

    const garminId = String(post.garmin_activity_id || post.source_activity_id || "");
    if (!/^\d{5,20}$/.test(garminId)) return json({ error: "No linked Garmin activity for this post" }, 404);

    const [summaries, details] = await Promise.all([
      sql`SELECT garmin_activity_id, activity_type, activity_name, started_at,
                 duration_seconds, distance_metres, raw_data, updated_at
          FROM private.mile_garmin_activities
          WHERE user_id = ${ownerId} AND garmin_activity_id = ${garminId} LIMIT 1`,
      sql`SELECT garmin_activity_id, summary_id, raw_data, received_at, updated_at
          FROM private.mile_garmin_activity_details
          WHERE user_id = ${ownerId} AND garmin_activity_id = ${garminId} LIMIT 1`,
    ]);
    if (!summaries.length && !details.length) return json({ error: "Garmin activity not found" }, 404);
    // Existing MILE posts may have NULL. Only an explicit false hides GPS.
    const shareRoute = post.share_route !== false;
    const raw = await withFitLaps(sql,ownerId,garminId,details[0]?.raw_data ?? null);
    const summary = summaries[0] ?? null;
    // Avoid returning summary.raw_data because it may also embed coordinates.
    const safeSummary = summary && {
      garmin_activity_id: summary.garmin_activity_id,
      activity_type: summary.activity_type,
      activity_name: summary.activity_name,
      started_at: summary.started_at,
      duration_seconds: summary.duration_seconds,
      distance_metres: summary.distance_metres,
    };
    return json({
      success: true,
      post: {
        id: post.id, user_id: ownerId, title: post.title,
        activity_type: post.activity_type, activity_at: post.activity_at,
        distance_m: post.distance_m, duration_s: post.duration_s,
        average_pace_s_km: post.average_pace_s_km, average_hr: post.average_hr,
        calories: post.calories, elevation_gain_m: post.elevation_gain_m,
      },
      summary: safeSummary,
      can_share_route: shareRoute,
      details: shareRoute ? raw : redactLocation(raw),
    });
  } catch (error) {
    console.error("Shared Garmin reader failed", error instanceof Error ? error.name : "Unknown");
    return json({ error: "Could not load shared Garmin data" }, 500);
  } finally { await sql.end(); }
});
