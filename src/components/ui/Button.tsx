'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { soundEngine } from '@/lib/audio/soundEngine';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  children,
  className = '',
  style,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    soundEngine.playUIClick();
    if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <motion.button
      data-ui-obstacle="true"
      whileHover={{ scale: 1.02, x: -2, y: -2 }}
      whileTap={{ scale: 0.98, x: 2, y: 2 }}
      transition={{ duration: 0.08 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '0.85rem 1.75rem',
        backgroundColor: isPrimary ? 'var(--accent)' : 'var(--surface)',
        color: isPrimary ? '#FFFFFF' : 'var(--ink)',
        border: '3px solid var(--ink)',
        boxShadow: isPrimary ? '4px 4px 0 var(--ink)' : '4px 4px 0 var(--ink)',
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        fontSize: '0.9rem',
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        ...style,
      }}
      className={className}
      {...(props as any)}
      onClick={handleClick}
    >
      {children}
    </motion.button>
  );
};
