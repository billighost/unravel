'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '@/lib/audio/soundEngine';

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let r = 0, g = 0, b = 0;
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16) / 255;
    g = parseInt(clean.substring(2, 4), 16) / 255;
    b = parseInt(clean.substring(4, 6), 16) / 255;
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

interface ColorPickerProps {
  currentColor: string;
  onChange: (color: string) => void;
}

const PRESET_QUICK_SWATCHES = [
  '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#000000'
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ currentColor, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hue, setHue] = useState(0);        // 0..360
  const [sat, setSat] = useState(1);        // 0..1
  const [val, setVal] = useState(1);        // 0..1

  const satValRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [triggerCoords, setTriggerCoords] = useState({ left: 0, bottom: 0 });
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);

  // Sync H, S, V from currentColor when the panel opens
  useEffect(() => {
    if (isOpen && currentColor) {
      const hsv = hexToHsv(currentColor);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
    }
  }, [isOpen, currentColor]);

  const updateColor = useCallback((h: number, s: number, v: number) => {
    setHue(h);
    setSat(s);
    setVal(v);
    const hex = hsvToHex(h, s, v);
    onChange(hex);
  }, [onChange]);

  // Saturation / Value Drag Handler
  const handleSatValPointer = useCallback((e: PointerEvent | React.PointerEvent<HTMLDivElement>) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const s = x / rect.width;
    const v = 1 - y / rect.height;
    updateColor(hue, s, v);
  }, [hue, updateColor]);

  const handleSatValDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSatVal.current = true;
    soundEngine.playUIClickQuiet();
    handleSatValPointer(e);
  }, [handleSatValPointer]);

  // Hue Drag Handler
  const handleHuePointer = useCallback((e: PointerEvent | React.PointerEvent<HTMLDivElement>) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const h = (x / rect.width) * 360;
    updateColor(Math.min(359.9, h), sat, val);
  }, [sat, val, updateColor]);

  const handleHueDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingHue.current = true;
    soundEngine.playUIClickQuiet();
    handleHuePointer(e);
  }, [handleHuePointer]);

  // Window-level move and up handlers for reliable drag tracking
  useEffect(() => {
    const handleWindowMove = (e: PointerEvent) => {
      if (isDraggingSatVal.current) {
        handleSatValPointer(e);
      }
      if (isDraggingHue.current) {
        handleHuePointer(e);
      }
    };

    const handleWindowUp = () => {
      isDraggingSatVal.current = false;
      isDraggingHue.current = false;
    };

    if (isOpen) {
      window.addEventListener('pointermove', handleWindowMove);
      window.addEventListener('pointerup', handleWindowUp);
    }

    return () => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
    };
  }, [isOpen, handleSatValPointer, handleHuePointer]);

  const toggleOpen = () => {
    soundEngine.playUIClick();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTriggerCoords({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top,
      });
    }
    setIsOpen(!isOpen);
  };

  const handleDismiss = () => {
    soundEngine.playUIClick();
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Current Color Swatch Trigger Button */}
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label="Open Color Picker"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.4rem 0.75rem',
          backgroundColor: 'var(--surface)',
          border: '3px solid var(--ink)',
          boxShadow: '3px 3px 0 var(--ink)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <div
          style={{
            width: '26px',
            height: '26px',
            backgroundColor: currentColor,
            border: '2px solid var(--ink)',
          }}
        />
        <span className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>
          COLOR
        </span>
      </button>

      {/* Oversized Touch-Friendly Color Picker Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop click to close */}
            <div
              onClick={handleDismiss}
              style={{ position: 'fixed', inset: 0, zIndex: 240 }}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                bottom: `${triggerCoords.bottom + 12}px`,
                left: `${triggerCoords.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 250,
                backgroundColor: 'var(--surface)',
                border: '4px solid var(--ink)',
                boxShadow: '6px 6px 0 var(--ink)',
                padding: '1rem',
                width: '240px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              {/* 2D Saturation / Value Picker Area */}
              <div
                ref={satValRef}
                onPointerDown={handleSatValDown}
                style={{
                  width: '100%',
                  height: '150px',
                  position: 'relative',
                  backgroundColor: `hsl(${hue}, 100%, 50%)`,
                  backgroundImage: `
                    linear-gradient(to top, #000, transparent),
                    linear-gradient(to right, #fff, transparent)
                  `,
                  border: '2px solid var(--ink)',
                  cursor: 'crosshair',
                  touchAction: 'none',
                }}
              >
                {/* Drag Handle Indicator */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${sat * 100}%`,
                    top: `${(1 - val) * 100}%`,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    border: '3px solid #FFFFFF',
                    boxShadow: '0 0 0 2px var(--ink)',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    backgroundColor: currentColor,
                  }}
                />
              </div>

              {/* 1D Hue Bar */}
              <div
                ref={hueRef}
                onPointerDown={handleHueDown}
                style={{
                  width: '100%',
                  height: '28px',
                  position: 'relative',
                  background: 'linear-gradient(to right, red 0%, yellow 17%, lime 33%, cyan 50%, blue 67%, magenta 83%, red 100%)',
                  border: '2px solid var(--ink)',
                  cursor: 'pointer',
                  touchAction: 'none',
                }}
              >
                {/* Hue Slider Indicator */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(hue / 360) * 100}%`,
                    top: '-2px',
                    bottom: '-2px',
                    width: '10px',
                    backgroundColor: '#FFFFFF',
                    border: '2px solid var(--ink)',
                    boxShadow: '2px 0 0 var(--ink)',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              {/* Quick Preset Swatches Row */}
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'space-between' }}>
                {PRESET_QUICK_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    onClick={() => {
                      soundEngine.playUIClick();
                      const hsv = hexToHsv(swatch);
                      setHue(hsv.h);
                      setSat(hsv.s);
                      setVal(hsv.v);
                      onChange(swatch);
                    }}
                    style={{
                      width: '22px',
                      height: '22px',
                      backgroundColor: swatch,
                      border: currentColor === swatch ? '3px solid var(--accent)' : '2px solid var(--ink)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
