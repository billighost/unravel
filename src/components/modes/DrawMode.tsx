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
  { label: '1', radius: 3, name: 'Extra Fine' },
  { label: '2', radius: 9, name: 'Fine' },
  { label: '3', radius: 18, name: 'Medium' },
  { label: '4', radius: 30, name: 'Thick' },
  { label: '5', radius: 45, name: 'Extra Thick' },
  { label: '6', radius: 60, name: 'Jumbo' },
];

type BrushType = 'marker' | 'chalk' | 'spray' | 'calligraphy' | 'eraser';

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
  { id: 'eraser', label: 'ERASER', desc: 'Clear drawn strokes' },
];

const BG_COLORS = [
  { hex: '#000000', label: 'DARK' },
  { hex: '#1A1A1A', label: 'CHARCOAL' },
  { hex: '#F7F6F2', label: 'CREAM' },
  { hex: '#FFFFFF', label: 'WHITE' },
  { hex: '#0B132B', label: 'NAVY' },
  { hex: '#1B3B2B', label: 'FOREST' },
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

  // Background and additional popover states
  const [canvasBgColor, setCanvasBgColor] = useState('#000000');
  const [isBgPickerOpen, setIsBgPickerOpen] = useState(false);
  const [isSizePickerOpen, setIsSizePickerOpen] = useState(false);

  // Popover positioning elements & coords
  const brushBtnRef = useRef<HTMLButtonElement>(null);
  const sizeBtnRef = useRef<HTMLButtonElement>(null);
  const bgBtnRef = useRef<HTMLButtonElement>(null);
  const [brushCoords, setBrushCoords] = useState({ left: 0, bottom: 0 });
  const [sizeCoords, setSizeCoords] = useState({ left: 0, bottom: 0 });
  const [bgCoords, setBgCoords] = useState({ left: 0, bottom: 0 });

  // Stroke tracking
  const lastPointRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Undo history, stored as canvas snapshots.
  //
  // This used to hold up to 30 ImageData objects. At 1800x1200 that is 8.6 MB
  // per entry — a quarter of a gigabyte of JS heap at full depth — and every
  // entry cost a synchronous GPU->CPU readback, which is what triggered the
  // "Multiple readback operations using getImageData" warning and the long
  // frames after each stroke. drawImage into an offscreen canvas keeps the
  // pixels GPU-side and needs no readback at all.
  const historyRef = useRef<HTMLCanvasElement[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const MAX_HISTORY = 10;

  const snapshotCanvas = (source: HTMLCanvasElement): HTMLCanvasElement | null => {
    const snap = document.createElement('canvas');
    snap.width = source.width;
    snap.height = source.height;
    const snapCtx = snap.getContext('2d');
    if (!snapCtx) return null;
    snapCtx.drawImage(source, 0, 0);
    return snap;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1800;
    canvas.height = 1200;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Keep initial canvas transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save initial (blank) state
    const initial = snapshotCanvas(canvas);
    historyRef.current = initial ? [initial] : [];
    setCanUndo(false);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const snap = snapshotCanvas(canvas);
    if (!snap) return;

    if (historyRef.current.length >= MAX_HISTORY) {
      historyRef.current.shift();
    }
    historyRef.current.push(snap);
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
    // Clear first: the eraser brush composites with destination-out, so the
    // snapshot has real transparency that a plain draw-over would not restore.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(lastState, 0, 0);
    setCanUndo(historyRef.current.length > 1);
  };

  const handleStartOver = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const blank = snapshotCanvas(canvas);
    historyRef.current = blank ? [blank] : [];
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

    ctx.save();
    if (currentBrush === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    switch (currentBrush) {
      case 'eraser':
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
        break;
      }
    }
    ctx.restore();
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
    
    // Create temporary canvas to fill the chosen background color under drawing
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.fillStyle = canvasBgColor;
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(canvas, 0, 0);
    }

    const tierDraw = qualityTierManager.getConfig().gridResolutionDraw;
    const sampled = sampleCanvasToGrid(tempCtx ? tempCanvas : canvas, tierDraw);
    setGridData(sampled);
  };


  // Trigger actions to measure button positions and toggle popovers
  const handleOpenBrushPicker = () => {
    soundEngine.playUIClick();
    if (!isBrushPickerOpen && brushBtnRef.current) {
      const rect = brushBtnRef.current.getBoundingClientRect();
      setBrushCoords({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top,
      });
    }
    setIsBrushPickerOpen(!isBrushPickerOpen);
    setIsSizePickerOpen(false);
    setIsBgPickerOpen(false);
  };

  const handleOpenSizePicker = () => {
    soundEngine.playUIClick();
    if (!isSizePickerOpen && sizeBtnRef.current) {
      const rect = sizeBtnRef.current.getBoundingClientRect();
      setSizeCoords({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top,
      });
    }
    setIsSizePickerOpen(!isSizePickerOpen);
    setIsBrushPickerOpen(false);
    setIsBgPickerOpen(false);
  };

  const handleOpenBgPicker = () => {
    soundEngine.playUIClick();
    if (!isBgPickerOpen && bgBtnRef.current) {
      const rect = bgBtnRef.current.getBoundingClientRect();
      setBgCoords({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top,
      });
    }
    setIsBgPickerOpen(!isBgPickerOpen);
    setIsBrushPickerOpen(false);
    setIsSizePickerOpen(false);
  };

  // Backdrops
  const brushPickerBackdrop = isBrushPickerOpen ? (
    <div onClick={() => setIsBrushPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 230 }} />
  ) : null;

  const sizePickerBackdrop = isSizePickerOpen ? (
    <div onClick={() => setIsSizePickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 230 }} />
  ) : null;

  const bgPickerBackdrop = isBgPickerOpen ? (
    <div onClick={() => setIsBgPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 230 }} />
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
          ref={brushBtnRef}
          onClick={handleOpenBrushPicker}
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
                position: 'fixed',
                bottom: `${brushCoords.bottom + 12}px`,
                left: `${brushCoords.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 250,
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

      {/* Brush Size Picker with Popover */}
      <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        <button
          ref={sizeBtnRef}
          onClick={handleOpenSizePicker}
          aria-label="Select Brush Size"
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
          <span className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--ink)' }}>
            SIZE: {BRUSH_SIZES.find(b => b.radius === currentSize)?.label}
          </span>
        </button>

        {sizePickerBackdrop}

        <AnimatePresence>
          {isSizePickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'fixed',
                bottom: `${sizeCoords.bottom + 12}px`,
                left: `${sizeCoords.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 250,
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
              {BRUSH_SIZES.map((b) => (
                <button
                  key={b.label}
                  onClick={() => {
                    soundEngine.playUIClick();
                    setCurrentSize(b.radius);
                    setIsSizePickerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.6rem',
                    backgroundColor: currentSize === b.radius ? 'var(--ink)' : 'var(--surface)',
                    color: currentSize === b.radius ? '#FFFFFF' : 'var(--ink)',
                    border: '2px solid var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="font-heading" style={{ fontSize: '0.7rem' }}>Lvl {b.label}</span>
                  <span style={{ fontSize: '0.55rem', opacity: 0.7, fontFamily: 'var(--font-body)' }}>{b.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border)', flexShrink: 0 }} />

      {/* Canvas Background Color Selector */}
      <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        <button
          ref={bgBtnRef}
          onClick={handleOpenBgPicker}
          aria-label="Select Canvas Background"
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
          <div
            style={{
              width: '12px',
              height: '12px',
              backgroundColor: canvasBgColor,
              border: '1px solid var(--ink)',
            }}
          />
          <span className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--ink)' }}>
            BG
          </span>
        </button>

        {bgPickerBackdrop}

        <AnimatePresence>
          {isBgPickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'fixed',
                bottom: `${bgCoords.bottom + 12}px`,
                left: `${bgCoords.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 250,
                backgroundColor: 'var(--surface)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                padding: '0.5rem',
                width: '160px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.4rem',
              }}
            >
              {BG_COLORS.map((bg) => (
                <button
                  key={bg.hex}
                  onClick={() => {
                    soundEngine.playUIClick();
                    setCanvasBgColor(bg.hex);
                    setIsBgPickerOpen(false);
                  }}
                  title={bg.label}
                  aria-label={`Background ${bg.label}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: bg.hex,
                    border: canvasBgColor === bg.hex ? '3px solid var(--accent)' : '2px solid var(--ink)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
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

  // --- Unified Layout containing the Canvas node in same hierarchy to preserve context ---
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={isFullscreen ? {
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
      } : {
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
      {!isFullscreen && (
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
      )}

      {/* Main Drawing Canvas Board Wrapper */}
      <div
        style={isFullscreen ? {
          flex: 1,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
          backgroundColor: canvasBgColor,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        } : {
          border: '4px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          backgroundColor: canvasBgColor,
          borderRadius: 0,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
          width: 'min(90vw, 600px)',
          aspectRatio: '3/2',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={isFullscreen ? {
            display: 'block',
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: '3/2',
            objectFit: 'contain',
          } : {
            display: 'block',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {/* Exit fullscreen button (always visible top-right in fullscreen) */}
      {isFullscreen && (
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
      )}

      {/* Bottom Toolbar Area */}
      {isFullscreen ? (
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
      ) : (
        /* Minimal Bottom Toolbar (Normal Mode) */
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
      )}
    </motion.div>
  );
};

