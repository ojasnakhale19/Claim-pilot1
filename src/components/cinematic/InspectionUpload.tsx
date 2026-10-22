import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Plus, Loader2, Eye, Zap, Video, Film } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { cn, isValidImageFile, isValidVideoFile, getFileSizeString } from '../../lib/utils';

interface UploadedMedia {
  id: string;
  file: File;
  preview: string;
  name: string;
  size: number;
  type: 'image' | 'video';
}

interface InspectionUploadProps {
  photos: UploadedMedia[];
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (id: string) => void;
  onOpenLightbox: (photo: UploadedMedia) => void;
  onStartAssessment: () => void;
  maxPhotos: number;
  disabled?: boolean;
  errors?: Record<string, string>;
  photoInputKey: number;
  setPhotoInputKey: (key: number | ((prev: number) => number)) => void;
}

const PHOTO_GUIDANCE = [
  { id: 1, label: 'Full Vehicle', desc: 'Entire vehicle context', icon: <Camera className="h-5 w-5" /> },
  { id: 2, label: 'Damage Close-up', desc: 'Clear damage detail', icon: <Camera className="h-5 w-5" /> },
  { id: 3, label: 'Video Walkaround', desc: '360° damage view', icon: <Video className="h-5 w-5" /> },
];

export function InspectionUpload({
  photos,
  onAddPhotos,
  onRemovePhoto,
  onOpenLightbox,
  onStartAssessment,
  maxPhotos,
  disabled = false,
  errors,
  photoInputKey,
  setPhotoInputKey,
}: InspectionUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const processPhotos = useCallback((files: File[]) => {
    const validPhotos: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      if (isValidImageFile(file) || isValidVideoFile(file)) {
        validPhotos.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (validPhotos.length > 0) {
      onAddPhotos(validPhotos);
      // Trigger scan animation
      setScanning(true);
      setScanProgress(0);
      const interval = setInterval(() => {
        setScanProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setTimeout(() => setScanning(false), 500);
            return 100;
          }
          return p + Math.random() * 15;
        });
      }, 100);
    }

    if (invalidFiles.length > 0) {
      // Error handling would be done by parent
    }
  }, [onAddPhotos]);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processPhotos(files);
    e.target.value = '';
    setPhotoInputKey((prev: number) => prev + 1);
  }, [processPhotos, setPhotoInputKey]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    processPhotos(files);
  }, [processPhotos]);

  return (
    <div className="space-y-6 animate-in" role="region" aria-label="Vehicle inspection upload">
      {/* Section Header */}
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-graphite-800 to-graphite-900 border border-border flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-tech opacity-30" />
            <Camera className="h-8 w-8 text-electric-400 relative z-10" aria-hidden="true" />
            {scanning && (
              <motion.div
                className="absolute inset-0 border-2 border-electric-500/50 rounded-2xl"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [1, 0], scale: [0.8, 1.1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </div>
        </div>
        <h2 className="text-2xl font-bold text-graphite-100 tracking-tight">Vehicle Inspection Bay</h2>
        <p className="mt-2 text-graphite-400 max-w-xl mx-auto">
          Upload photos or videos of the damage. Our system will simulate an automated inspection analysis.
        </p>
      </div>

      {/* Drop Zone - Inspection Bay Style */}
      <motion.div
        ref={dropZoneRef}
        className={cn(
          'relative rounded-3xl overflow-hidden transition-all duration-500 ease-spring',
          'border-2 border-dashed',
          dragActive
            ? 'border-electric-400 bg-electric-500/5 shadow-[0_0_40px_-10px_rgba(14,165,233,0.3)]'
            : photos.length > 0
            ? 'border-graphite-700 bg-surface/50'
            : 'border-graphite-700 bg-surface/30 hover:border-electric-500/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        whileHover={{ scale: dragActive || photos.length > 0 || disabled ? 1 : 1.005 }}
        animate={{ boxShadow: dragActive ? '0 0 60px -10px rgba(14, 165, 233, 0.4)' : 'none' }}
        transition={{ duration: 0.3 }}
      >
        {/* Technical grid background */}
        <div className="absolute inset-0 inspection-grid opacity-50" />
        
        {/* Scan line overlay when scanning */}
        <AnimatePresence mode="wait">
          {scanning && (
            <motion.div
              className="absolute inset-0 inspection-scan pointer-events-none z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        {/* Corner brackets - inspection bay style */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {['tl', 'tr', 'bl', 'br'].map(pos => (
            <div
              key={pos}
              className="absolute w-8 h-8 border-2 border-electric-500/50"
              style={{
                top: pos.includes('t') ? 0 : 'auto',
                bottom: pos.includes('b') ? 0 : 'auto',
                left: pos.includes('l') ? 0 : 'auto',
                right: pos.includes('r') ? 0 : 'auto',
                borderBottomWidth: pos.includes('t') ? 0 : 2,
                borderTopWidth: pos.includes('b') ? 0 : 2,
                borderRightWidth: pos.includes('l') ? 0 : 2,
                borderLeftWidth: pos.includes('r') ? 0 : 2,
              }}
            />
          ))}
        </div>

        {/* Coordinate labels */}
        <div className="absolute inset-0 pointer-events-none text-[10px] text-electric-500/50 font-mono" aria-hidden="true">
          <div className="absolute top-4 left-4">X: 0.00 Y: 0.00</div>
          <div className="absolute top-4 right-4 text-right">X: 1920 Y: 0.00</div>
          <div className="absolute bottom-4 left-4">X: 0.00 Y: 1080</div>
          <div className="absolute bottom-4 right-4 text-right">X: 1920 Y: 1080</div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          id={`inspection-upload-${photoInputKey}`}
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          onChange={handlePhotoSelect}
          className="hidden"
          aria-label="Upload damage photos or videos"
          disabled={disabled}
        />

        <label
          htmlFor={`inspection-upload-${photoInputKey}`}
          className="cursor-pointer block p-8 md:p-12 text-center relative z-10"
          style={{ minHeight: '280px' }}
        >
          <div className="flex flex-col items-center gap-6 relative z-10">
            {/* Upload icon with pulse */}
            <motion.div
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-2xl transition-all',
                dragActive ? 'bg-electric-500/20 border border-electric-500/30' : 'bg-graphite-800/50 border border-graphite-700'
              )}
              animate={dragActive ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: dragActive ? Infinity : 0 }}
            >
              <Camera className={cn('h-10 w-10 transition-colors', dragActive ? 'text-electric-400' : 'text-graphite-400')} aria-hidden="true" />
            </motion.div>

            <div className="text-center">
              <p className={cn(
                'text-lg font-medium transition-colors',
                dragActive ? 'text-electric-300' : 'text-graphite-100'
              )}>
                {photos.length === 0 ? 'Drop photos or videos here' : 'Add more inspection media'}
              </p>
              <p className="mt-1 text-sm text-graphite-500">or click to select files · JPG, PNG, WebP, MP4, MOV</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              type="button"
              className="border-graphite-600 text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10"
              disabled={disabled}
            >
              Select Files
            </Button>
          </div>

          {/* Scan progress indicator */}
          {scanning && (
            <motion.div
              className="mt-6 w-full max-w-md mx-auto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-electric-500/20">
                  <Loader2 className="h-4 w-4 text-electric-400 animate-spin" />
                </div>
                <span className="text-sm font-medium text-graphite-200">Scanning vehicle surfaces...</span>
                <span className="ml-auto text-sm font-mono text-electric-400">{Math.round(scanProgress)}%</span>
              </div>
              <div className="h-1.5 bg-graphite-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-electric-500 via-cyan-400 to-electric-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          )}
        </label>

        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-graphite-600 px-4">
          JPG, PNG, WebP, MP4, MOV · Images: 10MB max · Videos: 50MB max · Up to {maxPhotos} items
        </p>

        {errors?.photos && (
          <motion.p
            className="absolute bottom-10 left-1/2 -translate-x-1/2 text-sm text-amber-400 flex items-center justify-center gap-1 px-4"
            role="alert"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <motion.span
              className="h-4 w-4"
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
            >
              ⚠
            </motion.span>
            {errors.photos}
          </motion.p>
        )}
      </motion.div>

      {/* Media Previews - Inspection Evidence Grid */}
      <AnimatePresence mode="popLayout">
        {photos.length > 0 && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-graphite-300 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-electric-500/10 text-electric-400 text-[10px] font-mono">
                  {photos.length}/{maxPhotos}
                </span>
                Evidence Captured
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {photos.map((media, index) => (
                <InspectionMediaCard
                  key={media.id}
                  media={media}
                  index={index}
                  onRemove={onRemovePhoto}
                  onOpenLightbox={onOpenLightbox}
                  scanning={scanning}
                />
              ))}
              {/* Empty slots */}
              {photos.length < maxPhotos &&
                Array.from({ length: Math.min(4, maxPhotos - photos.length) }, (_, i) => (
                  <motion.div
                    key={`empty-${i}`}
                    className="relative rounded-xl border-2 border-dashed border-graphite-700 aspect-video bg-graphite-900/50 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="text-center">
                      <Plus className="text-4xl text-graphite-600 mx-auto" />
                      <p className="mt-2 text-xs text-graphite-500">Slot {photos.length + i + 1}</p>
                    </div>
                  </motion.div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Guidance - Inspection Protocol */}
      <Card className="border-graphite-700 bg-graphite-900/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-electric-500/10">
              <Camera className="h-4 w-4 text-electric-400" />
            </div>
            <h4 className="font-medium text-graphite-100">Inspection Protocol</h4>
            <span className="ml-auto text-xs text-graphite-500 font-mono">STANDARD-ISO-3779</span>
          </div>
          <p className="text-xs text-graphite-500 mb-4">For optimal automated analysis, capture these standard angles:</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PHOTO_GUIDANCE.map((guide) => (
              <button
                key={guide.id}
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  if (guide.id === 3) {
                    input.type = 'file';
                    input.accept = 'video/mp4,video/quicktime';
                  } else {
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/png,image/webp';
                  }
                  input.onchange = (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0];
                    if (file) processPhotos([file]);
                  };
                  input.click();
                }}
                disabled={disabled}
                className={cn(
                  'relative rounded-xl p-4 text-center transition-all',
                  'border border-graphite-700 bg-graphite-900/50',
                  'hover:border-electric-500/50 hover:bg-electric-500/5',
                  'focus:outline-none focus:ring-2 focus:ring-electric-500/50',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-graphite-800 flex items-center justify-center text-lg font-medium text-graphite-400 border border-graphite-700">
                  {guide.icon}
                </div>
                <p className="text-sm font-medium text-graphite-100">{guide.label}</p>
                <p className="text-xs text-graphite-500 mt-1">{guide.desc}</p>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1" aria-hidden="true">
                  <div className="w-1.5 h-1.5 rounded-full bg-electric-500/50 animate-pulse-soft delay-1" />
                  <div className="w-1.5 h-1.5 rounded-full bg-electric-500/50 animate-pulse-soft delay-2" />
                  <div className="w-1.5 h-1.5 rounded-full bg-electric-500/50 animate-pulse-soft delay-3" />
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Continue Button */}
      <motion.button
        onClick={onStartAssessment}
        disabled={photos.length === 0 || disabled}
        className="w-full gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-electric-500 to-cyan-500 text-background font-semibold shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        whileHover={{ y: -2, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.5)' }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <Zap className="h-5 w-5" />
        {photos.length === 0 ? 'Add media to continue' : `Review damage (${photos.length}/{maxPhotos})`}
      </motion.button>
    </div>
  );
}

interface InspectionMediaCardProps {
  media: UploadedMedia;
  index: number;
  onRemove: (id: string) => void;
  onOpenLightbox: (media: UploadedMedia) => void;
  scanning?: boolean;
}

function InspectionMediaCard({
  media,
  index,
  onRemove,
  onOpenLightbox,
  scanning,
}: InspectionMediaCardProps) {
  const [hovered, setHovered] = useState(false);
  const isVideo = media.type === 'video';

  return (
    <motion.div
      className="relative group rounded-xl border border-graphite-700 bg-graphite-900 overflow-hidden"
      whileHover={{ y: -4, boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5), 0 0 30px -10px rgba(14,165,233,0.2)' }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onOpenLightbox(media)}
        className="aspect-video w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-electric-500 focus:ring-offset-2 focus:ring-offset-background"
        aria-label={`View evidence ${index + 1} full size`}
      >
        {isVideo ? (
          <video
            src={media.preview}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
        ) : (
          <motion.img
            src={media.preview}
            alt={`Damage evidence ${index + 1}`}
            className="w-full h-full object-cover transition-transform duration-500 ease-spring"
            whileHover={{ scale: 1.05 }}
          />
        )}
        {/* Type indicator */}
        <div className="absolute top-2 right-2 z-10">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-graphite-900/90 backdrop-blur text-graphite-300">
            {isVideo ? <Video className="h-3 w-3 text-amber-400" /> : <Camera className="h-3 w-3 text-electric-400" />}
          </span>
        </div>
        {/* Scan overlay on hover */}
        <AnimatePresence mode="wait">
          {hovered && !scanning && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-end p-3 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-full flex items-center justify-between text-xs">
                <span className="text-white font-mono">EVD-{String(index + 1).padStart(3, '0')}</span>
                <span className="text-electric-400 font-mono flex items-center gap-1">
                  {isVideo ? <Film className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
                  {getFileSizeString(media.size)}
                </span>
              </div>
            </motion.div>
          )}
          {scanning && (
            <motion.div
              className="absolute inset-0 inspection-scan bg-gradient-to-r from-transparent via-electric-500/30 to-transparent pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
      </button>

      {/* Evidence marker */}
      <div className="absolute top-2 left-2 z-10">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-electric-500/90 text-background text-[10px] font-mono font-bold">
          {index + 1}
        </span>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(media.id); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        aria-label={`Remove evidence ${media.name}`}
      >
        <motion.div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-500/90 backdrop-blur text-white shadow-glow-electric"
          whileHover={{ scale: 1.15, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
        >
          <X className="h-3.5 w-3.5" />
        </motion.div>
      </button>

      {/* Lightbox hint */}
      <button
        onClick={() => onOpenLightbox(media)}
        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        aria-label={`Examine evidence ${index + 1}`}
      >
        <motion.div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-graphite-800/90 backdrop-blur text-graphite-300 border border-graphite-600"
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(14, 165, 233, 0.3)', borderColor: 'rgba(14, 165, 233, 0.5)' }}
          whileTap={{ scale: 0.9 }}
        >
          <Eye className="h-3.5 w-3.5" />
        </motion.div>
      </button>
    </motion.div>
  );
}