import { Badge } from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { AnalyticsChart, CategoryChart, ClaimsActivityChart, StatusDistributionChart } from '../components/dashboard/ClaimsChart';
import { mockAnalyticsData, formatCurrency } from '../data/mockClaims';

export function AnalyticsPage() {
  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
        <p className="mt-1 text-slate-500">Key metrics and trends for claims operations</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Claims (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-slate-900">
                {mockAnalyticsData.claimsOverTime.reduce((sum, d) => sum + d.value, 0)}
              </p>
              <Badge variant="success">+8.2% vs prev</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Avg Repair Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-slate-900">
                {formatCurrency(Math.round(mockAnalyticsData.avgRepairCost.reduce((sum, d) => sum + d.value, 0) / mockAnalyticsData.avgRepairCost.length))}
              </p>
              <Badge variant="warning">+2.1% vs prev</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Avg Settlement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-slate-900">
                {formatCurrency(Math.round(mockAnalyticsData.avgSettlementAmount.reduce((sum, d) => sum + d.value, 0) / mockAnalyticsData.avgSettlementAmount.length))}
              </p>
              <Badge variant="success">+5.4% vs prev</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Acceptance Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-slate-900">
                {Math.round(mockAnalyticsData.acceptanceRate.reduce((sum, d) => sum + d.value, 0) / mockAnalyticsData.acceptanceRate.length)}%
              </p>
              <Badge variant="success">+3.2% vs prev</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="claims">Claims Volume</TabsTrigger>
          <TabsTrigger value="costs">Costs & Settlements</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ClaimsActivityChart data={mockAnalyticsData.claimsOverTime} />
            <StatusDistributionChart
              data={[
                { name: 'Assessed', value: 642, color: '#3b82f6' },
                { name: 'Negotiating', value: 187, color: '#f59e0b' },
                { name: 'Settled', value: 398, color: '#22c55e' },
                { name: 'Escalated', value: 37, color: '#ef4444' },
              ]}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AnalyticsChart
              data={mockAnalyticsData.avgRepairCost}
              title="Average Repair Cost"
              description="Daily average estimated repair cost"
              color="#3b82f6"
              formatValue={formatCurrency}
            />
            <AnalyticsChart
              data={mockAnalyticsData.avgSettlementAmount}
              title="Average Settlement Amount"
              description="Daily average cash settlement amount"
              color="#22c55e"
              formatValue={formatCurrency}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AnalyticsChart
              data={mockAnalyticsData.acceptanceRate}
              title="Settlement Acceptance Rate"
              description="Percentage of offers accepted by customers"
              color="#8b5cf6"
              formatValue={(v) => `${v}%`}
            />
            <CategoryChart
              data={mockAnalyticsData.escalationReasons}
              title="Escalation Reasons"
              description="Breakdown of cases requiring human review"
            />
          </div>
        </TabsContent>

        <TabsContent value="claims" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Automated vs Escalated Claims</CardTitle>
                <CardDescription>Claims processed by AI vs requiring human review</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <StatusDistributionChart
                    data={mockAnalyticsData.automatedVsEscalated}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Claims by Status</CardTitle>
                <CardDescription>Current status distribution of all active claims</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <StatusDistributionChart
                    data={[
                      { name: 'Draft', value: 12, color: '#9ca3af' },
                      { name: 'Evidence Uploaded', value: 28, color: '#06b6d4' },
                      { name: 'Assessing', value: 15, color: '#f59e0b' },
                      { name: 'Assessed', value: 642, color: '#3b82f6' },
                      { name: 'Negotiating', value: 187, color: '#8b5cf6' },
                      { name: 'Settled', value: 398, color: '#22c55e' },
                      { name: 'Escalated', value: 37, color: '#ef4444' },
                      { name: 'Closed', value: 124, color: '#6b7280' },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Claims Received Over Time</CardTitle>
              <CardDescription>Daily claim intake for the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ClaimsActivityChart data={mockAnalyticsData.claimsOverTime} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <AnalyticsChart
              data={mockAnalyticsData.avgRepairCost}
              title="Average Repair Cost Trend"
              description="7-day moving average of estimated repair costs"
              color="#3b82f6"
              formatValue={formatCurrency}
            />
            <AnalyticsChart
              data={mockAnalyticsData.avgSettlementAmount}
              title="Average Settlement Amount Trend"
              description="7-day moving average of cash settlement amounts"
              color="#22c55e"
              formatValue={formatCurrency}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cost Savings Analysis</CardTitle>
                <CardDescription>Garage repair cost vs cash settlement comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-sm text-slate-500">Avg Garage Repair</p>
                      <p className="text-2xl font-bold text-slate-900">{formatCurrency(21500)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-sm text-slate-500">Avg Cash Settlement</p>
                      <p className="text-2xl font-bold text-success-600">{formatCurrency(13200)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-sm text-slate-500">Avg Savings</p>
                      <p className="text-2xl font-bold text-primary-600">{formatCurrency(8300)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">
                      <strong>Note:</strong> All figures are illustrative demo values. Savings represent the difference between estimated garage retail repair costs and insurer-approved cash-in-lieu settlement amounts, accounting for depreciation, deductibles, and policy adjustments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <CategoryChart
              data={mockAnalyticsData.damageTypeDistribution}
              title="Damage Type Distribution"
              description="Types of damage reported across all claims"
            />
            <CategoryChart
              data={mockAnalyticsData.severityDistribution}
              title="Severity Distribution"
              description="Damage severity levels across all assessments"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CategoryChart
              data={mockAnalyticsData.escalationReasons}
              title="Escalation Reasons"
              description="Reasons for human review escalation"
            />
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Make Distribution</CardTitle>
                <CardDescription>Claims by vehicle manufacturer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <CategoryChart
                    data={[
                      { name: 'Maruti Suzuki', value: 28, color: '#3b82f6' },
                      { name: 'Hyundai', value: 22, color: '#22c55e' },
                      { name: 'Tata', value: 18, color: '#f59e0b' },
                      { name: 'Mahindra', value: 12, color: '#ef4444' },
                      { name: 'Kia', value: 10, color: '#8b5cf6' },
                      { name: 'Toyota', value: 8, color: '#ec4899' },
                      { name: 'Others', value: 12, color: '#6b7280' },
                    ]}
                    title="Vehicle Make Distribution"
                    description="Claims by vehicle manufacturer"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-border bg-slate-50 p-4">
        <p className="text-sm text-slate-600">
          <strong>Disclaimer:</strong> All metrics and charts on this page are based on illustrative demo data. They do not represent real-world accuracy, savings, or processing performance.
        </p>
      </div>
    </div>
  );
}