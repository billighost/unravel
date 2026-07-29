'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, CornerDownLeft, ArrowUp, Check } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';

interface CustomKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  /** Maximum character count. Defaults to 35. */
  maxLength?: number;
  /** Maximum line count for multi-line support. If > 1, shows a RETURN key. Defaults to 1. */
  maxLines?: number;
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

export const CustomKeyboard: React.FC<CustomKeyboardProps> = ({
  value,
  onChange,
  onDone,
  maxLength = 35,
  maxLines = 1,
}) => {
  const [isShift, setIsShift] = useState(true); // default capital since pixel font looks great in caps
  const [showSymbols, setShowSymbols] = useState(false);
  const [keyboardTheme, setKeyboardTheme] = useState<'classic' | 'matrix' | 'cyberpunk' | 'pink'>('classic');
  const [isAlphabetical, setIsAlphabetical] = useState(false);
  const [isDictating, setIsDictating] = useState(false);

  const [activePressedKey, setActivePressedKey] = useState<{
    key: string;
    rect: DOMRect | null;
  } | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasTriggeredByPointer = useRef(false);
  const lastSpaceTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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
      const storedLayout = localStorage.getItem('keyboard-layout') === 'true';
      setIsAlphabetical(storedLayout);
    }
  }, []);

  // Smart sentence-start auto-capitalization
  useEffect(() => {
    if (!value) {
      setIsShift(true);
    } else {
      const lastChar = value.slice(-1);
      const secondLastChar = value.slice(-2, -1);
      if (lastChar === ' ' && ['.', '?', '!'].includes(secondLastChar)) {
        setIsShift(true);
      } else if (lastChar === '\n') {
        setIsShift(true);
      }
    }
  }, [value]);

  // Clean up timers and speech recognition on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const supportsMultiLine = maxLines > 1;

  const letterRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    supportsMultiLine
      ? ['?123', '.', ',', '!', '?', 'RETURN', "'", 'SPACE', 'DONE']
      : ['?123', '.', ',', '!', '?', '-', "'", 'SPACE', 'DONE'],
  ];

  const alphabeticalRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'],
    ['SHIFT', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'BACKSPACE'],
    supportsMultiLine
      ? ['?123', '.', ',', '!', '?', 'RETURN', "'", 'SPACE', 'DONE']
      : ['?123', '.', ',', '!', '?', '-', "'", 'SPACE', 'DONE'],
  ];

  const symbolRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'],
    ['*', '"', "'", ':', ';', '!', '?', '\\', '|'],
    ['abc', '<', '>', '=', '[', ']', '{', '}', 'BACKSPACE'],
    supportsMultiLine
      ? ['abc', '.', ',', '@', '#', 'RETURN', '_', 'SPACE', 'DONE']
      : ['abc', '.', ',', '@', '#', '-', '_', 'SPACE', 'DONE'],
  ];

  const rows = showSymbols
    ? symbolRows
    : (isAlphabetical ? alphabeticalRows : letterRows);

  const activeTheme = themeStyles[keyboardTheme];

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(8); // Short subtle vibration
    }
  };

  const handleKeyPress = (key: string, isRepeat = false) => {
    soundEngine.playTypeClick();
    triggerHaptic();

    const currentValue = valueRef.current;

    if (key === 'BACKSPACE') {
      onChange(currentValue.slice(0, -1));
    } else if (key === 'SPACE') {
      if (isRepeat) {
        if (currentValue.length < maxLength) {
          onChange(currentValue + ' ');
        }
      } else {
        const now = Date.now();
        if (now - lastSpaceTapRef.current < 300) {
          // Double tap space: backspace the space and append period + space
          if (currentValue.endsWith(' ')) {
            onChange(currentValue.slice(0, -1) + '. ');
          } else {
            onChange(currentValue + '. ');
          }
          lastSpaceTapRef.current = 0;
        } else {
          if (currentValue.length < maxLength) {
            onChange(currentValue + ' ');
          }
          lastSpaceTapRef.current = now;
        }
      }
    } else if (key === 'SHIFT') {
      setIsShift(!isShift);
    } else if (key === 'DONE') {
      if (onDone) onDone();
    } else if (key === '?123') {
      setShowSymbols(true);
    } else if (key === 'abc') {
      setShowSymbols(false);
    } else if (key === 'RETURN') {
      const currentLineCount = (currentValue.match(/\n/g) || []).length + 1;
      if (currentLineCount < maxLines) {
        onChange(currentValue + '\n');
      }
    } else {
      if (currentValue.length < maxLength) {
        // Typing a character auto-resets shift if it was enabled (except first char or after period)
        onChange(currentValue + (isShift && !showSymbols ? key.toUpperCase() : key.toLowerCase()));
        if (isShift) {
          setIsShift(false);
        }
      }
    }
  };

  const startRepeat = (key: string) => {
    stopRepeat();

    // Trigger immediate key press
    handleKeyPress(key, false);

    // Only repeat letters, numbers, spaces, and backspace
    const nonRepeatable = ['SHIFT', 'DONE', '?123', 'abc', 'RETURN'];
    if (nonRepeatable.includes(key)) return;

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        handleKeyPress(key, true);
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

  const handleLayoutChange = () => {
    soundEngine.playUIClick();
    const nextLayout = !isAlphabetical;
    setIsAlphabetical(nextLayout);
    if (typeof window !== 'undefined') {
      localStorage.setItem('keyboard-layout', String(nextLayout));
    }
    triggerHaptic();
  };

  const toggleDictation = () => {
    soundEngine.playUIClick();
    triggerHaptic();

    if (isDictating) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsDictating(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsDictating(true);
    };

    recognition.onend = () => {
      setIsDictating(false);
    };

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      if (resultText) {
        onChange(valueRef.current + resultText);
      }
    };

    recognition.onerror = () => {
      setIsDictating(false);
    };

    try {
      recognition.start();
    } catch (err) {
      setIsDictating(false);
    }
  };

  // Magnifier layout coordinates helper
  let magnifierStyle: React.CSSProperties = {};
  const shouldShowMagnifier =
    activePressedKey &&
    activePressedKey.rect &&
    containerRef.current &&
    !['SHIFT', 'BACKSPACE', 'SPACE', 'DONE', 'RETURN', '?123', 'abc'].includes(activePressedKey.key);

  if (shouldShowMagnifier && activePressedKey && activePressedKey.rect && containerRef.current) {
    const containerRect = containerRef.current.getBoundingClientRect();
    const keyRect = activePressedKey.rect;
    const left = keyRect.left - containerRect.left + keyRect.width / 2;
    const bottom = containerRect.bottom - keyRect.top + 8;

    magnifierStyle = {
      position: 'absolute',
      left: `${left}px`,
      bottom: `${bottom}px`,
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
      zIndex: 10000,
    };
  }

  return (
    <motion.div
      ref={containerRef}
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
        padding: 'clamp(0.4rem, 1.5vw, 0.75rem) clamp(0.25rem, 1.5vw, 0.5rem) calc(clamp(0.4rem, 1.5vw, 0.75rem) + env(safe-area-inset-bottom)) clamp(0.25rem, 1.5vw, 0.5rem)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
        userSelect: 'none',
        pointerEvents: 'auto',
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
          gap: '0.4rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {/* Theme Toggler */}
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
          
          {/* Layout Toggler */}
          <button
            onClick={handleLayoutChange}
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
            ⌨️ {isAlphabetical ? 'ABC' : 'QWERTY'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {/* Dictate Button */}
          <button
            onClick={toggleDictation}
            style={{
              padding: '2px 8px',
              backgroundColor: isDictating ? activeTheme.accent : activeTheme.bg,
              border: `2px solid ${activeTheme.ink}`,
              color: isDictating ? '#FFFFFF' : activeTheme.text,
              fontSize: '9px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: 0,
            }}
          >
            {isDictating ? '🎤 LISTENING...' : '🎤 DICTATE'}
          </button>

          {/* Clear Button */}
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
      </div>

      {/* Floating Key Magnifier */}
      <AnimatePresence>
        {shouldShowMagnifier && activePressedKey && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            transition={{ type: 'spring', damping: 15, stiffness: 350 }}
            style={{
              ...magnifierStyle,
              backgroundColor: activeTheme.background,
              border: `3px solid ${activeTheme.ink}`,
              boxShadow: `4px 4px 0 ${activeTheme.ink}`,
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '48px',
              height: '48px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: '-8px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '12px',
                height: '12px',
                backgroundColor: activeTheme.background,
                borderRight: `3px solid ${activeTheme.ink}`,
                borderBottom: `3px solid ${activeTheme.ink}`,
              }}
            />
            <span
              className="font-heading"
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: activeTheme.text,
                textTransform: 'uppercase',
              }}
            >
              {isShift && !showSymbols ? activePressedKey.key.toUpperCase() : activePressedKey.key.toLowerCase()}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'clamp(0.12rem, 0.6vw, 0.3rem)',
            width: '100%',
          }}
        >
          {row.map((key) => {
            const isSpecial = ['SHIFT', 'BACKSPACE', 'SPACE', 'DONE', 'RETURN', '?123', 'abc'].includes(key);
            let displayKey = key;
            let icon: React.ReactNode = null;

            if (key === 'SHIFT') {
              displayKey = '';
              icon = <ArrowUp size={14} color={isShift ? activeTheme.accent : activeTheme.ink} strokeWidth={3} />;
            } else if (key === 'BACKSPACE') {
              displayKey = '';
              icon = <Delete size={14} />;
            } else if (key === 'DONE') {
              displayKey = 'DONE';
              icon = <Check size={12} style={{ marginLeft: '2px' }} />;
            } else if (key === 'RETURN') {
              displayKey = '';
              icon = <CornerDownLeft size={14} />;
            } else if (key === 'SPACE') {
              displayKey = 'SPACE';
            } else if (key === '?123' || key === 'abc') {
              displayKey = key;
            } else {
              displayKey = isShift && !showSymbols ? key.toUpperCase() : key.toLowerCase();
            }

            // Key layout styles
            let flex = '1';
            let maxWidth = 'min(40px, 9vw)';
            let bg = activeTheme.bg;
            let color = activeTheme.text;

            if (key === 'SPACE') {
              flex = '3';
              maxWidth = 'min(180px, 40vw)';
            } else if (key === 'DONE') {
              flex = '1.5';
              maxWidth = 'min(72px, 16vw)';
              bg = activeTheme.accent;
              color = '#FFFFFF';
            } else if (key === 'SHIFT' || key === 'BACKSPACE') {
              flex = '1.5';
              maxWidth = 'min(64px, 14vw)';
            } else if (key === 'RETURN') {
              flex = '1';
              maxWidth = 'min(40px, 9vw)';
              bg = activeTheme.ink;
              color = activeTheme.background;
            } else if (key === '?123' || key === 'abc') {
              flex = '1.5';
              maxWidth = 'min(64px, 14vw)';
            }

            return (
              <motion.button
                key={key}
                data-virtual-key="true"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  wasTriggeredByPointer.current = true;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActivePressedKey({ key, rect });
                  startRepeat(key);
                  try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  } catch (err) {}
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  stopRepeat();
                  setActivePressedKey(null);
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch (err) {}
                }}
                onPointerCancel={(e) => {
                  e.preventDefault();
                  stopRepeat();
                  setActivePressedKey(null);
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  stopRepeat();
                  setActivePressedKey(null);
                }}
                onPointerMove={(e) => {
                  if (!activePressedKey) return;
                  const rect = activePressedKey.rect;
                  if (rect) {
                    const x = e.clientX;
                    const y = e.clientY;
                    const buffer = 20; // 20px leeway
                    if (
                      x < rect.left - buffer ||
                      x > rect.right + buffer ||
                      y < rect.top - buffer ||
                      y > rect.bottom + buffer
                    ) {
                      stopRepeat();
                      setActivePressedKey(null);
                    }
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
                  flex,
                  maxWidth,
                  height: 'clamp(30px, 8.5vw, 42px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: bg,
                  color: color,
                  border: `2px solid ${activeTheme.ink}`,
                  boxShadow: `2px 2px 0 ${activeTheme.ink}`,
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'clamp(0.55rem, 3vw, 0.9rem)',
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
    </motion.div>
  );
};
