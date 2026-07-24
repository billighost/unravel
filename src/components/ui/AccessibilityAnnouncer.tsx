'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

export const AccessibilityAnnouncer: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');
  const mode = useAppStore((state) => state.mode);
  const isDisturbed = useAppStore((state) => state.isDisturbed);

  // Announce mode changes
  useEffect(() => {
    switch (mode) {
      case 'landing':
        setAnnouncement('Unravel home screen');
        break;
      case 'select':
        setAnnouncement('Mode selection screen');
        break;
      case 'upload':
        setAnnouncement('Upload photo mode');
        break;
      case 'draw':
        setAnnouncement('Draw pixel art mode');
        break;
      case 'type':
        setAnnouncement('Type text mode');
        break;
      case 'canvas':
        setAnnouncement('3D cube artwork displayed');
        break;
    }
  }, [mode]);

  // Announce disturbance state changes (announce once on change)
  useEffect(() => {
    if (mode === 'canvas') {
      if (isDisturbed) {
        setAnnouncement('Picture disturbed');
      }
    }
  }, [isDisturbed, mode]);

  // Listen for revert completion & recording events
  useEffect(() => {
    const handleRevertComplete = () => {
      setAnnouncement('Picture restored');
    };

    const handleCustomAnnouncement = (e: CustomEvent<{ message: string }>) => {
      if (e.detail && e.detail.message) {
        setAnnouncement(e.detail.message);
      }
    };

    window.addEventListener('unravel-revert-complete', handleRevertComplete);
    window.addEventListener('unravel-announce' as any, handleCustomAnnouncement);

    return () => {
      window.removeEventListener('unravel-revert-complete', handleRevertComplete);
      window.removeEventListener('unravel-announce' as any, handleCustomAnnouncement);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {announcement}
    </div>
  );
};

export function announceToScreenReader(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('unravel-announce', { detail: { message } }));
  }
}
