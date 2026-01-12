-- Create table for user SMTP settings (stored server-side, not in localStorage)
CREATE TABLE public.user_smtp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  encryption TEXT NOT NULL DEFAULT 'tls',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_smtp_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own SMTP settings" 
ON public.user_smtp_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMTP settings" 
ON public.user_smtp_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMTP settings" 
ON public.user_smtp_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SMTP settings" 
ON public.user_smtp_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_smtp_settings_updated_at
BEFORE UPDATE ON public.user_smtp_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add tracking_token column to sent_emails for secure tracking
ALTER TABLE public.sent_emails 
ADD COLUMN tracking_token UUID DEFAULT gen_random_uuid();

-- Create index for faster tracking token lookups
CREATE INDEX idx_sent_emails_tracking_token ON public.sent_emails(tracking_token);

-- Drop the insecure public tracking insert policy
DROP POLICY IF EXISTS "Allow public tracking inserts" ON public.tracking_events;

-- Create a more restrictive policy - only edge function with service role can insert
-- Users can only read their own tracking events
CREATE POLICY "Only service role can insert tracking events"
ON public.tracking_events
FOR INSERT
WITH CHECK (false);

-- Note: The edge function will use service role key to insert tracking events
-- after validating the tracking token