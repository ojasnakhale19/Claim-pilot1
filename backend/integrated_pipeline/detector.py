"""
Car Damage Detection & Severity Assessment Engine
==================================================
Core inference logic for Ultralytics YOLOv5/v8 models.
Includes damage detection, severity scoring, and result aggregation.
"""

import cv2
import numpy as np
import pandas as pd
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import json
import time
from ultralytics import YOLO
from tqdm import tqdm

from .config import (
    MODEL_PATH, CONFIDENCE_THRESHOLD, IOU_THRESHOLD, DEVICE,
    CLASS_NAMES, CLASS_CONF_THRESHOLDS, SEVERITY_CONFIG,
    CLASS_COLORS, SEVERITY_COLORS, FONT_SCALE, FONT_THICKNESS, BOX_THICKNESS,
    LABEL_MAPPING, EFFECTIVE_CLASS_NAMES
)


@dataclass
class Detection:
    """Single object detection result."""
    class_name: str
    class_id: int
    confidence: float
    bbox: Tuple[float, float, float, float]  # x1, y1, x2, y2 (normalized 0-1)
    bbox_px: Tuple[int, int, int, int]       # x1, y1, x2, y2 (pixels)
    
    def to_dict(self) -> Dict:
        return {
            "class_name": self.class_name,
            "class_id": self.class_id,
            "confidence": round(self.confidence, 4),
            "bbox_normalized": [round(x, 4) for x in self.bbox],
            "bbox_pixels": list(self.bbox_px),
        }


@dataclass
class FrameResult:
    """Detection results for a single frame/image."""
    frame_id: int
    source_path: str
    frame_shape: Tuple[int, int]  # height, width
    detections: List[Detection] = field(default_factory=list)
    inference_time_ms: float = 0.0
    severity_score: float = 0.0
    severity_level: str = "None"
    damage_counts: Dict[str, int] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "frame_id": self.frame_id,
            "source_path": self.source_path,
            "frame_shape": list(self.frame_shape),
            "detections": [d.to_dict() for d in self.detections],
            "inference_time_ms": round(self.inference_time_ms, 2),
            "severity_score": round(self.severity_score, 4),
            "severity_level": self.severity_level,
            "damage_counts": self.damage_counts,
        }


@dataclass
class AggregatedResult:
    """Final aggregated result across all 14 frames (4 images + 10 video frames)."""
    total_frames: int
    total_detections: int
    frames_with_detections: int
    majority_damage_type: str
    majority_count: int
    damage_type_votes: Dict[str, int]  # How many frames each damage type appeared in
    damage_type_total_detections: Dict[str, int]  # Total detection count per type
    overall_severity_level: str
    avg_severity_score: float
    severity_distribution: Dict[str, int]  # Count of frames per severity level
    per_frame_results: List[Dict]  # Summary of each frame
    
    def to_dict(self) -> Dict:
        return {
            "total_frames": self.total_frames,
            "total_detections": self.total_detections,
            "frames_with_detections": self.frames_with_detections,
            "majority_damage_type": self.majority_damage_type,
            "majority_count": self.majority_count,
            "damage_type_votes": self.damage_type_votes,
            "damage_type_total_detections": self.damage_type_total_detections,
            "overall_severity_level": self.overall_severity_level,
            "avg_severity_score": round(self.avg_severity_score, 4),
            "severity_distribution": self.severity_distribution,
            "per_frame_results": self.per_frame_results,
        }
    
    def get_summary_string(self) -> str:
        """Get human-readable summary."""
        lines = [
            "=" * 60,
            "  FINAL AGGREGATED RESULT (14 Frames)",
            "=" * 60,
            f"  Total Frames Analyzed:     {self.total_frames}",
            f"  Total Detections:          {self.total_detections}",
            f"  Frames with Detections:    {self.frames_with_detections}",
            f"  Overall Severity:          {self.overall_severity_level} ({self.avg_severity_score:.3f})",
            "",
            "  MAJORITY VOTING:",
            f"    Winning Damage Type:     {self.majority_damage_type}",
            f"    Frames with this Damage: {self.majority_count} / {self.total_frames}",
            "",
            "  DAMAGE TYPE VOTES (frames detected):",
        ]
        for dmg, votes in sorted(self.damage_type_votes.items(), key=lambda x: -x[1]):
            pct = (votes / self.total_frames * 100) if self.total_frames > 0 else 0
            lines.append(f"    {dmg:20s}: {votes:2d} frames ({pct:5.1f}%)")
        
        lines.extend([
            "",
            "  SEVERITY DISTRIBUTION:",
        ])
        for level in ["Critical", "High", "Medium", "Low", "None"]:
            count = self.severity_distribution.get(level, 0)
            if count > 0:
                pct = (count / self.total_frames * 100) if self.total_frames > 0 else 0
                lines.append(f"    {level:10s}: {count:2d} frames ({pct:5.1f}%)")
        
        lines.append("=" * 60)
        return "\n".join(lines)


@dataclass
class VideoResult:
    """Aggregated results for video processing."""
    video_path: str
    total_frames: int
    processed_frames: int
    frame_results: List[FrameResult] = field(default_factory=list)
    avg_severity_score: float = 0.0
    overall_severity_level: str = "None"
    damage_detection_summary: Dict[str, Dict] = field(default_factory=dict)
    total_processing_time_ms: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            "video_path": self.video_path,
            "total_frames": self.total_frames,
            "processed_frames": self.processed_frames,
            "frame_results": [f.to_dict() for f in self.frame_results],
            "avg_severity_score": round(self.avg_severity_score, 4),
            "overall_severity_level": self.overall_severity_level,
            "damage_detection_summary": self.damage_detection_summary,
            "total_processing_time_ms": round(self.total_processing_time_ms, 2),
        }


class SeverityAssessor:
    """Assesses damage severity based on detections."""
    
    def __init__(self, config: Dict = None):
        self.config = config or SEVERITY_CONFIG
    
    def calculate_severity(self, detections: List[Detection]) -> Tuple[float, str, Dict[str, int]]:
        """
        Calculate severity score based on detections.
        Returns: (severity_score, severity_level, damage_counts)
        """
        if not detections:
            return 0.0, "None", {}
        
        # Count detections per damage type
        damage_counts = defaultdict(int)
        damage_confidences = defaultdict(list)
        
        for det in detections:
            damage_counts[det.class_name] += 1
            damage_confidences[det.class_name].append(det.confidence)
        
        # Calculate weighted severity score
        total_score = 0.0
        total_weight = 0.0
        
        for damage_name, count in damage_counts.items():
            weight = self.config["damage_severity_weights"].get(damage_name, 0.5)
            
            # Use max confidence for this damage type (most confident detection)
            max_conf = max(damage_confidences[damage_name])
            
            # Confidence-based severity
            conf_thresholds = self.config["confidence_thresholds"]
            if max_conf >= conf_thresholds["critical"]:
                conf_score = 1.0
            elif max_conf >= conf_thresholds["high"]:
                conf_score = 0.75
            elif max_conf >= conf_thresholds["medium"]:
                conf_score = 0.5
            else:
                conf_score = 0.25
            
            # Multiple detection multiplier (same damage type)
            multi_mult = self.config["multi_detection_multiplier"] ** (count - 1) if count > 1 else 1.0
            
            part_score = weight * conf_score * multi_mult
            total_score += part_score
            total_weight += weight
        
        # Cross-damage multiplier (multiple different damage types)
        num_damage_types = len(damage_counts)
        if num_damage_types > 1:
            total_score *= self.config["multi_type_multiplier"] ** (num_damage_types - 1)
            total_weight *= self.config["multi_type_multiplier"] ** (num_damage_types - 1)
        
        # Normalize by total possible weight
        severity_score = min(total_score / max(total_weight, 1.0), 1.0)
        
        # Determine severity level
        severity_level = self._get_severity_level(severity_score)
        
        return severity_score, severity_level, dict(damage_counts)
    
    def _get_severity_level(self, score: float) -> str:
        """Map severity score to level."""
        levels = self.config["severity_levels"]
        for level, threshold in sorted(levels.items(), key=lambda x: x[1], reverse=True):
            if score >= threshold:
                return level
        return "None"


class CarDamageDetector:
    """Main detector class for car damage detection and severity assessment."""
    
    def __init__(
        self,
        model_path: Path = MODEL_PATH,
        confidence: float = CONFIDENCE_THRESHOLD,
        iou: float = IOU_THRESHOLD,
        device: str = DEVICE,
        class_names: List[str] = CLASS_NAMES,
        class_conf_thresholds: Dict[str, float] = CLASS_CONF_THRESHOLDS,
    ):
        self.model_path = Path(model_path)
        self.confidence = confidence
        self.iou = iou
        self.device = device
        self.class_names = class_names
        self.class_conf_thresholds = class_conf_thresholds
        
        self.model = None
        self.severity_assessor = SeverityAssessor()
        self._load_model()
    
    def _resolve_device(self, device: str) -> str:
        """Resolve device string to valid torch device."""
        if device == "auto":
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return "mps"
            return "cpu"
        return device
    
    def _load_model(self):
        """Load the YOLO model."""
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}")
        
        self.resolved_device = self._resolve_device(self.device)
        print(f"Loading model from {self.model_path} on {self.resolved_device}...")
        self.model = YOLO(str(self.model_path))
        self.model.to(self.resolved_device)
        print(f"Model loaded successfully. Classes: {self.model.names}")
    
    def _get_effective_confidence(self, class_name: str) -> float:
        """Get confidence threshold for a specific class (uses original model class name)."""
        return self.class_conf_thresholds.get(class_name, self.confidence)
    
    def _normalize_model_class_name(self, model_class_name: str) -> str:
        """Convert model's class name (with spaces) to our config format (with underscores)."""
        mapping = {
            "glass shatter": "glass_shatter",
            "lamp broken": "lamp_broken",
            "tire flat": "tire_flat",
        }
        return mapping.get(model_class_name, model_class_name)
    
    def _apply_label_mapping(self, class_name: str) -> str:
        """Apply label mapping to convert model classes to effective classes."""
        return LABEL_MAPPING.get(class_name, class_name)
    
    def _filter_detections(self, results) -> List[Detection]:
        """Filter and convert YOLO results to Detection objects with label mapping."""
        detections = []
        
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                original_class_name = self.model.names[class_id]
                
                # Normalize model class name (spaces -> underscores) for config lookup
                normalized_class_name = self._normalize_model_class_name(original_class_name)
                
                # Apply class-specific confidence threshold (uses normalized class name)
                eff_conf = self._get_effective_confidence(normalized_class_name)
                if confidence < eff_conf:
                    continue
                
                # Apply label mapping for output (uses normalized class name)
                mapped_class_name = self._apply_label_mapping(normalized_class_name)
                
                # Get bounding box (normalized xywh -> xyxy)
                x1, y1, x2, y2 = box.xyxyn[0].tolist()
                h, w = result.orig_shape[:2]
                bbox_px = (int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h))
                
                detections.append(Detection(
                    class_name=mapped_class_name,
                    class_id=class_id,
                    confidence=confidence,
                    bbox=(x1, y1, x2, y2),
                    bbox_px=bbox_px,
                ))
        
        return detections
    
    def detect_image(self, image_path: Path, frame_id: int = 0) -> FrameResult:
        """Run detection on a single image."""
        start_time = time.perf_counter()
        
        # Read image
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        h, w = image.shape[:2]
        
        # Run inference
        results = self.model.predict(
            source=str(image_path),
            conf=self.confidence,
            iou=self.iou,
            device=self.resolved_device,
            verbose=False,
        )
        
        inference_time = (time.perf_counter() - start_time) * 1000
        
        # Process detections
        detections = self._filter_detections(results)
        
        # Assess severity
        severity_score, severity_level, damage_counts = self.severity_assessor.calculate_severity(detections)
        
        return FrameResult(
            frame_id=frame_id,
            source_path=str(image_path),
            frame_shape=(h, w),
            detections=detections,
            inference_time_ms=inference_time,
            severity_score=severity_score,
            severity_level=severity_level,
            damage_counts=damage_counts,
        )
    
    def detect_video(
        self,
        video_path: Path,
        max_frames: int = 14,
        frame_skip: int = 1,
    ) -> VideoResult:
        """Run detection on video, processing up to max_frames."""
        start_time = time.perf_counter()
        
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        frame_results = []
        frame_idx = 0
        processed = 0
        
        print(f"Processing video: {video_path.name} ({total_frames} frames, {fps:.1f} FPS)")
        
        with tqdm(total=min(max_frames, total_frames // frame_skip + 1), desc="Processing frames") as pbar:
            while cap.isOpened() and processed < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                
                if frame_idx % frame_skip == 0:
                    # Run inference on frame
                    frame_start = time.perf_counter()
                    
                    results = self.model.predict(
                        source=frame,
                        conf=self.confidence,
                        iou=self.iou,
                        device=self.resolved_device,
                        verbose=False,
                    )
                    
                    inference_time = (time.perf_counter() - frame_start) * 1000
                    
                    # Process detections
                    detections = self._filter_detections(results)
                    
                    # Assess severity
                    severity_score, severity_level, damage_counts = self.severity_assessor.calculate_severity(detections)
                    
                    frame_results.append(FrameResult(
                        frame_id=processed,
                        source_path=f"{video_path.name}_frame_{frame_idx}",
                        frame_shape=(height, width),
                        detections=detections,
                        inference_time_ms=inference_time,
                        severity_score=severity_score,
                        severity_level=severity_level,
                        damage_counts=damage_counts,
                    ))
                    
                    processed += 1
                    pbar.update(1)
                
                frame_idx += 1
        
        cap.release()
        
        total_time = (time.perf_counter() - start_time) * 1000
        
        # Aggregate video-level results
        if frame_results:
            avg_severity = np.mean([f.severity_score for f in frame_results])
            overall_severity = self.severity_assessor._get_severity_level(avg_severity)
            
            # Damage detection summary
            damage_summary = defaultdict(lambda: {"count": 0, "frames_detected": 0, "max_confidence": 0.0})
            for fr in frame_results:
                for det in fr.detections:
                    damage_summary[det.class_name]["count"] += 1
                    damage_summary[det.class_name]["frames_detected"] += 1
                    damage_summary[det.class_name]["max_confidence"] = max(
                        damage_summary[det.class_name]["max_confidence"],
                        det.confidence
                    )
        else:
            avg_severity = 0.0
            overall_severity = "None"
            damage_summary = {}
        
        return VideoResult(
            video_path=str(video_path),
            total_frames=total_frames,
            processed_frames=processed,
            frame_results=frame_results,
            avg_severity_score=avg_severity,
            overall_severity_level=overall_severity,
            damage_detection_summary=dict(damage_summary),
            total_processing_time_ms=total_time,
        )
    
    def process_batch(
        self,
        image_paths: List[Path],
        video_paths: List[Path],
        max_images: int = 4,
        max_video_frames: int = 14,
    ) -> Tuple[List[FrameResult], List[VideoResult], AggregatedResult]:
        """Process a batch of images and videos, returning aggregated majority result."""
        image_results = []
        video_results = []
        
        # Process images
        for i, img_path in enumerate(image_paths[:max_images]):
            print(f"\nProcessing image {i+1}/{min(len(image_paths), max_images)}: {img_path.name}")
            try:
                result = self.detect_image(img_path, frame_id=i)
                image_results.append(result)
                print(f"  Detections: {len(result.detections)}, Severity: {result.severity_level} ({result.severity_score:.3f})")
            except Exception as e:
                print(f"  Error processing {img_path}: {e}")
        
        # Process videos
        for i, vid_path in enumerate(video_paths):
            print(f"\nProcessing video {i+1}/{len(video_paths)}: {vid_path.name}")
            try:
                result = self.detect_video(vid_path, max_frames=max_video_frames)
                video_results.append(result)
                print(f"  Processed frames: {result.processed_frames}, Overall Severity: {result.overall_severity_level} ({result.avg_severity_score:.3f})")
            except Exception as e:
                print(f"  Error processing {vid_path}: {e}")
        
        # Aggregate results across all frames
        aggregated = self.aggregate_results(image_results, video_results)
        
        return image_results, video_results, aggregated
    
    def aggregate_results(
        self,
        image_results: List[FrameResult],
        video_results: List[VideoResult],
    ) -> AggregatedResult:
        """Aggregate results across all frames and compute majority voting."""
        # Combine all frame results
        all_frames = list(image_results)
        for vr in video_results:
            all_frames.extend(vr.frame_results)
        
        total_frames = len(all_frames)
        if total_frames == 0:
            return AggregatedResult(
                total_frames=0,
                total_detections=0,
                frames_with_detections=0,
                majority_damage_type="None",
                majority_count=0,
                damage_type_votes={},
                damage_type_total_detections={},
                overall_severity_level="None",
                avg_severity_score=0.0,
                severity_distribution={},
                per_frame_results=[],
            )
        
        # Collect statistics
        total_detections = 0
        frames_with_detections = 0
        damage_type_votes = defaultdict(int)  # frames where each damage type appears
        damage_type_total_detections = defaultdict(int)  # total detection count
        severity_distribution = defaultdict(int)
        per_frame_results = []
        
        for fr in all_frames:
            frame_detections = len(fr.detections)
            total_detections += frame_detections
            
            if frame_detections > 0:
                frames_with_detections += 1
            
            # Count damage types in this frame (unique types per frame for voting)
            frame_damage_types = set()
            for det in fr.detections:
                damage_type_total_detections[det.class_name] += 1
                frame_damage_types.add(det.class_name)
            
            # Vote: each frame votes for each damage type it contains
            for dmg_type in frame_damage_types:
                damage_type_votes[dmg_type] += 1
            
            # Severity distribution
            severity_distribution[fr.severity_level] += 1
            
            # Per-frame summary
            per_frame_results.append({
                "frame_id": fr.frame_id,
                "source": Path(fr.source_path).name,
                "detections": frame_detections,
                "severity_level": fr.severity_level,
                "severity_score": round(fr.severity_score, 3),
                "damage_types": list(frame_damage_types),
            })
        
        # Determine majority damage type (most frames with this damage)
        if damage_type_votes:
            majority_damage_type = max(damage_type_votes, key=damage_type_votes.get)
            majority_count = damage_type_votes[majority_damage_type]
        else:
            majority_damage_type = "None"
            majority_count = 0
        
        # Overall severity (average across all frames)
        avg_severity = np.mean([f.severity_score for f in all_frames]) if all_frames else 0.0
        overall_severity = self.severity_assessor._get_severity_level(avg_severity)
        
        return AggregatedResult(
            total_frames=total_frames,
            total_detections=total_detections,
            frames_with_detections=frames_with_detections,
            majority_damage_type=majority_damage_type,
            majority_count=majority_count,
            damage_type_votes=dict(damage_type_votes),
            damage_type_total_detections=dict(damage_type_total_detections),
            overall_severity_level=overall_severity,
            avg_severity_score=avg_severity,
            severity_distribution=dict(severity_distribution),
            per_frame_results=per_frame_results,
        )


def create_detector() -> CarDamageDetector:
    """Factory function to create detector with default config."""
    return CarDamageDetector()