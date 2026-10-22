"""
Idogur10 Car Damage Detection & Assessment Integration
======================================================

Integrates the CarDD-trained YOLO11s model (cardd_yolo11s_v2) with the ClaimPilot AI backend.

Pipeline: Image/Video Frames → YOLO11s (CarDD 6-class) Detection → Severity/Location/Cost → Assessment

This version uses the fine-tuned YOLO11s model trained on CarDD dataset (6 classes):
dent, scratch, crack, glass_shatter, lamp_broken, tire_flat
"""

from __future__ import annotations

import asyncio
import io
import os
import sys
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from PIL import Image

# Add CarDamage-Idogur10 to path for idogur10_scripts
CAR_DAMAGE_ROOT = Path(__file__).parent.parent.parent / "CarDamage-Idogur10"
sys.path.insert(0, str(CAR_DAMAGE_ROOT))

from car_damage_detector import CarDamageDetector
from idogur10_scripts.cost_estimator import estimate_cost, estimate_total_cost
from idogur10_scripts.report_generator import generate_report

# ─── Constants ──────────────────────────────────────────────────────────────

# Model path
PROJECT_ROOT = Path(__file__).parent
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

# Damage classes (6 classes from CarDD - matching cardd_yolo11s_v2)
DAMAGE_CLASSES = [
    "dent",
    "scratch",
    "crack",
    "glass_shatter",
    "lamp_broken",
    "tire_flat"
]

# Video frame extraction settings
VIDEO_FRAMES_PER_VIDEO = 2  # Extract 2 frames per video = 10 frames from 5 videos
MIN_VIDEO_DURATION_SEC = 1.0  # Minimum video duration to process

# ─── Pydantic Models ────────────────────────────────────────────────────────

class Idogur10AssessmentRequest(BaseModel):
    """Request for Idogur10 damage assessment with 15 inputs (5 images + 5 videos = 10 frames)"""
    claim_id: str
    assessment_id: str
    # 5 static images
    images: List[UploadFile] = Field(default=[], description="5 static images of the vehicle")
    # 5 videos (will extract 2 frames each = 10 frames)
    videos: List[UploadFile] = Field(default=[], description="5 videos of the vehicle")
    confidence_threshold: float = Field(default=0.35, ge=0.1, le=0.8)
    image_size: int = Field(default=640, ge=320, le=1280)
    policy_type: str = "comprehensive"
    deductible: int = 500
    vehicle_age_years: int = 5
    vehicle_mileage: int = 60000
    policy_holder_name: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[int] = None
    vehicle_vin: Optional[str] = None


class DamageDetectionResult(BaseModel):
    damage_type: str
    yolo_confidence: float
    severity: str
    severity_confidence: float
    severity_scores: Dict[str, float]
    location: str
    location_label: str
    location_confidence: float
    location_scores: Dict[str, float]
    cost: Dict[str, Any]
    bbox: Dict[str, float]


class Idogur10AssessmentResponse(BaseModel):
    assessment_id: str
    session_id: str
    timestamp: str
    total_inputs: int
    total_damages: int
    detections: List[Dict[str, Any]]
    cost_summary: Dict[str, Any]
    severity: str
    primary_component: str
    damage_summary: str
    pdf_report_path: Optional[str] = None
    json_path: Optional[str] = None


class Idogur10HealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    model_path: str
    classes: List[str]


# ─── Router ────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/idogur10", tags=["Idogur10 Damage Assessment (YOLO11s-CarDD)"])

# ─── Global Model Instance ────────────────────────────────────────────────

_detector: Optional[CarDamageDetector] = None


def get_detector() -> CarDamageDetector:
    """Get or create the CarDamageDetector instance (YOLO11s CarDD model)."""
    global _detector
    if _detector is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}")
        print(f"Loading YOLO11s CarDD model from {MODEL_PATH}")
        _detector = CarDamageDetector(model_path=str(MODEL_PATH), confidence_threshold=0.25)
    return _detector


def extract_frames_from_video(video_path: Path, num_frames: int = 2) -> List[Image.Image]:
    """
    Extract frames from a video file.
    
    Args:
        video_path: Path to the video file
        num_frames: Number of frames to extract (default 2)
    
    Returns:
        List of PIL Images (frames)
    """
    frames = []
    
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"WARNING: Could not open video: {video_path}")
        return frames
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps if fps > 0 else 0
    
    if duration < MIN_VIDEO_DURATION_SEC:
        print(f"WARNING: Video too short ({duration:.1f}s), skipping")
        cap.release()
        return frames
    
    # Extract frames evenly spaced throughout the video
    if total_frames <= num_frames:
        frame_indices = list(range(total_frames))
    else:
        frame_indices = [int(i * total_frames / num_frames) for i in range(num_frames)]
    
    for frame_idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            frames.append(pil_image)
    
    cap.release()
    return frames


async def process_images_and_videos(
    images: List[UploadFile],
    videos: List[UploadFile]
) -> List[Image.Image]:
    """
    Process uploaded images and videos, extracting frames from videos.
    
    Returns a list of PIL Images (5 images + 10 video frames = 15 total).
    """
    all_images = []
    
    # Process static images (up to 5)
    for idx, img_file in enumerate(images[:5]):
        if not img_file.filename:
            continue
        
        content = await img_file.read()
        print(f"DEBUG: Processing image {idx}: {img_file.filename}, size={len(content)} bytes")
        if len(content) < 1000:
            print(f"DEBUG: Image {img_file.filename} too small ({len(content)} bytes)")
            continue
            
        try:
            img = Image.open(io.BytesIO(content)).convert("RGB")
            print(f"DEBUG: Image {img_file.filename} loaded: {img.width}x{img.height}, mode={img.mode}")
            if img.width * img.height > 40_000_000:
                print(f"WARNING: Image {img_file.filename} too large, skipping")
                continue
            if img.width > 1920 or img.height > 1920:
                img.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
            all_images.append(img)
            print(f"DEBUG: Image {img_file.filename} added to processing queue")
        except Exception as e:
            print(f"WARNING: Failed to process image {img_file.filename}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    # Process videos (up to 5 videos, 2 frames each = 10 frames)
    for idx, vid_file in enumerate(videos[:5]):
        if not vid_file.filename:
            continue
        
        content = await vid_file.read()
        if len(content) < 1000:
            continue
        
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        
        try:
            frames = extract_frames_from_video(tmp_path, num_frames=VIDEO_FRAMES_PER_VIDEO)
            print(f"Extracted {len(frames)} frames from video {vid_file.filename}")
            all_images.extend(frames)
        except Exception as e:
            print(f"WARNING: Failed to process video {vid_file.filename}: {e}")
        finally:
            try:
                tmp_path.unlink()
            except:
                pass
    
    return all_images


def analyze_damage_with_yolo11s(
    detector: CarDamageDetector,
    image: Image.Image,
    confidence_threshold: float,
    source_index: int,
    source_type: str
) -> List[Dict[str, Any]]:
    """
    Run the YOLO11s CarDD detection on a single image.
    
    Returns list of detection dicts with all analysis results.
    """
    # Run detection using CarDamageDetector
    result = detector.detect_damage(image)
    detections = result.get('damages', result.get('detections', []))
    
    output_detections = []
    for det in detections:
        damage_type = det.get('type', det.get('damage_type', 'unknown'))
        confidence = det.get('confidence', 0.5)
        severity = det.get('severity', 'minor')
        location = det.get('location', 'unknown')
        bbox = det.get('bbox', [])
        area_percentage = det.get('area_percentage', 0)
        estimated_cost = det.get('estimated_cost', 0)
        
        # Convert bbox to dict format
        if bbox and len(bbox) == 4:
            bbox_dict = {
                "x1": round(float(bbox[0]), 1),
                "y1": round(float(bbox[1]), 1),
                "x2": round(float(bbox[2]), 1),
                "y2": round(float(bbox[3]), 1),
            }
        else:
            bbox_dict = {"x1": 0, "y1": 0, "x2": 0, "y2": 0}
        
        # Create severity scores (mock for compatibility)
        severity_scores = {severity: 0.8, "minor": 0.1, "moderate": 0.1, "severe": 0.1}
        if severity == "moderate":
            severity_scores = {"minor": 0.1, "moderate": 0.8, "severe": 0.1}
        elif severity == "severe":
            severity_scores = {"minor": 0.05, "moderate": 0.15, "severe": 0.8}
        
        # Create location scores (mock for compatibility)
        location_scores = {location: 0.8}
        for loc in ["upper left", "upper center", "upper right", "middle left", "middle center", "middle right", "lower left", "lower center", "lower right"]:
            if loc not in location_scores:
                location_scores[loc] = 0.025
        
        # Cost estimation using idogur10 cost estimator
        cost = estimate_cost(damage_type.replace("_", " "), severity)
        
        detection = {
            "damage_type": damage_type,
            "damage_type_display": damage_type.replace("_", " ").title(),
            "yolo_confidence": round(confidence, 4),
            "bbox": bbox_dict,
            "severity": severity,
            "severity_confidence": 0.8,
            "severity_scores": severity_scores,
            "location": location,
            "location_label": location,
            "location_confidence": 0.8,
            "location_scores": location_scores,
            "cost": cost,
            "area_percentage": round(area_percentage, 2),
            "estimated_cost": estimated_cost,
            "source_index": source_index,
            "source_type": source_type,
        }
        
        output_detections.append(detection)
    
    return output_detections


# ─── API Endpoints ────────────────────────────────────────────────────────


@router.get("/health", response_model=Idogur10HealthResponse)
async def health_check():
    """Health check endpoint with model status."""
    model_ok = MODEL_PATH.exists()
    return Idogur10HealthResponse(
        status="healthy" if model_ok else "degraded",
        version="2.0.0",
        model_loaded=model_ok,
        model_path=str(MODEL_PATH),
        classes=DAMAGE_CLASSES
    )


@router.post("/assess", response_model=Idogur10AssessmentResponse)
async def assess_damage(
    claim_id: str = Form(...),
    assessment_id: str = Form(...),
    images: List[UploadFile] = File(default=[]),
    videos: List[UploadFile] = File(default=[]),
    confidence_threshold: float = Form(default=0.35),
    image_size: int = Form(default=640),
    policy_type: str = Form(default="comprehensive"),
    deductible: int = Form(default=500),
    vehicle_age_years: int = Form(default=5),
    vehicle_mileage: int = Form(default=60000),
    policy_holder_name: Optional[str] = Form(default=None),
    vehicle_make: Optional[str] = Form(default=None),
    vehicle_model: Optional[str] = Form(default=None),
    vehicle_year: Optional[int] = Form(default=None),
    vehicle_vin: Optional[str] = Form(default=None),
):
    """
    Idogur10 Damage Assessment Endpoint (YOLO11s CarDD)
    
    Accepts 15 inputs total:
    - 5 static images (different angles of the vehicle)
    - 5 videos (2 frames extracted from each = 10 frames)
    
    Pipeline:
    1. Extract frames from videos (2 frames per video = 10 frames)
    2. Combine with 5 static images = 15 total inputs
    3. YOLO11s CarDD detection on all 15 inputs (6 damage classes)
    4. Severity classification from detection area
    5. Location classification from bbox position
    6. Cost estimation per detection
    7. Aggregate results + PDF report
    """
    session_id = f"idogur10_{uuid.uuid4().hex[:12]}"
    
    # Validate input counts
    if len(images) > 5:
        raise HTTPException(400, "Maximum 5 images allowed")
    if len(videos) > 5:
        raise HTTPException(400, "Maximum 5 videos allowed")
    
    total_inputs = len(images) + len(videos)
    if total_inputs == 0:
        raise HTTPException(400, "At least 1 image or video required")
    
    # Load model
    try:
        detector = get_detector()
        # Update confidence threshold
        detector.update_confidence_threshold(confidence_threshold)
    except Exception as e:
        raise HTTPException(500, f"Model loading failed: {str(e)}")
    
    # Process inputs
    print(f"Processing {len(images)} images and {len(videos)} videos...")
    all_images = await process_images_and_videos(images, videos)
    
    if not all_images:
        raise HTTPException(400, "No valid images or video frames could be processed")
    
    print(f"Total inputs to process: {len(all_images)} (target: 15 = 5 images + 10 video frames)")
    
    # Process all images
    all_detections = []
    for idx, image in enumerate(all_images):
        try:
            source_type = "image" if idx < len(images) else "video_frame"
            detections = analyze_damage_with_yolo11s(
                detector=detector,
                image=image,
                confidence_threshold=confidence_threshold,
                source_index=idx,
                source_type=source_type
            )
            all_detections.extend(detections)
        except Exception as e:
            print(f"WARNING: Failed to process image {idx}: {e}")
            continue
    
    # Aggregate results
    cost_summary = estimate_total_cost(all_detections)
    
    # Determine overall severity
    severities = [d["severity"] for d in all_detections]
    severity_order = {"severe": 3, "moderate": 2, "minor": 1}
    overall_severity = max(severities, key=lambda s: severity_order.get(s, 0)) if severities else "none"
    
    # Primary component (most expensive damage)
    if all_detections:
        primary_component = max(all_detections, key=lambda d: d["cost"]["max_cost"] if d["cost"] else 0)["damage_type_display"]
    else:
        primary_component = "None"
    
    # Generate unique assessment ID
    assessment_id = f"IDG-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    # Generate PDF report (optional)
    pdf_path = None
    try:
        pdf_output = Path(f"reports/idogur10_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf")
        pdf_output.parent.mkdir(parents=True, exist_ok=True)
        
        report_detections = []
        for det in all_detections:
            report_detections.append({
                "type": det["damage_type_display"],
                "severity": det["severity"],
                "confidence": det["yolo_confidence"],
                "bbox": [det["bbox"]["x1"], det["bbox"]["y1"], det["bbox"]["x2"], det["bbox"]["y2"]],
                "area_percentage": det["area_percentage"],
                "estimated_cost": det["cost"]["max_cost"] if det["cost"] else 0,
                "location": det["location_label"],
            })
        
        report_path = generate_report(
            image_path=None,
            detections=report_detections,
            cost_summary={
                "total_damages": len(all_detections),
                "total_estimated_cost": sum(d["cost"]["max_cost"] for d in all_detections if d["cost"]),
                "highest_severity": overall_severity,
                "average_confidence": sum(d["yolo_confidence"] for d in all_detections) / len(all_detections) if all_detections else 0,
            }
        )
        pdf_path = str(pdf_output)
    except Exception as e:
        print(f"WARNING: PDF generation failed: {e}")
    
    # Build response
    detections_output = []
    for det in all_detections:
        detections_output.append({
            "damage_type": det["damage_type_display"],
            "yolo_confidence": det["yolo_confidence"],
            "severity": det["severity"],
            "severity_confidence": det["severity_confidence"],
            "severity_scores": det["severity_scores"],
            "location": det["location"],
            "location_label": det["location_label"],
            "location_confidence": det["location_confidence"],
            "location_scores": det["location_scores"],
            "cost": det["cost"],
            "bbox": det["bbox"],
        })
    
    return Idogur10AssessmentResponse(
        assessment_id=assessment_id,
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        total_inputs=len(all_images),
        total_damages=len(all_detections),
        detections=detections_output,
        cost_summary={
            "total_min": sum(d["cost"]["min_cost"] for d in all_detections if d["cost"]),
            "total_max": sum(d["cost"]["max_cost"] for d in all_detections if d["cost"]),
            "total_average": sum((d["cost"]["min_cost"] + d["cost"]["max_cost"]) / 2 for d in all_detections if d["cost"]),
            "count": len(all_detections),
        },
        severity=overall_severity,
        primary_component=primary_component,
        damage_summary=f"Analyzed {len(all_images)} inputs (images + video frames). Found {len(all_detections)} damage instances using YOLO11s CarDD model.",
        pdf_report_path=pdf_path,
        json_path=None,
    )


@router.get("/classes")
async def get_classes():
    """Get the list of damage classes the model can detect."""
    return {
        "classes": DAMAGE_CLASSES,
        "count": len(DAMAGE_CLASSES),
        "descriptions": {
            "dent": "Depression in body panel",
            "scratch": "Surface scratch on paint",
            "crack": "Crack in bumper, fender, or panel",
            "glass_shatter": "Broken windshield or window glass",
            "lamp_broken": "Broken headlight, taillight, or indicator",
            "tire_flat": "Flat or damaged tire"
        }
    }


# ─── Helper function for cost calculation ───────────────────────────────────

def estimate_cost(damage_type: str, severity: str) -> Dict[str, Any]:
    """Estimate repair cost based on damage type and severity."""
    from idogur10_scripts.cost_estimator import estimate_cost
    return estimate_cost(damage_type.replace("_", " "), severity)


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    """Test the integration"""
    import asyncio
    
    async def test():
        # Test model loading
        detector = get_detector()
        print(f"YOLO11s CarDD model loaded: {type(detector)}")
        
        # Test with a sample image if available
        test_image = Path("CarDD_YOLO_6classes/images/test/000012.jpg")
        if test_image.exists():
            image = Image.open(test_image).convert("RGB")
            print(f"Test image loaded: {test_image}")
            results = detector.detect_damage(image)
            print(f"Detections: {results.get('total_damages', 0)}")
    
    asyncio.run(test())


if __name__ == "__main__":
    main()