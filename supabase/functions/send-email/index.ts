import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  encryption: "tls" | "ssl" | "none";
}

interface SendEmailRequest {
  queueItemId?: string;
  campaignId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  smtp: SmtpConfig;
  testMode?: boolean;
}

async function sendEmailViaSMTP(smtp: SmtpConfig, to: string, subject: string, body: string) {
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
    await client.send({
      from: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail,
      to: to,
      subject: subject,
      content: body,
      html: body.replace(/\n/g, "<br>"),
    });
    await client.close();
    return { success: true };
  } catch (error: any) {
    await client.close();
    throw error;
  }
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

    const { queueItemId, campaignId, recipientEmail, subject, body, smtp, testMode }: SendEmailRequest = await req.json();

    console.log(`Processing email request - testMode: ${testMode}, recipient: ${recipientEmail}`);

    // Validate SMTP config
    if (!smtp.host || !smtp.port || !smtp.username || !smtp.password || !smtp.fromEmail) {
      throw new Error("Invalid SMTP configuration");
    }

    // Test mode - just send email without database updates
    if (testMode) {
      console.log("Test mode - sending test email");
      await sendEmailViaSMTP(smtp, recipientEmail, subject, body);
      console.log("Test email sent successfully");
      return new Response(
        JSON.stringify({ success: true, message: "Test email sent successfully" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Campaign mode - full tracking
    if (!queueItemId || !campaignId) {
      throw new Error("queueItemId and campaignId required for campaign emails");
    }

    // Check if already sent to this recipient in this campaign (duplicate protection)
    const { data: existingSent } = await supabase
      .from("sent_emails")
      .select("id")
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .eq("recipient_email", recipientEmail)
      .maybeSingle();

    if (existingSent) {
      console.log(`Duplicate detected - already sent to ${recipientEmail} in campaign ${campaignId}`);
      // Mark as sent in queue (skip duplicate)
      await supabase
        .from("email_queue")
        .update({ status: "sent" })
        .eq("id", queueItemId);
      
      return new Response(
        JSON.stringify({ success: true, message: "Duplicate skipped", skipped: true }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Mark queue item as sending
    await supabase
      .from("email_queue")
      .update({ status: "sending" })
      .eq("id", queueItemId);

    try {
      console.log(`Sending email to ${recipientEmail}`);
      await sendEmailViaSMTP(smtp, recipientEmail, subject, body);
      console.log("Email sent successfully");

      // Mark as sent in queue
      await supabase
        .from("email_queue")
        .update({ status: "sent" })
        .eq("id", queueItemId);

      // Record in sent_emails
      await supabase.from("sent_emails").insert({
        user_id: user.id,
        campaign_id: campaignId,
        recipient_email: recipientEmail,
        subject: subject,
        status: "sent",
      });

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
      console.error("SMTP error:", smtpError);
      
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