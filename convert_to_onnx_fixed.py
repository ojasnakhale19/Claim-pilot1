#!/usr/bin/env python3
"""
Convert PyTorch YOLO model to ONNX for browser inference.

Usage:
    python convert_to_onnx.py [model_path] [output_path]

Example:
    python convert_to_onnx.py D:/NH/cardd_yolo11s_v2/weights/best.pt public/best.onnx
"""

import sys
import argparse
from pathlib import Path


def update_onnx_metadata(onnx_path: Path, class_names: list):
    """Update ONNX model metadata with correct class names."""
    import onnx
    import json
    
    model = onnx.load(str(onnx_path))
    
    # Remove old metadata
    new_metadata = []
    for prop in model.metadata_props:
        if prop.key not in ("names",):
            new_metadata.append(prop)
    
    # Add new class names metadata
    import json
    # Create metadata property manually
    prop = onnx.StringStringEntryProto()
    prop.key = "names"
    prop.value = json.dumps({i: name for i, name in enumerate(class_names)})
    new_metadata.append(prop)
    # Replace metadata entirely (clear and extend, to avoid duplicates)
    model.metadata_props.clear()
    model.metadata_props.extend(new_metadata)
    
    # Save modified model
    onnx.save(model, str(onnx_path))
    print(f"  Updated metadata with {len(class_names)} classes")


def test_onnx_inference(onnx_path: Path, input_size: int, class_names: list):
    """Test ONNX inference to verify it works correctly."""
    try:
        import onnxruntime as ort
        import numpy as np
        
        # Create dummy input
        dummy_input = np.random.randn(1, 3, input_size, input_size).astype(np.float32)
        
        # Create session
        session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
        
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        
        # Run inference
        outputs = session.run([output_name], {input_name: dummy_input})
        output = outputs[0]
        
        print(f"  Output shape: {output.shape}")
        
        if len(output.shape) == 3:
            num_channels = output.shape[1]
            expected_channels = 4 + len(class_names)
            print(f"  Number of output channels: {num_channels}")
            print(f"  Expected channels (4 + num_classes): {expected_channels}")
            
            if output.shape[1] == 4 + len(class_names):
                print("  ✓ Output channels match expected!")
            else:
                print(f"  ⚠ Channel mismatch!")
            
            # Test class scores
            class_scores = output[0, 4:4+len(class_names), :].max(axis=1)
            print(f"  Max scores for trained classes: {class_scores}")
            
        return True
    except Exception as e:
        print(f"  Inference test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def do_convert(model_path: str, output_path: str, input_size: int = 640, opset: int = 12):
    """
    Convert YOLOv8/v11 PyTorch model to ONNX format.
    """
    try:
        from ultralytics import YOLO
        import torch
        import onnx
        import onnxruntime as ort
        import numpy as np
    except ImportError as e:
        print(f"Missing dependencies: {e}")
        print("Install with: pip install ultralytics torch onnx onnxruntime onnxruntime-web numpy")
        return False
    
    model_path = Path(model_path)
    output_path = Path(output_path)
    
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        return False
    
    print(f"Loading model from {model_path}...")
    model = YOLO(str(model_path))
    
    # Get the number of trained classes
    num_classes = len(model.names)
    class_names = list(model.names.values())
    print(f"Model has {num_classes} classes: {class_names}")
    
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
        
        # The model architecture outputs 4 bbox + num_classes channels
        # For 6 classes: 4 + 6 = 10 channels total - this is correct!
        # No pruning needed if the model was trained with the correct number of classes
        
        # Update metadata with correct class names (replace spaces with underscores)
        normalized_names = [name.replace(" ", "_") for name in class_names]
        update_onnx_metadata(output_path, normalized_names)
        
        # Verify the model
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        print("ONNX model validation passed!")
        
        # Print model info
        print(f"\nModel info:")
        print(f"  Input: {onnx_model.graph.input[0].name} - shape: {[d.dim_value for d in onnx_model.graph.input[0].type.tensor_type.shape.dim]}")
        print(f"  Output: {onnx_model.graph.output[0].name} - shape: {[d.dim_value for d in onnx_model.graph.output[0].type.tensor_type.shape.dim]}")
        print(f"  Opset: {onnx_model.opset_import[0].version}")
        print(f"  Classes: {num_classes} ({normalized_names})")
        print(f"  File size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")
        
        # Quick inference test
        test_onnx_inference(output_path, input_size, normalized_names)
        
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
    
    success = do_convert(args.model_path, args.output_path, args.input_size, args.opset)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()