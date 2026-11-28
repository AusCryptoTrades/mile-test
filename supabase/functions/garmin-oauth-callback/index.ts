
import postgres from "npm:postgres@3.4.5";
import { garminRouting } from "../_shared/garmin-routing.mjs";

// MILE Training — Garmin OAuth 2.0 PKCE callback

const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const CLIENT_ID = Deno.env.get("GARMIN_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GARMIN_CLIENT_SECRET");

const routing = garminRouting(Deno.env.get("SUPABASE_URL"), Deno.env.get("MILE_GARMIN_BETA_ORIGIN"));

// Official Garmin OAuth token endpoint
const TOKEN_URL =
  "https://diauth.garmin.com/di-oauth2-service/oauth/token";

// Redirect back to MILE Test without exposing credentials.
function redirect(status: "connected" | "failed", target = routing?.fallback): Response {
  if (!target) return new Response("Garmin connection is unavailable", { status: 503 });
  const url = new URL(target);
  url.searchParams.set("garmin", status);

  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Must match the SHA-256 Base64URL hashing used
// in garmin-oauth-start.
async function hashState(state: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(state),
    ),
  );

  let binary = "";
  for (const byte of digest) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Encode Garmin client credentials for HTTP Basic auth.
function basicAuth(clientId: string, clientSecret: string): string {
  const credentials = new TextEncoder().encode(
    `${clientId}:${clientSecret}`,
  );

  let binary = "";
  for (const byte of credentials) {
    binary += String.fromCharCode(byte);
  }

  return `Basic ${btoa(binary)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
    });
  }

  if (!routing) return redirect("failed");
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Never trust a caller-provided return URL. Only a consumed, authenticated state may select the new origin.
  if (!state || (routing.beta && !routing.returnTo(state))) {
    return redirect("failed");
  }

  if (!DB_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("Garmin callback configuration incomplete");
    return redirect("failed");
  }

  const sql = postgres(DB_URL, {
    max: 1,
    idle_timeout: 2,
    connect_timeout: 5,
  });

  let target = routing.fallback;
  try {
    const stateHash = await hashState(state);

    // Atomically consume the one-time OAuth state.
    const rows = await sql`
      delete from private.mile_garmin_oauth_states
      where state_hash = ${stateHash}
        and expires_at > now()
      returning user_id, code_verifier
    `;

    if (rows.length !== 1) {
      console.error("Garmin OAuth state invalid or expired");
      return redirect("failed");
    }

    target = routing.returnTo(state) ?? routing.fallback;
    if (error || !code) return redirect("failed", target);
    const userId = rows[0].user_id;
    const verifier = rows[0].code_verifier;
    if (routing.beta) {
      const member = await sql`select 1 from public.av_members m join auth.users u on u.id=m.user_id
        where m.user_id = ${userId} and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)`;
      if (!member.length) return redirect("failed", target);
    }

    // Exchange authorization code for Garmin tokens.
    // This happens only on the Supabase backend.
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: routing.callback,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuth(CLIENT_ID, CLIENT_SECRET),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(
        "Garmin token exchange failed",
        response.status,
      );
      return redirect("failed", target);
    }

    const tokens = await response.json();

    if (
      typeof tokens.access_token !== "string" ||
      !tokens.access_token ||
      typeof tokens.refresh_token !== "string" ||
      !tokens.refresh_token
    ) {
      console.error("Garmin returned incomplete token data");
      return redirect("failed", target);
    }

    const expiresIn = Number(tokens.expires_in);

    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      console.error("Garmin returned invalid token expiry");
      return redirect("failed", target);
    }

    // Refresh buffer of up to 10 minutes.
    const expiresAt = new Date(
      Date.now() + Math.max(1, expiresIn - 600) * 1000,
    );

    // Store credentials in the private database schema.
    // No tokens are returned to the browser.
    await sql`
      insert into private.mile_garmin_connections (
        user_id,
        access_token,
        refresh_token,
        token_type,
        scope,
        expires_at,
        connected_at,
        updated_at
      )
      values (
        ${userId},
        ${tokens.access_token},
        ${tokens.refresh_token},
        ${String(tokens.token_type ?? "Bearer")},
        ${String(tokens.scope ?? "")},
        ${expiresAt.toISOString()},
        now(),
        now()
      )
      on conflict (user_id)
      do update set
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        updated_at = now()
    `;

    console.info("Garmin OAuth connection saved");
    return redirect("connected", target);

  } catch (err) {
    // Never log token responses or authorization credentials.
    console.error(
      "Garmin callback failed",
      err instanceof Error ? err.name : "Unknown error",
    );

    return redirect("failed", target);

  } finally {
    await sql.end();
  }
});
