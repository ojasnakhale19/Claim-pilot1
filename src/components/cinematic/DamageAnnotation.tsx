import { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle, Info, ExternalLink, Loader2, Camera, MessageSquare } from 'lucide-react';
import { CardHeader, CardContent, CardFooter } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { cn, formatNumber } from '../../lib/utils';

interface DamageDetection {
  damage_type: string;
  confidence: number;
  bounding_box_xyxy: number[];
}

interface ViewResult {
  detection_count: number;
  detections: DamageDetection[];
  annotated_image_base64?: string;
}

interface DamageAnnotationProps {
  assessment: {
    type: 'minor' | 'moderate' | 'severe' | 'uncertain';
    data: {
      component: string;
      damageType: string;
      severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
      costMin: number;
      costMax: number;
      repairApproach: string;
      explanation: string;
      settlementOffer: number;
      settlementMin: number;
      settlementMax: number;
    };
  } | null;
  photos: Array<{ id: string; preview: string }>;
  views: Record<string, ViewResult> | null;
  onContinue: () => void;
  onAddMorePhotos: () => void;
  onHumanReview: () => void;
}

type AccentColor = 'success' | 'warning' | 'destructive' | 'secondary';

interface SeverityConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  textColor: string;
  glowColor: string;
  accentColor: AccentColor;
}

const SEVERITY_CONFIG: Record<'minor' | 'moderate' | 'severe' | 'uncertain', SeverityConfig> = {
  minor: {
    label: 'MINOR DAMAGE',
    icon: CheckCircle,
    color: 'success',
    bgColor: 'bg-success-500/10 border-success-500/30',
    textColor: 'text-success-400',
    glowColor: 'rgba(34, 197, 94, 0.3)',
    accentColor: 'success',
  },
  moderate: {
    label: 'MODERATE DAMAGE',
    icon: AlertTriangle,
    color: 'warning',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    textColor: 'text-amber-400',
    glowColor: 'rgba(245, 158, 11, 0.3)',
    accentColor: 'warning',
  },
  severe: {
    label: 'SEVERE DAMAGE',
    icon: AlertCircle,
    color: 'danger',
    bgColor: 'bg-danger-500/10 border-danger-500/30',
    textColor: 'text-danger-400',
    glowColor: 'rgba(239, 68, 68, 0.3)',
    accentColor: 'destructive',
  },
  uncertain: {
    label: 'ANALYSIS INCONCLUSIVE',
    icon: Info,
    color: 'secondary',
    bgColor: 'bg-graphite-700/50 border-graphite-600',
    textColor: 'text-graphite-400',
    glowColor: 'rgba(100, 116, 139, 0.3)',
    accentColor: 'secondary',
  },
};

// Map damage class to display name
const DAMAGE_CLASS_LABELS: Record<string, string> = {
  dent: 'Dent',
  scratch: 'Scratch',
  crack: 'Crack',
  'glass shatter': 'Glass Shatter',
  glass_shatter: 'Glass Shatter',
  'lamp broken': 'Lamp Broken',
  lamp_broken: 'Lamp Broken',
  'tire flat': 'Tire Flat',
  tire_flat: 'Tire Flat',
};

// Severity color mapping for detection markers
const SEVERITY_STYLES = {
  high: { borderColor: 'rgba(239, 68, 68, 0.8)', bgColor: 'rgba(239, 68, 68, 0.15)', labelBg: 'bg-danger-500' },
  medium: { borderColor: 'rgba(245, 158, 11, 0.8)', bgColor: 'rgba(245, 158, 11, 0.15)', labelBg: 'bg-amber-500' },
  low: { borderColor: 'rgba(34, 197, 94, 0.8)', bgColor: 'rgba(34, 197, 94, 0.15)', labelBg: 'bg-success-500' },
};

function getSeverityStyle(confidence: number) {
  if (confidence >= 0.7) return SEVERITY_STYLES.high;
  if (confidence >= 0.4) return SEVERITY_STYLES.medium;
  return SEVERITY_STYLES.low;
}

function formatDamageType(className: string): string {
  return DAMAGE_CLASS_LABELS[className.toLowerCase()] || className.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface DamageRegionMarkerProps {
  region: { 
    id: string; 
    label: string; 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    confidence: number;
    className: string;
  };
  index: number;
}

function DamageRegionMarker({ region, index }: DamageRegionMarkerProps) {
  const style = getSeverityStyle(region.confidence);

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.width}%`,
        height: `${region.height}%`,
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.4, delay: 0.6 + index * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {/* Pulsing outline */}
      <motion.div
        className="absolute inset-0 rounded-lg border-2"
        style={{ borderColor: style.borderColor, backgroundColor: style.bgColor }}
        animate={{
          boxShadow: [
            `0 0 0 0 ${style.borderColor}`,
            `0 0 20px 8px ${style.borderColor.replace('0.8', '0')}`,
            `0 0 0 0 ${style.borderColor}`,
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Corner markers */}
      <div className="absolute inset-0" aria-hidden="true">
        {['tl', 'tr', 'bl', 'br'].map(pos => (
          <div
            key={pos}
            className="absolute w-3 h-3 border-2"
            style={{
              top: pos.includes('t') ? 0 : 'auto',
              bottom: pos.includes('b') ? 0 : 'auto',
              left: pos.includes('l') ? 0 : 'auto',
              right: pos.includes('r') ? 0 : 'auto',
              borderColor: style.borderColor,
            }}
          />
        ))}
      </div>

      {/* Label */}
      <motion.div
        className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 + index * 0.15 }}
      >
        <span className={cn(
          'px-2 py-1 rounded text-[10px] font-mono font-medium text-background shadow-lg',
          style.labelBg
        )}>
          {region.label}
        </span>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2" style={{ backgroundColor: style.borderColor }} />
      </motion.div>
    </motion.div>
  );
}

export function DamageAnnotation({ assessment, photos, views, onContinue, onAddMorePhotos, onHumanReview }: DamageAnnotationProps) {
  const [mounted, setMounted] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate damage regions from actual backend detections
  const damageRegions = useMemo(() => {
    if (!assessment || !views) return [];
    
    const regions: Array<{
      id: string;
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
      className: string;
    }> = [];
    
    let regionId = 0;
    
    // Process each view's detections
    Object.entries(views).forEach(([_viewName, viewData]) => {
      viewData.detections.forEach((detection, _detIndex) => {
        const [x1, y1, x2, y2] = detection.bounding_box_xyxy;
        const width = x2 - x1;
        const height = y2 - y1;
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        
        // Convert to percentage (assuming 640x640 inference size, but image displayed at different size)
        // The image is displayed with object-cover, so we use normalized coordinates
        const imgWidth = 640; // inference input size
        const imgHeight = 640;
        
        regions.push({
          id: `region-${regionId++}`,
          label: formatDamageType(detection.damage_type),
          x: (centerX / imgWidth) * 100,
          y: (centerY / imgHeight) * 100,
          width: (width / imgWidth) * 100,
          height: (height / imgHeight) * 100,
          confidence: detection.confidence,
          className: detection.damage_type,
        });
      });
    });
    
    return regions;
  }, [assessment, views]);

  useEffect(() => {
    setMounted(true);
    setTimeout(() => setShowAnnotations(true), 300);
  }, [assessment]);

  if (!assessment || !mounted) {
    return (
      <div className="space-y-6 animate-in h-96 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-electric-500/30 animate-pulse-soft" />
            <div className="absolute inset-0 rounded-full border-2 border-electric-500/30 animate-pulse-soft delay-2" />
            <div className="relative w-full h-full rounded-full border-2 border-electric-500 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-electric-400 animate-spin" />
            </div>
          </div>
          <p className="text-graphite-400">Finalizing assessment...</p>
        </div>
      </div>
    );
  }

  const config = SEVERITY_CONFIG[assessment.type];
  const IconComponent = config.icon;
  const data = assessment.data;

  return (
    <div className="space-y-6 animate-in" ref={containerRef}>
      {/* Assessment Result Card */}
      <motion.div
        className={cn(
          'rounded-3xl border overflow-hidden relative',
          config.bgColor,
          'bg-gradient-to-br from-surface/80 to-graphite-900/80 backdrop-blur-2xl'
        )}
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ boxShadow: `0 0 60px -20px ${config.glowColor}, 0 20px 60px -15px rgba(0,0,0,0.4)` }}
      >
        {/* Animated border sweep */}
        <motion.div
          className="absolute inset-0 border-2 opacity-0 pointer-events-none"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1, ease: 'easeInOut' }}
          style={{ borderColor: config.glowColor }}
        />

        <CardHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-start gap-4">
            <motion.div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-2xl shrink-0',
                config.bgColor.replace('bg-', '').replace('border-', 'border-')
              )}
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <IconComponent className={cn('h-7 w-7', config.textColor)} aria-hidden="true" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <h3 className="text-xl font-bold text-graphite-100">{data.component}</h3>
              <p className="mt-1 text-graphite-400">{data.damageType}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              className="ml-auto mt-1"
            >
              <Badge variant={config.accentColor} className="text-sm px-3 py-1.5 font-mono tracking-wider">
                {config.label}
              </Badge>
            </motion.div>
          </div>
        </CardHeader>

        <CardContent className="p-6 pt-4 space-y-5">
          {/* Annotated Vehicle Image */}
          {photos.length > 0 && (
            <motion.div
              className="relative rounded-2xl overflow-hidden border border-graphite-700"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={photos[0].preview}
                  alt="Vehicle damage assessment"
                  className="w-full h-full object-cover"
                />
                
                {/* Damage region annotations from actual detections */}
                <AnimatePresence mode="popLayout">
                  {showAnnotations && damageRegions.length > 0 && damageRegions.map((region, i) => (
                    <DamageRegionMarker
                      key={region.id}
                      region={region}
                      index={i}
                    />
                  ))}
                </AnimatePresence>

                {showAnnotations && damageRegions.length === 0 && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center bg-black/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <span className="text-electric-400/80 font-mono text-sm">No damage regions detected in primary image</span>
                  </motion.div>
                )}

                {/* Scanning line overlay */}
                <motion.div
                  className="absolute inset-0 inspection-scan pointer-events-none"
                  animate={{ opacity: [0, 0.4, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* Corner measurement markers */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  {['tl', 'tr', 'bl', 'br'].map((pos, idx) => (
                    <motion.div
                      key={pos}
                      className="absolute w-6 h-6 border border-electric-400/50"
                      style={{
                        top: pos.includes('t') ? 8 : 'auto',
                        bottom: pos.includes('b') ? 8 : 'auto',
                        left: pos.includes('l') ? 8 : 'auto',
                        right: pos.includes('r') ? 8 : 'auto',
                        borderBottomWidth: pos.includes('t') ? 0 : 1,
                        borderTopWidth: pos.includes('b') ? 0 : 1,
                        borderRightWidth: pos.includes('l') ? 0 : 1,
                        borderLeftWidth: pos.includes('r') ? 0 : 1,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 0.6, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.6 + idx * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      <span className="absolute text-[9px] font-mono text-electric-400/70 -translate-x-1/2 -translate-y-1/2 top-0 left-0">
                        {pos.toUpperCase()}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Image info bar */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-xs">
                <span className="text-white/80 font-mono">EVD-001 · PRIMARY EVIDENCE</span>
                <span className="text-electric-400/80 font-mono flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  EXAMINE
                </span>
              </div>
            </motion.div>
          )}

          {/* Cost Estimate - Inspection Report Style */}
          {data.severity !== 'uncertain' && (
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
                  <motion.p
                    className="text-3xl sm:text-4xl font-bold text-graphite-100 font-mono tabular-nums"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    ₹{formatNumber(data.costMin)}–₹{formatNumber(data.costMax)}
                  </motion.p>
                </div>

                <motion.div
                  className="relative w-full sm:w-auto flex-shrink-0"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.9 }}
                >
                  <div className="text-right sm:text-right">
                    <p className="text-xs font-mono text-graphite-400 uppercase tracking-wider mb-1">REPAIR APPROACH</p>
                    <p className="text-sm font-medium text-graphite-200">{data.repairApproach}</p>
                  </div>
                </motion.div>
              </div>

              {/* Settlement range indicator */}
              <motion.div
                className="mt-5 pt-5 border-t border-graphite-700 relative"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1 }}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">SETTLEMENT RANGE</span>
                </div>
                <div className="h-2 bg-graphite-800 rounded-full overflow-hidden relative">
                  <motion.div
                    className="h-full bg-gradient-to-r from-electric-500 via-cyan-400 to-electric-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-1">
                    <span className="text-[10px] font-mono text-graphite-500 -translate-x-1/2">₹{formatNumber(data.settlementMin)}</span>
                    <span className="text-[10px] font-mono text-electric-400">₹{formatNumber(data.settlementOffer)}</span>
                    <span className="text-[10px] font-mono text-graphite-500 -translate-x-1/2">₹{formatNumber(data.settlementMax)}</span>
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-mono">
                  <span className="text-graphite-500">MIN</span>
                  <span className="text-electric-400">OFFER</span>
                  <span className="text-graphite-500">MAX</span>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Explanation */}
          <motion.div
            className="rounded-2xl border border-graphite-700 bg-graphite-900/30 p-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-electric-500/10 shrink-0 mt-0.5">
                <Info className="h-4 w-4 text-electric-400" />
              </div>
              <p className="text-sm text-graphite-300 leading-relaxed flex-1">{data.explanation}</p>
            </div>
          </motion.div>
        </CardContent>

        <CardFooter className="p-6 pt-4 border-t border-border/50 flex flex-col sm:flex-row gap-3">
          {data.severity === 'uncertain' ? (
            <>
              <motion.button
                onClick={onAddMorePhotos}
                className="flex-1 gap-2 px-6 py-3 rounded-xl border border-graphite-600 bg-transparent text-graphite-300 hover:border-electric-500 hover:text-electric-400 hover:bg-electric-500/10 transition-all font-medium"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
              >
                <Camera className="h-4 w-4" />
                Add Clearer Photos
              </motion.button>
              <motion.button
                onClick={onHumanReview}
                className="flex-1 gap-2 px-6 py-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 hover:bg-danger-500/20 hover:border-danger-500 hover:text-danger-300 transition-all font-medium"
                whileHover={{ y: -2, boxShadow: '0 0 20px -5px rgba(239, 68, 68, 0.3)' }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
              >
                <AlertTriangle className="h-4 w-4" />
                Request Human Review
              </motion.button>
            </>
          ) : (
            <motion.button
              onClick={onContinue}
              className="w-full sm:w-auto flex-1 gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-electric-500 to-cyan-500 text-background font-semibold shadow-glow-electric hover:from-electric-400 hover:to-cyan-400 transition-all"
              whileHover={{ y: -2, boxShadow: '0 0 30px -5px rgba(14, 165, 233, 0.5)' }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
            >
              <MessageSquare className="h-4 w-4" />
              Continue to Settlement
            </motion.button>
          )}
        </CardFooter>
      </motion.div>

      {/* Additional Photos Strip */}
      <AnimatePresence mode="popLayout">
        {photos.length > 1 && (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 1.4 }}
          >
            <h4 className="text-sm font-medium text-graphite-300 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-graphite-800 text-graphite-400 text-[10px] font-mono">
                {photos.length} TOTAL
              </span>
              All Captured Evidence
            </h4>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scroll-smooth">
              {photos.map((photo, index) => (
                <motion.button
                  key={photo.id}
                  onClick={() => {}}
                  className="flex-shrink-0 w-28 aspect-video rounded-lg border border-graphite-700 overflow-hidden bg-graphite-900 relative transition-transform hover:scale-105"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.5 + index * 0.05 }}
                  aria-label={`View evidence ${index + 1}`}
                >
                  <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <span className="text-[10px] font-mono text-white/80">EVD-{String(index + 1).padStart(3, '0')}</span>
                  </div>
                  {index === 0 && (
                    <div className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded bg-electric-500 text-background text-[9px] font-mono font-bold">
                      ✓
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}