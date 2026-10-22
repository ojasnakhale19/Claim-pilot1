import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Separator } from '../components/ui/Separator';
import { Progress } from '../components/ui/Progress';
import { cn } from '../lib/utils';
import { formatCurrency, formatDate, formatDateTime, getStatusBadgeVariant, getStatusLabel, getSeverityBadgeVariant, getClaimById, getAssessmentByClaimId, getDamageComponentsByClaimId, getSettlementByClaimId, getSettlementRangeByClaimId, getCostBreakdownByClaimId, getAuditEventsByClaimId, mockClaims, mockAssessments, mockDamageComponents, mockSettlements, mockSettlementRanges, mockCostBreakdowns, mockAuditEvents } from '../data/mockClaims';
import { formatNumber } from '../lib/utils';
import type { DamageComponent, CostBreakdown, AuditEvent, PolicyRule, Message } from '../types';

const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1617814076367-b759c7d7e773?w=800&h=600&fit=crop',
];

export function ClaimDetailsPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();

  const claim = claimId ? getClaimById(claimId) : mockClaims[0];
  const assessment = claimId ? getAssessmentByClaimId(claimId) : mockAssessments[0];
  const components = claimId ? getDamageComponentsByClaimId(claimId) : mockDamageComponents[claim?.id || 'CLM-2026-1042'];
  const settlement = claimId ? getSettlementByClaimId(claimId) : mockSettlements[0];
  const settlementRange = claimId ? getSettlementRangeByClaimId(claimId) : mockSettlementRanges[claim?.id || 'CLM-2026-1042'];
  const costBreakdown = claimId ? getCostBreakdownByClaimId(claimId) : mockCostBreakdowns[claim?.id || 'CLM-2026-1042'];
  const auditEvents = claimId ? getAuditEventsByClaimId(claimId) : mockAuditEvents[claim?.id || 'CLM-2026-1042'];

  const [activeTab, setActiveTab] = useState<string>('overview');

  const goBack = () => navigate(-1);

  if (!claim) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-medium text-slate-900">Claim not found</h2>
          <Button onClick={goBack} variant="outline" className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Claim ID</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono font-medium text-slate-900">{claim.id}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={getStatusBadgeVariant(claim.status) as any}>{getStatusLabel(claim.status)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-slate-900">{claim.customerName}</p>
            <p className="text-sm text-slate-500">{claim.policyNumber}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-slate-900">{claim.vehicle.make} {claim.vehicle.model}</p>
            <p className="text-sm text-slate-500">{claim.vehicle.registrationNumber} · {claim.vehicle.year}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Incident Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <dt className="text-slate-500">Incident Date</dt>
                <dd className="font-medium">{formatDate(claim.incidentDate)}</dd>
                <dt className="text-slate-500">Damage Type</dt>
                <dd className="font-medium capitalize">{claim.damageType.replace('_', ' ')}</dd>
                <dt className="text-slate-500">Severity</dt>
                <dd className="font-medium"><Badge variant={getSeverityBadgeVariant(claim.severity) as any}>{claim.severity}</Badge></dd>
                <dt className="text-slate-500">Repair Location</dt>
                <dd className="font-medium">{claim.repairLocation}</dd>
              </div>
            </dl>
            <div>
              <dt className="text-slate-500 text-sm mb-1">Description</dt>
              <dd className="text-slate-700">{claim.incidentDescription}</dd>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settlementRange && (
              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Settlement Range</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Estimated Garage Repair</span><span className="font-mono font-medium">{formatCurrency(settlementRange.estimatedGarageCost)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span>Min Settlement</span><span className="font-mono">{formatCurrency(settlementRange.minSettlement)}</span></div>
                  <div className="flex justify-between"><span>Recommended Offer</span><span className="font-mono font-semibold text-primary-600">{formatCurrency(settlementRange.recommendedOffer)}</span></div>
                  <div className="flex justify-between"><span>Max Settlement</span><span className="font-mono">{formatCurrency(settlementRange.maxSettlement)}</span></div>
                </div>
              </div>
            )}
            {settlement && (
              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Settlement Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Status</span><span className="font-medium capitalize"><Badge variant={settlement.status === 'confirmed' ? 'success' : settlement.status === 'escalated' ? 'destructive' : 'primary'}>{settlement.status.replace('_', ' ')}</Badge></span></div>
                  <div className="flex justify-between"><span>Current Offer</span><span className="font-mono font-bold">{formatCurrency(settlement.currentOffer)}</span></div>
                  <div className="flex justify-between"><span>Negotiation Round</span><span className="font-medium">{settlement.negotiationRound}</span></div>
                  {settlement.acceptedAmount && (
                    <div className="flex justify-between text-success-600"><span>Accepted Amount</span><span className="font-mono font-bold">{formatCurrency(settlement.acceptedAmount)}</span></div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">1</div>
              <div className="flex-1">
                <p className="font-medium">Claim Created</p>
                <p className="text-sm text-slate-500">{formatDateTime(claim.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">2</div>
              <div className="flex-1">
                <p className="font-medium">Evidence Uploaded</p>
                <p className="text-sm text-slate-500">{claim.incidentDate}</p>
              </div>
            </div>
            {assessment && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">3</div>
                <div className="flex-1">
                  <p className="font-medium">AI Assessment Completed</p>
                  <p className="text-sm text-slate-500">{formatDateTime(assessment.assessedAt)} · {assessment.overallConfidence}% confidence</p>
                </div>
              </div>
            )}
            {settlement && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">4</div>
                <div className="flex-1">
                  <p className="font-medium">Settlement Initiated</p>
                  <p className="text-sm text-slate-500">{formatDateTime(settlement.startedAt)}</p>
                </div>
              </div>
            )}
            {settlement?.confirmedAt && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Settlement Confirmed</p>
                  <p className="text-sm text-slate-500">{formatDateTime(settlement.confirmedAt)}</p>
                </div>
              </div>
            )}
            {settlement?.escalatedAt && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-700 text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Escalated for Human Review</p>
                  <p className="text-sm text-slate-500">{formatDateTime(settlement.escalatedAt)}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEvidence = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Evidence</CardTitle>
          <CardDescription>Photos and videos submitted for this claim</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_IMAGES.map((src, i) => (
              <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-border bg-slate-100">
                <img src={src} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-sm text-white font-medium">Evidence {i + 1}</p>
                  <p className="text-xs text-slate-300">JPG · 2.4 MB · {new Date(claim.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_IMAGES.map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">evidence-{i + 1}.jpg</TableCell>
                  <TableCell><Badge variant="secondary">Image</Badge></TableCell>
                  <TableCell>{formatNumber(2400000 + i * 100000)} KB</TableCell>
                  <TableCell>{formatDateTime(claim.createdAt)}</TableCell>
                  <TableCell><Badge variant="success">Processed</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderAssessment = () => {
    if (!assessment) return <div className="text-center py-12 text-slate-500">No assessment available</div>;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Damage Assessment</CardTitle>
              <CardDescription>AI-generated component-level damage analysis</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">Illustrative AI Assessment · Demo Mode</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">Overall Confidence</p><p className="text-2xl font-bold">{assessment.overallConfidence}%</p></div>
                <div><p className="text-xs text-slate-500">Components Found</p><p className="text-2xl font-bold">{components.length}</p></div>
                <div><p className="text-xs text-slate-500">Total Est. Cost</p><p className="text-2xl font-bold">{formatCurrency(assessment.totalEstimatedCost)}</p></div>
                <div><p className="text-xs text-slate-500">Assessed By</p><p className="text-2xl font-bold capitalize">{assessment.assessedBy}</p></div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Damage Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Repair Method</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((comp: DamageComponent) => (
                  <TableRow key={comp.id}>
                    <TableCell className="font-medium">{comp.component}</TableCell>
                    <TableCell>{comp.damageType}</TableCell>
                    <TableCell><Badge variant={getSeverityBadgeVariant(comp.severity) as any}>{comp.severity}</Badge></TableCell>
                    <TableCell>{comp.repairMethod}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={comp.confidence} className="w-32" />
                        <span className="text-sm font-mono">{comp.confidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatCurrency(comp.estimatedCost)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell colSpan={5} className="text-right">Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(assessment.totalEstimatedCost)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessment Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{assessment.notes || 'No additional notes.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCosts = () => {
    if (!costBreakdown) return <div className="text-center py-12 text-slate-500">No cost breakdown available</div>;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Repair Cost Breakdown</CardTitle>
            <CardDescription>Detailed line items for estimated garage repair</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costBreakdown.items.map((item: CostBreakdown['items'][0], i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.component}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{item.category.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell colSpan={5} className="text-right">Subtotal</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.subtotal)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">Taxes (GST 18%)</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.taxes)}</TableCell>
                </TableRow>
                <TableRow className="bg-slate-50 font-bold">
                  <TableCell colSpan={5} className="text-right">Total Estimated Garage Repair Cost</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {settlementRange && (
          <Card>
            <CardHeader>
              <CardTitle>Settlement Range Calculation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex justify-between"><span>Estimated Garage Repair Cost</span><span className="font-mono font-medium">{formatCurrency(settlementRange.estimatedGarageCost)}</span></div>
                <Separator />
                {settlementRange.policyRules.map((rule: PolicyRule) => (
                  <div key={rule.id} className="flex justify-between text-sm">
                    <span className={cn(rule.type === 'adjustment' && rule.impact < 0 ? 'text-danger-600' : rule.type === 'adjustment' && rule.impact > 0 ? 'text-success-600' : 'text-slate-600')}>
                      {rule.name} ({rule.type})
                    </span>
                    <span className={cn('font-mono', rule.impact < 0 ? 'text-danger-600' : rule.impact > 0 ? 'text-success-600' : 'text-slate-900')}>
                      {rule.impact > 0 ? '+' : ''}{formatCurrency(rule.impact)}
                    </span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold"><span>Recommended Offer</span><span className="font-mono text-primary-600">{formatCurrency(settlementRange.recommendedOffer)}</span></div>
                <div className="flex justify-between"><span>Min Settlement</span><span className="font-mono">{formatCurrency(settlementRange.minSettlement)}</span></div>
                <div className="flex justify-between"><span>Max Settlement</span><span className="font-mono">{formatCurrency(settlementRange.maxSettlement)}</span></div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderSettlement = () => {
    if (!settlement) return <div className="text-center py-12 text-slate-500">No settlement data available</div>;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Settlement Conversation</CardTitle>
              <CardDescription>Chat history between customer and AI</CardDescription>
            </div>
            <Badge variant={settlement.status === 'confirmed' ? 'success' : settlement.status === 'escalated' ? 'destructive' : 'primary'}>
              {settlement.status.replace('_', ' ')}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-2xl mx-auto">
              {settlement.conversation.map((msg: Message) => (
                <div key={msg.id} className={cn('flex gap-3', msg.sender === 'customer' ? 'flex-row-reverse' : '')}>
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium', msg.sender === 'ai' ? 'bg-primary-100 text-primary-700' : msg.sender === 'customer' ? 'bg-slate-100 text-slate-700' : 'bg-warning-100 text-warning-700')}>
                    {msg.sender === 'ai' ? 'AI' : msg.sender === 'customer' ? 'C' : 'S'}
                  </div>
                  <div className={cn('max-w-[75%] rounded-2xl px-4 py-2', msg.sender === 'ai' ? 'bg-primary-50 text-slate-900 rounded-br-md' : msg.sender === 'customer' ? 'bg-primary-600 text-white rounded-bl-md' : 'bg-warning-50 text-warning-900 rounded-lg')}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn('mt-1 text-[10px]', msg.sender === 'customer' ? 'text-primary-100' : msg.sender === 'system' ? 'text-warning-200' : 'text-slate-400')}>
                      {formatDateTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settlement Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-slate-500">Estimated Garage Repair</p>
                <p className="text-2xl font-bold">{formatCurrency(settlementRange?.estimatedGarageCost || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-slate-500">Current Offer</p>
                <p className="text-2xl font-bold text-primary-600">{formatCurrency(settlement.currentOffer)}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-slate-500">Negotiation Round</p>
                <p className="text-2xl font-bold">{settlement.negotiationRound}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-slate-500">Status</p>
                <p className="text-2xl font-bold"><Badge variant={settlement.status === 'confirmed' ? 'success' : settlement.status === 'escalated' ? 'destructive' : 'primary'}>{settlement.status.replace('_', ' ')}</Badge></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderAudit = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Complete activity log for this claim</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {auditEvents.map((event: AuditEvent) => (
              <div key={event.id} className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-slate-50 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-sm font-medium">
                  {event.actor === 'ClaimPilot AI' || event.actor === 'System' ? '🤖' : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-slate-900">{event.event}</h4>
                    <span className="text-xs text-slate-400">{formatDateTime(event.timestamp)}</span>
                  </div>
                  <p className="text-sm text-slate-600">{event.description}</p>
                  <p className="text-xs text-slate-500">Actor: {event.actor}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-slate-50 p-4">
        <p className="text-sm text-slate-600">
          <strong>Note:</strong> This audit trail is simulated for demonstration purposes. It is not a tamper-proof or legally authoritative record.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Claim Details</h1>
          <p className="text-slate-500">{claim.id} · {claim.customerName} · {getStatusLabel(claim.status)}</p>
        </div>
        <Badge variant="warning" className="text-xs">DEMO MODE</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="costs">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="evidence">{renderEvidence()}</TabsContent>
        <TabsContent value="assessment">{renderAssessment()}</TabsContent>
        <TabsContent value="costs">{renderCosts()}</TabsContent>
        <TabsContent value="settlement">{renderSettlement()}</TabsContent>
        <TabsContent value="audit">{renderAudit()}</TabsContent>
      </Tabs>
    </div>
  );
}