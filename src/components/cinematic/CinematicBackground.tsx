import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface CinematicBackgroundProps {
  className?: string;
  isHero?: boolean;
}

export function CinematicBackground({ className = '', isHero = false }: CinematicBackgroundProps) {
  const [loaded, setLoaded] = useState(false);
  const heroImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/hero-car.svg';
    img.onload = () => setLoaded(true);
    img.onerror = () => setLoaded(true);
    heroImageRef.current = img;
  }, []);

  return (
    <div className={`fixed inset-0 z-0 ${className}`} aria-hidden="true">
      {/* Base gradient layer */}
      <div className="absolute inset-0 bg-hero-gradient" />

      {/* Radial glow from top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[60vh] bg-radial-glow opacity-60" />

      {/* Carbon fiber texture */}
      <div className="absolute inset-0 bg-carbon-fiber opacity-30" />

      {/* Asphalt texture */}
      <div className="absolute inset-0 bg-asphalt opacity-20" />

      {/* Technical grid overlay */}
      <div className="absolute inset-0 bg-grid-tech opacity-40" />

      {/* Hero car image - right side */}
      {isHero && loaded && heroImageRef.current && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 1.1 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          className="absolute right-0 bottom-0 h-[70vh] max-h-[600px] w-auto max-w-[60vw] pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to left, transparent 0%, black 30%)',
            WebkitMaskImage: 'linear-gradient(to left, transparent 0%, black 30%)',
          }}
        >
          <img
            ref={heroImageRef}
            src="/hero-car.svg"
            alt="Premium electric vehicle in inspection bay"
            className="h-full w-auto object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)] hero-float"
          />
        </motion.div>
      )}

      {/* Floor reflection */}
      {isHero && (
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent" />
      )}

      {/* Single electric light sweep on load */}
      {isHero && (
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          initial={{ opacity: 0, x: '-150%' }}
          animate={{ opacity: [0, 1, 1, 0], x: ['-150%', '0%', '150%', '150%'] }}
          transition={{ duration: 2.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(14, 165, 233, 0.1), rgba(6, 182, 212, 0.2), rgba(14, 165, 233, 0.1), transparent)',
            filter: 'blur(1px)',
          }}
        />
      )}

      {/* Single vertical sweep on load */}
      {isHero && (
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden opacity-50"
          initial={{ opacity: 0, y: '-150%' }}
          animate={{ opacity: [0, 1, 1, 0], y: ['-150%', '0%', '150%', '150%'] }}
          transition={{ duration: 2.5, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(6, 182, 212, 0.1), rgba(34, 211, 238, 0.2), rgba(6, 182, 212, 0.1), transparent)',
            filter: 'blur(1px)',
          }}
        />
      )}

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />

      {/* Noise texture */}
      <div className="absolute inset-0 noise-overlay pointer-events-none" />
    </div>
  );
}