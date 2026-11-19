import React, { useEffect, useRef } from 'react';
import type { GwenState, ThemeId } from '../types/gwen';

interface VoiceOrbProps {
  state: GwenState;
  audioLevel: number;
  themeId: ThemeId;
  customAccent: string | null;
  size?: number;
  isPushToTalk?: boolean;
  isPttActive?: boolean;
  onPrimaryClick: () => void;
  onPttStart?: () => void;
  onPttEnd?: () => void;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  audioLevel,
  themeId,
  customAccent,
  size = 248,
  isPushToTalk = false,
  isPttActive = false,
  onPrimaryClick,
  onPttStart,
  onPttEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelRef = useRef(audioLevel);
  levelRef.current = audioLevel;
  const smoothLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let rafId = 0;
    let phase = 0;

    const getThemeColors = () => {
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue('--accent').trim() || '#2dd4bf';
      const secondary = style.getPropertyValue('--orb-secondary').trim() || '#38bdf8';
      const core = style.getPropertyValue('--orb-core').trim() || '#ecfeff';
      const danger = style.getPropertyValue('--danger').trim() || '#f87171';
      return { accent, secondary, core, danger };
    };

    const draw = () => {
      const { accent, secondary, core, danger } = getThemeColors();
      const currentState = stateRef.current;
      const targetLevel = levelRef.current;
      smoothLevelRef.current += (targetLevel - smoothLevelRef.current) * 0.16;
      const amp = prefersReducedMotion ? 0.05 : smoothLevelRef.current;

      const speed =
        currentState === 'speaking'
          ? 0.055
          : currentState === 'thinking' || currentState === 'connecting'
            ? 0.045
            : currentState === 'listening'
              ? 0.032
              : 0.014;
      phase += prefersReducedMotion ? 0.002 : speed;

      const cx = size / 2;
      const cy = size / 2;
      ctx.clearRect(0, 0, size, size);

      const primaryColor = currentState === 'error' ? danger : accent;
      const baseRadius = size * 0.28;
      const breath =
        currentState === 'idle'
          ? Math.sin(phase) * 3.5
          : currentState === 'speaking'
            ? Math.sin(phase * 1.8) * 5 + amp * 20
            : currentState === 'listening'
              ? Math.sin(phase * 1.3) * 3 + amp * 18
              : Math.sin(phase * 2) * 4;

      const activeRadius = baseRadius + breath;

      // Outer atmospheric halo
      const haloGrad = ctx.createRadialGradient(
        cx,
        cy,
        activeRadius * 0.65,
        cx,
        cy,
        size * 0.49
      );
      haloGrad.addColorStop(0, `${primaryColor}40`);
      haloGrad.addColorStop(0.55, `${secondary}18`);
      haloGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.49, 0, Math.PI * 2);
      ctx.fill();

      // Acoustic harmonic rings
      const ringCount = currentState === 'idle' ? 2 : 3;
      for (let r = 0; r < ringCount; r++) {
        const ringRadius =
          activeRadius +
          12 +
          r * 13 +
          (currentState === 'speaking' || currentState === 'listening'
            ? amp * (10 + r * 6)
            : 0);

        ctx.save();
        ctx.beginPath();
        const segments = 96;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const wave1 = Math.sin(theta * (3 + r) + phase * (1.2 + r * 0.35));
          const wave2 = Math.cos(theta * (5 - r) - phase * 1.4);
          const distortionScale =
            currentState === 'idle'
              ? 1.8
              : currentState === 'thinking' || currentState === 'connecting'
                ? 4.2
                : 3 + amp * 14;
          const rad = ringRadius + (wave1 * 0.6 + wave2 * 0.4) * distortionScale;
          const x = cx + Math.cos(theta) * rad;
          const y = cy + Math.sin(theta) * rad;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = r % 2 === 0 ? primaryColor : secondary;
        ctx.globalAlpha = Math.max(0.14, 0.42 - r * 0.11 + amp * 0.22);
        ctx.lineWidth = r === 0 ? 1.8 : 1.1;
        ctx.stroke();
        ctx.restore();
      }

      // Main fluid core sphere
      ctx.save();
      ctx.beginPath();
      const coreSegments = 80;
      for (let i = 0; i <= coreSegments; i++) {
        const theta = (i / coreSegments) * Math.PI * 2;
        const wobble =
          currentState === 'idle'
            ? Math.sin(theta * 3 + phase) * 1.4
            : (Math.sin(theta * 4 + phase * 1.6) + Math.cos(theta * 3 - phase * 1.2)) *
              (2.2 + amp * 8);
        const r = activeRadius + wobble;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const sphereGrad = ctx.createRadialGradient(
        cx - activeRadius * 0.28,
        cy - activeRadius * 0.28,
        activeRadius * 0.08,
        cx,
        cy,
        activeRadius * 1.15
      );
      sphereGrad.addColorStop(0, core);
      sphereGrad.addColorStop(0.35, primaryColor);
      sphereGrad.addColorStop(1, secondary);

      ctx.fillStyle = sphereGrad;
      ctx.fill();
      ctx.restore();

      // Inner soft specular ring for tactile depth
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = core;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [size, themeId, customAccent]);

  const ariaLabel =
    state === 'idle'
      ? 'Start live voice conversation with Gwen'
      : isPushToTalk
        ? isPttActive
          ? 'Release to finish speaking'
          : 'Hold to speak to Gwen'
        : state === 'speaking'
          ? 'Tap to interrupt Gwen or pause'
          : 'End live voice conversation with Gwen';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        if (!isPushToTalk || state === 'idle' || state === 'error') {
          onPrimaryClick();
        }
      }}
      onPointerDown={() => {
        if (isPushToTalk && state !== 'idle' && state !== 'error') {
          onPttStart?.();
        }
      }}
      onPointerUp={() => {
        if (isPushToTalk && state !== 'idle' && state !== 'error') {
          onPttEnd?.();
        }
      }}
      onPointerLeave={() => {
        if (isPushToTalk && isPttActive) {
          onPttEnd?.();
        }
      }}
      className="group relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-canvas)] transition-transform duration-150 active:scale-[0.97] select-none touch-none cursor-pointer"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="pointer-events-none block"
      />
      <span className="sr-only">{ariaLabel}</span>
    </button>
  );
};
