'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/soundEngine';

interface ReportConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ReportConfirmModal: React.FC<ReportConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    soundEngine.playUIClick();
    onConfirm();
  };

  const handleCancel = () => {
    soundEngine.playUIClick();
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          padding: '1.5rem',
        }}
        onClick={handleCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.12 }}
          onClick={(e) => e.stopPropagation()}
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
            <AlertTriangle size={44} color="var(--accent)" />
          </div>

          <div>
            <h2 className="font-heading" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>
              REPORT THIS CONTENT?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.75rem', lineHeight: '1.4' }}>
              Reporting this image flags it for moderator review. Content violating community guidelines will be hidden or removed.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button variant="primary" onClick={handleConfirm} style={{ width: '100%' }}>
              CONFIRM REPORT
            </Button>
            <Button variant="secondary" onClick={handleCancel} style={{ width: '100%', fontSize: '0.85rem' }}>
              CANCEL
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
