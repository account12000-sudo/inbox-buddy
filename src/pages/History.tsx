import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Search, Download, Loader2 } from 'lucide-react';

interface SentEmail {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
}

const statusColors: Record<string, string> = {
  sent: 'bg-primary/10 text-primary',
  opened: 'bg-success/10 text-success',
  clicked: 'bg-accent/10 text-accent-foreground',
  bounced: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
};

export default function History() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    if (!user) return;

    async function fetchEmails() {
      setLoading(true);
      try {
        let query = supabase
          .from('sent_emails')
          .select('*')
          .eq('user_id', user.id)
          .order('sent_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (search) {
          query = query.ilike('recipient_email', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setEmails(data || []);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEmails();
  }, [user, page, search]);

  const handleExport = () => {
    const csv = [
      ['Email', 'Subject', 'Status', 'Sent At', 'Opened At', 'Clicked At'].join(','),
      ...emails.map((e) =>
        [
          e.recipient_email,
          `"${e.subject.replace(/"/g, '""')}"`,
          e.status,
          e.sent_at,
          e.opened_at || '',
          e.clicked_at || '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Email History">
      <div className="space-y-6">
        {/* Search and Actions */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email address..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={handleExport} disabled={emails.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Sent Emails</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : emails.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                {search ? 'No emails found matching your search.' : 'No emails sent yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Recipient
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Subject
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Sent At
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((email) => (
                      <tr key={email.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <span className="font-medium">{email.recipient_email}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-muted-foreground truncate max-w-xs block">
                            {email.subject}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className={statusColors[email.status]}>
                            {email.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {format(new Date(email.sent_at), 'MMM d, yyyy h:mm a')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {emails.length >= pageSize && (
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={emails.length < pageSize}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
