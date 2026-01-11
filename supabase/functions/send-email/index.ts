import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  queueItemId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  smtp: {
    host: string;
    port: number;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
    encryption: "tls" | "ssl" | "none";
  };
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header to verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { queueItemId, campaignId, recipientEmail, subject, body, smtp }: SendEmailRequest = await req.json();

    // Validate SMTP config
    if (!smtp.host || !smtp.port || !smtp.username || !smtp.password || !smtp.fromEmail) {
      throw new Error("Invalid SMTP configuration");
    }

    // Mark queue item as sending
    await supabase
      .from("email_queue")
      .update({ status: "sending" })
      .eq("id", queueItemId);

    // Configure SMTP client
    const client = new SMTPClient({
      connection: {
        hostname: smtp.host,
        port: smtp.port,
        tls: smtp.encryption === "ssl",
        auth: {
          username: smtp.username,
          password: smtp.password,
        },
      },
    });

    try {
      // Send the email
      await client.send({
        from: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail,
        to: recipientEmail,
        subject: subject,
        content: body,
        html: body.replace(/\n/g, "<br>"),
      });

      await client.close();

      // Mark as sent in queue
      await supabase
        .from("email_queue")
        .update({ status: "sent" })
        .eq("id", queueItemId);

      // Record in sent_emails (upsert to handle duplicates)
      await supabase.from("sent_emails").upsert(
        {
          user_id: user.id,
          campaign_id: campaignId,
          recipient_email: recipientEmail,
          subject: subject,
          status: "sent",
        },
        { onConflict: "user_id,recipient_email" }
      );

      // Update campaign sent count
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("sent_count")
        .eq("id", campaignId)
        .single();

      if (campaign) {
        await supabase
          .from("campaigns")
          .update({ sent_count: campaign.sent_count + 1 })
          .eq("id", campaignId);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Email sent successfully" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } catch (smtpError: any) {
      await client.close();
      
      // Mark as failed in queue
      await supabase
        .from("email_queue")
        .update({ status: "failed" })
        .eq("id", queueItemId);

      throw new Error(`SMTP error: ${smtpError.message}`);
    }
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
