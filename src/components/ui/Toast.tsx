'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, Info } from 'lucide-react';

interface ToastMessage {
  id: number;
  text: string;
  variant: 'success' | 'error' | 'info';
  duration: number;
}

let toastIdCounter = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

/**
 * Global imperative toast trigger — call from anywhere.
 */
export function showToast(
  text: string,
  variant: 'success' | 'error' | 'info' = 'info',
  duration: number = 3000
) {
  const msg: ToastMessage = { id: ++toastIdCounter, text, variant, duration };
  listeners.forEach((fn) => fn(msg));
}

/**
 * Toast container — mount once in your layout or main page.
 */
export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts((prev) => [...prev.slice(-4), msg]); // keep max 5

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== msg.id));
    }, msg.duration);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => { listeners.delete(addToast); };
  }, [addToast]);

  const iconFor = (variant: ToastMessage['variant']) => {
    switch (variant) {
      case 'success': return <Check size={16} />;
      case 'error': return <AlertTriangle size={16} />;
      default: return <Info size={16} />;
    }
  };

  const bgFor = (variant: ToastMessage['variant']) => {
    switch (variant) {
      case 'success': return '#34C759';
      case 'error': return 'var(--accent)';
      default: return 'var(--ink)';
    }
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.65rem 1.25rem',
              backgroundColor: bgFor(toast.variant),
              color: '#FFFFFF',
              border: '3px solid var(--ink)',
              boxShadow: '4px 4px 0 var(--ink)',
              fontFamily: 'var(--font-heading)',
              fontSize: '0.75rem',
              pointerEvents: 'auto',
              maxWidth: '90vw',
              textAlign: 'center',
            }}
          >
            {iconFor(toast.variant)}
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
