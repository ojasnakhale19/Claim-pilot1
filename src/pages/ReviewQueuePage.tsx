import { useState } from 'react';
import { Eye, MoreHorizontal, CheckCircle, RotateCcw, X, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { formatCurrency, formatDate, mockEscalationCases, getClaimById } from '../data/mockClaims';
import type { EscalationCase } from '../types';

const escalationReasons = [
  { value: 'all', label: 'All Reasons' },
  { value: 'low_image_quality', label: 'Low Image Quality' },
  { value: 'conflicting_evidence', label: 'Conflicting Evidence' },
  { value: 'uncertain_component', label: 'Uncertain Component' },
  { value: 'suspected_duplicate', label: 'Suspected Duplicate' },
  { value: 'high_repair_cost', label: 'High Repair Cost' },
  { value: 'offer_out_of_range', label: 'Offer Out of Range' },
  { value: 'potential_safety_damage', label: 'Potential Safety Damage' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'policy_dispute', label: 'Policy Dispute' },
];

const riskLevels = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function ReviewQueuePage() {
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selectedCase, setSelectedCase] = useState<EscalationCase | null>(null);

  const filteredCases = mockEscalationCases.filter(escalation => {
    const claim = getClaimById(escalation.claimId);
    if (!claim) return false;
    const matchesSearch = escalation.claimId.toLowerCase().includes(search.toLowerCase()) ||
      claim.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesReason = reasonFilter === 'all' || escalation.reason === reasonFilter;
    const matchesRisk = riskFilter === 'all' || escalation.riskLevel === riskFilter;
    return matchesSearch && matchesReason && matchesRisk;
  });

  const handleViewDetails = (escalation: EscalationCase) => {
    setSelectedCase(escalation);
  };

  const handleCloseDrawer = () => {
    setSelectedCase(null);
  };

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'destructive';
      case 'critical': return 'destructive';
      default: return 'secondary';
    }
  };

  const getReasonLabel = (reason: string) => {
    const found = escalationReasons.find(r => r.value === reason);
    return found ? found.label : reason;
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Human Review Queue</h1>
          <p className="mt-1 text-slate-500">Cases requiring human adjuster attention</p>
        </div>
        <Badge variant="warning" className="text-xs">DEMO MODE</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Escalated Cases ({filteredCases.length})</CardTitle>
            <CardDescription>Review and resolve cases flagged for human attention</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="search"
                  placeholder="Search cases..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-10 pl-10"
                />
              </div>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-10">
                  <SelectValue placeholder="Escalation Reason" />
                </SelectTrigger>
                <SelectContent>
                  {escalationReasons.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-full sm:w-[160px] h-10">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  {riskLevels.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Damage Type</TableHead>
                  <TableHead className="text-right">Est. Repair Cost</TableHead>
                  <TableHead>Escalation Reason</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Date Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-500">
                      No escalated cases found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCases.map((escalation) => {
                    const claim = getClaimById(escalation.claimId);
                    return (
                      <TableRow key={escalation.id}>
                        <TableCell className="font-mono font-medium text-slate-900">{escalation.claimId}</TableCell>
                        <TableCell className="font-medium text-slate-900">{claim?.customerName || 'Unknown'}</TableCell>
                        <TableCell className="capitalize">{claim?.damageType.replace('_', ' ') || 'N/A'}</TableCell>
                        <TableCell className="text-right font-mono font-medium text-slate-900">{claim ? formatCurrency(claim.estimatedRepairCost) : 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{getReasonLabel(escalation.reason)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRiskBadgeVariant(escalation.riskLevel) as any}>{escalation.riskLevel}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-500 whitespace-nowrap">{formatDate(escalation.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={
                            escalation.status === 'pending' ? 'warning' :
                            escalation.status === 'in_review' ? 'primary' :
                            escalation.status === 'resolved' ? 'success' :
                            'secondary'
                          }>
                            {escalation.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleViewDetails(escalation)}>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              {escalation.status !== 'resolved' && (
                                <>
                                  <DropdownMenuItem onClick={() => {}}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Request Additional Evidence
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {}}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Mark as Reviewed
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {}}>
                                <X className="mr-2 h-4 w-4" /> Close Review
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-xl shadow-elevated animate-slide-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-white z-10 rounded-t-2xl sm:rounded-xl">
              <div>
                <h3 className="font-semibold text-slate-900">Review Case: {selectedCase.claimId}</h3>
                <p className="text-sm text-slate-500">{getReasonLabel(selectedCase.reason)} · {selectedCase.riskLevel} risk</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseDrawer} aria-label="Close drawer">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Escalation Details</h4>
                <dl className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <dt className="text-slate-500">Claim ID</dt>
                    <dd className="font-mono font-medium">{selectedCase.claimId}</dd>
                    <dt className="text-slate-500">Reason</dt>
                    <dd>{getReasonLabel(selectedCase.reason)}</dd>
                    <dt className="text-slate-500">Risk Level</dt>
                    <dd><Badge variant={getRiskBadgeVariant(selectedCase.riskLevel) as any}>{selectedCase.riskLevel}</Badge></dd>
                    <dt className="text-slate-500">Status</dt>
                    <dd><Badge variant={selectedCase.status === 'pending' ? 'warning' : selectedCase.status === 'in_review' ? 'primary' : 'success'}>{selectedCase.status.replace('_', ' ')}</Badge></dd>
                    <dt className="text-slate-500">Date Received</dt>
                    <dd>{formatDate(selectedCase.createdAt)}</dd>
                    <dt className="text-slate-500">Assigned To</dt>
                    <dd>{selectedCase.assignedTo || 'Unassigned'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Description</h4>
                <p className="text-sm text-slate-600">{selectedCase.description}</p>
              </div>

              {selectedCase.reviewNotes && (
                <div className="rounded-lg border border-border bg-slate-50 p-4">
                  <h4 className="font-medium text-slate-900 mb-3">Review Notes</h4>
                  <p className="text-sm text-slate-600">{selectedCase.reviewNotes}</p>
                </div>
              )}

              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Actions</h4>
                <div className="flex flex-wrap gap-3">
                  {selectedCase.status !== 'resolved' && (
                    <>
                      <Button variant="outline">
                        <RotateCcw className="mr-2 h-4 w-4" /> Request Additional Evidence
                      </Button>
                      <Button>
                        <CheckCircle className="mr-2 h-4 w-4" /> Mark as Reviewed
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={handleCloseDrawer}>Close Review</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}