import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

const statusColors = {
  sent: 'bg-primary/10 text-primary',
  opened: 'bg-success/10 text-success',
  clicked: 'bg-accent/10 text-accent-foreground',
  bounced: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent activity yet. Start a campaign to see emails here.
          </p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{activity.recipient}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {activity.subject}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge
                    variant="secondary"
                    className={statusColors[activity.status]}
                  >
                    {activity.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.sentAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
