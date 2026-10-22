/**
 * YOLO ONNX Inference Utility for Browser
 * Runs YOLOv8/YOLOv11 inference using ONNX Runtime Web
 */

// Types
export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
}

export interface InferenceState {
  detections: Detection[];
  annotatedImage: string | null;
  processingTime: number;
}

export interface YOLOConfig {
  modelPath: string;
  inputSize: number;
  confidenceThreshold: number;
  iouThreshold: number;
  classNames: string[];
  executionProviders?: string[];
}

export interface LetterboxResult {
  resized: ImageData;
  scale: number;
  padX: number;
  padY: number;
}

/**
 * Letterbox resize to maintain aspect ratio
 */
export function letterboxResize(
  imageData: ImageData,
  targetSize: number
): LetterboxResult {
  const { width, height } = imageData;
  const scale = Math.min(targetSize / width, targetSize / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  
  const padX = (targetSize - newWidth) / 2;
  const padY = (targetSize - newHeight) / 2;
  
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, targetSize, targetSize);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);
  
  ctx.drawImage(tempCanvas, padX, padY, newWidth, newHeight);
  
  const resized = ctx.getImageData(0, 0, targetSize, targetSize);
  return { resized, scale, padX, padY };
}

/**
 * Convert ImageData to normalized tensor (NCHW format)
 */
export function imageDataToTensor(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const tensor = new Float32Array(3 * height * width);
  
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const idx = (i * width + j) * 4;
      const r = data[idx] / 255.0;
      const g = data[idx + 1] / 255.0;
      const b = data[idx + 2] / 255.0;
      
      tensor[i * width + j] = r;
      tensor[height * width + i * width + j] = g;
      tensor[2 * height * width + i * width + j] = b;
    }
  }
  
  return tensor;
}

/**
 * Non-Maximum Suppression
 */
export function nonMaxSuppression(
  boxes: number[][],
  scores: number[],
  iouThreshold: number
): number[] {
  const indices = boxes.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  
  while (indices.length > 0) {
    const current = indices.shift()!;
    keep.push(current);
    
    for (let i = 0; i < indices.length; i++) {
      const iou = calculateIOU(boxes[current], boxes[indices[i]]);
      if (iou > iouThreshold) {
        indices.splice(i, 1);
        i--;
      }
    }
  }
  
  return keep;
}

function calculateIOU(box1: number[], box2: number[]): number {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);
  
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  const union = area1 + area2 - intersection;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * Parse YOLO output
 */
export function parseYOLOOutput(
  output: Float32Array,
  numClasses: number,
  _inputWidth: number,
  _inputHeight: number,
  scale: number,
  padX: number,
  padY: number,
  confidenceThreshold: number,
  iouThreshold: number,
  classNames: string[]
): Detection[] {
  // Ultralytics YOLO exports ONNX with shape [1, 4 + numClasses, 8400] (transposed/column-major).
  const numBoxes = Math.round(output.length / (4 + numClasses));
  const boxes: number[][] = [];
  const scores: number[] = [];
  const classIds: number[] = [];
  
  const cxOffset = 0 * numBoxes;
  const cyOffset = 1 * numBoxes;
  const wOffset  = 2 * numBoxes;
  const hOffset  = 3 * numBoxes;

  for (let i = 0; i < numBoxes; i++) {
    const cx = output[cxOffset + i];
    const cy = output[cyOffset + i];
    const w  = output[wOffset + i];
    const h  = output[hOffset + i];
    
    let maxScore = 0;
    let maxClassId = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numBoxes + i];
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c;
      }
    }
    
    if (maxScore < confidenceThreshold) continue;
    
    const x1 = (cx - w / 2) / scale - padX / scale;
    const y1 = (cy - h / 2) / scale - padY / scale;
    const x2 = (cx + w / 2) / scale - padX / scale;
    const y2 = (cy + h / 2) / scale - padY / scale;
    
    boxes.push([x1, y1, x2, y2]);
    scores.push(maxScore);
    classIds.push(maxClassId);
  }
  
  const keepIndices = nonMaxSuppression(boxes, scores, iouThreshold);
  
  return keepIndices.map(idx => {
    return {
      classId: classIds[idx],
      className: classNames[classIds[idx]] || `class_${classIds[idx]}`,
      confidence: scores[idx],
      bbox: [boxes[idx][0], boxes[idx][1], boxes[idx][2], boxes[idx][3]] as [number, number, number, number],
    };
  });
}

/**
 * Main YOLO Inference Class
 */
export class YOLOInference {
  private session: any = null;
  private config: YOLOConfig;
  private isInitialized = false;
  private ort: any = null;
  
  constructor(config: YOLOConfig) {
    this.config = {
      executionProviders: ['wasm'],
      ...config,
    };
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const ort: any = await import('onnxruntime-web').catch(() => null);
      
      if (!ort) {
        throw new Error('onnxruntime-web not installed. Please install: npm install onnxruntime-web');
      }
      this.ort = ort;
      
      this.session = await ort.InferenceSession.create(this.config.modelPath, {
        executionProviders: this.config.executionProviders,
        graphOptimizationLevel: 'all',
      });
      
      this.isInitialized = true;
      console.log('YOLO model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize YOLO model:', error);
      throw error;
    }
  }
  
  async infer(imageElement: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<InferenceState> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = performance.now();
    const { inputSize, confidenceThreshold, iouThreshold, classNames } = this.config;
    const numClasses = classNames.length;
    
    const canvas = document.createElement('canvas');
    canvas.width = inputSize;
    canvas.height = inputSize;
    const ctx = canvas.getContext('2d')!;
    
    ctx.drawImage(imageElement, 0, 0, inputSize, inputSize);
    
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = imageElement.width;
    originalCanvas.height = imageElement.height;
    const origCtx = originalCanvas.getContext('2d')!;
    origCtx.drawImage(imageElement, 0, 0);
    const originalImageData = origCtx.getImageData(0, 0, imageElement.width, imageElement.height);
    
    const { resized: letterboxed, scale: letterboxScale, padX, padY } = letterboxResize(originalImageData, inputSize);
    
    const tensor = imageDataToTensor(letterboxed);
    
    const inputName = this.session.inputNames[0];
    const inputTensor = new this.ort.Tensor('float32', tensor, [1, 3, inputSize, inputSize]);
    const feeds: Record<string, any> = { [inputName]: inputTensor };
    
    const results = await this.session.run(feeds);
    const output = results[this.session.outputNames[0]].data;
    
    const detections = parseYOLOOutput(
      output,
      numClasses,
      inputSize,
      inputSize,
      letterboxScale,
      padX,
      padY,
      confidenceThreshold,
      iouThreshold,
      classNames
    );
    
    const inferenceTime = performance.now() - startTime;
    
    return {
      detections,
      annotatedImage: null,
      processingTime: inferenceTime,
    };
  }
  
  async inferFromFile(file: File): Promise<InferenceState> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const result = await this.infer(img);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  
  dispose(): void {
    if (this.session) {
      this.session.release();
      this.session = null;
      this.isInitialized = false;
    }
  }
}

/**
 * All 10 classes that the ONNX model was trained with (in correct order)
 * Model: YOLOv8/YOLOv11 trained on CarDD dataset with 10 classes
 */
export const MODEL_CLASSES = [
  'crack',
  'crash',
  'dent',
  'dislocated_part',
  'glass_shatter',
  'lamp_broken',
  'no_part',
  'rub',
  'scratch',
  'tire_flat'
] as const;

/**
 * Valid damage classes for insurance assessment (6 classes matching backend CarDD model)
 * These are the ONLY classes that should be used for cost estimation and settlement.
 * Classes like 'crash', 'dislocated_part', 'no_part', 'rub' are NOT valid damage types for insurance.
 */
export const VALID_DAMAGE_CLASSES = [
  'dent',
  'scratch', 
  'crack',
  'glass_shatter',
  'lamp_broken',
  'tire_flat'
] as const;

export type ValidDamageClass = typeof VALID_DAMAGE_CLASSES[number];

/**
 * Convert readonly tuple to mutable array for function parameters
 */
export const VALID_DAMAGE_CLASSES_ARRAY: string[] = [...VALID_DAMAGE_CLASSES];
export const MODEL_CLASSES_ARRAY: string[] = [...MODEL_CLASSES];

/**
 * Create a configured YOLO inference instance for the app
 * Uses ALL 10 model classes for correct ONNX output parsing, then filters to 6 valid insurance classes
 */
export function createClaimPilotYOLO(
  modelPath: string = '/best.onnx',
  classNames: string[] = MODEL_CLASSES_ARRAY
): YOLOInference {
  return new YOLOInference({
    modelPath,
    inputSize: 640,
    confidenceThreshold: 0.25,
    iouThreshold: 0.45,
    classNames,
    executionProviders: ['wasm'],
  });
}

/**
 * Check if a detected class is a valid damage type for insurance assessment
 */
export function isValidDamageClass(className: string): className is ValidDamageClass {
  return VALID_DAMAGE_CLASSES.includes(className as ValidDamageClass);
}

/**
 * Filter detections to only include valid damage classes for insurance purposes
 */
export function filterValidDetections(detections: Detection[]): Detection[] {
  return detections.filter(d => isValidDamageClass(d.className));
}