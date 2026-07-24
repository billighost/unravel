'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';

interface MuteButtonProps {
  style?: React.CSSProperties;
}

export const MuteButton: React.FC<MuteButtonProps> = ({ style }) => {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(soundEngine.getMuted());
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMute = soundEngine.toggleMute();
    setMuted(newMute);
    if (!newMute) {
      soundEngine.playUnmuteBlip();
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
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
        zIndex: 50,
        ...style,
      }}
    >
      {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
    </button>
  );
};
