"""
Configuration for Car Damage Detection & Severity Assessment
=============================================================
Integrated with ClaimPilot AI — uses CarDD class naming convention.
Model classes: dent, scratch, crack, glass_shatter, lamp_broken, tire_flat
"""

from pathlib import Path

# ============================================================
# MODEL CONFIGURATION
# ============================================================
MODEL_PATH = Path("best.pt")  # Your trained Ultralytics YOLO model
CONFIDENCE_THRESHOLD = 0.25   # Minimum confidence for detections
IOU_THRESHOLD = 0.45          # NMS IoU threshold
DEVICE = "auto"               # "auto", "cpu", "cuda", "mps"

# ============================================================
# CLASS CONFIGURATION (match CarDD trained model classes exactly)
# ============================================================
# CarDD 6 damage classes (with underscores for ClaimPilot compatibility)
CLASS_NAMES = [
    "dent",           # 0 - Body dents
    "scratch",        # 1 - Surface scratches
    "crack",          # 2 - Cracks in parts
    "glass_shatter",  # 3 - Broken glass (CarDD: glass_shatter)
    "lamp_broken",    # 4 - Broken lights (CarDD: lamp_broken)
    "tire_flat",      # 5 - Flat/damaged tires (CarDD: tire_flat)
]

# Label mapping: merge/rename model classes for final output
# "lamp_broken" -> "scratch" (merge into scratch category for insurance)
LABEL_MAPPING = {
    "lamp_broken": "scratch",
}

# Effective class names after mapping (used for display/reporting)
EFFECTIVE_CLASS_NAMES = [
    "dent",
    "scratch",        # Includes both original "scratch" + mapped "lamp_broken"
    "crack",
    "glass_shatter",
    "tire_flat",
]

# Class-specific confidence thresholds (override global if needed)
# Uses original model class names (CarDD format)
CLASS_CONF_THRESHOLDS = {
    "dent": 0.25,
    "scratch": 0.25,
    "crack": 0.30,
    "glass_shatter": 0.30,
    "lamp_broken": 0.30,
    "tire_flat": 0.25,
}

# ============================================================
# SEVERITY ASSESSMENT CONFIGURATION
# ============================================================
# Uses EFFECTIVE class names (after LABEL_MAPPING applied)
SEVERITY_CONFIG = {
    # Risk categorization of damage types (effective names)
    "critical_damage": ["glass_shatter", "tire_flat"],  # Safety-critical
    "high_damage": ["crack"],                           # Structural concern
    "medium_damage": ["dent"],                          # Cosmetic/structural
    "low_damage": ["scratch"],                          # Cosmetic only (includes lamp_broken)
    
    # Confidence-based severity multipliers
    "confidence_thresholds": {
        "critical": 0.80,
        "high": 0.60,
        "medium": 0.40,
        "low": 0.25,
    },
    
    # Damage-type severity weights (higher = more severe) - effective names
    "damage_severity_weights": {
        "glass_shatter": 1.0,
        "tire_flat": 0.9,
        "crack": 0.7,
        "dent": 0.4,
        "scratch": 0.2,
    },
    
    # Multiple detections of same damage type increase severity
    "multi_detection_multiplier": 1.15,
    
    # Cross-damage multiplier (multiple different damage types)
    "multi_type_multiplier": 1.1,
    
    # Severity level thresholds (final score 0-1)
    "severity_levels": {
        "Critical": 0.70,
        "High": 0.50,
        "Medium": 0.30,
        "Low": 0.15,
        "None": 0.0,
    }
}

# ============================================================
# INPUT/OUTPUT PATHS (relative to backend root)
# ============================================================
INPUT_DIR = Path("integrated_pipeline/input")
IMAGE_DIR = INPUT_DIR / "images"
VIDEO_DIR = INPUT_DIR / "videos"

OUTPUT_DIR = Path("integrated_pipeline/output")
DETECTION_RESULTS_DIR = OUTPUT_DIR / "detections"
SEVERITY_REPORT_DIR = OUTPUT_DIR / "severity_reports"
ANNOTATED_DIR = OUTPUT_DIR / "annotated"
VISUALIZATION_DIR = OUTPUT_DIR / "visualizations"

# ============================================================
# PROCESSING CONFIGURATION
# ============================================================
# Video processing - 10 frames for video-four-view compatibility
VIDEO_FRAME_SKIP = 1
MAX_VIDEO_FRAMES = 10       # 10 frames from video + 4 photos = 14 total

# Image processing
IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]
MAX_IMAGES = 4              # Process first 4 images

# Output options
SAVE_ANNOTATED_IMAGES = True
SAVE_ANNOTATED_VIDEO = True
SAVE_CSV_RESULTS = True
SAVE_SEVERITY_JSON = True
GENERATE_VISUALIZATIONS = True

# ============================================================
# VISUALIZATION CONFIGURATION
# ============================================================
# Colors for each EFFECTIVE damage class (BGR format for OpenCV)
CLASS_COLORS = {
    "dent": (0, 165, 255),       # Orange
    "scratch": (200, 200, 200),  # Light Gray (includes lamp_broken)
    "crack": (0, 100, 255),      # Red-Orange
    "glass_shatter": (0, 0, 255),    # Red (critical)
    "tire_flat": (0, 255, 255),      # Yellow (critical)
}

# Severity colors for visualization
SEVERITY_COLORS = {
    "Critical": (0, 0, 255),      # Red
    "High": (0, 100, 255),        # Red-Orange
    "Medium": (0, 255, 255),      # Yellow
    "Low": (0, 255, 0),           # Green
    "None": (255, 255, 255),      # White
}

# Font settings
FONT_SCALE = 0.6
FONT_THICKNESS = 2
BOX_THICKNESS = 2