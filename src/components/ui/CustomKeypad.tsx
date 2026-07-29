'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Delete, Check } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';

interface CustomKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  maxLength?: number;
}

export const CustomKeypad: React.FC<CustomKeypadProps> = ({
  value,
  onChange,
  onDone,
  maxLength = 6,
}) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasTriggeredByPointer = useRef(false);
  const activePressedKeyRef = useRef<string | null>(null);
  const [activeRect, setActiveRect] = useState<DOMRect | null>(null);

  // Keep latest value in ref to avoid stale closure during rapid intervals
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['BACKSPACE', '0', 'DONE'],
  ];

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(8);
    }
  };

  const handleKeyPress = (key: string) => {
    soundEngine.playTypeClick();
    triggerHaptic();

    const currentValue = valueRef.current;

    if (key === 'BACKSPACE') {
      onChange(currentValue.slice(0, -1));
    } else if (key === 'DONE') {
      if (onDone) onDone();
    } else {
      if (currentValue.length < maxLength) {
        onChange(currentValue + key);
      }
    }
  };

  const startRepeat = (key: string) => {
    stopRepeat();

    // Trigger immediate key press
    handleKeyPress(key);

    // Don't repeat DONE key
    if (key === 'DONE') return;

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        handleKeyPress(key);
      }, 75);
    }, 400);
  };

  const stopRepeat = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 250 }}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'var(--surface)',
        borderTop: '4px solid var(--ink)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        padding: 'clamp(0.4rem, 1.5vw, 0.75rem) clamp(0.25rem, 2vw, 0.5rem) calc(clamp(0.4rem, 1.5vw, 0.75rem) + env(safe-area-inset-bottom)) clamp(0.25rem, 2vw, 0.5rem)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
        userSelect: 'none',
        pointerEvents: 'auto',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
          width: '100%',
          maxWidth: 'min(320px, 90vw)',
        }}
      >
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
              width: '100%',
            }}
          >
            {row.map((key) => {
              let displayKey = key;
              let icon: React.ReactNode = null;
              let bg = 'var(--bg)';
              let color = 'var(--ink)';

              if (key === 'BACKSPACE') {
                displayKey = '';
                icon = <Delete size={18} />;
              } else if (key === 'DONE') {
                displayKey = '';
                icon = <Check size={18} />;
                bg = 'var(--accent)';
                color = '#FFFFFF';
              }

              return (
                <motion.button
                  key={key}
                  data-virtual-key="true"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    wasTriggeredByPointer.current = true;
                    activePressedKeyRef.current = key;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setActiveRect(rect);
                    startRepeat(key);
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch (err) {}
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    stopRepeat();
                    activePressedKeyRef.current = null;
                    setActiveRect(null);
                    try {
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    } catch (err) {}
                  }}
                  onPointerCancel={(e) => {
                    e.preventDefault();
                    stopRepeat();
                    activePressedKeyRef.current = null;
                    setActiveRect(null);
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    stopRepeat();
                    activePressedKeyRef.current = null;
                    setActiveRect(null);
                  }}
                  onPointerMove={(e) => {
                    if (activePressedKeyRef.current !== key || !activeRect) return;
                    const x = e.clientX;
                    const y = e.clientY;
                    const buffer = 20;
                    if (
                      x < activeRect.left - buffer ||
                      x > activeRect.right + buffer ||
                      y < activeRect.top - buffer ||
                      y > activeRect.bottom + buffer
                    ) {
                      stopRepeat();
                      activePressedKeyRef.current = null;
                      setActiveRect(null);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (wasTriggeredByPointer.current) {
                      wasTriggeredByPointer.current = false;
                      return;
                    }
                    handleKeyPress(key);
                  }}
                  whileTap={{
                    scale: 0.95,
                    x: 2,
                    y: 2,
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                    boxShadow: '0px 0px 0 var(--ink)',
                  }}
                  transition={{ duration: 0.08 }}
                  style={{
                    flex: '1',
                    height: 'clamp(38px, 12vw, 56px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                    color: color,
                    border: '2px solid var(--ink)',
                    boxShadow: '2px 2px 0 var(--ink)',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'clamp(0.85rem, 4.5vw, 1.25rem)',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    borderRadius: 0,
                    outline: 'none',
                    touchAction: 'manipulation',
                    padding: 0,
                    minWidth: 0,
                  }}
                >
                  {icon ? icon : displayKey}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
