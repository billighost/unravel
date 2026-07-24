'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand } from 'lucide-react';
import { t } from '@/lib/i18n/strings';

export const FirstTouchHint: React.FC = () => {
  const [showHint, setShowHint] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (hasInteracted) return;

    // Timer: show hint after 2.2 seconds of inactivity
    const timer = setTimeout(() => {
      if (!hasInteracted) {
        setShowHint(true);
      }
    }, 2200);

    const handlePointerDown = () => {
      setHasInteracted(true);
      setShowHint(false);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [hasInteracted]);

  if (!showHint) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 8,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <motion.div
          animate={{ x: [-15, 15, -15], y: [-5, 5, -5] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          style={{
            backgroundColor: 'var(--surface)',
            border: '3px solid var(--ink)',
            boxShadow: '4px 4px 0 var(--ink)',
            padding: '0.75rem',
            borderRadius: '50%',
            color: 'var(--ink)',
          }}
        >
          <Hand size={32} />
        </motion.div>

        <span
          className="font-heading"
          style={{
            fontSize: '0.75rem',
            backgroundColor: 'var(--surface)',
            color: 'var(--ink)',
            border: '2px solid var(--ink)',
            boxShadow: '2px 2px 0 var(--ink)',
            padding: '0.25rem 0.6rem',
          }}
        >
          {t('SWIPE_CUBES')}
        </span>
      </motion.div>
    </AnimatePresence>
  );
};
