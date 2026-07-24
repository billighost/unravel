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
    const sampled = sampleCanvasToGrid(canvas, 65);
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
        padding: '1.5rem',
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
        }}
      >
        <Button variant="secondary" onClick={() => setMode('select')}>
          <ArrowLeft size={18} /> {t('BACK')}
        </Button>

        <Wordmark size="sm" />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <MuteButton />
          <Button variant="primary" onClick={handleConvert}>
            <Box size={18} /> {t('TURN_INTO_CUBES')}
          </Button>
        </div>
      </div>

      {/* Main Drawing Canvas Board (Black for Contrast) */}
      <div
        style={{
          border: '4px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--ink)',
          backgroundColor: '#000000',
          borderRadius: 0,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
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
            height: 'min(60vh, 400px)',
          }}
        />
      </div>

      {/* Minimal Bottom Toolbar */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          maxWidth: '800px',
          width: '100%',
        }}
      >
        {/* Custom Touch-Friendly Color Picker Trigger */}
        <ColorPicker currentColor={currentColor} onChange={setCurrentColor} />

        {/* Brush Sizes */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
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

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{
              padding: '0.5rem 0.85rem',
              fontSize: '0.75rem',
              opacity: canUndo ? 1 : 0.4,
              cursor: canUndo ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCcw size={14} /> {t('UNDO')}
          </Button>
          <Button variant="secondary" onClick={handleStartOver} style={{ padding: '0.5rem 0.85rem', fontSize: '0.75rem' }}>
            <Trash2 size={14} /> {t('CLEAR')}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
