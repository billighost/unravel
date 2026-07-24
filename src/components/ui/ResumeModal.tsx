'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

interface ResumeModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onStartFresh: () => void;
}

export const ResumeModal: React.FC<ResumeModalProps> = ({
  isOpen,
  onContinue,
  onStartFresh,
}) => {
  if (!isOpen) return null;

  const handleContinue = () => {
    soundEngine.playUIClick();
    onContinue();
  };

  const handleStartFresh = () => {
    soundEngine.playUIClick();
    onStartFresh();
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          padding: '1.5rem',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.12 }}
          style={{
            backgroundColor: 'var(--surface)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: '2rem',
            maxWidth: '420px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Sparkles size={44} color="var(--accent)" />
          </div>

          <div>
            <h2 className="font-heading" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>
              {t('CONTINUE_PICTURE')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              We found a picture saved from your previous session.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button variant="primary" onClick={handleContinue} style={{ width: '100%' }}>
              <Play size={18} /> CONTINUE
            </Button>
            <Button variant="secondary" onClick={handleStartFresh} style={{ width: '100%', fontSize: '0.85rem' }}>
              {t('START_FRESH')}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
