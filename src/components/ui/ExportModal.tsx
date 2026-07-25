'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Layers, Video, Share2, X, Check, Users, Sparkles } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { canShareFiles } from '@/lib/shareHelper';
import { videoRecorder, VideoFormat } from '@/lib/videoRecorder';
import { qualityTierManager } from '@/lib/qualityTier';
import { t } from '@/lib/i18n/strings';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { generateThumbnailDataUrl } from '@/lib/storage';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { uploadDirectToCloudinary } from '@/lib/cloudinaryClient';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: { transparent: boolean }) => void;
  onRecordVideo?: (format: VideoFormat) => void;
  onShareNative?: () => void;
}

const optionMotionProps = {
  whileHover: { scale: 1.01, x: -1, y: -1 },
  whileTap: { scale: 0.98, x: 2, y: 2 },
  transition: { duration: 0.08 },
};

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
  const [copiedChallenge, setCopiedChallenge] = useState(false);
  const [galleryShared, setGalleryShared] = useState(false);
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);

  const gridData = useAppStore((state) => state.gridData);
  const isDisturbed = useAppStore((state) => state.isDisturbed);
  const mode = useAppStore((state) => state.mode);

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

  const handleChallengeFriend = async () => {
    soundEngine.playUIClick();
    if (isCreatingChallenge) return;
    setIsCreatingChallenge(true);

    try {
      const physics = (window as any).__unravelPhysics;
      const disturbed = physics ? physics.getDisturbedPositions() : [];
      const rawThumbnail = generateThumbnailDataUrl(gridData);
      const thumbnail = await uploadDirectToCloudinary(rawThumbnail);
      const deviceId = getDeviceId();

      const res = await fetch('/api/creations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: gridData,
          disturbed_positions: disturbed,
          thumbnail,
          source_mode: mode,
          is_public: false,
        }),
      });

      const data = await res.json();
      if (data.shareUrl) {
        // Invalidate cached gallery requests
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const apiCache = await caches.open('unravel-api-cache');
            const apiKeys = await apiCache.keys();
            for (const key of apiKeys) {
              if (key.url.includes('/api/gallery')) {
                await apiCache.delete(key);
              }
            }
          } catch (err) {
            console.warn('Failed to invalidate client caches on challenge back:', err);
          }
        }

        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        await navigator.clipboard.writeText(fullUrl);
        setCopiedChallenge(true);
        soundEngine.playSuccessChime();
        announceToScreenReader('Challenge link copied to clipboard');
        setTimeout(() => {
          setCopiedChallenge(false);
          onClose();
        }, 2000);
      } else {
        showToast("Couldn't create the challenge link — try again", 'error');
      }
    } catch (err) {
      console.error('Failed to generate challenge link:', err);
      showToast("Couldn't create the challenge link — check your connection", 'error');
    } finally {
      setIsCreatingChallenge(false);
    }
  };

  const handlePublishToGallery = async () => {
    soundEngine.playUIClick();
    try {
      const physics = (window as any).__unravelPhysics;
      const disturbed = physics ? physics.getDisturbedPositions() : [];
      const rawThumbnail = generateThumbnailDataUrl(gridData);
      const thumbnail = await uploadDirectToCloudinary(rawThumbnail);
      const deviceId = getDeviceId();

      const res = await fetch('/api/creations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: gridData,
          disturbed_positions: disturbed,
          thumbnail,
          source_mode: mode,
          is_public: true,
        }),
      });

      if (res.ok) {
        // Invalidate cached gallery requests so the newly published creation appears
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const apiCache = await caches.open('unravel-api-cache');
            const apiKeys = await apiCache.keys();
            for (const key of apiKeys) {
              if (key.url.includes('/api/gallery')) {
                await apiCache.delete(key);
              }
            }
          } catch (err) {
            console.warn('Failed to invalidate client caches on publish:', err);
          }
        }

        setGalleryShared(true);
        soundEngine.playSuccessChime();
        announceToScreenReader('Artwork shared to the community gallery');
        setTimeout(() => {
          setGalleryShared(false);
          onClose();
        }, 2000);
      } else {
        showToast("Couldn't share to the gallery — try again", 'error');
      }
    } catch (err) {
      console.error('Failed to share to gallery:', err);
      showToast("Couldn't share to the gallery — check your connection", 'error');
    }
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
          padding: '0.75rem',
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
            boxShadow: '6px 6px 0 var(--ink)',
            padding: '1.5rem 1.25rem',
            maxWidth: '440px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          {/* Close button */}
          <motion.button
            onClick={handleClose}
            aria-label="Close Save Menu"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            style={{
              position: 'absolute',
              top: '0.75rem',
              right: '0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            <X size={20} />
          </motion.button>

          <div style={{ textAlign: 'center', paddingRight: '1.5rem', paddingLeft: '0.5rem' }}>
            <h2 className="font-heading" style={{ fontSize: 'min(1.1rem, 5vw)', color: 'var(--ink)', wordBreak: 'break-word' }}>
              {t('EXPORT_ARTWORK')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.3rem', wordBreak: 'break-word' }}>
              {t('SELECT_BG_FORMAT')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Challenge a Friend (Available when disturbed) */}
            {isDisturbed && (
              <motion.button
                onClick={handleChallengeFriend}
                disabled={isCreatingChallenge}
                aria-label={copiedChallenge ? 'Challenge link copied' : 'Challenge a friend with this scrambled picture'}
                className="font-heading"
                {...optionMotionProps}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  fontSize: '0.8rem',
                  cursor: isCreatingChallenge ? 'wait' : 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                }}
              >
                {copiedChallenge ? <Check size={24} style={{ flexShrink: 0 }} /> : <Share2 size={24} style={{ flexShrink: 0 }} />}
                <div style={{ flex: '1 1 auto' }}>
                  <div>{copiedChallenge ? 'LINK COPIED!' : 'CHALLENGE A FRIEND'}</div>
                  <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.9, marginTop: '0.15rem' }}>
                    Send the scrambled version for a friend to unravel
                  </div>
                </div>
              </motion.button>
            )}

            {/* Share to Community Gallery (Opt-in) */}
            <motion.button
              onClick={handlePublishToGallery}
              aria-label={galleryShared ? 'Published to gallery' : 'Share artwork to community gallery'}
              className="font-heading"
              {...optionMotionProps}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                backgroundColor: galleryShared ? '#34C759' : 'var(--surface)',
                color: galleryShared ? '#FFFFFF' : 'var(--ink)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {galleryShared ? <Check size={24} style={{ flexShrink: 0 }} /> : <Users size={24} style={{ flexShrink: 0 }} />}
              <div style={{ flex: '1 1 auto' }}>
                <div>{galleryShared ? 'SHARED TO GALLERY!' : 'SHARE TO GALLERY'}</div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                  Show your artwork in the public gallery
                </div>
              </div>
            </motion.button>

            {/* Option 1: With Background */}
            <motion.button
              onClick={() => handleChoice(false)}
              aria-label="Save artwork with background"
              className="font-heading"
              {...optionMotionProps}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              <ImageIcon size={24} color="var(--ink)" style={{ flexShrink: 0 }} />
              <div style={{ flex: '1 1 auto' }}>
                <div>{t('WITH_BACKGROUND')}</div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                  Your full artwork as a PNG image
                </div>
              </div>
            </motion.button>

            {/* Option 2: Transparent */}
            <motion.button
              onClick={() => handleChoice(true)}
              aria-label="Save artwork with transparent background"
              className="font-heading"
              {...optionMotionProps}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              <Layers size={24} color="var(--ink)" style={{ flexShrink: 0 }} />
              <div style={{ flex: '1 1 auto' }}>
                <div>{t('TRANSPARENT')}</div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                  Just the cubes, transparent background
                </div>
              </div>
            </motion.button>

            {/* Option 3: Record a Moment (Video with WEBM / MP4 Selector) */}
            {onRecordVideo && (
              <div
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Video size={20} color="var(--ink)" style={{ flexShrink: 0 }} />
                    <span className="font-heading" style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>
                      {t('RECORD_MOMENT')}
                    </span>
                  </div>

                  {/* Format Selector Pills: WEBM vs MP4 */}
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => setSelectedVideoFormat('webm')}
                      aria-label="Select WebM format"
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.65rem',
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
                      aria-label="Select MP4 format"
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.65rem',
                        fontFamily: 'var(--font-heading)',
                        backgroundColor: selectedVideoFormat === 'mp4' ? 'var(--ink)' : 'transparent',
                        color: isMp4Disabled ? '#AAA' : selectedVideoFormat === 'mp4' ? '#FFFFFF' : 'var(--ink)',
                        border: isMp4Disabled ? '2px solid #CCC' : '2px solid var(--ink)',
                        cursor: isMp4Disabled ? 'not-allowed' : 'pointer',
                        opacity: isMp4Disabled ? 0.6 : 1,
                      }}
                    >
                      MP4
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                  {selectedVideoFormat === 'webm' && 'Quick video clip for sharing'}
                  {selectedVideoFormat === 'mp4' && isNativeMp4 && 'Video clip, plays everywhere'}
                  {selectedVideoFormat === 'mp4' && !isNativeMp4 && !isMp4Disabled && 'Video clip, may take a moment to convert'}
                  {isMp4Disabled && 'MP4 not available on this device. Use WebM instead.'}
                </div>

                <motion.button
                  onClick={() => handleRecordVideo(selectedVideoFormat)}
                  aria-label={`Start recording ${selectedVideoFormat.toUpperCase()} video`}
                  className="font-heading"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                    border: '2px solid var(--ink)',
                    padding: '0.5rem 0.85rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    marginTop: '0.15rem',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                  }}
                >
                  <Video size={14} style={{ flexShrink: 0 }} /> START RECORDING ({selectedVideoFormat.toUpperCase()})
                </motion.button>
              </div>
            )}

            {/* Option 4: Native Share (If Web Share API supported) */}
            {canShare && onShareNative && (
              <motion.button
                onClick={handleShare}
                aria-label="Share artwork via system share sheet"
                className="font-heading"
                {...optionMotionProps}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--ink)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                }}
              >
                <Share2 size={24} color="var(--ink)" style={{ flexShrink: 0 }} />
                <div style={{ flex: '1 1 auto' }}>
                  <div>{t('SHARE_ARTWORK')}</div>
                  <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                    Send via Messages, WhatsApp, or AirDrop
                  </div>
                </div>
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
