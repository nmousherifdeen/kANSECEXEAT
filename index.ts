// supabase functions deploy admin-create-staff
// Secrets required (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (both auto-available as env vars in Supabase Edge Functions)
//
// Called from the app's Admin > Staff accounts panel with:
//   Authorization: Bearer <the calling admin's access_token>
//   body: { email, name, role: 'warden'|'gate'|'admin', house_id?, gate_post?, password? }

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace("Bearer ", "");
    if (!callerToken) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Client scoped to the caller's own JWT — used only to verify who is calling.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(callerToken);
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile } = await admin
      .from("staff_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Only admins can create staff accounts" }, 403);
    }

    const body = await req.json();
    const { email, name, role, house_id, gate_post } = body;
    const password = body.password || "changeme123";

    if (!email || !name || !role) {
      return json({ error: "email, name and role are required" }, 400);
    }
    if (!["warden", "gate", "admin"].includes(role)) {
      return json({ error: "role must be warden, gate or admin" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const { error: profileErr } = await admin.from("staff_profiles").insert({
      id: created.user.id,
      name,
      role,
      house_id: role === "warden" ? house_id || null : null,
      gate_post: role === "gate" ? gate_post || null : null,
      must_change_password: true,
    });
    if (profileErr) return json({ error: profileErr.message }, 400);

    return json({ ok: true, id: created.user.id, temp_password: password });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
