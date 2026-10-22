"""
Damage Assessment Module — Policy-driven vehicle damage assessment.
Integrates CarDamageDetector (YOLOv8 on CarDD) + DecisionAgent (rules.yaml + SOPs).
No demo fallbacks — requires trained model and policy files.
"""

from __future__ import annotations

import uuid
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel, Field

# Local imports
from car_damage_detector import CarDamageDetector
from agentic.decision_agent import DecisionAgent
from agentic.adapters import pick_primary_detection, detection_to_damage_signal
from agentic.trace import build_decision_trace
from agentic.explainer import build_customer_explanation

# ─── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("damage_assessment")

# ─── Configuration ────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"
POLICIES_DIR = PROJECT_ROOT / "policies"

# ─── Globals (loaded on first request) ────────────────────────────────────
_detector: Optional[CarDamageDetector] = None
_agent: Optional[DecisionAgent] = None


def get_detector(confidence_threshold: float = 0.25) -> CarDamageDetector:
    """Get or create the CarDamageDetector instance."""
    global _detector
    if _detector is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}. Ensure best.pt is in models/")
        logger.info(f"Loading YOLOv8 model from {MODEL_PATH} with threshold {confidence_threshold}")
        _detector = CarDamageDetector(model_path=str(MODEL_PATH), confidence_threshold=confidence_threshold)
    elif _detector.confidence_threshold != confidence_threshold:
        logger.info(f"Updating detector threshold from {_detector.confidence_threshold} to {confidence_threshold}")
        _detector.update_confidence_threshold(confidence_threshold)
    return _detector


def get_agent() -> DecisionAgent:
    """Get or create the DecisionAgent instance."""
    global _agent
    if _agent is None:
        if not POLICIES_DIR.exists():
            raise RuntimeError(f"Policies directory not found at {POLICIES_DIR}")
        logger.info(f"Loading decision policies from {POLICIES_DIR}")
        _agent = DecisionAgent(policies_dir=str(POLICIES_DIR))
    return _agent


# ─── Response Models ──────────────────────────────────────────────────────
class DamageDetection(BaseModel):
    """Single detected damage instance."""
    damage_type: str = Field(..., description="Type of damage: scratch, dent, crack, crash, rub, glass_shatter, lamp_broken, dislocated_part, no_part, tire_flat")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score")
    severity: str = Field(..., description="Severity level: minor, moderate, severe")
    location: str = Field("unknown", description="Approximate location on vehicle")
    bbox: list = Field(default_factory=list, description="Bounding box [x1, y1, x2, y2]")
    area_percentage: float = Field(0.0, description="Percentage of image area affected")
    estimated_cost: int = Field(0, description="Estimated repair cost in USD")


class DecisionTrace(BaseModel):
    """Explains why a specific decision was made."""
    rule_applied: str = Field(..., description="Which policy rule triggered the decision")
    threshold: str = Field(..., description="Threshold that was evaluated")
    evidence: str = Field(..., description="SOP or policy evidence supporting the decision")


class AssessmentResult(BaseModel):
    """Full assessment response with decision trace."""
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    processing_time_ms: int = Field(..., description="Total processing time in milliseconds")

    # Detection results
    damages_detected: list[DamageDetection] = Field(default_factory=list)
    total_damages: int = Field(0, description="Number of damages detected")

    # Decision
    decision: str = Field(..., description="AUTO_APPROVE | HUMAN_REVIEW | ESCALATE")
    decision_confidence: float = Field(..., ge=0.0, le=1.0)
    decision_trace: list[DecisionTrace] = Field(default_factory=list)

    # Metadata
    model_version: str = Field("yolo11s-cardd-v2", description="CV model version used")
    policy_version: str = Field("v1.0", description="Policy version applied")
    cv_backend: str = Field("yolo11s", description="CV backend: yolo11s")
    human_review_required: bool = Field(False)


class HealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    agent_loaded: bool
    model_path: str
    policies_dir: str
    uptime_seconds: float


# ─── Router ───────────────────────────────────────────────────────────────
router = APIRouter(prefix="/assess", tags=["Damage Assessment"])

APP_START_TIME = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with model/agent status."""
    model_ok = MODEL_PATH.exists()
    agent_ok = POLICIES_DIR.exists()
    
    return HealthResponse(
        status="healthy" if (model_ok and agent_ok) else "degraded",
        version="2.0.0",
        model_loaded=model_ok,
        agent_loaded=agent_ok,
        model_path=str(MODEL_PATH),
        policies_dir=str(POLICIES_DIR),
        uptime_seconds=round(time.time() - APP_START_TIME, 1),
    )


@router.post("", response_model=AssessmentResult)
async def assess_damage(
    image: UploadFile = File(..., description="Vehicle image (JPEG/PNG/WebP)"),
    confidence_threshold: float = 0.25,
):
    """
    Main assessment endpoint.
    
    Upload a vehicle image → get structured damage assessment with:
    - Detected damages (type, severity, location, confidence)
    - Policy-based decision (AUTO_APPROVE / HUMAN_REVIEW / ESCALATE)
    - Full decision trace explaining *why* the decision was made
    """
    start_time = time.time()
    assessment_id = str(uuid.uuid4())[:12]

    # Validate file type
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {image.content_type}. Use JPEG, PNG, or WebP."
        )

    # Read image bytes
    image_bytes = await image.read()
    if len(image_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Image file is too small or empty.")
    if len(image_bytes) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="Image file exceeds 20MB limit.")

    logger.info(f"[{assessment_id}] Processing image: {image.filename} ({len(image_bytes)} bytes)")
    logger.info(f"[{assessment_id}] Using confidence_threshold: {confidence_threshold}")

    # Step 1: Damage detection (real model only — no demo fallback)
    try:
        from PIL import Image as PILImage
        import io
        detector = get_detector(confidence_threshold=confidence_threshold)
        logger.info(f"[{assessment_id}] Detector threshold after get_detector: {detector.confidence_threshold}")
        pil_img = PILImage.open(io.BytesIO(image_bytes))
        result = detector.detect_damage(pil_img)
        raw_detections_raw = result.get('damages', result.get('detections', []))
        
        # Normalize keys for API response
        raw_detections = []
        for det in raw_detections_raw:
            raw_detections.append({
                'damage_type': det.get('type', det.get('damage_type', 'unknown')),
                'confidence': det.get('confidence', 0.5),
                'severity': det.get('severity', 'minor'),
                'location': det.get('location', 'unknown'),
                'bbox': det.get('bbox', []),
                'area_percentage': det.get('area_percentage', 0),
                'estimated_cost': det.get('estimated_cost', 0),
            })
        cv_backend = "yolo11s"
    except Exception as e:
        logger.error(f"[{assessment_id}] CV detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Damage detection failed: {type(e).__name__}: {e}")

    # Normalize detections for response
    damages = [
        DamageDetection(
            damage_type=d.get("damage_type", "unknown"),
            confidence=d.get("confidence", 0.5),
            severity=d.get("severity", "minor"),
            location=d.get("location", "unknown"),
            bbox=d.get("bbox", []),
            area_percentage=d.get("area_percentage", 0.0),
            estimated_cost=d.get("estimated_cost", 0),
        )
        for d in raw_detections
    ]

    # Step 2: Decision agent (real policy engine only — no demo fallback)
    try:
        agent = get_agent()
        primary = pick_primary_detection(raw_detections)
        
        if primary is None:
            # No detections -> default to HUMAN_REVIEW for safety
            decision_result = {
                "decision": "HUMAN_REVIEW",
                "confidence": 0.5,
                "trace": [{
                    "rule_applied": "no_damage_detected",
                    "threshold": "damages == 0",
                    "evidence": "Policy: No damage detected -> human review for safety"
                }],
                "human_review_required": True,
            }
        else:
            signal = detection_to_damage_signal(primary)
            decision = agent.decide(signal)
            
            # Build trace
            trace = build_decision_trace(primary_detection=primary, signal=signal, decision=decision)
            
            # Customer-friendly explanation
            sop_text = getattr(decision, "evidence", None)
            expl = build_customer_explanation(
                decision_action=decision.action,
                decision_reason=decision.reason,
                policy_refs=list(decision.policy_refs or []),
                next_steps=list(decision.next_steps or []),
                sop_text=sop_text,
                signal=signal,
            )
            
            decision_result = {
                "decision": decision.action,
                "confidence": 0.8,  # Policy decisions are deterministic
                "trace": trace["steps"],
                "human_review_required": decision.action in ("HUMAN_REVIEW", "ESCALATE"),
            }
    except Exception as e:
        logger.error(f"[{assessment_id}] Decision agent failed: {e}")
        raise HTTPException(status_code=500, detail=f"Decision engine failed: {type(e).__name__}: {e}")

    # Build trace for response
    traces = [
        DecisionTrace(
            rule_applied=t.get("rule_applied", t.get("title", "unknown")),
            threshold=t.get("threshold", ""),
            evidence=t.get("evidence", t.get("details", [""])[0] if t.get("details") else ""),
        )
        for t in decision_result.get("trace", [])
    ]

    processing_time = int((time.time() - start_time) * 1000)

    logger.info(
        f"[{assessment_id}] Done: {len(damages)} damages, "
        f"decision={decision_result['decision']}, "
        f"time={processing_time}ms"
    )

    return AssessmentResult(
        assessment_id=assessment_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        processing_time_ms=processing_time,
        damages_detected=damages,
        total_damages=len(damages),
        decision=decision_result["decision"],
        decision_confidence=decision_result.get("confidence", 0.5),
        decision_trace=traces,
        model_version="yolov8n-cardd-v1",
        policy_version="v1.0",
        cv_backend=cv_backend,
        human_review_required=decision_result.get("human_review_required", False),
    )


@router.get("/policy")
async def get_policy():
    """Returns the current policy configuration."""
    policy_path = POLICIES_DIR
    policies = {}

    if policy_path.exists():
        for f in policy_path.glob("*.yaml"):
            policies[f.stem] = str(f)
        for f in policy_path.glob("*.yml"):
            policies[f.stem] = str(f)

    return {
        "policy_version": "v1.0",
        "policy_files": policies,
        "decision_types": ["AUTO_APPROVE", "HUMAN_REVIEW", "ESCALATE"],
        "severity_levels": ["minor", "moderate", "severe"],
        "rules_summary": {
            "no_damage": "HUMAN_REVIEW",
            "minor_scratch_high_conf": "AUTO_APPROVE",
            "moderate_dent": "HUMAN_REVIEW",
            "any_severe": "ESCALATE",
            "low_confidence": "HUMAN_REVIEW",
        }
    }