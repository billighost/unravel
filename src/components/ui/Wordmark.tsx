'use client';

import React from 'react';
import { soundEngine } from '@/lib/audio/soundEngine';

interface WordmarkProps {
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const Wordmark: React.FC<WordmarkProps> = ({ onClick, size = 'md' }) => {
  const fontSize = size === 'sm' ? '1rem' : size === 'lg' ? '2.2rem' : '1.5rem';

  const handleClick = () => {
    if (onClick) {
      soundEngine.playUIClick();
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontFamily: 'var(--font-heading)',
        fontSize,
        color: 'var(--ink)',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      <span>UNRAV</span>
      {/* Off-set 'E' and 'L' for subtle unraveling pixel effect */}
      <span
        style={{
          display: 'inline-block',
          transform: 'translateY(-2px) rotate(4deg)',
          color: 'var(--ink)',
        }}
      >
        E
      </span>
      <span
        style={{
          display: 'inline-block',
          transform: 'translate(2px, 3px) rotate(-8deg)',
          color: 'var(--accent)',
        }}
      >
        L
      </span>
      {/* Loose drifting pixels */}
      <span
        style={{
          width: '4px',
          height: '4px',
          backgroundColor: 'var(--accent)',
          position: 'absolute',
          right: '-10px',
          top: '2px',
        }}
      />
      <span
        style={{
          width: '3px',
          height: '3px',
          backgroundColor: 'var(--ink)',
          position: 'absolute',
          right: '-16px',
          bottom: '4px',
        }}
      />
    </div>
  );
};
