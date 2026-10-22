import { motion, AnimatePresence } from 'framer-motion';
import { LightSweep } from './LightSweep';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { CheckCircle, Zap } from 'lucide-react';

interface TransitionWrapperProps {
  children: React.ReactNode;
  stage: string;
  previousStage?: string;
  className?: string;
  variant?: 'default' | 'sweep' | 'slide' | 'fade' | 'iris';
}

const stageOrder = ['upload', 'assessing', 'assessment', 'chat', 'confirmed', 'humanReview'];

function getStageIndex(stage: string): number {
  return stageOrder.indexOf(stage);
}

function getTransitionDirection(current: string, previous?: string): 'forward' | 'backward' | 'none' {
  if (!previous) return 'none';
  const currentIdx = getStageIndex(current);
  const previousIdx = getStageIndex(previous);
  if (currentIdx > previousIdx) return 'forward';
  if (currentIdx < previousIdx) return 'backward';
  return 'none';
}

export function TransitionWrapper({
  children,
  stage,
  previousStage,
  className = '',
  variant = 'default',
}: TransitionWrapperProps) {
  const direction = getTransitionDirection(stage, previousStage);
  const [showSweep, setShowSweep] = useState<boolean>(false);
  const sweepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousStage && previousStage !== stage) {
      setShowSweep(true);
      sweepTimeoutRef.current = setTimeout(() => setShowSweep(false), 600);
    }
    return () => {
      if (sweepTimeoutRef.current) clearTimeout(sweepTimeoutRef.current);
    };
  }, [stage, previousStage]);

  const variants = {
    default: {
      initial: { opacity: 0, y: direction === 'forward' ? 30 : -30 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: direction === 'forward' ? -30 : 30 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
    sweep: {
      initial: { opacity: 0, clipPath: direction === 'forward' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' },
      animate: { opacity: 1, clipPath: 'inset(0 0% 0 0)' },
      exit: { opacity: 0, clipPath: direction === 'forward' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
    },
    slide: {
      initial: { opacity: 0, x: direction === 'forward' ? 40 : -40 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: direction === 'forward' ? -40 : 40 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.3 },
    },
    iris: {
      initial: { opacity: 0, clipPath: 'circle(0% at 50% 50%)', scale: 0.95 },
      animate: { opacity: 1, clipPath: 'circle(150% at 50% 50%)', scale: 1 },
      exit: { opacity: 0, clipPath: 'circle(0% at 50% 50%)', scale: 0.95 },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
    },
  };

  const anim = variants[variant];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        className={className}
        initial={anim.initial}
        animate={anim.animate}
        exit={anim.exit}
        variants={{
          hidden: anim.initial,
          visible: anim.animate,
          exit: anim.exit,
        }}
      >
        {children}
        
        {/* Transition sweep effect */}
        {showSweep && (
          <LightSweep
            trigger={true}
            duration={0.6}
            color="electric"
            direction={direction === 'forward' ? 'ltr' : 'rtl'}
            className="pointer-events-none z-10"
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface StageIndicatorProps {
  currentStage: string;
  stages: Array<{ id: string; label: string; icon: React.ReactNode }>;
  className?: string;
}

export function StageIndicator({ currentStage, stages, className = '' }: StageIndicatorProps) {
  const currentIndex = stages.findIndex(s => s.id === currentStage);

  return (
    <motion.div
      className={cn('flex items-center gap-2', className)}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {stages.map((stage, index) => (
        <motion.div
          key={stage.id}
          className="flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 + index * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-xl font-mono text-[10px] font-medium transition-all',
            index < currentIndex
              ? 'bg-electric-500/20 border border-electric-500/30 text-electric-400'
              : index === currentIndex
              ? 'bg-gradient-to-br from-electric-500 to-cyan-500 text-background shadow-glow-electric'
              : 'bg-graphite-800/50 border border-graphite-700 text-graphite-500'
          )}>
            {index < currentIndex ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <span>{index + 1}</span>
            )}
          </div>
          
          {index < stages.length - 1 && (
            <motion.div
              className="h-1 flex-1 max-w-20 rounded-full overflow-hidden"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: index < currentIndex ? 1 : 0 }}
              transition={{ duration: 0.4, delay: 0.3 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-electric-500 to-cyan-500"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: index < currentIndex ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>
          )}

          <motion.span
            className={cn(
              'text-sm font-medium whitespace-nowrap hidden sm:block',
              index <= currentIndex ? 'text-graphite-200' : 'text-graphite-500'
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.1 }}
          >
            {stage.label}
          </motion.span>
        </motion.div>
      ))}
    </motion.div>
  );
}

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
  progress?: number;
}

export function LoadingOverlay({ isVisible, message = 'Processing…', subMessage, progress }: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="alert"
      aria-live="polite"
    >
      <motion.div
        className="text-center max-w-md w-full"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative w-28 h-28 mx-auto mb-6">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-electric-500/30"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-electric-500 opacity-50"
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative w-full h-full flex items-center justify-center">
            <Zap className="h-10 w-10 text-electric-400" />
          </div>
        </div>

        <motion.h3
          className="text-xl font-bold text-graphite-100 mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {message}
        </motion.h3>

        {subMessage && (
          <motion.p
            className="text-graphite-400 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {subMessage}
          </motion.p>
        )}

        {progress !== undefined && (
          <motion.div
            className="w-full max-w-xs mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="h-2 bg-graphite-800 rounded-full overflow-hidden mb-2">
              <motion.div
                className="h-full bg-gradient-to-r from-electric-500 via-cyan-400 to-electric-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className="text-sm font-mono text-electric-400">{Math.round(progress)}%</p>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}