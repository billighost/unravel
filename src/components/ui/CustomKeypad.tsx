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

const themeStyles = {
  classic: {
    background: 'var(--surface)',
    ink: 'var(--ink)',
    bg: 'var(--bg)',
    accent: 'var(--accent)',
    text: 'var(--ink)',
  },
  matrix: {
    background: '#050e05',
    ink: '#00ff00',
    bg: '#0a1c0a',
    accent: '#33ff33',
    text: '#00ff00',
  },
  cyberpunk: {
    background: '#000000',
    ink: '#ffd700',
    bg: '#111111',
    accent: '#ff0055',
    text: '#ffd700',
  },
  pink: {
    background: '#fff0f5',
    ink: '#ff1493',
    bg: '#ffe4e1',
    accent: '#ff69b4',
    text: '#ff1493',
  },
};

export const CustomKeypad: React.FC<CustomKeypadProps> = ({
  value,
  onChange,
  onDone,
  maxLength = 6,
}) => {
  const [keyboardTheme, setKeyboardTheme] = useState<'classic' | 'matrix' | 'cyberpunk' | 'pink'>('classic');

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

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem('keyboard-theme') as any;
      if (storedTheme && ['classic', 'matrix', 'cyberpunk', 'pink'].includes(storedTheme)) {
        setKeyboardTheme(storedTheme);
      }
    }
  }, []);

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

  const activeTheme = themeStyles[keyboardTheme];

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

  const handleThemeChange = () => {
    soundEngine.playUIClick();
    const themes: ('classic' | 'matrix' | 'cyberpunk' | 'pink')[] = ['classic', 'matrix', 'cyberpunk', 'pink'];
    const nextIndex = (themes.indexOf(keyboardTheme) + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    setKeyboardTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('keyboard-theme', nextTheme);
    }
    triggerHaptic();
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
        backgroundColor: activeTheme.background,
        borderTop: `4px solid ${activeTheme.ink}`,
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
      {/* Utility Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `2px solid ${activeTheme.ink}`,
          paddingBottom: 'clamp(0.2rem, 0.6vw, 0.4rem)',
          marginBottom: 'clamp(0.1rem, 0.4vw, 0.2rem)',
          width: '100%',
          maxWidth: 'min(320px, 90vw)',
          gap: '0.4rem',
        }}
      >
        <button
          onClick={handleThemeChange}
          style={{
            padding: '2px 8px',
            backgroundColor: activeTheme.bg,
            border: `2px solid ${activeTheme.ink}`,
            color: activeTheme.text,
            fontSize: '9px',
            fontFamily: 'var(--font-heading)',
            fontWeight: 'bold',
            cursor: 'pointer',
            textTransform: 'uppercase',
            borderRadius: 0,
          }}
        >
          🎨 {keyboardTheme}
        </button>

        <button
          onClick={() => {
            soundEngine.playUIClick();
            triggerHaptic();
            onChange('');
          }}
          style={{
            padding: '2px 8px',
            backgroundColor: activeTheme.bg,
            border: `2px solid ${activeTheme.ink}`,
            color: activeTheme.text,
            fontSize: '9px',
            fontFamily: 'var(--font-heading)',
            fontWeight: 'bold',
            cursor: 'pointer',
            borderRadius: 0,
          }}
        >
          🗑️ CLEAR
        </button>
      </div>

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
              let bg = activeTheme.bg;
              let color = activeTheme.text;

              if (key === 'BACKSPACE') {
                displayKey = '';
                icon = <Delete size={18} />;
              } else if (key === 'DONE') {
                displayKey = '';
                icon = <Check size={18} />;
                bg = activeTheme.accent;
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
                    backgroundColor: activeTheme.accent,
                    color: '#FFFFFF',
                    boxShadow: `0px 0px 0 ${activeTheme.ink}`,
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
                    border: `2px solid ${activeTheme.ink}`,
                    boxShadow: `2px 2px 0 ${activeTheme.ink}`,
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
