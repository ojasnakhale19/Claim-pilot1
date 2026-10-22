import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, Eye, Zap, AlertCircle, CheckCircle, RotateCcw, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { cn, isValidImageFile, getFileSizeString } from '../../lib/utils';
import {
  assessDirect,
  type DirectAssessmentResponse,
} from '../../lib/utils';

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

interface FourViewUploadProps {
  onAssessmentComplete: (result: DirectAssessmentResponse) => void;
  onError: (error: string) => void;
  onValidationError: (validation: any) => void;
  onFilesChange?: (files: Record<string, File | null>) => void;
  disabled?: boolean;
  confidenceThreshold?: number;
  imageSize?: number;
  vehicleInfo?: {
    company: string;
    model: string;
    year: string;
    causeOfDamage: string;
  };
}

export function FourViewUpload({
  onAssessmentComplete,
  onError,
  onValidationError,
  onFilesChange,
  disabled = false,
  vehicleInfo,
}: FourViewUploadProps) {
  const [viewStates, setViewStates] = useState<Record<string, ViewUploadState>>({});
  const [assessing, setAssessing] = useState(false);
  const [assessmentProgress, setAssessmentProgress] = useState(0);
  const [assessmentStep, setAssessmentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<DirectAssessmentResponse | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const assessmentSteps = [
    'Validating four views…',
    'Loading YOLO damage model…',
    'Running inference on all views…',
    'Generating evidence report…',
  ];

  // Initialize view states
  useEffect(() => {
    const initial: Record<string, ViewUploadState> = {};
    REQUIRED_VIEWS.forEach(view => {
      initial[view.id] = { file: null, preview: null, error: null, loading: false };
    });
    setViewStates(initial);
  }, []);

  const processFile = useCallback((viewId: string, file: File) => {
    if (!isValidImageFile(file)) {
      setViewStates(prev => ({
        ...prev,
        [viewId]: { ...prev[viewId], error: 'Invalid file. Use JPG, PNG, or WebP (max 10MB).', loading: false },
      }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setViewStates(prev => {
      const newState = {
        ...prev,
        [viewId]: { file, preview, error: null, loading: false },
      };
      // Notify parent of file changes
      const files: Record<string, File | null> = {};
      REQUIRED_VIEWS.forEach(v => {
        files[v.id] = newState[v.id]?.file ?? null;
      });
      onFilesChange?.(files);
      return newState;
    });
  }, [onFilesChange]);

  const handleFileSelect = useCallback((viewId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processFile(viewId, file);
    }
    e.target.value = '';
  }, [processFile]);

  const handleDrag = useCallback((_viewId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((viewId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processFile(viewId, file);
    }
  }, [processFile]);

  const removeFile = useCallback((viewId: string) => {
    const state = viewStates[viewId];
    if (state?.preview) URL.revokeObjectURL(state.preview);
    setViewStates(prev => {
      const newState = {
        ...prev,
        [viewId]: { file: null, preview: null, error: null, loading: false },
      };
      // Notify parent of file changes
      const files: Record<string, File | null> = {};
      REQUIRED_VIEWS.forEach(v => {
        files[v.id] = newState[v.id]?.file ?? null;
      });
      onFilesChange?.(files);
      return newState;
    });
    setShowResults(false);
    setAssessmentResult(null);
    setValidationResult(null);
  }, [viewStates, onFilesChange]);

  const triggerFileInput = useCallback((viewId: string) => {
    fileInputRefs.current[viewId]?.click();
  }, []);

  const allViewsUploaded = REQUIRED_VIEWS.every(v => viewStates[v.id]?.file !== null);

  const startAssessment = useCallback(async () => {
    console.log('[FourViewUpload] startAssessment called', { allViewsUploaded, assessing, disabled });
    if (!allViewsUploaded) {
      console.log('[FourViewUpload] Not all views uploaded');
      onError('Please upload all four required views.');
      return;
    }

    console.log('[FourViewUpload] Starting assessment...');
    setAssessing(true);
    setAssessmentProgress(0);
    setAssessmentStep(0);
    setShowResults(false);
    setAssessmentResult(null);
    setValidationResult(null);

    try {
      // Step 1: Validation
      console.log('[FourViewUpload] Starting validation steps...');
      for (let i = 0; i < assessmentSteps.length; i++) {
        await new Promise(r => setTimeout(r, 800));
        setAssessmentStep(i + 1);
        setAssessmentProgress(Math.round(((i + 1) / assessmentSteps.length) * 100));
        console.log(`[FourViewUpload] Step ${i + 1}: ${assessmentSteps[i]}`);
      }

      const request = {
        top: viewStates.top.file!,
        bottom: viewStates.bottom.file!,
        left: viewStates.left.file!,
        right: viewStates.right.file!,
        vehicle_make: vehicleInfo?.company || '',
        vehicle_model: vehicleInfo?.model || '',
        vehicle_year: vehicleInfo?.year || '',
        cause_of_damage: vehicleInfo?.causeOfDamage || '',
      };
      console.log('[FourViewUpload] Calling /assess/direct', {
        make: request.vehicle_make,
        model: request.vehicle_model,
        cause: request.cause_of_damage,
      });

      const result = await assessDirect(request);
      console.log('[FourViewUpload] Direct OpenAI assessment received:', {
        status: result.assessment_status,
        mode: result.execution_mode,
        items: result.damage_items?.length,
        severity: result.overall_severity,
      });
      
      setAssessmentResult(result);
      setValidationResult(result.validation_warnings ?? []);
      setShowResults(true);
      onAssessmentComplete(result);
    } catch (err: any) {
      // Parse structured backend error if available
      let errMessage = err.message || 'Assessment failed. Please try again.';
      const errDetail = (() => { try { return JSON.parse(err.message); } catch { return null; } })();
      if (errDetail?.error === 'openai_not_configured') {
        errMessage = 'OpenAI API key is not configured. Please add OPENAI_API_KEY to backend/.env and restart the backend.';
      } else if (errDetail?.error === 'openai_assessment_failed') {
        errMessage = `OpenAI assessment failed: ${errDetail.message}`;
      } else if (errMessage.includes('validation_failed') || err.message?.includes('400')) {
        try {
          const errorData = JSON.parse(err.message.replace(/^HTTP 400: /, ''));
          setValidationResult(errorData.validation);
          onValidationError(errorData.validation);
          return;
        } catch {
          // fall through
        }
      }
      onError(errMessage);
    } finally {
      setAssessing(false);
    }
  }, [allViewsUploaded, viewStates, vehicleInfo, onAssessmentComplete, onError, onValidationError]);

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
    setAssessmentResult(null);
    setValidationResult(null);
  }, [viewStates]);

  const getCompletionCount = () => REQUIRED_VIEWS.filter(v => viewStates[v.id]?.file).length;

  return (
    <div className="space-y-6 animate-in" role="region" aria-label="Four-view damage assessment upload">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-graphite-800 to-graphite-900 border border-border flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-tech opacity-30" />
            <Camera className="h-8 w-8 text-electric-400 relative z-10" aria-hidden="true" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-graphite-100 tracking-tight">Four-View Damage Screening</h2>
        <p className="mt-2 text-graphite-400 max-w-xl mx-auto">
          Upload four photos of the <strong>same damaged area</strong> from top, bottom, left, and right angles. 
          The AI will validate image quality and run damage detection on each view.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {REQUIRED_VIEWS.map((view, index) => (
          <motion.div
            key={view.id}
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <motion.div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-bold transition-all',
                viewStates[view.id]?.file
                  ? 'bg-success-500/20 border border-success-500/30 text-success-400'
                  : 'bg-graphite-800/50 border border-graphite-700 text-graphite-500'
              )}
              animate={{ scale: viewStates[view.id]?.file ? [1, 1.1, 1] : 1 }}
              transition={{ duration: 0.5 }}
            >
              {viewStates[view.id]?.file ? <CheckCircle className="h-5 w-5" /> : view.icon}
            </motion.div>
            <span className={cn('text-xs font-medium hidden sm:block', viewStates[view.id]?.file ? 'text-success-400' : 'text-graphite-500')}>
              {view.label}
            </span>
            {index < REQUIRED_VIEWS.length - 1 && (
              <motion.div
                className={cn('h-0.5 w-12 rounded-full', viewStates[REQUIRED_VIEWS[index + 1].id]?.file ? 'bg-success-500' : 'bg-graphite-700')}
                initial={{ width: 0 }}
                animate={{ width: viewStates[REQUIRED_VIEWS[index + 1].id]?.file ? '3rem' : 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* Upload Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                      <p className="font-medium text-graphite-100 text-sm">{view.label}</p>
                      <p className="text-xs text-graphite-500">{view.desc}</p>
                    </div>
                  </div>
                  {isUploaded && (
                    <Badge variant="success" className="text-[10px]">UPLOADED</Badge>
                  )}
                </div>
              </div>

              {/* Preview / Drop zone */}
              <div className="relative aspect-video min-h-[160px]">
                <input
                  ref={el => { fileInputRefs.current[view.id] = el; }}
                  type="file"
                  id={`fourview-${view.id}`}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleFileSelect(view.id, e)}
                  className="hidden"
                  disabled={disabled || assessing}
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
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => removeFile(view.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-danger-500/90 text-white hover:bg-danger-500"
                        aria-label={`Remove ${view.label}`}
                        disabled={assessing}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => state.preview && window.open(state.preview, '_blank')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-graphite-800/90 text-graphite-300 hover:bg-electric-500/20 hover:text-electric-400"
                        aria-label={`View ${view.label} full size`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label
                    htmlFor={`fourview-${view.id}`}
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
                />
              </div>

              {/* Upload button for empty slots */}
              {!isUploaded && (
                <div className="px-4 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-graphite-600 text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10"
                    onClick={() => triggerFileInput(view.id)}
                    disabled={disabled || assessing}
                  >
                    <Camera className="h-3.5 w-3.5 mr-1" />
                    Select File
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Assessment Progress */}
      <AnimatePresence mode="wait">
        {assessing && (
          <motion.div
            className="space-y-4 p-6 rounded-2xl border border-electric-500/20 bg-electric-500/5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-graphite-100 flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-electric-400 animate-spin" />
                AI Assessment in Progress
              </h3>
              <span className="text-sm font-mono text-electric-400">{assessmentProgress}%</span>
            </div>
            <Progress value={assessmentProgress} className="h-2" max={100} />
            <p className="text-sm text-graphite-400 text-center">{assessmentSteps[assessmentStep] || assessmentSteps[assessmentSteps.length - 1]}</p>
            <div className="flex items-center justify-center gap-2 text-xs">
              {assessmentSteps.map((step, index) => (
                <motion.div
                  key={step}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                    index < assessmentStep ? 'bg-success-500 text-background' :
                    index === assessmentStep ? 'bg-electric-500 text-background animate-pulse' :
                    'bg-graphite-700 text-graphite-500'
                  )}
                >
                  {index < assessmentStep ? <Check className="h-3 w-3" /> : index + 1}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence mode="wait">
        {showResults && assessmentResult && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {/* Summary Card */}
            <Card className={cn(
              'border-2',
              assessmentResult.human_review_required ? 'border-amber-500/50 bg-amber-500/5' : 'border-success-500/50 bg-success-500/5'
            )}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      assessmentResult.human_review_required ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-success-500/20 border border-success-500/30'
                    )}>
                      {assessmentResult.human_review_required ? (
                        <AlertCircle className="h-6 w-6 text-amber-400" />
                      ) : (
                        <CheckCircle className="h-6 w-6 text-success-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-graphite-100">
                        {assessmentResult.human_review_required ? 'Review Recommended' : 'OpenAI Vision Assessment Complete'}
                      </h3>
                      <p className="text-sm text-graphite-400">
                        {assessmentResult.damage_summary}
                      </p>
                    </div>
                  </div>
                  <Badge variant={assessmentResult.human_review_required ? 'warning' : 'success'} className="text-sm">
                    {assessmentResult.overall_severity.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Primary Component</p>
                    <p className="font-medium text-graphite-100">{assessmentResult.primary_component}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Unique Components</p>
                    <p className="font-bold text-2xl text-electric-400">{assessmentResult.total_unique_components}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Est. Repair Cost</p>
                    <p className="font-bold text-xl text-graphite-100">
                      ₹{assessmentResult.estimated_repair_cost_min.toLocaleString()}–{assessmentResult.estimated_repair_cost_max.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Settlement Offer</p>
                    <p className="font-bold text-xl text-success-400">₹{assessmentResult.settlement_offer.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Damage Items List */}
            <div className="space-y-4">
              <h4 className="font-medium text-graphite-100 flex items-center gap-2">
                <Camera className="h-5 w-5 text-electric-400" />
                Evidence-Grounded Damage Items ({assessmentResult.damage_items.length})
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {assessmentResult.damage_items.length === 0 ? (
                  <p className="text-sm text-graphite-500">No damage detected in submitted images</p>
                ) : (
                  assessmentResult.damage_items.map((item, i) => (
                    <Card key={item.itemId || i} className="border-graphite-700 bg-graphite-900/50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-graphite-100">{item.component}</span>
                        <Badge variant={item.severity === 'severe' ? 'destructive' : item.severity === 'moderate' ? 'warning' : 'default'}>
                          {item.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-graphite-400">{item.evidenceDescription}</p>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-graphite-800">
                        <span className="text-electric-400 font-mono">₹{item.costEstimateMin.toLocaleString()}–₹{item.costEstimateMax.toLocaleString()}</span>
                        <span className="text-graphite-500">Views: {(item.evidenceViews || []).join(', ')}</span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Review Flags */}
            {assessmentResult.human_review_required && assessmentResult.human_review_reasons.length > 0 && (
              <Card className="border-amber-500/50 bg-amber-500/5">
                <CardContent className="pt-6">
                  <h4 className="font-medium text-amber-400 flex items-center gap-2 mb-3">
                    <AlertCircle className="h-5 w-5" />
                    Review Flags
                  </h4>
                  <div className="space-y-2">
                    {assessmentResult.human_review_reasons.map((reason, i) => (
                      <div key={i} className="text-sm text-graphite-300 p-3 rounded bg-graphite-900/50 border border-amber-500/20">
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Limitations */}
            <Card className="border-graphite-700 bg-graphite-900/50">
              <CardContent className="pt-6">
                <h4 className="font-medium text-graphite-100 flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-electric-400" />
                  Important Limitations
                </h4>
                <ul className="space-y-2 text-sm text-graphite-400">
                  {assessmentResult.limitations.map((limitation, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-electric-400 font-mono">›</span>
                      <span>{limitation}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

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
                  // Navigate to chat/negotiation
                  window.dispatchEvent(new CustomEvent('claimpilot:assessment-complete', { detail: assessmentResult }));
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

      {/* Validation Error Display */}
      {validationResult && !showResults && validationResult.blockers?.length > 0 && (
        <motion.div
          className="rounded-xl border-2 border-danger-500/50 bg-danger-500/5 p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-danger-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-danger-400">Validation Failed</h4>
              <p className="mt-1 text-sm text-graphite-400">Please fix the following issues and re-upload:</p>
              <ul className="mt-2 space-y-1 text-sm text-graphite-300">
                {validationResult.blockers.map((blocker: any, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-danger-400 font-mono">›</span>
                    <span>{blocker.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* Upload Complete - Ready to Assess */}
      {allViewsUploaded && !assessing && !showResults && (
        <motion.button
          onClick={startAssessment}
          disabled={disabled}
          className="w-full gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-electric-500 to-cyan-500 text-background font-semibold shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 transition-all disabled:opacity-50"
          whileHover={{ y: -2, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.5)' }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Zap className="h-5 w-5" />
          Run AI Assessment on Four Views
        </motion.button>
      )}

      {!allViewsUploaded && !assessing && !showResults && (
        <div className="text-center text-graphite-500 py-4">
          <p>Upload all four views to enable AI assessment</p>
          <p className="text-sm mt-1">{getCompletionCount()}/4 views uploaded</p>
        </div>
      )}
    </div>
  );
}