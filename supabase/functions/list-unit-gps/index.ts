import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("units")
      .select("user, unit, status, inc, incLocation, roblox_username, gps_x, gps_y, gps_z, gps_heading, gps_updated_at")
      .not("gps_x", "is", null)
      .order("gps_updated_at", { ascending: false })
      .limit(250);

    if (error) throw error;

    return Response.json(
      { success: true, units: Array.isArray(data) ? data : [] },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      },
    );
  } catch (err) {
    console.error(err);
    return Response.json(
      { success: false, error: String(err?.message || err) },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      },
    );
  }
});
