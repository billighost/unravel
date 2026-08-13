'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Share2, Sparkles, AlertTriangle, Check, Flame, RefreshCw, X, Eye } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { MuteButton } from '@/components/ui/MuteButton';
import { soundEngine } from '@/lib/audio/soundEngine';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { SampledGridResult } from '@/lib/demoGenerator';
import { showToast } from '@/components/ui/Toast';
import { compressDisturbedPositions, compressColors, decompressColors } from '@/lib/storage';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { uploadDirectToCloudinary } from '@/lib/cloudinaryClient';
import { shareOrCopyLink } from '@/lib/shareHelper';
import { ReportConfirmModal } from '@/components/ui/ReportConfirmModal';

const CubeCanvas = dynamic(
  () => import('@/components/canvas/CubeCanvas').then((mod) => mod.CubeCanvas),
  { ssr: false }
);

interface ChallengeClientProps {
  id: string;
}

export default function ChallengeClient({ id }: ChallengeClientProps) {
  const router = useRouter();
  const [creation, setCreation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [challengeBackUrl, setChallengeBackUrl] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [streakCount, setStreakCount] = useState<number | null>(null);
  const [isChallengingBack, setIsChallengingBack] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixSuccess, setRemixSuccess] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const loadCreation = async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceId = getDeviceId();
      const res = await fetch(`/api/creations/${id}`, {
        headers: { 'x-device-id': deviceId },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'This picture is no longer available.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      const creationData = data.creation;

      if (creationData && creationData.thumbnail_url) {
        let attempts = 0;
        let loaded = false;
        const isDataUrl = creationData.thumbnail_url.startsWith('data:');
        const maxAttempts = isDataUrl ? 1 : 3;

        while (attempts < maxAttempts && !loaded) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            let src = creationData.thumbnail_url;
            if (!isDataUrl && attempts > 0) {
              const separator = src.includes('?') ? '&' : '?';
              src = `${src}${separator}retry=${attempts}`;
            }
            
            img.src = src;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Failed to load thumbnail'));
            });
            
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              creationData.textureCanvas = canvas;
            }
            loaded = true;
          } catch (err) {
            attempts++;
            if (attempts >= maxAttempts) {
              console.warn('Could not load thumbnail as texture after retries:', err);
              throw new Error('Failed to load artwork image.');
            }
            // wait before retrying (500ms, 1000ms)
            await new Promise(r => setTimeout(r, attempts * 500));
          }
        }
      }

      setCreation(creationData);
      announceToScreenReader('Challenge loaded. Disturb picture and tap revert to reveal.');

      // The streak is credited on reveal completion only (see the
      // unravel-revert-complete handler below). It used to also fire here, on
      // load, which handed out the streak — and a success chime — for merely
      // opening the page, and double-counted the completion.
    } catch (err) {
      setError("Hmm, we couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Lock the viewport for the challenge canvas view.
  useEffect(() => {
    document.documentElement.classList.add('unravel-fixed-viewport', 'scroll-locked');
    document.body.classList.add('scroll-locked');
    return () => {
      document.documentElement.classList.remove('unravel-fixed-viewport', 'scroll-locked');
      document.body.classList.remove('scroll-locked');
    };
  }, []);

  useEffect(() => {
    loadCreation();

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'API_CACHE_UPDATED') {
        try {
          const url = new URL(event.data.url, window.location.origin);
          if (url.pathname === `/api/creations/${id}`) {
            const data = event.data.data;
            if (data.is_hidden || data.error) {
              setError(data.error || 'This picture is no longer available.');
              setCreation(null);
            } else if (data.creation) {
              setCreation(data.creation);
              setError(null);
            }
          }
        } catch (e) {
          console.error('Error handling SW message in challenge page:', e);
        }
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [id]);

  // Set up canvas initialization with disturbed positions when canvas mounts
  useEffect(() => {
    if (!creation) return;

    const checkInterval = setInterval(() => {
      const physics = (window as any).__unravelPhysics;
      if (physics) {
        clearInterval(checkInterval);
        if (creation.disturbed_positions && creation.disturbed_positions.length > 0) {
          physics.restoreDisturbedState(creation.disturbed_positions);
        } else {
          setIsRevealed(true);
        }
        setCanvasReady(true);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [creation]);

  // Listen for revert complete event
  useEffect(() => {
    const handleRevertComplete = () => {
      setIsRevealed(true);
      soundEngine.playSuccessChime();
      announceToScreenReader('Original artwork revealed!');
      // Trigger daily challenge streak completion if appropriate
      if (creation?.is_daily_challenge) {
        const deviceId = getDeviceId();
        fetch('/api/daily-challenge/complete', {
          method: 'POST',
          headers: { 'x-device-id': deviceId },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.streak) {
              setStreakCount(d.streak.current_streak);
              announceToScreenReader(`${d.streak.current_streak} day streak`);
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('unravel-revert-complete', handleRevertComplete);
    return () => {
      window.removeEventListener('unravel-revert-complete', handleRevertComplete);
    };
  }, [creation]);

  const handleRevert = () => {
    soundEngine.playUIClick();
    const physics = (window as any).__unravelPhysics;
    if (physics) {
      physics.triggerRevert();
    }
  };

  const handleChallengeBack = async () => {
    soundEngine.playUIClick();
    const physics = (window as any).__unravelPhysics;
    if (!physics || !creation || isChallengingBack) return;
    setIsChallengingBack(true);

    const disturbed = physics.getDisturbedPositions();
    const deviceId = getDeviceId();

    try {
      const thumbnail = await uploadDirectToCloudinary(creation.thumbnail_url);
      const colorsData = typeof creation.grid_data.colors === 'string'
        ? creation.grid_data.colors
        : compressColors(creation.grid_data.colors);

      const res = await fetch('/api/creations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: {
            cols: creation.grid_data.cols,
            rows: creation.grid_data.rows,
            colors: colorsData,
          },
          disturbed_positions: compressDisturbedPositions(disturbed),
          thumbnail,
          source_mode: creation.source_mode,
          is_public: false,
        }),
      });

      const data = await res.json();
      if (data.shareUrl) {
        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        setChallengeBackUrl(fullUrl);
        soundEngine.playSuccessChime();
        announceToScreenReader('Challenge link generated successfully');
      } else {
        showToast("Couldn't create challenge link — try again", 'error');
      }
    } catch (err) {
      console.error('Failed to create back-challenge:', err);
      showToast("Couldn't create challenge link — check your connection", 'error');
    } finally {
      setIsChallengingBack(false);
    }
  };

  const handleRemix = async () => {
    soundEngine.playUIClick();
    const physics = (window as any).__unravelPhysics;
    if (!physics || !creation || isRemixing) return;
    setIsRemixing(true);
    const deviceId = getDeviceId();

    try {
      const thumbnail = await uploadDirectToCloudinary(creation.thumbnail_url);
      const colorsData = typeof creation.grid_data.colors === 'string'
        ? creation.grid_data.colors
        : compressColors(creation.grid_data.colors);

      const res = await fetch(`/api/creations/${creation.id}/remix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: {
            cols: creation.grid_data.cols,
            rows: creation.grid_data.rows,
            colors: colorsData,
          },
          disturbed_positions: compressDisturbedPositions(physics.getDisturbedPositions()),
          thumbnail,
          source_mode: creation.source_mode,
          is_public: false,
        }),
      });

      const data = await res.json();
      if (data.id) {
        setRemixSuccess(true);
        soundEngine.playSuccessChime();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setRemixSuccess(false);
        router.push(`/challenge/${data.id}`);
      } else {
        showToast("Couldn't remix this artwork — try again", 'error');
      }
    } catch (err) {
      console.error('Failed to create remix:', err);
      showToast("Couldn't remix this artwork — check your connection", 'error');
    } finally {
      setIsRemixing(false);
    }
  };

  const handleReport = async () => {
    soundEngine.playUIClick();
    if (reported || isReporting || !creation) return;
    setIsReporting(true);
    setShowReportConfirm(false);
    const deviceId = getDeviceId();

    // Invalidate client caches immediately for this creation and gallery pages
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const apiCache = await caches.open('unravel-api-cache');
        const apiKeys = await apiCache.keys();
        for (const key of apiKeys) {
          if (key.url.includes(`/api/creations/${creation.id}`)) {
            await apiCache.delete(key);
          }
          if (key.url.includes('/api/gallery')) {
            await apiCache.delete(key);
          }
        }

        const mediaCache = await caches.open('unravel-media-cache');
        if (creation.thumbnail_url) {
          await mediaCache.delete(creation.thumbnail_url);
        }
      } catch (err) {
        console.warn('Failed to invalidate client caches on report:', err);
      }
    }

    try {
      const res = await fetch(`/api/creations/${creation.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
      });
      const data = await res.json();
      if (data.hidden) {
        setReported(true);
        showToast('Report submitted. Content hidden.', 'success');
        announceToScreenReader('Content report submitted');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setError('This picture is no longer available.');
        setCreation(null);
      } else if (res.ok) {
        setReported(true);
        showToast('Report submitted. Thank you!', 'success');
        announceToScreenReader('Content report submitted');
      } else {
        throw new Error('Report request failed');
      }
    } catch (err) {
      console.error('Failed to report creation:', err);
      showToast("Report failed to send — check your connection", 'error');
    } finally {
      setIsReporting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ width: '100%', height: 'var(--app-height)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', gap: '1rem' }}>
        <BrandLoader size={44} />
        <p className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>LOADING PICTURE...</p>
      </div>
    );
  }

  if (error || !creation) {
    return (
      <div style={{ width: '100%', minHeight: 'var(--app-height)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 'clamp(1rem, 5vw, 2rem)', gap: '1.5rem', textAlign: 'center' }}>
        <div style={{ backgroundColor: 'var(--surface)', border: '4px solid var(--ink)', boxShadow: '8px 8px 0 var(--ink)', padding: '2.5rem', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <AlertTriangle size={48} color="var(--accent)" />
          <h2 className="font-heading" style={{ fontSize: '1.2rem', color: 'var(--ink)' }}>PICTURE NOT FOUND</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {error || 'This picture is no longer available.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={loadCreation}>
              <RefreshCw size={16} /> RETRY
            </Button>
            <Link href="/">
              <Button variant="primary">GO HOME</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sampledGrid: SampledGridResult = {
    cols: creation.grid_data.cols,
    rows: creation.grid_data.rows,
    colors: typeof creation.grid_data.colors === 'string'
      ? decompressColors(creation.grid_data.colors)
      : new Float32Array(creation.grid_data.colors),
    textureCanvas: creation.textureCanvas,
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="unravel-app-shell"
    >
      {/* Dynamic store synchronization helper */}
      <CanvasInitializer gridData={sampledGrid} />

      {/* 3D WebGL Canvas */}
      <CubeCanvas />

      {!canvasReady && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', gap: '1rem', zIndex: 50 }}>
          <BrandLoader size={44} />
          <p className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>LOADING PICTURE...</p>
        </div>
      )}

      {/* UI Overlay */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem', zIndex: 10 }}>
        {/* Top Header */}
        <div style={{ pointerEvents: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/" aria-label="Go Home" style={{ textDecoration: 'none' }}>
              <Wordmark size="sm" />
            </Link>
            {streakCount !== null && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                aria-label={`${streakCount} day streak`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  backgroundColor: 'var(--surface)',
                  border: '2px solid var(--ink)',
                  padding: '0.25rem 0.5rem',
                  boxShadow: '2px 2px 0 var(--ink)',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.65rem',
                  color: 'var(--accent)',
                }}
              >
                <Flame size={12} fill="var(--accent)" /> {streakCount}D
              </motion.div>
            )}
            {creation && (
              <div
                aria-label={`Viewed ${creation.view_count || 0} times`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  backgroundColor: 'var(--surface)',
                  border: '2px solid var(--ink)',
                  padding: '0.25rem 0.5rem',
                  boxShadow: '2px 2px 0 var(--ink)',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.65rem',
                  color: 'var(--ink)',
                }}
              >
                <Eye size={12} /> {creation.view_count || 0}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MuteButton style={{ width: '36px', height: '36px', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)' }} />
            <Button
              onClick={() => {
                if (!reported && !isReporting) {
                  setShowReportConfirm(true);
                }
              }}
              isLoading={isReporting}
              isSuccess={reported}
              loadingText="REPORTING"
              successText="REPORTED"
              aria-label={reported ? 'Content reported' : 'Report content'}
              style={{
                backgroundColor: 'var(--surface)',
                color: reported ? '#888' : 'var(--ink)',
                border: '2px solid var(--ink)',
                boxShadow: '2px 2px 0 var(--ink)',
                padding: '0.35rem 0.5rem',
                fontFamily: 'var(--font-heading)',
                fontSize: '0.65rem',
              }}
            >
              REPORT
            </Button>
          </div>
        </div>

        {/* Challenge Prompt Banner */}
        {!isRevealed && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{ pointerEvents: 'auto', alignSelf: 'center', backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '0.75rem 1rem', textAlign: 'center', maxWidth: '90vw' }}
          >
            <p className="font-heading" style={{ fontSize: 'min(0.85rem, 4vw)', color: 'var(--ink)', wordBreak: 'break-word' }}>
              {creation.is_daily_challenge ? "TODAY'S PICTURE" : "SOMEONE SHARED A MESS!"}
            </p>
            <p style={{ fontSize: 'min(0.7rem, 3.5vw)', color: 'var(--text-secondary)', marginTop: '0.2rem', wordBreak: 'break-word' }}>
              Poke at picture, then tap REVERT to reveal.
            </p>
          </motion.div>
        )}

        {/* Bottom Floating Bar */}
        <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
          {!isRevealed ? (
            <Button variant="primary" onClick={handleRevert} style={{ fontSize: '0.95rem', padding: '0.85rem 1.75rem' }}>
              <RotateCcw size={18} /> REVERT TO REVEAL
            </Button>
          ) : (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '0.75rem 1rem', maxWidth: '95vw' }}
            >
              <Button
                variant="primary"
                onClick={handleChallengeBack}
                isLoading={isChallengingBack}
                isSuccess={copiedLink}
                loadingText="CREATING..."
                successText="COPIED!"
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.75rem' }}
              >
                {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
                <span style={{ marginLeft: '0.25rem' }}>{copiedLink ? 'COPIED!' : 'CHALLENGE BACK'}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={handleRemix}
                isLoading={isRemixing}
                isSuccess={remixSuccess}
                loadingText="REMIXING..."
                successText="REMIXED!"
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.75rem' }}
              >
                <Sparkles size={14} /> <span style={{ marginLeft: '0.25rem' }}>REMIX</span>
              </Button>

              <Link href="/" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.75rem' }}>
                  TRY OWN
                </Button>
              </Link>
            </motion.div>
          )}

          {creation.parent_creation_id && (
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--ink)', backgroundColor: 'var(--surface)', padding: '0.2rem 0.5rem', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)', textAlign: 'center', wordBreak: 'break-word', maxWidth: '90vw' }}>
              Remixed from previous creation
            </div>
          )}
        </div>
      </div>

      <ReportConfirmModal
        isOpen={showReportConfirm}
        onClose={() => setShowReportConfirm(false)}
        onConfirm={handleReport}
      />

      <AnimatePresence>
        {challengeBackUrl && (
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
            onClick={() => setChallengeBackUrl(null)}
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
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setChallengeBackUrl(null)}
                aria-label="Close Challenge Back Menu"
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
              </button>

              <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                <h2 className="font-heading" style={{ fontSize: 'min(1.1rem, 5vw)', color: 'var(--ink)' }}>
                  CHALLENGE BACK CREATED!
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  Send this link to a friend to challenge them to unravel your scrambled picture:
                </p>
              </div>

              <input
                type="text"
                readOnly
                value={challengeBackUrl}
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
                      await navigator.clipboard.writeText(challengeBackUrl);
                      setCopiedLink(true);
                      announceToScreenReader('Challenge link copied to clipboard');
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy to clipboard:', err);
                      showToast('Failed to copy link automatically. Please select the text above to copy.', 'error');
                    }
                  }}
                  isSuccess={copiedLink}
                  successText="COPIED!"
                  style={{
                    backgroundColor: copiedLink ? '#34C759' : 'var(--accent)',
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
                  {copiedLink ? <Check size={18} /> : <Share2 size={18} />}
                  <span>{copiedLink ? 'LINK COPIED!' : 'COPY LINK'}</span>
                </Button>

                {typeof navigator !== 'undefined' && navigator.share && (
                  <Button
                    onClick={async () => {
                      soundEngine.playUIClick();
                      try {
                        const message = `I unraveled this picture on Unravel! Can you unravel my challenge back?`;
                        await navigator.share({
                           title: 'Unravel Challenge',
                           text: message,
                           url: challengeBackUrl,
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
                  onClick={() => setChallengeBackUrl(null)}
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}

function CanvasInitializer({ gridData }: { gridData: SampledGridResult }) {
  const setGridData = (useAppStore as any).getState().setGridData;
  useEffect(() => {
    setGridData(gridData, 'challenge');
  }, [gridData, setGridData]);
  return null;
}
