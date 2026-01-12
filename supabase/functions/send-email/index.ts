import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  queueItemId?: string;
  campaignId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  testMode?: boolean;
}

// Sanitize HTML to prevent XSS and injection attacks
function sanitizeHtml(input: string): string {
  // Escape HTML special characters
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
  
  // Convert newlines to <br> for HTML emails
  return escaped.replace(/\n/g, "<br>");
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Validate subject for header injection
function isValidSubject(subject: string): boolean {
  // Check for newlines or carriage returns (header injection)
  return !(/[\r\n]/.test(subject)) && subject.length <= 998;
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  encryption: "tls" | "ssl" | "none";
}

async function sendEmailViaSMTP(smtp: SmtpConfig, to: string, subject: string, body: string) {
  // Configure connection based on encryption type
  // - ssl: implicit TLS on port 465
  // - tls: STARTTLS upgrade on port 587/25
  // - none: no encryption
  const connectionConfig: {
    hostname: string;
    port: number;
    tls?: boolean;
    auth: { username: string; password: string };
  } = {
    hostname: smtp.host,
    port: smtp.port,
    auth: {
      username: smtp.username,
      password: smtp.password,
    },
  };

  // Only set tls: true for implicit SSL (port 465)
  // For STARTTLS (port 587), we don't set tls - denomailer handles STARTTLS automatically
  if (smtp.encryption === "ssl") {
    connectionConfig.tls = true;
  }

  const client = new SMTPClient({
    connection: connectionConfig,
  });

  let connected = false;
  
  try {
    // Sanitize body for HTML
    const sanitizedHtml = sanitizeHtml(body);
    
    await client.send({
      from: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail,
      to: to,
      subject: subject,
      content: body, // Plain text version
      html: sanitizedHtml, // Sanitized HTML version
    });
    connected = true;
    await client.close();
    return { success: true };
  } catch (error: unknown) {
    // Only try to close if connection was established
    if (connected) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
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
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { queueItemId, campaignId, recipientEmail, subject, body, testMode }: SendEmailRequest = await req.json();

    // Validate recipient email
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid recipient email" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate subject
    if (!subject || !isValidSubject(subject)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid subject" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate body
    if (!body || body.length > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get SMTP settings from database (not from client)
    const { data: smtpData, error: smtpError } = await supabase
      .from("user_smtp_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (smtpError || !smtpData) {
      return new Response(
        JSON.stringify({ success: false, error: "SMTP not configured. Please configure in Settings." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const smtp: SmtpConfig = {
      host: smtpData.host,
      port: smtpData.port,
      username: smtpData.username,
      password: smtpData.password,
      fromEmail: smtpData.from_email,
      fromName: smtpData.from_name || "",
      encryption: smtpData.encryption as "tls" | "ssl" | "none",
    };

    console.log(`Processing email request - testMode: ${testMode}, recipient: ${recipientEmail}`);

    // Test mode - just send email without database updates
    if (testMode) {
      console.log("Test mode - sending test email");
      await sendEmailViaSMTP(smtp, recipientEmail, subject, body);
      console.log("Test email sent successfully");
      return new Response(
        JSON.stringify({ success: true, message: "Test email sent successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Campaign mode - full tracking
    if (!queueItemId || !campaignId) {
      return new Response(
        JSON.stringify({ success: false, error: "queueItemId and campaignId required for campaign emails" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
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
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
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

      // Record in sent_emails with tracking token
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
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (smtpError: unknown) {
      const errorMessage = smtpError instanceof Error ? smtpError.message : "SMTP error";
      console.error("SMTP error:", errorMessage);
      
      // Mark as failed in queue
      await supabase
        .from("email_queue")
        .update({ status: "failed" })
        .eq("id", queueItemId);

      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-email function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: "An error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
