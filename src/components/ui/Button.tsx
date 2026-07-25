'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { soundEngine } from '@/lib/audio/soundEngine';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  isLoading = false,
  isSuccess = false,
  isError = false,
  loadingText,
  successText,
  errorText,
  children,
  className = '',
  style,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading || isSuccess || props.disabled) {
      e.preventDefault();
      return;
    }
    soundEngine.playUIClick();
    if (props.onClick) {
      props.onClick(e);
    }
  };

  // Determine colors based on active state
  let bg = isPrimary ? 'var(--accent)' : 'var(--surface)';
  let color = isPrimary ? '#FFFFFF' : 'var(--ink)';

  if (isSuccess) {
    bg = '#34C759'; // Success Green
    color = '#FFFFFF';
  } else if (isError) {
    bg = 'var(--accent)';
    color = '#FFFFFF';
  }

  const cursor = (isLoading || isSuccess || props.disabled) ? 'not-allowed' : 'pointer';

  return (
    <motion.button
      data-ui-obstacle="true"
      whileHover={!(isLoading || isSuccess || props.disabled) ? { scale: 1.02, x: -2, y: -2 } : {}}
      whileTap={!(isLoading || isSuccess || props.disabled) ? { scale: 0.98, x: 2, y: 2 } : {}}
      transition={{ duration: 0.08 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '0.85rem 1.75rem',
        backgroundColor: bg,
        color: color,
        border: '3px solid var(--ink)',
        boxShadow: '4px 4px 0 var(--ink)',
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        fontSize: '0.9rem',
        cursor: cursor,
        userSelect: 'none',
        outline: 'none',
        opacity: isLoading ? 0.85 : props.disabled ? 0.5 : 1,
        ...style,
      }}
      disabled={isLoading || isSuccess || props.disabled}
      className={className}
      onClick={handleClick}
      {...(props as any)}
    >
      {isLoading ? (
        <>
          <Loader2 size={18} className="animate-spin" style={{ flexShrink: 0 }} />
          {loadingText ? <span>{loadingText}</span> : children}
        </>
      ) : isSuccess ? (
        <>
          <Check size={18} style={{ flexShrink: 0 }} />
          {successText ? <span>{successText}</span> : children}
        </>
      ) : isError ? (
        <>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          {errorText ? <span>{errorText}</span> : children}
        </>
      ) : (
        children
      )}
    </motion.button>
  );
};
