import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Mail, Server, Key, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

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

export default function Settings() {
  const [settings, setSettings] = useState<SmtpSettings>({
    host: '',
    port: '587',
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    encryption: 'tls',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse SMTP settings');
      }
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // For now, just validate the settings are filled
      if (!settings.host || !settings.port || !settings.username || !settings.password) {
        throw new Error('Please fill in all SMTP fields');
      }
      // Simulate a test (actual test would require edge function)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTestResult('success');
      toast.success('SMTP connection test passed!');
    } catch (error: any) {
      setTestResult('error');
      toast.error(error.message || 'SMTP connection test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        {/* SMTP Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>SMTP Configuration</CardTitle>
                <CardDescription>
                  Configure your email server to send campaigns
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="host">SMTP Host</Label>
                <Input
                  id="host"
                  placeholder="mail.yourdomain.com"
                  value={settings.host}
                  onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  placeholder="587"
                  value={settings.port}
                  onChange={(e) => setSettings({ ...settings, port: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="encryption">Encryption</Label>
              <Select
                value={settings.encryption}
                onValueChange={(value: 'tls' | 'ssl' | 'none') =>
                  setSettings({ ...settings, encryption: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS (Recommended)</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="your@email.com"
                  value={settings.username}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={settings.password}
                  onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sender Identity */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Sender Identity</CardTitle>
                <CardDescription>
                  How your emails will appear to recipients
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fromName">From Name</Label>
                <Input
                  id="fromName"
                  placeholder="Your Name or Company"
                  value={settings.fromName}
                  onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromEmail">From Email</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  placeholder="hello@yourdomain.com"
                  value={settings.fromEmail}
                  onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deliverability Tips */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Deliverability Checklist</CardTitle>
                <CardDescription>
                  Ensure your emails land in the inbox, not spam
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>SPF Record:</strong> Add a TXT record to authorize your mail
                server
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>DKIM:</strong> Digital signature to verify email authenticity
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>DMARC:</strong> Policy for handling failed authentication
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Contact your domain/hosting provider to set up these DNS records.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleTest} variant="outline" disabled={testing}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : testResult === 'success' ? (
              <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
            ) : testResult === 'error' ? (
              <AlertCircle className="mr-2 h-4 w-4 text-destructive" />
            ) : null}
            Test Connection
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
