'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Box } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { renderTextToGrid } from '@/lib/renderTextToCanvas';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

export const TypeMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);

  const [text, setText] = useState('UNRAVEL');

  const fontStyle =
    text.length <= 12 ? 'var(--font-heading)' : 'var(--font-body)';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val !== text) {
      soundEngine.playTypeClick();
    }
    setText(val);
  };

  const handleConvert = () => {
    const sampled = renderTextToGrid(text || 'UNRAVEL', 70, 35);
    setGridData(sampled);
  };

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
        <Button variant="secondary" onClick={() => setMode('select')} aria-label="Go Back" style={{ padding: '0.6rem 1rem' }}>
          <ArrowLeft size={18} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('BACK')}</span>
        </Button>
        <Wordmark size="sm" />
        <MuteButton />
      </div>

      {/* Centered Scrollable Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: '750px',
          margin: 'auto',
          paddingTop: '4.5rem',
          paddingBottom: '1.5rem',
          gap: '2.5rem',
        }}
      >
        {/* Main Text Input & Live Preview */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
          }}
        >
          <input
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder={t('TYPE_SOMETHING')}
            aria-label="Type text to turn into cubes"
            autoFocus
            maxLength={35}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: '4px solid var(--ink)',
              padding: '1rem 0.25rem',
              textAlign: 'center',
              color: 'var(--ink)',
              fontFamily: fontStyle,
              fontSize: text.length <= 8 ? 'min(2.5rem, 8vw)' : text.length <= 18 ? 'min(1.8rem, 6vw)' : 'min(1.2rem, 5vw)',
              outline: 'none',
            }}
          />

          <p style={{ color: 'var(--text-secondary)', fontSize: 'min(0.85rem, 3.5vw)' }}>
            {text.length <= 12 ? 'Chunky pixel font' : 'Clean mono font'}
          </p>
        </div>

        {/* Action Button */}
        <div>
          <Button variant="primary" onClick={handleConvert} style={{ fontSize: '0.95rem', padding: '0.85rem 2rem' }} aria-label="Turn text into cubes">
            <Box size={20} />
            <span style={{ marginLeft: '0.25rem' }}>{t('TURN_INTO_CUBES')}</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
