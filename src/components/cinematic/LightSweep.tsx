import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface LightSweepProps {
  className?: string;
  trigger?: boolean;
  duration?: number;
  color?: 'electric' | 'cyan' | 'amber';
  direction?: 'ltr' | 'rtl' | 'ttb' | 'btt';
  onComplete?: () => void;
}

export function LightSweep({
  className = '',
  trigger = false,
  duration = 1.5,
  color = 'electric',
  direction = 'ltr',
  onComplete,
}: LightSweepProps) {
  const [animate, setAnimate] = useState(false);
  const completedRef = useRef(false);

  const colors = {
    electric: 'linear-gradient(90deg, transparent, rgba(14, 165, 233, 0.15), rgba(6, 182, 212, 0.3), rgba(14, 165, 233, 0.15), transparent)',
    cyan: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.15), rgba(34, 211, 238, 0.3), rgba(6, 182, 212, 0.15), transparent)',
    amber: 'linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.3), rgba(251, 191, 36, 0.15), transparent)',
  };

  const transforms: Record<'ltr' | 'rtl' | 'ttb' | 'btt', { x?: string[]; y?: string[] }> = {
    ltr: { x: ['-120%', '120%'] },
    rtl: { x: ['120%', '-120%'] },
    ttb: { y: ['-120%', '120%'] },
    btt: { y: ['120%', '-120%'] },
  };

  useEffect(() => {
    if (trigger && !completedRef.current) {
      setAnimate(true);
      completedRef.current = true;
      setTimeout(() => {
        setAnimate(false);
        completedRef.current = false;
        onComplete?.();
      }, duration * 1000);
    } else if (!trigger) {
      completedRef.current = false;
    }
  }, [trigger, duration, onComplete]);

  if (!animate) return null;

  const transformProps = transforms[direction];
  const isVertical = direction === 'ttb' || direction === 'btt';
  const initialTransform = isVertical ? { y: transformProps.y![0] } : { x: transformProps.x![0] };
  const animateTransform = isVertical ? { y: transformProps.y } : { x: transformProps.x };

  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      initial={{ opacity: 0, ...initialTransform }}
      animate={{ opacity: [0, 1, 1, 0], ...animateTransform }}
      exit={{ opacity: 0 }}
      transition={{ duration, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        background: colors[color],
        filter: 'blur(1px)',
      }}
    />
  );
}

interface InspectionLightSweepProps {
  className?: string;
  autoPlay?: boolean;
  interval?: number;
}

export function InspectionLightSweep({ className = '', autoPlay = false, interval = 8000 }: InspectionLightSweepProps) {
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    
    const runSweep = () => {
      setTrigger(true);
      setTimeout(() => setTrigger(false), 2000);
    };

    runSweep();
    const timer = setInterval(runSweep, interval);
    return () => clearInterval(timer);
  }, [autoPlay, interval]);

  return (
    <>
      <LightSweep
        trigger={trigger}
        duration={2}
        color="electric"
        direction="ltr"
        className={className}
      />
      {/* Vertical sweep for cross pattern */}
      <LightSweep
        trigger={trigger}
        duration={2}
        color="cyan"
        direction="ttb"
        className={`${className} opacity-50`}
      />
    </>
  );
}

interface StageTransitionProps {
  children: React.ReactNode;
  previousStage?: string;
  className?: string;
  transitionType?: 'sweep' | 'fade' | 'slide' | 'iris';
}

export function StageTransition({
  children,
  previousStage,
  className = '',
  transitionType = 'sweep',
}: StageTransitionProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevStageRef = useRef(previousStage);

  useEffect(() => {
    if (previousStage && previousStage !== prevStageRef.current) {
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 500);
    }
    prevStageRef.current = previousStage;
  }, [previousStage]);

  const transitionStyles = {
    sweep: {
      initial: { clipPath: 'inset(0 100% 0 0)' },
      animate: { clipPath: 'inset(0 0% 0 0)' },
      exit: { clipPath: 'inset(0 0 0 100%)' },
    },
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { opacity: 0, x: 30 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -30 },
    },
    iris: {
      initial: { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
      animate: { clipPath: 'circle(150% at 50% 50%)', opacity: 1 },
      exit: { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
    },
  };

  const style = transitionStyles[transitionType];

  return (
    <motion.div
      className={className}
      initial={style.initial}
      animate={style.animate}
      exit={style.exit}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
      {isTransitioning && (
        <LightSweep
          trigger={true}
          duration={0.5}
          color="electric"
          direction="ltr"
          className="pointer-events-none z-10"
        />
      )}
    </motion.div>
  );
}

export function PageTransition({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({ children, className = '', delay = 0.1 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5,
            delay,
            ease: [0.16, 1, 0.3, 1],
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}