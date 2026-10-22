/**
 * @deprecated FourViewInference is RETIRED and no longer used in the main workflow.
 *
 * This component ran browser-side YOLO (ONNX) inference and passed raw detection counts
 * to ClaimFlowPage, which caused the "477 detections / Local AI detection (hybrid unavailable)"
 * problem: thousands of per-frame bounding boxes were counted as separate physical damages.
 *
 * REPLACEMENT: Use FourViewUpload which calls /assess/direct on the backend.
 * The backend uses OpenAI GPT-4o-mini vision for evidence-grounded, deduplicated assessment.
 *
 * This file is kept for reference only. Do NOT re-export it from cinematic/index.ts.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, Eye, Zap, AlertCircle, CheckCircle, RotateCcw, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { cn, isValidImageFile, getFileSizeString, formatDamageType } from '../../lib/utils';
import { createClaimPilotYOLO, type Detection, type InferenceState, filterValidDetections, VALID_DAMAGE_CLASSES_ARRAY } from '../../lib/yoloInference';

const REQUIRED_VIEWS = [
  { id: 'top', label: 'Top View', icon: '⬆', desc: 'Elevated view of damaged area', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { id: 'bottom', label: 'Bottom View', icon: '⬇', desc: 'Lower angle (safe position only)', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  { id: 'left', label: 'Left View', icon: '⬅', desc: 'Left side of damaged area', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  { id: 'right', label: 'Right View', icon: '➡', desc: 'Right side of damaged area', color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
] as const;

interface ViewUploadState {
  file: File | null;
  preview: string | null;
  error: string | null;
  loading: boolean;
}

interface InferenceViewState {
  detections: Detection[];
  annotatedImage: string | null;
  processingTime: number;
}

interface FourViewInferenceProps {
  onInferenceComplete: (result: {
    views: Record<string, InferenceViewState>;
    totalDetections: number;
    primaryComponent: string;
    damageSummary: string;
    severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
    estimatedRepairCostMin: number;
    estimatedRepairCostMax: number;
    settlementOffer: number;
    settlementMin: number;
    settlementMax: number;
    reviewRequired: boolean;
    reviewFlags: Array<{ code: string; view: string; message: string }>;
    limitations: string[];
  }) => void;
  onError: (error: string) => void;
  onValidationError: (validation: any) => void;
  onFilesChange?: (files: Record<string, File | null>) => void;
  disabled?: boolean;
  useBackendFallback?: boolean; // Use backend API if local model fails
}

export function FourViewInference({
  onInferenceComplete,
  onError,
  onValidationError,
  onFilesChange,
  disabled = false,
  useBackendFallback = true,
}: FourViewInferenceProps) {
  const [viewStates, setViewStates] = useState<Record<string, ViewUploadState>>({});
  const [inferencing, setInferencing] = useState(false);
  const [inferenceProgress, setInferenceProgress] = useState(0);
  const [inferenceStep, setInferenceStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [inferenceResults, setInferenceResults] = useState<Record<string, InferenceState>>({});
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const yoloRef = useRef<ReturnType<typeof createClaimPilotYOLO> | null>(null);

  const inferenceSteps = [
    'Loading YOLO model…',
    'Preprocessing four views…',
    'Running damage detection…',
    'Calculating settlement…',
  ];

  // Initialize YOLO model with proper error handling
  useEffect(() => {
    let mounted = true;
    
    const initModel = async () => {
      try {
        yoloRef.current = createClaimPilotYOLO('/best.onnx');
        await yoloRef.current.initialize();
        if (mounted) {
          setModelReady(true);
          setModelError(null);
        }
      } catch (err: any) {
        console.error('Local YOLO model failed to initialize:', err);
        if (mounted) {
          setModelError(err.message || 'Failed to load local AI model. The ONNX model may be corrupted or missing.');
          setModelReady(false);
        }
      }
    };
    
    initModel();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize view states
  useEffect(() => {
    const initial: Record<string, ViewUploadState> = {};
    REQUIRED_VIEWS.forEach(view => {
      initial[view.id] = { file: null, preview: null, error: null, loading: false };
    });
    setViewStates(initial);
  }, []);

  // Notify parent of file changes
  useEffect(() => {
    if (onFilesChange) {
      const files: Record<string, File | null> = {};
      REQUIRED_VIEWS.forEach(view => {
        files[view.id] = viewStates[view.id]?.file || null;
      });
      onFilesChange(files);
    }
  }, [viewStates, onFilesChange]);

  const processFile = useCallback((viewId: string, file: File) => {
    if (!isValidImageFile(file)) {
      setViewStates(prev => ({
        ...prev,
        [viewId]: { ...prev[viewId], error: 'Invalid file. Use JPG, PNG, or WebP (max 10MB).', loading: false },
      }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setViewStates(prev => ({
      ...prev,
      [viewId]: { file, preview, error: null, loading: false },
    }));
  }, []);

  const handleFileSelect = useCallback((viewId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processFile(viewId, file);
    }
    e.target.value = '';
  }, [processFile]);

  const handleDrag = useCallback((_viewId: string, e: React.DragEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((viewId: string, e: React.DragEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    let file: File | null = null;
    if ('dataTransfer' in e) {
      file = e.dataTransfer.files[0];
    } else if ('touches' in e && e.changedTouches.length > 0) {
      // Handle touch drop - get file from dataTransfer if available
      const touch = e.changedTouches[0];
      if (touch.target && (touch.target as HTMLInputElement).files) {
        const files = (touch.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          file = files[0];
        }
      }
    }
    
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processFile(viewId, file);
    }
  }, [processFile]);

  const removeFile = useCallback((viewId: string) => {
    const state = viewStates[viewId];
    if (state?.preview) URL.revokeObjectURL(state.preview);
    setViewStates(prev => ({
      ...prev,
      [viewId]: { file: null, preview: null, error: null, loading: false },
    }));
    setShowResults(false);
  }, [viewStates]);

  const triggerFileInput = useCallback((viewId: string) => {
    const ref = fileInputRefs.current[viewId];
    ref?.click();
  }, []);

  const allViewsUploaded = REQUIRED_VIEWS.every(v => viewStates[v.id]?.file !== null);

  // Convert detections to assessment format
  const convertToAssessment = useCallback((
    viewResults: Record<string, InferenceViewState>
  ) => {
    // Aggregate all detections
    const allDetections = Object.values(viewResults).flatMap(v => v.detections);
    const totalRawDetections = allDetections.length;

    // FILTER: Only keep valid damage classes for insurance assessment
    // Classes like 'crash', 'dislocated_part', 'no_part', 'rub' are NOT valid for insurance
    const validDetections = filterValidDetections(allDetections);
    const validDetectionCount = validDetections.length;

    // Count detections by class (using formatted names) - ONLY valid classes
    const detectionCounts: Record<string, { count: number; maxConfidence: number }> = {};
    validDetections.forEach(d => {
      const formattedName = formatDamageType(d.className);
      if (!detectionCounts[formattedName] || d.confidence > detectionCounts[formattedName].maxConfidence) {
        detectionCounts[formattedName] = { count: 1, maxConfidence: d.confidence };
      } else {
        detectionCounts[formattedName].count += 1;
      }
    });

    // Determine primary component (highest confidence damage type)
    const primaryComponentEntry = Object.entries(detectionCounts).reduce(
      (max, [type, data]) => data.maxConfidence > max[1].maxConfidence ? [type, data] : max,
      ['Unknown', { count: 0, maxConfidence: 0 }]
    );
    const primaryComponent = primaryComponentEntry[0];

    // Create damage summary with counts
    const damageSummary = Object.entries(detectionCounts)
      .map(([type, data]) => `${data.count} ${type}${data.count > 1 ? 's' : ''}`)
      .join(', ') || 'No damage detected';

    // Determine severity based on VALID detections AND max confidence
    const maxConfidence = validDetections.reduce((max, d) => d.confidence > max.confidence ? d : max, validDetections[0])?.confidence || 0;
    const uniqueDamageTypes = Object.keys(detectionCounts).length;
    
    let severity: 'minor' | 'moderate' | 'severe' | 'uncertain' = 'uncertain';
    if (validDetectionCount === 0) {
      severity = 'uncertain';
    } else if (maxConfidence >= 0.7 && (validDetectionCount >= 3 || uniqueDamageTypes >= 2)) {
      severity = 'severe';
    } else if (maxConfidence >= 0.5 || (validDetectionCount >= 2 && maxConfidence >= 0.4)) {
      severity = 'moderate';
    } else {
      severity = 'minor';
    }

    // Calculate costs based on severity and UNIQUE DAMAGE TYPES (not per detection)
    // This prevents 600+ detections from inflating costs
    type SeverityKey = 'minor' | 'moderate' | 'severe' | 'uncertain';
    const baseCost: Record<SeverityKey, { min: number; max: number }> = {
      minor: { min: 3000, max: 8000 },
      moderate: { min: 8000, max: 20000 },
      severe: { min: 20000, max: 50000 },
      uncertain: { min: 5000, max: 15000 },
    };

    // Multiplier based on number of UNIQUE damage types (1x, 1.5x, 2x, 2.5x)
    const typeMultiplier = Math.min(1 + (uniqueDamageTypes - 1) * 0.5, 2.5);
    
    // Additional factor for high detection count in same type (max 1.5x) - use VALID count only
    const detectionFactor = Math.min(1 + (validDetectionCount - uniqueDamageTypes) * 0.1, 1.5);

    const cost = baseCost[severity] || { min: 5000, max: 15000 };
    const totalMin = Math.round(cost.min * typeMultiplier * detectionFactor);
    const totalMax = Math.round(cost.max * typeMultiplier * detectionFactor);

    // Settlement calculation (75% of repair cost)
    const settlementOffer = Math.round((totalMin + totalMax) / 2 * 0.75);
    const settlementMin = Math.round(settlementOffer * 0.85);
    const settlementMax = Math.round(settlementOffer * 1.15);

    // Review flags - use VALID detection count
    const reviewFlags = [];
    if (validDetectionCount === 0) {
      reviewFlags.push({ code: 'NO_DETECTIONS', view: 'all', message: 'No valid damage detected in any view' });
    }
    if (validDetectionCount > 15) {
      reviewFlags.push({ code: 'HIGH_DETECTION_COUNT', view: 'all', message: 'Unusually high number of valid detections - verify image quality' });
    }
    if (Object.values(viewStates).some(v => !v.file)) {
      reviewFlags.push({ code: 'INCOMPLETE_VIEWS', view: 'all', message: 'Not all required views uploaded' });
    }

    const limitations = [
      'AI assessment based on 2D images only; 3D damage extent may vary',
      'Cost estimates are approximate; actual repair costs may vary by location and labor rates',
      'Hidden/internal damage not visible in photos may exist',
      'Final settlement subject to physical inspection and policy terms',
      'Only 6 validated damage classes (dent, scratch, crack, glass_shatter, lamp_broken, tire_flat) are used for cost estimation',
    ];

    return {
      views: viewResults,
      totalDetections: validDetectionCount, // Report only valid detections
      totalRawDetections: totalRawDetections, // Keep raw count for debugging
      primaryComponent,
      damageSummary,
      severity,
      estimatedRepairCostMin: totalMin,
      estimatedRepairCostMax: totalMax,
      settlementOffer,
      settlementMin,
      settlementMax,
      reviewRequired: reviewFlags.length > 0,
      reviewFlags,
      limitations,
    };
  }, [viewStates]);

  // Backend fallback inference
  const startBackendInference = useCallback(async () => {
    if (!allViewsUploaded) {
      onError('Please upload all four required views.');
      return;
    }

    setInferencing(true);
    setInferenceProgress(0);
    setInferenceStep(0);
    setShowResults(false);

    try {
      const formData = new FormData();
      REQUIRED_VIEWS.forEach(view => {
        const file = viewStates[view.id]?.file;
        if (file) {
          formData.append(view.id, file);
        }
      });
      formData.append('confidence_threshold', '0.25');
      formData.append('image_size', '640');

      // Show progress for backend call
      for (let i = 0; i < inferenceSteps.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        setInferenceStep(i + 1);
        setInferenceProgress(Math.round(((i + 1) / inferenceSteps.length) * 100));
      }

      const response = await fetch('http://localhost:8000/assess/four-view', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Backend inference failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const backendResult = await response.json();

      // Convert backend result to local format
      const results: Record<string, InferenceViewState> = {};
      REQUIRED_VIEWS.forEach(view => {
        const viewResult = backendResult.views[view.id];
        if (viewResult) {
          results[view.id] = {
            detections: viewResult.detections.map((det: any) => ({
              classId: 0,
              className: det.damage_type,
              confidence: det.confidence,
              bbox: det.bounding_box_xyxy,
            })),
            annotatedImage: viewResult.annotated_image_base64,
            processingTime: 0,
          };
        }
      });

      setInferenceResults(results);
      setShowResults(true);

      // Convert to assessment format and callback
      const assessment = convertToAssessment(results);
      onInferenceComplete(assessment);

    } catch (err: any) {
      console.error('Backend inference error:', err);
      onError(err.message || 'Backend inference failed. Please try again.');
    } finally {
      setInferencing(false);
    }
  }, [allViewsUploaded, viewStates, onError, onInferenceComplete]);

  const startInference = useCallback(async () => {
    if (!allViewsUploaded) {
      onError('Please upload all four required views.');
      return;
    }
    if (!modelReady) {
      if (modelError && useBackendFallback) {
        // Try backend fallback
        await startBackendInference();
        return;
      }
      onError(modelError || 'YOLO model not loaded. Please refresh and try again.');
      return;
    }

    setInferencing(true);
    setInferenceProgress(0);
    setInferenceStep(0);
    setShowResults(false);

    try {
      // Step 1: Model loading (already done, just show progress)
      for (let i = 0; i < inferenceSteps.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        setInferenceStep(i + 1);
        setInferenceProgress(Math.round(((i + 1) / inferenceSteps.length) * 100));
      }

      const results: Record<string, InferenceViewState> = {};

      // Process each view
      for (let i = 0; i < REQUIRED_VIEWS.length; i++) {
        const view = REQUIRED_VIEWS[i];
        const file = viewStates[view.id]?.file;
        
        if (!file) continue;

        // Update progress for current view
        setInferenceProgress(Math.round(((i + 0.5) / REQUIRED_VIEWS.length) * 100));

        // Run inference
        const result = await yoloRef.current!.inferFromFile(file);
        
        // Create annotated image (simplified - in production would draw boxes)
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.src = viewStates[view.id]!.preview!;
        await new Promise(resolve => { img.onload = resolve; });
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        
        // Draw detections
        (result.detections as Detection[]).forEach((det: Detection) => {
          const [x1, y1, x2, y2] = det.bbox;
          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          ctx.fillStyle = '#0ea5e9';
          ctx.font = '14px monospace';
          ctx.fillText(`${formatDamageType(det.className)} ${(det.confidence * 100).toFixed(1)}%`, x1, Math.max(y1 - 5, 15));
        });

        const annotatedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        results[view.id] = {
          detections: result.detections,
          annotatedImage: annotatedBase64,
          processingTime: result.processingTime,
        };
      }

      setInferenceResults(results);
      setShowResults(true);

      // Convert to assessment format and callback
      const assessment = convertToAssessment(results);
      onInferenceComplete(assessment);

    } catch (err: any) {
      console.error('Inference error:', err);
      onError(err.message || 'Local inference failed. Please try again.');
    } finally {
      setInferencing(false);
    }
  }, [allViewsUploaded, viewStates, onError, onInferenceComplete, onValidationError]);

  const resetAll = useCallback(() => {
    Object.values(viewStates).forEach(state => {
      if (state.preview) URL.revokeObjectURL(state.preview);
    });
    const initial: Record<string, ViewUploadState> = {};
    REQUIRED_VIEWS.forEach(view => {
      initial[view.id] = { file: null, preview: null, error: null, loading: false };
    });
    setViewStates(initial);
    setShowResults(false);
    setInferenceResults({});
  }, [viewStates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      yoloRef.current?.dispose();
    };
  }, []);

  return (
    <div className="space-y-6 animate-in" role="region" aria-label="Four-view local AI damage assessment">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-graphite-800 to-graphite-900 border border-border flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-tech opacity-30" />
            <Camera className="h-8 w-8 text-electric-400 relative z-10" aria-hidden="true" />
            <span className="absolute top-1 right-1 w-5 h-5 bg-success-500 text-[10px] font-bold rounded-full flex items-center justify-center">AI</span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-graphite-100 tracking-tight">Local AI Damage Screening</h2>
        <p className="mt-2 text-graphite-400 max-w-xl mx-auto">
          Upload four photos of the <strong>same damaged area</strong> from top, bottom, left, and right angles. 
          The local YOLO model runs entirely in your browser - no data leaves your device.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-4 mobile-flex-col mobile-gap-4">
        {REQUIRED_VIEWS.map((view, index) => (
          <motion.div
            key={view.id}
            className="flex items-center gap-2 flex-shrink-0"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <motion.div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-bold transition-all touch-target-comfortable',
                viewStates[view.id]?.file
                  ? 'bg-success-500/20 border border-success-500/30 text-success-400'
                  : 'bg-graphite-800/50 border border-graphite-700 text-graphite-500'
              )}
              animate={{ scale: viewStates[view.id]?.file ? [1, 1.1, 1] : 1 }}
              transition={{ duration: 0.5 }}
            >
              {viewStates[view.id]?.file ? <CheckCircle className="h-5 w-5" /> : view.icon}
            </motion.div>
            <span className={cn('text-xs font-medium', viewStates[view.id]?.file ? 'text-success-400' : 'text-graphite-500')}>
              {view.label}
            </span>
            {index < REQUIRED_VIEWS.length - 1 && (
              <motion.div
                className={cn('h-0.5 w-12 rounded-full mobile-w-8', viewStates[REQUIRED_VIEWS[index + 1].id]?.file ? 'bg-success-500' : 'bg-graphite-700')}
                initial={{ width: 0 }}
                animate={{ width: viewStates[REQUIRED_VIEWS[index + 1].id]?.file ? '3rem' : 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* Upload Grid */}
      <div className="grid gap-4 mobile-grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {REQUIRED_VIEWS.map((view) => {
          const state = viewStates[view.id];
          const isUploaded = !!state?.file;
          const hasError = !!state?.error;

          return (
            <motion.div
              key={view.id}
              className={cn(
                'relative rounded-2xl border-2 overflow-hidden transition-all duration-300',
                isUploaded
                  ? 'border-success-500/50 bg-success-500/5'
                  : hasError
                  ? 'border-danger-500/50 bg-danger-500/5'
                  : 'border-graphite-700 bg-graphite-900/50 hover:border-electric-500/50'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: REQUIRED_VIEWS.indexOf(view) * 0.1 }}
            >
              {/* View header */}
              <div className={cn('px-4 py-3 border-b', isUploaded ? 'border-success-500/20' : hasError ? 'border-danger-500/20' : 'border-graphite-700')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-lg', view.bgColor)}>
                      {view.icon}
                    </span>
                    <div>
                      <p className="font-medium text-graphite-100 text-sm mobile-text-sm">{view.label}</p>
                      <p className="text-xs text-graphite-500 mobile-text-xs">{view.desc}</p>
                    </div>
                  </div>
                  {isUploaded && (
                    <Badge variant="success" className="text-[10px] mobile-text-xs">LOCAL</Badge>
                  )}
                </div>
              </div>

              {/* Preview / Drop zone */}
              <div className="relative aspect-video min-h-[160px]">
                <input
                  ref={el => { fileInputRefs.current[view.id] = el; }}
                  type="file"
                  id={`local-${view.id}`}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleFileSelect(view.id, e)}
                  className="hidden"
                  disabled={disabled || inferencing}
                  aria-label={`Upload ${view.label.toLowerCase()}`}
                />

                {isUploaded && state.preview ? (
                  <>
                    <img
                      src={state.preview}
                      alt={`${view.label} preview`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                      <p className="text-xs text-white truncate">{state.file?.name}</p>
                      <p className="text-[10px] text-graphite-300">{state.file ? getFileSizeString(state.file.size) : ''}</p>
                    </div>
                    {/* Overlay buttons */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <button
                        onClick={() => removeFile(view.id)}
                        className="p-2 rounded bg-danger-500/90 text-white hover:bg-danger-500 touch-target-comfortable"
                        aria-label={`Remove ${view.label}`}
                        disabled={inferencing}
                      >
                        <X className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => state.preview && window.open(state.preview, '_blank')}
                        className="p-2 rounded bg-graphite-800/90 text-graphite-300 hover:bg-electric-500/20 hover:text-electric-400 touch-target-comfortable"
                        aria-label={`View ${view.label} full size`}
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label
                    htmlFor={`local-${view.id}`}
                    className="cursor-pointer block h-full w-full flex flex-col items-center justify-center gap-3 p-4 text-center"
                  >
                    <div className={cn(
                      'flex h-16 w-16 items-center justify-center rounded-xl transition-all',
                      hasError ? 'bg-danger-500/20 border border-danger-500/30' : 'bg-graphite-800/50 border border-graphite-700'
                    )}>
                      <Camera className={cn('h-8 w-8 transition-colors', hasError ? 'text-danger-400' : 'text-graphite-400')} aria-hidden="true" />
                    </div>
                    <div>
                      <p className={cn('text-sm font-medium transition-colors', hasError ? 'text-danger-400' : 'text-graphite-100')}>
                        {hasError ? 'Invalid file' : `Add ${view.label}`}
                      </p>
                      <p className="text-xs text-graphite-500">Click or drag & drop</p>
                    </div>
                    {hasError && (
                      <motion.p
                        className="text-xs text-danger-400 flex items-center justify-center gap-1 px-2 py-1 rounded bg-danger-500/10"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        role="alert"
                      >
                        <AlertCircle className="h-3 w-3" />
                        {state.error}
                      </motion.p>
                    )}
                  </label>
                )}

                {/* Drag overlay */}
                <div
                  className="absolute inset-0"
                  onDragEnter={e => handleDrag(view.id, e)}
                  onDragLeave={e => handleDrag(view.id, e)}
                  onDragOver={e => handleDrag(view.id, e)}
                  onDrop={e => handleDrop(view.id, e)}
                  onTouchStart={e => handleDrag(view.id, e as any)}
                  onTouchMove={e => handleDrag(view.id, e as any)}
                  onTouchEnd={e => handleDrop(view.id, e as any)}
                />
              </div>

              {/* Upload button for empty slots */}
              {!isUploaded && (
                <div className="px-4 pb-4">
                  <Button
                    variant="outline"
                    size="mobile"
                    className="w-full border-graphite-600 text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10"
                    onClick={() => triggerFileInput(view.id)}
                    disabled={disabled || inferencing}
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    Select File
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Inference Progress */}
      <AnimatePresence mode="wait">
        {inferencing && (
          <motion.div
            className="space-y-4 p-6 rounded-2xl border border-electric-500/20 bg-electric-500/5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-graphite-100 flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-electric-400 animate-spin" />
                Local AI Inference
              </h3>
              <span className="text-sm font-mono text-electric-400">{inferenceProgress}%</span>
            </div>
            <Progress value={inferenceProgress} className="h-2" max={100} />
            <p className="text-sm text-graphite-400 text-center">{inferenceSteps[inferenceStep] || inferenceSteps[inferenceSteps.length - 1]}</p>
            <div className="flex items-center justify-center gap-2 text-xs">
              {inferenceSteps.map((step, index) => (
                <motion.div
                  key={step}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                    index < inferenceStep ? 'bg-success-500 text-background' :
                    index === inferenceStep ? 'bg-electric-500 text-background animate-pulse' :
                    'bg-graphite-700 text-graphite-500'
                  )}
                >
                  {index < inferenceStep ? <Check className="h-3 w-3" /> : index + 1}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence mode="wait">
        {showResults && Object.keys(inferenceResults).length > 0 && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {/* Summary Card */}
            <Card className="border-2 border-success-500/50 bg-success-500/5">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-500/20 border border-success-500/30">
                      <CheckCircle className="h-6 w-6 text-success-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-graphite-100">Local Assessment Complete</h3>
                      <p className="text-sm text-graphite-400">All views processed on-device</p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-sm">ON-DEVICE AI</Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Valid Detections</p>
                    <p className="font-bold text-2xl text-electric-400">
                      {Object.values(inferenceResults).reduce((sum, v) => sum + v.detections.filter(d => VALID_DAMAGE_CLASSES_ARRAY.includes(d.className)).length, 0)}
                    </p>
                    <p className="text-xs text-graphite-500 mt-1">(6 insurance classes only)</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Raw Detections</p>
                    <p className="font-bold text-2xl text-graphite-400">
                      {Object.values(inferenceResults).reduce((sum, v) => sum + v.detections.length, 0)}
                    </p>
                    <p className="text-xs text-graphite-500 mt-1">(includes filtered classes)</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Processing Time</p>
                    <p className="font-bold text-xl text-graphite-100">
                      {Object.values(inferenceResults).reduce((sum, v) => sum + v.processingTime, 0).toFixed(0)}ms
                    </p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Model</p>
                    <p className="font-bold text-xl text-electric-400">YOLOv8 Local</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detection by View */}
            <div className="space-y-4">
              <h4 className="font-medium text-graphite-100 flex items-center gap-2">
                <Camera className="h-5 w-5 text-electric-400" />
                Damage Detection by View
              </h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {REQUIRED_VIEWS.map((view) => {
                  const result = inferenceResults[view.id];
                  const allDetections = result?.detections || [];
                  const validDetections = allDetections.filter(d => VALID_DAMAGE_CLASSES_ARRAY.includes(d.className));

                  return (
                    <Card key={view.id} className="border-graphite-700 bg-graphite-900/50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-graphite-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-lg', view.bgColor)}>
                            {view.icon}
                          </span>
                          <span className="font-medium text-graphite-100">{view.label}</span>
                        </div>
                        <Badge variant={validDetections.length > 0 ? 'default' : 'secondary'}>
                          {validDetections.length} valid / {allDetections.length} total
                        </Badge>
                      </div>
                      <div className="relative aspect-video overflow-hidden">
                        {result?.annotatedImage ? (
                          <img
                            src={`data:image/jpeg;base64,${result.annotatedImage}`}
                            alt={`${view.label} annotated`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-graphite-500">
                            No detections
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2 max-h-40 overflow-y-auto text-center">
                        {validDetections.length === 0 ? (
                          <p className="text-sm text-graphite-500">No valid damage detected</p>
                        ) : (
                          validDetections.map((det, i) => (
                            <div key={i} className="flex items-center justify-center gap-2 text-sm p-2 rounded bg-graphite-800/50">
                              <span className="text-graphite-300">{formatDamageType(det.className)}</span>
                              <span className="font-mono text-electric-400">{(det.confidence * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={resetAll}
                variant="outline"
                className="flex-1 gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                New Assessment
              </Button>
              <Button
                onClick={() => {
                  // Navigate to settlement - call onInferenceComplete directly
                  const assessment = convertToAssessment(inferenceResults);
                  onInferenceComplete(assessment);
                }}
                className="flex-1 gap-2 bg-gradient-to-r from-electric-500 to-cyan-500"
              >
                <Zap className="h-4 w-4" />
                Continue to Settlement
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready to Inference */}
      {allViewsUploaded && !inferencing && !showResults && (
        <div className="space-y-4">
          {/* Model Status */}
          <div className="flex items-center justify-between p-4 rounded-xl border bg-graphite-900/50">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                modelReady ? 'bg-success-500/20 border border-success-500/30' : 'bg-danger-500/20 border border-danger-500/30'
              )}>
                {modelReady ? (
                  <CheckCircle className="h-5 w-5 text-success-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-danger-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-graphite-100 text-sm">
                  {modelReady ? 'Local AI Model Ready' : 'Local AI Model Unavailable'}
                </p>
                <p className="text-xs text-graphite-500">
                  {modelReady 
                    ? 'YOLOv8 loaded and ready for on-device inference'
                    : modelError 
                      ? `Error: ${modelError}. Using backend fallback.`
                      : 'Loading model...'}
                </p>
              </div>
            </div>
            {modelError && useBackendFallback && (
              <Badge variant="secondary" className="text-[10px]">BACKEND FALLBACK</Badge>
            )}
          </div>

          {/* Run Button */}
          <motion.button
            onClick={startInference}
            disabled={disabled || (!modelReady && !useBackendFallback)}
            className="w-full gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-electric-500 to-cyan-500 text-background font-semibold shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 transition-all disabled:opacity-50"
            whileHover={{ y: -2, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.5)' }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Zap className="h-5 w-5" />
            {modelReady 
              ? 'Run Local AI Assessment on Four Views'
              : useBackendFallback
                ? 'Run Assessment via Backend (Local model unavailable)'
                : 'Model not ready'}
          </motion.button>
        </div>
      )}

      {!allViewsUploaded && !inferencing && !showResults && (
        <div className="text-center text-graphite-500 py-4">
          <p>Upload all four views to enable local AI assessment</p>
          <p className="text-sm mt-1">
            {REQUIRED_VIEWS.filter(v => viewStates[v.id]?.file).length}/4 views uploaded
          </p>
        </div>
      )}
    </div>
  );
}
