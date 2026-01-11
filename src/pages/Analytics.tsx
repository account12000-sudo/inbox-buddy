import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Send, Mail, MousePointerClick, TrendingUp, Loader2 } from 'lucide-react';

const COLORS = ['hsl(220, 70%, 50%)', 'hsl(160, 60%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'];

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    openRate: 0,
    clickRate: 0,
  });
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; sent: number }[]>([]);

  useEffect(() => {
    if (!user) return;

    async function fetchAnalytics() {
      try {
        // Fetch all sent emails
        const { data: emails, error } = await supabase
          .from('sent_emails')
          .select('status, sent_at')
          .eq('user_id', user.id);

        if (error) throw error;

        const total = emails?.length || 0;
        const opened = emails?.filter((e) => e.status === 'opened').length || 0;
        const clicked = emails?.filter((e) => e.status === 'clicked').length || 0;
        const bounced = emails?.filter((e) => e.status === 'bounced').length || 0;
        const failed = emails?.filter((e) => e.status === 'failed').length || 0;
        const sent = total - opened - clicked - bounced - failed;

        setStats({
          totalSent: total,
          totalOpened: opened + clicked,
          totalClicked: clicked,
          openRate: total > 0 ? Math.round(((opened + clicked) / total) * 100) : 0,
          clickRate: total > 0 ? Math.round((clicked / total) * 100) : 0,
        });

        setStatusData([
          { name: 'Sent', value: sent },
          { name: 'Opened', value: opened },
          { name: 'Clicked', value: clicked },
          { name: 'Failed', value: failed + bounced },
        ].filter((d) => d.value > 0));

        // Group by date for last 7 days
        const last7Days: Record<string, number> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          last7Days[date.toISOString().split('T')[0]] = 0;
        }

        emails?.forEach((e) => {
          const date = new Date(e.sent_at).toISOString().split('T')[0];
          if (date in last7Days) {
            last7Days[date]++;
          }
        });

        setDailyData(
          Object.entries(last7Days).map(([date, sent]) => ({
            date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
            sent,
          }))
        );
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [user]);

  if (loading) {
    return (
      <AppLayout title="Analytics">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Analytics">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Sent"
            value={stats.totalSent}
            icon={Send}
          />
          <StatsCard
            title="Open Rate"
            value={`${stats.openRate}%`}
            description={`${stats.totalOpened} opened`}
            icon={Mail}
          />
          <StatsCard
            title="Click Rate"
            value={`${stats.clickRate}%`}
            description={`${stats.totalClicked} clicked`}
            icon={MousePointerClick}
          />
          <StatsCard
            title="Engagement"
            value={`${stats.openRate + stats.clickRate}%`}
            description="Combined rate"
            icon={TrendingUp}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Sends Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Emails Sent (Last 7 Days)</CardTitle>
              <CardDescription>Daily email sending activity</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyData.every((d) => d.sent === 0) ? (
                <p className="text-center text-muted-foreground py-12">
                  No data available yet. Start sending emails to see analytics.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="sent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Email Status Distribution</CardTitle>
              <CardDescription>Breakdown by delivery status</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">
                  No data available yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
