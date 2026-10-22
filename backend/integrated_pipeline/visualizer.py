"""
Visualization & Output Module
=============================
Handles drawing annotations, saving results, and generating reports.
"""

import cv2
import numpy as np
import pandas as pd
import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from collections import defaultdict
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

from .config import (
    CLASS_COLORS, SEVERITY_COLORS, FONT_SCALE, FONT_THICKNESS, BOX_THICKNESS,
    DETECTION_RESULTS_DIR, SEVERITY_REPORT_DIR, ANNOTATED_DIR, VISUALIZATION_DIR,
    SAVE_ANNOTATED_IMAGES, SAVE_ANNOTATED_VIDEO, SAVE_CSV_RESULTS, SAVE_SEVERITY_JSON, GENERATE_VISUALIZATIONS
)
from .detector import FrameResult, VideoResult, Detection


class Visualizer:
    """Handles all visualization and output generation."""
    
    def __init__(
        self,
        output_dir: Path = Path("output"),
        class_colors: Dict[str, Tuple[int, int, int]] = CLASS_COLORS,
        severity_colors: Dict[str, Tuple[int, int, int]] = SEVERITY_COLORS,
    ):
        self.output_dir = Path(output_dir)
        self.class_colors = class_colors
        self.severity_colors = severity_colors
        
        # Create output directories
        self.detection_dir = self.output_dir / "detections"
        self.severity_dir = self.output_dir / "severity_reports"
        self.annotated_dir = self.output_dir / "annotated"
        self.viz_dir = self.output_dir / "visualizations"
        
        for d in [self.detection_dir, self.severity_dir, self.annotated_dir, self.viz_dir]:
            d.mkdir(parents=True, exist_ok=True)
    
    def draw_detections(
        self,
        image: np.ndarray,
        detections: List[Detection],
        severity_level: str = "None",
        severity_score: float = 0.0,
        show_severity: bool = True,
    ) -> np.ndarray:
        """Draw bounding boxes and labels on image."""
        annotated = image.copy()
        h, w = annotated.shape[:2]
        
        for det in detections:
            x1, y1, x2, y2 = det.bbox_px
            color = self.class_colors.get(det.class_name, (255, 255, 255))
            
            # Draw bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, BOX_THICKNESS)
            
            # Prepare label
            label = f"{det.class_name} {det.confidence:.2f}"
            
            # Get text size
            (text_w, text_h), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, FONT_SCALE, FONT_THICKNESS
            )
            
            # Draw label background
            cv2.rectangle(
                annotated,
                (x1, y1 - text_h - baseline - 4),
                (x1 + text_w + 4, y1),
                color,
                -1,
            )
            
            # Draw label text
            cv2.putText(
                annotated,
                label,
                (x1 + 2, y1 - baseline - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                FONT_SCALE,
                (0, 0, 0),
                FONT_THICKNESS,
            )
        
        # Draw severity info
        if show_severity and severity_level != "None":
            severity_color = self.severity_colors.get(severity_level, (255, 255, 255))
            sev_label = f"Severity: {severity_level} ({severity_score:.2f})"
            
            (text_w, text_h), baseline = cv2.getTextSize(
                sev_label, cv2.FONT_HERSHEY_SIMPLEX, FONT_SCALE * 1.2, FONT_THICKNESS + 1
            )
            
            # Top-right corner
            x1 = w - text_w - 20
            y1 = text_h + 20
            
            cv2.rectangle(
                annotated,
                (x1 - 10, y1 - text_h - baseline - 10),
                (x1 + text_w + 10, y1 + baseline + 10),
                severity_color,
                -1,
            )
            cv2.putText(
                annotated,
                sev_label,
                (x1, y1),
                cv2.FONT_HERSHEY_SIMPLEX,
                FONT_SCALE * 1.2,
                (0, 0, 0),
                FONT_THICKNESS + 1,
            )
        
        return annotated
    
    def save_annotated_image(
        self,
        image: np.ndarray,
        frame_result: FrameResult,
        output_name: str = None,
    ) -> Path:
        """Save annotated image to disk."""
        if output_name is None:
            stem = Path(frame_result.source_path).stem
            output_name = f"{stem}_annotated.jpg"
        
        output_path = self.annotated_dir / output_name
        annotated = self.draw_detections(
            image,
            frame_result.detections,
            frame_result.severity_level,
            frame_result.severity_score,
        )
        cv2.imwrite(str(output_path), annotated)
        return output_path
    
    def save_annotated_video(
        self,
        video_path: Path,
        video_result: VideoResult,
        output_name: str = None,
    ) -> Path:
        """Save annotated video to disk."""
        if output_name is None:
            output_name = f"{video_path.stem}_annotated.mp4"
        
        output_path = self.annotated_dir / output_name
        
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        # Create frame lookup
        frame_map = {fr.frame_id: fr for fr in video_result.frame_results}
        
        frame_idx = 0
        processed_idx = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            if processed_idx in frame_map:
                fr = frame_map[processed_idx]
                frame = self.draw_detections(
                    frame,
                    fr.detections,
                    fr.severity_level,
                    fr.severity_score,
                )
                processed_idx += 1
            
            out.write(frame)
            frame_idx += 1
        
        cap.release()
        out.release()
        return output_path
    
    def save_csv_results(
        self,
        image_results: List[FrameResult],
        video_results: List[VideoResult],
        prefix: str = "",
    ) -> Dict[str, Path]:
        """Save detection results to CSV files."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"{prefix}_" if prefix else ""
        saved_files = {}
        
        # Image detections CSV
        if image_results:
            rows = []
            for fr in image_results:
                for det in fr.detections:
                    rows.append({
                        "source_file": Path(fr.source_path).name,
                        "frame_id": fr.frame_id,
                        "class_name": det.class_name,
                        "class_id": det.class_id,
                        "confidence": det.confidence,
                        "x1_norm": det.bbox[0],
                        "y1_norm": det.bbox[1],
                        "x2_norm": det.bbox[2],
                        "y2_norm": det.bbox[3],
                        "x1_px": det.bbox_px[0],
                        "y1_px": det.bbox_px[1],
                        "x2_px": det.bbox_px[2],
                        "y2_px": det.bbox_px[3],
                        "frame_width": fr.frame_shape[1],
                        "frame_height": fr.frame_shape[0],
                        "severity_score": fr.severity_score,
                        "severity_level": fr.severity_level,
                    })
            
            df = pd.DataFrame(rows)
            csv_path = self.detection_dir / f"{prefix}image_detections_{timestamp}.csv"
            df.to_csv(csv_path, index=False)
            saved_files["image_detections"] = csv_path
            
            # Image summary CSV
            summary_rows = []
            for fr in image_results:
                summary_rows.append({
                    "source_file": Path(fr.source_path).name,
                    "frame_id": fr.frame_id,
                    "total_detections": len(fr.detections),
                    "severity_score": fr.severity_score,
                    "severity_level": fr.severity_level,
                    "inference_time_ms": fr.inference_time_ms,
                    **fr.damage_counts,
                })
            
            summary_df = pd.DataFrame(summary_rows)
            summary_path = self.detection_dir / f"{prefix}image_summary_{timestamp}.csv"
            summary_df.to_csv(summary_path, index=False)
            saved_files["image_summary"] = summary_path
        
        # Video detections CSV
        if video_results:
            rows = []
            for vr in video_results:
                for fr in vr.frame_results:
                    for det in fr.detections:
                        rows.append({
                            "video_file": Path(vr.video_path).name,
                            "frame_id": fr.frame_id,
                            "class_name": det.class_name,
                            "class_id": det.class_id,
                            "confidence": det.confidence,
                            "x1_norm": det.bbox[0],
                            "y1_norm": det.bbox[1],
                            "x2_norm": det.bbox[2],
                            "y2_norm": det.bbox[3],
                            "x1_px": det.bbox_px[0],
                            "y1_px": det.bbox_px[1],
                            "x2_px": det.bbox_px[2],
                            "y2_px": det.bbox_px[3],
                            "frame_width": fr.frame_shape[1],
                            "frame_height": fr.frame_shape[0],
                            "severity_score": fr.severity_score,
                            "severity_level": fr.severity_level,
                        })
            
            df = pd.DataFrame(rows)
            csv_path = self.detection_dir / f"{prefix}video_detections_{timestamp}.csv"
            df.to_csv(csv_path, index=False)
            saved_files["video_detections"] = csv_path
            
            # Video summary CSV
            summary_rows = []
            for vr in video_results:
                for fr in vr.frame_results:
                    summary_rows.append({
                        "video_file": Path(vr.video_path).name,
                        "frame_id": fr.frame_id,
                        "total_detections": len(fr.detections),
                        "severity_score": fr.severity_score,
                        "severity_level": fr.severity_level,
                        "inference_time_ms": fr.inference_time_ms,
                        **fr.damage_counts,
                    })
            
            summary_df = pd.DataFrame(summary_rows)
            summary_path = self.detection_dir / f"{prefix}video_summary_{timestamp}.csv"
            summary_df.to_csv(summary_path, index=False)
            saved_files["video_summary"] = summary_path
        
        return saved_files
    
    def save_severity_json(
        self,
        image_results: List[FrameResult],
        video_results: List[VideoResult],
        prefix: str = "",
    ) -> Path:
        """Save severity assessment results as JSON."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"{prefix}_" if prefix else ""
        
        report = {
            "timestamp": timestamp,
            "model_info": {
                "classes": list(CLASS_COLORS.keys()),
            },
            "images": [fr.to_dict() for fr in image_results],
            "videos": [vr.to_dict() for vr in video_results],
            "summary": {
                "total_images": len(image_results),
                "total_videos": len(video_results),
                "total_frames_processed": len(image_results) + sum(vr.processed_frames for vr in video_results),
                "overall_severity_distribution": self._get_severity_distribution(image_results, video_results),
            },
        }
        
        json_path = self.severity_dir / f"{prefix}severity_report_{timestamp}.json"
        with open(json_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        return json_path
    
    def _get_severity_distribution(
        self,
        image_results: List[FrameResult],
        video_results: List[VideoResult],
    ) -> Dict[str, int]:
        """Get count of frames per severity level."""
        dist = defaultdict(int)
        for fr in image_results:
            dist[fr.severity_level] += 1
        for vr in video_results:
            for fr in vr.frame_results:
                dist[fr.severity_level] += 1
        return dict(dist)
    
    def generate_visualizations(
        self,
        image_results: List[FrameResult],
        video_results: List[VideoResult],
        prefix: str = "",
    ) -> List[Path]:
        """Generate visualization charts."""
        if not GENERATE_VISUALIZATIONS:
            return []
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"{prefix}_" if prefix else ""
        saved_plots = []
        
        # Set style
        plt.style.use('seaborn-v0_8-darkgrid')
        sns.set_palette("husl")
        
        # 1. Severity Analysis Dashboard
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle('Car Damage Detection - Severity Analysis', fontsize=16, fontweight='bold')
        
        # Severity distribution
        all_frames = image_results + [fr for vr in video_results for fr in vr.frame_results]
        severity_counts = defaultdict(int)
        for fr in all_frames:
            severity_counts[fr.severity_level] += 1
        
        if severity_counts:
            axes[0, 0].pie(
                severity_counts.values(),
                labels=severity_counts.keys(),
                colors=[self.severity_colors.get(k, 'gray') for k in severity_counts.keys()],
                autopct='%1.1f%%',
                startangle=90,
            )
            axes[0, 0].set_title('Severity Level Distribution')
        
        # Damage type detection frequency
        damage_counts = defaultdict(int)
        for fr in all_frames:
            for det in fr.detections:
                damage_counts[det.class_name] += 1
        
        if damage_counts:
            axes[0, 1].bar(damage_counts.keys(), damage_counts.values(), color=[self.class_colors.get(k, 'gray') for k in damage_counts.keys()])
            axes[0, 1].set_title('Damage Type Detection Frequency')
            axes[0, 1].set_ylabel('Count')
            axes[0, 1].tick_params(axis='x', rotation=45)
        
        # Confidence distribution by damage type
        damage_confs = defaultdict(list)
        for fr in all_frames:
            for det in fr.detections:
                damage_confs[det.class_name].append(det.confidence)
        
        if damage_confs:
            damages = list(damage_confs.keys())
            conf_data = [damage_confs[d] for d in damages]
            axes[1, 0].boxplot(conf_data, labels=damages)
            axes[1, 0].set_title('Confidence Distribution by Damage Type')
            axes[1, 0].set_ylabel('Confidence')
            axes[1, 0].tick_params(axis='x', rotation=45)
        
        # Severity score timeline (for video)
        if video_results:
            vr = video_results[0]  # First video
            frame_ids = [fr.frame_id for fr in vr.frame_results]
            sev_scores = [fr.severity_score for fr in vr.frame_results]
            axes[1, 1].plot(frame_ids, sev_scores, 'o-', color='steelblue', linewidth=2, markersize=6)
            # Add severity threshold lines
            sev_config = {
                "Critical": 0.70,
                "High": 0.50,
                "Medium": 0.30,
                "Low": 0.15,
            }
            for level, threshold in sev_config.items():
                color = self.severity_colors.get(level, 'gray')
                axes[1, 1].axhline(y=threshold, color=color, linestyle='--', alpha=0.5, label=level)
            axes[1, 1].set_title('Severity Score Across Video Frames')
            axes[1, 1].set_xlabel('Frame Index')
            axes[1, 1].set_ylabel('Severity Score')
            axes[1, 1].legend()
            axes[1, 1].set_ylim(0, 1.05)
        
        plt.tight_layout()
        plot_path = self.viz_dir / f"{prefix}severity_analysis_{timestamp}.png"
        plt.savefig(plot_path, dpi=150, bbox_inches='tight')
        plt.close()
        saved_plots.append(plot_path)
        
        # 2. Damage detection heatmap (if video)
        if video_results and len(video_results[0].frame_results) > 1:
            vr = video_results[0]
            damages = list(CLASS_COLORS.keys())
            frame_ids = [fr.frame_id for fr in vr.frame_results]
            
            heatmap_data = np.zeros((len(damages), len(frame_ids)))
            for i, dmg in enumerate(damages):
                for j, fr in enumerate(vr.frame_results):
                    count = sum(1 for det in fr.detections if det.class_name == dmg)
                    heatmap_data[i, j] = count
            
            fig, ax = plt.subplots(figsize=(12, 6))
            im = ax.imshow(heatmap_data, aspect='auto', cmap='YlOrRd', interpolation='nearest')
            ax.set_yticks(range(len(damages)))
            ax.set_yticklabels(damages)
            ax.set_xticks(range(len(frame_ids)))
            ax.set_xticklabels(frame_ids)
            ax.set_xlabel('Frame Index')
            ax.set_title('Damage Detection Count per Frame (Video)')
            plt.colorbar(im, ax=ax, label='Detection Count')
            
            plot_path = self.viz_dir / f"{prefix}damage_detection_heatmap_{timestamp}.png"
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
            plt.close()
            saved_plots.append(plot_path)
        
        return saved_plots


def create_visualizer(output_dir: Path = Path("output")) -> Visualizer:
    """Factory function to create visualizer."""
    return Visualizer(output_dir)