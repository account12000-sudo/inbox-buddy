import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


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

function toBase64(value: string): string {
  // Credentials are ASCII in almost all SMTP setups; btoa is sufficient here.
  return btoa(value);
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]/g, " ");
}

function normalizeCrlf(value: string): string {
  return value.replace(/\r?\n/g, "\r\n");
}

function dotStuff(valueCrlf: string): string {
  // RFC 5321 dot-stuffing
  return valueCrlf.replace(/(^|\r\n)\./g, "$1..");
}

class SmtpWire {
  private conn: Deno.Conn;
  private pending = "";
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private readonly readBuf = new Uint8Array(4096);

  constructor(conn: Deno.Conn, private hostname: string) {
    this.conn = conn;
  }

  close() {
    try {
      this.conn.close();
    } catch {
      // ignore
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const nl = this.pending.indexOf("\n");
      if (nl >= 0) {
        const line = this.pending.slice(0, nl + 1);
        this.pending = this.pending.slice(nl + 1);
        return line.replace(/\r?\n$/, "");
      }

      const n = await this.conn.read(this.readBuf);
      if (n === null) throw new Error("SMTP connection closed");
      this.pending += this.decoder.decode(this.readBuf.subarray(0, n));
    }
  }

  private async readResponse(): Promise<{ code: number; raw: string }> {
    const first = await this.readLine();
    const codeStr = first.slice(0, 3);
    const code = Number(codeStr);
    if (!Number.isFinite(code)) {
      throw new Error(`SMTP invalid response: ${first}`);
    }

    const lines = [first];

    // Multiline response: "250-..." then ends with "250 ..."
    if (first[3] === "-") {
      while (true) {
        const line = await this.readLine();
        lines.push(line);
        if (line.startsWith(`${codeStr} `)) break;
      }
    }

    return { code, raw: lines.join("\n") };
  }

  private assertExpected(
    res: { code: number; raw: string },
    expected: number | number[],
    context: string,
  ) {
    const ok = Array.isArray(expected)
      ? expected.includes(res.code)
      : res.code === expected;

    if (!ok) {
      throw new Error(`SMTP unexpected response for ${context}: got ${res.code}\n${res.raw}`);
    }
  }

  async readExpected(expected: number | number[], context = "response"): Promise<void> {
    const res = await this.readResponse();
    this.assertExpected(res, expected, context);
  }

  async cmd(command: string, expected: number | number[]): Promise<void> {
    await this.conn.write(this.encoder.encode(`${command}\r\n`));
    await this.readExpected(expected, command);
  }

  async writeRaw(data: string): Promise<void> {
    await this.conn.write(this.encoder.encode(data));
  }

  async startTls(): Promise<void> {
    const tlsConn = await Deno.startTls(this.conn as Deno.TcpConn, {
      hostname: this.hostname,
    });
    this.conn = tlsConn;
    this.pending = "";
  }
}

async function sendEmailViaSMTP(smtp: SmtpConfig, to: string, subject: string, body: string) {
  const fromEmail = smtp.fromEmail.trim();
  const recipientEmail = to.trim();

  if (!isValidEmail(fromEmail)) {
    throw new Error("Invalid sender email (From Email)");
  }
  if (!isValidEmail(recipientEmail)) {
    throw new Error("Invalid recipient email");
  }
  if (!smtp.host || !smtp.port || !smtp.username || !smtp.password) {
    throw new Error("Incomplete SMTP settings");
  }

  const conn = smtp.encryption === "ssl"
    ? await Deno.connectTls({ hostname: smtp.host, port: smtp.port })
    : await Deno.connect({ hostname: smtp.host, port: smtp.port });

  const wire = new SmtpWire(conn, smtp.host);

  try {
    // Server greeting (must be read before sending any commands)
    await wire.readExpected(220, "greeting");

    await wire.cmd("EHLO localhost", 250);

    if (smtp.encryption === "tls") {
      await wire.cmd("STARTTLS", 220);
      await wire.startTls();
      await wire.cmd("EHLO localhost", 250);
    }

    // AUTH (prefer LOGIN, fallback to PLAIN)
    try {
      await wire.cmd("AUTH LOGIN", 334);
      await wire.cmd(toBase64(smtp.username), 334);
      await wire.cmd(toBase64(smtp.password), 235);
    } catch {
      const plain = toBase64(`\u0000${smtp.username}\u0000${smtp.password}`);
      await wire.cmd(`AUTH PLAIN ${plain}`, [235, 503]);
    }

    await wire.cmd(`MAIL FROM:<${fromEmail}>`, 250);
    await wire.cmd(`RCPT TO:<${recipientEmail}>`, [250, 251]);
    await wire.cmd("DATA", 354);

    const sanitizedHtml = sanitizeHtml(body);
    const htmlCrlf = dotStuff(normalizeCrlf(sanitizedHtml));

    const fromName = smtp.fromName?.trim();
    const fromHeader = fromName
      ? `"${escapeHeaderValue(fromName)}" <${fromEmail}>`
      : fromEmail;

    const message = [
      `From: ${fromHeader}`,
      `To: <${recipientEmail}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      htmlCrlf,
      "",
    ].join("\r\n");

    await wire.writeRaw(`${message}\r\n.\r\n`);
    await wire.readExpected(250, "end-of-data");

    await wire.cmd("QUIT", 221);

    return { success: true };
  } finally {
    wire.close();
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
      try {
        await sendEmailViaSMTP(smtp, recipientEmail, subject, body);
        console.log("Test email sent successfully");
        return new Response(
          JSON.stringify({ success: true, message: "Test email sent successfully" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (smtpError: unknown) {
        const errorMessage = smtpError instanceof Error ? smtpError.message : "SMTP error";
        console.error("SMTP error (test):", errorMessage);
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Campaign mode - full tracking
    if (!queueItemId || !campaignId) {
      return new Response(
        JSON.stringify({ success: false, error: "queueItemId and campaignId required for campaign emails" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Ensure the campaign belongs to the authenticated user (service-role client bypasses RLS)
    const { data: ownedCampaign, error: ownedCampaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownedCampaignError || !ownedCampaign) {
      return new Response(
        JSON.stringify({ success: false, error: "Campaign not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Ensure queue item belongs to the campaign
    const { data: queueItem, error: queueItemError } = await supabase
      .from("email_queue")
      .select("id, status")
      .eq("id", queueItemId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (queueItemError || !queueItem) {
      return new Response(
        JSON.stringify({ success: false, error: "Queue item not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // If already finalized, don't send again
    if (queueItem.status === "sent" || queueItem.status === "skipped") {
      return new Response(
        JSON.stringify({ success: true, message: "Already processed", skipped: queueItem.status === "skipped" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already sent to this recipient before (global duplicate protection per user)
    const { data: existingSent } = await supabase
      .from("sent_emails")
      .select("id")
      .eq("user_id", user.id)
      .eq("recipient_email", recipientEmail)
      .eq("status", "sent")
      .maybeSingle();

    if (existingSent) {
      console.log(`Duplicate detected - already sent to ${recipientEmail} before`);

      // Mark as skipped in queue (don't increment sent_count)
      await supabase
        .from("email_queue")
        .update({ status: "skipped" })
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
