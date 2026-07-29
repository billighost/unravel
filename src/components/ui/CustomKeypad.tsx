'use client';

import React from 'react';
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
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['BACKSPACE', '0', 'DONE'],
  ];

  const handleKeyPress = (key: string) => {
    soundEngine.playTypeClick();

    if (key === 'BACKSPACE') {
      onChange(value.slice(0, -1));
    } else if (key === 'DONE') {
      if (onDone) onDone();
    } else {
      if (value.length < maxLength) {
        onChange(value + key);
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
        // Responsive padding — safe area + clamp
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
          // Responsive max width: fills screen at 250px, capped at 320px on larger
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
                    e.preventDefault(); // Prevents input blur
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleKeyPress(key);
                  }}
                  whileTap={{
                    scale: 0.92,
                    x: 1,
                    y: 1,
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                    boxShadow: '0px 0px 0 var(--ink)',
                  }}
                  transition={{ duration: 0.08 }}
                  style={{
                    flex: '1',
                    // Responsive height: scales down gracefully on small screens
                    height: 'clamp(38px, 12vw, 56px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                    color: color,
                    border: '2px solid var(--ink)',
                    boxShadow: '2px 2px 0 var(--ink)',
                    fontFamily: 'var(--font-heading)',
                    // Responsive font: readable at 250px, normal at 400px+
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
