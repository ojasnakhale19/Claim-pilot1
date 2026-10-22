"""
ICICI Lombard Policy Eligibility & Cash-Loss Screening Module
================================================================

Implements policy-suitability screening for vehicle damage claims based on
ICICI Lombard Private Car Package Policy wording.

Key features:
- CTL (Constructive Total Loss) threshold calculation at 75% of IDV
- Policy eligibility validation (period, coverage, product match)
- Repair + retrieval cost aggregation
- Standard partial loss vs CTL vs Total Loss classification
- Minor scratch handling per policy exclusions
- Human review gates for uncertain cases

This is a screening/decision-support prototype. It does NOT authorize payments,
guarantee coverage, or make binding claim decisions.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

# ─── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("icici_lombard_screening")

# ─── Constants ────────────────────────────────────────────────────────────
CTL_THRESHOLD_RATIO = Decimal("0.75")  # 75% of IDV
SUPPORTED_PRODUCT_TYPES = ["private_car_package", "standalone_own_damage", "bundled_comprehensive"]
OWN_DAMAGE_REQUIRED_PRODUCTS = ["private_car_package", "standalone_own_damage", "bundled_comprehensive"]

# ─── Enums ────────────────────────────────────────────────────────────────
class ProductType(str, Enum):
    PRIVATE_CAR_PACKAGE = "private_car_package"
    STANDALONE_OWN_DAMAGE = "standalone_own_damage"
    BUNDLED_COMPREHENSIVE = "bundled_comprehensive"
    THIRD_PARTY_ONLY = "third_party_only"
    UNKNOWN = "unknown"


class EstimateSource(str, Enum):
    AI_PRELIMINARY = "ai_preliminary"
    GARAGE_QUOTATION = "garage_quotation"
    SURVEYOR_ASSESSED = "surveyor_assessed"


class ScreeningOutcome(str, Enum):
    STANDARD_PARTIAL_LOSS = "standard_partial_loss"
    POTENTIAL_CTL = "potential_ctl"
    POTENTIAL_TOTAL_LOSS = "potential_total_loss"
    SURVEYOR_UNREPAIRABLE = "surveyor_unrepairable"
    PRODUCT_MISMATCH = "product_mismatch"
    INCOMPLETE_INFORMATION = "incomplete_information"
    POLICY_EXCLUSION_REVIEW = "policy_exclusion_review"
    HUMAN_REVIEW_REQUIRED = "human_review_required"


class ReasonCode(str, Enum):
    # Coverage & period
    POLICY_INACTIVE = "policy_inactive_on_incident_date"
    NO_OWN_DAMAGE_COVER = "no_own_damage_coverage"
    PRODUCT_MISMATCH = "product_type_not_supported"
    
    # IDV & costs
    IDV_MISSING = "idv_missing_or_invalid"
    REPAIR_ESTIMATE_MISSING = "repair_estimate_missing"
    INVALID_COST_RANGE = "repair_cost_range_invalid"
    RETRIEVAL_COST_MISSING = "retrieval_cost_missing"
    
    # CTL / Total loss
    BELOW_CTL_THRESHOLD = "below_ctl_threshold"
    CROSSES_CTL_THRESHOLD = "crosses_ctl_threshold"
    ABOVE_CTL_THRESHOLD = "above_ctl_threshold"
    SURVEYOR_UNREPAIRABLE = "surveyor_assessed_unrepairable"
    
    # Evidence & verification
    FOUR_VIEW_INVALID = "four_view_evidence_invalid"
    ESTIMATE_SOURCE_AI_ONLY = "estimate_is_ai_preliminary_only"
    MISSING_SURVEYOR_VERIFICATION = "surveyor_verification_missing"
    MISSING_ADJUSTER_CONFIRMATION = "adjuster_confirmation_missing"
    MISSING_POLICY_SCHEDULE = "policy_schedule_not_verified"
    
    # Policy exclusions
    MINOR_SCRATCH_EXCLUSION = "possible_minor_scratch_exclusion"
    
    # General
    INCOMPLETE_INFORMATION = "incomplete_information"
    CLAIM_NOTIFICATION_LATE = "claim_notification_late"
    INVALID_LICENCE = "driver_licence_invalid_or_missing"
    VEHICLE_MISUSE = "vehicle_use_outside_policy_terms"
    DRIVER_IMPAIRED = "driver_impairment_confirmed"


# ─── Request/Response Models ──────────────────────────────────────────────
class ICICILombardScreeningRequest(BaseModel):
    """Request for ICICI Lombard policy suitability screening."""
    
    # Product & Coverage
    product_type: ProductType = Field(..., description="Insurance product type")
    own_damage_cover: bool = Field(..., description="Whether own-damage cover is present")
    
    # Policy Period
    policy_start_date: date = Field(..., description="Policy start date (YYYY-MM-DD)")
    policy_end_date: date = Field(..., description="Policy end date (YYYY-MM-DD)")
    
    # Incident
    incident_date: date = Field(..., description="Date of reported incident (YYYY-MM-DD)")
    
    # Vehicle Valuation
    idv: int = Field(..., gt=0, description="Insured Declared Value in INR")
    
    # Cost Estimates
    repair_estimate_min: int = Field(..., ge=0, description="Minimum repair estimate in INR")
    repair_estimate_max: int = Field(..., ge=0, description="Maximum repair estimate in INR")
    retrieval_towing_cost: int = Field(default=0, ge=0, description="Retrieval/towing cost in INR")
    estimate_source: EstimateSource = Field(..., description="Source of repair estimate")
    
    # Salvage & Deductible (optional)
    salvage_value: Optional[int] = Field(default=None, ge=0, description="Salvage/wreck value in INR if assessed")
    deductible: Optional[int] = Field(default=None, ge=0, description="Applicable deductible in INR if verified")
    
    # Evidence
    four_view_validated: bool = Field(default=False, description="Whether four-view evidence passed validation")
    cv_review_required: bool = Field(default=False, description="Whether CV review is flagged as required")
    evidence_concerns: List[str] = Field(default_factory=list, description="Evidence review flags")
    detected_damage_classes: List[str] = Field(default_factory=list, description="Damage classes detected by CV")
    damage_severity: Optional[str] = Field(default=None, description="Overall damage severity")
    max_detection_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Maximum detection confidence")
    
    # Claim Circumstances
    reported_cause: Optional[str] = Field(default=None, description="Reported cause of damage")
    driver_licence_valid: Optional[bool] = Field(default=None, description="Whether driver held valid licence")
    vehicle_use_compliant: Optional[bool] = Field(default=None, description="Whether vehicle used per policy terms")
    driver_impairment_confirmed: Optional[bool] = Field(default=None, description="Whether driver impairment confirmed")
    claim_notified_promptly: Optional[bool] = Field(default=None, description="Whether claim notified promptly")
    
    # Verification
    policy_schedule_verified: bool = Field(default=False, description="Exact policy schedule verified")
    adjuster_confirmed_accident: bool = Field(default=False, description="Adjuster confirmed damage is accident-related")
    surveyor_unrepairable: bool = Field(default=False, description="Surveyor assessed vehicle as unrepairable")
    
    # Optional financial
    salvage_value: Optional[int] = Field(default=None, ge=0, description="Salvage/wreck value in INR")
    deductible: Optional[int] = Field(default=None, ge=0, description="Applicable deductible in INR")
    
    # Validators
    @field_validator("policy_end_date")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        if "policy_start_date" in info.data and v <= info.data["policy_start_date"]:
            raise ValueError("policy_end_date must be after policy_start_date")
        return v
    
    @model_validator(mode="after")
    def validate_cost_range(self):
        if self.repair_estimate_min > self.repair_estimate_max:
            raise ValueError("repair_estimate_min cannot exceed repair_estimate_max")
        return self
    
    @field_validator("max_detection_confidence")
    @classmethod
    def validate_confidence(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError("max_detection_confidence must be between 0.0 and 1.0")
        return v


class ICICILombardScreeningResponse(BaseModel):
    """Response from ICICI Lombard policy suitability screening."""
    
    # Outcome
    outcome: ScreeningOutcome
    reason_codes: List[ReasonCode]
    explanation: str
    
    # Information gaps
    missing_information: List[str]
    human_review_required: bool
    decision_is_final: bool = False
    automatic_payment_authorized: bool = False
    
    # Financial calculations
    ctl_threshold_inr: int
    repair_plus_retrieval_cost_range_inr: Dict[str, int]
    cost_as_percent_of_idv_range: Dict[str, float]
    
    # Total loss / cash loss
    cash_loss_route_candidate: bool
    illustrative_cash_loss_calculation_inr: Optional[Dict[str, int]] = None
    
    # Next steps
    next_steps: List[str]
    policy_sources: List[str]
    
    # Disclaimer
    disclaimer: str = (
        "This screening is preliminary decision-support only. It does NOT authorize payment, "
        "guarantee coverage, or constitute a binding claim decision. Final decisions require "
        "authorized insurer/surveyor assessment per applicable policy wording."
    )


# ─── Core Screening Logic ────────────────────────────────────────────────

def calculate_ctl_threshold(idv: int) -> int:
    """Calculate CTL threshold at 75% of IDV."""
    return int(Decimal(idv) * CTL_THRESHOLD_RATIO)


def calculate_repair_plus_retrieval_cost(
    repair_min: int,
    repair_max: int,
    retrieval_cost: int
) -> Dict[str, int]:
    """Calculate repair + retrieval cost interval."""
    return {
        "min": repair_min + retrieval_cost,
        "max": repair_max + retrieval_cost
    }


def calculate_cost_as_percent_of_idv(
    cost_min: int,
    cost_max: int,
    idv: int
) -> Dict[str, float]:
    """Calculate cost as percentage of IDV."""
    if idv <= 0:
        return {"min": 0.0, "max": 0.0}
    return {
        "min": round(Decimal(cost_min) / Decimal(idv) * 100, 2),
        "max": round(Decimal(cost_max) / Decimal(idv) * 100, 2)
    }


def calculate_illustrative_cash_loss(
    idv: int,
    repair_min: int,
    repair_max: int,
    retrieval_cost: int,
    salvage_value: Optional[int] = None,
    deductible: Optional[int] = None
) -> Dict[str, int]:
    """
    Calculate illustrative total loss settlement per standard formula:
    Cash Loss = IDV - Salvage - Deductible (if applicable)
    
    This is ILLUSTRATIVE ONLY - not a settlement offer.
    """
    salvage = salvage_value or 0
    ded = deductible or 0
    
    # Standard total loss formula
    cash_loss = max(0, idv - salvage - ded)
    
    return {
        "idv": idv,
        "salvage_value": salvage,
        "deductible": ded,
        "illustrative_cash_loss": cash_loss
    }


def assess_minor_scratch_exclusion(
    damage_classes: List[str],
    severity: Optional[str],
    max_confidence: Optional[float]
) -> bool:
    """
    Check if detected damage might fall under 'minor scratch' exclusion.
    Per ICICI Lombard Customer Information Sheet, minor scratches may be excluded.
    """
    if severity != "minor":
        return False
    if max_confidence is None or max_confidence < 0.85:
        return False
    
    # Check if only scratch-like damages detected
    scratch_like = {"scratch", "paint_damage", "scuff"}
    detected_normalized = {d.lower().replace(" ", "_") for d in damage_classes}
    return bool(detected_normalized & scratch_like)


def screen_icici_lombard_suitability(request: ICICILombardScreeningRequest) -> ICICILombardScreeningResponse:
    """
    Main screening function implementing ICICI Lombard policy screening logic.
    
    Returns a structured screening result with outcome, reasons, and next steps.
    """
    reason_codes: List[ReasonCode] = []
    missing_info: List[str] = []
    policy_sources = [
        "ICICI Lombard Private Car Package Policy - Section 3 (Own Damage Coverage)",
        "ICICI Lombard Private Car Package Policy - Section 5 (Constructive Total Loss)",
        "ICICI Lombard Customer Information Sheet - Exclusions",
        "IRDAI Motor Insurance Guidelines (Constructive Total Loss at 75% IDV)"
    ]
    
    # ─── 1. Product & Coverage Validation ──────────────────────────────
    if request.product_type not in SUPPORTED_PRODUCT_TYPES:
        return ICICILombardScreeningResponse(
            outcome=ScreeningOutcome.PRODUCT_MISMATCH,
            reason_codes=[ReasonCode.PRODUCT_MISMATCH],
            explanation=f"Product type '{request.product_type.value}' is not supported by this screening module. "
                        f"Supported: {', '.join(SUPPORTED_PRODUCT_TYPES)}",
            missing_information=["Exact policy wording for this product type"],
            human_review_required=True,
            decision_is_final=False,
            automatic_payment_authorized=False,
            ctl_threshold_inr=0,
            repair_plus_retrieval_cost_range_inr={"min": 0, "max": 0},
            cost_as_percent_of_idv_range={"min": 0.0, "max": 0.0},
            cash_loss_route_candidate=False,
            next_steps=["Verify exact product name and wording with insurer", "Contact insurer for product-specific screening"],
            policy_sources=policy_sources
        )
    
    if not request.own_damage_cover:
        return ICICILombardScreeningResponse(
            outcome=ScreeningOutcome.INCOMPLETE_INFORMATION,
            reason_codes=[ReasonCode.NO_OWN_DAMAGE_COVER],
            explanation="Own-damage cover is not present on this policy. Own-damage coverage is required for damage assessment screening.",
            missing_information=["Own-damage coverage confirmation"],
            human_review_required=True,
            decision_is_final=False,
            automatic_payment_authorized=False,
            ctl_threshold_inr=0,
            repair_plus_retrieval_cost_range_inr={"min": 0, "max": 0},
            cost_as_percent_of_idv_range={"min": 0.0, "max": 0.0},
            cash_loss_route_candidate=False,
            next_steps=["Confirm own-damage coverage with policyholder", "Check policy schedule for coverage details"],
            policy_sources=policy_sources
        )
    
    # ─── 2. Policy Period Validation ───────────────────────────────────
    if request.incident_date < request.policy_start_date or request.incident_date > request.policy_end_date:
        return ICICILombardScreeningResponse(
            outcome=ScreeningOutcome.INCOMPLETE_INFORMATION,
            reason_codes=[ReasonCode.POLICY_INACTIVE],
            explanation=f"Incident date ({request.incident_date}) falls outside policy period "
                        f"({request.policy_start_date} to {request.policy_end_date}).",
            missing_information=["Valid incident date within policy period"],
            human_review_required=True,
            decision_is_final=False,
            automatic_payment_authorized=False,
            ctl_threshold_inr=0,
            repair_plus_retrieval_cost_range_inr={"min": 0, "max": 0},
            cost_as_percent_of_idv_range={"min": 0.0, "max": 0.0},
            cash_loss_route_candidate=False,
            next_steps=["Verify incident date with claimant", "Check policy period for coverage applicability"],
            policy_sources=policy_sources
        )
    
    # ─── 3. IDV & Cost Validation ──────────────────────────────────────
    if request.idv <= 0:
        return ICICILombardScreeningResponse(
            outcome=ScreeningOutcome.INCOMPLETE_INFORMATION,
            reason_codes=[ReasonCode.IDV_MISSING],
            explanation="Insured Declared Value (IDV) is missing or invalid.",
            missing_information=["Valid IDV in INR"],
            human_review_required=True,
            decision_is_final=False,
            automatic_payment_authorized=False,
            ctl_threshold_inr=0,
            repair_plus_retrieval_cost_range_inr={"min": 0, "max": 0},
            cost_as_percent_of_idv_range={"min": 0.0, "max": 0.0},
            cash_loss_route_candidate=False,
            next_steps=["Obtain valid IDV from policy schedule", "Verify vehicle valuation"],
            policy_sources=policy_sources
        )
    
    if request.repair_estimate_min < 0 or request.repair_estimate_max < 0:
        return ICICILombardScreeningResponse(
            outcome=ScreeningOutcome.INCOMPLETE_INFORMATION,
            reason_codes=[ReasonCode.REPAIR_ESTIMATE_MISSING],
            explanation="Repair estimates must be non-negative.",
            missing_information=["Valid repair cost estimates"],
            human_review_required=True,
            decision_is_final=False,
            automatic_payment_authorized=False,
            ctl_threshold_inr=0,
            repair_plus_retrieval_cost_range_inr={"min": 0, "max": 0},
            cost_as_percent_of_idv_range={"min": 0.0, "max": 0.0},
            cash_loss_route_candidate=False,
            next_steps=["Obtain valid repair estimates from garage/surveyor"],
            policy_sources=policy_sources
        )
    
    # ─── 4. Calculate Core Financial Metrics ───────────────────────────
    ctl_threshold = calculate_ctl_threshold(request.idv)
    repair_retrieval = calculate_repair_plus_retrieval_cost(
        request.repair_estimate_min,
        request.repair_estimate_max,
        request.retrieval_towing_cost
    )
    cost_pct = calculate_cost_as_percent_of_idv(
        repair_retrieval["min"],
        repair_retrieval["max"],
        request.idv
    )
    
    ctl_threshold_pct = 75.0  # Fixed at 75%
    
    min_pct = cost_pct["min"]
    max_pct = cost_pct["max"]
    
    # ─── 5. CTL Classification ─────────────────────────────────────────
    cash_loss_candidate = False
    cash_loss_calc = None
    outcome = ScreeningOutcome.STANDARD_PARTIAL_LOSS
    explanation_parts = []
    human_review = False
    decision_final = False
    
    # Check surveyor unrepairable first (Case D)
    if request.surveyor_unrepairable:
        outcome = ScreeningOutcome.SURVEYOR_UNREPAIRABLE
        reason_codes.append(ReasonCode.SURVEYOR_UNREPAIRABLE)
        explanation_parts.append(
            "Authorized surveyor has assessed the vehicle as unrepairable. "
            "This triggers a potential total-loss cash-loss route for insurer assessment, "
            "even if repair estimates don't independently exceed the CTL threshold."
        )
        cash_loss_candidate = True
        human_review = True
    
    # Standard CTL logic
    elif max_pct <= ctl_threshold_pct:
        # Case A: Entire range below threshold
        outcome = ScreeningOutcome.STANDARD_PARTIAL_LOSS
        reason_codes.append(ReasonCode.BELOW_CTL_THRESHOLD)
        explanation_parts.append(
            f"Repair + retrieval cost range ({min_pct:.1f}%–{max_pct:.1f}% of IDV) "
            f"is entirely below the CTL threshold (75% of IDV = ₹{calculate_ctl_threshold(request.idv):,}). "
            f"This indicates a standard partial loss assessment."
        )
        decision_final = True  # For screening purposes, this is conclusive
    
    elif min_pct <= ctl_threshold_pct < max_pct:
        # Case B: Range crosses threshold
        outcome = ScreeningOutcome.POTENTIAL_CTL
        reason_codes.append(ReasonCode.CROSSES_CTL_THRESHOLD)
        explanation_parts.append(
            f"Repair + retrieval cost range ({min_pct:.1f}%–{max_pct:.1f}% of IDV) "
            f"straddles the CTL threshold (75% of IDV = ₹{calculate_ctl_threshold(request.idv):,}). "
            f"The system cannot conclusively classify as partial loss or CTL. "
            f"Human review required to determine final classification."
        )
        human_review = True
    
    else:
        # Case C: Even minimum exceeds threshold
        outcome = ScreeningOutcome.POTENTIAL_TOTAL_LOSS
        reason_codes.append(ReasonCode.ABOVE_CTL_THRESHOLD)
        explanation_parts.append(
            f"Even the minimum repair + retrieval cost ({min_pct:.1f}% of IDV) "
            f"exceeds the CTL threshold (75% of IDV = ₹{calculate_ctl_threshold(request.idv):,}). "
            f"This indicates a potential constructive total loss / cash-loss scenario. "
            f"Requires authorized insurer/surveyor decision."
        )
        cash_loss_candidate = True
        human_review = True
    
    # ─── 6. Calculate Illustrative Cash Loss ───────────────────────────
    if cash_loss_candidate:
        cash_loss_calc = calculate_illustrative_cash_loss(
            request.idv,
            request.repair_estimate_min,
            request.repair_estimate_max,
            request.retrieval_towing_cost,
            request.salvage_value,
            request.deductible
        )
    
    # ─── 7. Evidence & Verification Checks ────────────────────────────
    if not request.four_view_validated:
        reason_codes.append(ReasonCode.FOUR_VIEW_INVALID)
        explanation_parts.append("Four-view photographic evidence has not been validated or is incomplete.")
        human_review = True
    
    if request.cv_review_required:
        reason_codes.append(ReasonCode.CV_REVIEW_REQUIRED)
        explanation_parts.append("Computer-vision review is flagged as required for this assessment.")
        human_review = True
    
    if request.estimate_source == EstimateSource.AI_PRELIMINARY:
        reason_codes.append(ReasonCode.ESTIMATE_SOURCE_AI_ONLY)
        explanation_parts.append("Repair estimate is based on AI preliminary assessment only. "
                                 "Garage quotation or surveyor assessment required for final determination.")
        human_review = True
    
    if not request.adjuster_confirmed_accident:
        reason_codes.append(ReasonCode.MISSING_ADJUSTER_CONFIRMATION)
        explanation_parts.append("Authorized adjuster has not confirmed damage is accident-related.")
        human_review = True
    
    if not request.policy_schedule_verified:
        reason_codes.append(ReasonCode.MISSING_POLICY_SCHEDULE)
        explanation_parts.append("Exact policy schedule has not been independently verified.")
        missing_info = "Policy schedule verification"
        if missing_info not in missing_info:
            missing_information.append(missing_info)
        human_review = True
    
    if not request.surveyor_unrepairable and request.repair_estimate_min > 0 and request.max_detection_confidence is not None and request.max_detection_confidence < 0.55:
        # Low confidence detections
        reason_codes.append(ReasonCode.MISSING_SURVEYOR_VERIFICATION)
        explanation_parts.append("Detection confidence is low; surveyor verification recommended.")
        human_review = True
    
    # ─── 8. Minor Scratch Exclusion Check ─────────────────────────────
    if assess_minor_scratch_exclusion(
        request.detected_damage_classes,
        request.damage_severity,
        request.max_detection_confidence
    ):
        outcome = ScreeningOutcome.POLICY_EXCLUSION_REVIEW
        reason_codes.append(ReasonCode.MINOR_SCRATCH_EXCLUSION)
        explanation_parts.append(
            "High-confidence minor scratch detected. Per ICICI Lombard Customer Information Sheet, "
            "minor scratches may be excluded from coverage. "
            "Exact product wording, endorsements, and facts must be confirmed."
        )
        human_review = True
    
    # ─── 9. Claim Circumstance Checks ──────────────────────────────────
    if request.driver_licence_valid is False:
        reason_codes.append(ReasonCode.INVALID_LICENCE)
        explanation_parts.append("Driver did not hold a valid licence at time of incident.")
        human_review = True
    
    if request.vehicle_use_compliant is False:
        reason_codes.append(ReasonCode.VEHICLE_MISUSE)
        explanation_parts.append("Vehicle was used outside policy terms at time of incident.")
        human_review = True
    
    if request.driver_impairment_confirmed is True:
        reason_codes.append(ReasonCode.DRIVER_IMPAIRED)
        explanation_parts.append("Driver impairment confirmed at time of incident.")
        human_review = True
    
    if request.claim_notified_promptly is False:
        reason_codes.append(ReasonCode.CLAIM_NOTIFICATION_LATE)
        explanation_parts.append("Claim was not notified promptly per policy terms.")
        human_review = True
    
    # ─── 10. Missing Information Summary ──────────────────────────────
    if not request.salvage_value and cash_loss_candidate:
        missing_information.append("Salvage value assessment")
    if not request.deductible:
        missing_information.append("Applicable deductible amount")
    if not request.policy_schedule_verified:
        missing_information.append("Policy schedule verification")
    if not request.adjuster_confirmed_accident:
        missing_information.append("Adjuster accident confirmation")
    if not request.surveyor_unrepairable and request.repair_estimate_min > 0:
        missing_information.append("Surveyor assessment")
    
    # ─── 10. Build Explanation ────────────────────────────────────────
    if not explanation_parts:
        explanation_parts.append("All screening checks passed. Standard partial loss assessment indicated.")
    
    explanation = " ".join(explanation_parts)
    
    # ─── 11. Next Steps ───────────────────────────────────────────────
    next_steps = []
    
    if human_review:
        next_steps.append("Route to human review for final determination")
    else:
        next_steps.append("Proceed with standard partial loss processing")
    
    if missing_information:
        next_steps.append(f"Obtain missing information: {', '.join(missing_information)}")
    
    if cash_loss_candidate:
        next_steps.append("Refer to authorized insurer/surveyor for total loss determination")
    
    if not request.policy_schedule_verified:
        next_steps.append("Verify exact policy schedule and endorsements")
    
    if request.estimate_source == EstimateSource.AI_PRELIMINARY:
        next_steps.append("Obtain garage quotation or surveyor assessment for repair cost validation")
    
    if assess_minor_scratch_exclusion(request.detected_damage_classes, request.damage_severity, request.max_detection_confidence):
        next_steps.append("Confirm exact product wording, endorsements, and facts for minor scratch exclusion")
    
    if not request.policy_schedule_verified:
        next_steps.append("Verify exact policy schedule and endorsements")
    
    # ─── 12. Illustrative Cash Loss ───────────────────────────────────
    illustrative_cash_loss = None
    if cash_loss_candidate:
        illustrative_cash_loss = calculate_illustrative_cash_loss(
            request.idv,
            request.repair_estimate_min,
            request.repair_estimate_max,
            request.retrieval_towing_cost,
            request.salvage_value,
            request.deductible
        )
    
    # ─── 13. Final Response ───────────────────────────────────────────
    return ICICILombardScreeningResponse(
        outcome=outcome,
        reason_codes=reason_codes,
        explanation=" ".join(explanation_parts),
        missing_information=missing_information,
        human_review_required=human_review,
        decision_is_final=decision_final,
        automatic_payment_authorized=False,
        ctl_threshold_inr=calculate_ctl_threshold(request.idv),
        repair_plus_retrieval_cost_range_inr=repair_retrieval,
        cost_as_percent_of_idv_range=cost_pct,
        cash_loss_route_candidate=cash_loss_candidate,
        illustrative_cash_loss_calculation_inr=illustrative_cash_loss,
        next_steps=next_steps,
        policy_sources=policy_sources
    )


# ─── API Router ──────────────────────────────────────────────────────────
router = APIRouter(prefix="/policy/icici-lombard", tags=["ICICI Lombard Screening"])


@router.post("/suitability", response_model=ICICILombardScreeningResponse)
async def screen_suitability(request: ICICILombardScreeningRequest):
    """
    ICICI Lombard Policy Suitability & Cash-Loss Screening
    
    Evaluates a vehicle damage claim against ICICI Lombard policy criteria:
    - Policy coverage & period validation
    - CTL (75% IDV) threshold screening
    - Repair + retrieval cost aggregation
    - Standard partial loss vs CTL vs Total Loss classification
    - Minor scratch exclusion check
    - Human review gates
    """
    try:
        result = screen_icici_lombard_suitability(request)
        logger.info(f"Screening completed: outcome={result.outcome}, review_required={result.human_review_required}")
        return result
    except Exception as e:
        logger.error(f"Screening error: {e}")
        raise HTTPException(status_code=500, detail=f"Screening failed: {type(e).__name__}: {e}")


@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ICICI Lombard Screening"}


@router.get("/info")
async def screening_info():
    """Return screening module metadata and policy sources."""
    return {
        "module": "ICICI Lombard Screening",
        "version": "1.0.0",
        "description": "Policy suitability & cash-loss screening for ICICI Lombard motor claims",
        "ctl_threshold": "75% of IDV (per IRDAI guidelines and ICICI Lombard policy)",
        "supported_products": SUPPORTED_PRODUCT_TYPES,
        "policy_sources": [
            "ICICI Lombard Private Car Package Policy",
            "ICICI Lombard Customer Information Sheet",
            "IRDAI Motor Insurance Guidelines (CTL at 75% IDV)"
        ],
        "thresholds": {
            "ctl_threshold_ratio": "0.75",
            "auto_approve_confidence": 0.85,
            "human_review_confidence": 0.55
        }
    }