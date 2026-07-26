'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Layers, Video, Share2, X, Check, Users, Sparkles } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { canShareFiles, shareOrCopyLink } from '@/lib/shareHelper';
import { videoRecorder, VideoFormat } from '@/lib/videoRecorder';
import { qualityTierManager } from '@/lib/qualityTier';
import { t } from '@/lib/i18n/strings';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { generateThumbnailDataUrl } from '@/lib/storage';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { uploadDirectToCloudinary } from '@/lib/cloudinaryClient';

import { Button } from '@/components/ui/Button';

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
  const [generatedChallengeUrl, setGeneratedChallengeUrl] = useState<string | null>(null);
  const [galleryShared, setGalleryShared] = useState(false);
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isExportingBg, setIsExportingBg] = useState(false);
  const [exportBgSuccess, setExportBgSuccess] = useState(false);
  const [isExportingTrans, setIsExportingTrans] = useState(false);
  const [exportTransSuccess, setExportTransSuccess] = useState(false);

  const gridData = useAppStore((state) => state.gridData);
  const isDisturbed = useAppStore((state) => state.isDisturbed);
  const mode = useAppStore((state) => state.mode);

  useEffect(() => {
    setCanShare(canShareFiles());
    setIsNativeMp4(videoRecorder.isNativeMp4Supported());
    setIsFallbackAllowed(qualityTierManager.getConfig().transcodeFallbackAllowed);
    if (!isOpen) {
      setGeneratedChallengeUrl(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEngine.playUIClick();
    onClose();
  };

  const handleChoiceBg = async () => {
    soundEngine.playUIClick();
    if (isExportingBg || exportBgSuccess) return;
    setIsExportingBg(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    onExport({ transparent: false });
    setIsExportingBg(false);
    setExportBgSuccess(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setExportBgSuccess(false);
    onClose();
  };

  const handleChoiceTrans = async () => {
    soundEngine.playUIClick();
    if (isExportingTrans || exportTransSuccess) return;
    setIsExportingTrans(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    onExport({ transparent: true });
    setIsExportingTrans(false);
    setExportTransSuccess(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setExportTransSuccess(false);
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
          grid_data: {
            cols: gridData.cols,
            rows: gridData.rows,
            colors: Array.from(gridData.colors),
          },
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
        setGeneratedChallengeUrl(fullUrl);
        soundEngine.playSuccessChime();
        announceToScreenReader('Challenge link generated successfully');
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
    if (isPublishing) return;
    setIsPublishing(true);

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
          grid_data: {
            cols: gridData.cols,
            rows: gridData.rows,
            colors: Array.from(gridData.colors),
          },
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
    } finally {
      setIsPublishing(false);
    }
  };

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isMp4Disabled = !isNativeMp4 && isOffline;

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
          {generatedChallengeUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center', padding: '0.5rem' }}>
              <h2 className="font-heading" style={{ fontSize: 'min(1.1rem, 5vw)', color: 'var(--ink)', wordBreak: 'break-word' }}>
                CHALLENGE CREATED!
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', wordBreak: 'break-word' }}>
                Send this link to a friend to challenge them to unravel this scrambled picture:
              </p>

              <input
                type="text"
                readOnly
                value={generatedChallengeUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg)',
                  border: '3px solid var(--ink)',
                  boxShadow: '3px 3px 0 var(--ink)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button
                  onClick={async () => {
                    soundEngine.playUIClick();
                    try {
                      await navigator.clipboard.writeText(generatedChallengeUrl);
                      setCopiedChallenge(true);
                      announceToScreenReader('Challenge link copied to clipboard');
                      setTimeout(() => setCopiedChallenge(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy to clipboard:', err);
                      showToast('Failed to copy link automatically. Please select the text above to copy.', 'error');
                    }
                  }}
                  isSuccess={copiedChallenge}
                  successText="COPIED!"
                  style={{
                    backgroundColor: copiedChallenge ? '#34C759' : 'var(--accent)',
                    color: '#FFFFFF',
                    border: '3px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    fontSize: '0.8rem',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {copiedChallenge ? <Check size={18} /> : <Share2 size={18} />}
                  <span>{copiedChallenge ? 'LINK COPIED!' : 'COPY LINK'}</span>
                </Button>

                {typeof navigator !== 'undefined' && navigator.share && (
                  <Button
                    onClick={async () => {
                      soundEngine.playUIClick();
                      try {
                        const message = `Check out what I made on Unravel — can you unravel it?`;
                        await navigator.share({
                          title: 'Unravel Challenge',
                          text: message,
                          url: generatedChallengeUrl,
                        });
                      } catch (err: any) {
                        if (err.name !== 'AbortError') {
                          console.warn('Native share failed:', err);
                        }
                      }
                    }}
                    style={{
                      backgroundColor: 'var(--surface)',
                      color: 'var(--ink)',
                      border: '3px solid var(--ink)',
                      boxShadow: '4px 4px 0 var(--ink)',
                      fontSize: '0.8rem',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Share2 size={18} />
                    <span>SHARE LINK</span>
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={() => {
                    setGeneratedChallengeUrl(null);
                    onClose();
                  }}
                  style={{
                    border: '3px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    fontSize: '0.8rem',
                    width: '100%',
                    marginTop: '0.25rem',
                  }}
                >
                  CLOSE
                </Button>
              </div>
            </div>
          ) : (
            <>
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
                  <Button
                    onClick={handleChallengeFriend}
                    isLoading={isCreatingChallenge}
                    isSuccess={copiedChallenge}
                    loadingText="CREATING..."
                    successText="LINK COPIED!"
                    aria-label={copiedChallenge ? 'Challenge link copied' : 'Challenge a friend with this scrambled picture'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '0.85rem',
                      padding: '0.85rem 1rem',
                      backgroundColor: copiedChallenge ? '#34C759' : 'var(--accent)',
                      color: '#FFFFFF',
                      border: '3px solid var(--ink)',
                      boxShadow: '4px 4px 0 var(--ink)',
                      fontSize: '0.8rem',
                      textAlign: 'left',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      width: '100%',
                    }}
                  >
                    {copiedChallenge ? <Check size={24} style={{ flexShrink: 0 }} /> : <Share2 size={24} style={{ flexShrink: 0 }} />}
                    <div style={{ flex: '1 1 auto' }}>
                      <div>{copiedChallenge ? 'LINK COPIED!' : 'CHALLENGE A FRIEND'}</div>
                      <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.9, marginTop: '0.15rem' }}>
                        Send the scrambled version for a friend to unravel
                      </div>
                    </div>
                  </Button>
                )}

                {/* Share to Community Gallery (Opt-in) */}
                <Button
                  onClick={handlePublishToGallery}
                  isLoading={isPublishing}
                  isSuccess={galleryShared}
                  loadingText="SHARING..."
                  successText="SHARED!"
                  aria-label={galleryShared ? 'Published to gallery' : 'Share artwork to community gallery'}
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
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    width: '100%',
                  }}
                >
                  {galleryShared ? <Check size={24} style={{ flexShrink: 0 }} /> : <Users size={24} style={{ flexShrink: 0 }} />}
                  <div style={{ flex: '1 1 auto' }}>
                    <div>{galleryShared ? 'SHARED TO GALLERY!' : 'SHARE TO GALLERY'}</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                      Show your artwork in the public gallery
                    </div>
                  </div>
                </Button>

                {/* Option 1: With Background */}
                <Button
                  onClick={handleChoiceBg}
                  isLoading={isExportingBg}
                  isSuccess={exportBgSuccess}
                  loadingText="SAVING..."
                  successText="SAVED!"
                  aria-label="Save artwork with background"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '0.85rem',
                    padding: '0.85rem 1rem',
                    backgroundColor: exportBgSuccess ? '#34C759' : 'var(--surface)',
                    color: exportBgSuccess ? '#FFFFFF' : 'var(--ink)',
                    border: '3px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    width: '100%',
                  }}
                >
                  <ImageIcon size={24} color={exportBgSuccess ? '#FFFFFF' : 'var(--ink)'} style={{ flexShrink: 0 }} />
                  <div style={{ flex: '1 1 auto' }}>
                    <div>{t('WITH_BACKGROUND')}</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                      Your full artwork as a PNG image
                    </div>
                  </div>
                </Button>

                {/* Option 2: Transparent */}
                <Button
                  onClick={handleChoiceTrans}
                  isLoading={isExportingTrans}
                  isSuccess={exportTransSuccess}
                  loadingText="SAVING..."
                  successText="SAVED!"
                  aria-label="Save artwork with transparent background"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '0.85rem',
                    padding: '0.85rem 1rem',
                    backgroundColor: exportTransSuccess ? '#34C759' : 'var(--surface)',
                    color: exportTransSuccess ? '#FFFFFF' : 'var(--ink)',
                    border: '3px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    width: '100%',
                  }}
                >
                  <Layers size={24} color={exportTransSuccess ? '#FFFFFF' : 'var(--ink)'} style={{ flexShrink: 0 }} />
                  <div style={{ flex: '1 1 auto' }}>
                    <div>{t('TRANSPARENT')}</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-body)', opacity: 0.8, marginTop: '0.15rem' }}>
                      Just the cubes, transparent background
                    </div>
                  </div>
                </Button>

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
                      {selectedVideoFormat === 'webm' && 'Quick video clip for sharing (100% local on device)'}
                      {selectedVideoFormat === 'mp4' && isNativeMp4 && 'Video clip, plays everywhere (100% local native MP4)'}
                      {selectedVideoFormat === 'mp4' && !isNativeMp4 && !isOffline && 'Video clip, converts server-side via Cloudinary'}
                      {isMp4Disabled && 'MP4 conversion requires internet connection. Use WebM instead.'}
                    </div>

                    {selectedVideoFormat === 'mp4' && !isNativeMp4 && !isOffline && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', opacity: 0.85, fontStyle: 'italic', marginTop: '0.1rem', wordBreak: 'break-word' }}>
                        Privacy Note: MP4 conversion temporarily processes your video clip via Cloudinary cloud. WebM and native MP4 exports stay 100% local on your device.
                      </div>
                    )}

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
                      width: '100%',
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
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
