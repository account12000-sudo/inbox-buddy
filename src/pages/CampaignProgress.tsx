import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: string;
  interval_seconds: number;
  total_recipients: number;
  sent_count: number;
}

interface QueueItem {
  id: string;
  recipient_email: string;
  status: string;
}

interface SmtpSettings {
  host: string;
  port: string;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  encryption: 'tls' | 'ssl' | 'none';
}

const STORAGE_KEY = 'smtp_settings';

export default function CampaignProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings | null>(null);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // Load SMTP settings
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (settings.host && settings.port && settings.username && settings.password && settings.fromEmail) {
          setSmtpSettings(settings);
        } else {
          setSmtpError('SMTP settings are incomplete. Please configure in Settings.');
        }
      } catch (e) {
        setSmtpError('Failed to load SMTP settings. Please configure in Settings.');
      }
    } else {
      setSmtpError('SMTP not configured. Please set up your email server in Settings.');
    }
  }, []);

  const fetchCampaign = useCallback(async () => {
    if (!id || !user) return;

    try {
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      const { data: queueData, error: queueError } = await supabase
        .from('email_queue')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: true });

      if (queueError) throw queueError;
      setQueue(queueData || []);
    } catch (error) {
      console.error('Error fetching campaign:', error);
      toast.error('Failed to load campaign');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, user, navigate]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Send email via edge function
  const sendEmail = useCallback(async (queueItem: QueueItem) => {
    if (!campaign || !smtpSettings || !session) return false;

    setSendingEmail(queueItem.recipient_email);

    try {
      const response = await supabase.functions.invoke('send-email', {
        body: {
          queueItemId: queueItem.id,
          campaignId: campaign.id,
          recipientEmail: queueItem.recipient_email,
          subject: campaign.subject,
          body: campaign.body,
          smtp: {
            host: smtpSettings.host,
            port: parseInt(smtpSettings.port),
            username: smtpSettings.username,
            password: smtpSettings.password,
            fromEmail: smtpSettings.fromEmail,
            fromName: smtpSettings.fromName,
            encryption: smtpSettings.encryption,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'Failed to send email');
      }

      // Update local state
      setQueue((prev) =>
        prev.map((q) => (q.id === queueItem.id ? { ...q, status: 'sent' } : q))
      );
      setCampaign((prev) =>
        prev ? { ...prev, sent_count: prev.sent_count + 1 } : null
      );

      return true;
    } catch (error: any) {
      console.error('Error sending email:', error);
      setQueue((prev) =>
        prev.map((q) => (q.id === queueItem.id ? { ...q, status: 'failed' } : q))
      );
      toast.error(`Failed to send to ${queueItem.recipient_email}: ${error.message}`);
      return false;
    } finally {
      setSendingEmail(null);
    }
  }, [campaign, smtpSettings, session]);

  // Process email queue
  const processQueue = useCallback(async () => {
    if (!campaign || campaign.status !== 'running' || !smtpSettings) return;

    const pendingEmails = queue.filter((q) => q.status === 'pending');
    
    if (pendingEmails.length === 0) {
      // Campaign complete
      await supabase
        .from('campaigns')
        .update({ status: 'completed' })
        .eq('id', campaign.id);
      setCampaign((prev) => prev ? { ...prev, status: 'completed' } : null);
      toast.success('Campaign completed!');
      isRunningRef.current = false;
      return;
    }

    const nextEmail = pendingEmails[0];
    await sendEmail(nextEmail);

    // Schedule next email
    if (isRunningRef.current) {
      timerRef.current = window.setTimeout(() => {
        processQueue();
      }, campaign.interval_seconds * 1000);
    }
  }, [campaign, queue, smtpSettings, sendEmail]);

  // Start/stop the queue processor
  useEffect(() => {
    if (campaign?.status === 'running' && smtpSettings && !isRunningRef.current) {
      isRunningRef.current = true;
      processQueue();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [campaign?.status, smtpSettings, processQueue]);

  const handlePause = async () => {
    if (!campaign) return;
    isRunningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id);
    setCampaign((prev) => prev ? { ...prev, status: 'paused' } : null);
    toast.info('Campaign paused');
  };

  const handleResume = async () => {
    if (!campaign) return;
    await supabase.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);
    setCampaign((prev) => prev ? { ...prev, status: 'running' } : null);
    isRunningRef.current = true;
    toast.success('Campaign resumed');
    processQueue();
  };

  const handleStop = async () => {
    if (!campaign) return;
    isRunningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
    setCampaign((prev) => prev ? { ...prev, status: 'completed' } : null);
    toast.info('Campaign stopped');
  };

  if (loading) {
    return (
      <AppLayout title="Campaign Progress">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!campaign) {
    return (
      <AppLayout title="Campaign Progress">
        <p>Campaign not found</p>
      </AppLayout>
    );
  }

  const progress = campaign.total_recipients > 0
    ? (campaign.sent_count / campaign.total_recipients) * 100
    : 0;

  const sentEmails = queue.filter((q) => q.status === 'sent');
  const pendingEmails = queue.filter((q) => q.status === 'pending');
  const failedEmails = queue.filter((q) => q.status === 'failed');

  return (
    <AppLayout title="Campaign Progress">
      <div className="max-w-4xl space-y-6">
        {/* SMTP Warning */}
        {smtpError && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 text-warning border border-warning/20">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">SMTP Configuration Required</p>
              <p className="text-sm opacity-80">{smtpError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              Go to Settings
            </Button>
          </div>
        )}

        {/* Campaign Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{campaign.name}</CardTitle>
                <CardDescription>{campaign.subject}</CardDescription>
              </div>
              <Badge
                variant={
                  campaign.status === 'running'
                    ? 'default'
                    : campaign.status === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {campaign.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {campaign.sent_count} of {campaign.total_recipients} sent
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              {campaign.status === 'running' && (
                <>
                  <Button variant="outline" onClick={handlePause}>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </Button>
                  <Button variant="destructive" onClick={handleStop}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                </>
              )}
              {campaign.status === 'paused' && (
                <>
                  <Button onClick={handleResume} disabled={!smtpSettings}>
                    <Play className="mr-2 h-4 w-4" />
                    Resume
                  </Button>
                  <Button variant="destructive" onClick={handleStop}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                </>
              )}
              {campaign.status === 'completed' && (
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  Back to Dashboard
                </Button>
              )}
              {campaign.status === 'draft' && smtpSettings && (
                <Button onClick={handleResume}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Campaign
                </Button>
              )}
            </div>

            {/* Current sending indicator */}
            {sendingEmail && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">Sending to {sendingEmail}...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{sentEmails.length}</p>
                  <p className="text-sm text-muted-foreground">Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingEmails.length}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{failedEmails.length}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Email Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Email Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <span className="text-sm">{item.recipient_email}</span>
                  <Badge
                    variant={
                      item.status === 'sent'
                        ? 'default'
                        : item.status === 'failed'
                        ? 'destructive'
                        : item.status === 'sending'
                        ? 'outline'
                        : 'secondary'
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
