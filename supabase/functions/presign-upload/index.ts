// Edge Function: presign-upload
// Mints a short-lived presigned PUT URL for uploading an attachment to R2,
// and returns the permanent public URL the browser should store on the ticket.
//
// Secrets (set via `supabase secrets set` — NEVER committed):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET, R2_PUBLIC_BASE_URL   (e.g. https://pub-xxxx.r2.dev)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.
//
// The browser never sees R2 credentials — only a one-time signed URL.

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // Explicit list covers older browsers; the trailing "*" future-proofs against
  // additional headers the Supabase client adds (e.g. x-supabase-api-version).
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, *",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap

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
    // 1) Require an authenticated Supabase user (verify the caller's JWT).
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing authorization" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
    });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);

    // 2) Validate input.
    const { filename, contentType, size } = await req.json().catch(() => ({}));
    if (!filename || !contentType) {
      return json({ error: "filename and contentType are required" }, 400);
    }
    if (!String(contentType).startsWith("image/")) {
      return json({ error: `Only image uploads are allowed (got ${contentType})` }, 415);
    }
    if (typeof size === "number" && size > MAX_BYTES) {
      return json({ error: "File too large (max 10 MB)" }, 413);
    }

    // 3) Build a random, unguessable object key under the project folder.
    //    R2_KEY_PREFIX (e.g. "TicketSystem/") namespaces this app inside a shared bucket.
    const prefix = (Deno.env.get("R2_KEY_PREFIX") || "").replace(/^\/+/, "");
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const key = `${prefix}${crypto.randomUUID()}/${safe}`;

    // 4) Presign a PUT URL against the R2 S3 endpoint (valid ~5 min).
    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucket = Deno.env.get("R2_BUCKET")!;
    const publicBase = Deno.env.get("R2_PUBLIC_BASE_URL")!.replace(/\/$/, "");
    const r2 = new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      region: "auto",
      service: "s3",
    });
    const endpoint =
      `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}?X-Amz-Expires=300`;
    const signed = await r2.sign(new Request(endpoint, { method: "PUT" }), {
      aws: { signQuery: true },
    });

    return json({
      uploadUrl: signed.url,
      publicUrl: `${publicBase}/${key}`,
      key,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
