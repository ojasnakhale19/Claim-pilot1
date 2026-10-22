'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Wheel3DProps {
  className?: string;
  size?: number;
}

function WheelModel() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
      groupRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.05;
    }
  });

  // Rim material - metallic silver with clearcoat
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbdc3c7,
    metalness: 0.95,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.5,
  });

  // Tire material - rubber
  const tireMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a1a,
    metalness: 0,
    roughness: 0.85,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
  });

  // Brake caliper - electric blue accent
  const brakeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });

  // Brake rotor - dark steel
  const rotorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2d2d2d,
    metalness: 0.8,
    roughness: 0.3,
  });

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Tire */}
      <mesh receiveShadow castShadow>
        <torusGeometry args={[0.48, 0.12, 16, 48]} />
        <primitive object={tireMaterial} />
      </mesh>

      {/* Rim outer barrel */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[0.46, 0.46, 0.1, 32]} />
        <primitive object={rimMaterial} />
      </mesh>

      {/* Rim inner barrel */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.12, 32]} />
        <primitive object={rimMaterial} />
      </mesh>

      {/* Spokes */}
      <group>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} receiveShadow castShadow rotation={[0, 0, (i * Math.PI * 2) / 5]}>
            <boxGeometry args={[0.025, 0.35, 0.1]} />
            <primitive object={rimMaterial} />
          </mesh>
        ))}
      </group>

      {/* Center hub */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.14, 32]} />
        <primitive object={rimMaterial} />
      </mesh>

      {/* Center cap */}
      <mesh receiveShadow castShadow position={[0, 0, 0.07]}>
        <cylinderGeometry args={[0.08, 0.08, 0.02, 32]} />
        <primitive object={rimMaterial} />
      </mesh>

      {/* Brake rotor */}
      <mesh receiveShadow castShadow position={[0, 0, -0.06]}>
        <cylinderGeometry args={[0.28, 0.28, 0.02, 32]} />
        <primitive object={rotorMaterial} />
      </mesh>

      {/* Brake caliper */}
      <mesh receiveShadow castShadow position={[0.38, 0, -0.02]}>
        <boxGeometry args={[0.12, 0.3, 0.1]} />
        <primitive object={brakeMaterial} />
      </mesh>

      {/* Brake pad */}
      <mesh receiveShadow castShadow position={[0.32, 0, -0.02]}>
        <boxGeometry args={[0.04, 0.25, 0.08]} />
        <primitive object={brakeMaterial} />
      </mesh>

      {/* Rim bolts */}
      <group>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} receiveShadow castShadow rotation={[0, 0, (i * Math.PI * 2) / 5]} position={[0.22, 0, 0.05]}>
            <cylinderGeometry args={[0.015, 0.015, 0.03, 16]} />
            <primitive object={rimMaterial} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Lighting() {
  return (
    <>
      {/* Studio key light - cool white */}
      <directionalLight
        position={[5, 10, 5]}
        intensity={2.5}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0001}
      />

      {/* Rim light - electric blue */}
      <directionalLight
        position={[-5, 3, -5]}
        intensity={1.5}
        color="#0ea5e9"
        castShadow={false}
      />

      {/* Fill light - warm */}
      <directionalLight
        position={[-3, 5, 3]}
        intensity={0.8}
        color="#fff8e7"
      />

      {/* Top soft box */}
      <rectAreaLight
        position={[0, 5, 0]}
        color="#ffffff"
        intensity={8}
        width={8}
        height={8}
        lookAt={[0, 0, 0]}
      />

      {/* Side strip lights - cyan */}
      <rectAreaLight
        position={[-6, 2, 0]}
        color="#06b6d4"
        intensity={5}
        width={1}
        height={6}
        lookAt={[0, 0, 0]}
      />

      <rectAreaLight
        position={[6, 2, 0]}
        color="#0ea5e9"
        intensity={5}
        width={1}
        height={6}
        lookAt={[0, 0, 0]}
      />

      {/* Ground reflection plane */}
      <mesh
        position={[0, -0.6, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[20, 20]} />
        <shadowMaterial
          opacity={0.15}
          color="#0ea5e9"
        />
      </mesh>
    </>
  );
}

function Environment() {
  return (
    <>
      {/* Studio environment - dark gradient backdrop */}
      <mesh position={[0, 0, -10]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[40, 30]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          color="#0d0e10"
          transparent
          opacity={1}
        />
      </mesh>

      {/* Floor gradient */}
      <mesh position={[0, -0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial
          color="#0d0e10"
          transparent
          opacity={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}

export function ThreeWheel({ className = '', size = 400 }: Wheel3DProps) {
  const [webglSupported, setWebglSupported] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    setWebglSupported(!!gl);
  }, []);

  if (!webglSupported) {
    return (
      <div
        className={`relative w-full aspect-square max-w-[${size}px] mx-auto ${className}`}
        style={{ background: 'linear-gradient(135deg, #1a1d20 0%, #0d0e10 100%)' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-32 h-32 mx-auto mb-4 rounded-full border-2 border-electric-500/30 animate-pulse-soft" />
            <p className="text-graphite-500 text-sm">WebGL not available</p>
            <p className="text-graphite-600 text-xs mt-1">Showing fallback</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-square max-w-[${size}px] mx-auto ${className}`}>
      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 0.3, 2.5], fov: 35 }}
        shadows={true}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        style={{ outline: 'none' }}
      >
        <color attach="background" args={['#0d0e10']} />
        <fog attach="fog" args={['#0d0e10', 5, 20]} />
        
        <Environment />
        <Lighting />
        <WheelModel />
      </Canvas>
      
      {/* Rim lighting overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-electric-400/10 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-cyan-400/5 via-transparent to-transparent" />
      </div>
    </div>
  );
}

// Lightweight CSS-only alternative for when Three.js isn't desired
export function CSSWheel({ className = '', size = 300 }: Wheel3DProps) {
  return (
    <div
      className={`relative w-full aspect-square max-w-[${size}px] mx-auto ${className}`}
      style={{
        perspective: '1000px',
      }}
    >
      <div
        className="relative w-full h-full transform-style-3d animate-rotate-slow"
        style={{
          transformStyle: 'preserve-3d',
          animation: 'rotate-slow 15s linear infinite',
        }}
      >
        {/* Tire */}
        <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
          <div
            className="relative"
            style={{
              width: '85%',
              height: '85%',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, #1a1a1a 0%, #0a0a0a 70%, #000 100%)',
              boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.5), 0 0 30px rgba(14, 165, 233, 0.1), 0 8px 32px rgba(0,0,0,0.5)',
              border: '3px solid #2a2a2a',
              transform: 'translateZ(20px) rotateX(90deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Tire tread pattern */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 10deg, rgba(255,255,255,0.02) 10deg, rgba(255,255,255,0.02) 12deg)',
                maskImage: 'radial-gradient(circle at center, black 75%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 75%, transparent 100%)',
              }}
            />
          </div>
        </div>

        {/* Rim - outer */}
        <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
          <div
            style={{
              width: '70%',
              height: '70%',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #e8ecf0 0%, #bdc3c7 25%, #95a5a6 50%, #bdc3c7 75%, #e8ecf0 100%)',
              boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.3), inset 0 -2px 10px rgba(0,0,0,0.2), 0 0 40px rgba(14, 165, 233, 0.15)',
              border: '1px solid rgba(255,255,255,0.2)',
              transform: 'translateZ(22px) rotateX(90deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Spokes */}
            <div
              className="absolute inset-0"
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: '4%',
                    height: '55%',
                    background: 'linear-gradient(135deg, #e8ecf0 0%, #bdc3c7 50%, #e8ecf0 100%)',
                    boxShadow: '0 0 10px rgba(14, 165, 233, 0.1)',
                    transformOrigin: 'center bottom',
                    transform: `translate(-50%, -100%) rotate(${i * 72}deg) translateZ(2px)`,
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>

            {/* Center hub */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '22%',
                height: '22%',
                background: 'linear-gradient(135deg, #f0f3f5 0%, #d1d8dd 50%, #bdc3c7 100%)',
                boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.4), inset 0 -2px 8px rgba(0,0,0,0.15), 0 0 20px rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                transform: 'translateZ(8px)',
              }}
            >
              {/* Center cap */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: '55%',
                  height: '55%',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  boxShadow: '0 0 20px rgba(14, 165, 233, 0.5), inset 0 1px 3px rgba(255,255,255,0.3)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Brake rotor */}
        <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
          <div
            style={{
              width: '50%',
              height: '50%',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 50%, #2d2d2d 100%)',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(14, 165, 233, 0.05)',
              border: '1px solid #3d3d3d',
              transform: 'translateZ(18px) rotateX(90deg)',
            }}
          >
            {/* Rotor holes */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 rounded-full bg-black/50"
                  style={{
                    width: '6%',
                    height: '6%',
                    transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-45%) rotate(${-i * 30}deg)`,
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Brake caliper - electric blue */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 transform-style-3d"
          style={{
            width: '20%',
            height: '35%',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            boxShadow: '0 0 30px rgba(14, 165, 233, 0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            borderRadius: '8px',
            transform: 'translateZ(25px) translateX(15%) rotateY(-15deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Caliper piston */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: '25%',
              height: '25%',
              background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
              boxShadow: '0 0 15px rgba(14, 165, 233, 0.8), inset 0 -1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>

        {/* Rim bolts */}
        <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '5%',
                height: '5%',
                background: 'linear-gradient(135deg, #e8ecf0 0%, #bdc3c7 100%)',
                boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.3), inset 0 -1px 3px rgba(0,0,0,0.2), 0 0 10px rgba(14, 165, 233, 0.1)',
                transform: `rotate(${i * 72}deg) translateY(-42%) rotate(${-i * 72}deg) translateZ(24px)`,
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(14, 165, 233, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(20px)',
        }}
      />

      {/* Floor reflection */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-1/4 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(14, 165, 233, 0.08), transparent)',
          borderRadius: '50%',
          filter: 'blur(30px)',
          transform: 'scaleX(0.8)',
        }}
      />
    </div>
  );
}