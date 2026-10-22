"""
Video Processing Module — Extract frames from video for damage assessment.
Integrates with the existing damage detection pipeline.
"""

from __future__ import annotations

import io
import logging
import tempfile
import os
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("video_processor")


@dataclass
class VideoFrame:
    """Represents a single extracted frame from video."""
    frame_index: int
    timestamp_ms: float
    image: Image.Image
    metrics: Dict[str, Any]


@dataclass
class VideoExtractionResult:
    """Result of video frame extraction."""
    video_path: str
    total_frames: int
    duration_seconds: float
    fps: float
    extracted_frames: List[VideoFrame]
    extraction_strategy: str
    warnings: List[str]


class VideoProcessor:
    """
    Handles video frame extraction for damage assessment.
    
    Strategies:
    - uniform: Extract frames at uniform intervals
    - keyframe: Extract only keyframes (I-frames)
    - scene_change: Extract on significant scene changes
    """
    
    def __init__(
        self,
        max_frames: int = 20,
        min_interval_seconds: float = 0.5,
        max_video_size_mb: int = 100,
        supported_formats: Optional[List[str]] = None
    ):
        self.max_frames = max_frames
        self.min_interval_seconds = min_interval_seconds
        self.max_video_size_mb = max_video_size_mb
        self.supported_formats = supported_formats or ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    
    def validate_video(self, video_bytes: bytes, filename: str) -> Tuple[bool, str]:
        """
        Validate video file before processing.
        
        Returns:
            (is_valid, error_message)
        """
        # Check file size
        size_mb = len(video_bytes) / (1024 * 1024)
        if size_mb > self.max_video_size_mb:
            return False, f"Video file too large: {size_mb:.1f}MB (max {self.max_video_size_mb}MB)"
        
        # Check extension
        ext = Path(filename).suffix.lower()
        if ext not in self.supported_formats:
            return False, f"Unsupported video format: {ext}. Supported: {', '.join(self.supported_formats)}"
        
        # Try to open with OpenCV to verify it's a valid video
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(video_bytes)
                tmp_path = tmp.name
            
            cap = cv2.VideoCapture(tmp_path)
            if not cap.isOpened():
                os.unlink(tmp_path)
                return False, "Could not open video file. File may be corrupted."
            
            # Check basic properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = frame_count / fps if fps > 0 else 0
            
            cap.release()
            os.unlink(tmp_path)
            
            if frame_count == 0:
                return False, "Video has no frames."
            
            # For 10-frame extraction workflow: require 8-10 seconds
            if duration < 8.0:
                return False, f"Video too short: {duration:.1f}s (minimum 8 seconds for 10-frame extraction)."
            
            if duration > 10.0:
                return False, f"Video too long: {duration:.1f}s (maximum 10 seconds for 10-frame extraction)."
            
            if duration > 300:  # 5 minutes absolute max
                return False, "Video too long (maximum 5 minutes)."
            
            return True, ""
            
        except Exception as e:
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return False, f"Video validation failed: {str(e)}"
    
    def extract_frames_uniform(
        self, 
        video_bytes: bytes, 
        filename: str,
        target_frames: Optional[int] = None
    ) -> VideoExtractionResult:
        """
        Extract frames at uniform intervals throughout the video.
        """
        target = target_frames or self.max_frames
        ext = Path(filename).suffix.lower()
        warnings = []
        
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
            
            if total_frames <= target:
                # Extract all frames if video is short
                frame_indices = list(range(total_frames))
                warnings.append(f"Video has only {total_frames} frames, extracting all")
            else:
                # Uniform sampling
                frame_indices = np.linspace(0, total_frames - 1, target, dtype=int).tolist()
            
            extracted = []
            prev_frame = None
            
            for idx, frame_idx in enumerate(frame_indices):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                
                if not ret:
                    warnings.append(f"Failed to read frame at index {frame_idx}")
                    continue
                
                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)
                
                # Calculate timestamp
                timestamp_ms = (frame_idx / fps) * 1000 if fps > 0 else 0
                
                # Get image metrics
                metrics = self._get_frame_metrics(pil_image)
                
                # Skip near-duplicate frames (simple check)
                if prev_frame is not None:
                    similarity = self._frame_similarity(prev_frame, pil_image)
                    if similarity > 0.98:
                        warnings.append(f"Frame {frame_idx} very similar to previous, skipping")
                        continue
                
                extracted.append(VideoFrame(
                    frame_index=frame_idx,
                    timestamp_ms=timestamp_ms,
                    image=pil_image,
                    metrics=metrics
                ))
                prev_frame = pil_image
                
                # Respect minimum interval
                if len(extracted) >= 2:
                    last_ts = extracted[-1].timestamp_ms
                    prev_ts = extracted[-2].timestamp_ms
                    if (last_ts - prev_ts) < self.min_interval_seconds * 1000:
                        # Remove the last one if too close
                        extracted.pop()
                        continue
            
            cap.release()
            
            strategy = "uniform_all" if total_frames <= target else "uniform_sampling"
            
            return VideoExtractionResult(
                video_path=filename,
                total_frames=total_frames,
                duration_seconds=duration,
                fps=fps,
                extracted_frames=extracted,
                extraction_strategy=strategy,
                warnings=warnings
            )
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def extract_frames_keyframes(
        self, 
        video_bytes: bytes, 
        filename: str,
        target_frames: Optional[int] = None
    ) -> VideoExtractionResult:
        """
        Extract keyframes (I-frames) from video.
        More efficient but may miss details between keyframes.
        """
        target = target_frames or self.max_frames
        ext = Path(filename).suffix.lower()
        warnings = []
        
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
            
            extracted = []
            frame_idx = 0
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Check if keyframe (I-frame)
                # Note: OpenCV doesn't directly expose frame type, 
                # so we use a heuristic: significant difference from previous
                if frame_idx == 0:
                    is_keyframe = True
                else:
                    # Simple motion detection as proxy for keyframe
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    if prev_gray is not None:
                        diff = cv2.absdiff(gray, prev_gray)
                        motion_score = np.mean(diff)
                        is_keyframe = motion_score > 30  # Threshold for significant change
                    else:
                        is_keyframe = True
                
                prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame_idx == 0 else prev_gray
                
                if is_keyframe:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_image = Image.fromarray(frame_rgb)
                    timestamp_ms = (frame_idx / fps) * 1000 if fps > 0 else 0
                    metrics = self._get_frame_metrics(pil_image)
                    
                    extracted.append(VideoFrame(
                        frame_index=frame_idx,
                        timestamp_ms=timestamp_ms,
                        image=pil_image,
                        metrics=metrics
                    ))
                    
                    if len(extracted) >= target:
                        break
                
                frame_idx += 1
            
            cap.release()
            
            if len(extracted) < 3:
                warnings.append(f"Only {len(extracted)} keyframes found, falling back to uniform sampling")
                return self.extract_frames_uniform(video_bytes, filename, target_frames)
            
            return VideoExtractionResult(
                video_path=filename,
                total_frames=total_frames,
                duration_seconds=duration,
                fps=fps,
                extracted_frames=extracted,
                extraction_strategy="keyframe",
                warnings=warnings
            )
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def extract_frames(
        self, 
        video_bytes: bytes, 
        filename: str,
        strategy: str = "uniform",
        target_frames: Optional[int] = None
    ) -> VideoExtractionResult:
        """
        Main entry point for frame extraction.
        
        Args:
            video_bytes: Raw video file bytes
            filename: Original filename (for extension detection)
            strategy: "uniform" | "keyframe"
            target_frames: Number of frames to extract (default: self.max_frames)
        """
        # Validate first
        is_valid, error = self.validate_video(video_bytes, filename)
        if not is_valid:
            raise ValueError(error)
        
        if strategy == "keyframe":
            return self.extract_frames_keyframes(video_bytes, filename, target_frames)
        else:
            return self.extract_frames_uniform(video_bytes, filename, target_frames)
    
    def _get_frame_metrics(self, image: Image.Image) -> Dict[str, Any]:
        """Get quality metrics for a frame."""
        rgb = np.asarray(image.convert("RGB"))
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        width, height = image.size
        
        import hashlib
        return {
            "width": int(width),
            "height": int(height),
            "pixel_count": int(width * height),
            "laplacian_variance": round(blur_score, 2),
            "sha256_normalized_pixels": hashlib.sha256(rgb.tobytes()).hexdigest(),
        }
    
    def _frame_similarity(self, img1: Image.Image, img2: Image.Image) -> float:
        """Calculate similarity between two frames (0-1)."""
        # Resize to small size for quick comparison
        small1 = img1.resize((64, 64), Image.Resampling.LANCZOS)
        small2 = img2.resize((64, 64), Image.Resampling.LANCZOS)
        
        arr1 = np.asarray(small1.convert("L"), dtype=np.float32) / 255.0
        arr2 = np.asarray(small2.convert("L"), dtype=np.float32) / 255.0
        
        # Structural similarity approximation
        diff = np.abs(arr1 - arr2)
        return 1.0 - np.mean(diff)


def create_video_processor(
    max_frames: int = 10,
    min_interval_seconds: float = 0.5,
    max_video_size_mb: int = 100
) -> VideoProcessor:
    """Factory function to create VideoProcessor with default settings."""
    return VideoProcessor(
        max_frames=max_frames,
        min_interval_seconds=min_interval_seconds,
        max_video_size_mb=max_video_size_mb
    )