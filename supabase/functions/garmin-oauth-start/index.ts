
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { garminRouting } from "../_shared/garmin-routing.mjs";

// MILE Training — Garmin OAuth 2.0 PKCE start endpoint

const routing = garminRouting(Deno.env.get("SUPABASE_URL"), Deno.env.get("MILE_GARMIN_BETA_ORIGIN"));
const ALLOWED_ORIGINS = routing?.origins ?? new Set<string>();

const GARMIN_AUTHORIZE_URL =
  "https://connect.garmin.com/partner/oauth2Confirm";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(size = 48): string {
  return base64url(
    crypto.getRandomValues(new Uint8Array(size)),
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );

  return base64url(new Uint8Array(digest));
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (!routing) return json({ error: "Garmin connection is unavailable in this environment" }, 503, null);

  // Handle browser CORS preflight.
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, { status: 403 });
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed" },
      405,
      origin,
    );
  }

  if ((routing.beta && !origin) || (origin && !ALLOWED_ORIGINS.has(origin))) {
    return json(
      { error: "Origin not allowed" },
      403,
      null,
    );
  }

  // Require an authenticated MILE user.
  const bearer = /^Bearer (\S+)$/i.exec(
    req.headers.get("authorization") ?? "",
  );

  if (!bearer) {
    return json(
      { error: "Sign in to MILE first" },
      401,
      origin,
    );
  }

  // Read server configuration.
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL")?.trim();

  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY")?.trim();

  const dbUrl =
    Deno.env.get("SUPABASE_DB_URL")?.trim();

  // IMPORTANT FIX:
  // Remove invisible whitespace and line breaks
  // accidentally copied with the Garmin Client ID.
  const clientId =
    Deno.env.get("GARMIN_CLIENT_ID")?.trim();

  if (
    !supabaseUrl ||
    !anonKey ||
    !dbUrl ||
    !clientId
  ) {
    console.error("Garmin OAuth configuration incomplete");

    return json(
      { error: "Server configuration incomplete" },
      503,
      origin,
    );
  }

  // Verify the current Supabase user session.
  const auth = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await auth.auth.getUser(bearer[1]);

  if (error || !user || (routing.beta && (!user.email_confirmed_at || user.is_anonymous))) {
    return json(
      { error: "Session expired; sign in again" },
      401,
      origin,
    );
  }

  // Generate cryptographically secure OAuth state
  // and PKCE verifier.
  const state = routing.prefix(origin) + randomString();
  const verifier = randomString();

  const [stateHash, challenge] = await Promise.all([
    sha256(state),
    sha256(verifier),
  ]);

  // Save the short-lived OAuth state in the
  // private Supabase database schema.
  const sql = postgres(dbUrl, {
    max: 1,
    idle_timeout: 2,
    connect_timeout: 5,
  });

  try {
    if (routing.beta) {
      const member = await sql`select 1 from public.av_members where user_id = ${user.id}`;
      if (!member.length) return json({ error: "MILE Staging membership required" }, 403, origin);
    }
    await sql`
      insert into private.mile_garmin_oauth_states (
        state_hash,
        user_id,
        code_verifier,
        expires_at
      )
      values (
        ${stateHash},
        ${user.id},
        ${verifier},
        now() + interval '10 minutes'
      )
    `;
  } catch (_err) {
    console.error("Could not save Garmin OAuth state");

    return json(
      { error: "Could not create Garmin connection request" },
      500,
      origin,
    );
  } finally {
    await sql.end();
  }

  // Build Garmin's authorization URL.
  const url = new URL(GARMIN_AUTHORIZE_URL);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", routing.callback);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  // Return the URL to MILE.
  // The frontend opens Garmin's authorization page.
  return json(
    {
      authorization_url: url.toString(),
    },
    200,
    origin,
  );
});
