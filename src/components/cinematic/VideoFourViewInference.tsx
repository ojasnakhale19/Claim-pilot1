import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, Eye, Zap, AlertCircle, CheckCircle, Video, RotateCcw, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { cn, isValidImageFile, isValidVideoFile, getFileSizeString, API_BASE_URL, type VideoFourViewAssessmentResponse } from '../../lib/utils';

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

interface VideoUploadState {
  file: File | null;
  preview: string | null;
  error: string | null;
  loading: boolean;
  duration: number | null;
}

interface FrameExtractionProgress {
  stage: 'validating' | 'extracting' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  framesExtracted: number;
  totalFrames: number;
}

interface VideoFourViewInferenceProps {
  onInferenceComplete: (result: VideoFourViewAssessmentResponse) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  vehicleInfo?: {
    company: string;
    model: string;
    year: string;
    causeOfDamage: string;
  };
}

export function VideoFourViewInference({
  onInferenceComplete,
  onError,
  disabled = false,
  vehicleInfo,
}: VideoFourViewInferenceProps) {
  const [viewStates, setViewStates] = useState<Record<string, ViewUploadState>>({});
  const [videoState, setVideoState] = useState<VideoUploadState>({
    file: null,
    preview: null,
    error: null,
    loading: false,
    duration: null,
  });
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [frameExtractionProgress, setFrameExtractionProgress] = useState<FrameExtractionProgress>({
    stage: 'validating',
    progress: 0,
    message: '',
    framesExtracted: 0,
    totalFrames: 10,
  });
  const [showResults, setShowResults] = useState(false);
  const [inferenceResults, setInferenceResults] = useState<any>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRef = useRef<HTMLInputElement>(null);

  const extractionSteps = [
    'Validating video duration (8-10s)...',
    'Extracting 10 representative frames...',
    'Running damage detection on frames...',
    'Processing 4 view photos...',
    'Aggregating collective assessment...',
  ];

  // Initialize view states
  useEffect(() => {
    const initial: Record<string, ViewUploadState> = {};
    REQUIRED_VIEWS.forEach(view => {
      initial[view.id] = { file: null, preview: null, error: null, loading: false };
    });
    setViewStates(initial);
  }, []);

  const processViewFile = useCallback((viewId: string, file: File) => {
    if (!isValidImageFile(file)) {
      setViewStates(prev => ({
        ...prev,
        [viewId]: { ...prev[viewId], error: 'Invalid file. Use JPG, PNG, or WebP (max 15MB).', loading: false },
      }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setViewStates(prev => ({
      ...prev,
      [viewId]: { file, preview, error: null, loading: false },
    }));
  }, []);

  const processVideoFile = useCallback((file: File) => {
    if (!isValidVideoFile(file)) {
      setVideoState(prev => ({
        ...prev,
        error: 'Invalid file. Use MP4 or MOV (max 100MB).',
        loading: false,
      }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setVideoState(prev => ({
      ...prev,
      file,
      preview,
      error: null,
      loading: true,
      duration: null,
    }));

    // Check video duration using video element
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(preview);
      setVideoState(prev => ({
        ...prev,
        loading: false,
        duration,
        preview: URL.createObjectURL(file),
      }));
      video.remove();
    };
    video.onerror = () => {
      URL.revokeObjectURL(preview);
      setVideoState(prev => ({
        ...prev,
        error: 'Could not read video metadata.',
        loading: false,
      }));
      video.remove();
    };
    video.src = preview;
  }, []);

  const handleViewFileSelect = useCallback((viewId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processViewFile(viewId, file);
    }
    e.target.value = '';
  }, [processViewFile]);

  const handleVideoFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoState(prev => ({ ...prev, loading: true }));
      processVideoFile(file);
    }
    e.target.value = '';
  }, [processVideoFile]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleViewDrop = useCallback((viewId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      setViewStates(prev => ({ ...prev, [viewId]: { ...prev[viewId], loading: true } }));
      processViewFile(viewId, file);
    }
  }, [processViewFile]);

  const handleVideoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      setVideoState(prev => ({ ...prev, loading: true }));
      processVideoFile(file);
    }
  }, [processVideoFile]);

  const removeViewFile = useCallback((viewId: string) => {
    const state = viewStates[viewId];
    if (state?.preview) URL.revokeObjectURL(state.preview);
    setViewStates(prev => ({
      ...prev,
      [viewId]: { file: null, preview: null, error: null, loading: false },
    }));
  }, [viewStates]);

  const removeVideoFile = useCallback(() => {
    if (videoState.preview) URL.revokeObjectURL(videoState.preview);
    setVideoState({
      file: null,
      preview: null,
      error: null,
      loading: false,
      duration: null,
    });
  }, [videoState]);

  const triggerViewFileInput = useCallback((viewId: string) => {
    const ref = fileInputRefs.current[viewId];
    ref?.click();
  }, []);

  const triggerVideoFileInput = useCallback(() => {
    videoInputRef.current?.click();
  }, []);

  const allViewsUploaded = REQUIRED_VIEWS.every(v => viewStates[v.id]?.file !== null);
  const videoUploaded = !!videoState.file;
  const allUploaded = allViewsUploaded && videoUploaded;

  // Video duration validation
  const videoDurationValid = videoState.duration !== null && videoState.duration >= 8 && videoState.duration <= 10;
  const videoDurationError = videoState.duration !== null && (videoState.duration < 8 || videoState.duration > 10);

  const startInference = useCallback(async () => {
    if (!allViewsUploaded) {
      onError('Please upload all four required view photos (top, bottom, left, right).');
      return;
    }
    if (!videoUploaded) {
      onError('Please upload a video walkaround (8-10 seconds).');
      return;
    }
    if (!videoDurationValid) {
      onError('Video must be between 8 and 10 seconds long.');
      return;
    }

    setExtractingFrames(true);
    setFrameExtractionProgress({
      stage: 'validating',
      progress: 0,
      message: extractionSteps[0],
      framesExtracted: 0,
      totalFrames: 10,
    });

    try {
      // Simulate progress updates
      for (let i = 0; i < extractionSteps.length; i++) {
        await new Promise(r => setTimeout(r, 800));
        setFrameExtractionProgress(prev => ({
          ...prev,
          stage: i === extractionSteps.length - 1 ? 'complete' : prev.stage,
          progress: Math.round(((i + 1) / extractionSteps.length) * 100),
          message: extractionSteps[i],
          framesExtracted: i >= 1 ? Math.min(10, Math.round(10 * (i / (extractionSteps.length - 1)))) : 0,
        }));
      }

      // Prepare FormData
      const formData = new FormData();
      formData.append('video', videoState.file!);
      REQUIRED_VIEWS.forEach(view => {
        const file = viewStates[view.id]?.file;
        if (file) formData.append(view.id, file);
      });
      formData.append('confidence_threshold', '0.25');
      formData.append('image_size', '640');
      if (vehicleInfo?.company) formData.append('vehicle_make', vehicleInfo.company);
      if (vehicleInfo?.model) formData.append('vehicle_model', vehicleInfo.model);
      if (vehicleInfo?.year) formData.append('vehicle_year', vehicleInfo.year);
      if (vehicleInfo?.causeOfDamage) formData.append('cause_of_damage', vehicleInfo.causeOfDamage);

      setFrameExtractionProgress(prev => ({ ...prev, message: 'Sending to backend...', progress: 95 }));

      const response = await fetch(`${API_BASE_URL}/assess/video-four-view`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Assessment failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setInferenceResults(result);
      setShowResults(true);
      onInferenceComplete(result);

    } catch (err: any) {
      console.error('Inference error:', err);
      setFrameExtractionProgress(prev => ({ ...prev, stage: 'error', message: err.message || 'Assessment failed' }));
      onError(err.message || 'Assessment failed. Please try again.');
    } finally {
      setExtractingFrames(false);
      setTimeout(() => setFrameExtractionProgress({
        stage: 'validating',
        progress: 0,
        message: '',
        framesExtracted: 0,
        totalFrames: 10,
      }), 2000);
    }
  }, [allViewsUploaded, videoUploaded, videoDurationValid, viewStates, videoState, onError, onInferenceComplete]);

  const resetAll = useCallback(() => {
    Object.values(viewStates).forEach(state => {
      if (state.preview) URL.revokeObjectURL(state.preview);
    });
    if (videoState.preview) URL.revokeObjectURL(videoState.preview);
    
    const initialViews: Record<string, ViewUploadState> = {};
    REQUIRED_VIEWS.forEach(view => {
      initialViews[view.id] = { file: null, preview: null, error: null, loading: false };
    });
    setViewStates(initialViews);
    setVideoState({
      file: null,
      preview: null,
      error: null,
      loading: false,
      duration: null,
    });
    setShowResults(false);
    setInferenceResults(null);
  }, [viewStates, videoState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(viewStates).forEach(state => {
        if (state.preview) URL.revokeObjectURL(state.preview);
      });
      if (videoState.preview) URL.revokeObjectURL(videoState.preview);
    };
  }, [viewStates, videoState]);

  return (
    <div className="space-y-6 animate-in" role="region" aria-label="Video + Four-view damage assessment">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-graphite-800 to-graphite-900 border border-border flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-tech opacity-30" />
            <Video className="h-8 w-8 text-electric-400 relative z-10" aria-hidden="true" />
            <span className="absolute top-1 right-1 w-5 h-5 bg-success-500 text-[10px] font-bold rounded-full flex items-center justify-center">14</span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-graphite-100 tracking-tight">Video + Four-View Assessment</h2>
        <p className="mt-2 text-graphite-400 max-w-xl mx-auto">
          Upload a <strong>8-10 second video walkaround</strong> and <strong>4 required photos</strong> (top, bottom, left, right).
          The system extracts 10 frames from video + 4 photos = 14 images for collective AI assessment.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <motion.div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-bold transition-all',
              videoUploaded && videoDurationValid
                ? 'bg-success-500/20 border border-success-500/30 text-success-400'
                : videoUploaded && videoDurationError
                ? 'bg-danger-500/20 border border-danger-500/30 text-danger-400'
                : videoUploaded
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                : 'bg-graphite-800/50 border border-graphite-700 text-graphite-500'
            )}
            animate={{ scale: videoUploaded ? [1, 1.1, 1] : 1 }}
            transition={{ duration: 0.5 }}
          >
            {videoUploaded && videoDurationValid ? <CheckCircle className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </motion.div>
          <span className={cn('text-xs font-medium hidden sm:block', videoUploaded && videoDurationValid ? 'text-success-400' : 'text-graphite-500')}>
            Video ({videoState.duration ? videoState.duration.toFixed(1) + 's' : 'required'})
          </span>
        </div>
        {REQUIRED_VIEWS.map((view, index) => (
          <motion.div key={view.id} className="flex items-center gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
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

      {/* Video Upload */}
      <motion.div
        className={cn(
          'relative rounded-2xl border-2 overflow-hidden transition-all duration-300',
          videoState.file
            ? videoDurationValid
              ? 'border-success-500/50 bg-success-500/5'
              : 'border-danger-500/50 bg-danger-500/5'
            : videoState.error
            ? 'border-danger-500/50 bg-danger-500/5'
            : 'border-graphite-700 bg-graphite-900/50 hover:border-electric-500/50'
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Video header */}
        <div className={cn('px-4 py-3 border-b', videoState.file ? 'border-success-500/20' : videoState.error ? 'border-danger-500/20' : 'border-graphite-700')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-lg', videoDurationValid ? 'bg-green-500/10' : 'bg-purple-500/10')}>
                <Video className={cn('h-4 w-4', videoDurationValid ? 'text-green-400' : 'text-purple-400')} aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-graphite-100 text-sm">Video Walkaround</p>
                <p className="text-xs text-graphite-500">8-10 second walkaround showing all sides + license plate</p>
              </div>
            </div>
            {videoState.file && (
              <div className="flex items-center gap-2">
                {videoDurationValid && <Badge variant="success" className="text-[10px]">VALID DURATION</Badge>}
                {videoDurationError && <Badge variant="destructive" className="text-[10px]">INVALID DURATION</Badge>}
                {videoState.duration !== null && !videoDurationValid && !videoDurationError && <Badge variant="secondary" className="text-[10px]">CHECKING...</Badge>}
              </div>
            )}
          </div>
        </div>

        {/* Video Preview / Drop zone */}
        <div className="relative aspect-video min-h-[200px]">
          <input
            ref={videoInputRef}
            type="file"
            id="video-upload"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
            onChange={e => handleVideoFileSelect(e)}
            className="hidden"
            disabled={disabled || extractingFrames}
            aria-label="Upload video walkaround"
          />

          {videoState.file && videoState.preview ? (
            <>
              <video
                src={videoState.preview}
                className="w-full h-full object-cover"
                muted
                playsInline
                controls
              />
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white truncate max-w-xs">{videoState.file?.name}</span>
                  <span className="text-[10px] text-graphite-300">{videoState.file ? getFileSizeString(videoState.file.size) : ''}</span>
                  {videoState.duration && (
                    <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded', videoDurationValid ? 'bg-success-500/20 text-success-400' : 'bg-danger-500/20 text-danger-400')}>
                      {videoState.duration.toFixed(1)}s {videoDurationValid ? '✓' : '✗ (8-10s required)'}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={removeVideoFile}
                    className="p-1.5 rounded bg-danger-500/90 text-white hover:bg-danger-500"
                    aria-label="Remove video"
                    disabled={extractingFrames}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => videoState.preview && window.open(videoState.preview, '_blank')}
                    className="p-1.5 rounded bg-graphite-800/90 text-graphite-300 hover:bg-electric-500/20 hover:text-electric-400"
                    aria-label="View video full size"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <label
              htmlFor="video-upload"
              className="cursor-pointer block h-full w-full flex flex-col items-center justify-center gap-3 p-4 text-center"
            >
              <div className={cn(
                'flex h-20 w-20 items-center justify-center rounded-xl transition-all',
                videoState.error ? 'bg-danger-500/20 border border-danger-500/30' : 'bg-graphite-800/50 border border-graphite-700'
              )}>
                <Video className={cn('h-10 w-10 transition-colors', videoState.error ? 'text-danger-400' : 'text-graphite-400')} aria-hidden="true" />
              </div>
              <div>
                <p className={cn('text-sm font-medium transition-colors', videoState.error ? 'text-danger-400' : 'text-graphite-100')}>
                  {videoState.error ? 'Invalid video' : 'Add Video Walkaround'}
                </p>
                <p className="text-xs text-graphite-500">Click or drag & drop · 8-10 seconds · MP4, MOV</p>
              </div>
              {videoState.error && (
                <motion.p
                  className="text-xs text-danger-400 flex items-center justify-center gap-1 px-2 py-1 rounded bg-danger-500/10"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                >
                  <AlertCircle className="h-3 w-3" />
                  {videoState.error}
                </motion.p>
              )}
            </label>
          )}

          {/* Drag overlay */}
          <div
            className="absolute inset-0"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleVideoDrop}
          />
        </div>

        {/* Duration warning */}
        {videoDurationError && (
          <motion.div
            className="px-4 py-3 text-center bg-danger-500/10 border-t border-danger-500/20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle className="h-4 w-4 text-danger-400 inline-block mr-1" />
            Video must be 8-10 seconds. Current: {videoState.duration?.toFixed(1)}s
          </motion.div>
        )}

        {/* Upload button for empty slot */}
        {!videoState.file && (
          <div className="px-4 pb-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-graphite-600 text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10"
              onClick={triggerVideoFileInput}
              disabled={disabled || extractingFrames}
            >
              <Video className="h-3.5 w-3.5 mr-1" />
              Select Video File
            </Button>
          </div>
        )}
      </motion.div>

      {/* View Upload Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
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
                    {isUploaded && <Badge variant="success" className="text-[10px]">UPLOADED</Badge>}
                  </div>
                </div>

                {/* Preview / Drop zone */}
                <div className="relative aspect-video min-h-[160px]">
                  <input
                    ref={el => { fileInputRefs.current[view.id] = el; }}
                    type="file"
                    id={`v4v-${view.id}`}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => handleViewFileSelect(view.id, e)}
                    className="hidden"
                    disabled={disabled || extractingFrames}
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
                          onClick={() => removeViewFile(view.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-danger-500/90 text-white hover:bg-danger-500"
                          aria-label={`Remove ${view.label}`}
                          disabled={extractingFrames}
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
                      htmlFor={`v4v-${view.id}`}
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
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={e => handleViewDrop(view.id, e)}
                  />
                </div>

                {/* Upload button for empty slots */}
                {!isUploaded && (
                  <div className="px-4 pb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-graphite-600 text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10"
                      onClick={() => triggerViewFileInput(view.id)}
                      disabled={disabled || extractingFrames}
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
      </motion.div>

      {/* Frame Extraction Progress */}
      <AnimatePresence mode="wait">
        {extractingFrames && (
          <motion.div
            className="space-y-4 p-6 rounded-2xl border border-electric-500/20 bg-electric-500/5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-graphite-100 flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-electric-400 animate-spin" />
                Processing 14 Images (10 Video Frames + 4 Photos)
              </h3>
              <span className="text-sm font-mono text-electric-400">{frameExtractionProgress.progress}%</span>
            </div>
            <Progress value={frameExtractionProgress.progress} className="h-2" max={100} />
            <p className="text-sm text-graphite-400 text-center">{frameExtractionProgress.message}</p>
            {frameExtractionProgress.stage === 'extracting' && (
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-graphite-400">Frames extracted:</span>
                <span className="font-mono text-electric-400">{frameExtractionProgress.framesExtracted}</span>
                <span className="text-graphite-500">/</span>
                <span className="font-mono text-graphite-400">{frameExtractionProgress.totalFrames}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs">
              {extractionSteps.map((step, index) => (
                <motion.div
                  key={step}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                    index < extractionSteps.indexOf(frameExtractionProgress.message) ? 'bg-success-500 text-background' :
                    index === extractionSteps.indexOf(frameExtractionProgress.message) ? 'bg-electric-500 text-background animate-pulse' :
                    'bg-graphite-700 text-graphite-500'
                  )}
                >
                  {index < extractionSteps.indexOf(frameExtractionProgress.message) ? <Check className="h-3 w-3" /> : index + 1}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      {frameExtractionProgress.stage === 'error' && (
        <motion.div
          className="p-4 rounded-xl border border-danger-500/30 bg-danger-500/10 text-danger-400"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{frameExtractionProgress.message}</span>
          </div>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {showResults && inferenceResults && (
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
                      <h3 className="font-bold text-graphite-100">Assessment Complete</h3>
                      <p className="text-sm text-graphite-400">Collective analysis of 14 images finished</p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-sm">14 IMAGES PROCESSED</Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Video Frames</p>
                    <p className="font-bold text-2xl text-electric-400">{inferenceResults.video_frames_extracted}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Photos Processed</p>
                    <p className="font-bold text-xl text-graphite-100">{inferenceResults.photos_processed}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Total Detections</p>
                    <p className="font-bold text-2xl text-electric-400">{inferenceResults.total_detections}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Severity</p>
                    <p className="font-bold text-xl text-electric-400 capitalize">{inferenceResults.severity}</p>
                  </div>
                  <div className="rounded-xl border border-graphite-700 bg-graphite-900/50 p-4 text-center">
                    <p className="text-xs text-graphite-500 uppercase tracking-wider mb-1">Primary Component</p>
                    <p className="font-bold text-xl text-electric-400">{inferenceResults.primary_component}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cost Estimate */}
            <motion.div
              className="rounded-2xl border border-graphite-700 bg-graphite-900/50 p-5 relative overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <div className="absolute inset-0 bg-grid-tech opacity-20 pointer-events-none" />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="relative">
                  <p className="text-xs font-mono text-electric-400/70 uppercase tracking-wider mb-1">ESTIMATED REPAIR COST</p>
                  <motion.p className="text-3xl sm:text-4xl font-bold text-graphite-100 font-mono tabular-nums" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.8, ease: [0.34, 1.56, 0.64, 1] }}>
                    ₹{inferenceResults.estimated_repair_cost_min.toLocaleString('en-IN')}–₹{inferenceResults.estimated_repair_cost_max.toLocaleString('en-IN')}
                  </motion.p>
                </div>
                <motion.div className="relative w-full sm:w-auto flex-shrink-0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.9 }}>
                  <div className="text-right sm:text-right">
                    <p className="text-xs font-mono text-graphite-400 uppercase tracking-wider mb-1">SETTLEMENT OFFER</p>
                    <p className="text-lg font-bold text-electric-400">₹{inferenceResults.settlement_offer.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-graphite-500">Range: ₹{inferenceResults.settlement_min.toLocaleString('en-IN')}–₹{inferenceResults.settlement_max.toLocaleString('en-IN')}</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Video Frames Summary */}
            <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
              <h4 className="font-medium text-graphite-100 flex items-center gap-2">
                <Video className="h-5 w-5 text-electric-400" />
                Video Frames (10 Extracted)
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 overflow-x-auto pb-4">
                {inferenceResults.video_frames?.map((frame: any) => (
                  <Card key={frame.frame_index} className="border-graphite-700 bg-graphite-900/50">
                    <div className="px-3 py-2 border-b border-graphite-700 flex items-center justify-between">
                      <span className="font-medium text-graphite-100 text-sm">Frame {frame.frame_index}</span>
                      <Badge variant={frame.detections_count > 0 ? 'default' : 'secondary'}>
                        {frame.detections_count} detections
                      </Badge>
                    </div>
                    <div className="p-2 text-sm text-graphite-400">
                      <p>Time: {(frame.timestamp_ms / 1000).toFixed(1)}s</p>
                      {frame.detections.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {frame.detections.slice(0, 2).map((det: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs p-1 rounded bg-graphite-800/50">
                              <span className="text-graphite-300">{det.damage_type}</span>
                              <span className="font-mono text-electric-400">{(det.confidence * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>

            {/* Photos Summary */}
            <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}>
              <h4 className="font-medium text-graphite-100 flex items-center gap-2">
                <Camera className="h-5 w-5 text-electric-400" />
                Photo Views (4 Required)
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {REQUIRED_VIEWS.map((view) => {
                  const photo = inferenceResults.photos?.[view.id];
                  const detections = photo?.detections || [];
                  return (
                    <Card key={view.id} className="border-graphite-700 bg-graphite-900/50 overflow-hidden">
                      <div className="px-3 py-2 border-b border-graphite-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-lg', view.bgColor)}>
                            {view.icon}
                          </span>
                          <span className="font-medium text-graphite-100">{view.label}</span>
                        </div>
                        <Badge variant={detections.length > 0 ? 'default' : 'secondary'}>
                          {detections.length} found
                        </Badge>
                      </div>
                      <div className="relative aspect-video overflow-hidden">
                        {photo?.annotated_image_base64 ? (
                          <img
                            src={`data:image/jpeg;base64,${photo.annotated_image_base64}`}
                            alt={`${view.label} annotated`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-graphite-500">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-1 max-h-32 overflow-y-auto">
                        {detections.length === 0 ? (
                          <p className="text-sm text-graphite-500">No damage detected</p>
                        ) : (
                          detections.map((det: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm p-1.5 rounded bg-graphite-800/50">
                              <span className="text-graphite-300">{det.damage_type}</span>
                              <span className="font-mono text-electric-400">{(det.confidence * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </motion.div>

            {/* Collective Summary */}
            <motion.div
              className="rounded-2xl border border-graphite-700 bg-graphite-900/30 p-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.2 }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-electric-500/10 shrink-0 mt-0.5">
                  <Zap className="h-4 w-4 text-electric-400" />
                </div>
                <p className="text-sm text-graphite-300 leading-relaxed flex-1">{inferenceResults.damage_summary}</p>
              </div>
            </motion.div>

            {/* Limitations */}
            <motion.div
              className="rounded-xl border border-graphite-700 bg-graphite-900/30 p-4 text-sm text-graphite-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.4 }}
            >
              <p className="font-medium text-graphite-300 mb-2">Limitations & Disclaimers</p>
              <ul className="space-y-1 list-disc list-inside">
                {inferenceResults.limitations?.map((limitation: string, i: number) => (
                  <li key={i}>{limitation}</li>
                ))}
              </ul>
            </motion.div>

            {/* Actions */}
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6 }}
            >
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
                  const event = new CustomEvent('claimpilot:assessment-complete', { detail: inferenceResults });
                  window.dispatchEvent(event);
                }}
                className="flex-1 gap-2 bg-gradient-to-r from-electric-500 to-cyan-500"
              >
                <Zap className="h-4 w-4" />
                Continue to Settlement
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready to Inference */}
      {allUploaded && videoDurationValid && !extractingFrames && !showResults && (
        <motion.button
          onClick={startInference}
          disabled={disabled}
          className="w-full gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-electric-500 to-cyan-500 text-background font-semibold shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 transition-all disabled:opacity-50"
          whileHover={{ y: -2, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.5)' }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Zap className="h-5 w-5" />
          Run Collective Assessment on 14 Images
        </motion.button>
      )}

      {allUploaded && videoDurationError && !extractingFrames && !showResults && (
        <div className="text-center text-danger-400 py-4">
          <p>Fix video duration (must be 8-10 seconds) to enable assessment</p>
        </div>
      )}

      {!allUploaded && !extractingFrames && !showResults && (
        <div className="text-center text-graphite-500 py-4">
          <p>Upload video walkaround (8-10s) and all four view photos to enable assessment</p>
          <p className="text-sm mt-1">
            {videoUploaded && videoDurationValid ? '✓' : '○'} Video walkaround (8-10s) &nbsp;|&nbsp;
            {REQUIRED_VIEWS.filter(v => viewStates[v.id]?.file).length}/4 photos uploaded
          </p>
        </div>
      )}
    </div>
  );
}