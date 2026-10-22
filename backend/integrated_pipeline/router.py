"""
Integrated Pipeline Router for ClaimPilot AI
=============================================
Exposes the 14-frame majority-voting damage detection pipeline as a ClaimPilot endpoint.

Endpoint: POST /assess/integrated-fourteen-frame
Processes: 4 images + 1 video (10 frames) = 14 total frames
Returns: Majority-voted damage type, severity, per-frame details, aggregated JSON
"""

from __future__ import annotations

import uuid
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Local imports
from .detector import CarDamageDetector, AggregatedResult, create_detector
from .config import MAX_IMAGES, MAX_VIDEO_FRAMES, VIDEO_FRAME_SKIP

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("integrated_pipeline")

# ─── Configuration ─────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

# ─── Globals ────────────────────────────────────────────────────────────────
_detector: Optional[CarDamageDetector] = None


def get_detector(confidence_threshold: float = 0.25) -> CarDamageDetector:
    """Get or create the CarDamageDetector instance."""
    global _detector
    if _detector is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}. Ensure best.pt is in models/")
        logger.info(f"Loading integrated pipeline model from {MODEL_PATH} with threshold {confidence_threshold}")
        _detector = CarDamageDetector(model_path=str(MODEL_PATH), confidence_threshold=confidence_threshold)
    elif _detector.confidence_threshold != confidence_threshold:
        logger.info(f"Updating detector threshold from {_detector.confidence_threshold} to {confidence_threshold}")
        _detector.update_confidence_threshold(confidence_threshold)
    return _detector


# ─── Response Models ────────────────────────────────────────────────────────
class FrameDetection(BaseModel):
    """Single detection in a frame."""
    damage_type: str
    confidence: float
    bbox: List[float] = []  # [x1, y1, x2, y2] normalized
    bbox_pixels: List[int] = []  # [x1, y1, x2, y2] pixels


class FrameResultResponse(BaseModel):
    """Per-frame result summary."""
    frame_id: int
    source: str
    detections: List[FrameDetection]
    detection_count: int
    severity_level: str
    severity_score: float
    damage_types: List[str]


class IntegratedAssessmentResponse(BaseModel):
    """Full integrated pipeline assessment response."""
    assessment_id: str
    timestamp: str
    processing_time_ms: int
    
    # Input info
    images_processed: int
    video_frames_processed: int
    total_frames: int
    
    # Aggregated majority result
    majority_damage_type: str
    majority_count: int
    majority_percentage: float
    damage_type_votes: dict[str, int]
    damage_type_total_detections: dict[str, int]
    
    # Severity
    overall_severity_level: str
    avg_severity_score: float
    severity_distribution: dict[str, int]
    
    # Per-frame details
    per_frame_results: List[FrameResultResponse]
    
    # Metadata
    model_version: str = "ultralytics-yolov8-integrated-v1"
    cv_backend: str = "ultralytics-yolo"
    label_mapping_applied: dict[str, str] = {"lamp_broken": "scratch"}
    limitations: List[str] = Field(default_factory=lambda: [
        "Visual assessment only — hidden structural damage not assessable from photographs",
        "Majority voting across 14 frames (4 images + 10 video frames)",
        "Label mapping: lamp_broken → scratch for insurance classification",
        "Cost estimates assume standard regional labour rates; physical inspection recommended"
    ])


class HealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    model_path: str
    uptime_seconds: float


# ─── Router ─────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/assess/integrated", tags=["Integrated 14-Frame Pipeline"])

APP_START_TIME = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with model status."""
    model_ok = MODEL_PATH.exists()
    
    return HealthResponse(
        status="healthy" if model_ok else "degraded",
        version="1.0.0",
        model_loaded=model_ok,
        model_path=str(MODEL_PATH),
        uptime_seconds=round(time.time() - APP_START_TIME, 1),
    )


@router.post("/fourteen-frame", response_model=IntegratedAssessmentResponse)
async def assess_fourteen_frame(
    # 4 required images
    image1: UploadFile = File(..., description="Image 1 (required)"),
    image2: UploadFile = File(..., description="Image 2 (required)"),
    image3: UploadFile = File(..., description="Image 3 (required)"),
    image4: UploadFile = File(..., description="Image 4 (required)"),
    # 1 video (10 frames extracted)
    video: UploadFile = File(..., description="Video walkaround (8-10 seconds, 10 frames extracted)"),
    # Optional params
    confidence_threshold: float = Form(default=0.25),
    vehicle_make: str = Form(default=""),
    vehicle_model: str = Form(default=""),
    vehicle_year: str = Form(default=""),
    cause_of_damage: str = Form(default=""),
):
    """
    14-Frame Majority Voting Damage Assessment
    
    Processes:
    - 4 uploaded images (different angles/views)
    - 1 video (8-10 seconds, extracts 10 uniform frames)
    
    Total: 14 frames analyzed
    
    Pipeline:
    1. Run YOLO detection on all 14 frames
    2. Apply label mapping (lamp_broken → scratch)
    3. Assess severity per frame
    4. Majority voting: each frame votes for damage types present
    5. Return aggregated result with winning damage type
    
    Returns:
    - Majority damage type (most frames containing this damage)
    - Overall severity (average across frames)
    - Per-frame breakdown
    - Damage type votes and totals
    """
    start_time = time.time()
    assessment_id = f"INT14-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Validate files
    images = [image1, image2, image3, image4]
    image_files = []
    
    for i, img_file in enumerate(images):
        if not img_file.filename:
            raise HTTPException(status_code=400, detail=f"Image {i+1}: No file provided")
        ext = img_file.filename.split(".")[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "bmp", "tiff"):
            raise HTTPException(status_code=400, detail=f"Image {i+1}: Unsupported format. Use JPG, PNG, WebP, BMP, TIFF.")
        content = await img_file.read()
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Image {i+1}: File too large (max 15MB)")
        if len(content) < 1000:
            raise HTTPException(status_code=400, detail=f"Image {i+1}: File too small or empty")
        image_files.append((img_file.filename, content))

    # Validate video
    if not video.filename:
        raise HTTPException(status_code=400, detail="Video: No file provided")
    if video.content_type not in ("video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"):
        raise HTTPException(status_code=400, detail="Video: Unsupported format. Use MP4, MOV, AVI, or WebM.")
    
    video_content = await video.read()
    if len(video_content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Video too large (max 100MB)")
    if len(video_content) < 1000:
        raise HTTPException(status_code=400, detail="Video file too small or empty")

    logger.info(f"[{assessment_id}] Processing 4 images + 1 video ({len(video_content)} bytes)")

    # Get detector
    try:
        detector = get_detector(confidence_threshold=confidence_threshold)
    except Exception as e:
        logger.error(f"[{assessment_id}] Detector initialization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Model loading failed: {type(e).__name__}: {e}")

    # Save files temporarily for processing
    import tempfile
    import os
    
    temp_image_paths = []
    temp_video_path = None
    
    try:
        # Save images
        for filename, content in image_files:
            ext = Path(filename).suffix
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(content)
                temp_image_paths.append(Path(tmp.name))
        
        # Save video
        video_ext = Path(video.filename).suffix.lower()
        with tempfile.NamedTemporaryFile(suffix=video_ext, delete=False) as tmp:
            tmp.write(video_content)
            temp_video_path = Path(tmp.name)

        # Process batch (4 images + 10 video frames = 14 total)
        logger.info(f"[{assessment_id}] Running integrated pipeline inference...")
        image_results, video_results, aggregated = detector.process_batch(
            image_paths=temp_image_paths,
            video_paths=[temp_video_path],
            max_images=MAX_IMAGES,
            max_video_frames=MAX_VIDEO_FRAMES,
        )

        # Build per-frame response
        per_frame_response = []
        all_frames = list(image_results)
        for vr in video_results:
            all_frames.extend(vr.frame_results)
        
        for fr in all_frames:
            detections_response = [
                FrameDetection(
                    damage_type=det.class_name,
                    confidence=det.confidence,
                    bbox=list(det.bbox),
                    bbox_pixels=list(det.bbox_px),
                )
                for det in fr.detections
            ]
            per_frame_response.append(FrameResultResponse(
                frame_id=fr.frame_id,
                source=Path(fr.source_path).name,
                detections=detections_response,
                detection_count=len(fr.detections),
                severity_level=fr.severity_level,
                severity_score=fr.severity_score,
                damage_types=list(set(det.class_name for det in fr.detections)),
            ))

        # Calculate majority percentage
        majority_pct = (aggregated.majority_count / aggregated.total_frames * 100) if aggregated.total_frames > 0 else 0

        processing_time = int((time.time() - start_time) * 1000)

        logger.info(
            f"[{assessment_id}] Done: {aggregated.total_frames} frames, "
            f"majority={aggregated.majority_damage_type} ({majority_pct:.1f}%), "
            f"severity={aggregated.overall_severity_level}, "
            f"time={processing_time}ms"
        )

        return IntegratedAssessmentResponse(
            assessment_id=assessment_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=processing_time,
            images_processed=len(image_results),
            video_frames_processed=video_results[0].processed_frames if video_results else 0,
            total_frames=aggregated.total_frames,
            majority_damage_type=aggregated.majority_damage_type,
            majority_count=aggregated.majority_count,
            majority_percentage=round(majority_pct, 1),
            damage_type_votes=aggregated.damage_type_votes,
            damage_type_total_detections=aggregated.damage_type_total_detections,
            overall_severity_level=aggregated.overall_severity_level,
            avg_severity_score=round(aggregated.avg_severity_score, 4),
            severity_distribution=aggregated.severity_distribution,
            per_frame_results=per_frame_response,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{assessment_id}] Assessment failed: {e}")
        raise HTTPException(status_code=500, detail=f"Assessment failed: {type(e).__name__}: {e}")
    
    finally:
        # Cleanup temp files
        for p in temp_image_paths:
            try:
                os.unlink(p)
            except:
                pass
        if temp_video_path:
            try:
                os.unlink(temp_video_path)
            except:
                pass


@router.get("/config")
async def get_config():
    """Returns the current pipeline configuration."""
    from .config import (
        CLASS_NAMES, EFFECTIVE_CLASS_NAMES, LABEL_MAPPING,
        CLASS_CONF_THRESHOLDS, SEVERITY_CONFIG,
        MAX_IMAGES, MAX_VIDEO_FRAMES, VIDEO_FRAME_SKIP
    )
    
    return {
        "pipeline_version": "1.0.0",
        "model_classes": CLASS_NAMES,
        "effective_classes": EFFECTIVE_CLASS_NAMES,
        "label_mapping": LABEL_MAPPING,
        "class_confidence_thresholds": CLASS_CONF_THRESHOLDS,
        "severity_config": SEVERITY_CONFIG,
        "processing": {
            "max_images": MAX_IMAGES,
            "max_video_frames": MAX_VIDEO_FRAMES,
            "video_frame_skip": VIDEO_FRAME_SKIP,
            "total_frames_per_assessment": MAX_IMAGES + MAX_VIDEO_FRAMES,
        },
        "description": "14-frame majority voting pipeline: 4 images + 10 video frames = 14 frames total"
    }