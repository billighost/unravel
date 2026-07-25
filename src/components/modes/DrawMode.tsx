'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RotateCcw, Trash2, Box } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { sampleCanvasToGrid } from '@/lib/imageSampler';
import { qualityTierManager } from '@/lib/qualityTier';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

const BRUSH_SIZES = [
  { label: 'S', radius: 4 },
  { label: 'M', radius: 10 },
  { label: 'L', radius: 20 },
];

export const DrawMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentColor, setCurrentColor] = useState('#FF3B30'); // Accent Red default
  const [currentSize, setCurrentSize] = useState(BRUSH_SIZES[1].radius);
  const [isDrawing, setIsDrawing] = useState(false);

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

  // Continuous stroke drawing using line interpolation & rounded lineCap/lineJoin
  const drawStrokeLine = (fromX: number, fromY: number, toX: number, toY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = currentColor;
    ctx.fillStyle = currentColor;
    ctx.lineWidth = currentSize * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const coords = getCanvasCoords(e);
    const now = performance.now();
    lastPointRef.current = { x: coords.x, y: coords.y, time: now };

    // Draw single dot at start
    drawStrokeLine(coords.x, coords.y, coords.x, coords.y);

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
    drawStrokeLine(lastPointRef.current.x, lastPointRef.current.y, coords.x, coords.y);

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

        <MuteButton />
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
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            display: 'block',
            width: 'min(90vw, 600px)',
            height: 'min(50vh, 360px)',
          }}
        />
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
          {/* Custom Touch-Friendly Color Picker Trigger */}
          <ColorPicker currentColor={currentColor} onChange={setCurrentColor} />

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

          {/* Compact Secondary Group (Undo & Start Over) */}
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

