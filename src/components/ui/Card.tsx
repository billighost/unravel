'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { soundEngine } from '@/lib/audio/soundEngine';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, onClick, className = '', style }) => {
  const handleClick = () => {
    if (onClick) {
      soundEngine.playUIClick();
      onClick();
    }
  };

  return (
    <motion.div
      whileHover={onClick ? { scale: 1.03, x: -3, y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.98, x: 2, y: 2 } : undefined}
      transition={{ duration: 0.1 }}
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--surface)',
        border: '3px solid var(--ink)',
        boxShadow: '6px 6px 0 var(--ink)',
        padding: '2rem',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        textAlign: 'center',
        ...style,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
