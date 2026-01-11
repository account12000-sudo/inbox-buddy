import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  FileText,
  Upload,
  Clipboard,
  X,
  AlertTriangle,
  Loader2,
  Play,
} from 'lucide-react';

const intervalOptions = [
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
];

export default function NewCampaign() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [interval, setInterval] = useState('60');
  const [emails, setEmails] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [pasteInput, setPasteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Check for duplicates when emails change
  useEffect(() => {
    if (!user || emails.length === 0) {
      setDuplicates([]);
      return;
    }

    const checkDuplicates = async () => {
      setCheckingDuplicates(true);
      try {
        const { data } = await supabase
          .from('sent_emails')
          .select('recipient_email')
          .eq('user_id', user.id)
          .in('recipient_email', emails);

        const existingEmails = (data || []).map((d) => d.recipient_email);
        setDuplicates(existingEmails);
      } catch (error) {
        console.error('Error checking duplicates:', error);
      } finally {
        setCheckingDuplicates(false);
      }
    };

    checkDuplicates();
  }, [emails, user]);

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim().toLowerCase());
  };

  const processEmails = (input: string): string[] => {
    const lines = input.split(/[\n,;]+/);
    const validEmails: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const email = line.trim().toLowerCase();
      if (email && validateEmail(email) && !seen.has(email)) {
        validEmails.push(email);
        seen.add(email);
      }
    }

    return validEmails;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const newEmails = processEmails(content);
      setEmails((prev) => {
        const combined = [...prev, ...newEmails];
        return [...new Set(combined)];
      });
      toast.success(`Added ${newEmails.length} emails from file`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePaste = () => {
    const newEmails = processEmails(pasteInput);
    setEmails((prev) => {
      const combined = [...prev, ...newEmails];
      return [...new Set(combined)];
    });
    setPasteInput('');
    toast.success(`Added ${newEmails.length} emails`);
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const removeDuplicates = () => {
    setEmails((prev) => prev.filter((e) => !duplicates.includes(e)));
  };

  const handleStartCampaign = async () => {
    if (!user) return;

    if (!subject.trim()) {
      toast.error('Please enter a subject line');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter an email body');
      return;
    }

    const validEmails = emails.filter((e) => !duplicates.includes(e));
    if (validEmails.length === 0) {
      toast.error('No valid emails to send to');
      return;
    }

    setLoading(true);
    try {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
          subject,
          body,
          interval_seconds: parseInt(interval),
          total_recipients: validEmails.length,
          status: 'running',
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Add emails to queue
      const queueItems = validEmails.map((email) => ({
        campaign_id: campaign.id,
        recipient_email: email,
        status: 'pending' as const,
      }));

      const { error: queueError } = await supabase
        .from('email_queue')
        .insert(queueItems);

      if (queueError) throw queueError;

      toast.success('Campaign started!');
      navigate(`/campaign/${campaign.id}`);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast.error(error.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const validCount = emails.filter((e) => !duplicates.includes(e)).length;

  return (
    <AppLayout title="New Campaign">
      <div className="max-w-4xl space-y-6">
        {/* Campaign Name */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>Give your campaign a name to identify it later</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign Name (optional)</Label>
              <Input
                id="campaignName"
                placeholder="e.g., January Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Email Composer */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Compose Email</CardTitle>
                <CardDescription>Write your email message</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                placeholder="Your compelling subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Message Body</Label>
              <Textarea
                id="body"
                placeholder="Write your email message here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Import Contacts</CardTitle>
                <CardDescription>
                  Add recipient emails from a file or paste them directly
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Upload TXT or CSV file</p>
                <p className="text-xs text-muted-foreground">
                  One email per line
                </p>
              </label>
            </div>

            {/* Paste Area */}
            <div className="space-y-2">
              <Label>Or paste emails directly</Label>
              <div className="flex gap-2">
                <Textarea
                  placeholder="paste@email.com&#10;another@email.com&#10;..."
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  rows={4}
                  className="resize-none flex-1"
                />
                <Button onClick={handlePaste} variant="outline" className="shrink-0">
                  <Clipboard className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Email List */}
            {emails.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {validCount} valid email{validCount !== 1 ? 's' : ''} to send
                    {checkingDuplicates && (
                      <Loader2 className="inline ml-2 h-4 w-4 animate-spin" />
                    )}
                  </p>
                  {duplicates.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeDuplicates}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''}
                    </Button>
                  )}
                </div>

                {duplicates.length > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {duplicates.length} email{duplicates.length !== 1 ? 's have' : ' has'} already been sent to before
                    </span>
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto border rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {emails.map((email) => {
                      const isDuplicate = duplicates.includes(email);
                      return (
                        <Badge
                          key={email}
                          variant={isDuplicate ? 'destructive' : 'secondary'}
                          className="flex items-center gap-1"
                        >
                          {email}
                          <button
                            onClick={() => removeEmail(email)}
                            className="ml-1 hover:bg-foreground/10 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sending Options */}
        <Card>
          <CardHeader>
            <CardTitle>Sending Options</CardTitle>
            <CardDescription>
              Set the interval between each email to avoid spam filters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs">
              <Label>Interval between emails</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Start Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleStartCampaign}
            disabled={loading || validCount === 0}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Start Campaign ({validCount} emails)
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
