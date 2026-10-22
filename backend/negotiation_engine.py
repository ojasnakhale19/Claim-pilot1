"""
Negotiation Engine — ChatGPT-powered settlement negotiation with guardrails.
Integrates with the damage assessment pipeline for realistic claim negotiations.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("negotiation_engine")


# ─── Prompt Templates ────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are an expert insurance claims negotiator for a major auto insurance company. 
You negotiate vehicle damage settlements with claimants professionally, fairly, and within strict authority limits.

=== YOUR ROLE ===
- Represent the insurer in settlement negotiations
- Goal: Reach fair settlement within authorized range
- Be empathetic but firm on limits
- Explain rationale clearly using evidence
- Never bluff, mislead, or exceed authority

=== NEGOTIATION PRINCIPLES ===
1. **Evidence-Based**: Every offer tied to assessment data, repair estimates, policy terms
2. **Transparent Rationale**: Explain *why* an amount is fair (parts, labor, depreciation, policy)
3. **Controlled Concessions**: Move in measured steps (max 15% per round), never below floor
4. **Anchor High, Concede Slowly**: Start at target, move toward floor only when necessary
5. **Final Offer is Final**: When you say "final offer", you cannot move further

=== AUTHORITY LIMITS (NEVER VIOLATE) ===
- MIN_ACCEPTABLE: Absolute floor — never offer less
- MAX_AUTHORIZED: Absolute ceiling — never offer more  
- TARGET: Ideal settlement — aim to close here
- MAX_ROUNDS: Hard limit on negotiation rounds

=== PROHIBITED BEHAVIORS ===
❌ Never reveal MIN_ACCEPTABLE, MAX_AUTHORIZED, or internal reasoning
❌ Never say "I can go up to $X" unless X ≤ MAX_AUTHORIZED
❌ Never make offers below MIN_ACCEPTABLE
❌ Never accept claimant demands without counter-rationale
❌ Never promise things outside policy (rental, diminished value, etc.) unless authorized
❌ Never get emotional, argumentative, or personal

=== RESPONSE FORMAT ===
Return ONLY valid JSON:
{
  "stage": "opening|counter|justify|final|agreed|impasse|walked_away",
  "message": "Claimant-facing message (professional, empathetic, clear)",
  "amount": 12345,                    // Dollar amount if offer/counter
  "reasoning": "Internal rationale for this move (NOT shown to claimant)",
  "metadata": {"key": "value"}        // Optional extra data
}"""

OPENING_PROMPT = """=== OPENING OFFER STRATEGY ===
Present the initial settlement offer based on the damage assessment.

Context:
- Assessment: {damage_summary}
- Severity: {severity}
- Estimated Repair Range: ${est_min:,} - ${est_max:,}
- Primary Damage: {primary_component}
- Damage Types: {damage_types}
- Policy Deductible: ${deductible:,}
- Vehicle Age: {vehicle_age} years, {mileage:,} miles

Your Offer: ${opening_offer:,} (Target: ${target:,}, Floor: ${floor:,}, Ceiling: ${ceiling:,})

Craft a professional opening message that:
1. Acknowledges the claim and expresses empathy
2. Summarizes the damage assessment findings
3. Presents the offer with clear rationale (repair costs, policy terms, depreciation)
4. Invites discussion but signals this is a well-calculated offer
5. Does NOT reveal floor/ceiling/target"""

JUSTIFICATION_PROMPT = """=== JUSTIFICATION PHASE ===
Claimant is asking for rationale or challenging the offer.

Claimant's Position: "{claimant_message}"
Current Offer: ${current_offer:,}
Claimant's Last Counter: ${last_counter:,}

Assessment Details to Reference:
- Damage: {damage_summary}
- Repair Estimate: ${est_min:,}-${est_max:,}
- Depreciation: {depreciation}% applied (vehicle age: {vehicle_age} years)
- Betterment: {betterment} (parts that improve pre-accident condition)
- Policy Coverage: {policy_type}, Deductible: ${deductible:,}
- OEM vs Aftermarket Parts: {parts_policy}

Provide a clear, evidence-based explanation without revealing internal limits.
Focus on: repair methodology, parts pricing, labor rates, policy terms."""

FINAL_OFFER_PROMPT = """=== FINAL OFFER STRATEGY ===
Negotiation has reached the final stage. This is your LAST move.

Context:
- Round: {round}/{max_rounds}
- Current Offer: ${current_offer:,}
- Claimant's Last Counter: ${last_counter:,}
- Gap: ${gap:,}
- Your Absolute Floor: ${floor:,}

Assessment: {damage_summary}
Repair Range: ${est_min:,}-${est_max:,}

Decision Logic:
- If gap ≤ 5% of range AND rounds ≥ max_rounds-1: Consider small final concession to close
- If claimant demand > floor + 10%: Stand firm at floor, declare final
- If claimant demand ≤ floor + 5%: Accept to close (within authority)
- THIS IS FINAL — no more moves after this

Your final offer amount: $"""

IMPASSE_PROMPT = """=== IMPASSE / WALK-AWAY ===
Negotiation has stalled. Options:

1. **IMPASSE**: Claimant demand far exceeds ceiling, no movement after max rounds
   - Escalate to human senior adjuster
   - Provide claimant with escalation path
   
2. **WALKED_AWAY**: Claimant explicitly rejected final offer
   - Document final offer
   - Inform of rights (appraisal, mediation, lawsuit)
   - Close negotiation

Current State:
- Round: {round}/{max_rounds}
- Final Offer: ${final_offer:,}
- Claimant Position: ${claimant_position:,}
- Gap: ${gap:,}

Determine appropriate termination and communicate professionally."""

AGREEMENT_PROMPT = """Claimant accepted ${amount:,}. 

Confirm agreement professionally:
1. Confirm the settlement amount
2. Outline next steps (payment timeline, release signing, repair authorization)
3. Thank them for working through the process
4. Provide claim reference number

Return JSON with stage="agreed" and confirmation message."""

# ─── Enums & Constants ──────────────────────────────────────────────────────
class NegotiationStage(str, Enum):
    OPENING = "opening"           # Initial offer presentation
    COUNTER_OFFER = "counter"     # Back-and-forth negotiation
    JUSTIFICATION = "justify"     # Explaining rationale
    FINAL_OFFER = "final"         # Take-it-or-leave-it
    AGREED = "agreed"             # Settlement reached
    IMPASSE = "impasse"           # Deadlock → escalate to human
    WALKED_AWAY = "walked_away"   # Claimant rejected final offer


class NegotiationRole(str, Enum):
    SYSTEM = "system"             # Our AI negotiator (insurer side)
    CLAIMANT = "claimant"         # Human claimant
    HUMAN_ADJUSTER = "human_adjuster"  # Human oversight


class DamageSeverity(str, Enum):
    MINOR = "minor"
    MODERATE = "moderate"
    SEVERE = "severe"
    UNCERTAIN = "uncertain"


# ─── Data Structures ────────────────────────────────────────────────────────
@dataclass
class NegotiationContext:
    """Immutable context for the negotiation."""
    claim_id: str
    assessment_id: str
    
    # Damage assessment results
    damage_summary: str
    severity: DamageSeverity
    primary_component: str
    total_detections: int
    estimated_repair_min: int
    estimated_repair_max: int
    damage_types: List[str]
    
    # Policy context
    policy_type: str = "comprehensive"
    deductible: int = 500
    coverage_limit: int = 50000
    depreciation_applied: bool = True
    betterment_applied: bool = False
    
    # Claimant info (anonymized)
    claimant_type: Literal["policyholder", "third_party"] = "policyholder"
    vehicle_age_years: int = 5
    vehicle_mileage: int = 60000
    
    # Negotiation parameters
    opening_offer: int = 0          # System's first offer
    min_acceptable: int = 0         # Floor (never go below)
    max_authorized: int = 0         # Ceiling (never go above)
    target_settlement: int = 0      # Ideal settlement
    
    # Behavioral config
    max_rounds: int = 6
    concession_rate: float = 0.15   # Max % concession per round
    patience: float = 0.7           # How quickly to concede (0-1)
    
    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["severity"] = self.severity.value
        return d


@dataclass
class NegotiationMessage:
    """Single message in negotiation history."""
    round_num: int
    role: NegotiationRole
    stage: NegotiationStage
    content: str
    amount: Optional[int] = None           # Dollar amount if offer/counter
    reasoning: Optional[str] = None        # Internal reasoning (not shown to claimant)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NegotiationState:
    """Current state of negotiation."""
    context: NegotiationContext
    history: List[NegotiationMessage] = field(default_factory=list)
    current_round: int = 0
    stage: NegotiationStage = NegotiationStage.OPENING
    last_offer: Optional[int] = None       # Last system offer
    last_counter: Optional[int] = None     # Last claimant counter
    agreed_amount: Optional[int] = None
    terminated: bool = False
    termination_reason: Optional[str] = None
    
    # Analytics
    total_concession: int = 0
    claimant_concession: int = 0
    rounds_since_movement: int = 0
    
    def add_message(self, msg: NegotiationMessage) -> None:
        self.history.append(msg)
        self.current_round = max(self.current_round, msg.round_num)
        
        # Track offers
        if msg.amount is not None:
            if msg.role == NegotiationRole.SYSTEM:
                if self.last_offer is not None:
                    self.total_concession += self.last_offer - msg.amount
                self.last_offer = msg.amount
            elif msg.role == NegotiationRole.CLAIMANT:
                if self.last_counter is not None:
                    self.claimant_concession += msg.amount - self.last_counter
                self.last_counter = msg.amount
                self.rounds_since_movement = 0
            else:
                self.rounds_since_movement += 1


# ─── OpenAI Client (with Mock Mode) ──────────────────────────────────────────
class OpenAINegotiationClient:
    """ChatGPT API client for negotiation with mock mode for testing."""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.3,
        max_tokens: int = 1500,
        timeout: float = 30.0,
        mock_mode: bool = False
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.mock_mode = mock_mode or not self.api_key
        if self.mock_mode:
            logger.warning("OpenAI API key not set - running in MOCK MODE")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        if not self.mock_mode:
            self.client = httpx.AsyncClient(timeout=timeout)
    
    async def complete(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        """Call ChatGPT and parse JSON response, or return mock response."""
        if self.mock_mode:
            return self._mock_response(user_prompt)
        
        try:
            response = await self.client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                    "response_format": {"type": "json_object"}
                }
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenAI API error: {e.response.status_code} - {e.response.text}")
            raise
        
    def _mock_response(self, user_prompt: str) -> Dict[str, Any]:
        """Generate deterministic mock responses following the FIXED workflow rules."""
        import re
        prompt_lower = user_prompt.lower()
        
        # Parse context from prompt (extract L, U, round, etc.)
        L_match = re.search(r'l\s*[=:]\s*\$?([\d,]+)', user_prompt, re.IGNORECASE)
        U_match = re.search(r'u\s*[=:]\s*\$?([\d,]+)', user_prompt, re.IGNORECASE)
        round_match = re.search(r'round\s*[=:]\s*(\d+)', user_prompt, re.IGNORECASE)
        current_match = re.search(r'current offer:\s*\$?([\d,]+)', user_prompt, re.IGNORECASE)
        ceiling_match = re.search(r'(?:round ceiling|ceiling):\s*\$?([\d,]+)', user_prompt, re.IGNORECASE)
        amount_match = re.search(r'(?:deterministic amount|amount):\s*\$?([\d,]+)', user_prompt, re.IGNORECASE)
        
        L = int(L_match.group(1).replace(',', '')) if L_match else 3600
        U = int(U_match.group(1).replace(',', '')) if U_match else 4000
        round_num = int(round_match.group(1)) if round_match else 1
        current = int(current_match.group(1).replace(',', '')) if current_match else (3600 if round_num == 1 else 3800)
        ceiling = int(ceiling_match.group(1).replace(',', '')) if ceiling_match else None
        deterministic_amount = int(amount_match.group(1).replace(',', '')) if amount_match else None
        
        delta = U - L
        
        # Extract claimant counter amount from various possible formats
        claimant_counter = None
        claimant_patterns = [
            r'claimant (?:counter|amount|position|demand):\s*\$?([\d,]+)',
            r'claimant last message:\s*["\']?i can accept\s+([\d,]+)',
            r'claimant last message:\s*["\']?([\d,]+)[,\.]',
            r'counter of\s+\$?([\d,]+)',
            r'offer of\s+\$?([\d,]+)',
            r'i can accept\s+([\d,]+)',
            r'accept\s+([\d,]+)',
            r'amount.*?([\d,]{3,})',
        ]
        for pattern in claimant_patterns:
            match = re.search(pattern, user_prompt, re.IGNORECASE)
            if match:
                claimant_counter = int(match.group(1).replace(',', ''))
                break
        
        deterministic_amount = int(amount_match.group(1).replace(',', '')) if amount_match else None
        
        # Use deterministic amount if provided
        amount = deterministic_amount if deterministic_amount is not None else current
        
        # Check for explanation request FIRST (but only if no claimant counter amount)
        has_claimant_amount = claimant_counter is not None
        wants_explanation = ("justify" in prompt_lower or "explain" in prompt_lower or "why" in prompt_lower or "how" in prompt_lower or "breakdown" in prompt_lower) and not has_claimant_amount
        
        # Opening offer
        if "opening" in prompt_lower or round_num == 1:
            amount = L
            return {
                "stage": "opening",
                "message": f"Thank you for filing your claim. Based on our AI assessment, we've identified damage requiring repair. The estimated repair cost range is calculated, and after applying your deductible and standard depreciation, our opening offer is ${L:,}. This represents the minimum approved amount (L) based on our assessment. This covers parts, labor, and paint matching. Please let us know if you'd like to discuss.",
                "amount": amount,
                "reasoning": f"Opening offer at minimum approved amount (L=${L:,}). Explaining cost calculation and policy deductions.",
                "metadata": {"mock": True, "deterministic": True, "L": L, "U": U, "delta": delta}
            }
        
        # Agreement - claimant accepts current offer
        if claimant_counter is not None and claimant_counter <= current + 1:
            return {
                "stage": "agreed",
                "message": f"Excellent! We've agreed on a settlement of ${claimant_counter:,}. Next steps: 1) Settlement agreement via DocuSign within 24 hours, 2) Payment in 3-5 business days, 3) Schedule repairs at certified shop. Thank you.",
                "amount": claimant_counter,
                "reasoning": f"Customer accepted ${claimant_counter:,}. Settlement confirmed.",
                "metadata": {"mock": True, "deterministic": True, "agreed": True}
            }
        
        # Impasse
        if "impasse" in prompt_lower or "walked away" in prompt_lower:
            return {
                "stage": "impasse",
                "message": f"We've reached an impasse. Our final offer of ${U:,} represents the maximum authorized for this claim. If you disagree, you have the right to: 1) Request appraisal per your policy, 2) Request mediation, 3) Pursue legal action. We'll document our final offer and escalate to a senior adjuster for review.",
                "amount": U,
                "reasoning": "Impasse - claimant demand exceeds authority.",
                "metadata": {"mock": True, "deterministic": True}
            }
        
        # Counter offer / counteroffer handling
        if claimant_counter is not None and round_num >= 2:
            # Calculate ceiling for current round
            if round_num == 2:
                round_ceiling = L + int(delta * 0.5)
            elif round_num == 3:
                round_ceiling = L + int(delta * 0.75)
            else:
                round_ceiling = U
            
            # Current offer in this round
            current_offer = current if current else (L if round_num == 2 else (L + int(delta * 0.5) if round_num == 3 else U))
            
            # Check if claimant accepted
            if claimant_counter <= current_offer + 1:
                return {
                    "stage": "agreed",
                    "message": f"Excellent! We've agreed on a settlement of ${claimant_counter:,}. Next steps: 1) Settlement agreement via DocuSign within 24 hours, 2) Payment in 3-5 business days, 3) Schedule repairs at certified shop. Thank you.",
                    "amount": claimant_counter,
                    "reasoning": f"Customer accepted ${claimant_counter:,} which is within current offer range.",
                    "metadata": {"mock": True, "deterministic": True, "agreed": True}
                }
            
            # Customer requests less than current offer
            if claimant_counter < current_offer:
                return {
                    "stage": "counter",
                    "message": f"We appreciate your input, but our current offer of ${current_offer:,} is already favorable. We're prepared to maintain this offer. Please confirm acceptance.",
                    "amount": current_offer,
                    "reasoning": "Customer requested less than current offer. Keeping higher offer per rule.",
                    "metadata": {"mock": True, "deterministic": True}
                }
            
            # Calculate round ceiling
            if round_num == 2:
                round_ceiling = L + int(delta * 0.5)
            elif round_num == 3:
                round_ceiling = L + int(delta * 0.75)
            else:
                round_ceiling = U
            
            if claimant_counter <= round_ceiling:
                # Within ceiling - accept their amount
                return {
                    "stage": "counter",
                    "message": f"Thank you for your counter of ${claimant_counter:,}. This is within our authorized range for this round. We accept ${claimant_counter:,} as the settlement amount.",
                    "amount": claimant_counter,
                    "reasoning": f"Customer counter ${claimant_counter:,} within round ceiling ${round_ceiling:,}. Accepting per fixed rules.",
                    "metadata": {"mock": True, "deterministic": True}
                }
            else:
                # Exceeds ceiling - offer ceiling
                stage = "counter" if round_num < 4 else "final"
                return {
                    "stage": stage,
                    "message": f"We understand your position at ${claimant_counter:,}. However, our authorized ceiling for this round is ${round_ceiling:,}. We can offer ${round_ceiling:,} as the maximum for this stage.",
                    "amount": round_ceiling,
                    "reasoning": f"Customer counter ${claimant_counter:,} exceeds round ceiling ${round_ceiling:,}. Offering ceiling per fixed rules.",
                    "metadata": {"mock": True, "deterministic": True}
                }
        
        # Explanation request (no counter amount provided)
        wants_explanation = ("justify" in prompt_lower or "explain" in prompt_lower or "why" in prompt_lower or "how" in prompt_lower or "breakdown" in prompt_lower) and not has_claimant_amount
        if wants_explanation:
            current_amt = current if current else L
            return {
                "stage": "justify",
                "message": f"The ${current_amt:,} offer is based on: 1) Repair shop labor rates (market rate × hours), 2) OEM/quality parts for damaged components, 3) Paint & materials, 4) Standard depreciation for vehicle age, 5) Your deductible. Total repair cost calculated per industry standards. This is a fair, evidence-based offer.",
                "amount": None,
                "reasoning": f"Explanation provided for ${current_amt:,} offer. Offer unchanged per explanation rule.",
                "metadata": {"mock": True, "deterministic": True, "explanation": True}
            }
        
        # Impasse
        if "impasse" in prompt_lower or "walked away" in prompt_lower:
            return {
                "stage": "impasse",
                "message": f"We've reached an impasse. Our final offer of ${U:,} represents the maximum authorized for this claim. If you disagree, you have the right to: 1) Request appraisal per your policy, 2) Request mediation, 3) Pursue legal action. We'll document our final offer and escalate to a senior adjuster for review.",
                "amount": U,
                "reasoning": "Impasse - claimant demand exceeds authority.",
                "metadata": {"mock": True, "deterministic": True}
            }
        
        # Final offer stage (round 4+)
        if "final" in prompt_lower or "final offer" in prompt_lower or round_num >= 4:
            return {
                "stage": "final",
                "message": f"This is our final offer. Based on the repair estimates, your vehicle's age, and standard depreciation, ${U:,} (U) is the maximum we can authorize. This is a fair settlement that fully covers the repair costs. We hope you'll accept so we can close this claim.",
                "amount": U,
                "reasoning": "Final offer at U (maximum authorized). No further movement possible.",
                "metadata": {"mock": True, "deterministic": True}
            }
        
        # Impasse
        if "impasse" in prompt_lower or "walked away" in prompt_lower:
            return {
                "stage": "impasse",
                "message": f"We've reached an impasse. Our final offer of ${U:,} represents the maximum authorized for this claim. If you disagree, you have the right to: 1) Request appraisal per your policy, 2) Request mediation, 3) Pursue legal action. We'll document our final offer and escalate to a senior adjuster for review.",
                "amount": U,
                "reasoning": "Impasse - claimant rejected final offer. Escalating to human adjuster.",
                "metadata": {"mock": True, "deterministic": True}
            }
        
        # Default fallback - use deterministic amount
        return {
            "stage": "counter",
            "message": f"Thank you for your message. We're reviewing your position and will respond according to our authorized range.",
            "amount": amount,
            "reasoning": "Using deterministic amount per round ceiling.",
            "metadata": {"mock": True, "deterministic": True}
        }
    
    async def close(self):
        if not self.mock_mode and hasattr(self, 'client'):
            await self.client.aclose()


# ─── Negotiation Engine ─────────────────────────────────────────────────────
class NegotiationEngine:
    """Main negotiation orchestrator."""
    
    def __init__(
        self,
        openai_client: Optional[OpenAINegotiationClient] = None,
        api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        mock_mode: bool = False
    ):
        self.client = openai_client or OpenAINegotiationClient(api_key=api_key, model=model, mock_mode=mock_mode)
    
    def _format_currency(self, amount: int) -> str:
        return f"${amount:,}"
    
    def _get_round_ceiling(self, ctx: NegotiationContext, round_num: int) -> int:
        """
        Calculate the ceiling for a given round based on the fixed concession schedule.
        
        L = min_acceptable (floor)
        U = max_authorized (ceiling)
        Δ = U - L
        
        Round 1 (opening): L
        Counter 1: L + 50% of Δ
        Counter 2: L + 75% of Δ
        Counter 3 (final): U
        """
        L = ctx.min_acceptable
        U = ctx.max_authorized
        delta = U - L
        
        if round_num == 1:
            return L
        elif round_num == 2:
            return L + int(delta * 0.5)  # Counter 1: L + 50%Δ
        elif round_num == 3:
            return L + int(delta * 0.75)  # Counter 2: L + 75%Δ
        elif round_num >= 4:
            return U  # Counter 3 (final): U
        return L
    
    def _calculate_offer_amount(self, ctx: NegotiationContext, round_num: int, 
                                 claimant_amount: Optional[int] = None,
                                 current_offer: Optional[int] = None) -> tuple[int, str, NegotiationStage]:
        """
        Deterministically calculate the offer amount based on fixed workflow rules.
        
        Returns: (amount, reasoning, stage)
        """
        L = ctx.min_acceptable
        U = ctx.max_authorized
        ceiling = self._get_round_ceiling(ctx, round_num)
        
        # Opening offer (round 1)
        if round_num == 1:
            return L, f"Opening offer at minimum approved amount (L=${L:,}). Explaining cost calculation and policy deductions.", NegotiationStage.OPENING
        
        # If claimant provided an amount, evaluate it
        if claimant_amount is not None:
            current = current_offer or ctx.opening_offer
            
            # Customer accepts (within $1 of current offer)
            if claimant_amount <= current + 1:
                return claimant_amount, "Customer accepted current offer.", NegotiationStage.AGREED
            
            # Customer requests less than current offer
            if claimant_amount < current:
                return current, "Customer requested less than current offer. Keeping higher offer, asking for explicit acceptance.", NegotiationStage.COUNTER_OFFER
            
            # Customer counteroffer
            if claimant_amount <= ceiling:
                # Within ceiling - accept their amount
                return claimant_amount, f"Customer counter ${claimant_amount:,} within round ceiling ${ceiling:,}. Accepting.", NegotiationStage.COUNTER_OFFER
            else:
                # Exceeds ceiling - offer ceiling
                return ceiling, f"Customer counter ${claimant_amount:,} exceeds round ceiling ${ceiling:,}. Offering ceiling.", NegotiationStage.COUNTER_OFFER
        
        # No claimant amount (shouldn't happen in normal flow, but fallback)
        return ceiling, f"Offering round ceiling ${ceiling:,}.", NegotiationStage.COUNTER_OFFER
    
    async def make_opening_offer(self, context: NegotiationContext) -> NegotiationMessage:
        """Generate opening offer at L with explanation."""
        # Determine amount deterministically
        amount, reasoning, stage = self._calculate_offer_amount(context, round_num=1)
        
        # Use LLM only for message generation
        prompt = self._build_opening_prompt(context)
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        # Override amount with deterministic value
        amount = self._clamp_offer(amount, context)
        
        msg = NegotiationMessage(
            round_num=1,
            role=NegotiationRole.SYSTEM,
            stage=stage,
            content=response.get("message", f"Opening offer: ${amount:,}"),
            amount=amount,
            reasoning=reasoning,
            metadata=response.get("metadata", {})
        )
        return msg
    
    def _build_opening_prompt(self, ctx: NegotiationContext) -> str:
        return OPENING_PROMPT.format(
            damage_summary=ctx.damage_summary,
            severity=ctx.severity.value,
            est_min=ctx.estimated_repair_min,
            est_max=ctx.estimated_repair_max,
            primary_component=ctx.primary_component,
            damage_types=", ".join(ctx.damage_types),
            deductible=ctx.deductible,
            vehicle_age=ctx.vehicle_age_years,
            mileage=ctx.vehicle_mileage,
            opening_offer=ctx.opening_offer,
            target=ctx.target_settlement,
            floor=ctx.min_acceptable,
            ceiling=ctx.max_authorized
        )
    
    def _build_justification_prompt(self, state: NegotiationState, claimant_message: str) -> str:
        ctx = state.context
        depreciation_pct = 15 if ctx.vehicle_age_years > 3 else 5
        
        return JUSTIFICATION_PROMPT.format(
            claimant_message=claimant_message,
            current_offer=state.last_offer or ctx.opening_offer,
            last_counter=state.last_counter or 0,
            damage_summary=ctx.damage_summary,
            est_min=ctx.estimated_repair_min,
            est_max=ctx.estimated_repair_max,
            depreciation=depreciation_pct,
            vehicle_age=ctx.vehicle_age_years,
            betterment="Applied" if ctx.betterment_applied else "Not applied",
            deductible=ctx.deductible,
            policy_type=ctx.policy_type,
            parts_policy="OEM for safety parts, aftermarket for cosmetic" if ctx.vehicle_age_years > 5 else "OEM preferred"
        )
    
    def _build_final_prompt(self, state: NegotiationState) -> str:
        ctx = state.context
        gap = (state.last_counter or ctx.opening_offer) - (state.last_offer or ctx.opening_offer)
        
        return FINAL_OFFER_PROMPT.format(
            round=state.current_round,
            max_rounds=ctx.max_rounds,
            current_offer=state.last_offer or ctx.opening_offer,
            last_counter=state.last_counter or 0,
            gap=gap,
            floor=ctx.min_acceptable,
            damage_summary=ctx.damage_summary,
            est_min=ctx.estimated_repair_min,
            est_max=ctx.estimated_repair_max
        )
    
    def _build_impape_prompt(self, state: NegotiationState, walked_away: bool = False) -> str:
        ctx = state.context
        gap = (state.last_counter or ctx.opening_offer) - (state.last_offer or ctx.opening_offer)
        
        return IMPASSE_PROMPT.format(
            round=state.current_round,
            max_rounds=ctx.max_rounds,
            final_offer=state.last_offer or ctx.opening_offer,
            claimant_position=state.last_counter or 0,
            gap=gap
        )
    
    async def respond_to_counter(
        self, 
        state: NegotiationState, 
        claimant_amount: int,
        claimant_message: str = ""
    ) -> NegotiationMessage:
        """Generate response to claimant counter-offer using fixed workflow."""
        ctx = state.context
        round_num = state.current_round + 1
        
        # Check termination conditions
        if round_num > ctx.max_rounds:
            return await self._handle_impape(state, walked_away=False)
        
        current_offer = state.last_offer or ctx.opening_offer
        
        # Classify the claimant's message
        msg_lower = claimant_message.lower()
        is_explanation_request = any(w in msg_lower for w in ["why", "justify", "explain", "how", "calculation", "breakdown"])
        is_human_review_request = any(w in msg_lower for w in ["human", "supervisor", "manager", "escalate", "speak to"])
        is_new_evidence = any(w in msg_lower for w in ["new evidence", "additional photo", "dispute", "coverage", "policy says"])
        
        # Handle special cases first
        if is_human_review_request:
            return await self._handle_human_review_request(state, claimant_message)
        
        if is_new_evidence:
            return await self._handle_new_evidence(state, claimant_message)
        
        if is_explanation_request and claimant_amount is None:
            # Explanation request without counter - same amount, not a round
            return await self._handle_explanation(state, claimant_message)
        
        # Check if claimant accepted
        if claimant_amount <= current_offer + 1:
            return await self._handle_agreement(state, claimant_amount)
        
        # Check if claimant demand exceeds ceiling significantly
        if claimant_amount > ctx.max_authorized * 1.2:
            return await self._handle_impape(state, walked_away=False)
        
        # Calculate deterministic offer
        amount, reasoning, stage = self._calculate_offer_amount(
            ctx, round_num, claimant_amount, current_offer
        )
        
        # Generate message via LLM with context
        prompt = self._build_deterministic_prompt(ctx, state, round_num, stage, amount, claimant_message, reasoning)
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        # Ensure deterministic amount is used
        amount = self._clamp_offer(amount, ctx)
        
        # For final offer, ensure we don't go below floor
        if stage == NegotiationStage.FINAL_OFFER and amount is not None:
            amount = max(amount, ctx.min_acceptable)
        
        msg = NegotiationMessage(
            round_num=round_num,
            role=NegotiationRole.SYSTEM,
            stage=stage,
            content=response.get("message", ""),
            amount=amount,
            reasoning=reasoning,
            metadata={"deterministic": True, "ceiling": self._get_round_ceiling(ctx, round_num), **response.get("metadata", {})}
        )
        return msg
    
    def _build_deterministic_prompt(self, ctx: NegotiationContext, state: NegotiationState, 
                                     round_num: int, stage: NegotiationStage, 
                                     amount: int, claimant_message: str, reasoning: str) -> str:
        """Build prompt for LLM message generation with fixed amount."""
        base = f"""=== DETERMINISTIC NEGOTIATION - ROUND {round_num} ===
CONTEXT:
- Claim: {ctx.claim_id}
- Damage: {ctx.damage_summary}
- Severity: {ctx.severity.value}
- Repair Range: ${ctx.estimated_repair_min:,}-${ctx.estimated_repair_max:,}
- Deductible: ${ctx.deductible:,}
- Vehicle Age: {ctx.vehicle_age_years} years

AUTHORITY RANGE (FIXED - DO NOT DEVIATE):
- L (Min Approved): ${ctx.min_acceptable:,}
- U (Max Authorized): ${ctx.max_authorized:,}
- Δ (Range): ${ctx.max_authorized - ctx.min_acceptable:,}

CURRENT STATE:
- Round: {round_num}/{ctx.max_rounds}
- Current Offer: ${state.last_offer or ctx.opening_offer:,}
- Round Ceiling: ${self._get_round_ceiling(ctx, round_num):,}
- Claimant Last Message: "{claimant_message}"

DECISION MADE (FIXED RULES):
- Stage: {stage.value}
- Deterministic Amount: ${amount:,}
- Reasoning: {reasoning}

YOUR TASK: Generate a professional, empathetic message for the claimant.
- Use the EXACT amount ${amount:,} - DO NOT CHANGE IT
- Explain the rationale clearly using the reasoning provided
- Be empathetic but firm on limits
- Never reveal L, U, Δ, or internal reasoning
- If stage is "justify", provide detailed cost breakdown without revealing limits
- If stage is "final", clearly state this is the final automated offer
"""
        return base
    
    async def _handle_explanation(self, state: NegotiationState, claimant_message: str) -> NegotiationMessage:
        """Handle explanation request - same amount, not a negotiation round."""
        ctx = state.context
        current = state.last_offer or ctx.opening_offer
        
        prompt = f"""=== EXPLANATION REQUEST (NOT A ROUND) ===
CLAIMANT ASKS: "{claimant_message}"
CURRENT OFFER: ${current:,} (UNCHANGED)

Generate a clear, detailed explanation of the ${current:,} offer using the cost breakdown.
Do NOT change the offer amount. This is NOT a negotiation round.
"""
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        return NegotiationMessage(
            round_num=state.current_round,  # Same round - not incremented
            role=NegotiationRole.SYSTEM,
            stage=NegotiationStage.JUSTIFICATION,
            content=response.get("message", ""),
            amount=current,
            reasoning="Explanation provided per claimant request. Offer unchanged.",
            metadata={"explanation": True, "deterministic": True}
        )
    
    async def _handle_human_review_request(self, state: NegotiationState, claimant_message: str) -> NegotiationMessage:
        """Handle human review request - escalate immediately."""
        ctx = state.context
        current = state.last_offer or ctx.opening_offer
        
        prompt = f"""=== HUMAN REVIEW REQUESTED ===
Claimant requested human review: "{claimant_message}"
Current offer: ${current:,}

Generate a professional escalation message preserving the conversation and latest offer.
"""
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        state.terminated = True
        state.termination_reason = "human_review_requested"
        
        return NegotiationMessage(
            round_num=state.current_round + 1,
            role=NegotiationRole.SYSTEM,
            stage=NegotiationStage.IMPASSE,
            content=response.get("message", "Escalating to human adjuster..."),
            amount=current,
            reasoning="Claimant requested human review. Escalating per protocol.",
            metadata={"escalated": True, "reason": "human_review"}
        )
    
    async def _handle_new_evidence(self, state: NegotiationState, claimant_message: str) -> NegotiationMessage:
        """Handle new evidence/coverage dispute - pause and reassess."""
        ctx = state.context
        current = state.last_offer or ctx.opening_offer
        
        prompt = f"""=== NEW EVIDENCE / COVERAGE DISPUTE ===
Claimant provided: "{claimant_message}"
Current offer: ${current:,} (PAUSED)

Generate a professional message acknowledging the new information, pausing negotiation,
and explaining that reassessment is required before resuming.
"""
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        return NegotiationMessage(
            round_num=state.current_round,  # Not incremented - paused
            role=NegotiationRole.SYSTEM,
            stage=NegotiationStage.JUSTIFICATION,
            content=response.get("message", "Negotiation paused for reassessment."),
            amount=current,
            reasoning="New evidence/coverage dispute. Negotiation paused pending reassessment.",
            metadata={"paused": True, "reason": "new_evidence"}
        )
    
    async def _handle_impape(self, state: NegotiationState, walked_away: bool) -> NegotiationMessage:
        ctx = state.context
        current = state.last_offer or ctx.opening_offer
        
        if walked_away:
            prompt = f"""=== CLAIMANT REJECTED FINAL OFFER ===
Final offer: ${current:,} (U = ${ctx.max_authorized:,})
Claimant rejected final automated offer.

Generate escalation message: no further automated concessions. Claimant rights: appraisal, mediation, legal action.
"""
        else:
            prompt = f"""=== IMPASSE REACHED ===
Round {state.current_round}/{ctx.max_rounds} complete.
Final offer: ${current:,} (U = ${ctx.max_authorized:,})
No agreement reached.

Generate escalation to human senior adjuster. Preserve conversation and latest offer.
"""
        
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        state.terminated = True
        state.termination_reason = "walked_away" if walked_away else "impasse"
        
        return NegotiationMessage(
            round_num=state.current_round + 1,
            role=NegotiationRole.SYSTEM,
            stage=NegotiationStage.WALKED_AWAY if walked_away else NegotiationStage.IMPASSE,
            content=response.get("message", "Negotiation terminated. Escalating to human adjuster."),
            amount=current,
            reasoning="Final offer rejected or max rounds reached. Escalating to human adjuster.",
            metadata={"terminated": True, "walked_away": walked_away}
        )
    
    async def _handle_agreement(self, state: NegotiationState, amount: int) -> NegotiationMessage:
        prompt = AGREEMENT_PROMPT.format(amount=amount)
        response = await self.client.complete(SYSTEM_PROMPT, prompt)
        
        state.terminated = True
        state.termination_reason = "agreed"
        state.agreed_amount = amount
        
        return NegotiationMessage(
            round_num=state.current_round + 1,
            role=NegotiationRole.SYSTEM,
            stage=NegotiationStage.AGREED,
            content=response.get("message", f"Agreed at ${amount:,}"),
            amount=amount,
            reasoning=response.get("reasoning"),
            metadata={"agreed": True}
        )
    
    async def run_negotiation(
        self,
        context: NegotiationContext,
        claimant_responses: List[Dict[str, Any]]  # Simulated claimant responses for testing
    ) -> NegotiationState:
        """Run full negotiation simulation."""
        state = NegotiationState(context=context)
        
        # Opening
        opening_msg = await self.make_opening_offer(context)
        state.add_message(opening_msg)
        logger.info(f"Opening: {opening_msg.content[:100]}...")
        
        # Simulate claimant responses
        for i, claimant_resp in enumerate(claimant_responses):
            if state.terminated:
                break
            
            claimant_amount = claimant_resp.get("amount")
            claimant_message = claimant_resp.get("message", "")
            
            # Add claimant message to history
            claimant_msg = NegotiationMessage(
                round_num=i + 1,
                role=NegotiationRole.CLAIMANT,
                stage=state.stage,
                content=claimant_message,
                amount=claimant_amount
            )
            state.add_message(claimant_msg)
            
            # System responds
            system_msg = await self.respond_to_counter(state, claimant_amount, claimant_message)
            state.add_message(system_msg)
            
            # Check termination
            if system_msg.stage in (NegotiationStage.AGREED, NegotiationStage.IMPASSE, NegotiationStage.WALKED_AWAY):
                state.terminated = True
                state.termination_reason = system_msg.stage.value
                state.agreed_amount = system_msg.amount
                break
        
        return state


# ─── FastAPI Integration ────────────────────────────────────────────────────
def create_negotiation_router() -> APIRouter:
    """Create FastAPI router for negotiation endpoints."""
    from fastapi import APIRouter, HTTPException, Depends
    from pydantic import BaseModel, Field
    
    router = APIRouter(prefix="/negotiate", tags=["Negotiation"])
    
    # In-memory session storage (use Redis in production)
    sessions: Dict[str, NegotiationState] = {}
    
    @router.post("/start", response_model=NegotiationStartResponse)
    async def start_negotiation(request: NegotiationStartRequest):
        """Initialize negotiation from damage assessment."""
        # Build context from assessment
        ctx = NegotiationContext(
            claim_id=request.claim_id,
            assessment_id=request.assessment_id,
            damage_summary=request.damage_summary,
            severity=DamageSeverity(request.severity),
            primary_component=request.primary_component,
            total_detections=request.total_detections,
            estimated_repair_min=request.estimated_repair_min,
            estimated_repair_max=request.estimated_repair_max,
            damage_types=request.damage_types,
            policy_type=request.policy_type,
            deductible=request.deductible,
            coverage_limit=request.coverage_limit,
            depreciation_applied=request.depreciation_applied,
            betterment_applied=request.betterment_applied,
            claimant_type=request.claimant_type,
            vehicle_age_years=request.vehicle_age_years,
            vehicle_mileage=request.vehicle_mileage,
            # Negotiation bounds (set by insurer rules)
            opening_offer=request.opening_offer or int((request.estimated_repair_min + request.estimated_repair_max) * 0.6),
            min_acceptable=request.min_acceptable or int(request.estimated_repair_min * 0.7),
            max_authorized=request.max_authorized or int(request.estimated_repair_max * 0.9),
            target_settlement=request.target_settlement or int((request.estimated_repair_min + request.estimated_repair_max) * 0.75),
            max_rounds=request.max_rounds or 6,
        )
        
        # Create session
        session_id = f"neg_{uuid.uuid4().hex[:12]}"
        state = NegotiationState(context=ctx)
        
        # Generate opening offer
        engine = NegotiationEngine(mock_mode=True)
        opening_msg = await engine.make_opening_offer(ctx)
        state.add_message(opening_msg)
        
        sessions[session_id] = state
        
        return NegotiationStartResponse(
            session_id=session_id,
            opening_message=opening_msg.content,
            opening_amount=opening_msg.amount,
            stage=opening_msg.stage.value,
            context=ctx.to_dict()
        )
    
    @router.post("/{session_id}/respond", response_model=NegotiationResponse)
    async def respond(session_id: str, request: NegotiationRespondRequest):
        if session_id not in sessions:
            raise HTTPException(404, "Session not found")
        
        state = sessions[session_id]
        
        if state.terminated:
            raise HTTPException(400, "Negotiation already terminated")
        
        # Process claimant response
        engine = NegotiationEngine(mock_mode=True)
        system_msg = await engine.respond_to_counter(
            state, 
            request.amount, 
            request.message
        )
        state.add_message(system_msg)
        
        # Check termination
        terminated = system_msg.stage in (NegotiationStage.AGREED, NegotiationStage.IMPASSE, NegotiationStage.WALKED_AWAY)
        if terminated:
            state.terminated = True
            state.termination_reason = system_msg.stage.value
            state.agreed_amount = system_msg.amount
        
        return NegotiationResponse(
            session_id=session_id,
            message=system_msg.content,
            amount=system_msg.amount,
            stage=system_msg.stage.value,
            terminated=terminated,
            agreed_amount=state.agreed_amount,
            round=state.current_round,
            history=[{
                "round": m.round_num,
                "role": m.role.value,
                "stage": m.stage.value,
                "content": m.content,
                "amount": m.amount,
                "timestamp": m.timestamp
            } for m in state.history]
        )
    
    @router.get("/{session_id}", response_model=NegotiationStatusResponse)
    async def get_status(session_id: str):
        if session_id not in sessions:
            raise HTTPException(404, "Session not found")
        
        state = sessions[session_id]
        return NegotiationStatusResponse(
            session_id=session_id,
            stage=state.stage.value,
            current_round=state.current_round,
            max_rounds=state.context.max_rounds,
            last_offer=state.last_offer,
            last_counter=state.last_counter,
            terminated=state.terminated,
            agreed_amount=state.agreed_amount,
            history=[{
                "round": m.round_num,
                "role": m.role.value,
                "stage": m.stage.value,
                "content": m.content,
                "amount": m.amount,
                "timestamp": m.timestamp
            } for m in state.history]
        )
    
    @router.delete("/{session_id}")
    async def end_session(session_id: str):
        if session_id in sessions:
            del sessions[session_id]
        return {"status": "deleted"}
    
    return router


# ─── Pydantic Models for API ────────────────────────────────────────────────
class NegotiationStartRequest(BaseModel):
    claim_id: str
    assessment_id: str
    damage_summary: str
    severity: str
    primary_component: str
    total_detections: int
    estimated_repair_min: int
    estimated_repair_max: int
    damage_types: List[str]
    policy_type: str = "comprehensive"
    deductible: int = 500
    coverage_limit: int = 50000
    depreciation_applied: bool = True
    betterment_applied: bool = False
    claimant_type: Literal["policyholder", "third_party"] = "policyholder"
    vehicle_age_years: int = 5
    vehicle_mileage: int = 60000
    opening_offer: Optional[int] = None
    min_acceptable: Optional[int] = None
    max_authorized: Optional[int] = None
    target_settlement: Optional[int] = None
    max_rounds: int = 6


class NegotiationStartResponse(BaseModel):
    session_id: str
    opening_message: str
    opening_amount: Optional[int]
    stage: str
    context: Dict[str, Any]


class NegotiationRespondRequest(BaseModel):
    amount: Optional[int] = None
    message: str = ""


class NegotiationResponse(BaseModel):
    session_id: str
    message: str
    amount: Optional[int]
    stage: str
    terminated: bool
    agreed_amount: Optional[int]
    round: int
    history: List[Dict[str, Any]]


class NegotiationStatusResponse(BaseModel):
    session_id: str
    stage: str
    current_round: int
    max_rounds: int
    last_offer: Optional[int]
    last_counter: Optional[int]
    terminated: bool
    agreed_amount: Optional[int]
    history: List[Dict[str, Any]]


# ─── Demo / Testing ─────────────────────────────────────────────────────────
async def demo_negotiation():
    """Run a demo negotiation with simulated claimant."""
    # Context from a realistic assessment
    ctx = NegotiationContext(
        claim_id="CLM-2026-04521",
        assessment_id="ASM-20261020-ABC123",
        damage_summary="Moderate dent on rear quarter panel, scratch on rear bumper. 2 damage instances detected.",
        severity=DamageSeverity.MODERATE,
        primary_component="Rear Quarter Panel",
        total_detections=2,
        estimated_repair_min=3500,
        estimated_repair_max=6500,
        damage_types=["dent", "scratch"],
        deductible=500,
        vehicle_age_years=4,
        vehicle_mileage=52000,
        # Negotiation bounds (70% of range = $4,200 target)
        opening_offer=4200,
        min_acceptable=2800,      # 70% of min repair
        max_authorized=5500,      # 85% of max repair
        target_settlement=4200,
        max_rounds=6
    )
    
    # Simulated claimant behavior
    claimant_responses = [
        {"amount": 6000, "message": "The repair shop quoted me $6,200. Your offer is too low."},
        {"amount": 5500, "message": "I can meet you at $5,500. That's fair for both of us."},
        {"amount": 5000, "message": "Okay, $5,000 is my final. The dent is worse than it looks in photos."},
    ]
    
    engine = NegotiationEngine(mock_mode=True)
    state = await engine.run_negotiation(ctx, claimant_responses)
    
    print("\n" + "="*70)
    print("NEGOTIATION TRANSCRIPT")
    print("="*70)
    for msg in state.history:
        role_tag = f"[{msg.role.value.upper()}]"
        amount_tag = f" ${msg.amount:,}" if msg.amount else ""
        print(f"\nRound {msg.round_num} {role_tag}{amount_tag} [{msg.stage.value}]")
        print(f"  {msg.content}")
        if msg.reasoning:
            print(f"  Reasoning: {msg.reasoning}")
    
    print(f"\n{'='*70}")
    print(f"RESULT: {state.termination_reason or 'ongoing'}")
    if state.agreed_amount:
        print(f"SETTLED: ${state.agreed_amount:,}")
    print(f"Rounds: {state.current_round}/{ctx.max_rounds}")
    print(f"System Concession: ${state.total_concession:,}")
    print(f"Claimant Concession: ${state.claimant_concession:,}")
    print("="*70)


if __name__ == "__main__":
    import asyncio
    asyncio.run(demo_negotiation())