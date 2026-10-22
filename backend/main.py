"""FastAPI backend for ClaimPilot AI - OpenAI GPT-4o-mini vision only."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import httpx
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from video_processor import create_video_processor
from integrated_pipeline import (
    CarDamageDetector as IntegratedCarDamageDetector,
    AggregatedResult as IntegratedAggregatedResult,
)
from integrated_pipeline.router import router as integrated_router

# ─── Logging & Model Path ──────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("claimpilot")

_BACKEND_ROOT = Path(__file__).resolve().parent
MODEL_PATH = _BACKEND_ROOT / "models" / "best.pt"

# Load environment variables from .env file
load_dotenv()


def _dhash(image: Image.Image) -> int:
    """Return a 128-bit difference hash for near-duplicate screening.
    Uses color-aware hashing to distinguish images with different colors."""
    # Create a color-aware hash by computing dhash on each channel separately
    channels = image.convert("RGB").split()
    hash_value = 0
    
    for channel in channels:
        # Resize to 8x8 for each channel (64 bits per channel)
        small = ImageOps.fit(channel, (8, 8))
        pixels = np.asarray(channel.resize((8, 8)), dtype=np.uint8)
        
        # Compute difference hash for this channel
        bits = pixels[:, 1:] > pixels[:, :-1]
        channel_hash = 0
        for bit in bits.flatten():
            channel_hash = (channel_hash << 1) | int(bit)
        
        # Combine channel hashes
        hash_value = (hash_value << 64) | channel_hash
    
    # Add histogram hash for additional uniqueness
    hist = image.histogram()
    hist_hash = hash(tuple(hist[:768])) & 0xFFFFFFFFFFFFFFFF
    
    # Combine perceptual hash with histogram hash
    return (hash_value << 32) ^ (hist_hash & 0xFFFFFFFF)


def _hamming_distance(first: int, second: int) -> int:
    return bin(first ^ second).count("1")


# ─── Constants ──────────────────────────────────────────────────────────────
REQUIRED_VIEWS = ("top", "bottom", "left", "right")
SUPPORTED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MIN_IMAGE_SIDE = int(os.getenv("AUTOSETTLE_MIN_IMAGE_SIDE", "240"))
# Lowered from 18 to 10 — phone photos can have lower sharpness scores without being genuinely blurry
MIN_LAPLACIAN_VARIANCE = float(os.getenv("AUTOSETTLE_MIN_LAPLACIAN_VARIANCE", "10"))
NEAR_DUPLICATE_DISTANCE = int(os.getenv("AUTOSETTLE_NEAR_DUPLICATE_DISTANCE", "3"))
LOW_CONFIDENCE_THRESHOLD = float(os.getenv("AUTOSETTLE_LOW_CONFIDENCE_THRESHOLD", "0.40"))

VIDEO_FRAME_TARGET = 10
MIN_VIDEO_DURATION = 8.0
MAX_VIDEO_DURATION = 10.0
MAX_VIDEO_SIZE_MB = 100
MAX_PHOTO_SIZE_MB = 15
SUPPORTED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}

# ─── Image Utilities ────────────────────────────────────────────────────────
def image_metrics(image: Image.Image) -> dict[str, Any]:
    """Return simple image quality measures."""
    rgb = np.asarray(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    width, height = image.size
    return {
        "width": int(width),
        "height": int(height),
        "pixel_count": int(width * height),
        "laplacian_variance": round(blur_score, 2),
        "sha256_normalized_pixels": __import__("hashlib").sha256(rgb.tobytes()).hexdigest(),
    }


# ─── OpenAI Configuration ───────────────────────────────────────────────────
AI_PROVIDER = "openai"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ─── Cost Estimation ────────────────────────────────────────────────────────
DAMAGE_COST_MAP = {
    "dent": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
    "scratch": {"minor": (1500, 3000), "moderate": (3000, 6000), "severe": (6000, 12000)},
    "crack": {"minor": (3000, 5000), "moderate": (5000, 10000), "severe": (10000, 20000)},
    "glass_shatter": {"minor": (8000, 12000), "moderate": (12000, 18000), "severe": (18000, 30000)},
    "lamp_broken": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
    "tire_flat": {"minor": (200, 500), "moderate": (500, 1200), "severe": (1200, 3000)},
    "damage": {"minor": (2000, 4000), "moderate": (4000, 8000), "severe": (8000, 15000)},
}

VALID_DAMAGE_CLASSES = {
    "dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat"
}

def normalize_damage_type(name: str) -> str:
    s = (name or "").strip().lower()
    if "scratch" in name.lower(): return "scratch"
    if "dent" in name.lower(): return "dent"
    if "crack" in name.lower(): return "crack"
    if "glass" in name.lower() and "shatter" in name.lower(): return "glass_shatter"
    if "lamp" in name.lower() and "broken" in name.lower(): return "lamp_broken"
    if "tire" in name.lower() and "flat" in name.lower(): return "tire_flat"
    return name.lower().replace(" ", "_").replace("-", "_")

def is_valid_damage_class(name: str) -> bool:
    normalized = normalize_damage_type(name)
    return normalized in VALID_DAMAGE_CLASSES

def estimate_costs(detections_by_view: Dict[str, Any]) -> tuple[int, int, str, str, str]:
    all_detections = []
    for view_data in detections_by_view.values():
        all_detections.extend(view_data.get("detections", []))

    if not all_detections:
        return 0, 0, "uncertain", "Unable to determine", "No supported damage classes detected."

    for d in all_detections:
        d["damage_type"] = normalize_damage_type(d["damage_type"])

    valid_detections = [d for d in all_detections if is_valid_damage_class(d["damage_type"])]
    
    if not valid_detections:
        return 0, 0, "uncertain", "Unable to determine", "No valid damage classes detected."

    max_conf = max(d["confidence"] for d in valid_detections)
    total_valid_count = len(valid_detections)

    from collections import Counter
    damage_types = [d["damage_type"] for d in valid_detections]
    primary_damage = Counter(damage_types).most_common(1)[0][0]

    if max_conf >= 0.7 and total_valid_count >= 3:
        severity = "severe"
    elif max_conf >= 0.5 and total_valid_count >= 2:
        severity = "moderate"
    elif max_conf >= 0.3:
        severity = "minor"
    else:
        severity = "uncertain"

    cost_map = DAMAGE_COST_MAP.get(primary_damage, DAMAGE_COST_MAP["damage"])
    min_cost, max_cost = cost_map.get(severity, cost_map["minor"])

    unique_damage_types = set(damage_types)
    unique_count = len(unique_damage_types)
    
    if unique_count > 1:
        min_cost = int(min_cost * (1 + 0.3 * (unique_count - 1)))
        max_cost = int(max_cost * (1 + 0.3 * (unique_count - 1)))
    elif total_valid_count > 1:
        min_cost = int(min_cost * (1 + 0.1 * (total_valid_count - 1)))
        max_cost = int(max_cost * (1 + 0.1 * (total_valid_count - 1)))

    component_map = {
        "dent": "Body Panel", "scratch": "Body Panel", "crack": "Bumper/Fender",
        "glass_shatter": "Windshield/Window", "lamp_broken": "Headlight/Taillight",
        "tire_flat": "Tire/Wheel", "damage": "Vehicle Component",
    }
    primary_component = component_map.get(primary_damage, "Vehicle Component")

    unique_types = list(set(damage_types))
    summary = f"Detected {total_valid_count} valid damage instance(s): {', '.join(unique_types)}. Primary: {primary_damage} ({severity})."

    return min_cost, max_cost, severity, primary_component, summary


def estimate_collective_costs(all_detections: List[Dict[str, Any]]) -> tuple[int, int, str, str, str]:
    """Estimate costs from a flat list of detection dicts (used by video-four-view endpoint)."""
    if not all_detections:
        return 0, 0, "uncertain", "Unable to determine", "No damage detected."
    detections_by_view: Dict[str, Any] = {"combined": {"detections": all_detections}}
    return estimate_costs(detections_by_view)

# ─── Image Utilities ────────────────────────────────────────────────────────
def decode_image(data: bytes | bytearray | Image.Image) -> Image.Image:
    if isinstance(data, Image.Image):
        image = data.copy()
    else:
        try:
            image = Image.open(io.BytesIO(bytes(data)))
            if image.width * image.height > 40_000_000:
                raise ValueError("Image too large (over 40 megapixels).")
            image.load()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise ValueError("Could not decode image or exceeds size limit.") from exc
    if image.width * image.height > 40_000_000:
        raise ValueError("Image too large (over 40 megapixels).")
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")

def image_to_base64(image: Image.Image) -> str:
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG", quality=85)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def validate_four_views(images: Dict[str, Image.Image | bytes | bytearray | None]) -> dict[str, Any]:
    blockers: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    prepared: dict[str, Image.Image] = {}
    metrics: dict[str, dict[str, Any]] = {}
    hashes: dict[str, int] = {}

    def _hamming(first: int, second: int) -> int:
        return bin(first ^ second).count("1")

    for view in REQUIRED_VIEWS:
        source = images.get(view)
        if source is None:
            blockers.append({"code": "missing_view", "view": view, "message": f"Upload the {view} view."})
            continue
        try:
            image = decode_image(source)
        except ValueError as exc:
            blockers.append({"code": "invalid_image", "view": view, "message": f"{view.title()}: {exc}"})
            continue

        prepared[view] = image
        # Compute normalized pixel hash for exact duplicate detection
        normalized = image.resize((64, 64)).convert("RGB")
        pixel_bytes = normalized.tobytes()
        sha256_hash = hashlib.sha256(pixel_bytes).hexdigest()
        metrics[view] = {
            "width": image.width, 
            "height": image.height, 
            "laplacian_variance": float(cv2.Laplacian(np.asarray(image.convert("L")), cv2.CV_64F).var()),
            "sha256_normalized_pixels": sha256_hash
        }
        hashes[view] = _dhash(image)

        width, height = image.size
        if min(width, height) < MIN_IMAGE_SIDE:
            blockers.append({"code": "low_resolution", "view": view, "message": f"{view.title()} image is {width}×{height}; use a clearer photo."})
        blur_score = metrics[view]["laplacian_variance"]
        if blur_score < MIN_LAPLACIAN_VARIANCE:
            blockers.append({"code": "possibly_blurry", "view": view, "message": f"{view.title()} image may be too blurry (sharpness {blur_score})."})

    available_views = list(prepared)
    for index, first in enumerate(available_views):
        for second in available_views[index + 1:]:
            distance = _hamming_distance(hashes[first], hashes[second])
            same_pixels = metrics[first].get("sha256_normalized_pixels") == metrics[second].get("sha256_normalized_pixels")
            if same_pixels:
                blockers.append({"code": "exact_duplicate", "view": f"{first},{second}", "message": f"The {first} and {second} photos are pixel-identical. Upload distinct photos."})
            elif distance <= NEAR_DUPLICATE_DISTANCE:
                warnings.append({"code": "possible_near_duplicate", "view": f"{first},{second}", "message": f"The {first} and {second} photos look very similar."})

    return {
        "valid_for_inference": len(blockers) == 0 and len(prepared) == len(REQUIRED_VIEWS),
        "required_views": list(REQUIRED_VIEWS),
        "received_views": sorted(prepared),
        "blockers": blockers,
        "warnings": warnings,
        "metrics": metrics,
        "images": prepared,
        "viewpoint_verification": "not_available: view labels are supplied by the uploader",
        "vehicle_identity_verification": "not_available: same-vehicle identity is not independently verified",
    }

# ─── OpenAI Vision API ──────────────────────────────────────────────────────
async def call_openai_vision(
    prompt: str,
    images: Dict[str, Image.Image],
    detail: str = "high",
    per_image_detail: Optional[Dict[str, str]] = None,
) -> dict[str, Any]:
    """
    Call OpenAI vision model with the given prompt and images dict.

    Args:
        prompt: The assessment prompt text.
        images: Ordered dict of {label: PIL.Image}.
        detail: Default detail level for all images ("high" or "low").
        per_image_detail: Optional dict of {label: "high"|"low"} to override
                          detail per image. Useful for sending video frames at
                          "low" and static photos at "high" in one request.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    url = "https://api.openai.com/v1/chat/completions"

    content: list[dict] = [{"type": "text", "text": prompt}]
    for label, img in images.items():
        img_detail = (per_image_detail or {}).get(label, detail)
        # Resize to max 1024px on longest side at "high" detail — saves tokens
        # while preserving enough resolution for damage identification
        if img_detail == "high":
            max_side = 1024
            w, h = img.size
            if max(w, h) > max_side:
                scale = max_side / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=85)
        b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": img_detail},
        })

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENAI_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert automotive damage assessor for insurance claims. Return only valid JSON.",
                    },
                    {"role": "user", "content": content},
                ],
                "temperature": 0.1,
                "max_tokens": 8192,
                "response_format": {"type": "json_object"},
            },
        )

        if response.status_code != 200:
            error_body = response.text
            # Surface specific OpenAI error codes for better diagnostics
            try:
                err_json = response.json()
                err_code = err_json.get("error", {}).get("code", "")
                err_msg = err_json.get("error", {}).get("message", error_body)
                if err_code == "context_length_exceeded":
                    raise ValueError(
                        f"Request too large for {OPENAI_MODEL}. "
                        "Try reducing image count or switching to detail='low'."
                    )
                if err_code in ("invalid_api_key", "authentication_failed"):
                    raise ValueError(f"OpenAI authentication failed: {err_msg}")
                if err_code == "model_not_found":
                    raise ValueError(f"Model '{OPENAI_MODEL}' not available for this API key: {err_msg}")
                raise ValueError(f"OpenAI API error {response.status_code}: {err_msg}")
            except (KeyError, TypeError, ValueError) as inner:
                raise ValueError(f"OpenAI API error {response.status_code}: {error_body[:300]}") from inner

        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]

        # Validate that the response is parseable JSON before returning
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"OpenAI returned non-JSON output. First 200 chars: {raw_text[:200]}"
            ) from exc

# ─── Video Frame Extraction ─────────────────────────────────────────────────
async def extract_video_frames(video_bytes: bytes, filename: str, target_frames: int = 10) -> List[Image.Image]:
    import tempfile
    import cv2
    
    ext = Path(filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name
    
    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        
        if duration < MIN_VIDEO_DURATION:
            raise ValueError(f"Video too short: {duration:.1f}s (minimum 8 seconds)")
        if duration > MAX_VIDEO_DURATION:
            raise ValueError(f"Video too long: {duration:.1f}s (maximum 10 seconds)")
        
        if total_frames <= VIDEO_FRAME_TARGET:
            frame_indices = list(range(total_frames))
        else:
            frame_indices = np.linspace(0, total_frames - 1, VIDEO_FRAME_TARGET, dtype=int).tolist()
        
        frames = []
        for idx, frame_idx in enumerate(frame_indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                continue
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            frames.append(pil_image)
        
        cap.release()
        return frames
    finally:
        cap.release()
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

# ─── OpenAI Vision Assessment ───────────────────────────────────────────────
def _build_assessment_prompt(vehicle_info: dict, view_labels: list[str], video_frame_count: int = 0) -> str:
    """Build the evidence-grounded, deduplication-aware assessment prompt."""
    make = vehicle_info.get("make") or "Unknown make"
    model = vehicle_info.get("model") or "Unknown model"
    year = vehicle_info.get("year") or ""
    cause = vehicle_info.get("causeOfDamage") or "Not specified"
    vehicle_str = f"{make} {model}" + (f" ({year})" if year else "")

    # Separate static views from video frames for clearer prompt context
    static_views = [v for v in view_labels if not v.startswith("video_frame_")]
    frame_views = [v for v in view_labels if v.startswith("video_frame_")]
    views_str = ", ".join(static_views) if static_views else ", ".join(view_labels)

    video_section = ""
    if frame_views or video_frame_count > 0:
        n_frames = len(frame_views) or video_frame_count
        video_section = f"""
VIDEO FRAMES: {n_frames} uniformly-sampled frames from an 8-10 second walkaround video (labelled video_frame_1 through video_frame_{n_frames}).
IMPORTANT for video frames:
- Consecutive frames showing the same damage region are evidence of the SAME physical damage, not separate damages.
- Only create a new damage item if a frame shows a DIFFERENT part of the vehicle that has not yet been captured.
- Use video frames to corroborate or clarify damage found in the static photos.
- Do NOT count each frame as a separate damage occurrence."""

    return f"""You are a licensed automotive damage assessor conducting a visual inspection for a motor insurance claim.
Carefully inspect each submitted vehicle photograph for visible physical damage.

VEHICLE: {vehicle_str}
REPORTED CAUSE OF DAMAGE: {cause}
IMAGES PROVIDED: {views_str} (each image is a separate photograph of the vehicle)
{video_section}

═══ EVIDENCE GROUNDING INSTRUCTIONS ═══

1. VISUAL EVIDENCE IDENTIFICATION:
- Inspect the surfaces and components visible in each image: bumpers, fenders, panels, lamps, tyres, glass, grilles, and trim.
- Identify all visible scratches, scuffs, rub marks, paint transfer, dents, cracks, fractures, tears, displacements, or loose panels.
- Clearly classify damage by physical component (e.g., Front Bumper, Left Front Fender, Right Front Headlamp, Bumper Joint).
- If scuffing or scratches are present on a bumper or adjacent body panel, accurately record them with specific descriptions.
- If a bumper appears displaced, loose, or misaligned near its joint with a body panel, record it as damageType "displacement" with status "suspected" or "confirmed".

2. AVOID FALSE POSITIVES & FABRICATIONS:
- Do NOT report glass shatter unless a window, windshield, or lamp lens is visibly broken in the photos.
- Do NOT report tyre flat or puncture unless a tyre is visibly deflated or shredded in the photos.
- Do NOT invent damage on unseen sides of the vehicle or assume hidden internal/structural damage.
- Distinguish reflections, road dirt, shadows, and water marks from genuine damage.

3. COMPONENT DEDUPLICATION ACROSS VIEWS & FRAMES:
- If the same physical damage (such as the same bumper scratch or scuff) is visible across multiple photo views or video frames, report it as ONE item in damageItems.
- List all view names where it appears in `evidenceViews` and summarize the deduplication in `duplicatesResolved`.
- Do NOT multiply or duplicate damage items simply because an area appears in multiple photographs.

4. SEVERITY & REPAIR RECOMMENDATIONS:
- minor: surface scuffs, clearcoat or paint scratches, light rub marks (recommend: paint blend / refinish).
- moderate: deeper scratches through primer/metal, noticeable dents, bumper joint clips/alignment (recommend: dent repair, realignment, refinish).
- severe: structural deformation, broken/cracked components, torn plastic requiring replacement (recommend: replace).
- Keep damage type and severity separate.

5. EVIDENCE-BASED COST ESTIMATION (INR ₹):
- Provide realistic, itemized cost estimates in INR (₹) for each identified item based on standard Indian regional workshop rates:
  * Minor paint scuff/scratch repair & blend: ₹1,500 – ₹4,000 per panel
  * Bumper realignment / refit / clip repair: ₹1,000 – ₹3,000
  * Dent removal / PDR / panel repair: ₹2,500 – ₹6,000
  * Component replacement (only if severely broken): itemize part + labour costs
- List explicit cost assumptions (e.g. "paint refinish without replacement", "clip repair").
- If no damage is visible across any submitted image, return an empty damageItems array and set assessmentStatus to "inconclusive".

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON matching this schema:
{{
  "assessmentStatus": "completed|inconclusive|insufficient_evidence",
  "executionMode": "openai_vision",
  "vehicleInfo": {{
    "make": "{make}",
    "model": "{model}",
    "year": "{year}",
    "causeOfDamage": "{cause}"
  }},
  "damageItems": [
    {{
      "itemId": "D001",
      "component": "Front Bumper",
      "damageType": "scratch|scuff|dent|crack|displacement|lamp_broken|glass_shatter|tire_flat|other",
      "status": "confirmed|suspected|uncertain",
      "severity": "minor|moderate|severe|uncertain",
      "evidenceViews": ["top", "left"],
      "evidenceDescription": "Visible linear scratches and dark scuff marks along the front bumper edge",
      "confidence": 0.88,
      "recommendation": "repair|replace|inspect|no_action_needed",
      "repairNotes": "Surface refinishing and paint blend; bumper removal not required",
      "costEstimateMin": 2000,
      "costEstimateMax": 4500,
      "costCurrency": "INR",
      "costAssumptions": ["Paint blend repair", "Local labour rate ₹500/hr", "No panel replacement needed"]
    }}
  ],
  "duplicatesResolved": [
    {{
      "description": "Same front bumper scuff and scratch marks observed across multiple views — counted once",
      "views": ["top", "left"]
    }}
  ],
  "overallSeverity": "minor|moderate|severe|uncertain",
  "overallConfidence": 0.85,
  "totalUniqueComponents": 1,
  "totalCostEstimateMin": 2000,
  "totalCostEstimateMax": 4500,
  "humanReviewRequired": false,
  "humanReviewReasons": [],
  "overallReasoning": "Evidence-grounded summary of visible vehicle damage and repair recommendations.",
  "limitations": [
    "Visual assessment only — hidden structural damage not assessable from photographs",
    "Cost estimates assume standard regional labour rates; physical workshop inspection recommended for final authorization"
  ]
}}"""


async def assess_images_openai(
    vehicle_info: dict,
    images: Dict[str, Image.Image],
    detail: str = "high"
) -> dict[str, Any]:
    """Call OpenAI GPT-4o-mini vision with evidence-grounded prompt. Returns parsed JSON dict."""
    view_labels = list(images.keys())
    video_frame_count = sum(1 for k in view_labels if k.startswith("video_frame_"))
    prompt = _build_assessment_prompt(vehicle_info, view_labels, video_frame_count=video_frame_count)
    return await call_openai_vision(prompt, images, detail=detail)


async def assess_video_images_openai(
    vehicle_info: dict,
    photo_images: Dict[str, Image.Image],
    frame_images: Dict[str, Image.Image],
) -> dict[str, Any]:
    """
    Token-efficient assessment for video + 4-photo mode.

    Strategy:
    - Static photos (top/bottom/left/right) → detail="high" (full resolution for precise damage reading)
    - Video frames → detail="low" (85 tokens each vs 765 for high; sufficient for damage region detection)
    - All images combined in one request with per-image detail override

    Token budget estimate for 10 frames (low) + 4 photos (high):
      10 × 85  =   850 tokens (frames)
       4 × 765 = 3,060 tokens (photos)
      Total image tokens ≈ 3,910  (well within gpt-4o-mini 128k context)
    """
    all_images: Dict[str, Image.Image] = {}
    all_images.update(frame_images)   # video_frame_1 … video_frame_N
    all_images.update(photo_images)   # top, bottom, left, right

    view_labels = list(all_images.keys())
    video_frame_count = len(frame_images)
    prompt = _build_assessment_prompt(vehicle_info, view_labels, video_frame_count=video_frame_count)

    # Build per-image detail map: frames get "low", photos get "high"
    per_image_detail = {label: "low" for label in frame_images}
    per_image_detail.update({label: "high" for label in photo_images})

    return await call_openai_vision(
        prompt,
        all_images,
        detail="high",                     # default (overridden per-image below)
        per_image_detail=per_image_detail,
    )


def _aggregate_openai_damage_items(ai_result: dict) -> tuple[int, int, str, str, str]:
    """
    Build cost estimates from OpenAI's deduplicated damageItems.
    Uses the model's own costEstimateMin/Max per item, falls back to DAMAGE_COST_MAP.
    Returns (min_cost, max_cost, severity, primary_component, summary).
    """
    items = ai_result.get("damageItems", [])
    # Filter to confirmed/suspected items only
    active_items = [
        it for it in items
        if it.get("status", "confirmed") in ("confirmed", "suspected")
    ]

    if not active_items:
        return 0, 0, "uncertain", "Unable to determine", "No visible damage identified."

    total_min = 0
    total_max = 0
    severity_rank = {"minor": 1, "moderate": 2, "severe": 3, "uncertain": 0}
    worst_severity = "uncertain"
    worst_rank = 0

    for item in active_items:
        item_min = int(item.get("costEstimateMin", 0))
        item_max = int(item.get("costEstimateMax", 0))

        # If model gave no cost, use DAMAGE_COST_MAP as fallback
        if item_min == 0 and item_max == 0:
            dtype = normalize_damage_type(item.get("damageType", "damage"))
            sev = item.get("severity", "minor")
            cost_entry = DAMAGE_COST_MAP.get(dtype, DAMAGE_COST_MAP["damage"])
            item_min, item_max = cost_entry.get(sev, cost_entry["minor"])

        total_min += item_min
        total_max += item_max

        sev = item.get("severity", "uncertain")
        if severity_rank.get(sev, 0) > worst_rank:
            worst_severity = sev
            worst_rank = severity_rank[sev]

    # Override with top-level severity if available and worse
    top_severity = ai_result.get("overallSeverity", "uncertain")
    if severity_rank.get(top_severity, 0) > worst_rank:
        worst_severity = top_severity

    # Use top-level totals from model if available (deduplication already done)
    model_min = int(ai_result.get("totalCostEstimateMin", 0))
    model_max = int(ai_result.get("totalCostEstimateMax", 0))
    if model_min > 0 and model_max > 0:
        total_min = model_min
        total_max = model_max

    # Primary component = first confirmed item or highest confidence
    primary_component = (
        active_items[0].get("component", "Vehicle Component")
        if active_items else "Vehicle Component"
    )

    unique_components = list({it.get("component", "") for it in active_items})
    summary = (
        f"{len(active_items)} damage item(s) identified: "
        + ", ".join(
            f"{it.get('component','?')} ({it.get('damageType','?')}, {it.get('severity','?')})"
            for it in active_items
        )
    )

    return total_min, total_max, worst_severity, primary_component, summary

# ─── Pydantic Models ────────────────────────────────────────────────────────
class DamageDetection(BaseModel):
    damage_type: str
    confidence: float
    bounding_box_xyxy: List[float] = []

class ViewResult(BaseModel):
    detection_count: int
    detections: List[DamageDetection]
    annotated_image_base64: Optional[str] = None

class AssessmentResponse(BaseModel):
    assessment_id: str
    created_at: str
    workflow: str
    model_name: str
    confidence_threshold: float
    image_size: int
    views: Dict[str, ViewResult]
    detection_counts_by_class: Dict[str, int]
    total_detections: int
    review_required: bool
    review_flags: List[Dict[str, str]]
    validation: Dict[str, Any]
    limitations: List[str]
    estimated_repair_cost_min: int
    estimated_repair_cost_max: int
    settlement_offer: int
    settlement_min: int
    settlement_max: int
    severity: str
    primary_component: str
    damage_summary: str

class VideoFourViewAssessmentResponse(BaseModel):
    assessment_id: str
    timestamp: str
    processing_time_ms: int
    video_processed: bool
    video_frames_extracted: int
    video_duration_seconds: float
    photos_processed: int
    video_frames: List[dict] = Field(default_factory=list)
    photos: Dict[str, dict] = Field(default_factory=dict)
    all_detections: List[dict] = Field(default_factory=list)
    total_detections: int
    severity: str
    primary_component: str
    damage_summary: str
    estimated_repair_cost_min: int
    estimated_repair_cost_max: int
    settlement_offer: int
    settlement_min: int
    settlement_max: int
    model_version: str = "gpt-4o-mini"
    cv_backend: str = "openai-gpt4o"
    limitations: List[str] = Field(default_factory=list)

class HybridAssessmentRequest(BaseModel):
    vehicle: dict
    views: Dict[str, str]  # base64 encoded images
    detections: Dict[str, List[DamageDetection]]
    confidence_threshold: float = Field(default=0.25, ge=0.1, le=0.8)
    image_size: int = Field(default=640, ge=320, le=1280)

class HybridAssessmentResponse(BaseModel):
    assessment_id: str
    created_at: str
    workflow: str
    model_name: str
    ai_provider: str
    ai_model: str
    damage_items: List[dict]
    ai_observations: List[dict]
    duplicate_warnings: List[dict]
    overall_reasoning: str
    confidence: float
    limitations: List[str]
    estimated_repair_cost_min: int
    estimated_repair_cost_max: int
    settlement_offer: int
    settlement_min: int
    settlement_max: int
    severity: str
    primary_component: str
    damage_summary: str
    review_required: bool

# ─── FastAPI App ────────────────────────────────────────────────────────────
app = FastAPI(
    title="ClaimPilot AI Backend",
    description="Vehicle damage assessment using OpenAI GPT-4o-mini vision only",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the integrated 14-frame pipeline router
app.include_router(integrated_router)

# ─── Health & Model Info ────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ClaimPilot AI Backend (OpenAI Vision Only)"}

@app.get("/ai/provider/status")
async def ai_provider_status():
    return {
        "provider": "openai",
        "openai_configured": bool(OPENAI_API_KEY),
        "openai_model": OPENAI_MODEL,
        "hybrid_available": bool(OPENAI_API_KEY),
    }

# ─── 4-View Assessment (OpenAI Vision Only) ─────────────────────────────────
@app.post("/assess/four-view", response_model=AssessmentResponse)
async def assess_four_view(
    top: UploadFile = File(...),
    bottom: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    confidence_threshold: float = Form(default=0.25),
    image_size: int = Form(default=640),
    vehicle_make: str = Form(default=""),
    vehicle_model: str = Form(default=""),
    vehicle_year: str = Form(default=""),
    cause_of_damage: str = Form(default=""),
):
    """Assess vehicle damage from four required views using OpenAI GPT-4o-mini vision only."""
    # Read and validate files
    uploaded_files = {"top": top, "bottom": bottom, "left": left, "right": right}
    image_bytes = {}

    for view, upload_file in uploaded_files.items():
        if not upload_file.filename:
            raise HTTPException(status_code=400, detail=f"{view}: No file provided")
        ext = upload_file.filename.split(".")[-1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"{view}: Unsupported format. Use JPG, PNG, WebP.")
        content = await upload_file.read()
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{view}: File too large (max 15MB)")
        image_bytes[view] = content

    # Validate four views
    validation = validate_four_views(image_bytes)
    report = {k: v for k, v in validation.items() if k != "images"}

    if not validation["valid_for_inference"]:
        return JSONResponse(status_code=400, content={
            "error": "Validation failed", "validation": report,
            "message": "Please fix validation issues and re-upload."
        })

    # Prepare images for OpenAI
    images = validation["images"]
    
    # Run OpenAI vision assessment
    try:
        vehicle_info = {
            "make": vehicle_make,
            "model": vehicle_model,
            "year": vehicle_year,
            "variant": "",
            "causeOfDamage": cause_of_damage,
        }
        ai_result = await assess_images_openai(vehicle_info, images)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OpenAI assessment failed: {type(exc).__name__}: {exc}")

    # Use evidence-grounded aggregation (deduplication done inside OpenAI prompt)
    min_cost, max_cost, severity, primary_component, summary = _aggregate_openai_damage_items(ai_result)

    settlement_offer = int((min_cost + max_cost) / 2 * 0.7) if min_cost > 0 else 0
    settlement_min = int(min_cost * 0.55) if min_cost > 0 else 0
    settlement_max = int(max_cost * 0.85) if max_cost > 0 else 0

    review_required = (
        ai_result.get("humanReviewRequired", False)
        or ai_result.get("overallConfidence", 1.0) < 0.5
        or ai_result.get("assessmentStatus") == "inconclusive"
    )

    # Build per-view detection map from damage items (each item lists its evidence views)
    detections_by_view_response: Dict[str, list] = {}
    for item in ai_result.get("damageItems", []):
        if item.get("status", "confirmed") not in ("confirmed", "suspected"):
            continue
        for view in item.get("evidenceViews", [item.get("view", "top")]):
            if view not in REQUIRED_VIEWS:
                continue
            detections_by_view_response.setdefault(view, []).append({
                "damage_type": normalize_damage_type(item.get("damageType", "damage")),
                "confidence": float(item.get("confidence", 0.5)),
            })

    # Ensure all required views are present (even if empty)
    for view in REQUIRED_VIEWS:
        if view not in detections_by_view_response:
            detections_by_view_response[view] = []

    total_unique_items = len([
        it for it in ai_result.get("damageItems", [])
        if it.get("status", "confirmed") in ("confirmed", "suspected")
    ])

    return AssessmentResponse(
        assessment_id=f"ASM-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        created_at=datetime.now(timezone.utc).isoformat(),
        workflow="openai_vision",
        model_name=f"OpenAI {OPENAI_MODEL}",
        confidence_threshold=0.25,
        image_size=640,
        views={
            view: ViewResult(
                detection_count=len(dets),
                detections=[DamageDetection(**d) for d in dets],
                annotated_image_base64=None,
            )
            for view, dets in detections_by_view_response.items()
        },
        detection_counts_by_class={
            normalize_damage_type(it.get("damageType", "damage")): 1
            for it in ai_result.get("damageItems", [])
            if it.get("status") in ("confirmed", "suspected")
        },
        total_detections=total_unique_items,
        review_required=review_required,
        review_flags=[
            {"code": r, "view": "all", "message": r}
            for r in ai_result.get("humanReviewReasons", [])
        ],
        validation=report,
        limitations=ai_result.get("limitations", []),
        estimated_repair_cost_min=min_cost,
        estimated_repair_cost_max=max_cost,
        settlement_offer=settlement_offer,
        settlement_min=settlement_min,
        settlement_max=settlement_max,
        severity=severity,
        primary_component=primary_component,
        damage_summary=summary,
    )

# ─── Hybrid AI Assessment (OpenAI Vision Only) ───────────────────────────────
@app.post("/assess/hybrid", response_model=HybridAssessmentResponse)
async def assess_hybrid(request: HybridAssessmentRequest):
    """Hybrid AI assessment using OpenAI GPT-4o-mini vision only."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    
    # Validate images
    views_images = {}
    for view in REQUIRED_VIEWS:
        b64 = request.views.get(view)
        if not b64:
            raise HTTPException(status_code=400, detail=f"Missing {view} view image")
        try:
            img_data = base64.b64decode(b64)
            img = decode_image(img_data)
            views_images[view] = img
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid {view} image: {e}")

    # Run OpenAI vision assessment
    try:
        ai_result = await assess_images_openai(request.vehicle, views_images)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI assessment failed: {type(e).__name__}: {e}")

    # Use evidence-grounded aggregation (deduplication in prompt)
    min_cost, max_cost, severity, primary_component, summary = _aggregate_openai_damage_items(ai_result)
    
    settlement_offer = int((min_cost + max_cost) / 2 * 0.7) if min_cost > 0 else 0
    settlement_min = int(min_cost * 0.55) if min_cost > 0 else 0
    settlement_max = int(max_cost * 0.85) if max_cost > 0 else 0
    
    review_required = (
        ai_result.get("humanReviewRequired", False)
        or ai_result.get("overallConfidence", 1.0) < 0.5
        or ai_result.get("assessmentStatus") == "inconclusive"
    )
    
    return HybridAssessmentResponse(
        assessment_id=f"HASM-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        created_at=datetime.now(timezone.utc).isoformat(),
        workflow="openai_vision",
        model_name=f"OpenAI {OPENAI_MODEL}",
        ai_provider="openai",
        ai_model=OPENAI_MODEL,
        damage_items=ai_result.get("damageItems", []),
        ai_observations=ai_result.get("duplicatesResolved", []),
        duplicate_warnings=ai_result.get("duplicatesResolved", []),
        overall_reasoning=ai_result.get("overallReasoning", ""),
        confidence=float(ai_result.get("overallConfidence", 0.5)),
        limitations=ai_result.get("limitations", []),
        estimated_repair_cost_min=min_cost,
        estimated_repair_cost_max=max_cost,
        settlement_offer=settlement_offer,
        settlement_min=settlement_min,
        settlement_max=settlement_max,
        severity=severity,
        primary_component=primary_component,
        damage_summary=summary,
        review_required=review_required,
    )

# ─── Video + Four-View Assessment (OpenAI Vision Only) ───────────────────────
@app.post("/assess/video-four-view", response_model=VideoFourViewAssessmentResponse)
async def assess_video_four_view(
    video: UploadFile = File(..., description="Video walkaround (8-10 seconds)"),
    top: UploadFile = File(..., description="Top view photo"),
    bottom: UploadFile = File(..., description="Bottom view photo"),
    left: UploadFile = File(..., description="Left side photo"),
    right: UploadFile = File(..., description="Right side photo"),
    confidence_threshold: float = Form(default=0.25),
    image_size: int = Form(default=640),
    vehicle_make: str = Form(default=""),
    vehicle_model: str = Form(default=""),
    vehicle_year: str = Form(default=""),
    cause_of_damage: str = Form(default=""),
    use_yolo: bool = Form(default=False, description="Also run YOLO detection and merge with Vision results"),
):
    """
    Video + Four-View Damage Assessment using OpenAI GPT-4o-mini vision only.
    
    Process:
    1. Validate video (8-10s) and 4 photos
    2. Extract 10 frames from video
    3. Run OpenAI GPT-4o-mini on all 14 images (10 video frames + 4 photos)
    4. Aggregate and return assessment
    """
    import time
    start_time = time.time()
    assessment_id = f"VF4V-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    # Validate video
    if not video.filename:
        raise HTTPException(status_code=400, detail="Video: No file provided")
    if video.content_type not in SUPPORTED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Video: Unsupported format. Use MP4, MOV, AVI, or WebM.")
    
    video_content = await video.read()
    if len(video_content) > MAX_VIDEO_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Video too large (max {MAX_VIDEO_SIZE_MB}MB)")
    if len(video_content) < 1000:
        raise HTTPException(status_code=400, detail="Video file too small or empty")
    
    # Validate photos
    photo_files = {"top": top, "bottom": bottom, "left": left, "right": right}
    photo_contents = {}
    for view, upload_file in photo_files.items():
        if not upload_file.filename:
            raise HTTPException(status_code=400, detail=f"{view}: No file provided")
        ext = upload_file.filename.split(".")[-1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"{view}: Unsupported format. Use JPG, PNG, or WebP.")
        content = await upload_file.read()
        if len(content) > MAX_PHOTO_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{view}: File too large (max {MAX_PHOTO_SIZE_MB}MB)")
        photo_contents[view] = content
    
    # Initialize components
    try:
        video_processor = create_video_processor(max_frames=VIDEO_FRAME_TARGET)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Initialization failed: {type(exc).__name__}: {exc}")
    
    # Process video: extract frames
    video_frames = []
    video_detections = []
    video_processed = False
    video_duration = 0.0
    video_warnings = []
    
    try:
        extraction_result = video_processor.extract_frames(
            video_content, video.filename, strategy="uniform", target_frames=VIDEO_FRAME_TARGET
        )
        video_duration = extraction_result.duration_seconds
        video_processed = True
        video_warnings = extraction_result.warnings
        
        # Convert frames to PIL images for OpenAI
        video_frames_images = [frame.image for frame in extraction_result.extracted_frames]
        
    except Exception as e:
        video_warnings = [f"Video processing failed: {str(e)}"]
        video_frames_images = []
    
    # Process photos
    photo_images = {}
    photo_results = {}
    photo_detections = []
    
    for view, content in photo_contents.items():
        try:
            image = decode_image(content)
            # We'll send to OpenAI with video frames
            photo_images[view] = image
        except Exception as e:
            photo_results[view] = {"detection_count": 0, "detections": [], "error": str(e)}
            continue

    # Build separate frame and photo dicts for token-efficient mixed-detail assessment
    frame_images_dict: Dict[str, Image.Image] = {}
    for idx, frame_img in enumerate(video_frames_images):
        frame_images_dict[f"video_frame_{idx + 1}"] = frame_img

    if not frame_images_dict and not photo_images:
        raise HTTPException(status_code=400, detail="No valid images to process")

    # Run token-efficient OpenAI assessment:
    # video frames → detail="low" (85 tokens each), photos → detail="high" (full detail)
    try:
        vehicle_info = {
            "make": vehicle_make,
            "model": vehicle_model,
            "year": vehicle_year,
            "variant": "",
            "causeOfDamage": cause_of_damage,
        }
        ai_result = await assess_video_images_openai(
            vehicle_info,
            photo_images=photo_images,
            frame_images=frame_images_dict,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI assessment failed: {type(e).__name__}: {e}")
    
    # Process results
    all_detections = []
    for item in ai_result.get("damageItems", []):
        all_detections.append({
            "damage_type": item["damageType"],
            "confidence": item.get("confidence", 0.5),
            "severity": item.get("severity", "minor"),
            "source": "openai",
            "source_index": 0,
        })
    
    # Optionally run YOLO detection and merge results
    yolo_detections = []
    if use_yolo:
        try:
            from integrated_pipeline.detector import Detector
            detector = Detector(MODEL_PATH, device=DEVICE)
            
            # Process video frames with YOLO
            for idx, frame_img in enumerate(video_frames_images):
                frame_np = np.array(frame_img.convert('RGB'))
                detections = detector.detect(frame_np, confidence_threshold=confidence_threshold)
                for det in detections:
                    yolo_detections.append({
                        "damage_type": det.class_name,
                        "confidence": det.confidence,
                        "severity": "uncertain",  # YOLO doesn't assess severity
                        "source": "yolo",
                        "source_index": idx,
                    })
            
            # Process photos with YOLO
            for view, photo_img in photo_images.items():
                photo_np = np.array(photo_img.convert('RGB'))
                detections = detector.detect(photo_np, confidence_threshold=confidence_threshold)
                for det in detections:
                    yolo_detections.append({
                        "damage_type": det.class_name,
                        "confidence": det.confidence,
                        "severity": "uncertain",
                        "source": "yolo",
                        "source_index": -1,  # Photo, not video frame
                    })
        except Exception as e:
            logger.warning(f"YOLO detection failed, using Vision only: {e}")
    
    # Merge YOLO + Vision detections
    # Vision detections have higher confidence (AI judgment), YOLO adds secondary confirmations
    merged_detections = all_detections.copy()
    
    # Add YOLO detections that don't already exist in Vision
    vision_types = {d["damage_type"] for d in all_detections}
    for yolo_det in yolo_detections:
        if yolo_det["damage_type"] not in vision_types:
            # Only add if confidence is reasonably high
            if yolo_det["confidence"] >= confidence_threshold:
                merged_detections.append({
                    **yolo_det,
                    "confidence": max(0.4, yolo_det["confidence"]),  # Reduce confidence since it's secondary
                })
    
    # Use merged detections for final aggregation
    all_detections = merged_detections
    
    # Estimate costs using evidence-grounded aggregation
    min_cost, max_cost, severity, primary_component, summary = _aggregate_openai_damage_items(ai_result)
    settlement_offer = int((min_cost + max_cost) / 2 * 0.7) if min_cost > 0 else 0
    
    # Build response
    processing_time = int((time.time() - start_time) * 1000)
    
    # Build video_frames structure with actual detections grouped by frame
    video_frames_result = []
    for i in range(len(video_frames_images)):
        frame_detections = [d for d in all_detections if d.get("source_index") == i]
        video_frames_result.append({
            "frame_index": i,
            "timestamp_ms": int((i / max(len(video_frames_images), 1)) * (video_duration * 1000)) if video_processed else 0,
            "detections": [
                {
                    "damage_type": d.get("damage_type", "damage"),
                    "confidence": d.get("confidence", 0.5),
                    "bounding_box_xyxy": []
                }
                for d in frame_detections
            ],
            "detections_count": len(frame_detections),
        })
    
    # Build photos structure with actual detections
    photos_result = {}
    for view_idx, view in enumerate(REQUIRED_VIEWS):
        photo_detections = [d for d in all_detections if d.get("source_index") == -1 and view_idx == REQUIRED_VIEWS.index(view)]
        photos_result[view] = {
            "photo_index": view_idx,
            "filename": f"{view}.jpg",
            "detections": [
                {
                    "damage_type": d.get("damage_type", "damage"),
                    "confidence": d.get("confidence", 0.5),
                    "bounding_box_xyxy": []
                }
                for d in photo_detections
            ],
            "detections_count": len(photo_detections),
            "annotated_image_base64": None,
        }
    
    return VideoFourViewAssessmentResponse(
        assessment_id=assessment_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        processing_time_ms=processing_time,
        video_processed=video_processed,
        video_frames_extracted=len(video_frames_images),
        video_duration_seconds=video_duration if video_processed else 0.0,
        photos_processed=len(photo_images),
        video_frames=video_frames_result,
        photos=photos_result,
        all_detections=[
            {
                "damage_type": normalize_damage_type(it.get("damageType", "damage")),
                "confidence": it.get("confidence", 0.5),
                "severity": it.get("severity", "minor"),
                "source": "openai",
                "component": it.get("component", ""),
                "status": it.get("status", "confirmed"),
            }
            for it in ai_result.get("damageItems", [])
            if it.get("status", "confirmed") in ("confirmed", "suspected")
        ],
        total_detections=len([
            it for it in ai_result.get("damageItems", [])
            if it.get("status", "confirmed") in ("confirmed", "suspected")
        ]),
        severity=severity,
        primary_component=primary_component,
        damage_summary=summary,
        estimated_repair_cost_min=min_cost,
        estimated_repair_cost_max=max_cost,
        settlement_offer=settlement_offer,
        settlement_min=int(min_cost * 0.55) if min_cost > 0 else 0,
        settlement_max=int(max_cost * 0.85) if max_cost > 0 else 0,
        limitations=ai_result.get("limitations", [
            "Visual assessment only — hidden structural damage not assessable from photographs",
            "Same physical damage may appear in multiple views and frames — deduplicated by AI",
            "Cost estimates assume standard regional labour rates; actual costs may vary",
            "This output is an evidence summary only and does not authorize an insurance settlement",
        ]),
    )


# ─── Integrated 14-Frame Majority Voting Pipeline ─────────────────────────────
class IntegratedFrameDetection(BaseModel):
    damage_type: str
    confidence: float
    bbox: List[float] = []
    bbox_pixels: List[int] = []


class IntegratedFrameResult(BaseModel):
    frame_id: int
    source: str
    detections: List[IntegratedFrameDetection]
    detection_count: int
    severity_level: str
    severity_score: float
    damage_types: List[str]


class IntegratedAssessmentResponse(BaseModel):
    assessment_id: str
    timestamp: str
    processing_time_ms: int
    images_processed: int
    video_frames_processed: int
    total_frames: int
    majority_damage_type: str
    majority_count: int
    majority_percentage: float
    damage_type_votes: Dict[str, int]
    damage_type_total_detections: Dict[str, int]
    overall_severity_level: str
    avg_severity_score: float
    severity_distribution: Dict[str, int]
    per_frame_results: List[IntegratedFrameResult]
    model_version: str = "ultralytics-yolov8-integrated-v1"
    cv_backend: str = "ultralytics-yolo"
    label_mapping_applied: Dict[str, str] = {"lamp_broken": "scratch"}
    limitations: List[str] = Field(default_factory=lambda: [
        "Visual assessment only — hidden structural damage not assessable from photographs",
        "Majority voting across 14 frames (4 images + 10 video frames)",
        "Label mapping: lamp_broken → scratch for insurance classification",
        "Cost estimates assume standard regional labour rates; physical inspection recommended"
    ])


@app.post("/assess/integrated-fourteen-frame", response_model=IntegratedAssessmentResponse)
async def assess_integrated_fourteen_frame(
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
    14-Frame Majority Voting Damage Assessment (Integrated Pipeline)
    
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
    import tempfile
    start_time = time.time()
    assessment_id = f"INT14-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Validate images
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

    # Get integrated detector
    try:
        detector = IntegratedCarDamageDetector(model_path=MODEL_PATH, confidence=confidence_threshold)
    except Exception as e:
        logger.error(f"[{assessment_id}] Detector initialization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Model loading failed: {type(e).__name__}: {e}")

    # Save files temporarily for processing
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
            max_images=4,
            max_video_frames=10,
        )

        # Build per-frame response
        per_frame_response = []
        all_frames = list(image_results)
        for vr in video_results:
            all_frames.extend(vr.frame_results)
        
        for fr in all_frames:
            detections_response = [
                IntegratedFrameDetection(
                    damage_type=det.class_name,
                    confidence=det.confidence,
                    bbox=list(det.bbox),
                    bbox_pixels=list(det.bbox_px),
                )
                for det in fr.detections
            ]
            per_frame_response.append(IntegratedFrameResult(
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


# ─── Direct OpenAI 4-View Assessment (primary frontend path, no YOLO gate) ──
class DirectAssessmentResponse(BaseModel):
    """Rich structured response for the direct OpenAI assessment path."""
    assessment_id: str
    created_at: str
    execution_mode: str               # "openai_vision" | "openai_vision_with_yolo_support" | "assessment_failed"
    model_name: str
    vehicle_make: str
    vehicle_model: str
    vehicle_year: str
    cause_of_damage: str
    assessment_status: str            # "completed" | "inconclusive" | "insufficient_evidence"
    damage_items: List[dict]          # OpenAI's deduplicated, evidence-grounded list
    duplicates_resolved: List[dict]
    overall_severity: str
    overall_confidence: float
    total_unique_components: int
    estimated_repair_cost_min: int
    estimated_repair_cost_max: int
    settlement_offer: int
    settlement_min: int
    settlement_max: int
    human_review_required: bool
    human_review_reasons: List[str]
    overall_reasoning: str
    primary_component: str
    damage_summary: str
    limitations: List[str]
    review_flags: List[dict]
    validation_warnings: List[dict]


@app.post("/assess/direct", response_model=DirectAssessmentResponse)
async def assess_direct(
    top: UploadFile = File(...),
    bottom: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    vehicle_make: str = Form(default=""),
    vehicle_model: str = Form(default=""),
    vehicle_year: str = Form(default=""),
    cause_of_damage: str = Form(default=""),
):
    """
    Primary assessment endpoint. Goes straight to OpenAI vision — no local YOLO required.
    Returns a structured, evidence-grounded, deduplicated damage assessment.
    Frontend should call this first. YOLO bounding-box annotations are additive/optional.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "openai_not_configured",
                "message": "OpenAI API key is not set. Configure OPENAI_API_KEY in backend/.env.",
                "execution_mode": "assessment_failed",
            }
        )

    # Read files
    uploaded_files = {"top": top, "bottom": bottom, "left": left, "right": right}
    image_bytes: Dict[str, bytes] = {}
    for view, uf in uploaded_files.items():
        if not uf.filename:
            raise HTTPException(status_code=400, detail=f"{view}: No file provided")
        ext = (uf.filename.split(".")[-1] or "").lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"{view}: Unsupported format. Use JPG, PNG, WebP.")
        content = await uf.read()
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{view}: File too large (max 15MB)")
        image_bytes[view] = content

    # Validate (soft — warnings don't block, only blockers do)
    validation = validate_four_views(image_bytes)
    if not validation["valid_for_inference"]:
        return JSONResponse(status_code=400, content={
            "error": "validation_failed",
            "validation": {k: v for k, v in validation.items() if k != "images"},
            "message": "Please fix validation issues and re-upload.",
        })

    images = validation["images"]
    validation_warnings = validation.get("warnings", [])

    vehicle_info = {
        "make": vehicle_make,
        "model": vehicle_model,
        "year": vehicle_year,
        "variant": "",
        "causeOfDamage": cause_of_damage,
    }

    # OpenAI assessment
    try:
        ai_result = await assess_images_openai(vehicle_info, images)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "openai_assessment_failed",
                "error_type": type(exc).__name__,
                "message": str(exc),
                "execution_mode": "assessment_failed",
            }
        )

    # Aggregate costs from deduplicated items
    min_cost, max_cost, severity, primary_component, summary = _aggregate_openai_damage_items(ai_result)
    settlement_offer = int((min_cost + max_cost) / 2 * 0.7) if min_cost > 0 else 0
    settlement_min = int(min_cost * 0.55) if min_cost > 0 else 0
    settlement_max = int(max_cost * 0.85) if max_cost > 0 else 0

    human_review_required = (
        ai_result.get("humanReviewRequired", False)
        or ai_result.get("overallConfidence", 1.0) < 0.5
        or ai_result.get("assessmentStatus") in ("inconclusive", "insufficient_evidence")
    )

    active_items = [
        it for it in ai_result.get("damageItems", [])
        if it.get("status", "confirmed") in ("confirmed", "suspected")
    ]

    return DirectAssessmentResponse(
        assessment_id=f"DIR-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        created_at=datetime.now(timezone.utc).isoformat(),
        execution_mode="openai_vision",
        model_name=f"OpenAI {OPENAI_MODEL}",
        vehicle_make=vehicle_make,
        vehicle_model=vehicle_model,
        vehicle_year=vehicle_year,
        cause_of_damage=cause_of_damage,
        assessment_status=ai_result.get("assessmentStatus", "completed"),
        damage_items=active_items,
        duplicates_resolved=ai_result.get("duplicatesResolved", []),
        overall_severity=severity,
        overall_confidence=float(ai_result.get("overallConfidence", 0.5)),
        total_unique_components=len(active_items),
        estimated_repair_cost_min=min_cost,
        estimated_repair_cost_max=max_cost,
        settlement_offer=settlement_offer,
        settlement_min=settlement_min,
        settlement_max=settlement_max,
        human_review_required=human_review_required,
        human_review_reasons=ai_result.get("humanReviewReasons", []),
        overall_reasoning=ai_result.get("overallReasoning", ""),
        primary_component=primary_component,
        damage_summary=summary,
        limitations=ai_result.get("limitations", []),
        review_flags=[
            {"code": r, "view": "all", "message": r}
            for r in ai_result.get("humanReviewReasons", [])
        ],
        validation_warnings=validation_warnings,
    )


# ─── Damage Report Generation ─────────────────────────────────────────────────
class ReportBreakdownItem(BaseModel):
    category: str
    description: str
    amount: float
    type: str  # "addition" | "deduction"


class ReportRequest(BaseModel):
    claim_reference: str
    vehicle_company: str = ""
    vehicle_model: str = ""
    vehicle_year: str = ""
    vehicle_variant: str = ""
    cause_of_damage: str = ""
    component: str = ""
    damage_type: str = ""
    severity: str = "minor"
    repair_approach: str = ""
    explanation: str = ""
    cost_min: int = 0
    cost_max: int = 0
    settlement_offer: int = 0
    settlement_min: int = 0
    settlement_max: int = 0
    final_settlement_amount: int = 0
    gross_repair_min: int = 0
    gross_repair_max: int = 0
    depreciation_amount: int = 0
    depreciation_percentage: int = 0
    depreciation_reason: str = ""
    deductible_amount: int = 1000
    net_settlement: int = 0
    breakdown_items: List[ReportBreakdownItem] = Field(default_factory=list)
    exclusions: List[dict] = Field(default_factory=list)
    chat_history: List[dict] = Field(default_factory=list)
    assessment_views: dict = Field(default_factory=dict)
    damage_items: List[dict] = Field(default_factory=list)


class ReportResponse(BaseModel):
    report: str
    report_html: str
    generated_at: str
    claim_reference: str


@app.post("/report", response_model=ReportResponse)
async def generate_report(req: ReportRequest):
    """
    Generate a final damage assessment report using OpenAI.
    Uses the server-side API key — no frontend key needed.
    Falls back to a structured local template if OpenAI is unavailable.
    """
    from datetime import datetime as _dt
    now = _dt.now()
    formatted_date = now.strftime("%d %B %Y, %I:%M %p")

    gross_avg = (req.gross_repair_min + req.gross_repair_max) / 2 if req.gross_repair_min else (req.cost_min + req.cost_max) / 2

    # Build negotiation history text
    history_lines = []
    for i, msg in enumerate(req.chat_history[-20:], 1):
        sender = "Claimant" if msg.get("sender") == "user" else "Adjuster (AI)"
        text = str(msg.get("text", ""))[:200]
        history_lines.append(f"{i}. {sender}: {text}")
    history_text = "\n".join(history_lines) if history_lines else "No negotiation — settlement accepted at initial offer."

    # Build views text
    views_lines = []
    for view, data in req.assessment_views.items():
        dets = data.get("detections", [])
        det_str = ", ".join(f"{d.get('damage_type','?')} ({int(d.get('confidence',0)*100)}%)" for d in dets) if dets else "No damage detected"
        views_lines.append(f"  {view.upper()}: {data.get('detection_count', 0)} detection(s) — {det_str}")
    views_text = "\n".join(views_lines) if views_lines else "  Four-view photo analysis completed."

    # Build exclusions text
    excl_lines = [f"  - {e.get('description','?')}: -₹{e.get('amount',0):,}" for e in req.exclusions]
    excl_text = "\n".join(excl_lines) if excl_lines else "  None"

    # Build damage items text
    items_lines = [
        f"  {i+1}. {it.get('component','?')} — {it.get('damageType','?')} ({it.get('severity','?')}, {it.get('status','confirmed')})"
        for i, it in enumerate(req.damage_items)
    ]
    items_text = "\n".join(items_lines) if items_lines else "  See damage assessment section."

    # Try OpenAI first
    if OPENAI_API_KEY:
        prompt = f"""You are a professional motor insurance claims specialist. Generate a formal, comprehensive damage assessment report in Markdown.

CLAIM DATA:
- Reference: {req.claim_reference}
- Date: {formatted_date}
- Vehicle: {req.vehicle_company} {req.vehicle_model} {req.vehicle_year}
- Cause of Damage: {req.cause_of_damage}
- Damaged Component: {req.component}
- Damage Type: {req.damage_type} ({req.severity} severity)
- Assessment Method: {req.repair_approach}
- AI Explanation: {req.explanation}

COSTS:
- Estimated Repair: ₹{req.cost_min:,} – ₹{req.cost_max:,}
- Gross Repair (avg): ₹{int(gross_avg):,}
- Depreciation: -₹{req.depreciation_amount:,} ({req.depreciation_percentage}% — {req.depreciation_reason})
- Deductible: -₹{req.deductible_amount:,}
- Net Settlement: ₹{req.net_settlement:,}
- FINAL AGREED: ₹{req.final_settlement_amount:,}

DAMAGE ITEMS (deduplicated by OpenAI vision):
{items_text}

INSPECTION VIEWS:
{views_text}

EXCLUSIONS:
{excl_text}

NEGOTIATION HISTORY (last 20 messages):
{history_text}

Generate a complete professional report with these sections:
1. Claim Header (reference, date, status)
2. Incident Summary
3. Vehicle Specifications  
4. Damage Assessment (component, type, severity, evidence)
5. AI Inspection Details (views, detections)
6. Repair Cost Estimation (parts, labour, paint breakdown)
7. Settlement Calculation (gross → deductions → net)
8. Negotiation History
9. Terms & Conditions
10. Acknowledgment & Signatures

Use Markdown tables for numerical data. Format all amounts in INR (₹). Keep a formal, professional tone throughout."""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": OPENAI_MODEL,
                        "messages": [
                            {"role": "system", "content": "You are a professional insurance claims report writer. Generate complete, well-formatted Markdown reports only."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.2,
                        "max_tokens": 4096,
                    },
                )
            if resp.status_code == 200:
                report_md = resp.json()["choices"][0]["message"]["content"].strip()
                report_html = _md_to_html(report_md)
                return ReportResponse(
                    report=report_md,
                    report_html=report_html,
                    generated_at=now.isoformat(),
                    claim_reference=req.claim_reference,
                )
        except Exception as e:
            print(f"OpenAI report generation failed, using local template: {e}")

    # Local template fallback
    report_md = _build_local_report(req, formatted_date, gross_avg, history_text, views_text, excl_lines, items_text)
    return ReportResponse(
        report=report_md,
        report_html=_md_to_html(report_md),
        generated_at=now.isoformat(),
        claim_reference=req.claim_reference,
    )


def _md_to_html(md: str) -> str:
    """Convert Markdown to basic HTML for report display."""
    import re as _re
    html = md
    html = _re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=_re.MULTILINE)
    html = _re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=_re.MULTILINE)
    html = _re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=_re.MULTILINE)
    html = _re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
    html = _re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
    html = _re.sub(r'`(.+?)`', r'<code>\1</code>', html)
    # Tables
    def _table_row(m):
        cells = [c.strip() for c in m.group(0).strip('|').split('|')]
        if all(_re.match(r'^[-:]+$', c) for c in cells):
            return ''
        return '<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>\n'
    html = _re.sub(r'^\|.+\|$', _table_row, html, flags=_re.MULTILINE)
    html = _re.sub(r'(<tr>.*?</tr>\n)+', lambda m: f'<table class="report-table">{m.group(0)}</table>\n', html, flags=_re.DOTALL)
    html = _re.sub(r'^---+$', '<hr>', html, flags=_re.MULTILINE)
    # Paragraphs
    html = _re.sub(r'\n{2,}', '</p><p>', html)
    html = html.replace('\n', '<br>')
    html = f'<p>{html}</p>'
    # Clean up tags that got wrapped in <p>
    for tag in ['h1', 'h2', 'h3', 'hr', 'table']:
        html = _re.sub(rf'<p>(<{tag})', r'\1', html)
        html = _re.sub(rf'(</{tag}>)</p>', r'\1', html)
        html = _re.sub(rf'<p>(<{tag}[^>]*>)', r'\1', html)
    return html


def _build_local_report(req: "ReportRequest", formatted_date: str, gross_avg: float,
                         history_text: str, views_text: str,
                         excl_lines: list, items_text: str) -> str:
    """Deterministic local Markdown report — no API call needed."""
    r = f"""# CLAIMPILOT AI — MOTOR DAMAGE ASSESSMENT REPORT

**Claim Reference:** {req.claim_reference}
**Report Generated:** {formatted_date}
**Status:** FINAL — Settlement Agreed

---

## 1. CLAIM HEADER

| Field | Details |
|---|---|
| Claim Reference | {req.claim_reference} |
| Report Date | {formatted_date} |
| Assessment Type | {req.repair_approach or 'OpenAI GPT-4o Vision'} |
| Status | Final — Settlement Confirmed |

## 2. INCIDENT SUMMARY

**Cause of Damage:** {req.cause_of_damage or 'Not specified'}
**Date of Loss:** {formatted_date.split(',')[0]}

## 3. VEHICLE SPECIFICATIONS

| Specification | Details |
|---|---|
| Make | {req.vehicle_company or '—'} |
| Model | {req.vehicle_model or '—'} |
| Year | {req.vehicle_year or 'Not specified'} |
| Variant | {req.vehicle_variant or 'Not specified'} |
| Registration No. | [To be provided] |
| VIN / Chassis | [To be provided] |

## 4. DAMAGE ASSESSMENT

| Parameter | Details |
|---|---|
| Primary Component | {req.component} |
| Damage Type | {req.damage_type} |
| Severity | {req.severity.upper()} |
| Assessment Method | {req.repair_approach or 'OpenAI Vision'} |

**AI Findings:** {req.explanation or 'See damage items below.'}

### Damage Items (deduplicated)

{items_text}

## 5. AI INSPECTION DETAILS

{views_text}

## 6. REPAIR COST ESTIMATION

| Cost Component | Minimum (₹) | Maximum (₹) |
|---|---|---|
| Parts & Materials | ₹{int(gross_avg * 0.45):,} | ₹{int(req.gross_repair_max * 0.45):,} |
| Labour | ₹{int(gross_avg * 0.35):,} | ₹{int(req.gross_repair_max * 0.35):,} |
| Paint & Refinishing | ₹{int(gross_avg * 0.15):,} | ₹{int(req.gross_repair_max * 0.15):,} |
| Miscellaneous | ₹{int(gross_avg * 0.05):,} | ₹{int(req.gross_repair_max * 0.05):,} |
| **TOTAL** | **₹{req.cost_min:,}** | **₹{req.cost_max:,}** |

## 7. SETTLEMENT CALCULATION

| Item | Amount (₹) |
|---|---|
| Gross Repair Estimate (avg) | +₹{int(gross_avg):,} |
| Depreciation ({req.depreciation_percentage}% — {req.depreciation_reason}) | -₹{req.depreciation_amount:,} |
| Policy Deductible | -₹{req.deductible_amount:,} |
{''.join(f'| Exclusion: {e.get("description","?")} | -₹{e.get("amount",0):,} |' + chr(10) for e in req.exclusions)}| **NET CASH SETTLEMENT** | **₹{req.net_settlement:,}** |

**FINAL AGREED AMOUNT: ₹{req.final_settlement_amount:,}**

## 8. NEGOTIATION HISTORY

{history_text}

## 9. TERMS & CONDITIONS

1. **Cash Settlement:** This is a full and final cash buyout. The claimant waives all future claims arising from this incident.
2. **Policy Terms Apply:** Subject to all terms, conditions, and exclusions of the insurance contract.
3. **No Admission of Liability:** Settlement does not constitute an admission of liability by the insurer.
4. **Validity:** This offer is valid for 30 days from report date.

## 10. ACKNOWLEDGMENT

I confirm I have read this report and agree to the settlement of **₹{req.final_settlement_amount:,}**.

_________________________
Claimant Signature / Digital Acceptance
Date: ___________________

_________________________
ClaimPilot AI — Automated Adjuster
Date: {formatted_date.split(',')[0]}

---
*Generated by ClaimPilot AI — {req.claim_reference} — {formatted_date}*
"""
    return r.strip()


# ─── Settlement Negotiation Endpoint ─────────────────────────────────────────
class NegotiationMessage(BaseModel):
    sender: str   # "user" | "bot"
    text: str


class NegotiateRequest(BaseModel):
    vehicle_company: str = ""
    vehicle_model: str = ""
    vehicle_year: str = ""
    cause_of_damage: str = ""
    damage_summary: str = ""
    severity: str = "minor"
    primary_component: str = ""
    cost_min: int = 0
    cost_max: int = 0
    settlement_offer: int = 0
    settlement_min: int = 0
    settlement_max: int = 0
    user_message: str = ""
    chat_history: List[NegotiationMessage] = Field(default_factory=list)
    damage_items: List[dict] = Field(default_factory=list)
    overall_reasoning: str = ""


class NegotiateResponse(BaseModel):
    message: str
    new_offer: Optional[int] = None
    is_offer: bool = False
    recommendation: Optional[str] = None
    exclusion_detected: bool = False
    exclusion_reason: str = ""
    provider_used: str = "openai"


@app.post("/negotiate", response_model=NegotiateResponse)
async def negotiate(req: NegotiateRequest):
    """
    Settlement negotiation endpoint.
    Uses the backend OpenAI API key — no frontend key management needed.
    Accepts the current negotiation state and returns the AI adjuster's next response.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured on backend")

    # Build damage items context
    damage_detail = ""
    if req.damage_items:
        lines = [
            f"  {i+1}. {it.get('component','?')} — {it.get('damageType','?')} ({it.get('severity','?')}, {it.get('status','confirmed')})"
            + (f", recommended: {it['recommendation']}" if it.get('recommendation') else "")
            + (f", est. ₹{it.get('costEstimateMin',0):,}–₹{it.get('costEstimateMax',0):,}" if it.get('costEstimateMin', 0) > 0 else "")
            for i, it in enumerate(req.damage_items)
        ]
        damage_detail = (
            f"\n\nDetailed Damage Findings ({len(req.damage_items)} unique component(s), assessed by OpenAI vision):\n"
            + "\n".join(lines)
        )

    reasoning_note = (
        f"\n\nAI Assessor Reasoning: {req.overall_reasoning[:300]}" if req.overall_reasoning else ""
    )

    # Exclusion detection
    exclusionary_keywords = [
        ("wear", "Wear and tear"), ("tear", "Wear and tear"),
        ("rust", "Rust/corrosion"), ("corrosion", "Rust/corrosion"),
        ("mechanical failure", "Mechanical failure"),
        ("electrical fault", "Electrical fault"),
        ("intentional", "Intentional damage"),
        ("racing", "Racing/competition"),
        ("drunk", "DUI/impairment"), ("dui", "DUI/impairment"),
        ("flood", "Flood damage"), ("fire", "Fire damage"),
    ]
    cause_lower = req.cause_of_damage.lower()
    exclusions_found = [label for kw, label in exclusionary_keywords if kw in cause_lower]
    exclusion_detected = len(exclusions_found) > 0

    system_prompt = f"""You are ClaimPilot AI, a professional motor insurance settlement adjuster.
You are negotiating a cash settlement with a claimant for vehicle damage.

VEHICLE: {req.vehicle_company} {req.vehicle_model}{f' ({req.vehicle_year})' if req.vehicle_year else ''}
REPORTED CAUSE: {req.cause_of_damage or 'Not specified'}
ASSESSED DAMAGE: {req.damage_summary} (Severity: {req.severity}, Primary: {req.primary_component}){damage_detail}{reasoning_note}

ESTIMATED GARAGE REPAIR COST: ₹{req.cost_min:,} – ₹{req.cost_max:,}
PERMITTED SETTLEMENT RANGE: ₹{req.settlement_min:,} – ₹{req.settlement_max:,}
CURRENT OFFER: ₹{req.settlement_offer:,}

NEGOTIATION RULES:
1. Be polite, transparent, and empathetic. Keep replies to 2-3 sentences maximum.
2. If the customer requests a specific amount ≤ ₹{req.settlement_max:,}: accept or counter with a value close to it.
3. If they request more than ₹{req.settlement_max:,}: politely explain that ₹{req.settlement_max:,} is the maximum authorized payout and offer that.
4. If they say "more", "higher", or "increase": increment by ₹500–₹1,000 capped at ₹{req.settlement_max:,}.
5. If they ask why the offer is lower than repair cost: explain depreciation (vehicle age), standard deductible (₹1,000), and insurer-negotiated labour rates vs retail.
6. If they accept or agree: confirm clearly and tell them to click "Confirm Settlement".
7. Reference specific damaged components by name — never be vague.
8. If cause of damage suggests a policy exclusion ({', '.join(exclusions_found) if exclusions_found else 'none detected'}): recommend escalation to a human adjuster.
9. When making a counter-offer, always include the exact rupee amount as "₹X,XXX" so it can be parsed.

RESPOND ONLY AS THE SETTLEMENT ADJUSTER. Do not break character."""

    # Build message history for OpenAI
    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    for msg in req.chat_history[-10:]:   # last 10 messages for context
        role = "user" if msg.sender == "user" else "assistant"
        messages.append({"role": role, "content": msg.text})
    messages.append({"role": "user", "content": req.user_message or "Hello, can you explain the settlement offer?"})

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": OPENAI_MODEL,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": 300,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OpenAI negotiation failed: {resp.status_code}")

    reply_text = resp.json()["choices"][0]["message"]["content"].strip()

    # Extract offer amount from reply (e.g. "₹4,500" or "₹4500")
    import re
    offer_matches = re.findall(r'₹\s?([\d,]+)', reply_text)
    new_offer: Optional[int] = None
    for m in offer_matches:
        val = int(m.replace(",", ""))
        if req.settlement_min <= val <= req.settlement_max:
            new_offer = val
            break

    return NegotiateResponse(
        message=reply_text,
        new_offer=new_offer,
        is_offer=new_offer is not None,
        recommendation="escalate" if exclusion_detected else None,
        exclusion_detected=exclusion_detected,
        exclusion_reason=", ".join(exclusions_found),
        provider_used="openai",
    )


# ─── Provider Status (duplicate removed — defined earlier) ─────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)