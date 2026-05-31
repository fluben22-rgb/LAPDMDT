import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const secret = req.headers.get("x-roblox-secret");

    if (secret !== Deno.env.get("Update_Unit_Gps")) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const robloxUsername = String(body.roblox_username || "").trim();

    if (!robloxUsername) {
      return Response.json(
        { success: false, error: "Missing roblox_username" },
        { status: 400 },
      );
    }

    const x = Number(body.x);
    const y = Number(body.y);
    const z = Number(body.z);
    const heading = Number(body.heading || 0);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return Response.json(
        { success: false, error: "Invalid GPS coordinates" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("units")
      .update({
        gps_x: x,
        gps_y: y,
        gps_z: z,
        gps_heading: heading,
        gps_updated_at: new Date().toISOString(),
      })
      .ilike("roblox_username", robloxUsername)
      .select("user, unit, roblox_username");

    if (error) throw error;

    return Response.json({
      success: true,
      updated: Array.isArray(data) ? data.length : 0,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { success: false, error: String(err?.message || err) },
      { status: 500 },
    );
  }
});
