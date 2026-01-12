import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrackEventRequest {
  token: string;
  eventType: "open" | "click";
  linkUrl?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, eventType, linkUrl }: TrackEventRequest = await req.json();

    // Validate required fields
    if (!token || !eventType) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token or eventType" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate event type
    if (!["open", "click"].includes(eventType)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid event type" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate token format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate link URL format if provided
    if (linkUrl) {
      try {
        new URL(linkUrl);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid link URL format" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Find sent email by tracking token
    const { data: sentEmail, error: findError } = await supabase
      .from("sent_emails")
      .select("id")
      .eq("tracking_token", token)
      .maybeSingle();

    if (findError) {
      console.error("Error finding sent email:", findError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!sentEmail) {
      // Invalid token - don't reveal if token exists or not
      return new Response(
        JSON.stringify({ success: true }), // Return success to not leak info
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get request metadata
    const userAgent = req.headers.get("user-agent") || null;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    // Insert tracking event using service role (bypasses RLS)
    const { error: insertError } = await supabase
      .from("tracking_events")
      .insert({
        sent_email_id: sentEmail.id,
        event_type: eventType,
        link_url: linkUrl || null,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error("Error inserting tracking event:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to record event" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update sent_emails timestamps
    const updateData: Record<string, string> = {};
    if (eventType === "open") {
      updateData.opened_at = new Date().toISOString();
    } else if (eventType === "click") {
      updateData.clicked_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      await supabase
        .from("sent_emails")
        .update(updateData)
        .eq("id", sentEmail.id)
        .is(eventType === "open" ? "opened_at" : "clicked_at", null); // Only update if not already set
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in track-event function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
