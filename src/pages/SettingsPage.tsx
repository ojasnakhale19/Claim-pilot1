import { useState } from 'react';
import { Save, User, Bell, Monitor, Gauge, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Switch } from '../components/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { mockUser, mockDemoSettings } from '../data/mockClaims';
import { cn } from '../lib/utils';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>('profile');
  const [profile, setProfile] = useState({
    name: mockUser.name,
    email: mockUser.email,
    phone: '+91 98765 43210',
    timezone: 'Asia/Kolkata',
  });
  const [notifications, setNotifications] = useState(mockUser.preferences.notifications);
  const [display, setDisplay] = useState(mockUser.preferences.display);
  const [demoSettings, setDemoSettings] = useState(mockDemoSettings);
  const [saved, setSaved] = useState(false);

  const handleSave = (tab: string) => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    console.log(`Saved ${tab} settings:`, { profile, notifications, display, demoSettings });
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="mt-1 text-slate-500">Manage your preferences and demo configuration</p>
        </div>
        <Badge variant="warning" className="text-xs">DEMO MODE</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-2" /> Profile</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" /> Notifications</TabsTrigger>
          <TabsTrigger value="display"><Monitor className="h-4 w-4 mr-2" /> Display</TabsTrigger>
          <TabsTrigger value="demo"><Gauge className="h-4 w-4 mr-2" /> Demo Config</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full Name"
                  value={profile.name}
                  onChange={e => setProfile(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  label="Email Address"
                  type="email"
                  value={profile.email}
                  onChange={e => setProfile(prev => ({ ...prev, email: e.target.value }))}
                />
                <Input
                  label="Phone Number"
                  value={profile.phone}
                  onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                />
                <Select value={profile.timezone} onValueChange={v => setProfile(prev => ({ ...prev, timezone: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                    <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('profile')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Currency & Regional Settings</CardTitle>
              <CardDescription>Configure formatting preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select value="INR" onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value="DD/MM/YYYY" onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="Select date format" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
                <Select value="en-IN" onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="Select locale" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-IN">English (India)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('regional')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>Choose how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Email Notifications', description: 'Receive notifications via email' },
                  { key: 'push', label: 'Push Notifications', description: 'Receive browser push notifications' },
                  { key: 'sms', label: 'SMS Notifications', description: 'Receive notifications via SMS' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                    </div>
                    <Switch
                      checked={notifications[item.key as keyof typeof notifications]}
                      onCheckedChange={checked => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <CardDescription>Select which events trigger notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {[
                  { key: 'claimUpdates', label: 'Claim Updates', description: 'New claims, status changes, assignments' },
                  { key: 'settlementUpdates', label: 'Settlement Updates', description: 'Offers, counteroffers, confirmations' },
                  { key: 'escalationAlerts', label: 'Escalation Alerts', description: 'Cases requiring human review' },
                  { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Weekly summary of claims activity' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                    </div>
                    <Switch
                      checked={notifications[item.key as keyof typeof notifications]}
                      onCheckedChange={checked => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardFooter>
              <Button onClick={() => handleSave('notifications')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="display" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize the interface appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Table Density</label>
                  <Select value={display.density} onValueChange={v => setDisplay(prev => ({ ...prev, density: v as any }))}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Select density" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="spacious">Spacious</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Sidebar Collapsed by Default</p>
                    <p className="text-sm text-slate-500">Start with sidebar collapsed on desktop</p>
                  </div>
                  <Switch
                    checked={display.sidebarCollapsed}
                    onCheckedChange={checked => setDisplay(prev => ({ ...prev, sidebarCollapsed: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Enable Animations</p>
                    <p className="text-sm text-slate-500">Smooth transitions and micro-interactions</p>
                  </div>
                  <Switch
                    checked={display.animations}
                    onCheckedChange={checked => setDisplay(prev => ({ ...prev, animations: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Reduced Motion</p>
                    <p className="text-sm text-slate-500">Minimize animations for accessibility</p>
                  </div>
                  <Switch
                    checked={display.reducedMotion}
                    onCheckedChange={checked => setDisplay(prev => ({ ...prev, reducedMotion: checked }))}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('display')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {['light', 'dark', 'system'].map((theme) => (
                  <button
                    key={theme}
                    onClick={() => {}}
                    className={cn(
                      'relative p-4 rounded-xl border-2 transition-all',
                      mockUser.preferences.theme === theme
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-border hover:border-slate-300'
                    )}
                  >
                    <div className={cn(
                      'h-12 rounded-lg mb-2',
                      theme === 'light' && 'bg-white border border-slate-200',
                      theme === 'dark' && 'bg-slate-900',
                      theme === 'system' && 'bg-gradient-to-r from-white to-slate-900'
                    )} />
                    <p className="font-medium capitalize">{theme}</p>
                    {mockUser.preferences.theme === theme && (
                      <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
                        <Save className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demo" className="space-y-6">
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-warning-800">Demo Configuration Only</h3>
                <p className="mt-1 text-sm text-warning-700">
                  These settings control the simulated behavior of the demo application. They do not affect real insurance policies,
                  production controls, or actual financial logic. All values are used for frontend demonstration purposes only.
                </p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Settlement Policy</CardTitle>
              <CardDescription>Configure demo settlement calculation parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Min Settlement %"
                  type="number"
                  value={demoSettings.settlementPolicy.minSettlementPercentage}
                  onChange={e => setDemoSettings(prev => ({ ...prev, settlementPolicy: { ...prev.settlementPolicy, minSettlementPercentage: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Recommended Offer %"
                  type="number"
                  value={demoSettings.settlementPolicy.recommendedOfferPercentage}
                  onChange={e => setDemoSettings(prev => ({ ...prev, settlementPolicy: { ...prev.settlementPolicy, recommendedOfferPercentage: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Max Settlement %"
                  type="number"
                  value={demoSettings.settlementPolicy.maxSettlementPercentage}
                  onChange={e => setDemoSettings(prev => ({ ...prev, settlementPolicy: { ...prev.settlementPolicy, maxSettlementPercentage: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Depreciation Rate %"
                  type="number"
                  value={demoSettings.settlementPolicy.depreciationRate}
                  onChange={e => setDemoSettings(prev => ({ ...prev, settlementPolicy: { ...prev.settlementPolicy, depreciationRate: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="50"
                />
                <Input
                  label="Deductible Amount"
                  type="number"
                  value={demoSettings.settlementPolicy.deductibleAmount}
                  onChange={e => setDemoSettings(prev => ({ ...prev, settlementPolicy: { ...prev.settlementPolicy, deductibleAmount: parseInt(e.target.value) || 0 } }))}
                  min="0"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('demo-settlement')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Escalation Thresholds</CardTitle>
              <CardDescription>Configure when cases are escalated for human review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="High Repair Cost Threshold"
                  type="number"
                  value={demoSettings.escalationThresholds.highRepairCost}
                  onChange={e => setDemoSettings(prev => ({ ...prev, escalationThresholds: { ...prev.escalationThresholds, highRepairCost: parseInt(e.target.value) || 0 } }))}
                  min="0"
                />
                <Input
                  label="Low Confidence Threshold %"
                  type="number"
                  value={demoSettings.escalationThresholds.lowConfidence}
                  onChange={e => setDemoSettings(prev => ({ ...prev, escalationThresholds: { ...prev.escalationThresholds, lowConfidence: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Max Negotiation Rounds"
                  type="number"
                  value={demoSettings.escalationThresholds.maxNegotiationRounds}
                  onChange={e => setDemoSettings(prev => ({ ...prev, escalationThresholds: { ...prev.escalationThresholds, maxNegotiationRounds: parseInt(e.target.value) || 0 } }))}
                  min="1"
                  max="10"
                />
                <Input
                  label="Time Limit (minutes)"
                  type="number"
                  value={demoSettings.escalationThresholds.timeLimitMinutes}
                  onChange={e => setDemoSettings(prev => ({ ...prev, escalationThresholds: { ...prev.escalationThresholds, timeLimitMinutes: parseInt(e.target.value) || 0 } }))}
                  min="1"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('demo-escalation')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment Confidence Thresholds</CardTitle>
              <CardDescription>Configure AI assessment auto-approval rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Auto-Approve Threshold %"
                  type="number"
                  value={demoSettings.assessmentConfidence.autoApproveThreshold}
                  onChange={e => setDemoSettings(prev => ({ ...prev, assessmentConfidence: { ...prev.assessmentConfidence, autoApproveThreshold: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Review Threshold %"
                  type="number"
                  value={demoSettings.assessmentConfidence.reviewThreshold}
                  onChange={e => setDemoSettings(prev => ({ ...prev, assessmentConfidence: { ...prev.assessmentConfidence, reviewThreshold: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
                <Input
                  label="Reject Threshold %"
                  type="number"
                  value={demoSettings.assessmentConfidence.rejectThreshold}
                  onChange={e => setDemoSettings(prev => ({ ...prev, assessmentConfidence: { ...prev.assessmentConfidence, rejectThreshold: parseInt(e.target.value) || 0 } }))}
                  min="0"
                  max="100"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('demo-assessment')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demo Mode</CardTitle>
              <CardDescription>Enable or disable demo mode globally</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">Demo Mode Enabled</p>
                  <p className="text-sm text-slate-500">Show demo badges and use mock data throughout the application</p>
                </div>
                <Switch
                  checked={demoSettings.demoMode}
                  onCheckedChange={checked => setDemoSettings(prev => ({ ...prev, demoMode: checked }))}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave('demo-mode')}>
                <Save className="h-4 w-4 mr-2" />
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}