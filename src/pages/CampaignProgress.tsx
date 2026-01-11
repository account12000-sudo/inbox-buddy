import { useState, useEffect, useCallback } from 'react';
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

export default function CampaignProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

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

  // Simulate sending emails (in real app, this would be done via edge function)
  useEffect(() => {
    if (!campaign || campaign.status !== 'running') return;

    const pendingEmails = queue.filter((q) => q.status === 'pending');
    if (pendingEmails.length === 0) {
      // Campaign complete
      supabase
        .from('campaigns')
        .update({ status: 'completed' })
        .eq('id', campaign.id);
      setCampaign((prev) => prev ? { ...prev, status: 'completed' } : null);
      toast.success('Campaign completed!');
      return;
    }

    const timer = setTimeout(async () => {
      const nextEmail = pendingEmails[0];
      if (!nextEmail || !user) return;

      setSendingEmail(nextEmail.recipient_email);

      try {
        // Mark as sending
        await supabase
          .from('email_queue')
          .update({ status: 'sent' })
          .eq('id', nextEmail.id);

        // Record in sent_emails (using upsert to handle duplicates)
        await supabase.from('sent_emails').upsert(
          {
            user_id: user.id,
            campaign_id: campaign.id,
            recipient_email: nextEmail.recipient_email,
            subject: campaign.subject,
            status: 'sent',
          },
          { onConflict: 'user_id,recipient_email' }
        );

        // Update campaign sent count
        await supabase
          .from('campaigns')
          .update({ sent_count: campaign.sent_count + 1 })
          .eq('id', campaign.id);

        // Update local state
        setQueue((prev) =>
          prev.map((q) => (q.id === nextEmail.id ? { ...q, status: 'sent' } : q))
        );
        setCampaign((prev) =>
          prev ? { ...prev, sent_count: prev.sent_count + 1 } : null
        );
      } catch (error) {
        console.error('Error sending email:', error);
        await supabase
          .from('email_queue')
          .update({ status: 'failed' })
          .eq('id', nextEmail.id);
        setQueue((prev) =>
          prev.map((q) => (q.id === nextEmail.id ? { ...q, status: 'failed' } : q))
        );
      } finally {
        setSendingEmail(null);
      }
    }, campaign.interval_seconds * 1000);

    return () => clearTimeout(timer);
  }, [campaign, queue, user]);

  const handlePause = async () => {
    if (!campaign) return;
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id);
    setCampaign((prev) => prev ? { ...prev, status: 'paused' } : null);
    toast.info('Campaign paused');
  };

  const handleResume = async () => {
    if (!campaign) return;
    await supabase.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);
    setCampaign((prev) => prev ? { ...prev, status: 'running' } : null);
    toast.success('Campaign resumed');
  };

  const handleStop = async () => {
    if (!campaign) return;
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
                  <Button onClick={handleResume}>
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
