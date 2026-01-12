import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Mail, Server, Key, Shield, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SmtpSettings {
  host: string;
  port: string;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  encryption: 'tls' | 'ssl' | 'none';
}

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SmtpSettings>({
    host: '',
    port: '587',
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    encryption: 'tls',
  });
  const [existingSettings, setExistingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testEmail, setTestEmail] = useState('');

  // Load SMTP settings from database
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('user_smtp_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
          setSettings({
            host: data.host,
            port: String(data.port),
            username: data.username,
            password: '', // Never show password
            fromEmail: data.from_email,
            fromName: data.from_name || '',
            encryption: data.encryption as 'tls' | 'ssl' | 'none',
          });
          setExistingSettings(true);
        }
      } catch (error) {
        console.error('Failed to load SMTP settings');
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    // Validate required fields
    if (!settings.host || !settings.port || !settings.username || !settings.fromEmail) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Password is required for new settings or when updating
    if (!existingSettings && !settings.password) {
      toast.error('Password is required');
      return;
    }
    
    setSaving(true);
    try {
      const settingsData = {
        user_id: user.id,
        host: settings.host,
        port: parseInt(settings.port),
        username: settings.username,
        from_email: settings.fromEmail,
        from_name: settings.fromName || null,
        encryption: settings.encryption,
        ...(settings.password ? { password: settings.password } : {}),
      };
      
      if (existingSettings) {
        // Update existing settings
        const updateData = { ...settingsData };
        delete (updateData as Record<string, unknown>).user_id;
        
        const { error } = await supabase
          .from('user_smtp_settings')
          .update(updateData)
          .eq('user_id', user.id);
        
        if (error) throw error;
      } else {
        // Insert new settings
        if (!settings.password) {
          toast.error('Password is required');
          setSaving(false);
          return;
        }
        
        const { error } = await supabase
          .from('user_smtp_settings')
          .insert({ ...settingsData, password: settings.password });
        
        if (error) throw error;
        setExistingSettings(true);
      }
      
      // Clear password field after save
      setSettings(prev => ({ ...prev, password: '' }));
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (!settings.host || !settings.port || !settings.username || !settings.fromEmail) {
        throw new Error('Please fill in all SMTP fields including From Email');
      }
      if (!testEmail) {
        throw new Error('Please enter a test email address');
      }
      if (!existingSettings) {
        throw new Error('Please save your SMTP settings first');
      }

      const response = await supabase.functions.invoke('send-email', {
        body: {
          recipientEmail: testEmail,
          subject: 'SMTP Test Email - Your Setup Works!',
          body: `This is a test email from your email outreach tool.\n\nIf you received this, your SMTP configuration is working correctly!\n\nSettings used:\n- Host: ${settings.host}\n- Port: ${settings.port}\n- Encryption: ${settings.encryption}\n- From: ${settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail}`,
          testMode: true,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'Failed to send test email');
      }

      setTestResult('success');
      toast.success(`Test email sent to ${testEmail}! Check your inbox.`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'SMTP test failed';
      console.error('Test email error:', errorMessage);
      setTestResult('error');
      toast.error(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Settings">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

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
                  Configure your email server to send campaigns. Credentials are stored securely on the server.
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
                <Label htmlFor="password">
                  Password {existingSettings && <span className="text-muted-foreground">(leave blank to keep current)</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={existingSettings ? "••••••••" : "Enter password"}
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

        {/* Send Test Email */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Send Test Email</CardTitle>
                <CardDescription>
                  Verify your SMTP configuration by sending a real test email
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Test Email Address</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter your email to receive a test message
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleTest} disabled={testing || !testEmail || !existingSettings}>
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : testResult === 'success' ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                ) : testResult === 'error' ? (
                  <AlertCircle className="mr-2 h-4 w-4 text-destructive" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Test Email
              </Button>
              {testResult === 'success' && (
                <span className="text-sm text-success">Check your inbox!</span>
              )}
              {testResult === 'error' && (
                <span className="text-sm text-destructive">Failed - check settings</span>
              )}
              {!existingSettings && (
                <span className="text-sm text-muted-foreground">Save settings first</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
