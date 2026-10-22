#!/usr/bin/env python3
"""
Model Evaluation Script for Car Damage Detection
================================================
Evaluates YOLOv8 model on labeled datasets and synthetic test cases.

Usage:
    # Evaluate on YOLO-format dataset (images + labels)
    python evaluate_model.py --data-dir /path/to/dataset --split test
    
    # Run synthetic controlled evaluation
    python evaluate_model.py --synthetic --num-samples 100
    
    # Evaluate on custom images with manual annotations
    python evaluate_model.py --images-dir /path/to/images --annotations /path/to/labels.txt
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from collections import defaultdict

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))
from car_damage_detector import CarDamageDetector


# ─── Constants ──────────────────────────────────────────────────────────────
CARDD_CLASSES = [
    "crack", "crash", "dent", "dislocated_part", "glass_shatter",
    "lamp_broken", "no_part", "rub", "scratch", "tire_flat"
]

CLASS_NAME_TO_ID = {name: i for i, name in enumerate(CARDD_CLASSES)}
CLASS_ID_TO_NAME = {i: name for i, name in enumerate(CARDD_CLASSES)}

# Colors for visualization (BGR for OpenCV)
CLASS_COLORS = {
    "crack": (255, 0, 255), "crash": (0, 0, 255), "dent": (255, 165, 0),
    "dislocated_part": (128, 0, 128), "glass_shatter": (0, 255, 255),
    "lamp_broken": (255, 255, 0), "no_part": (255, 128, 0),
    "rub": (0, 128, 255), "scratch": (0, 255, 0), "tire_flat": (128, 128, 0),
}


# ─── Data Structures ────────────────────────────────────────────────────────
@dataclass
class Detection:
    """Single detection result."""
    class_id: int
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2] in pixels
    image_width: int
    image_height: int

@dataclass
class GroundTruth:
    """Single ground truth annotation."""
    class_id: int
    class_name: str
    bbox: List[float]  # [x1, y1, x2, y2] in pixels
    image_width: int
    image_height: int

@dataclass
class ImageResult:
    """Results for a single image."""
    image_path: str
    detections: List[Detection]
    ground_truths: List[GroundTruth]
    inference_time_ms: float

@dataclass
class ClassMetrics:
    """Per-class evaluation metrics."""
    class_name: str
    tp: int = 0
    fp: int = 0
    fn: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    ap: float = 0.0  # Average Precision
    num_gt: int = 0
    num_pred: int = 0

@dataclass
class OverallMetrics:
    """Overall evaluation metrics."""
    mAP50: float
    mAP50_95: float
    precision: float
    recall: float
    f1: float
    per_class: Dict[str, ClassMetrics]
    total_images: int
    total_gt: int
    total_pred: int
    avg_inference_time_ms: float


# ─── IoU Calculation ────────────────────────────────────────────────────────
def calculate_iou(box1: List[float], box2: List[float]) -> float:
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


def yolo_to_pixels(box: List[float], img_w: int, img_h: int) -> List[float]:
    """Convert YOLO format [x_center, y_center, w, h] normalized to pixel [x1, y1, x2, y2]."""
    x_c, y_c, w, h = box
    x1 = (x_c - w/2) * img_w
    y1 = (y_c - h/2) * img_h
    x2 = (x_c + w/2) * img_w
    y2 = (y_c + h/2) * img_h
    return [x1, y1, x2, y2]


def pixels_to_yolo(box: List[float], img_w: int, img_h: int) -> List[float]:
    """Convert pixel [x1, y1, x2, y2] to YOLO format [x_center, y_center, w, h] normalized."""
    x1, y1, x2, y2 = box
    x_c = (x1 + x2) / 2 / img_w
    y_c = (y1 + y2) / 2 / img_h
    w = (x2 - x1) / img_w
    h = (y2 - y1) / img_h
    return [x_c, y_c, w, h]


# ─── Dataset Loading ────────────────────────────────────────────────────────
def load_yolo_dataset(
    images_dir: Path,
    labels_dir: Path,
    split: str = "test"
) -> List[Tuple[Path, List[GroundTruth]]]:
    """Load YOLO-format dataset (images + label txt files)."""
    split_images = images_dir / split
    split_labels = labels_dir / split
    
    if not split_images.exists():
        # Try flat structure
        split_images = images_dir
        split_labels = labels_dir
    
    results = []
    img_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
    
    for img_path in split_images.iterdir():
        if img_path.suffix.lower() not in img_extensions:
            continue
        
        label_path = split_labels / (img_path.stem + '.txt')
        if not label_path.exists():
            print(f"Warning: No label file for {img_path.name}")
            continue
        
        # Load image to get dimensions
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        h, w = img.shape[:2]
        
        # Parse YOLO labels
        gts = []
        with open(label_path, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) != 5:
                    continue
                class_id = int(parts[0])
                if class_id >= len(CARDD_CLASSES):
                    continue
                box = [float(x) for x in parts[1:]]
                pixel_box = yolo_to_pixels(box, w, h)
                gts.append(GroundTruth(
                    class_id=class_id,
                    class_name=CARDD_CLASSES[class_id],
                    bbox=pixel_box,
                    image_width=w,
                    image_height=h
                ))
        
        results.append((img_path, gts))
    
    return results


# ─── Synthetic Test Generation ──────────────────────────────────────────────
def generate_synthetic_test_image(
    class_name: str,
    severity: str = "moderate",
    img_size: Tuple[int, int] = (640, 640),
    seed: int = 42
) -> Tuple[np.ndarray, GroundTruth]:
    """Generate a synthetic test image with known damage."""
    np.random.seed(seed)
    img_w, img_h = img_size
    img = np.zeros((img_h, img_w, 3), dtype=np.uint8)
    
    # Background - simple car-like shape
    cv2.rectangle(img, (int(img_w*0.2), int(img_h*0.3)), 
                  (int(img_w*0.8), int(img_h*0.7)), (80, 80, 80), -1)
    cv2.rectangle(img, (int(img_w*0.3), int(img_h*0.2)), 
                  (int(img_w*0.7), int(img_h*0.3)), (80, 80, 80), -1)
    
    # Wheels
    cv2.circle(img, (int(img_w*0.25), int(img_h*0.7)), 40, (40, 40, 40), -1)
    cv2.circle(img, (int(img_w*0.75), int(img_h*0.7)), 40, (40, 40, 40), -1)
    
    # Damage parameters based on severity
    severity_params = {
        "minor": {"size_mult": 0.5, "intensity": 150},
        "moderate": {"size_mult": 1.0, "intensity": 255},
        "severe": {"size_mult": 2.0, "intensity": 255}
    }
    params = severity_params.get(severity, severity_params["moderate"])
    
    color = CLASS_COLORS.get(class_name, (255, 255, 255))
    center_x = int(img_w * (0.3 + 0.4 * np.random.random()))
    center_y = int(img_h * (0.35 + 0.3 * np.random.random()))
    base_size = int(min(img_w, img_h) * 0.08 * params["size_mult"])
    
    gt_box = None
    
    if class_name == "scratch":
        length = int(base_size * 4)
        thickness = max(1, int(base_size * 0.15))
        angle = np.random.uniform(-30, 30)
        x1 = int(center_x - length/2 * np.cos(np.radians(angle)))
        y1 = int(center_y - length/2 * np.sin(np.radians(angle)))
        x2 = int(center_x + length/2 * np.cos(np.radians(angle)))
        y2 = int(center_y + length/2 * np.sin(np.radians(angle)))
        cv2.line(img, (x1, y1), (x2, y2), color, thickness)
        gt_box = [min(x1,x2)-thickness, min(y1,y2)-thickness, 
                  max(x1,x2)+thickness, max(y1,y2)+thickness]
    
    elif class_name == "dent":
        axes = (int(base_size * 1.5), int(base_size))
        angle = np.random.uniform(-45, 45)
        cv2.ellipse(img, (center_x, center_y), axes, angle, 0, 360, color, -1)
        gt_box = [center_x - axes[0], center_y - axes[1],
                  center_x + axes[0], center_y + axes[1]]
    
    elif class_name == "crack":
        # Spider-web crack
        for i in range(5):
            angle = np.random.uniform(0, 360)
            length = int(base_size * np.random.uniform(1.5, 3))
            x2 = int(center_x + length * np.cos(np.radians(angle)))
            y2 = int(center_y + length * np.sin(np.radians(angle)))
            cv2.line(img, (center_x, center_y), (x2, y2), color, max(1, base_size//10))
        gt_box = [center_x - base_size*2, center_y - base_size*2,
                  center_x + base_size*2, center_y + base_size*2]
    
    elif class_name == "glass_shatter":
        # Radial cracks from center point
        for i in range(8):
            angle = i * 45 + np.random.uniform(-10, 10)
            length = int(base_size * np.random.uniform(2, 3.5))
            x2 = int(center_x + length * np.cos(np.radians(angle)))
            y2 = int(center_y + length * np.sin(np.radians(angle)))
            cv2.line(img, (center_x, center_y), (x2, y2), color, max(1, base_size//8))
        gt_box = [center_x - base_size*2, center_y - base_size*2,
                  center_x + base_size*2, center_y + base_size*2]
    
    elif class_name == "tire_flat":
        # Flat tire - bottom of wheel flattened
        cv2.ellipse(img, (center_x, center_y + int(base_size*0.3)), 
                    (int(base_size*1.8), int(base_size*0.4)), 0, 0, 180, color, -1)
        gt_box = [center_x - base_size*1.8, center_y - base_size*0.5,
                  center_x + base_size*1.8, center_y + base_size*1.2]
    
    elif class_name == "lamp_broken":
        # Broken headlight - star pattern
        for i in range(6):
            angle = i * 60
            length = int(base_size * 1.5)
            x2 = int(center_x + length * np.cos(np.radians(angle)))
            y2 = int(center_y + length * np.sin(np.radians(angle)))
            cv2.line(img, (center_x, center_y), (x2, y2), color, max(2, base_size//6))
        gt_box = [center_x - base_size*1.5, center_y - base_size*1.5,
                  center_x + base_size*1.5, center_y + base_size*1.5]
    
    elif class_name == "rub":
        # Scuff mark - wide shallow
        cv2.ellipse(img, (center_x, center_y), 
                    (int(base_size*2), int(base_size*0.5)), 
                    np.random.uniform(-20, 20), 0, 360, color, -1)
        gt_box = [center_x - base_size*2, center_y - base_size*0.5,
                  center_x + base_size*2, center_y + base_size*0.5]
    
    elif class_name == "crash":
        # Large deformation area
        cv2.rectangle(img, (center_x - base_size*2, center_y - base_size),
                      (center_x + base_size*2, center_y + base_size), color, -1)
        gt_box = [center_x - base_size*2, center_y - base_size,
                  center_x + base_size*2, center_y + base_size]
    
    elif class_name == "dislocated_part":
        # Misaligned panel
        offset = int(base_size * 0.8)
        cv2.rectangle(img, (center_x - base_size, center_y - base_size//2),
                      (center_x + base_size, center_y + base_size//2), color, -1)
        cv2.rectangle(img, (center_x - base_size + offset, center_y - base_size//2 + offset),
                      (center_x + base_size + offset, center_y + base_size//2 + offset), 
                      tuple(max(0, c-50) for c in color), -1)
        gt_box = [center_x - base_size, center_y - base_size//2,
                  center_x + base_size + offset, center_y + base_size//2 + offset]
    
    elif class_name == "no_part":
        # Missing part - black hole
        cv2.rectangle(img, (center_x - base_size*2, center_y - base_size),
                      (center_x + base_size*2, center_y + base_size), (0, 0, 0), -1)
        gt_box = [center_x - base_size*2, center_y - base_size,
                  center_x + base_size*2, center_y + base_size]
    
    if gt_box is None:
        gt_box = [center_x - base_size, center_y - base_size,
                  center_x + base_size, center_y + base_size]
    
    # Clamp to image bounds
    gt_box[0] = max(0, gt_box[0])
    gt_box[1] = max(0, gt_box[1])
    gt_box[2] = min(img_w, gt_box[2])
    gt_box[3] = min(img_h, gt_box[3])
    
    gt = GroundTruth(
        class_id=CLASS_NAME_TO_ID[class_name],
        class_name=class_name,
        bbox=gt_box,
        image_width=img_w,
        image_height=img_h
    )
    
    return img, gt


# ─── Evaluation Core ────────────────────────────────────────────────────────
class ModelEvaluator:
    """Evaluates YOLO model on damage detection."""
    
    def __init__(self, model_path: str, conf_threshold: float = 0.25, iou_threshold: float = 0.5):
        self.detector = CarDamageDetector(model_path=model_path, confidence_threshold=conf_threshold)
        self.iou_threshold = iou_threshold
        self.conf_threshold = conf_threshold
    
    def run_inference(self, image: np.ndarray) -> List[Detection]:
        """Run model inference on image."""
        start = time.time()
        result = self.detector.detect_damage(image)
        inference_time = (time.time() - start) * 1000
        
        detections = []
        raw_dets = result.get('damages', result.get('detections', []))
        h, w = image.shape[:2]
        
        for det in raw_dets:
            class_name = det.get('type', det.get('damage_type', 'unknown'))
            if class_name not in CLASS_NAME_TO_ID:
                continue
            detections.append(Detection(
                class_id=CLASS_NAME_TO_ID[class_name],
                class_name=class_name,
                confidence=det.get('confidence', 0.5),
                bbox=det.get('bbox', [0, 0, 0, 0]),
                image_width=w,
                image_height=h
            ))
        return detections, inference_time
    
    def evaluate_image(self, image_path: Path, ground_truths: List[GroundTruth]) -> ImageResult:
        """Evaluate model on a single image with ground truth."""
        img = cv2.imread(str(image_path))
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        detections, inf_time = self.run_inference(img)
        
        return ImageResult(
            image_path=str(image_path),
            detections=detections,
            ground_truths=ground_truths,
            inference_time_ms=inf_time
        )
    
    def evaluate_synthetic(self, num_per_class: int = 10, severities: List[str] = None) -> OverallMetrics:
        """Run synthetic evaluation across all classes and severities."""
        if severities is None:
            severities = ["minor", "moderate", "severe"]
        
        all_results = []
        total_inf_time = 0
        
        print(f"\n{'='*60}")
        print(f"SYNTHETIC EVALUATION")
        print(f"{'='*60}")
        print(f"Classes: {len(CARDD_CLASSES)} | Severities: {len(severities)} | Per combo: {num_per_class}")
        print(f"Total synthetic images: {len(CARDD_CLASSES) * len(severities) * num_per_class}")
        print(f"{'='*60}\n")
        
        for class_name in CARDD_CLASSES:
            for severity in severities:
                for i in range(num_per_class):
                    seed = hash(f"{class_name}_{severity}_{i}") % 2**32
                    img, gt = generate_synthetic_test_image(class_name, severity, seed=seed)
                    
                    detections, inf_time = self.run_inference(img)
                    total_inf_time += inf_time
                    
                    result = ImageResult(
                        image_path=f"synthetic_{class_name}_{severity}_{i}.jpg",
                        detections=detections,
                        ground_truths=[gt],
                        inference_time_ms=inf_time
                    )
                    all_results.append(result)
                    
                    # Progress
                    gt_names = [g.class_name for g in result.ground_truths]
                    det_names = [d.class_name for d in result.detections]
                    match = "✓" if any(d.class_name == gt.class_name for d in result.detections) else "✗"
                    print(f"  {match} {class_name:15s} | {severity:8s} | GT: {gt_names} | Pred: {det_names}")
        
        return self.compute_metrics(all_results, total_inf_time)
    
    def evaluate_dataset(self, dataset: List[Tuple[Path, List[GroundTruth]]]) -> OverallMetrics:
        """Evaluate on a labeled dataset."""
        all_results = []
        total_inf_time = 0
        
        print(f"\n{'='*60}")
        print(f"DATASET EVALUATION: {len(dataset)} images")
        print(f"{'='*60}\n")
        
        for img_path, gts in dataset:
            result = self.evaluate_image(img_path, gts)
            all_results.append(result)
            total_inf_time += result.inference_time_ms
            
            gt_names = [g.class_name for g in result.ground_truths]
            det_names = [d.class_name for d in result.detections]
            print(f"  {img_path.name:30s} | GT: {gt_names} | Pred: {det_names}")
        
        return self.compute_metrics(all_results, total_inf_time)
    
    def compute_metrics(self, results: List[ImageResult], total_inf_time: float) -> OverallMetrics:
        """Compute precision, recall, mAP from results."""
        # Per-class accumulators
        class_stats = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "gt_count": 0, "pred_count": 0})
        
        for result in results:
            gts = result.ground_truths
            preds = result.detections
            
            # Track counts
            for gt in gts:
                class_stats[gt.class_name]["gt_count"] += 1
            for pred in preds:
                class_stats[pred.class_name]["pred_count"] += 1
            
            # Match predictions to ground truths (greedy by IoU)
            matched_gt = set()
            matched_pred = set()
            
            for i, pred in enumerate(preds):
                best_iou = 0
                best_gt_idx = -1
                
                for j, gt in enumerate(gts):
                    if j in matched_gt:
                        continue
                    if pred.class_name != gt.class_name:
                        continue
                    
                    iou = calculate_iou(pred.bbox, gt.bbox)
                    if iou > best_iou and iou >= self.iou_threshold:
                        best_iou = iou
                        best_gt_idx = j
                
                if best_gt_idx >= 0:
                    class_stats[pred.class_name]["tp"] += 1
                    matched_gt.add(best_gt_idx)
                    matched_pred.add(i)
                else:
                    class_stats[pred.class_name]["fp"] += 1
            
            # Unmatched GTs are false negatives
            for j, gt in enumerate(gts):
                if j not in matched_gt:
                    class_stats[gt.class_name]["fn"] += 1
        
        # Compute per-class metrics
        per_class = {}
        aps = []
        
        for class_name in CARDD_CLASSES:
            stats = class_stats[class_name]
            tp, fp, fn = stats["tp"], stats["fp"], stats["fn"]
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
            
            # AP approximation (using precision-recall at this IoU threshold)
            ap = precision * recall  # Simplified AP@IoU
            
            per_class[class_name] = ClassMetrics(
                class_name=class_name,
                tp=tp, fp=fp, fn=fn,
                precision=precision, recall=recall, f1=f1,
                ap=ap,
                num_gt=stats["gt_count"],
                num_pred=stats["pred_count"]
            )
            aps.append(ap)
        
        # Overall metrics
        total_tp = sum(c.tp for c in per_class.values())
        total_fp = sum(c.fp for c in per_class.values())
        total_fn = sum(c.fn for c in per_class.values())
        total_gt = sum(c.num_gt for c in per_class.values())
        total_pred = sum(c.num_pred for c in per_class.values())
        
        overall_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
        overall_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
        overall_f1 = 2 * overall_precision * overall_recall / (overall_precision + overall_recall) if (overall_precision + overall_recall) > 0 else 0.0
        
        mAP50 = np.mean(aps) if aps else 0.0
        mAP50_95 = mAP50 * 0.7  # Approximation
        
        return OverallMetrics(
            mAP50=mAP50,
            mAP50_95=mAP50_95,
            precision=overall_precision,
            recall=overall_recall,
            f1=overall_f1,
            per_class=per_class,
            total_images=len(results),
            total_gt=total_gt,
            total_pred=total_pred,
            avg_inference_time_ms=total_inf_time / len(results) if results else 0
        )


# ─── Visualization ──────────────────────────────────────────────────────────
def visualize_results(
    image: np.ndarray,
    detections: List[Detection],
    ground_truths: List[GroundTruth],
    output_path: Path
) -> None:
    """Draw detections (green) and ground truth (blue) on image."""
    vis = image.copy()
    
    # Draw ground truth boxes (blue)
    for gt in ground_truths:
        x1, y1, x2, y2 = map(int, gt.bbox)
        color = CLASS_COLORS.get(gt.class_name, (255, 0, 0))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"GT: {gt.class_name}"
        cv2.putText(vis, label, (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    # Draw prediction boxes (green)
    for det in detections:
        x1, y1, x2, y2 = map(int, det.bbox)
        color = (0, 255, 0)
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"Pred: {det.class_name} ({det.confidence:.2f})"
        cv2.putText(vis, label, (x1, y2+15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    cv2.imwrite(str(output_path), vis)


def print_metrics(metrics: OverallMetrics) -> None:
    """Print formatted evaluation metrics."""
    print(f"\n{'='*80}")
    print(f"EVALUATION RESULTS")
    print(f"{'='*80}")
    print(f"Images evaluated:     {metrics.total_images}")
    print(f"Total Ground Truth:   {metrics.total_gt}")
    print(f"Total Predictions:    {metrics.total_pred}")
    print(f"Avg Inference Time:   {metrics.avg_inference_time_ms:.1f} ms")
    print(f"{'-'*80}")
    print(f"OVERALL METRICS:")
    print(f"  mAP@50:           {metrics.mAP50:.4f}")
    print(f"  mAP@50-95 (est):  {metrics.mAP50_95:.4f}")
    print(f"  Precision:        {metrics.precision:.4f}")
    print(f"  Recall:           {metrics.recall:.4f}")
    print(f"  F1 Score:         {metrics.f1:.4f}")
    print(f"{'-'*80}")
    print(f"PER-CLASS METRICS:")
    print(f"{'Class':<20} {'TP':>4} {'FP':>4} {'FN':>4} {'Precision':>10} {'Recall':>10} {'F1':>10} {'AP':>10} {'GT':>4} {'Pred':>4}")
    print(f"{'-'*80}")
    
    for class_name in CARDD_CLASSES:
        c = metrics.per_class[class_name]
        print(f"{class_name:<20} {c.tp:>4} {c.fp:>4} {c.fn:>4} "
              f"{c.precision:>10.4f} {c.recall:>10.4f} {c.f1:>10.4f} {c.ap:>10.4f} "
              f"{c.num_gt:>4} {c.num_pred:>4}")
    
    print(f"{'='*80}")


# ─── Main ───────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Evaluate Car Damage Detection Model")
    parser.add_argument("--model", type=str, 
                        default=str(Path(__file__).parent / "models" / "best.pt"),
                        help="Path to YOLO model weights")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold for matching")
    
    # Dataset evaluation
    parser.add_argument("--data-dir", type=str, help="Path to dataset root (with images/ and labels/)")
    parser.add_argument("--split", type=str, default="test", help="Dataset split to evaluate")
    
    # Synthetic evaluation
    parser.add_argument("--synthetic", action="store_true", help="Run synthetic evaluation")
    parser.add_argument("--num-samples", type=int, default=10, help="Samples per class per severity")
    parser.add_argument("--severities", nargs="+", default=["minor", "moderate", "severe"])
    
    # Custom evaluation
    parser.add_argument("--images-dir", type=str, help="Directory of test images")
    parser.add_argument("--labels-dir", type=str, help="Directory of label files")
    
    # Output
    parser.add_argument("--output-dir", type=str, default="evaluation_results", help="Output directory")
    parser.add_argument("--save-visualizations", action="store_true", help="Save visualization images")
    
    args = parser.parse_args()
    
    # Validate model exists
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Error: Model not found at {model_path}")
        sys.exit(1)
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    viz_dir = output_dir / "visualizations"
    if args.save_visualizations:
        viz_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize evaluator
    print(f"Loading model from {model_path}...")
    evaluator = ModelEvaluator(str(model_path), conf_threshold=args.conf, iou_threshold=args.iou)
    print("Model loaded successfully.\n")
    
    all_metrics = None
    
    # Run synthetic evaluation
    if args.synthetic:
        metrics = evaluator.evaluate_synthetic(
            num_per_class=args.num_samples,
            severities=args.severities
        )
        all_metrics = metrics
    
    # Run dataset evaluation
    if args.data_dir:
        data_root = Path(args.data_dir)
        images_dir = data_root / "images"
        labels_dir = data_root / "labels"
        
        dataset = load_yolo_dataset(images_dir, labels_dir, args.split)
        if dataset:
            metrics = evaluator.evaluate_dataset(dataset)
            all_metrics = metrics
            
            # Save visualizations
            if args.save_visualizations:
                print("\nSaving visualizations...")
                for result in dataset:
                    img_path, gts = result
                    img = cv2.imread(str(img_path))
                    dets, _ = evaluator.run_inference(img)
                    viz_path = viz_dir / f"viz_{img_path.stem}.jpg"
                    visualize_results(img, dets, gts, viz_path)
    
    # Custom images + labels
    if args.images_dir and args.labels_dir:
        images_dir = Path(args.images_dir)
        labels_dir = Path(args.labels_dir)
        
        dataset = []
        for img_path in images_dir.iterdir():
            if img_path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp'}:
                continue
            label_path = labels_dir / (img_path.stem + '.txt')
            if not label_path.exists():
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            h, w = img.shape[:2]
            gts = []
            with open(label_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue
                    class_id = int(parts[0])
                    if class_id >= len(CARDD_CLASSES):
                        continue
                    box = [float(x) for x in parts[1:]]
                    pixel_box = yolo_to_pixels(box, w, h)
                    gts.append(GroundTruth(
                        class_id=class_id,
                        class_name=CARDD_CLASSES[class_id],
                        bbox=pixel_box,
                        image_width=w,
                        image_height=h
                    ))
            dataset.append((img_path, gts))
        
        if dataset:
            metrics = evaluator.evaluate_dataset(dataset)
            all_metrics = metrics
    
    # Print and save results
    if all_metrics:
        print_metrics(all_metrics)
        
        # Save JSON report
        report = {
            "model_path": str(model_path),
            "conf_threshold": args.conf,
            "iou_threshold": args.iou,
            "mAP50": all_metrics.mAP50,
            "mAP50_95": all_metrics.mAP50_95,
            "precision": all_metrics.precision,
            "recall": all_metrics.recall,
            "f1": all_metrics.f1,
            "avg_inference_time_ms": all_metrics.avg_inference_time_ms,
            "total_images": all_metrics.total_images,
            "total_gt": all_metrics.total_gt,
            "total_pred": all_metrics.total_pred,
            "per_class": {k: asdict(v) for k, v in all_metrics.per_class.items()}
        }
        
        report_path = output_dir / "evaluation_report.json"
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\nReport saved to {report_path}")
    else:
        print("No evaluation run. Use --synthetic, --data-dir, or --images-dir/--labels-dir")


if __name__ == "__main__":
    main()