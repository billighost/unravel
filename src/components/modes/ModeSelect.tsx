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
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      {/* Absolute Top Bar */}
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 12 }}>
        <Button variant="secondary" onClick={() => setMode('landing')} aria-label="Go Back" style={{ padding: '0.6rem 1rem' }}>
          <ArrowLeft size={18} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('BACK')}</span>
        </Button>
        <MuteButton />
      </div>

      {/* Centered Scrollable Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: '900px',
          margin: 'auto',
          paddingTop: '4.5rem',
          paddingBottom: '1.5rem',
        }}
      >
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <Wordmark size="md" />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t('CHOOSE_SOURCE')}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
            gap: '1.25rem',
            width: '100%',
          }}
        >
          <Card onClick={() => setMode('upload')}>
            <ImageIcon size={48} color="var(--ink)" />
            <h2 className="font-heading" style={{ fontSize: '0.95rem', marginTop: '0.5rem' }}>
              {t('PHOTO')}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Upload any image or drawing
            </p>
          </Card>

          <Card onClick={() => setMode('draw')}>
            <Paintbrush size={48} color="var(--ink)" />
            <h2 className="font-heading" style={{ fontSize: '0.95rem', marginTop: '0.5rem' }}>
              {t('DRAW')}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Paint pixel art on canvas
            </p>
          </Card>

          <Card onClick={() => setMode('type')}>
            <TypeIcon size={48} color="var(--ink)" />
            <h2 className="font-heading" style={{ fontSize: '0.95rem', marginTop: '0.5rem' }}>
              {t('TYPE')}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Turn words into 3D cubes
            </p>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

