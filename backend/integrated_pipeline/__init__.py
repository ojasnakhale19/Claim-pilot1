"""
Integrated Pipeline Package for ClaimPilot AI
==============================================
14-frame majority voting damage detection pipeline.
"""

from .config import (
    MODEL_PATH, CONFIDENCE_THRESHOLD, IOU_THRESHOLD, DEVICE,
    CLASS_NAMES, EFFECTIVE_CLASS_NAMES, LABEL_MAPPING,
    CLASS_CONF_THRESHOLDS, SEVERITY_CONFIG,
    CLASS_COLORS, SEVERITY_COLORS, FONT_SCALE, FONT_THICKNESS, BOX_THICKNESS,
    MAX_IMAGES, MAX_VIDEO_FRAMES, VIDEO_FRAME_SKIP,
    INPUT_DIR, IMAGE_DIR, VIDEO_DIR,
    OUTPUT_DIR, DETECTION_RESULTS_DIR, SEVERITY_REPORT_DIR, ANNOTATED_DIR, VISUALIZATION_DIR,
)

from .detector import (
    Detection, FrameResult, AggregatedResult, VideoResult,
    SeverityAssessor, CarDamageDetector, create_detector
)

from .router import router

__all__ = [
    # Config
    "MODEL_PATH", "CONFIDENCE_THRESHOLD", "IOU_THRESHOLD", "DEVICE",
    "CLASS_NAMES", "EFFECTIVE_CLASS_NAMES", "LABEL_MAPPING",
    "CLASS_CONF_THRESHOLDS", "SEVERITY_CONFIG",
    "CLASS_COLORS", "SEVERITY_COLORS", "FONT_SCALE", "FONT_THICKNESS", "BOX_THICKNESS",
    "MAX_IMAGES", "MAX_VIDEO_FRAMES", "VIDEO_FRAME_SKIP",
    "INPUT_DIR", "IMAGE_DIR", "VIDEO_DIR",
    "OUTPUT_DIR", "DETECTION_RESULTS_DIR", "SEVERITY_REPORT_DIR", "ANNOTATED_DIR", "VISUALIZATION_DIR",
    # Detector
    "Detection", "FrameResult", "AggregatedResult", "VideoResult",
    "SeverityAssessor", "CarDamageDetector", "create_detector",
    # Router
    "router",
]