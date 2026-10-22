import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, CheckCircle, AlertCircle, Info, Download, ArrowLeft, Calculator, X, MessageSquare, FileText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Separator } from '../components/ui/Separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { ScrollArea } from '../components/ui/ScrollArea';
import { cn } from '../lib/utils';
import { formatCurrency, getClaimById, getSettlementByClaimId, getSettlementRangeByClaimId, getCostBreakdownByClaimId } from '../data/mockClaims';
import type { Claim, Settlement, Message, SettlementRange, CostBreakdown } from '../types';

interface OfferCardProps {
  amount: number;
  label: string;
  isCurrent?: boolean;
  onSelect?: () => void;
}

function OfferCard({ amount, label, isCurrent, onSelect }: OfferCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-center p-4 rounded-xl border-2 transition-all',
        isCurrent
          ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-500/10'
          : 'border-border bg-white hover:border-primary-300 hover:shadow-md'
      )}
      aria-pressed={isCurrent}
    >
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={cn('mt-1 text-2xl font-bold font-mono', isCurrent ? 'text-primary-700' : 'text-slate-900')}>
        {formatCurrency(amount)}
      </span>
      {isCurrent && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
          <CheckCircle className="h-3.5 w-3.5" />
        </div>
      )}
    </button>
  );
}

export function SettlementPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [settlementRange, setSettlementRange] = useState<SettlementRange | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [counterOffer, setCounterOffer] = useState('');
  const [counterOfferError, setCounterOfferError] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('chat');

  useEffect(() => {
    if (claimId) {
      const c = getClaimById(claimId);
      const s = getSettlementByClaimId(claimId);
      const sr = getSettlementRangeByClaimId(claimId);
      const cb = getCostBreakdownByClaimId(claimId);
      setClaim(c || null);
      setSettlement(s || null);
      setSettlementRange(sr || null);
      setCostBreakdown(cb || null);
    }
  }, [claimId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [settlement?.conversation.length]);

  const handleCounterOffer = () => {
    const amount = parseInt(counterOffer.replace(/[^\d]/g, ''), 10);
    if (isNaN(amount)) {
      setCounterOfferError('Please enter a valid amount');
      return;
    }

    if (!settlementRange) return;

    if (amount < settlementRange.minSettlement) {
      setCounterOfferError(`Amount must be at least ${formatCurrency(settlementRange.minSettlement)}`);
      return;
    }
    if (amount > settlementRange.maxSettlement) {
      setCounterOfferError(`Amount cannot exceed ${formatCurrency(settlementRange.maxSettlement)}`);
      return;
    }

    setCounterOfferError('');

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      settlementId: settlement?.id || '',
      sender: 'customer',
      content: `I would like to counteroffer ${formatCurrency(amount)}.`,
      timestamp: new Date().toISOString(),
      type: 'counteroffer',
      metadata: { amount },
    };

    setSettlement(prev => prev ? {
      ...prev,
      conversation: [...prev.conversation, newMessage],
      currentOffer: amount,
      negotiationRound: prev.negotiationRound + 1,
    } : null);

    setCounterOffer('');

    setIsTyping(true);
    setTimeout(() => {
      const aiResponse: Message = {
        id: `msg-${Date.now() + 1}`,
        settlementId: settlement?.id || '',
        sender: 'ai',
        content: `Your requested amount of ${formatCurrency(amount)} is within the displayed demo settlement range (${formatCurrency(settlementRange.minSettlement)} - ${formatCurrency(settlementRange.maxSettlement)}). I can present ${formatCurrency(amount)} as a proposed offer for confirmation.`,
        timestamp: new Date().toISOString(),
        type: 'text',
      };
      setSettlement(prev => prev ? {
        ...prev,
        conversation: [...prev.conversation, aiResponse],
        currentOffer: amount,
      } : null);
      setIsTyping(false);
    }, 1000);
  };

  const handleAcceptOffer = () => {
    if (!settlement) return;
    setShowConfirmation(true);
  };

  const handleConfirmAccept = () => {
    if (!settlement) return;
    const confirmedMessage: Message = {
      id: `msg-${Date.now()}`,
      settlementId: settlement.id,
      sender: 'customer',
      content: `I accept the offer of ${formatCurrency(settlement.currentOffer)}.`,
      timestamp: new Date().toISOString(),
      type: 'confirmation',
      metadata: { amount: settlement.currentOffer },
    };
    const aiConfirmation: Message = {
      id: `msg-${Date.now() + 1}`,
      settlementId: settlement.id,
      sender: 'ai',
      content: `Thank you for confirming. Your settlement of ${formatCurrency(settlement.currentOffer)} has been processed. Reference: ${settlement.id}-CONF.`,
      timestamp: new Date().toISOString(),
      type: 'confirmation',
      metadata: { action: 'settled' },
    };
    setSettlement(prev => prev ? {
      ...prev,
      status: 'confirmed',
      acceptedAmount: settlement.currentOffer,
      conversation: [...prev.conversation, confirmedMessage, aiConfirmation],
      confirmedAt: new Date().toISOString(),
    } : null);
    setShowConfirmation(false);
  };

  const handleRequestHumanReview = () => {
    if (!settlement) return;
    const reviewMessage: Message = {
      id: `msg-${Date.now()}`,
      settlementId: settlement.id,
      sender: 'customer',
      content: 'I would like a human adjuster to review this case.',
      timestamp: new Date().toISOString(),
      type: 'text',
    };
    const systemMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      settlementId: settlement.id,
      sender: 'system',
      content: 'Case escalated for human review. A claims adjuster will contact you within 24 hours.',
      timestamp: new Date().toISOString(),
      type: 'system',
      metadata: { action: 'escalated' },
    };
    setSettlement(prev => prev ? {
      ...prev,
      status: 'escalated',
      conversation: [...prev.conversation, reviewMessage, systemMessage],
      escalatedAt: new Date().toISOString(),
      escalationReason: 'customer_request',
    } : null);
  };

  const handleDownloadSummary = () => {
    if (!claim || !settlement || !settlementRange || !costBreakdown) return;
    const summary = `CLAIM SETTLEMENT SUMMARY (DEMO)
Claim ID: ${claim.id}
Customer: ${claim.customerName}
Vehicle: ${claim.vehicle.make} ${claim.vehicle.model} (${claim.vehicle.registrationNumber})
Policy: ${claim.policyNumber}

DAMAGE ASSESSMENT:
Estimated Garage Repair Cost: ${formatCurrency(settlementRange.estimatedGarageCost)}

SETTLEMENT RANGE:
Minimum Settlement: ${formatCurrency(settlementRange.minSettlement)}
Recommended Offer: ${formatCurrency(settlementRange.recommendedOffer)}
Maximum Settlement: ${formatCurrency(settlementRange.maxSettlement)}

FINAL SETTLEMENT:
Status: ${settlement.status}
Final Amount: ${formatCurrency(settlement.acceptedAmount || settlement.currentOffer)}
Settlement Date: ${settlement.confirmedAt ? new Date(settlement.confirmedAt).toLocaleDateString() : 'Pending'}

COST BREAKDOWN:
${costBreakdown.items.map(item => `${item.component} - ${item.category}: ${formatCurrency(item.total)}`).join('\n')}
Subtotal: ${formatCurrency(costBreakdown.subtotal)}
Taxes: ${formatCurrency(costBreakdown.taxes)}
Total: ${formatCurrency(costBreakdown.total)}

DISCLAIMER: This is a demo summary. No real payment or settlement has occurred.
`;
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${claim.id}-settlement-summary.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const goBack = () => navigate(-1);

  if (!claim || !settlement || !settlementRange) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-medium text-slate-900">Settlement not found</h2>
          <Button onClick={goBack} variant="outline" className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  const suggestedReplies = [
    "Why is the offer lower than the repair cost?",
    "Can you improve the offer?",
    "Show me the cost breakdown.",
    "I would like a human adjuster to review this.",
  ];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Settlement Workspace</h1>
          <p className="text-slate-500">{claim.id} · {claim.customerName} · {formatCurrency(settlementRange.estimatedGarageCost)} est. repair</p>
        </div>
        <Badge variant="warning" className="text-xs">DEMO MODE</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_480px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Claim Summary</CardTitle>
              <CardDescription>Key claim details and settlement parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-slate-500">Claim ID</p>
                  <p className="font-mono font-medium text-slate-900">{claim.id}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="font-medium text-slate-900">{claim.customerName}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-slate-500">Vehicle</p>
                  <p className="font-medium text-slate-900">{claim.vehicle.make} {claim.vehicle.model}</p>
                  <p className="text-xs text-slate-500">{claim.vehicle.registrationNumber}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-slate-500">Damage Type</p>
                  <p className="capitalize font-medium text-slate-900">{claim.damageType.replace('_', ' ')}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Settlement Range</span>
                  <Badge variant={settlement.status === 'confirmed' ? 'success' : settlement.status === 'escalated' ? 'destructive' : 'primary'}>
                    {settlement.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 bg-primary-500"
                    style={{
                      left: `${((settlementRange.minSettlement / settlementRange.estimatedGarageCost) * 100)}%`,
                      width: `${(((settlementRange.maxSettlement - settlementRange.minSettlement) / settlementRange.estimatedGarageCost) * 100)}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-primary-600"
                    style={{ left: `${((settlement.currentOffer / settlementRange.estimatedGarageCost) * 100)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-success-600"
                    style={{ left: `${((settlementRange.recommendedOffer / settlementRange.estimatedGarageCost) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Min: {formatCurrency(settlementRange.minSettlement)}</span>
                  <span>Recommended: {formatCurrency(settlementRange.recommendedOffer)}</span>
                  <span>Max: {formatCurrency(settlementRange.maxSettlement)}</span>
                  <span>Garage: {formatCurrency(settlementRange.estimatedGarageCost)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Current Offer</p>
                    <p className="font-mono text-lg font-bold text-slate-900">{formatCurrency(settlement.currentOffer)}</p>
                  </div>
                  <Badge variant={settlement.status === 'confirmed' ? 'success' : 'primary'}>
                    Round {settlement.negotiationRound}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  <Info className="h-4 w-4 inline mr-1" /> This is a simulated settlement workspace. All amounts are illustrative demo values.
                </p>
              </div>
            </CardContent>
          </Card>

          {showCostBreakdown && costBreakdown && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Repair Cost Breakdown</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowCostBreakdown(false)} aria-label="Close cost breakdown">
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costBreakdown.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.component}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{item.category.replace('_', ' ')}</Badge></TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border font-semibold">
                      <TableCell colSpan={3} className="text-right">Subtotal</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.subtotal)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right">Taxes (GST 18%)</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.taxes)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell colSpan={3} className="text-right">Total Estimated Garage Repair Cost</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Settlement Conversation</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={settlement.status === 'confirmed' ? 'success' : settlement.status === 'escalated' ? 'destructive' : 'primary'}>
                  {settlement.status.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                <TabsList className="border-b border-border rounded-none p-0 bg-slate-50">
                  <TabsTrigger value="chat" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary-500">
                    <MessageSquare className="h-4 w-4 mr-2" /> Chat
                  </TabsTrigger>
                  <TabsTrigger value="breakdown" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary-500">
                    <Calculator className="h-4 w-4 mr-2" /> Cost Breakdown
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="flex-1 overflow-hidden">
                  <ScrollArea className="h-[calc(100%-52px)] p-4">
                    <div className="flex flex-col gap-4 max-w-md mx-auto">
                      {settlement.conversation.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex gap-3 animate-fade-in',
                            msg.sender === 'customer' ? 'flex-row-reverse' : ''
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                              msg.sender === 'ai' ? 'bg-primary-100 text-primary-700' :
                              msg.sender === 'customer' ? 'bg-slate-100 text-slate-700' :
                              'bg-warning-100 text-warning-700'
                            )}
                          >
                            {msg.sender === 'ai' ? 'AI' : msg.sender === 'customer' ? 'C' : 'S'}
                          </div>
                          <div
                            className={cn(
                              'max-w-[75%] rounded-2xl px-4 py-2',
                              msg.sender === 'ai' ? 'bg-primary-50 text-slate-900 rounded-br-md' :
                              msg.sender === 'customer' ? 'bg-primary-600 text-white rounded-bl-md' :
                              'bg-warning-50 text-warning-900 rounded-lg'
                            )}
                          >
                            {msg.type === 'offer' && msg.metadata?.amount && (
                              <OfferCard
                                amount={msg.metadata.amount}
                                label="Initial Offer"
                                isCurrent={true}
                              />
                            )}
                            {msg.type === 'counteroffer' && msg.metadata?.amount && (
                              <OfferCard
                                amount={msg.metadata.amount}
                                label="Counteroffer"
                              />
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className={cn('mt-1 text-[10px]', msg.sender === 'customer' ? 'text-primary-100' : msg.sender === 'system' ? 'text-warning-200' : 'text-slate-400')}>
                              {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="flex gap-3 animate-fade-in">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">AI</div>
                          <div className="bg-primary-50 rounded-2xl px-4 py-2">
                            <div className="flex gap-1">
                              <span className="h-2 w-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="h-2 w-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="h-2 w-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  {settlement.status !== 'confirmed' && settlement.status !== 'escalated' && (
                    <CardFooter className="border-t border-border p-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {suggestedReplies.map((reply, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newMsg: Message = {
                                id: `msg-${Date.now()}`,
                                settlementId: settlement.id,
                                sender: 'customer',
                                content: reply,
                                timestamp: new Date().toISOString(),
                                type: 'text',
                              };
                              setSettlement(prev => prev ? { ...prev, conversation: [...prev.conversation, newMsg] } : null);
                            }}
                            className="h-auto px-3 py-2 text-xs"
                          >
                            {reply}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="Type your counteroffer (e.g., 8000)..."
                          value={counterOffer}
                          onChange={e => { setCounterOffer(e.target.value); setCounterOfferError(''); }}
                          className="flex-1"
                          aria-label="Counteroffer amount"
                          error={counterOfferError}
                        />
                        <Button onClick={handleCounterOffer} disabled={!counterOffer.trim() || isTyping}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                      {counterOfferError && (
                        <p className="text-sm text-danger-600 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {counterOfferError}
                        </p>
                      )}
                      <div className="flex items-center gap-3 pt-2">
                        <Button variant="outline" onClick={handleAcceptOffer} disabled={isTyping}>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Accept Offer
                        </Button>
                        <Button variant="ghost" onClick={handleRequestHumanReview} disabled={isTyping}>
                          <FileText className="h-4 w-4 mr-2" />
                          Request Human Review
                        </Button>
                      </div>
                    </CardFooter>
                  )}
                  {settlement.status === 'confirmed' && (
                    <CardContent className="flex items-center justify-center p-8">
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
                          <CheckCircle className="h-8 w-8 text-success-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900">Settlement Confirmed</h3>
                        <p className="mt-2 text-slate-500">Demo settlement of {formatCurrency(settlement.acceptedAmount!)} confirmed.</p>
                        <p className="mt-1 text-sm text-slate-400">Reference: {settlement.id}-CONF</p>
                        <div className="mt-6 flex gap-3 justify-center">
                          <Button variant="outline" onClick={handleDownloadSummary}>
                            <Download className="h-4 w-4 mr-2" />
                            Download Summary
                          </Button>
                          <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
                        </div>
                        <p className="mt-4 text-xs text-slate-400">Disclaimer: No real payment or settlement has occurred. This is a demo simulation.</p>
                      </div>
                    </CardContent>
                  )}
                  {settlement.status === 'escalated' && (
                    <CardContent className="flex items-center justify-center p-8">
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-100">
                          <AlertCircle className="h-8 w-8 text-warning-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900">Case Escalated</h3>
                        <p className="mt-2 text-slate-500">This case has been escalated for human review.</p>
                        <p className="mt-1 text-sm text-slate-400">A claims adjuster will contact you within 24 hours.</p>
                        <Button variant="outline" onClick={goBack} className="mt-6">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Dashboard
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </TabsContent>
                <TabsContent value="breakdown" className="flex-1 overflow-hidden">
                  {costBreakdown && (
                    <ScrollArea className="h-[calc(100%-52px)] p-4">
                      <div className="max-w-md mx-auto space-y-4">
                        <div className="rounded-lg border border-border bg-slate-50 p-4">
                          <h4 className="font-medium text-slate-900 mb-3">Settlement Range Calculation</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span>Estimated Garage Repair Cost</span><span className="font-mono font-medium">{formatCurrency(settlementRange.estimatedGarageCost)}</span></div>
                            <Separator />
                            <div className="flex justify-between text-danger-600"><span>Cash-in-lieu adjustment (-30%)</span><span className="font-mono">-{formatCurrency(Math.round(settlementRange.estimatedGarageCost * 0.3))}</span></div>
                            <div className="flex justify-between text-danger-600"><span>Depreciation deduction</span><span className="font-mono">-{formatCurrency(800)}</span></div>
                            <div className="flex justify-between text-danger-600"><span>Policy deductible</span><span className="font-mono">-{formatCurrency(1000)}</span></div>
                            <Separator />
                            <div className="flex justify-between font-semibold"><span>Recommended Offer</span><span className="font-mono">{formatCurrency(settlementRange.recommendedOffer)}</span></div>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Component</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costBreakdown.items.map((item, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{item.component}</TableCell>
                                <TableCell><Badge variant="secondary" className="text-xs">{item.category.replace('_', ' ')}</Badge></TableCell>
                                <TableCell>{item.description}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(item.total)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2 border-border font-semibold">
                              <TableCell colSpan={3} className="text-right">Subtotal</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.subtotal)}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell colSpan={3} className="text-right">Taxes (GST 18%)</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.taxes)}</TableCell>
                            </TableRow>
                            <TableRow className="bg-slate-50 font-bold">
                              <TableCell colSpan={3} className="text-right">Total Estimated Garage Repair Cost</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(costBreakdown.total)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-elevated animate-scale-in">
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
                <Info className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Confirm Settlement</h3>
              <p className="mt-2 text-slate-500">Are you sure you want to accept the offer of <strong>{formatCurrency(settlement.currentOffer)}</strong>?</p>
              <p className="mt-1 text-sm text-slate-400">This action will finalize the demo settlement.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmation(false)}>Cancel</Button>
              <Button variant="success" className="flex-1" onClick={handleConfirmAccept}>Confirm & Accept</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}