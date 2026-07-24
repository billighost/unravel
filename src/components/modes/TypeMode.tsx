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
        justifyContent: 'space-between',
        padding: '2rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Button variant="secondary" onClick={() => setMode('select')}>
          <ArrowLeft size={18} /> {t('BACK')}
        </Button>

        <Wordmark size="sm" />

        <MuteButton />
      </div>

      {/* Main Text Input & Live Preview */}
      <div
        style={{
          width: '100%',
          maxWidth: '750px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
        }}
      >
        <input
          type="text"
          value={text}
          onChange={handleInputChange}
          placeholder={t('TYPE_SOMETHING')}
          autoFocus
          maxLength={35}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '4px solid var(--ink)',
            padding: '1rem 0.5rem',
            textAlign: 'center',
            color: 'var(--ink)',
            fontFamily: fontStyle,
            fontSize: text.length <= 8 ? '2.5rem' : text.length <= 18 ? '1.8rem' : '1.2rem',
            outline: 'none',
          }}
        />

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {text.length <= 12 ? 'Press Start 2P Font' : 'Space Mono Font'}
        </p>
      </div>

      {/* Bottom Action Button */}
      <div style={{ marginBottom: '2rem' }}>
        <Button variant="primary" onClick={handleConvert} style={{ fontSize: '1rem', padding: '1rem 2.5rem' }}>
          <Box size={22} /> {t('TURN_INTO_CUBES')}
        </Button>
      </div>
    </motion.div>
  );
};
