// Supabase Edge Function: selfie-verify
//
// The fallback verification path for devices without a fingerprint/Face ID
// sensor. The actual face descriptor (a 128-number vector, not the photo
// itself) is computed client-side by face-api.js, running entirely in the
// browser — this function only ever receives that small numeric vector,
// plus (separately) the selfie image itself for the audit trail. The
// comparison against the student's stored reference descriptor happens via
// verify_face_match() (migration 0014), a SECURITY DEFINER function — the
// reference descriptor itself is never sent back to the client.
//
// Deploy with:
//   supabase functions deploy selfie-verify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Your session has expired. Please log in again.' }, 401);

    const body = await req.json().catch(() => null);
    const { descriptor, selfieDataUrl } = body ?? {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return json({ error: 'Invalid or missing face data. Please retake the selfie.' }, 400);
    }

    // The comparison itself — a plain distance calculation against the
    // stored reference, done server-side so the reference descriptor never
    // has to be exposed to the client for a client-side comparison.
    const authedAdmin = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: matchRows, error: matchError } = await authedAdmin.rpc('verify_face_match', { fresh_descriptor: JSON.stringify(descriptor) });
    if (matchError) return json({ error: matchError.message }, 400);

    const result = matchRows?.[0];
    if (!result?.matched) {
      return json({ verified: false, distance: result?.distance ?? null, error: "This doesn't look like a match. Please retake the selfie in good lighting, facing the camera directly." }, 200);
    }

    // Best-effort: upload the selfie for the audit trail. A storage
    // failure here shouldn't block a legitimate, verified check-in — the
    // student already passed the actual security check above. This bucket
    // is private (like appeal-files); only the storage PATH is stored —
    // the frontend generates a short-lived signed URL on demand whenever a
    // coordinator actually opens it, same pattern as appeal evidence.
    let selfiePath: string | null = null;
    if (typeof selfieDataUrl === 'string' && selfieDataUrl.startsWith('data:image/')) {
      try {
        const base64 = selfieDataUrl.split(',')[1];
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `${userData.user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await admin.storage.from('checkin-selfies').upload(path, bytes, { contentType: 'image/jpeg' });
        if (!uploadError) selfiePath = path;
      } catch {
        // swallow — see comment above
      }
    }

    const passToken = crypto.randomUUID();
    await admin
      .from('students')
      .update({ checkin_verification_pass: passToken, checkin_verification_pass_expires: new Date(Date.now() + 60_000).toISOString() })
      .eq('id', userData.user.id);

    return json({ verified: true, passToken, distance: result.distance, selfiePath });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to verify. An unexpected error occurred.' }, 500);
  }
});
