/**
 * AI Negotiation & Reasoning Assistant
 * Supports Gemini 1.5 Flash / OpenAI GPT-4o-mini / Local Fallback
 */

export interface AIAnalysisRequest {
  vehicle: {
    company: string;
    model: string;
    causeOfDamage: string;
  };
  damageSummary: string;
  severity: string;
  primaryComponent: string;
  costMin: number;
  costMax: number;
  settlementOffer: number;
  settlementMin: number;
  settlementMax: number;
  userMessage?: string;
  chatHistory?: Array<{ sender: 'user' | 'bot'; text: string }>;
  apiKey?: string;
  provider?: 'gemini' | 'openai' | 'rule-based';
  // Structured damage items from the OpenAI assessment (optional but improves negotiation accuracy)
  damageItems?: Array<{
    component: string;
    damageType: string;
    severity: string;
    status: string;
    recommendation: string;
    costEstimateMin: number;
    costEstimateMax: number;
    evidenceDescription?: string;
  }>;
  overallReasoning?: string;
  executionMode?: string;
}

export interface AIAnalysisResponse {
  message: string;
  newOffer?: number;
  isOffer?: boolean;
  recommendation?: string;
  reasoning?: string;
  settlementBreakdown?: SettlementBreakdown;
  exclusionDetected?: boolean;
  exclusionReason?: string;
}

export interface SettlementBreakdown {
  grossRepairCost: { min: number; max: number };
  depreciation: { amount: number; percentage: number; reason: string };
  deductible: { amount: number; description: string };
  exclusions: { amount: number; description: string; items: string[] }[];
  netSettlement: number;
  breakdownItems: BreakdownItem[];
}

export interface DamageReportRequest {
  vehicle: {
    company: string;
    model: string;
    year?: string;
    variant?: string;
    causeOfDamage: string;
  };
  assessment: {
    component: string;
    damageType: string;
    severity: string;
    costMin: number;
    costMax: number;
    repairApproach: string;
    explanation: string;
    settlementOffer: number;
    settlementMin: number;
    settlementMax: number;
  };
  settlementBreakdown: SettlementBreakdown;
  chatHistory: Array<{ sender: 'user' | 'bot'; text: string }>;
  finalSettlementAmount: number;
  claimReference: string;
  assessmentViews?: Record<string, {
    detection_count: number;
    detections: Array<{ damage_type: string; confidence: number; bounding_box_xyxy: number[] }>;
  }>;
  apiKey?: string;
  provider?: 'gemini' | 'openai' | 'rule-based';
}

export interface DamageReportResponse {
  report: string;
  reportHtml: string;
  generatedAt: string;
  claimReference: string;
}

export interface BreakdownItem {
  category: string;
  description: string;
  amount: number;
  type: 'addition' | 'deduction';
}

/**
 * Call Gemini Flash API for smart negotiation responses
 */
async function callGemini(
  prompt: string,
  apiKey: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Call OpenAI API (e.g. gpt-4o-mini)
 */
async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 500,
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Get intelligent AI response combining local model stats with LLM reasoning
 */
export async function generateAINegotiationResponse(
  req: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const apiKey = req.apiKey || localStorage.getItem('claimpilot_llm_key') || '';
  const provider = req.provider || (localStorage.getItem('claimpilot_llm_provider') as any) || (apiKey.startsWith('AIza') ? 'gemini' : apiKey.startsWith('sk-') ? 'openai' : 'rule-based');

  // Build structured damage detail block when items are available
  const damageDetail = (req.damageItems && req.damageItems.length > 0)
    ? `\nDetailed Damage Findings (${req.damageItems.length} unique component(s), assessed by OpenAI vision):\n` +
      req.damageItems.map((it, i) =>
        `  ${i + 1}. ${it.component} — ${it.damageType} (${it.severity}, ${it.status})` +
        (it.recommendation ? `, recommended: ${it.recommendation}` : '') +
        (it.costEstimateMin > 0 ? `, est. ₹${it.costEstimateMin.toLocaleString('en-IN')}–₹${it.costEstimateMax.toLocaleString('en-IN')}` : '') +
        (it.evidenceDescription ? `\n     Evidence: ${it.evidenceDescription.slice(0, 100)}` : '')
      ).join('\n')
    : '';

  const reasoningNote = req.overallReasoning
    ? `\nAI Assessor Reasoning: ${req.overallReasoning.slice(0, 300)}`
    : '';

  const systemContext = `You are ClaimPilot AI, a knowledgeable, professional motor insurance settlement adjuster assistant.
You are negotiating a fast cash settlement with a claimant for vehicle damage.
Vehicle: ${req.vehicle.company || 'Unknown'} ${req.vehicle.model || 'Vehicle'}.
Reported Incident: ${req.vehicle.causeOfDamage || 'Accident collision'}.
Assessed Damage by Computer Vision: ${req.damageSummary} (Severity: ${req.severity}, Component: ${req.primaryComponent}).${damageDetail}${reasoningNote}
Estimated Garage Repair Cost: ₹${req.costMin.toLocaleString('en-IN')} - ₹${req.costMax.toLocaleString('en-IN')}.
Current Permitted Settlement Range: ₹${req.settlementMin.toLocaleString('en-IN')} to ₹${req.settlementMax.toLocaleString('en-IN')}.
Current Offer: ₹${req.settlementOffer.toLocaleString('en-IN')}.

Guidelines:
1. Always maintain a polite, transparent, and empathetic tone.
2. Use the vehicle make/model and cause of damage to inform your reasoning:
   - Luxury/premium models may have higher parts costs
   - Certain causes (e.g., flood, fire) may trigger policy exclusions or escalation
   - Cause of damage affects liability and coverage determination
3. If the user asks for more money:
   - If they specify an amount <= ₹${req.settlementMax}, consider granting or counter-offering close to it.
   - If they specify an amount > ₹${req.settlementMax}, explain politely that insurance guidelines limit the maximum cash buyout to ₹${req.settlementMax.toLocaleString('en-IN')}, and offer that maximum.
   - If they just say "more" or "increase", offer an increment (e.g. +₹500 to +₹1,000) capped at ₹${req.settlementMax}.
4. If they ask why the cash offer is lower than repair cost: explain standard insurer settlement formulas (deductibles, retail labor vs negotiated rates, depreciation).
5. If they accept or agree: confirm clearly and prompt them to finalize.
6. If cause of damage suggests policy exclusion (e.g., wear and tear, intentional damage, racing), recommend escalation to human review.
7. Reference specific damaged components by name when explaining the offer — don't be vague.
8. Always keep replies concise (under 3 sentences).`;

  if (provider === 'gemini' && apiKey) {
    try {
      const fullPrompt = `${systemContext}\n\nClaimant said: "${req.userMessage || 'Hello, can you explain the settlement offer?'}"\n\nProvide your response. If you are proposing a specific offer amount, explicitly mention "₹[amount]".`;
      const responseText = await callGemini(fullPrompt, apiKey);

      // Extract offer if present
      const match = responseText.match(/₹\s?([\d,]+)/);
      let newOffer: number | undefined;
      if (match) {
        const val = parseInt(match[1].replace(/,/g, ''), 10);
        if (val >= req.settlementMin && val <= req.settlementMax) {
          newOffer = val;
        }
      }

      return {
        message: responseText.trim(),
        newOffer,
        isOffer: Boolean(newOffer),
      };
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local reasoning:', err);
    }
  }

  if (provider === 'openai' && apiKey) {
    try {
      const responseText = await callOpenAI(
        systemContext,
        req.userMessage || 'Hello, can you explain the settlement offer?',
        apiKey
      );

      const match = responseText.match(/₹\s?([\d,]+)/);
      let newOffer: number | undefined;
      if (match) {
        const val = parseInt(match[1].replace(/,/g, ''), 10);
        if (val >= req.settlementMin && val <= req.settlementMax) {
          newOffer = val;
        }
      }

      return {
        message: responseText.trim(),
        newOffer,
        isOffer: Boolean(newOffer),
      };
    } catch (err) {
      console.warn('OpenAI API call failed, falling back to local reasoning:', err);
    }
  }

  // High quality local rule-based fallback (no API key needed)
  return getLocalIntelligentResponse(req);
}

function calculateSettlementBreakdown(req: AIAnalysisRequest): SettlementBreakdown {
  const grossMin = req.costMin;
  const grossMax = req.costMax;
  const vehicleAge = (req.vehicle as any).year ? new Date().getFullYear() - (req.vehicle as any).year : 5;
  const causeOfDamage = req.vehicle.causeOfDamage || 'Accident';
  const severity = req.severity;
  
  // Calculate depreciation based on vehicle age and severity
  let depreciationPct = 0;
  let depreciationReason = '';
  if (vehicleAge > 10) {
    depreciationPct = 0.35;
    depreciationReason = 'Vehicle age > 10 years (high depreciation)';
  } else if (vehicleAge > 7) {
    depreciationPct = 0.25;
    depreciationReason = 'Vehicle age 7-10 years';
  } else if (vehicleAge > 4) {
    depreciationPct = 0.15;
    depreciationReason = 'Vehicle age 4-7 years';
  } else if (vehicleAge > 1) {
    depreciationPct = 0.08;
    depreciationReason = 'Vehicle age 1-4 years';
  } else {
    depreciationPct = 0.03;
    depreciationReason = 'New vehicle (minimal depreciation)';
  }
  
  // Adjust for severity
  if (severity === 'severe') depreciationPct += 0.05;
  else if (severity === 'minor') depreciationPct -= 0.02;
  depreciationPct = Math.max(0.03, Math.min(0.5, depreciationPct));
  
  const avgGross = (grossMin + grossMax) / 2;
  const depreciationAmount = Math.round(avgGross * depreciationPct);
  
  // Deductible (standard ₹500-1000 based on policy)
  const deductibleAmount = 1000;
  
  // Exclusions based on cause of damage
  const exclusions: SettlementBreakdown['exclusions'] = [];
  const exclusionaryCauses = [
    { keyword: 'wear', description: 'Wear and tear', amount: 0.15 },
    { keyword: 'tear', description: 'Wear and tear', amount: 0.15 },
    { keyword: 'rust', description: 'Rust/corrosion', amount: 0.20 },
    { keyword: 'corrosion', description: 'Rust/corrosion', amount: 0.20 },
    { keyword: 'mechanical failure', description: 'Mechanical failure', amount: 0.25 },
    { keyword: 'electrical fault', description: 'Electrical fault', amount: 0.20 },
    { keyword: 'intentional', description: 'Intentional damage', amount: 0.50 },
    { keyword: 'racing', description: 'Racing/competition', amount: 0.50 },
    { keyword: 'drunk', description: 'DUI/impairment', amount: 0.50 },
    { keyword: 'dui', description: 'DUI/impairment', amount: 0.50 },
    { keyword: 'under influence', description: 'DUI/impairment', amount: 0.50 },
    { keyword: 'flood', description: 'Flood damage', amount: 0.30 },
    { keyword: 'fire', description: 'Fire damage', amount: 0.30 },
  ];
  
  const excludedItems: string[] = [];
  let totalExclusionPct = 0;
  for (const exc of exclusionaryCauses) {
    if (causeOfDamage.toLowerCase().includes(exc.keyword)) {
      excludedItems.push(exc.description);
      totalExclusionPct += exc.amount;
    }
  }
  
  if (excludedItems.length > 0) {
    exclusions.push({
      amount: Math.round(avgGross * totalExclusionPct),
      description: `Policy exclusion: ${excludedItems.join(', ')}`,
      items: excludedItems,
    });
  }
  
  // Deductible
  const deductible = {
    amount: deductibleAmount,
    description: 'Policy deductible (standard comprehensive)',
  };
  
  // Depreciation
  const depreciation = {
    amount: depreciationAmount,
    percentage: Math.round(depreciationPct * 100),
    reason: depreciationReason,
  };
  
  // Net settlement
  const exclusionAmount = exclusions.reduce((sum, e) => sum + e.amount, 0);
  const netSettlement = Math.round(avgGross - depreciationAmount - deductibleAmount - exclusionAmount);
  
  // Breakdown items
  const breakdownItems: BreakdownItem[] = [
    { category: 'Gross Repair Cost', description: `Estimated repair (₹${grossMin.toLocaleString('en-IN')} - ₹${grossMax.toLocaleString('en-IN')})`, amount: Math.round(avgGross), type: 'addition' },
    { category: 'Depreciation', description: `${depreciation.reason} (${depreciation.percentage}%)`, amount: -depreciation.amount, type: 'deduction' },
    { category: 'Policy Deductible', description: deductible.description, amount: -deductible.amount, type: 'deduction' },
  ];
  
  for (const exc of exclusions) {
    breakdownItems.push({
      category: 'Policy Exclusion',
      description: exc.description,
      amount: -exc.amount,
      type: 'deduction',
    });
  }
  
  breakdownItems.push({
    category: 'Net Cash Settlement',
    description: 'Final cash settlement offer',
    amount: netSettlement,
    type: 'addition',
  });
  
  return {
    grossRepairCost: { min: grossMin, max: grossMax },
    depreciation,
    deductible,
    exclusions,
    netSettlement,
    breakdownItems,
  };
}

function getLocalIntelligentResponse(req: AIAnalysisRequest): AIAnalysisResponse {
  const text = (req.userMessage || '').toLowerCase();
  const max = req.settlementMax;
  const current = req.settlementOffer;
  const vehicleModel = req.vehicle.model || 'Vehicle';
  const vehicleCompany = req.vehicle.company || 'Unknown';
  const causeOfDamage = req.vehicle.causeOfDamage || 'Accident';
  
  // Check for exclusionary causes
  const exclusionaryCauses = ['wear', 'tear', 'rust', 'corrosion', 'mechanical failure', 'electrical fault', 'intentional', 'racing', 'drunk', 'dui', 'under influence'];
  const isExclusionary = exclusionaryCauses.some(c => causeOfDamage.toLowerCase().includes(c));
  
  // Calculate settlement breakdown
  const settlementBreakdown = calculateSettlementBreakdown(req);
  const exclusionDetected = settlementBreakdown.exclusions.length > 0;
  
  // Extract custom numbers
  const numMatch = text.match(/[₹$]?\s?(\d[\d,]*)/);
  const userNum = numMatch ? parseInt(numMatch[1].replace(/,/g, ''), 10) : null;
  
  // Build settlement breakdown text
  const buildBreakdownMessage = (breakdown: SettlementBreakdown) => {
    let msg = `📋 **Settlement Breakdown for ${req.vehicle.company} ${req.vehicle.model}**\n\n`;
    msg += `**Gross Repair Estimate:** ₹${breakdown.grossRepairCost.min.toLocaleString('en-IN')} - ₹${breakdown.grossRepairCost.max.toLocaleString('en-IN')}\n\n`;
    
    msg += `**Deductions:**\n`;
    for (const item of breakdown.breakdownItems) {
      if (item.type === 'deduction') {
        msg += `• ${item.category}: -₹${Math.abs(item.amount).toLocaleString('en-IN')} (${item.description})\n`;
      }
    }
    
    msg += `\n**Net Cash Settlement: ₹${breakdown.netSettlement.toLocaleString('en-IN')}**\n`;
    msg += `\n*This is a cash settlement offer. Garage repair would cost more due to retail labor rates and OEM parts pricing.*`;
    return msg;
  };
  
  // Check for exclusionary causes first
  if (exclusionDetected && (text.includes('more') || text.includes('higher') || text.includes('increase') || text.includes('counter') || text.includes('accept') || text.includes('agree') || text.includes('yes') || text.includes('ok') || text.includes('confirm'))) {
    return {
      message: `⚠️ **Policy Exclusion Detected**\n\nBased on the reported cause ("${causeOfDamage}"), this claim may involve policy exclusions: ${settlementBreakdown.exclusions.map(e => e.items.join(', ')).join(', ')}.\n\nAs per policy terms, such damages may be excluded or partially covered. This requires human review by a claims adjuster for policy coverage determination.\n\nI recommend escalating to a claims adjuster for further assessment.`,
      isOffer: false,
      recommendation: 'escalate',
      exclusionDetected: true,
      exclusionReason: settlementBreakdown.exclusions.map(e => e.description).join(', '),
      settlementBreakdown,
    };
  }
  
  if (text.includes('more') || text.includes('higher') || text.includes('increase') || text.includes('counter')) {
    if (isExclusionary) {
      return {
        message: `Based on the reported cause (${causeOfDamage}), this may require human review for policy coverage determination. I recommend escalating to a claims adjuster for further assessment.`,
        isOffer: false,
        recommendation: 'escalate',
      };
    }
    
    if (userNum && userNum <= max) {
      return {
        message: `Based on your ${vehicleCompany} ${vehicleModel} damage assessment, we can adjust the settlement offer to ₹${userNum.toLocaleString('en-IN')}. Would this amount be acceptable to proceed?`,
        newOffer: userNum,
        isOffer: true,
      };
    } else if (userNum && userNum > max) {
      return {
        message: `While we understand your request for ₹${userNum.toLocaleString('en-IN')}, our automated policy guidelines for this ${vehicleModel} cap the instant payout at ₹${max.toLocaleString('en-IN')}. We can finalize at ₹${max.toLocaleString('en-IN')}.`,
        newOffer: max,
        isOffer: true,
      };
    } else {
      const incremented = Math.min(max, current + 600);
      return {
        message: `We can increase the instant settlement offer to ₹${incremented.toLocaleString('en-IN')} (authorized ceiling: ₹${max.toLocaleString('en-IN')}). Would you like to accept?`,
        newOffer: incremented,
        isOffer: true,
      };
    }
  }
  
  if (text.includes('why') || text.includes('lower') || text.includes('difference') || text.includes('explain')) {
    return {
      message: `The instant cash settlement (₹${current.toLocaleString('en-IN')}) for your ${vehicleCompany} ${vehicleModel} provides immediate payout without garage bills or deductible delays. It factors standard parts depreciation and insurer-authorized volume labor rates rather than retail walk-in quotes.`,
      isOffer: false,
      settlementBreakdown,
    };
  }
  
  if (text.includes('breakdown') || text.includes('parts') || text.includes('labor')) {
    const breakdown = calculateSettlementBreakdown(req);
    return {
      message: buildBreakdownMessage(breakdown),
      isOffer: false,
      settlementBreakdown: breakdown,
    };
  }
  
  if (text.includes('accept') || text.includes('agree') || text.includes('yes') || text.includes('ok') || text.includes('confirm')) {
    const breakdown = calculateSettlementBreakdown(req);
    return {
      message: `✅ **Settlement Confirmed**\n\n${buildBreakdownMessage(calculateSettlementBreakdown(req))}\n\nPlease click 'Finalize Settlement' below to generate your claim confirmation.`,
      newOffer: current,
      isOffer: true,
      settlementBreakdown: breakdown,
    };
  }
  
  return {
    message: `Thank you for your update. The current settlement offer for your ${vehicleCompany} ${vehicleModel} stands at ₹${current.toLocaleString('en-IN')} (authorized range: ₹${req.settlementMin.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}). You can request a higher amount, ask for a cost breakdown, or accept this offer.`,
    isOffer: false,
    settlementBreakdown: calculateSettlementBreakdown(req),
  };
}

/**
 * Generate comprehensive damage assessment report using LLM
 */
export async function generateDamageReport(
  req: DamageReportRequest
): Promise<DamageReportResponse> {
  const apiKey = req.apiKey || localStorage.getItem('claimpilot_llm_key') || '';
  const provider = req.provider || (localStorage.getItem('claimpilot_llm_provider') as any) || (apiKey.startsWith('AIza') ? 'gemini' : apiKey.startsWith('sk-') ? 'openai' : 'rule-based');

  const systemPrompt = `You are ClaimPilot AI, a professional motor insurance claims reporting specialist.
Generate a comprehensive, formal damage assessment report suitable for insurance records, claimant records, and potential legal review.

Report must include:
1. CLAIM HEADER - Reference, date, claimant/vehicle details
2. INCIDENT SUMMARY - Cause of damage, date/time, location (if available)
3. VEHICLE SPECIFICATIONS - Make, model, year, variant, VIN placeholder
4. DAMAGE ASSESSMENT - Component affected, damage type, severity, detailed description
5. AI INSPECTION DETAILS - Detection methodology, confidence scores, damage items per view
6. REPAIR COST ESTIMATION - Parts, labor, paint, total range (min-max)
7. SETTLEMENT CALCULATION - Gross repair cost, depreciation, deductible, exclusions, net settlement
8. NEGOTIATION HISTORY - Key exchanges, offers made, final agreement
9. TERMS & CONDITIONS - Cash settlement vs garage repair, policy limitations, validity period
10. SIGNATURES - Digital acknowledgment placeholders

Format as professional markdown with clear sections, tables for numerical data, and formal tone.
Use Indian Rupee (₹) formatting with en-IN locale.
Include the claim reference throughout.`;

  const userPrompt = `Generate a comprehensive damage assessment report with the following data:

CLAIM REFERENCE: ${req.claimReference}
GENERATED: ${new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}

VEHICLE DETAILS:
- Make: ${req.vehicle.company}
- Model: ${req.vehicle.model}
- Year: ${req.vehicle.year || 'Not specified'}
- Variant: ${req.vehicle.variant || 'Not specified'}
- Cause of Damage: ${req.vehicle.causeOfDamage}

DAMAGE ASSESSMENT:
- Primary Component: ${req.assessment.component}
- Damage Type: ${req.assessment.damageType}
- Severity: ${req.assessment.severity.toUpperCase()}
- Assessment Method: ${req.assessment.repairApproach}
- AI Explanation: ${req.assessment.explanation}

REPAIR COST ESTIMATION:
- Minimum: ₹${req.assessment.costMin.toLocaleString('en-IN')}
- Maximum: ₹${req.assessment.costMax.toLocaleString('en-IN')}

SETTLEMENT DETAILS:
- Initial Offer: ₹${req.assessment.settlementOffer.toLocaleString('en-IN')}
- Permitted Range: ₹${req.assessment.settlementMin.toLocaleString('en-IN')} - ₹${req.assessment.settlementMax.toLocaleString('en-IN')}
- FINAL AGREED SETTLEMENT: ₹${req.finalSettlementAmount.toLocaleString('en-IN')}

SETTLEMENT BREAKDOWN:
${req.settlementBreakdown.breakdownItems.map(item => 
  `  ${item.type === 'addition' ? '+' : '-'} ${item.category}: ${item.description} - ${item.type === 'addition' ? '+' : '-'}₹${Math.abs(item.amount).toLocaleString('en-IN')}`
).join('\n')}

GROSS REPAIR COST: ₹${req.settlementBreakdown.grossRepairCost.min.toLocaleString('en-IN')} - ₹${req.settlementBreakdown.grossRepairCost.max.toLocaleString('en-IN')}
DEPRECIATION: -₹${req.settlementBreakdown.depreciation.amount.toLocaleString('en-IN')} (${req.settlementBreakdown.depreciation.percentage}% - ${req.settlementBreakdown.depreciation.reason})
DEDUCTIBLE: -₹${req.settlementBreakdown.deductible.amount.toLocaleString('en-IN')} (${req.settlementBreakdown.deductible.description})
${req.settlementBreakdown.exclusions.length > 0 ? `EXCLUSIONS: ${req.settlementBreakdown.exclusions.map(e => `-₹${e.amount.toLocaleString('en-IN')} (${e.description})`).join(', ')}` : 'EXCLUSIONS: None'}
NET CASH SETTLEMENT: ₹${req.settlementBreakdown.netSettlement.toLocaleString('en-IN')}

AI INSPECTION VIEWS:
${req.assessmentViews ? Object.entries(req.assessmentViews).map(([view, data]) => 
  `  ${view.toUpperCase()}: ${data.detection_count} detection(s) - ${data.detections.map(d => `${d.damage_type} (${(d.confidence * 100).toFixed(0)}%)`).join(', ') || 'No damage detected'}`
).join('\n') : '  Four-view photo analysis completed'}

NEGOTIATION HISTORY:
${req.chatHistory.map(msg => `${msg.sender === 'user' ? 'Claimant' : 'Adjuster'}: ${msg.text}`).join('\n')}

Generate the complete report in professional markdown format.`;

  if (provider === 'gemini' && apiKey) {
    try {
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nProvide the complete formal report in markdown format.`;
      const responseText = await callGemini(fullPrompt, apiKey);
      
      return {
        report: responseText.trim(),
        reportHtml: markdownToHtml(responseText.trim()),
        generatedAt: new Date().toISOString(),
        claimReference: req.claimReference,
      };
    } catch (err) {
      console.warn('Gemini API call failed for report generation, falling back to local:', err);
    }
  }

  if (provider === 'openai' && apiKey) {
    try {
      const responseText = await callOpenAI(systemPrompt, userPrompt, apiKey);
      
      return {
        report: responseText.trim(),
        reportHtml: markdownToHtml(responseText.trim()),
        generatedAt: new Date().toISOString(),
        claimReference: req.claimReference,
      };
    } catch (err) {
      console.warn('OpenAI API call failed for report generation, falling back to local:', err);
    }
  }

  // High quality local fallback
  return generateLocalDamageReport(req);
}

/**
 * Local fallback report generation (no API key needed)
 */
function generateLocalDamageReport(req: DamageReportRequest): DamageReportResponse {
  const now = new Date();
  const generatedAt = now.toISOString();
  const formattedDate = now.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
  
  const breakdown = req.settlementBreakdown;
  const grossAvg = (breakdown.grossRepairCost.min + breakdown.grossRepairCost.max) / 2;
  
  let report = `# CLAIMPLOT AI - MOTOR DAMAGE ASSESSMENT REPORT\n\n`;
  report += `**Claim Reference:** ${req.claimReference}  \n`;
  report += `**Report Generated:** ${formattedDate}  \n`;
  report += `**Status:** FINAL - Settlement Agreed\n\n`;
  
  report += `---\n\n`;
  
  report += `## 1. CLAIM HEADER\n\n`;
  report += `| Field | Details |\n|-------|---------|\n`;
  report += `| Claim Reference | ${req.claimReference} |\n`;
  report += `| Report Date | ${formattedDate} |\n`;
  report += `| Assessment Type | ${req.assessment.repairApproach} |\n`;
  report += `| Report Status | Final - Settlement Confirmed |\n\n`;
  
  report += `## 2. INCIDENT SUMMARY\n\n`;
  report += `**Cause of Damage:** ${req.vehicle.causeOfDamage}  \n`;
  report += `**Date of Loss:** ${formattedDate.split(',')[0]}  \n`;
  report += `**Location:** Not specified in claim submission  \n\n`;
  
  report += `## 3. VEHICLE SPECIFICATIONS\n\n`;
  report += `| Specification | Details |\n|---------------|---------|\n`;
  report += `| Make | ${req.vehicle.company} |\n`;
  report += `| Model | ${req.vehicle.model} |\n`;
  report += `| Year | ${req.vehicle.year || 'Not specified'} |\n`;
  report += `| Variant | ${req.vehicle.variant || 'Not specified'} |\n`;
  report += `| Registration No. | [To be provided by claimant] |\n`;
  report += `| VIN/Chassis No. | [To be provided by claimant] |\n\n`;
  
  report += `## 4. DAMAGE ASSESSMENT\n\n`;
  report += `| Parameter | Details |\n|-----------|---------|\n`;
  report += `| Primary Component | ${req.assessment.component} |\n`;
  report += `| Damage Type | ${req.assessment.damageType} |\n`;
  report += `| Severity Classification | ${req.assessment.severity.toUpperCase()} |\n`;
  report += `| Assessment Methodology | ${req.assessment.repairApproach} |\n`;
  report += `| AI Confidence | ${req.assessment.explanation} |\n\n`;
  report += `**Detailed Description:** ${req.assessment.explanation}\n\n`;
  
  report += `## 5. AI INSPECTION DETAILS\n\n`;
  if (req.assessmentViews) {
    report += `### Computer Vision Analysis Results\n\n`;
    report += `| View | Detections | Damage Items |\n|------|------------|--------------|\n`;
    for (const [view, data] of Object.entries(req.assessmentViews)) {
      const items = data.detections.length > 0 
        ? data.detections.map(d => `${d.damage_type} (${(d.confidence * 100).toFixed(0)}%)`).join(', ')
        : 'No damage detected';
      report += `| ${view.toUpperCase()} | ${data.detection_count} | ${items} |\n`;
    }
    report += `\n`;
  }
  report += `**Note:** Assessment performed using automated computer vision (YOLOv8n) with multimodal LLM verification where available. Images processed at 640x640 resolution with 0.25 confidence threshold.\n\n`;
  
  report += `## 6. REPAIR COST ESTIMATION\n\n`;
  report += `| Cost Component | Minimum (₹) | Maximum (₹) |\n|----------------|-------------|-------------|\n`;
  report += `| Parts & Materials | ₹${Math.round(grossAvg * 0.45).toLocaleString('en-IN')} | ₹${Math.round((breakdown.grossRepairCost.max * 0.45)).toLocaleString('en-IN')} |\n`;
  report += `| Labor (Volume Rate) | ₹${Math.round(grossAvg * 0.35).toLocaleString('en-IN')} | ₹${Math.round((breakdown.grossRepairCost.max * 0.35)).toLocaleString('en-IN')} |\n`;
  report += `| Paint & Refinishing | ₹${Math.round(grossAvg * 0.15).toLocaleString('en-IN')} | ₹${Math.round((breakdown.grossRepairCost.max * 0.15)).toLocaleString('en-IN')} |\n`;
  report += `| Miscellaneous/Consumables | ₹${Math.round(grossAvg * 0.05).toLocaleString('en-IN')} | ₹${Math.round((breakdown.grossRepairCost.max * 0.05)).toLocaleString('en-IN')} |\n`;
  report += `| **TOTAL ESTIMATED REPAIR** | **₹${breakdown.grossRepairCost.min.toLocaleString('en-IN')}** | **₹${breakdown.grossRepairCost.max.toLocaleString('en-IN')}** |\n\n`;
  report += `*Estimates based on insurer-authorized volume rates, not retail walk-in pricing. Garage repair costs typically 15-25% higher due to OEM parts markup and retail labor rates.*\n\n`;
  
  report += `## 7. SETTLEMENT CALCULATION\n\n`;
  report += `### Gross Repair Estimate\n`;
  report += `₹${breakdown.grossRepairCost.min.toLocaleString('en-IN')} - ₹${breakdown.grossRepairCost.max.toLocaleString('en-IN')} (Average: ₹${Math.round(grossAvg).toLocaleString('en-IN')})\n\n`;
  
  report += `### Deductions Applied\n\n`;
  report += `| Deduction | Amount (₹) | Basis |\n|-----------|------------|-------|\n`;
  report += `| Depreciation | -${breakdown.depreciation.amount.toLocaleString('en-IN')} | ${breakdown.depreciation.percentage}% - ${breakdown.depreciation.reason} |\n`;
  report += `| Policy Deductible | -${breakdown.deductible.amount.toLocaleString('en-IN')} | ${breakdown.deductible.description} |\n`;
  for (const exc of breakdown.exclusions) {
    report += `| Policy Exclusion (${exc.items.join(', ')}) | -${exc.amount.toLocaleString('en-IN')} | ${exc.description} |\n`;
  }
  report += `\n`;
  
  report += `### Net Settlement Calculation\n`;
  report += `Gross Repair (Avg): ₹${Math.round(grossAvg).toLocaleString('en-IN')}  \n`;
  report += `Less Depreciation: -₹${breakdown.depreciation.amount.toLocaleString('en-IN')}  \n`;
  report += `Less Deductible: -₹${breakdown.deductible.amount.toLocaleString('en-IN')}  \n`;
  for (const exc of breakdown.exclusions) {
    report += `Less Exclusion (${exc.items.join(', ')}): -₹${exc.amount.toLocaleString('en-IN')}  \n`;
  }
  report += `**NET CASH SETTLEMENT: ₹${breakdown.netSettlement.toLocaleString('en-IN')}**\n\n`;
  
  report += `## 8. NEGOTIATION HISTORY\n\n`;
  if (req.chatHistory.length > 0) {
    report += `| # | Party | Message |\n|---|-------|---------|\n`;
    req.chatHistory.forEach((msg, idx) => {
      const cleanText = msg.text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      report += `| ${idx + 1} | ${msg.sender === 'user' ? 'Claimant' : 'Adjuster (AI)'} | ${cleanText.substring(0, 200)}${cleanText.length > 200 ? '...' : ''} |\n`;
    });
    report += `\n`;
  } else {
    report += `No negotiation history - settlement accepted at initial offer.\n\n`;
  }
  
  report += `**FINAL AGREED AMOUNT: ₹${req.finalSettlementAmount.toLocaleString('en-IN')}**\n\n`;
  
  report += `## 9. TERMS & CONDITIONS\n\n`;
  report += `1. **Cash Settlement Basis:** This is a cash buyout offer (instant payout). The claimant waives the right to garage repair under this claim.\n`;
  report += `2. **Full & Final Settlement:** Acceptance constitutes full and final settlement of all claims arising from this incident.\n`;
  report += `3. **Policy Terms Apply:** Settlement subject to policy terms, conditions, and exclusions of the insurance contract.\n`;
  report += `4. **No Admission of Liability:** This settlement does not constitute admission of liability by the insurer.\n`;
  report += `5. **Validity:** This offer is valid for 30 days from report date.\n`;
  report += `6. **Dispute Resolution:** Any disputes subject to policy arbitration clauses and applicable jurisdiction.\n`;
  report += `7. **Documentation:** Claimant must provide valid registration, driving license, and KYC documents for payout processing.\n\n`;
  
  report += `## 10. ACKNOWLEDGMENT & SIGNATURES\n\n`;
  report += `**Claimant Acknowledgment:**\n\n`;
  report += `I, the undersigned, confirm that I have read and understood this damage assessment report and agree to the cash settlement amount of **₹${req.finalSettlementAmount.toLocaleString('en-IN')}** as full and final settlement.\n\n`;
  report += `_________________________  \n`;
  report += `Claimant Signature / Digital Acceptance  \n`;
  report += `Date: ___________________  \n\n`;
  
  report += `**Claims Adjuster (AI-Authorized):**\n\n`;
  report += `_________________________  \n`;
  report += `ClaimPilot AI - Automated Adjuster  \n`;
  report += `Date: ${formattedDate.split(',')[0]}  \n\n`;
  
  report += `---\n\n`;
  report += `*This report was generated by ClaimPilot AI (${req.assessment.repairApproach}) on ${formattedDate}.  \n`;
  report += `Claim Reference: ${req.claimReference}  \n`;
  report += `For verification, contact: claims@claimpilot.example.com*`;
  
  return {
    report,
    reportHtml: markdownToHtml(report),
    generatedAt,
    claimReference: req.claimReference,
  };
}

/**
 * Simple markdown to HTML converter for report display/download
 */
function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^\|(.*)\|$/gm, (match) => {
      const cells = match.split('|').slice(1, -1).map(c => c.trim());
      if (cells.some(c => c.includes('---') || c.includes('==='))) return '';
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>)/g, '<table class="report-table">$1</table>')
    .replace(/<p><table/g, '<table')
    .replace(/<\/table><\/p>/g, '</table>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^(.+)$/gm, '<p>$1</p>')
    .replace(/<p><h([1-3])>/g, '<h$1>')
    .replace(/<\/h([1-3])><\/p>/g, '</h$1>')
    .replace(/<p><hr><\/p>/g, '<hr>')
    .replace(/<p><table/g, '<table')
    .replace(/<\/table><\/p>/g, '</table>');
}
