'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Delete, CornerDownLeft, ArrowUp } from 'lucide-react';

interface CustomKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
}

export const CustomKeyboard: React.FC<CustomKeyboardProps> = ({
  value,
  onChange,
  onDone,
}) => {
  const [isShift, setIsShift] = useState(true); // default capital since pixel font looks great in caps

  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    ['.', ',', '!', '?', '-', "'", 'SPACE', 'DONE'],
  ];

  const handleKeyPress = (key: string) => {
    if (key === 'BACKSPACE') {
      onChange(value.slice(0, -1));
    } else if (key === 'SPACE') {
      onChange(value + ' ');
    } else if (key === 'SHIFT') {
      setIsShift(!isShift);
    } else if (key === 'DONE') {
      if (onDone) onDone();
    } else {
      if (value.length < 35) {
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
        padding: '0.75rem 0.5rem calc(0.75rem + env(safe-area-inset-bottom)) 0.5rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
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
            gap: '0.3rem',
            width: '100%',
          }}
        >
          {row.map((key) => {
            const isSpecial = ['SHIFT', 'BACKSPACE', 'SPACE', 'DONE'].includes(key);
            let displayKey = key;
            let icon = null;

            if (key === 'SHIFT') {
              displayKey = '';
              icon = <ArrowUp size={16} color={isShift ? 'var(--accent)' : 'var(--ink)'} strokeWidth={3} />;
            } else if (key === 'BACKSPACE') {
              displayKey = '';
              icon = <Delete size={16} />;
            } else if (key === 'DONE') {
              displayKey = 'DONE';
              icon = <CornerDownLeft size={14} style={{ marginLeft: '2px' }} />;
            } else if (key === 'SPACE') {
              displayKey = 'SPACE';
            } else {
              displayKey = isShift ? key.toUpperCase() : key.toLowerCase();
            }

            // Key layout styles
            let flex = '1';
            let maxWidth = '40px';
            let bg = 'var(--bg)';
            let color = 'var(--ink)';

            if (key === 'SPACE') {
              flex = '3';
              maxWidth = '180px';
              bg = 'var(--bg)';
            } else if (key === 'DONE') {
              flex = '1.5';
              maxWidth = '80px';
              bg = 'var(--accent)';
              color = '#FFFFFF';
            } else if (key === 'SHIFT' || key === 'BACKSPACE') {
              flex = '1.5';
              maxWidth = '70px';
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
                  height: '42px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: bg,
                  color: color,
                  border: '2px solid var(--ink)',
                  boxShadow: '2px 2px 0 var(--ink)',
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'min(0.95rem, 4vw)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: 0,
                  outline: 'none',
                  touchAction: 'manipulation',
                  padding: 0,
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
