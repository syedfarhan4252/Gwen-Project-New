import React, { useRef, useState } from 'react';
import { Mic, MicOff, Monitor, Send, X } from 'lucide-react';
import type { GwenState, OverlaySize, OverlayStyle } from '../types/gwen';

interface FloatingOverlayAvatarProps {
  visible: boolean;
  state: GwenState;
  styleVariant: OverlayStyle;
  sizeVariant: OverlaySize;
  isConnected: boolean;
  isScreenSharing: boolean;
  onWakeOrToggleVoice: () => void;
  onQuickCommand: (commandText: string) => void;
  onToggleScreenShare: () => void;
  onDismiss: () => void;
}

const SIZE_MAP: Record<OverlaySize, number> = {
  compact: 54,
  standard: 64,
  large: 76,
};

export const FloatingOverlayAvatar: React.FC<FloatingOverlayAvatarProps> = ({
  visible,
  state,
  styleVariant,
  sizeVariant,
  isConnected,
  isScreenSharing,
  onWakeOrToggleVoice,
  onQuickCommand,
  onToggleScreenShare,
  onDismiss,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 96) : 24,
    y: typeof window !== 'undefined' ? Math.max(96, window.innerHeight - 196) : 240,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismiss, setIsOverDismiss] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInput, setQuickInput] = useState('');

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef<number>(0);

  if (!visible) return null;

  const diameter = SIZE_MAP[sizeVariant];

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 6) {
      dragRef.current.moved = true;
      setIsDragging(true);
    }
    if (!dragRef.current.moved) return;

    const nextX = Math.max(12, Math.min(window.innerWidth - diameter - 12, dragRef.current.origX + dx));
    const nextY = Math.max(12, Math.min(window.innerHeight - diameter - 12, dragRef.current.origY + dy));
    setPos({ x: nextX, y: nextY });

    // Check bottom-center dismiss target
    const centerX = nextX + diameter / 2;
    const centerY = nextY + diameter / 2;
    const nearDismiss =
      centerY > window.innerHeight - 115 &&
      Math.abs(centerX - window.innerWidth / 2) < 92;
    setIsOverDismiss(nearDismiss);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (wasMoved) {
      setIsDragging(false);
      if (isOverDismiss) {
        setIsOverDismiss(false);
        setQuickOpen(false);
        onDismiss();
        return;
      }
      setIsOverDismiss(false);
      return;
    }

    // Tap vs double-tap
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      setQuickOpen((prev) => !prev);
    } else {
      lastTapRef.current = now;
      window.setTimeout(() => {
        if (lastTapRef.current !== 0) {
          lastTapRef.current = 0;
          onWakeOrToggleVoice();
        }
      }, 280);
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onQuickCommand(quickInput.trim());
    setQuickInput('');
    setQuickOpen(false);
  };

  const stateLabel =
    state === 'listening'
      ? 'Listening'
      : state === 'speaking'
        ? 'Speaking'
        : state === 'thinking' || state === 'connecting'
          ? 'Thinking'
          : 'Ready';

  const ringClass =
    state === 'speaking'
      ? 'ring-4 ring-[var(--accent)] scale-105'
      : state === 'listening'
        ? 'ring-2 ring-[var(--accent)]'
        : state === 'thinking' || state === 'connecting'
          ? 'ring-2 ring-[var(--orb-secondary)]'
          : 'ring-1 ring-[var(--border-strong)]';

  return (
    <>
      {/* Drag-to-Dismiss Drop Zone */}
      {isDragging && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-3 text-xs font-medium transition-transform duration-150 pointer-events-none"
          style={{
            backgroundColor: isOverDismiss ? 'var(--danger)' : 'var(--bg-elevated)',
            color: isOverDismiss ? '#ffffff' : 'var(--text-secondary)',
            border: '1px solid var(--border-strong)',
            transform: isOverDismiss ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          <X className="h-4 w-4" />
          <span className="whitespace-nowrap">Drop here to hide avatar</span>
        </div>
      )}

      {/* Quick Command Popover (Double-Tap) */}
      {quickOpen && (
        <div
          className="fixed z-50 w-72 rounded-2xl p-3 shadow-2xl border"
          style={{
            left: Math.max(12, Math.min(window.innerWidth - 300, pos.x - 210)),
            top: Math.max(16, Math.min(window.innerHeight - 190, pos.y - 138)),
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Gwen Quick Command · {stateLabel}
            </span>
            <button
              type="button"
              onClick={() => setQuickOpen(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Close quick command"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <form onSubmit={handleQuickSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Say or type a command..."
              className="flex-1 h-10 rounded-xl px-3 text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
              aria-label="Run command"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onWakeOrToggleVoice}
              className="flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              {isConnected ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{isConnected ? 'End Voice' : 'Talk Live'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleScreenShare}
              className="flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>{isScreenSharing ? 'Stop Screen' : 'Share Screen'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Draggable Floating Avatar Button */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Tap to talk · Double-tap for quick command · Drag to move or dismiss"
        aria-label={`Floating Gwen Avatar (${stateLabel}). Tap to toggle voice, double-tap for quick command.`}
        className={`fixed z-50 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-150 select-none touch-none cursor-grab active:cursor-grabbing ${ringClass}`}
        style={{
          left: pos.x,
          top: pos.y,
          width: diameter,
          height: diameter,
          background:
            styleVariant === 'orb'
              ? 'radial-gradient(circle at 30% 30%, var(--orb-core), var(--accent) 45%, var(--orb-secondary))'
              : styleVariant === 'ring'
                ? 'var(--bg-surface)'
                : 'var(--bg-elevated)',
          border:
            styleVariant === 'ring'
              ? '3px solid var(--accent)'
              : '1px solid var(--border-strong)',
        }}
      >
        <span
          className="font-display font-semibold tracking-tight select-none"
          style={{
            fontSize: sizeVariant === 'compact' ? 16 : sizeVariant === 'large' ? 22 : 18,
            color: styleVariant === 'orb' ? 'var(--accent-contrast)' : 'var(--accent)',
          }}
        >
          G
        </span>
      </button>
    </>
  );
};
