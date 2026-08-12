'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, CornerDownLeft, ArrowUp, Check, Palette, Keyboard, Mic, Trash2 } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { showToast } from '@/components/ui/Toast';

interface CustomKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  /** Maximum character count. Defaults to 35. */
  maxLength?: number;
  /** Maximum line count. If > 1 the bottom-right key becomes ENTER. Defaults to 1. */
  maxLines?: number;
}

/** Keys that act on the field rather than inserting their own label. */
const SPECIAL_KEYS = ['SHIFT', 'BACKSPACE', 'SPACE', 'DONE', 'ENTER', '?123', 'abc'];

type KeyboardTheme = {
  background: string;
  ink: string;
  bg: string;
  accent: string;
  text: string;
};

/**
 * A chunky toolbar control for the strip above the keys.
 *
 * The previous inline buttons were 9px text in a 2px-padded box — visually
 * unrelated to the app's chunky key styling, and well under a usable touch
 * target. These share the keys' border/shadow/press language, keep a 30px
 * minimum height, and drop their label on narrow phones so the row never
 * crowds.
 */
const ToolButton: React.FC<{
  theme: KeyboardTheme;
  onClick: () => void;
  ariaLabel: string;
  label: string;
  icon: React.ReactNode;
  /** Colour chip shown ahead of the icon (used for the theme picker). */
  swatch?: string;
  active?: boolean;
  ariaPressed?: boolean;
  disabled?: boolean;
}> = ({ theme, onClick, ariaLabel, label, icon, swatch, active, ariaPressed, disabled }) => (
  <motion.button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    aria-pressed={ariaPressed}
    disabled={disabled}
    whileTap={disabled ? undefined : { scale: 0.94, x: 1, y: 1, boxShadow: `0 0 0 ${theme.ink}` }}
    transition={{ duration: 0.08 }}
    style={{
      minHeight: '30px',
      padding: '0 clamp(6px, 2vw, 10px)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      backgroundColor: active ? theme.accent : theme.bg,
      color: active ? '#FFFFFF' : theme.text,
      border: `2px solid ${theme.ink}`,
      boxShadow: `2px 2px 0 ${theme.ink}`,
      fontFamily: 'var(--font-heading)',
      fontSize: '10px',
      fontWeight: 'bold',
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      borderRadius: 0,
      outline: 'none',
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
      flexShrink: 0,
    }}
  >
    {swatch && (
      <span
        aria-hidden="true"
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: swatch,
          border: `2px solid ${active ? '#FFFFFF' : theme.ink}`,
          flexShrink: 0,
        }}
      />
    )}
    {icon}
    <span className="kb-tool-label">{label}</span>
  </motion.button>
);

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
  const [interimTextState, setInterimTextState] = useState('');

  const startTextRef = useRef('');
  const userStoppedRef = useRef(true);

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

  // On a multi-line field the bottom-right key is a real ENTER that inserts a
  // newline, which is where a thumb expects to find it. The mid-row slot that
  // used to hold a dedicated newline key becomes a useful punctuation key
  // instead. Single-line fields keep DONE there to dismiss the keyboard.
  const enterKey = supportsMultiLine ? 'ENTER' : 'DONE';

  const letterRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    ['?123', '.', ',', '!', '?', '-', "'", 'SPACE', enterKey],
  ];

  const alphabeticalRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'],
    ['SHIFT', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'BACKSPACE'],
    ['?123', '.', ',', '!', '?', '-', "'", 'SPACE', enterKey],
  ];

  const symbolRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'],
    ['*', '"', "'", ':', ';', '!', '?', '\\', '|'],
    ['abc', '<', '>', '=', '[', ']', '{', '}', 'BACKSPACE'],
    ['abc', '.', ',', '@', '#', '&', '_', 'SPACE', enterKey],
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
    } else if (key === 'ENTER') {
      const currentLineCount = (currentValue.match(/\n/g) || []).length + 1;
      if (currentLineCount < maxLines && currentValue.length < maxLength) {
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
    const nonRepeatable = ['SHIFT', 'DONE', '?123', 'abc', 'ENTER'];
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
      userStoppedRef.current = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsDictating(false);
      setInterimTextState('');
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    // Initialize
    startTextRef.current = valueRef.current;
    userStoppedRef.current = false;
    setInterimTextState('');

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsDictating(true);
    };

    recognition.onend = () => {
      // If the user didn't stop it explicitly, auto-restart to make it robust
      if (!userStoppedRef.current) {
        try {
          recognition.start();
        } catch (err) {
          console.warn('SpeechRecognition auto-restart failed:', err);
          setIsDictating(false);
        }
      } else {
        setIsDictating(false);
      }
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Update real-time display state
      setInterimTextState(interimText || finalText || 'Listening...');

      const newSpeechText = (finalText + interimText).trim();
      if (newSpeechText) {
        const base = startTextRef.current;
        const separator = base && !base.endsWith(' ') && !newSpeechText.startsWith(' ') ? ' ' : '';
        onChange(base + separator + newSpeechText);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        // Keep listening even if no speech is detected
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        userStoppedRef.current = true;
        setIsDictating(false);
        showToast('Microphone access denied or service unavailable', 'error');
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Speech recognition start error:', err);
      setIsDictating(false);
    }
  };

  // Magnifier layout coordinates helper
  let magnifierStyle: React.CSSProperties = {};
  const shouldShowMagnifier =
    activePressedKey &&
    activePressedKey.rect &&
    containerRef.current &&
    !SPECIAL_KEYS.includes(activePressedKey.key);

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
        padding: 'clamp(0.4rem, 1.5vw, 0.75rem) clamp(3px, 1.2vw, 8px) calc(clamp(0.4rem, 1.5vw, 0.75rem) + env(safe-area-inset-bottom)) clamp(3px, 1.2vw, 8px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {/* Dictation Interim Status Banner */}
      {isDictating && (
        <div style={{
          padding: '4px 8px',
          backgroundColor: 'rgba(255, 59, 48, 0.05)',
          borderBottom: `2px dashed ${activeTheme.ink}`,
          fontSize: '10px',
          color: activeTheme.accent,
          fontFamily: 'var(--font-body)',
          fontStyle: 'italic',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: activeTheme.accent,
            display: 'inline-block',
            flexShrink: 0,
            animation: 'pulse 1s infinite alternate',
          }} />
          <span>Dictating: {interimTextState || 'Listening for speech...'}</span>
        </div>
      )}

      {/* Utility Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          gap: 'clamp(0.3rem, 1.2vw, 0.6rem)',
          borderBottom: `2px solid ${activeTheme.ink}`,
          paddingBottom: 'clamp(0.3rem, 0.9vw, 0.5rem)',
          marginBottom: 'clamp(0.15rem, 0.5vw, 0.3rem)',
        }}
      >
        {/* Left group: appearance */}
        <div style={{ display: 'flex', gap: 'clamp(0.25rem, 1vw, 0.45rem)', minWidth: 0 }}>
          <ToolButton
            theme={activeTheme}
            onClick={handleThemeChange}
            ariaLabel={`Keyboard theme: ${keyboardTheme}. Tap to change`}
            label={keyboardTheme}
            icon={<Palette size={13} strokeWidth={2.5} />}
            swatch={activeTheme.accent}
          />
          <ToolButton
            theme={activeTheme}
            onClick={handleLayoutChange}
            ariaLabel={`Key layout: ${isAlphabetical ? 'alphabetical' : 'QWERTY'}. Tap to change`}
            label={isAlphabetical ? 'ABC' : 'QWERTY'}
            icon={<Keyboard size={13} strokeWidth={2.5} />}
          />
        </div>

        {/* Right group: input actions */}
        <div style={{ display: 'flex', gap: 'clamp(0.25rem, 1vw, 0.45rem)', minWidth: 0 }}>
          <ToolButton
            theme={activeTheme}
            onClick={toggleDictation}
            ariaLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
            ariaPressed={isDictating}
            label={isDictating ? 'STOP' : 'DICTATE'}
            icon={<Mic size={13} strokeWidth={2.5} />}
            active={isDictating}
          />
          <ToolButton
            theme={activeTheme}
            onClick={() => {
              soundEngine.playUIClick();
              triggerHaptic();
              onChange('');
            }}
            ariaLabel="Clear all text"
            label="CLEAR"
            icon={<Trash2 size={13} strokeWidth={2.5} />}
            disabled={value.length === 0}
          />
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
            // Tight gap on phones so the keys themselves get the width.
            gap: 'clamp(3px, 0.6vw, 6px)',
            width: '100%',
          }}
        >
          {row.map((key) => {
            let displayKey = key;
            let icon: React.ReactNode = null;

            if (key === 'SHIFT') {
              displayKey = '';
              icon = <ArrowUp size={18} color={isShift ? activeTheme.accent : activeTheme.ink} strokeWidth={3} />;
            } else if (key === 'BACKSPACE') {
              displayKey = '';
              icon = <Delete size={18} />;
            } else if (key === 'DONE') {
              displayKey = 'DONE';
              icon = <Check size={14} style={{ marginLeft: '2px' }} />;
            } else if (key === 'ENTER') {
              displayKey = '';
              icon = <CornerDownLeft size={20} strokeWidth={2.5} />;
            } else if (key === 'SPACE') {
              displayKey = 'SPACE';
            } else if (key === '?123' || key === 'abc') {
              displayKey = key;
            } else {
              displayKey = isShift && !showSymbols ? key.toUpperCase() : key.toLowerCase();
            }

            // Key layout styles.
            //
            // The previous caps (`min(40px, 9vw)`) collapsed to ~34px wide on a
            // 375px phone, well under the 44px minimum comfortable touch target,
            // which is why keys were hard to hit. Letter keys now flex to fill
            // the row with only a desktop-side cap, and every key gets a tall
            // enough hit box (see `height` below) to be reliably tappable.
            let flex = '1';
            let maxWidth = '52px';
            let bg = activeTheme.bg;
            let color = activeTheme.text;

            if (key === 'SPACE') {
              flex = '4';
              maxWidth = '220px';
            } else if (key === 'DONE') {
              flex = '1.6';
              maxWidth = '84px';
              bg = activeTheme.accent;
              color = '#FFFFFF';
            } else if (key === 'SHIFT' || key === 'BACKSPACE') {
              flex = '1.5';
              maxWidth = '78px';
            } else if (key === 'ENTER') {
              flex = '1.6';
              maxWidth = '84px';
              bg = activeTheme.accent;
              color = '#FFFFFF';
            } else if (key === '?123' || key === 'abc') {
              flex = '1.5';
              maxWidth = '78px';
            }

            return (
              <motion.button
                key={key}
                type="button"
                data-virtual-key="true"
                // Icon-only keys have no text node, so without this a screen
                // reader announces them as an unlabelled button.
                aria-label={
                  key === 'SHIFT' ? 'Shift'
                  : key === 'BACKSPACE' ? 'Backspace'
                  : key === 'ENTER' ? 'New line'
                  : key === 'SPACE' ? 'Space'
                  : key
                }
                aria-pressed={key === 'SHIFT' ? isShift : undefined}
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
                // No onPointerLeave: it fired with zero tolerance the instant the
                // finger crossed the border, which cancelled the key before the
                // slop check in onPointerMove below could ever apply.
                onPointerMove={(e) => {
                  if (!activePressedKey) return;
                  const rect = activePressedKey.rect;
                  if (rect) {
                    const x = e.clientX;
                    const y = e.clientY;
                    // Generous slop: fingers roll during a press, and cancelling
                    // the key on a few px of drift feels like a dropped keystroke.
                    const buffer = 34;
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
                  // 46px floor keeps every key at/above the comfortable touch
                  // target size on phones; it scales up on roomier screens.
                  height: 'clamp(46px, 7.5vh, 56px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: bg,
                  color: color,
                  border: `2px solid ${activeTheme.ink}`,
                  boxShadow: `2px 2px 0 ${activeTheme.ink}`,
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'clamp(0.8rem, 3.6vw, 1rem)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: 0,
                  outline: 'none',
                  touchAction: 'manipulation',
                  // Suppresses the grey iOS tap flash so the pixel-styled
                  // whileTap animation is the only press feedback.
                  WebkitTapHighlightColor: 'transparent',
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
