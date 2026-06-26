// Edge Function: delete-object
// Deletes an attachment object from R2 when it's removed from a ticket (or the
// ticket is deleted), so files don't orphan in the bucket.
//
// Authenticated (any signed-in user). Hard-scoped to keys under R2_KEY_PREFIX
// so it can never delete anything else in the shared bucket.
//
// Body: { url } (the public URL stored on the ticket) or { key }.
// Secrets: same R2_* as presign-upload (read server-side, never exposed).

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, *",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1) Require an authenticated Supabase user.
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing authorization" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
    });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);

    // 2) Resolve the object key (from a public URL or an explicit key).
    const { url, key: rawKey } = await req.json().catch(() => ({}));
    const publicBase = Deno.env.get("R2_PUBLIC_BASE_URL")!.replace(/\/$/, "");
    const prefix = (Deno.env.get("R2_KEY_PREFIX") || "").replace(/^\/+/, "");

    let key = rawKey || "";
    if (!key && url && String(url).startsWith(publicBase + "/")) {
      key = String(url).slice(publicBase.length + 1);
    }
    key = decodeURIComponent(String(key).replace(/^\/+/, ""));

    // 3) Safety: only ever delete inside this app's folder.
    if (!key || (prefix && !key.startsWith(prefix))) {
      return json({ error: "Refusing to delete outside the app folder" }, 400);
    }

    // 4) Signed DELETE to R2 (runs server-side; no presign needed).
    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucket = Deno.env.get("R2_BUCKET")!;
    const r2 = new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      region: "auto",
      service: "s3",
    });
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
    const res = await r2.fetch(endpoint, { method: "DELETE" });
    // R2 returns 204 on delete (and on a no-op delete of a missing key).
    if (!res.ok && res.status !== 204) {
      return json({ error: `delete failed (${res.status})` }, 502);
    }
    return json({ ok: true, key });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
