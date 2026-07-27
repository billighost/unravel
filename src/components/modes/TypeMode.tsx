'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Type, Box } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { CustomKeyboard } from '@/components/ui/CustomKeyboard';
import { renderTextToGrid, calculatePreviewFontSize } from '@/lib/renderTextToCanvas';
import { qualityTierManager } from '@/lib/qualityTier';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

// -- FONT DEFINITIONS --
// We lazy-load Google Fonts on mount via dynamic <link> injection
interface FontOption {
  id: string;
  label: string;
  family: string;
  /** Google Fonts URL query. Leave empty for system fonts. */
  googleUrl?: string;
  previewText: string;
}

const FONT_OPTIONS: FontOption[] = [
  {
    id: 'sans',
    label: 'SANS',
    family: "'Inter', 'Helvetica Neue', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap',
    previewText: 'Abc',
  },
  {
    id: 'serif',
    label: 'SERIF',
    family: "'Playfair Display', Georgia, serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap',
    previewText: 'Abc',
  },
  {
    id: 'display',
    label: 'DISPLAY',
    family: "'Righteous', Impact, sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap',
    previewText: 'Abc',
  },
  {
    id: 'handwritten',
    label: 'SCRIPT',
    family: "'Caveat', 'Comic Sans MS', cursive",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap',
    previewText: 'Abc',
  },
  {
    id: 'pixel',
    label: 'PIXEL',
    family: "'Press Start 2P', 'Courier New', monospace",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
    previewText: 'Abc',
  },
];

const MAX_LINES = 6;
const MAX_CHARS = 120;

export const TypeMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);

  const [text, setText] = useState('');
  const [selectedFont, setSelectedFont] = useState<FontOption>(FONT_OPTIONS[0]);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewFontSize, setPreviewFontSize] = useState(48);


  // Recompute preview font size whenever text or font changes
  useEffect(() => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const displayText = text || 'TYPE';
    const size = calculatePreviewFontSize(displayText, rect.width, rect.height, selectedFont.family);
    setPreviewFontSize(size);
  }, [text, selectedFont, fontsLoaded]);

  const handleTextChange = useCallback((newVal: string) => {
    // Enforce max lines
    const lines = newVal.split('\n');
    if (lines.length > MAX_LINES) {
      return; // ignore input that exceeds line limit
    }
    // Enforce max chars
    if (newVal.length > MAX_CHARS) {
      return;
    }
    setText(newVal);
  }, []);

  const handleConvert = () => {
    if (!text.trim()) return;

    soundEngine.playUIClick();
    const tierText = qualityTierManager.getConfig().gridResolutionType;
    const cols = tierText;
    const rows = Math.round(tierText / 2);
    const gridData = renderTextToGrid(text, cols, rows, selectedFont.family);
    setGridData(gridData);
  };

  const displayText = text || 'TYPE';
  const lineCount = (text.match(/\n/g) || []).length + 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        paddingBottom: '260px', // room for keyboard
      }}
    >
      {/* Top Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '700px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <Button variant="secondary" onClick={() => setMode('select')} aria-label="Go Back" style={{ padding: '0.6rem 1rem' }}>
          <ArrowLeft size={18} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('BACK')}</span>
        </Button>

        <Wordmark size="sm" />

        <MuteButton />
      </div>

      {/* Live Preview Box (2:1 Aspect Ratio) */}
      <div
        ref={previewRef}
        style={{
          width: 'min(90vw, 500px)',
          aspectRatio: '2 / 1',
          backgroundColor: '#000000',
          border: '4px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            color: '#FFFFFF',
            fontFamily: selectedFont.family,
            fontSize: `${previewFontSize}px`,
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.25,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            opacity: text ? 1 : 0.3,
            transition: 'font-size 0.15s ease, opacity 0.1s ease',
          }}
        >
          {displayText}
        </div>
      </div>

      {/* Font Selector and Convert Button Row */}
      <div
        style={{
          width: 'min(90vw, 500px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}
      >
        {/* Font Picker Trigger */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            onClick={() => {
              soundEngine.playUIClick();
              setIsFontPickerOpen(!isFontPickerOpen);
            }}
            aria-label="Select font"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.8rem',
              backgroundColor: 'var(--surface)',
              border: '3px solid var(--ink)',
              boxShadow: '3px 3px 0 var(--ink)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <Type size={16} />
            <span className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>
              {selectedFont.label}
            </span>
          </button>

          {/* Font Picker Popover */}
          <AnimatePresence>
            {isFontPickerOpen && (
              <>
                <div
                  onClick={() => setIsFontPickerOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    bottom: '120%',
                    left: 0,
                    zIndex: 100,
                    backgroundColor: 'var(--surface)',
                    border: '3px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    padding: '0.5rem',
                    width: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                  }}
                >
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      onClick={() => {
                        soundEngine.playUIClick();
                        setSelectedFont(font);
                        setIsFontPickerOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.6rem',
                        backgroundColor: selectedFont.id === font.id ? 'var(--ink)' : 'var(--surface)',
                        color: selectedFont.id === font.id ? '#FFFFFF' : 'var(--ink)',
                        border: '2px solid var(--ink)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span className="font-heading" style={{ fontSize: '0.7rem' }}>{font.label}</span>
                      <span
                        style={{
                          fontFamily: font.family,
                          fontSize: '0.9rem',
                          fontWeight: 'bold',
                          opacity: 0.8,
                        }}
                      >
                        {font.previewText}
                      </span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Line Count Indicator */}
        <span
          className="font-heading"
          style={{
            fontSize: '0.65rem',
            color: lineCount >= MAX_LINES ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {lineCount}/{MAX_LINES} LINES
        </span>

        {/* Convert Button */}
        <Button
          variant="primary"
          onClick={handleConvert}
          disabled={!text.trim()}
          aria-label="Turn text into 3D cubes"
          style={{ padding: '0.6rem 1.25rem', fontSize: '0.8rem' }}
        >
          <Box size={16} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>CUBES</span>
        </Button>
      </div>

      {/* Custom Keyboard */}
      <CustomKeyboard
        value={text}
        onChange={handleTextChange}
        onDone={handleConvert}
        maxLength={MAX_CHARS}
        maxLines={MAX_LINES}
      />
    </motion.div>
  );
};
