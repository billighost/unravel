'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Paintbrush, Type as TypeIcon, ArrowLeft } from 'lucide-react';
import { useAppStore, AppMode } from '@/store/useAppStore';
import { Card } from '@/components/ui/Card';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { MuteButton } from '@/components/ui/MuteButton';
import { t } from '@/lib/i18n/strings';

export const ModeSelect: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ position: 'absolute', top: '2rem', left: '2rem', right: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => setMode('landing')}>
          <ArrowLeft size={18} /> {t('BACK')}
        </Button>
        <MuteButton />
      </div>

      <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <Wordmark size="lg" />
        <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          {t('CHOOSE_SOURCE')}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '2rem',
          maxWidth: '900px',
          width: '100%',
        }}
      >
        <Card onClick={() => setMode('upload')}>
          <ImageIcon size={56} color="var(--ink)" />
          <h2 className="font-heading" style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>
            {t('PHOTO')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Upload any image or drawing
          </p>
        </Card>

        <Card onClick={() => setMode('draw')}>
          <Paintbrush size={56} color="var(--ink)" />
          <h2 className="font-heading" style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>
            {t('DRAW')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Paint pixel art on canvas
          </p>
        </Card>

        <Card onClick={() => setMode('type')}>
          <TypeIcon size={56} color="var(--ink)" />
          <h2 className="font-heading" style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>
            {t('TYPE')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Turn words into 3D cubes
          </p>
        </Card>
      </div>
    </motion.div>
  );
};
