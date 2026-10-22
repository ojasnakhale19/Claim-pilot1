#!/usr/bin/env python3
"""
Convert PyTorch YOLO model to ONNX for browser inference.

Usage:
    python convert_to_onnx.py [model_path] [output_path]

Example:
    python convert_to_onnx.py backend/models/best.pt public/best.onnx
"""

import sys
import argparse
from pathlib import Path

def convert_to_onnx(model_path: str, output_path: str, input_size: int = 640, opset: int = 12):
    """
    Convert YOLOv8/v11 PyTorch model to ONNX format.
    
    Args:
        model_path: Path to .pt model file
        output_path: Path to save .onnx file
        input_size: Input image size (square)
        opset: ONNX opset version
    """
    try:
        from ultralytics import YOLO
        import torch
    except ImportError as e:
        print(f"Missing dependencies: {e}")
        print("Install with: pip install ultralytics torch")
        return False
    
    model_path = Path(model_path)
    output_path = Path(output_path)
    
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        return False
    
    print(f"Loading model from {model_path}...")
    model = YOLO(str(model_path))
    
    print(f"Exporting to ONNX (input_size={input_size}, opset={opset})...")
    try:
        # Export to ONNX
        exported_path = model.export(
            format="onnx",
            imgsz=input_size,
            opset=opset,
            simplify=True,
            dynamic=False,  # Fixed batch size for browser
            half=False,     # FP32 for broader compatibility
        )
        
        # Move to desired output location
        exported_path = Path(exported_path)
        if exported_path != output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.move(str(exported_path), str(output_path))
            print(f"Model moved to {output_path}")
        else:
            print(f"Model saved to {output_path}")
        
        # Verify the model
        import onnx
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        print("ONNX model validation passed!")
        
        # Print model info
        print(f"\nModel info:")
        print(f"  Input: {onnx_model.graph.input[0].name} - shape: {[d.dim_value for d in onnx_model.graph.input[0].type.tensor_type.shape.dim]}")
        print(f"  Output: {onnx_model.graph.output[0].name} - shape: {[d.dim_value for d in onnx_model.graph.output[0].type.tensor_type.shape.dim]}")
        print(f"  Opset: {onnx_model.opset_import[0].version}")
        print(f"  File size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")
        
        return True
        
    except Exception as e:
        print(f"Export failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(description="Convert YOLO PyTorch model to ONNX")
    parser.add_argument("model_path", nargs="?", default="backend/models/best.pt", help="Path to .pt model")
    parser.add_argument("output_path", nargs="?", default="public/best.onnx", help="Output .onnx path")
    parser.add_argument("--input-size", type=int, default=640, help="Input image size")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version")
    
    args = parser.parse_args()
    
    success = convert_to_onnx(args.model_path, args.output_path, args.input_size, args.opset)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()