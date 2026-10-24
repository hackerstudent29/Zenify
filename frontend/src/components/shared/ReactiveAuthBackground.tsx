'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ReactiveAuthBackgroundProps {
  className?: string;
}

export function ReactiveAuthBackground({ className = '' }: ReactiveAuthBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const mouseTargetRef = useRef({ x: 0.5, y: 0.5, currentX: 0.5, currentY: 0.5 });
  const pulseRef = useRef(0);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      mouseTargetRef.current.x = x;
      mouseTargetRef.current.y = y;
      setMousePos({ x, y });
    };

    const handlePointerDown = () => {
      // Trigger a ripple pulse on interaction
      pulseRef.current = 1.0;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particle nodes for subtle floating ambient dust
    const PARTICLE_COUNT = 32;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.2 - Math.random() * 0.5,
      size: 1 + Math.random() * 2,
      alpha: 0.1 + Math.random() * 0.35,
      hue: Math.random() > 0.5 ? 350 : 340, // Crimson to Rose range
    }));

    // Plasma Blob Definitions
    const blobs = [
      {
        baseX: 0.25,
        baseY: 0.3,
        radius: 0.45,
        color: 'rgba(225, 29, 72, 0.42)', // Radiant Crimson (#E11D48)
        speedX: 0.0006,
        speedY: 0.0008,
        phase: 0,
      },
      {
        baseX: 0.75,
        baseY: 0.65,
        radius: 0.5,
        color: 'rgba(158, 35, 57, 0.45)', // Academic Maroon (#9E2339)
        speedX: -0.0007,
        speedY: 0.0005,
        phase: 2.1,
      },
      {
        baseX: 0.5,
        baseY: 0.8,
        radius: 0.42,
        color: 'rgba(88, 12, 45, 0.55)', // Deep Plum Shadow
        speedX: 0.0005,
        speedY: -0.0006,
        phase: 4.2,
      },
      {
        baseX: 0.8,
        baseY: 0.25,
        radius: 0.38,
        color: 'rgba(251, 113, 133, 0.22)', // Soft Rose Highlight
        speedX: -0.0005,
        speedY: -0.0007,
        phase: 1.5,
      },
    ];

    let t = 0;

    const render = () => {
      t += 0.016;

      // Smooth mouse interpolation
      const mt = mouseTargetRef.current;
      mt.currentX += (mt.x - mt.currentX) * 0.05;
      mt.currentY += (mt.y - mt.currentY) * 0.05;

      // Decay pulse
      if (pulseRef.current > 0.01) {
        pulseRef.current *= 0.94;
      } else {
        pulseRef.current = 0;
      }

      // Base Obsidian Canvas (#121214)
      ctx.fillStyle = '#121214';
      ctx.fillRect(0, 0, width, height);

      // Save context for composite operations
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 1. Render animated fluid blobs with dynamic mouse attraction & breathing
      const breath = Math.sin(t * 1.2) * 0.05;
      const pulseEffect = pulseRef.current * 0.15;

      blobs.forEach((blob) => {
        // Orbit around base with sine oscillation
        const ox = Math.sin(t * blob.speedX * 1000 + blob.phase) * 0.12;
        const oy = Math.cos(t * blob.speedY * 1000 + blob.phase) * 0.12;

        // Subtle pull toward mouse position
        const toMouseX = (mt.currentX - (blob.baseX + ox)) * 0.18;
        const toMouseY = (mt.currentY - (blob.baseY + oy)) * 0.18;

        const posX = (blob.baseX + ox + toMouseX) * width;
        const posY = (blob.baseY + oy + toMouseY) * height;
        const radius = Math.min(width, height) * (blob.radius + breath + pulseEffect);

        const gradient = ctx.createRadialGradient(posX, posY, 0, posX, posY, radius);
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(0.5, blob.color.replace(/[\d\.]+\)$/, '0.15)'));
        gradient.addColorStop(1, 'rgba(18, 18, 20, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(posX, posY, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Interactive Spotlight that directly tracks mouse cursor
      const mouseRadius = Math.min(width, height) * (0.35 + pulseRef.current * 0.2);
      const mouseGrad = ctx.createRadialGradient(
        mt.currentX * width,
        mt.currentY * height,
        0,
        mt.currentX * width,
        mt.currentY * height,
        mouseRadius
      );
      mouseGrad.addColorStop(0, `rgba(244, 63, 94, ${0.28 + pulseRef.current * 0.3})`);
      mouseGrad.addColorStop(0.4, 'rgba(225, 29, 72, 0.12)');
      mouseGrad.addColorStop(1, 'rgba(18, 18, 20, 0)');

      ctx.fillStyle = mouseGrad;
      ctx.beginPath();
      ctx.arc(mt.currentX * width, mt.currentY * height, mouseRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Floating luminous audio dust particles
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        // React slightly to mouse distance
        const dx = p.x - mt.currentX * width;
        const dy = p.y - mt.currentY * height;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180 && dist > 0) {
          const force = (180 - dist) / 180;
          p.x += (dx / dist) * force * 1.5;
          p.y += (dy / dist) * force * 1.5;
        }

        ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className={`fixed inset-0 z-0 overflow-hidden pointer-events-none ${className}`}>
      {/* 60fps Physics-driven Fluid Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
      />

      {/* Reactive Glass Frost Overlay: Softens color bands into an organic Apple Music-style aura */}
      <div 
        className="absolute inset-0 backdrop-blur-[70px] pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(225, 29, 72, 0.08) 0%, transparent 60%)`
        }}
      />

      {/* Cinematic Deep Obsidian Vignette: Ensures inputs and text remain crisp and highly legible */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 25%, rgba(18, 18, 20, 0.65) 75%, #121214 100%)'
        }}
      />

      {/* Subtle Analog Micro-Noise Texture for visual depth */}
      <div 
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  );
}
