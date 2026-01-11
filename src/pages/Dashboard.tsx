import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Mail, MousePointerClick, Users, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalSent: 0,
    openRate: 0,
    clickRate: 0,
    totalContacts: 0,
  });
  const [recentEmails, setRecentEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      try {
        // Fetch sent emails count
        const { count: sentCount } = await supabase
          .from('sent_emails')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        // Fetch opened count
        const { count: openedCount } = await supabase
          .from('sent_emails')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'opened');

        // Fetch clicked count
        const { count: clickedCount } = await supabase
          .from('sent_emails')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'clicked');

        // Fetch recent emails
        const { data: recent } = await supabase
          .from('sent_emails')
          .select('*')
          .eq('user_id', user.id)
          .order('sent_at', { ascending: false })
          .limit(5);

        const total = sentCount || 0;
        const openRate = total > 0 ? Math.round(((openedCount || 0) / total) * 100) : 0;
        const clickRate = total > 0 ? Math.round(((clickedCount || 0) / total) * 100) : 0;

        setStats({
          totalSent: total,
          openRate,
          clickRate,
          totalContacts: total,
        });

        setRecentEmails(
          (recent || []).map((e) => ({
            id: e.id,
            recipient: e.recipient_email,
            subject: e.subject,
            status: e.status,
            sentAt: e.sent_at,
          }))
        );
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back!</h2>
            <p className="text-muted-foreground">
              Here's what's happening with your campaigns.
            </p>
          </div>
          <Button asChild>
            <Link to="/campaign/new">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Sent"
            value={stats.totalSent}
            description="All time emails sent"
            icon={Send}
          />
          <StatsCard
            title="Open Rate"
            value={`${stats.openRate}%`}
            description="Emails opened"
            icon={Mail}
          />
          <StatsCard
            title="Click Rate"
            value={`${stats.clickRate}%`}
            description="Links clicked"
            icon={MousePointerClick}
          />
          <StatsCard
            title="Contacts"
            value={stats.totalContacts}
            description="Unique recipients"
            icon={Users}
          />
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <RecentActivity activities={recentEmails} />

          {/* Quick Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div>
                  <p className="font-medium">Configure SMTP Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Go to Settings and add your email server credentials.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div>
                  <p className="font-medium">Create Your First Campaign</p>
                  <p className="text-sm text-muted-foreground">
                    Compose your email and import your contact list.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <div>
                  <p className="font-medium">Start Sending</p>
                  <p className="text-sm text-muted-foreground">
                    Set your interval and launch your campaign.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
