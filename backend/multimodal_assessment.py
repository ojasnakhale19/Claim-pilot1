"""
Multi-Modal Assessment Endpoint — Handles 3+ photos + 1 video mandatory.
Combines evidence from all sources for collective damage decision.
"""

from __future__ import annotations

import io
import uuid
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from PIL import Image
from car_damage_detector import CarDamageDetector
from agentic.decision_agent import DecisionAgent
from agentic.adapters import pick_primary_detection, detection_to_damage_signal
from agentic.trace import build_decision_trace
from agentic.explainer import build_customer_explanation
from video_processor import VideoProcessor, create_video_processor

# ─── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logger = logging.getLogger("multimodal_assessment")

# ─── Configuration ────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"
POLICIES_DIR = PROJECT_ROOT / "policies"

# ─── Constants ────────────────────────────────────────────────────────────
MIN_PHOTOS_REQUIRED = 3
MAX_PHOTOS_ALLOWED = 10
MAX_VIDEO_SIZE_MB = 100
MAX_PHOTO_SIZE_MB = 15
VIDEO_FRAME_TARGET = 10  # Number of frames to extract from video (exactly 10 for video+4-view workflow)

SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
SUPPORTED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}

# ─── Globals ──────────────────────────────────────────────────────────────
_detector: Optional[CarDamageDetector] = None
_agent: Optional[DecisionAgent] = None
_video_processor: Optional[VideoProcessor] = None


# ─── IoU and Deduplication Utilities ──────────────────────────────────────
def calculate_iou(box1, box2):
    """Calculate IoU between two boxes [x1, y1, x2, y2]."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    if x2 <= x1 or y2 <= y1:
        return 0.0
    
    intersection = (x2 - x1) * (y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0.0


def deduplicate_detections(detections, iou_threshold=0.3):
    """Merge detections that likely represent the same physical damage."""
    if not detections:
        return []
    
    # Group by damage type
    from collections import defaultdict
    by_type = defaultdict(list)
    for d in detections:
        by_type[d["damage_type"]].append(d)
    
    unique_detections = []
    for damage_type, dets in by_type.items():
        # Sort by confidence descending
        dets.sort(key=lambda x: x["confidence"], reverse=True)
        
        # IoU-based clustering: keep detections that don't overlap significantly
        kept = []
        for det in dets:
            bbox = det.get("bounding_box_xyxy", det.get("bbox", []))
            if len(bbox) != 4:
                kept.append(det)
                continue
            
            # Check IoU with already kept detections of same type
            is_duplicate = False
            for kept_det in kept:
                kept_bbox = kept_det.get("bounding_box_xyxy", kept_det.get("bbox", []))
                if len(kept_bbox) == 4:
                    iou = calculate_iou(bbox, kept_bbox)
                    if iou > iou_threshold:
                        is_duplicate = True
                        break
            
            if not is_duplicate:
                kept.append(det)
    
        unique_detections.extend(kept)
    
    return unique_detections


def get_detector(confidence_threshold: float = 0.25) -> CarDamageDetector:
    global _detector
    if _detector is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}")
        logger.info(f"Loading YOLO11s model from {MODEL_PATH} with threshold {confidence_threshold}")
        _detector = CarDamageDetector(model_path=str(MODEL_PATH), confidence_threshold=confidence_threshold)
    elif _detector.confidence_threshold != confidence_threshold:
        logger.info(f"Updating detector threshold from {_detector.confidence_threshold} to {confidence_threshold}")
        _detector.update_confidence_threshold(confidence_threshold)
    return _detector


def get_agent() -> DecisionAgent:
    global _agent
    if _agent is None:
        if not POLICIES_DIR.exists():
            raise RuntimeError(f"Policies directory not found at {POLICIES_DIR}")
        logger.info(f"Loading decision policies from {POLICIES_DIR}")
        _agent = DecisionAgent(policies_dir=str(POLICIES_DIR))
    return _agent


def get_video_processor() -> VideoProcessor:
    global _video_processor
    if _video_processor is None:
        _video_processor = create_video_processor(
            max_frames=VIDEO_FRAME_TARGET,
            max_video_size_mb=MAX_VIDEO_SIZE_MB
        )
    return _video_processor


# ─── Response Models ──────────────────────────────────────────────────────
class DamageDetection(BaseModel):
    damage_type: str = Field(..., description="Type of damage")
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: str = Field(..., description="minor, moderate, severe")
    location: str = Field("unknown")
    bbox: List[float] = Field(default_factory=list)
    area_percentage: float = Field(0.0)
    estimated_cost: int = Field(0)
    source: str = Field(..., description="photo or video_frame")
    source_index: int = Field(0, description="Photo index or frame index")


class VideoFrameSummary(BaseModel):
    frame_index: int
    timestamp_ms: float
    detections_count: int
    top_detection: Optional[DamageDetection] = None


class PhotoSummary(BaseModel):
    photo_index: int
    filename: str
    detections_count: int
    top_detection: Optional[DamageDetection] = None
    error: Optional[str] = None


class DecisionTrace(BaseModel):
    rule_applied: str
    threshold: str
    evidence: str


class MultiModalAssessmentResult(BaseModel):
    assessment_id: str
    timestamp: str
    processing_time_ms: int
    
    # Input summary
    photos_processed: int
    video_processed: bool
    video_frames_extracted: int
    video_duration_seconds: float
    
    # Detection results
    photos: List[PhotoSummary] = Field(default_factory=list)
    video_frames: List[VideoFrameSummary] = Field(default_factory=list)
    all_detections: List[DamageDetection] = Field(default_factory=list)
    total_detections: int
    
    # Collective decision
    decision: str = Field(..., description="AUTO_APPROVE | HUMAN_REVIEW | ESCALATE")
    decision_confidence: float = Field(..., ge=0.0, le=1.0)
    decision_trace: List[DecisionTrace] = Field(default_factory=list)
    
    # Metadata
    model_version: str = "yolo11s-cardd-v2"
    policy_version: str = "v1.0"
    cv_backend: str = "yolo11s"
    human_review_required: bool = False
    
    # Cost estimation
    estimated_repair_cost_min: int = 0
    estimated_repair_cost_max: int = 0
    settlement_offer: int = 0
    severity: str = "uncertain"
    primary_component: str = "Unable to determine"
    damage_summary: str = ""


class MultiModalHealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    agent_loaded: bool
    video_processor_ready: bool
    model_path: str
    policies_dir: str
    uptime_seconds: float


# ─── Router ───────────────────────────────────────────────────────────────
router = APIRouter(prefix="/assess/multimodal", tags=["Multi-Modal Assessment"])

APP_START_TIME = time.time()


# ─── Helper Functions ─────────────────────────────────────────────────────

async def read_and_validate_image(file: UploadFile, index: int, max_size_mb: int) -> Dict[str, Any]:
    """Read and validate a single image file."""
    if not file.filename:
        return {"index": index, "error": "No filename", "valid": False}
    
    ext = file.filename.split(".")[-1].lower()
    if file.content_type not in SUPPORTED_IMAGE_TYPES:
        return {"index": index, "error": f"Unsupported image type: {file.content_type}", "valid": False}
    
    content = await file.read()
    if len(content) > max_size_mb * 1024 * 1024:
        return {"index": index, "error": f"File too large (max {max_size_mb}MB)", "valid": False}
    
    if len(content) < 1000:
        return {"index": index, "error": "File too small or empty", "valid": False}
    
    return {
        "index": index,
        "filename": file.filename,
        "content": content,
        "content_type": file.content_type,
        "size": len(content),
        "valid": True
    }


async def read_and_validate_video(file: UploadFile) -> Dict[str, Any]:
    """Read and validate a single video file."""
    if not file.filename:
        return {"error": "No filename", "valid": False}
    
    if file.content_type not in SUPPORTED_VIDEO_TYPES:
        return {"error": f"Unsupported video type: {file.content_type}", "valid": False}
    
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE_MB * 1024 * 1024:
        return {"error": f"Video too large (max {MAX_VIDEO_SIZE_MB}MB)", "valid": False}
    
    if len(content) < 1000:
        return {"error": "Video file too small or empty", "valid": False}
    
    return {
        "filename": file.filename,
        "content": content,
        "content_type": file.content_type,
        "size": len(content),
        "valid": True
    }


def process_photo(
    detector: CarDamageDetector, 
    photo_data: Dict[str, Any], 
    photo_index: int
) -> PhotoSummary:
    """Process a single photo through the damage detector."""
    try:
        pil_img = Image.open(io.BytesIO(photo_data["content"]))
        result = detector.detect_damage(pil_img)
        raw_detections = result.get('damages', result.get('detections', []))
        
        detections = []
        for det in raw_detections:
            detections.append(DamageDetection(
                damage_type=det.get('type', det.get('damage_type', 'unknown')),
                confidence=det.get('confidence', 0.5),
                severity=det.get('severity', 'minor'),
                location=det.get('location', 'unknown'),
                bbox=det.get('bbox', []),
                area_percentage=det.get('area_percentage', 0),
                estimated_cost=det.get('estimated_cost', 0),
                source="photo",
                source_index=photo_index
            ))
        
        top_detection = detections[0] if detections else None
        
        return PhotoSummary(
            photo_index=photo_index,
            filename=photo_data["filename"],
            detections_count=len(detections),
            top_detection=top_detection
        ), detections
        
    except Exception as e:
        logger.error(f"Photo processing failed for index {photo_index}: {e}")
        return PhotoSummary(
            photo_index=photo_index,
            filename=photo_data["filename"],
            detections_count=0,
            error=str(e)
        ), []


def process_video_frames(
    detector: CarDamageDetector,
    video_result,
    video_processor: VideoProcessor
) -> tuple[List[VideoFrameSummary], List[DamageDetection]]:
    """Process extracted video frames through the damage detector."""
    frame_summaries = []
    all_detections = []
    
    for frame in video_result.extracted_frames:
        try:
            result = detector.detect_damage(frame.image)
            raw_detections = result.get('damages', result.get('detections', []))
            
            frame_detections = []
            for det in raw_detections:
                detection = DamageDetection(
                    damage_type=det.get('type', det.get('damage_type', 'unknown')),
                    confidence=det.get('confidence', 0.5),
                    severity=det.get('severity', 'minor'),
                    location=det.get('location', 'unknown'),
                    bbox=det.get('bbox', []),
                    area_percentage=det.get('area_percentage', 0),
                    estimated_cost=det.get('estimated_cost', 0),
                    source="video_frame",
                    source_index=frame.frame_index
                )
                frame_detections.append(detection)
                all_detections.append(detection)
            
            top_detection = frame_detections[0] if frame_detections else None
            
            frame_summaries.append(VideoFrameSummary(
                frame_index=frame.frame_index,
                timestamp_ms=frame.timestamp_ms,
                detections_count=len(frame_detections),
                top_detection=top_detection
            ))
            
        except Exception as e:
            logger.error(f"Video frame processing failed for frame {frame.frame_index}: {e}")
            frame_summaries.append(VideoFrameSummary(
                frame_index=frame.frame_index,
                timestamp_ms=frame.timestamp_ms,
                detections_count=0
            ))
    
    return frame_summaries, all_detections


def make_collective_decision(
    agent: DecisionAgent,
    all_detections: List[DamageDetection]
) -> Dict[str, Any]:
    """Make a collective decision based on all detections from photos and video."""
    
    if not all_detections:
        return {
            "decision": "HUMAN_REVIEW",
            "confidence": 0.5,
            "trace": [{
                "rule_applied": "no_damage_detected",
                "threshold": "damages == 0",
                "evidence": "Policy: No damage detected across all evidence -> human review for safety"
            }],
            "human_review_required": True
        }
    
    # Convert to format expected by decision agent
    raw_detections = []
    for det in all_detections:
        raw_detections.append({
            'damage_type': det.damage_type,
            'confidence': det.confidence,
            'severity': det.severity,
            'location': det.location,
            'bbox': det.bbox,
            'area_percentage': det.area_percentage,
            'estimated_cost': det.estimated_cost
        })
    
    # Pick primary detection (highest severity, then confidence)
    primary = pick_primary_detection(raw_detections)
    
    if primary is None:
        return {
            "decision": "HUMAN_REVIEW",
            "confidence": 0.5,
            "trace": [{
                "rule_applied": "no_primary_detection",
                "threshold": "primary is None",
                "evidence": "Could not determine primary damage"
            }],
            "human_review_required": True
        }
    
    signal = detection_to_damage_signal(primary)
    decision = agent.decide(signal)
    
    # Build trace
    trace = build_decision_trace(primary_detection=primary, signal=signal, decision=decision)
    
    return {
        "decision": decision.action,
        "confidence": 0.8,
        "trace": trace["steps"],
        "human_review_required": decision.action in ("HUMAN_REVIEW", "ESCALATE")
    }


def estimate_collective_costs(detections: List[DamageDetection]) -> tuple[int, int, str, str, str]:
    """Estimate repair costs from collective detections."""
    if not detections:
        return 0, 0, "uncertain", "Unable to determine", "No damage detected"
    
    # Normalize damage type names
    def normalize(name: str) -> str:
        return name.lower().replace(" ", "_").replace("-", "_")
    
    # Use the same cost estimation logic as the original endpoint
    from collections import Counter
    
    all_damage_types = [normalize(d.damage_type) for d in detections]
    primary_damage = Counter(all_damage_types).most_common(1)[0][0]
    max_conf = max(d.confidence for d in detections)
    total_count = len(detections)
    
    # Severity mapping - use area_percentage if available
    has_area = any(d.area_percentage > 0 for d in detections)
    
    if has_area:
        max_area = max(d.area_percentage for d in detections)
        if max_area >= 15:
            severity = "severe"
        elif max_area >= 5:
            severity = "moderate"
        elif max_area >= 1:
            severity = "minor"
        else:
            severity = "minor"
    else:
        # Fallback to confidence-based
        if max_conf >= 0.7 and total_count >= 3:
            severity = "severe"
        elif max_conf >= 0.5 and total_count >= 2:
            severity = "moderate"
        elif max_conf >= 0.3:
            severity = "minor"
        else:
            severity = "uncertain"
    
    # Cost map (matching model's 6 classes with underscores)
    DAMAGE_COST_MAP = {
        "dent": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
        "scratch": {"minor": (1500, 3000), "moderate": (3000, 6000), "severe": (6000, 12000)},
        "crack": {"minor": (3000, 5000), "moderate": (5000, 10000), "severe": (10000, 20000)},
        "glass_shatter": {"minor": (8000, 12000), "moderate": (12000, 18000), "severe": (18000, 30000)},
        "lamp_broken": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
        "tire_flat": {"minor": (200, 500), "moderate": (500, 1200), "severe": (1200, 3000)},
        "damage": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
    }
    
    cost_map = DAMAGE_COST_MAP.get(primary_damage, DAMAGE_COST_MAP["damage"])
    min_cost, max_cost = cost_map.get(severity, cost_map["minor"])
    
    # Use unique damage types for cost multiplier (not total detections)
    unique_types = list(set(all_damage_types))
    unique_count = len(unique_types)
    
    if unique_count > 1:
        # Each additional unique damage type adds 30% to cost
        min_cost = int(min_cost * (1 + 0.3 * (unique_count - 1)))
        max_cost = int(max_cost * (1 + 0.3 * (unique_count - 1)))
    elif total_count > 1:
        # Multiple detections of same type: smaller multiplier (10% per additional)
        min_cost = int(min_cost * (1 + 0.1 * (total_count - 1)))
        max_cost = int(max_cost * (1 + 0.1 * (total_count - 1)))
    
    component_map = {
        "dent": "Body Panel",
        "scratch": "Body Panel",
        "crack": "Bumper/Fender",
        "glass_shatter": "Windshield/Window",
        "lamp_broken": "Headlight/Taillight",
        "tire_flat": "Tire/Wheel",
        "damage": "Vehicle Component",
    }
    primary_component = component_map.get(primary_damage, "Vehicle Component")
    
    unique_types = list(set(all_damage_types))
    summary = f"Collective assessment: {total_count} detection(s) from photos and video. Types: {', '.join(unique_types)}. Primary: {primary_damage} ({severity})."
    
    return min_cost, max_cost, severity, primary_component, summary


# ─── Endpoints ────────────────────────────────────────────────────────────

@router.get("/health", response_model=MultiModalHealthResponse)
async def health_check():
    """Health check for multi-modal assessment."""
    model_ok = MODEL_PATH.exists()
    agent_ok = POLICIES_DIR.exists()
    
    return MultiModalHealthResponse(
        status="healthy" if (model_ok and agent_ok) else "degraded",
        version="2.0.0",
        model_loaded=model_ok,
        agent_loaded=agent_ok,
        video_processor_ready=True,
        model_path=str(MODEL_PATH),
        policies_dir=str(POLICIES_DIR),
        uptime_seconds=round(time.time() - APP_START_TIME, 1),
    )


@router.post("", response_model=MultiModalAssessmentResult)
async def assess_multimodal(
    photos: List[UploadFile] = File(..., description="At least 3 photos of vehicle damage"),
    video: UploadFile = File(..., description="One video walkaround of vehicle"),
    confidence_threshold: float = Form(default=0.25),
    image_size: int = Form(default=640),
):
    """
    Multi-Modal Damage Assessment
    
    **Requirements:**
    - Minimum 3 photos (different angles)
    - Exactly 1 video (walkaround showing all sides + license plate)
    - Maximum 10 photos total
    
    **Process:**
    1. Validate all inputs (3+ photos, 1 video)
    2. Process each photo through YOLOv8 damage detector
    3. Extract frames from video (uniform sampling)
    4. Process video frames through same detector
    5. Aggregate ALL detections (photos + video frames)
    6. Make collective decision via Policy Engine
    7. Return unified assessment with decision trace
    """
    start_time = time.time()
    assessment_id = str(uuid.uuid4())[:12]
    
    logger.info(f"[{assessment_id}] Multi-modal assessment: {len(photos)} photos, 1 video")
    
    # ─── Validate Photo Count ──────────────────────────────────────────────
    if len(photos) < MIN_PHOTOS_REQUIRED:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum {MIN_PHOTOS_REQUIRED} photos required. Received {len(photos)}."
        )
    
    if len(photos) > MAX_PHOTOS_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PHOTOS_ALLOWED} photos allowed. Received {len(photos)}."
        )
    
    # ─── Read & Validate Photos ────────────────────────────────────────────
    photo_results = []
    for i, photo in enumerate(photos):
        result = await read_and_validate_image(photo, i, MAX_PHOTO_SIZE_MB)
        if not result["valid"]:
            raise HTTPException(status_code=400, detail=f"Photo {i+1}: {result['error']}")
        photo_results.append(result)
    
    # ─── Read & Validate Video ─────────────────────────────────────────────
    video_result = await read_and_validate_video(video)
    if not video_result["valid"]:
        raise HTTPException(status_code=400, detail=f"Video: {video_result['error']}")
    
    # ─── Initialize Components ─────────────────────────────────────────────
    detector = get_detector(confidence_threshold=confidence_threshold)
    agent = get_agent()
    video_processor = get_video_processor()
    
    # ─── Process Photos ────────────────────────────────────────────────────
    photo_summaries = []
    all_detections = []
    
    for i, photo_data in enumerate(photo_results):
        summary, detections = process_photo(detector, photo_data, i)
        photo_summaries.append(summary)
        all_detections.extend(detections)
    
    # ─── Process Video ─────────────────────────────────────────────────────
    logger.info(f"[{assessment_id}] Extracting frames from video...")
    try:
        extraction_result = video_processor.extract_frames(
            video_result["content"],
            video_result["filename"],
            strategy="uniform",
            target_frames=VIDEO_FRAME_TARGET
        )
        
        frame_summaries, video_detections = process_video_frames(
            detector, extraction_result, video_processor
        )
        all_detections.extend(video_detections)
        
        video_processed = True
        video_frames_extracted = len(extraction_result.extracted_frames)
        video_duration = extraction_result.duration_seconds
        video_warnings = extraction_result.warnings
        
    except Exception as e:
        logger.error(f"[{assessment_id}] Video processing failed: {e}")
        # Continue with photos only if video fails
        frame_summaries = []
        video_processed = False
        video_frames_extracted = 0
        video_duration = 0.0
        video_warnings = [f"Video processing failed: {str(e)}"]
    
    # ─── Deduplicate Detections Across Frames/Views ───────────────────────────
    # Same physical damage appears in multiple frames/views; deduplicate by IoU clustering
    all_detections = deduplicate_detections(all_detections)
    
    # ─── Make Collective Decision ──────────────────────────────────────────
    decision_result = make_collective_decision(agent, all_detections)
    
    # ─── Estimate Costs ────────────────────────────────────────────────────
    min_cost, max_cost, severity, primary_component, summary = estimate_collective_costs(all_detections)
    
    settlement_offer = int((min_cost + max_cost) / 2 * 0.7) if min_cost > 0 else 0
    
    # ─── Build Decision Trace for Response ─────────────────────────────────
    traces = [
        DecisionTrace(
            rule_applied=t.get("rule_applied", t.get("title", "unknown")),
            threshold=t.get("threshold", ""),
            evidence=t.get("evidence", t.get("details", [""])[0] if t.get("details") else "")
        )
        for t in decision_result.get("trace", [])
    ]
    
    processing_time = int((time.time() - start_time) * 1000)
    
    logger.info(
        f"[{assessment_id}] Complete: {len(photo_results)} photos, "
        f"{video_frames_extracted} video frames, "
        f"{len(all_detections)} total detections, "
        f"decision={decision_result['decision']}, "
        f"time={processing_time}ms"
    )
    
    return MultiModalAssessmentResult(
        assessment_id=assessment_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        processing_time_ms=processing_time,
        
        photos_processed=len(photo_results),
        video_processed=video_processed,
        video_frames_extracted=video_frames_extracted,
        video_duration_seconds=video_duration,
        
        photos=photo_summaries,
        video_frames=frame_summaries,
        all_detections=all_detections,
        total_detections=len(all_detections),
        
        decision=decision_result["decision"],
        decision_confidence=decision_result.get("confidence", 0.5),
        decision_trace=traces,
        
        human_review_required=decision_result.get("human_review_required", False),
        
        estimated_repair_cost_min=min_cost,
        estimated_repair_cost_max=max_cost,
        settlement_offer=settlement_offer,
        severity=severity,
        primary_component=primary_component,
        damage_summary=summary,
    )


@router.get("/requirements")
async def get_requirements():
    """Returns the input requirements for multi-modal assessment."""
    return {
        "minimum_photos": MIN_PHOTOS_REQUIRED,
        "maximum_photos": MAX_PHOTOS_ALLOWED,
        "required_videos": 1,
        "max_photo_size_mb": MAX_PHOTO_SIZE_MB,
        "max_video_size_mb": MAX_VIDEO_SIZE_MB,
        "supported_image_types": list(SUPPORTED_IMAGE_TYPES),
        "supported_video_types": list(SUPPORTED_VIDEO_TYPES),
        "video_frame_target": VIDEO_FRAME_TARGET,
        "description": (
            f"Upload at least {MIN_PHOTOS_REQUIRED} photos (different angles of damage) "
            f"and 1 video (walkaround showing all sides + license plate). "
            f"Video will be sampled into {VIDEO_FRAME_TARGET} frames for analysis."
        )
    }