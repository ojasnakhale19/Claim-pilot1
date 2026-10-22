import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, CheckCircle, Plus, Loader2, ChevronUp, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { CardContent, CardFooter } from '../ui/Card';
import { cn, formatNumber } from '../../lib/utils';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: Date;
  isOffer?: boolean;
  offerAmount?: number;
}

interface FuturisticChatProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  isBotTyping: boolean;
  chatStage: 'initial' | 'negotiating' | 'confirmed';
  offerAccepted: boolean;
  currentOffer: number;
  assessment: {
    data: {
      settlementOffer: number;
      settlementMin: number;
      settlementMax: number;
      costMin: number;
      costMax: number;
      component: string;
      severity: string;
    };
  } | null;
  onSendMessage: (overrideText?: string) => void;
  onConfirmOffer: () => void;
  onIncreaseOffer: () => void;
  onEscalate?: () => void;
  disabled?: boolean;
}

interface SettlementBreakdown {
  grossRepairCost: { min: number; max: number };
  depreciation: { amount: number; percentage: number; reason: string };
  deductible: { amount: number; description: string };
  exclusions: { amount: number; description: string; items: string[] }[];
  netSettlement: number;
  breakdownItems: { category: string; description: string; amount: number; type: 'addition' | 'deduction' }[];
}

// Settlement Breakdown Modal Component
function SettlementBreakdownModal({ 
  breakdown, 
  isOpen, 
  onClose, 
  onConfirm,
  onEscalate
}: { 
  breakdown: SettlementBreakdown | null; 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void;
  onEscalate?: () => void;
}) {
  // Guard BEFORE any property access — breakdown may be null while modal is animating closed
  if (!isOpen || !breakdown) return null;

  const hasExclusions = breakdown.exclusions != null && breakdown.exclusions.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-breakdown-title"
      >
        <motion.div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-graphite-900/95 backdrop-blur-2xl border border-graphite-700 shadow-[0_0_80px_-20px_rgba(0,0,0,0.8)]"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 p-6 border-b border-graphite-700 bg-gradient-to-r from-graphite-900 to-graphite-800 rounded-t-3xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric-500/10 border border-electric-500/20">
                <Zap className="h-5 w-5 text-electric-400" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settlement-breakdown-title" className="text-lg font-bold text-graphite-100">Settlement Breakdown</h2>
                <p className="text-xs text-graphite-500 font-mono">ClaimPilot AI Assessment</p>
              </div>
            </div>
            <motion.button
              onClick={onClose}
              className="p-2 rounded-xl bg-graphite-800/50 border border-graphite-700 text-graphite-400 hover:text-electric-400 hover:border-electric-500/50 transition-all"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Close settlement breakdown"
            >
              <X className="h-5 w-5" />
            </motion.button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Gross Repair Cost */}
            <div className="rounded-2xl border border-graphite-700 bg-graphite-900/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">GROSS REPAIR ESTIMATE</span>
                <span className="text-xs font-mono text-electric-400">AI ESTIMATE</span>
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-gradient-electric">
                ₹{breakdown.grossRepairCost.min.toLocaleString('en-IN')} – ₹{breakdown.grossRepairCost.max.toLocaleString('en-IN')}
              </div>
              <p className="mt-2 text-sm text-graphite-400">Estimated garage repair cost range (parts + labor + paint)</p>
            </div>

            {/* Deductions */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono text-graphite-400 uppercase tracking-wider">DEDUCTIONS</h4>
              
              {/* Depreciation */}
              <div className="rounded-xl border border-graphite-700 bg-graphite-900/30 p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">DEPRECIATION</span>
                    <span className="text-xs font-mono text-amber-400">{breakdown.depreciation.percentage}%</span>
                  </div>
                  <p className="text-xs text-graphite-500">{breakdown.depreciation.reason}</p>
                </div>
                <div className="text-right">
                  <motion.p
                    className="text-2xl font-bold font-mono text-amber-400"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    -₹{breakdown.depreciation.amount.toLocaleString('en-IN')}
                  </motion.p>
                </div>
              </div>

              {/* Deductible */}
              <div className="rounded-xl border border-graphite-700 bg-graphite-900/30 p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">POLICY DEDUCTIBLE</span>
                  <p className="mt-1 text-xs text-graphite-500">{breakdown.deductible.description}</p>
                </div>
                <div className="text-right">
                  <motion.p
                    className="text-2xl font-bold font-mono text-danger-400"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    -₹{breakdown.deductible.amount.toLocaleString('en-IN')}
                  </motion.p>
                </div>
              </div>

              {/* Exclusions */}
              {(breakdown.exclusions ?? []).length > 0 && (
                <div className="rounded-xl border border-danger-500/30 bg-danger-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-danger-400" />
                    <span className="text-xs font-mono text-danger-400 uppercase tracking-wider">POLICY EXCLUSIONS</span>
                  </div>
                  <div className="space-y-2">
                    {breakdown.exclusions.map((exc, i) => (
                      <motion.div
                        key={i}
                        className="flex items-center justify-between gap-4 p-3 rounded-lg bg-graphite-900/50 border border-graphite-700"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                      >
                        <div>
                          <p className="text-sm text-danger-300 font-medium">{exc.items.join(', ')}</p>
                          <p className="text-xs text-graphite-500">{exc.description}</p>
                        </div>
                        <motion.p
                          className="text-lg font-bold font-mono text-danger-400"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                        >
                          -₹{exc.amount.toLocaleString('en-IN')}
                        </motion.p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Net Settlement */}
            <motion.div
              className="rounded-2xl border-2 border-electric-500/30 bg-gradient-to-r from-electric-500/10 to-cyan-500/10 p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">NET CASH SETTLEMENT</span>
                <span className="text-xs font-mono text-electric-400">INSTANT PAYOUT</span>
              </div>
              <motion.p
                className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-gradient-electric"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              >
                ₹{breakdown.netSettlement.toLocaleString('en-IN')}
              </motion.p>
              <p className="mt-2 text-sm text-graphite-400 text-center">
                Instant cash payout • No garage bills • No deductible delays
              </p>
            </motion.div>

            {/* Breakdown Items Table */}
            <div className="rounded-xl border border-graphite-700 bg-graphite-900/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-graphite-700">
                <h4 className="text-xs font-mono text-graphite-400 uppercase tracking-wider">DETAILED BREAKDOWN</h4>
              </div>
              <div className="divide-y divide-graphite-700">
                {(breakdown.breakdownItems ?? []).map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 gap-4 transition-colors hover:bg-graphite-800/50"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-graphite-100 truncate">{item.category}</p>
                      <p className="text-xs text-graphite-500 truncate">{item.description}</p>
                    </div>
                    <motion.p
                      className={`text-lg font-bold font-mono tabular-nums ${item.type === 'addition' ? 'text-success-400' : 'text-danger-400'} whitespace-nowrap`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
                    >
                      {item.type === 'addition' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
                    </motion.p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 z-10 flex gap-3 p-6 border-t border-graphite-700 bg-gradient-to-r from-graphite-900 to-graphite-800 rounded-b-3xl">
            <motion.button
              onClick={onClose}
              className="flex-1 gap-2 px-6 py-3 rounded-xl border border-graphite-600 bg-transparent text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10 transition-all font-medium"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </motion.button>
            {hasExclusions ? (
              <>
                <motion.button
                  onClick={onEscalate || onClose}
                  className="flex-1 gap-2 px-6 py-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500 transition-all font-medium"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Escalate to Human Review
                </motion.button>
                <motion.button
                  onClick={onConfirm}
                  className="flex-1 gap-2 px-6 py-3 rounded-xl border border-graphite-600 bg-transparent text-graphite-400 hover:border-graphite-400 hover:text-graphite-300 transition-all font-medium opacity-50 cursor-not-allowed"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  disabled
                >
                  <CheckCircle className="h-4 w-4" />
                  Confirm Settlement (Blocked)
                </motion.button>
              </>
            ) : (
              <motion.button
                onClick={onConfirm}
                className="flex-1 gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-success-500 to-emerald-500 text-background font-semibold shadow-[0_0_30px_-5px_rgba(34,197,94,0.4)] hover:from-success-400 hover:to-emerald-400 transition-all"
                whileHover={{ y: -2, boxShadow: '0 0 40px -5px rgba(34,197,94,0.5)' }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                <CheckCircle className="h-4 w-4" />
                Confirm Settlement
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function FuturisticChat({
  messages,
  chatInput,
  setChatInput,
  isBotTyping,
  chatStage: _chatStage,
  offerAccepted,
  currentOffer,
  assessment,
  onSendMessage,
  onConfirmOffer,
  onIncreaseOffer,
  onEscalate,
  disabled = false,
}: FuturisticChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showOfferDetails, setShowOfferDetails] = useState(true);
  const [showSettlementBreakdown, setShowSettlementBreakdown] = useState(false);
  const [settlementBreakdown, setSettlementBreakdown] = useState<any>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6 animate-in mobile-flex-col" role="region" aria-label="Settlement negotiation">
      {/* Chat Header */}
      <motion.div
        className="flex items-center justify-between gap-4 mobile-flex-col mobile-items-center mobile-gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric-500/10 border border-electric-500/20"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <Zap className="h-5 w-5 text-electric-400" aria-hidden="true" />
          </motion.div>
          <div>
            <h3 className="text-lg font-bold text-graphite-100">Settlement Negotiation</h3>
            <p className="text-xs text-graphite-500 font-mono mobile-text-xs">
              {assessment ? `ASSESSMENT: ${assessment.data.component.toUpperCase()} · ${assessment.data.severity.toUpperCase()}` : 'AWAITING ASSESSMENT'}
            </p>
          </div>
        </div>
        <motion.button
            onClick={() => setShowOfferDetails(!showOfferDetails)}
            className="p-2 rounded-xl bg-graphite-800/50 border border-graphite-700 text-graphite-400 hover:text-electric-400 hover:border-electric-500/50 transition-all touch-target-comfortable"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label={showOfferDetails ? 'Hide offer panel' : 'Show offer panel'}
          >
            {showOfferDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </motion.button>
      </motion.div>

      {/* Chat Messages */}
      <motion.div
        className="rounded-3xl border border-graphite-700 bg-graphite-900/50 backdrop-blur-2xl overflow-hidden mobile-h-full"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Tech header bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-electric-500/50 to-transparent" aria-hidden="true" />
        
        <div className="relative flex-1 overflow-y-auto p-4 space-y-4 mobile-h-[300px] h-[400px]" ref={chatContainerRef}>
          {/* Connection status */}
          <motion.div
            className="flex items-center justify-center gap-2 text-[10px] font-mono text-graphite-500 py-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="relative flex h-1.5 w-1.5 rounded-full bg-success-500" />
            <span>SECURE CHANNEL ESTABLISHED</span>
            <span className="text-electric-400">ENCRYPTED</span>
          </motion.div>
          
          <AnimatePresence mode="popLayout">
            {messages.map((msg, index) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                index={index}
                formatTime={formatTime}
              />
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {isBotTyping && (
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <motion.div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-electric-500/10 border border-electric-500/20"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Zap className="h-4 w-4 text-electric-400" />
              </motion.div>
              <motion.div
                className="flex gap-1 items-center px-4 py-2.5 rounded-2xl bg-graphite-800/50 border border-graphite-700"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-electric-400/60" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-electric-400/60" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-electric-400/60" style={{ animationDelay: '300ms' }} />
                <span className="ml-2 text-xs text-graphite-500 font-mono">ANALYZING</span>
              </motion.div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <CardFooter className="border-t border-graphite-700 p-4 bg-graphite-900/30 relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-electric-500/30 to-transparent" aria-hidden="true" />

          {offerAccepted && !currentOffer && assessment && (
            <motion.div
              className="mb-3 p-3 rounded-xl bg-success-500/10 border border-success-500/30 flex items-center gap-3"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-500/20">
                <CheckCircle className="h-5 w-5 text-success-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-success-400">Offer Accepted: ₹{formatNumber(assessment.data.settlementOffer)}</p>
                <p className="text-xs text-graphite-400 mt-0.5">Confirm below to finalize the settlement</p>
              </div>
            </motion.div>
          )}

          <div className="flex gap-2">
            <motion.div
              className="relative flex-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSendMessage();
                  }
                }}
                placeholder={isBotTyping ? 'ClaimPilot is analyzing…' : 'Enter counteroffer or message…'}
                disabled={isBotTyping || disabled}
                className="w-full h-12 px-5 rounded-xl border border-graphite-600 bg-graphite-900/50 text-base placeholder:text-graphite-500 focus:outline-none focus:ring-2 focus:ring-electric-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Chat message input"
              />
              {/* Input accent line */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-electric-500 to-transparent rounded-full" />
            </motion.div>

            <motion.button
              onClick={() => onSendMessage()}
              disabled={!chatInput.trim() || isBotTyping || disabled}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-electric-500 to-cyan-500 text-background font-medium shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all touch-target-comfortable"
              whileHover={{ scale: 1.05, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.6)' }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </motion.button>
          </div>

          <p className="mt-3 text-center text-[11px] text-graphite-500 font-mono mobile-text-xs">
            Commands: <span className="text-electric-400">"₹5000"</span> • <span className="text-amber-400">"more"</span> • <span className="text-graphite-400">"breakdown"</span> • <span className="text-success-400">"accept"</span>
          </p>
        </CardFooter>
      </motion.div>

      {/* Offer Summary Panel */}
      <AnimatePresence mode="wait">
        {showOfferDetails && assessment && assessment.data.severity !== 'uncertain' && (
          <motion.div
            className="rounded-3xl border border-electric-500/20 bg-gradient-to-br from-electric-500/5 via-surface/80 to-graphite-900/80 backdrop-blur-2xl overflow-hidden relative"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Animated border */}
            <motion.div
              className="absolute inset-0 border border-electric-500/30 pointer-events-none"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            <CardContent className="pt-6 pb-4 px-4 sm:px-6">
              <div className="flex items-center justify-between mb-5 mobile-flex-col mobile-items-center mobile-gap-4">
                <motion.h4
                  className="font-medium text-graphite-100 flex items-center gap-2"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-electric-500/10">
                    <Zap className="h-3.5 w-3.5 text-electric-400" />
                  </span>
                  CURRENT OFFER
                </motion.h4>
              </div>

              <motion.div
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-5 mobile-flex-col mobile-items-center mobile-gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="relative mobile-text-center">
                  <p className="text-[10px] font-mono text-graphite-400 uppercase tracking-wider mb-1 mobile-text-xs">SETTLEMENT AMOUNT</p>
                  <motion.p
                    className="text-4xl font-bold font-mono tabular-nums text-gradient-electric mobile-text-3xl"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    ₹{formatNumber(currentOffer || assessment.data.settlementOffer)}
                  </motion.p>
                </div>

                <div className="text-right sm:text-right relative mobile-text-center">
                  <p className="text-[10px] font-mono text-graphite-400 uppercase tracking-wider mb-1 mobile-text-xs">PERMITTED RANGE</p>
                  <motion.p
                    className="text-sm font-medium text-graphite-200 font-mono tabular-nums mobile-text-base"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    ₹{formatNumber(assessment.data.settlementMin)} – ₹{formatNumber(assessment.data.settlementMax)}
                  </motion.p>
                </div>
              </motion.div>

              {/* Range visualization */}
              <motion.div
                className="relative h-3 bg-graphite-800 rounded-full overflow-hidden"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="absolute inset-0 flex items-center justify-between px-1">
                  <span className="text-[9px] font-mono text-graphite-500 -translate-x-1/2">₹{formatNumber(assessment.data.settlementMin)}</span>
                  <span className="text-[9px] font-mono text-electric-400">₹{formatNumber(currentOffer || assessment.data.settlementOffer)}</span>
                  <span className="text-[9px] font-mono text-graphite-500 -translate-x-1/2">₹{formatNumber(assessment.data.settlementMax)}</span>
                </div>
                
                {/* Range segments */}
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-gradient-to-r from-graphite-700 to-amber-500/50" />
                  <div className="w-px h-full bg-electric-500/50" style={{ left: `${((currentOffer || assessment.data.settlementOffer) - assessment.data.settlementMin) / (assessment.data.settlementMax - assessment.data.settlementMin) * 100}%` }} />
                  <div className="flex-1 bg-gradient-to-r from-amber-500/50 to-graphite-700" />
                </div>

                {/* Offer position marker */}
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-electric-400 border-2 border-background shadow-glow-electric"
                  style={{ left: `${((currentOffer || assessment.data.settlementOffer) - assessment.data.settlementMin) / (assessment.data.settlementMax - assessment.data.settlementMin) * 100}%` }}
                  animate={{ scale: [1, 1.2, 1], boxShadow: ['0 0 0 0 rgba(14,165,233,0.4)', '0 0 15px 5px rgba(14,165,233,0.3)', '0 0 0 0 rgba(14,165,233,0.4)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>

              <motion.p
                className="mt-3 text-center text-[10px] text-graphite-500 font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Position within permitted settlement range
              </motion.p>
            </CardContent>

            <CardFooter className="px-6 pb-6 pt-0 border-t border-graphite-700/50">
              {offerAccepted ? (
                <motion.button
                  onClick={() => {
                    setSettlementBreakdown({
                      grossRepairCost: { 
                        min: assessment?.data?.costMin || 0, 
                        max: assessment?.data?.costMax || 0 
                      },
                      depreciation: { 
                        amount: Math.round(((assessment?.data?.costMin || 0) + (assessment?.data?.costMax || 0)) / 2 * 0.15),
                        percentage: 15,
                        reason: 'Standard depreciation for vehicle age'
                      },
                      deductible: { 
                        amount: 1000, 
                        description: 'Policy deductible (standard comprehensive)' 
                      },
                      exclusions: [],
                      netSettlement: currentOffer || assessment?.data?.settlementOffer || 0,
                      breakdownItems: [
                        { category: 'Gross Repair Cost', description: 'Estimated repair cost', amount: Math.round(((assessment?.data?.costMin || 0) + (assessment?.data?.costMax || 0)) / 2), type: 'addition' },
                        { category: 'Depreciation', description: 'Standard depreciation (15%)', amount: -Math.round(((assessment?.data?.costMin || 0) + (assessment?.data?.costMax || 0)) / 2 * 0.15), type: 'deduction' },
                        { category: 'Policy Deductible', description: 'Standard comprehensive deductible', amount: -1000, type: 'deduction' },
                        { category: 'Net Cash Settlement', description: 'Final cash settlement offer', amount: currentOffer || assessment?.data?.settlementOffer || 0, type: 'addition' },
                      ],
                    });
                    setShowSettlementBreakdown(true);
                  }}
                  className="w-full gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-success-500 to-emerald-500 text-background font-semibold shadow-[0_0_30px_-5px_rgba(34,197,94,0.4)] hover:from-success-400 hover:to-emerald-400 transition-all"
                  whileHover={{ y: -2, boxShadow: '0 0 40px -5px rgba(34,197,94,0.5)' }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <CheckCircle className="h-4 w-4" />
                  View Settlement Breakdown
                </motion.button>
              ) : (
                <motion.button
                  onClick={onIncreaseOffer}
                  className="w-full gap-2 px-6 py-3 rounded-xl border-2 border-electric-500/30 bg-transparent text-electric-400 hover:bg-electric-500/10 hover:border-electric-500 transition-all font-medium"
                  whileHover={{ y: -2, borderColor: 'rgba(14, 165, 233, 1)', backgroundColor: 'rgba(14, 165, 233, 0.15)' }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Plus className="h-4 w-4" />
                  Increase Offer (+₹500)
                </motion.button>
              )} 
            </CardFooter>
          </motion.div>
        )} 
      </AnimatePresence>

      {/* Suggested Replies */}
      <AnimatePresence mode="wait">
        {!offerAccepted && assessment && assessment.data.severity !== 'uncertain' && (
          <motion.div
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.7 }}
          >
            <QuickReply
              label="Request Higher Offer"
              onClick={() => onSendMessage('Can you offer a higher settlement?')}
              icon={<Plus className="h-3.5 w-3.5" />}
              variant="electric"
            />
            <QuickReply
              label="Cost Breakdown"
              onClick={() => onSendMessage('Show me the cost breakdown')}
              icon={<Loader2 className="h-3.5 w-3.5" />}
              variant="cyan"
            />
            <QuickReply
              label="Explain Difference"
              onClick={() => onSendMessage('Why is the offer lower than repair cost?')}
              icon={<Zap className="h-3.5 w-3.5" />}
              variant="amber"
            />
          </motion.div>
        )} 
      </AnimatePresence>

        {/* Settlement Breakdown Modal */}
        <SettlementBreakdownModal
          breakdown={settlementBreakdown}
          isOpen={showSettlementBreakdown}
          onClose={() => setShowSettlementBreakdown(false)}
          onConfirm={onConfirmOffer}
          onEscalate={onEscalate}
        />
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  index: number;
  formatTime: (date: Date) => string;
}

function ChatMessageBubble({ message, index, formatTime }: ChatMessageBubbleProps) {
  const isUser = message.sender === 'user';
  const isOffer = message.isOffer;

  return (
    <motion.div
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 20, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: isUser ? 20 : -20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      {!isUser && (
        <motion.div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric-500/10 border border-electric-500/20"
          animate={{ rotate: isOffer ? [0, -5, 5, 0] : 0 }}
          transition={{ duration: 1, repeat: isOffer ? Infinity : 0, delay: 0.5 }}
        >
          <Zap className={cn('h-4 w-4', isOffer ? 'text-electric-400' : 'text-graphite-400')} />
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={message.id}
          className={cn(
            'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed relative',
            isUser
              ? 'rounded-tr-md bg-gradient-to-br from-electric-500 to-cyan-500 text-background'
              : 'rounded-tl-md bg-graphite-800/50 text-graphite-100 border border-graphite-700',
            isOffer && 'ring-2 ring-electric-500/50'
          )}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {isOffer && (
            <motion.div
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-electric-500 text-background text-[9px] font-bold"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ₹1
            </motion.div>
          )}
          <p className="whitespace-pre-wrap">{message.text}</p>
          <p className={cn('mt-2 text-[10px] font-mono', isUser ? 'text-background/70' : 'text-graphite-500')}>
            {formatTime(message.timestamp)}
          </p>
        </motion.div>
      </AnimatePresence>

      {isUser && (
        <motion.div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-graphite-800/50 border border-graphite-700"
        >
          <span className="text-[10px] font-mono text-graphite-400">USR</span>
        </motion.div>
      )}
    </motion.div>
  );
}

interface QuickReplyProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  variant: 'electric' | 'cyan' | 'amber';
}

function QuickReply({ label, onClick, icon, variant }: QuickReplyProps) {
  const variantStyles = {
    electric: 'border-electric-500/30 hover:border-electric-500 hover:bg-electric-500/10 hover:text-electric-400',
    cyan: 'border-cyan-500/30 hover:border-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400',
    amber: 'border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-400',
  };

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'h-9 px-4 rounded-xl border font-medium text-sm text-graphite-300 transition-all',
        'bg-graphite-900/50 backdrop-blur',
        variantStyles[variant]
      )}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </motion.button>
  );
}