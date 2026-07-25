'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge, Check } from 'lucide-react';
import { qualityTierManager, QualityTier } from '@/lib/qualityTier';
import { soundEngine } from '@/lib/audio/soundEngine';

interface PerformanceButtonProps {
  style?: React.CSSProperties;
}

export const PerformanceButton: React.FC<PerformanceButtonProps> = ({ style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTier, setCurrentTier] = useState<QualityTier>(() => qualityTierManager.getTier());
  const [isManual, setIsManual] = useState<boolean>(() => qualityTierManager.getIsManual());

  useEffect(() => {
    const unsubscribe = qualityTierManager.subscribe((config) => {
      setCurrentTier(config.tier);
      setIsManual(qualityTierManager.getIsManual());
    });
    return () => unsubscribe();
  }, []);

  const togglePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playUIClick();
    setIsOpen(!isOpen);
  };

  const handleSelectOption = (tier: QualityTier | 'auto') => {
    soundEngine.playUIClick();
    if (tier === 'auto') {
      qualityTierManager.clearManualOverride();
    } else {
      qualityTierManager.setManualTier(tier);
    }
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', zIndex: 60, ...style }}>
      <button
        data-ui-obstacle="true"
        onClick={togglePopover}
        aria-label="Performance Quality Settings"
        aria-expanded={isOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '42px',
          height: '42px',
          backgroundColor: 'var(--surface)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          boxShadow: '3px 3px 0 var(--ink)',
          cursor: 'pointer',
          outline: 'none',
          padding: 0,
        }}
      >
        <Gauge size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop overlay to dismiss popover when clicking outside */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 59,
                backgroundColor: 'transparent',
              }}
            />

            <motion.div
              data-ui-obstacle="true"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute',
                top: '50px',
                right: 0,
                width: '210px',
                backgroundColor: 'var(--surface)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                padding: '0.75rem',
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div
                className="font-heading"
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.2rem',
                  paddingLeft: '0.25rem',
                  letterSpacing: '0.05em',
                }}
              >
                QUALITY PREFERENCE
              </div>

              {[
                { id: 'high', label: 'Best Quality', desc: 'Sharper & detailed' },
                { id: 'medium', label: 'Balanced', desc: 'Smooth performance' },
                { id: 'low', label: 'Best Performance', desc: 'Smoother on older devices' },
                { id: 'auto', label: 'Automatic', desc: isManual ? 'Defer to auto probe' : `Auto (${currentTier.toUpperCase()})` },
              ].map((opt) => {
                const isSelected = opt.id === 'auto' ? !isManual : (isManual && currentTier === opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectOption(opt.id as QualityTier | 'auto');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      backgroundColor: isSelected ? 'var(--bg)' : 'transparent',
                      border: isSelected ? '2px solid var(--ink)' : '2px solid transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        className="font-heading"
                        style={{
                          fontSize: '0.7rem',
                          color: isSelected ? 'var(--accent)' : 'var(--ink)',
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        {opt.desc}
                      </span>
                    </div>
                    {isSelected && <Check size={16} color="var(--accent)" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
