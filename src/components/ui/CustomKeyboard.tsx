'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Delete, CornerDownLeft, ArrowUp } from 'lucide-react';

interface CustomKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  /** Maximum character count. Defaults to 35. */
  maxLength?: number;
  /** Maximum line count for multi-line support. If > 1, shows a RETURN key. Defaults to 1. */
  maxLines?: number;
}

export const CustomKeyboard: React.FC<CustomKeyboardProps> = ({
  value,
  onChange,
  onDone,
  maxLength = 35,
  maxLines = 1,
}) => {
  const [isShift, setIsShift] = useState(true); // default capital since pixel font looks great in caps

  const supportsMultiLine = maxLines > 1;

  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    // Replace '-' with 'RETURN' when multi-line is enabled
    supportsMultiLine
      ? ['.', ',', '!', '?', 'RETURN', "'", 'SPACE', 'DONE']
      : ['.', ',', '!', '?', '-', "'", 'SPACE', 'DONE'],
  ];

  const handleKeyPress = (key: string) => {
    if (key === 'BACKSPACE') {
      onChange(value.slice(0, -1));
    } else if (key === 'SPACE') {
      if (value.length < maxLength) {
        onChange(value + ' ');
      }
    } else if (key === 'SHIFT') {
      setIsShift(!isShift);
    } else if (key === 'DONE') {
      if (onDone) onDone();
    } else if (key === 'RETURN') {
      // Only allow if we haven't exceeded max lines
      const currentLineCount = (value.match(/\n/g) || []).length + 1;
      if (currentLineCount < maxLines) {
        onChange(value + '\n');
      }
    } else {
      if (value.length < maxLength) {
        onChange(value + (isShift ? key.toUpperCase() : key.toLowerCase()));
      }
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
        // Responsive padding — safe area + clamp so it works at 250px+
        padding: 'clamp(0.4rem, 1.5vw, 0.75rem) clamp(0.25rem, 1.5vw, 0.5rem) calc(clamp(0.4rem, 1.5vw, 0.75rem) + env(safe-area-inset-bottom)) clamp(0.25rem, 1.5vw, 0.5rem)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.2rem, 0.8vw, 0.4rem)',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
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
            const isSpecial = ['SHIFT', 'BACKSPACE', 'SPACE', 'DONE', 'RETURN'].includes(key);
            let displayKey = key;
            let icon: React.ReactNode = null;

            if (key === 'SHIFT') {
              displayKey = '';
              icon = <ArrowUp size={14} color={isShift ? 'var(--accent)' : 'var(--ink)'} strokeWidth={3} />;
            } else if (key === 'BACKSPACE') {
              displayKey = '';
              icon = <Delete size={14} />;
            } else if (key === 'DONE') {
              displayKey = 'DONE';
              icon = <CornerDownLeft size={12} style={{ marginLeft: '2px' }} />;
            } else if (key === 'RETURN') {
              displayKey = '⏎';
              icon = null;
            } else if (key === 'SPACE') {
              displayKey = 'SPACE';
            } else {
              displayKey = isShift ? key.toUpperCase() : key.toLowerCase();
            }

            // Key layout styles
            let flex = '1';
            let maxWidth = 'min(40px, 9vw)';
            let bg = 'var(--bg)';
            let color = 'var(--ink)';

            if (key === 'SPACE') {
              flex = '3';
              maxWidth = 'min(180px, 40vw)';
            } else if (key === 'DONE') {
              flex = '1.5';
              maxWidth = 'min(72px, 16vw)';
              bg = 'var(--accent)';
              color = '#FFFFFF';
            } else if (key === 'SHIFT' || key === 'BACKSPACE') {
              flex = '1.5';
              maxWidth = 'min(64px, 14vw)';
            } else if (key === 'RETURN') {
              flex = '1';
              maxWidth = 'min(40px, 9vw)';
              bg = 'var(--ink)';
              color = '#FFFFFF';
            }

            return (
              <button
                key={key}
                data-virtual-key="true"
                onPointerDown={(e) => {
                  e.preventDefault(); // Prevents input blur
                }}
                onClick={(e) => {
                  e.preventDefault();
                  handleKeyPress(key);
                }}
                style={{
                  flex,
                  maxWidth,
                  // Responsive height: works from 250px screen width up
                  height: 'clamp(30px, 8.5vw, 42px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: bg,
                  color: color,
                  border: '2px solid var(--ink)',
                  boxShadow: '2px 2px 0 var(--ink)',
                  fontFamily: 'var(--font-heading)',
                  // Responsive font size: readable at 250px, normal at 400px+
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
              </button>
            );
          })}
        </div>
      ))}
    </motion.div>
  );
};
