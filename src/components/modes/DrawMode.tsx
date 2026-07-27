'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RotateCcw, Trash2, Box, Paintbrush, Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { ColorPicker, hsvToHex } from '@/components/ui/ColorPicker';
import { sampleCanvasToGrid } from '@/lib/imageSampler';
import { qualityTierManager } from '@/lib/qualityTier';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

const BRUSH_SIZES = [
  { label: 'S', radius: 4 },
  { label: 'M', radius: 10 },
  { label: 'L', radius: 20 },
];

type BrushType = 'marker' | 'chalk' | 'spray' | 'calligraphy';

interface BrushTypeOption {
  id: BrushType;
  label: string;
  desc: string;
}

const BRUSH_TYPES: BrushTypeOption[] = [
  { id: 'marker', label: 'MARKER', desc: 'Clean, solid strokes' },
  { id: 'chalk', label: 'CHALK', desc: 'Textured, rough edges' },
  { id: 'spray', label: 'SPRAY', desc: 'Scattered dot texture' },
  { id: 'calligraphy', label: 'CALLIG.', desc: 'Speed-sensitive width' },
];

/** Generate a fully random pleasant HSB color */
function randomStartColor(): string {
  const h = Math.random() * 360;
  const s = 0.5 + Math.random() * 0.5; // 50-100% saturation
  const v = 0.6 + Math.random() * 0.4; // 60-100% brightness
  return hsvToHex(h, s, v);
}

export const DrawMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentColor, setCurrentColor] = useState(() => randomStartColor());
  const [currentSize, setCurrentSize] = useState(BRUSH_SIZES[1].radius);
  const [currentBrush, setCurrentBrush] = useState<BrushType>('marker');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isBrushPickerOpen, setIsBrushPickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);

  // Stroke tracking
  const lastPointRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Undo history stack (up to 30 states)
  const historyRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 600;
    canvas.height = 400;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill initial black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save initial state
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    setCanUndo(false);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (historyRef.current.length >= 30) {
      historyRef.current.shift();
    }
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setCanUndo(historyRef.current.length > 1);
  };

  const handleUndo = () => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const lastState = historyRef.current[historyRef.current.length - 1];
    const canvas = canvasRef.current;
    if (!canvas || !lastState) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(lastState, 0, 0);
    setCanUndo(historyRef.current.length > 1);
  };

  const handleStartOver = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    setCanUndo(false);
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Draw stroke segment based on brush type
  const drawStrokeSegment = useCallback((
    fromX: number, fromY: number, toX: number, toY: number, speed: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    switch (currentBrush) {
      case 'marker': {
        ctx.strokeStyle = currentColor;
        ctx.fillStyle = currentColor;
        ctx.lineWidth = currentSize * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        break;
      }

      case 'chalk': {
        const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
        const steps = Math.max(1, Math.floor(dist / 2));
        ctx.fillStyle = currentColor;

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = fromX + (toX - fromX) * t;
          const cy = fromY + (toY - fromY) * t;

          // Scatter several semi-transparent dots with varying size
          const dotCount = Math.floor(currentSize * 1.2);
          for (let d = 0; d < dotCount; d++) {
            const offsetX = (Math.random() - 0.5) * currentSize * 2;
            const offsetY = (Math.random() - 0.5) * currentSize * 2;
            const dotRadius = Math.random() * 2.5 + 0.5;
            ctx.globalAlpha = 0.15 + Math.random() * 0.5;
            ctx.beginPath();
            ctx.arc(cx + offsetX, cy + offsetY, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'spray': {
        ctx.fillStyle = currentColor;
        const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
        const steps = Math.max(1, Math.floor(dist / 3));

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = fromX + (toX - fromX) * t;
          const cy = fromY + (toY - fromY) * t;

          const particles = Math.floor(currentSize * 2);
          for (let p = 0; p < particles; p++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * currentSize * 1.5;
            const px = cx + Math.cos(angle) * radius;
            const py = cy + Math.sin(angle) * radius;
            const dotSize = Math.random() * 1.8 + 0.3;
            ctx.globalAlpha = 0.2 + Math.random() * 0.6;
            ctx.beginPath();
            ctx.arc(px, py, dotSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'calligraphy': {
        // Width varies with speed: fast = thin, slow = thick
        const maxWidth = currentSize * 3;
        const minWidth = currentSize * 0.5;
        const clampedSpeed = Math.min(Math.max(speed, 50), 2000);
        const normalizedSpeed = (clampedSpeed - 50) / (2000 - 50);
        const width = maxWidth - normalizedSpeed * (maxWidth - minWidth);

        ctx.strokeStyle = currentColor;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }, [currentBrush, currentColor, currentSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const coords = getCanvasCoords(e);
    const now = performance.now();
    lastPointRef.current = { x: coords.x, y: coords.y, time: now };

    // Draw single dot at start
    drawStrokeSegment(coords.x, coords.y, coords.x, coords.y, 0);

    // Audio start
    soundEngine.startBrush();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPointRef.current) return;

    const coords = getCanvasCoords(e);
    const now = performance.now();
    const dt = Math.max((now - lastPointRef.current.time) / 1000, 0.001);

    const dx = coords.x - lastPointRef.current.x;
    const dy = coords.y - lastPointRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / dt; // px per sec

    // Draw continuous path
    drawStrokeSegment(lastPointRef.current.x, lastPointRef.current.y, coords.x, coords.y, speed);

    lastPointRef.current = { x: coords.x, y: coords.y, time: now };

    // Audio velocity update
    soundEngine.updateBrushVelocity(speed);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
      setIsDrawing(false);
      lastPointRef.current = null;
      soundEngine.stopBrush();
      saveState();
    }
  };

  const handleConvert = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tierDraw = qualityTierManager.getConfig().gridResolutionDraw;
    const sampled = sampleCanvasToGrid(canvas, tierDraw);
    setGridData(sampled);
  };

  // Close brush picker on backdrop click
  const brushPickerBackdrop = isBrushPickerOpen ? (
    <div
      onClick={() => setIsBrushPickerOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 89 }}
    />
  ) : null;

  // --- Toolbar Controls (shared between normal and fullscreen) ---
  const toolbarControls = (
    <>
      {/* Color Picker */}
      <ColorPicker currentColor={currentColor} onChange={setCurrentColor} />

      {/* Divider */}
      <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border)', flexShrink: 0 }} />

      {/* Brush Type Selector */}
      <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setIsBrushPickerOpen(!isBrushPickerOpen);
          }}
          aria-label="Select Brush Type"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.6rem',
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--ink)',
            boxShadow: '2px 2px 0 var(--ink)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <Paintbrush size={16} />
          <span className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--ink)' }}>
            {BRUSH_TYPES.find(b => b.id === currentBrush)?.label}
          </span>
        </button>

        {brushPickerBackdrop}

        <AnimatePresence>
          {isBrushPickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'absolute',
                bottom: '120%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                backgroundColor: 'var(--surface)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                padding: '0.5rem',
                width: '180px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
              }}
            >
              {BRUSH_TYPES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    soundEngine.playUIClick();
                    setCurrentBrush(b.id);
                    setIsBrushPickerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.1rem',
                    padding: '0.45rem 0.5rem',
                    backgroundColor: currentBrush === b.id ? 'var(--ink)' : 'var(--surface)',
                    color: currentBrush === b.id ? '#FFFFFF' : 'var(--ink)',
                    border: '2px solid var(--ink)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span className="font-heading" style={{ fontSize: '0.7rem' }}>{b.label}</span>
                  <span style={{ fontSize: '0.55rem', opacity: 0.7, fontFamily: 'var(--font-body)' }}>{b.desc}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border)', flexShrink: 0 }} />

      {/* Brush Sizes */}
      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
        {BRUSH_SIZES.map((b) => (
          <button
            key={b.label}
            onClick={() => {
              soundEngine.playUIClick();
              setCurrentSize(b.radius);
            }}
            className="font-heading"
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: currentSize === b.radius ? 'var(--ink)' : 'var(--surface)',
              color: currentSize === b.radius ? '#FFFFFF' : 'var(--ink)',
              border: '2px solid var(--ink)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border)', flexShrink: 0 }} />

      {/* Undo & Start Over */}
      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          aria-label="Undo last stroke"
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--surface)',
            color: 'var(--ink)',
            border: '2px solid var(--ink)',
            boxShadow: '1px 1px 0 var(--ink)',
            cursor: canUndo ? 'pointer' : 'not-allowed',
            opacity: canUndo ? 1 : 0.4,
          }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={handleStartOver}
          aria-label="Clear canvas"
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--surface)',
            color: 'var(--accent)',
            border: '2px solid var(--ink)',
            boxShadow: '1px 1px 0 var(--ink)',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </>
  );

  // --- Canvas element ---
  const canvasElement = (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        display: 'block',
        width: isFullscreen ? '100%' : 'min(90vw, 600px)',
        height: isFullscreen ? '100%' : 'min(50vh, 360px)',
        objectFit: 'contain',
      }}
    />
  );

  // --- FULLSCREEN MODE ---
  if (isFullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: '#000000',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Canvas fills everything */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        >
          {canvasElement}
        </div>

        {/* Exit fullscreen button (always visible top-right) */}
        <button
          onClick={() => setIsFullscreen(false)}
          aria-label="Exit fullscreen"
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 210,
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--surface)',
            border: '3px solid var(--ink)',
            boxShadow: '3px 3px 0 var(--ink)',
            cursor: 'pointer',
            color: 'var(--ink)',
          }}
        >
          <Minimize2 size={18} />
        </button>

        {/* Minimizable bottom toolbar */}
        <AnimatePresence>
          {!isToolbarMinimized ? (
            <motion.div
              key="toolbar-expanded"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 210,
                backgroundColor: 'var(--surface)',
                borderTop: '3px solid var(--ink)',
                padding: '0.5rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              {/* Minimize button */}
              <button
                onClick={() => setIsToolbarMinimized(true)}
                aria-label="Minimize toolbar"
                style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--surface)',
                  border: '2px solid var(--ink)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <ChevronDown size={14} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflowX: 'auto', scrollbarWidth: 'none', flex: '1 1 auto' }}>
                {toolbarControls}
              </div>

              <Button
                variant="primary"
                onClick={handleConvert}
                aria-label="Turn drawing into 3D cubes"
                style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', flexShrink: 0 }}
              >
                <Box size={14} />
                <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>CUBES</span>
              </Button>
            </motion.div>
          ) : (
            <motion.button
              key="toolbar-minimized"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setIsToolbarMinimized(false)}
              aria-label="Expand toolbar"
              style={{
                position: 'fixed',
                bottom: '1rem',
                left: '1rem',
                zIndex: 210,
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--surface)',
                border: '3px solid var(--ink)',
                boxShadow: '3px 3px 0 var(--ink)',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              <ChevronUp size={20} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- NORMAL MODE ---
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <Button variant="secondary" onClick={() => setMode('select')} aria-label="Go Back" style={{ padding: '0.6rem 1rem' }}>
          <ArrowLeft size={18} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('BACK')}</span>
        </Button>

        <Wordmark size="sm" />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setIsFullscreen(true)}
            aria-label="Fullscreen canvas"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--ink)',
              boxShadow: '2px 2px 0 var(--ink)',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            <Maximize2 size={16} />
          </button>
          <MuteButton />
        </div>
      </div>

      {/* Main Drawing Canvas Board (Black for Contrast) */}
      <div
        style={{
          border: '4px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          backgroundColor: '#000000',
          borderRadius: 0,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
          maxWidth: '100%',
        }}
      >
        {canvasElement}
      </div>

      {/* Minimal Bottom Toolbar */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          maxWidth: '800px',
          width: '100%',
        }}
      >
        {/* Left Scrollable Tools Area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            flex: '1 1 auto',
            paddingRight: '0.5rem',
          }}
        >
          {toolbarControls}
        </div>

        {/* Right Primary Action */}
        <Button
          variant="primary"
          onClick={handleConvert}
          aria-label="Turn drawing into 3D cubes"
          style={{
            padding: '0.65rem 1.25rem',
            fontSize: '0.8rem',
            flexShrink: 0,
          }}
        >
          <Box size={16} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>CUBES</span>
        </Button>
      </div>
    </motion.div>
  );
};
