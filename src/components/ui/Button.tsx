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
  progress?: number;
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
  progress,
  children,
  className = '',
  style,
  ...props
}) => {
  const isPrimary = variant === 'primary';
  const [simulatedProgress, setSimulatedProgress] = React.useState(0);

  React.useEffect(() => {
    let intervalId: any;
    if (isLoading) {
      setSimulatedProgress(0);
      const startTime = Date.now();
      const duration = 2500; // 2.5 seconds to reach 90%
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(90, Math.round((elapsed / duration) * 90));
        setSimulatedProgress(pct);
      }, 50);
    } else if (isSuccess) {
      setSimulatedProgress(100);
    } else {
      setSimulatedProgress(0);
    }
    return () => clearInterval(intervalId);
  }, [isLoading, isSuccess]);

  const activeProgress = progress !== undefined ? progress : simulatedProgress;

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
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      disabled={isLoading || isSuccess || props.disabled}
      className={className}
      onClick={handleClick}
      {...(props as any)}
    >
      {/* Bottom Progress Bar */}
      {(isLoading || progress !== undefined) && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '5px',
            backgroundColor: '#34C759',
            width: `${activeProgress}%`,
            transition: 'width 0.1s linear',
            zIndex: 1,
          }}
        />
      )}

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
        {isLoading ? (
          <>
            <Loader2 size={18} className="animate-spin" style={{ flexShrink: 0 }} />
            <span>
              {loadingText ? loadingText : children} {activeProgress > 0 ? `(${activeProgress}%)` : ''}
            </span>
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
      </span>
    </motion.button>
  );
};
