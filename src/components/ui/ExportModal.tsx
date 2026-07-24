'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Layers, Video, Share2, X, Check } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { canShareFiles } from '@/lib/shareHelper';
import { videoRecorder, VideoFormat } from '@/lib/videoRecorder';
import { qualityTierManager } from '@/lib/qualityTier';
import { t } from '@/lib/i18n/strings';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: { transparent: boolean }) => void;
  onRecordVideo?: (format: VideoFormat) => void;
  onShareNative?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  onRecordVideo,
  onShareNative,
}) => {
  const [canShare, setCanShare] = useState(false);
  const [selectedVideoFormat, setSelectedVideoFormat] = useState<VideoFormat>('webm');
  const [isNativeMp4, setIsNativeMp4] = useState(false);
  const [isFallbackAllowed, setIsFallbackAllowed] = useState(true);

  useEffect(() => {
    setCanShare(canShareFiles());
    setIsNativeMp4(videoRecorder.isNativeMp4Supported());
    setIsFallbackAllowed(qualityTierManager.getConfig().transcodeFallbackAllowed);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEngine.playUIClick();
    onClose();
  };

  const handleChoice = (transparent: boolean) => {
    soundEngine.playUIClick();
    onExport({ transparent });
    onClose();
  };

  const handleRecordVideo = (format: VideoFormat) => {
    soundEngine.playUIClick();
    if (onRecordVideo) {
      onRecordVideo(format);
    }
    onClose();
  };

  const handleShare = () => {
    soundEngine.playUIClick();
    if (onShareNative) {
      onShareNative();
    }
    onClose();
  };

  const isMp4Disabled = !isNativeMp4 && !isFallbackAllowed;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          padding: '1.5rem',
        }}
        onClick={handleClose}
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
            maxWidth: '480px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close Export Modal"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            <X size={20} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <h2 className="font-heading" style={{ fontSize: '1.2rem', color: 'var(--ink)' }}>
              {t('EXPORT_ARTWORK')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
              {t('SELECT_BG_FORMAT')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Option 1: With Background */}
            <button
              onClick={() => handleChoice(false)}
              className="font-heading"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '1.1rem',
                padding: '1rem 1.25rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ImageIcon size={28} color="var(--ink)" />
              <div>
                <div>{t('WITH_BACKGROUND')}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                  Full canvas PNG image
                </div>
              </div>
            </button>

            {/* Option 2: Transparent */}
            <button
              onClick={() => handleChoice(true)}
              className="font-heading"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '1.1rem',
                padding: '1rem 1.25rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Layers size={28} color="var(--ink)" />
              <div>
                <div>{t('TRANSPARENT')}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                  Cube grid PNG alpha cut-out
                </div>
              </div>
            </button>

            {/* Option 3: Record a Moment (Video with WEBM / MP4 Selector) */}
            {onRecordVideo && (
              <div
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Video size={24} color="var(--ink)" />
                    <span className="font-heading" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                      {t('RECORD_MOMENT')}
                    </span>
                  </div>

                  {/* Format Selector Pills: WEBM vs MP4 */}
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      onClick={() => setSelectedVideoFormat('webm')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-heading)',
                        backgroundColor: selectedVideoFormat === 'webm' ? 'var(--ink)' : 'transparent',
                        color: selectedVideoFormat === 'webm' ? '#FFFFFF' : 'var(--ink)',
                        border: '2px solid var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      WEBM
                    </button>
                    <button
                      disabled={isMp4Disabled}
                      onClick={() => setSelectedVideoFormat('mp4')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-heading)',
                        backgroundColor: selectedVideoFormat === 'mp4' ? 'var(--ink)' : 'transparent',
                        color: isMp4Disabled ? '#AAA' : selectedVideoFormat === 'mp4' ? '#FFFFFF' : 'var(--ink)',
                        border: isMp4Disabled ? '2px solid #CCC' : '2px solid var(--ink)',
                        cursor: isMp4Disabled ? 'not-allowed' : 'pointer',
                        opacity: isMp4Disabled ? 0.6 : 1,
                      }}
                    >
                      MP4 {isNativeMp4 ? '(Native)' : ''}
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {selectedVideoFormat === 'webm' && 'Fast WebM video stream capture (Universal web format)'}
                  {selectedVideoFormat === 'mp4' && isNativeMp4 && 'Native H.264 MP4 recording (Safari/iOS supported)'}
                  {selectedVideoFormat === 'mp4' && !isNativeMp4 && !isMp4Disabled && 'Converts WebM to MP4 via lazy encoder'}
                  {isMp4Disabled && 'MP4 transcode disabled on low-end tier to preserve performance. WebM recommended.'}
                </div>

                <button
                  onClick={() => handleRecordVideo(selectedVideoFormat)}
                  className="font-heading"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                    border: '2px solid var(--ink)',
                    padding: '0.65rem 1rem',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginTop: '0.25rem',
                  }}
                >
                  <Video size={16} /> START RECORDING ({selectedVideoFormat.toUpperCase()})
                </button>
              </div>
            )}

            {/* Option 4: Native Share (If Web Share API supported) */}
            {canShare && onShareNative && (
              <button
                onClick={handleShare}
                className="font-heading"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '1.1rem',
                  padding: '1rem 1.25rem',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--ink)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Share2 size={28} color="var(--ink)" />
                <div>
                  <div>{t('SHARE_ARTWORK')}</div>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                    Send via Messages, WhatsApp, or AirDrop
                  </div>
                </div>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
