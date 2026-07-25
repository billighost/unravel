'use client';

import React, { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Share2, Sparkles, AlertTriangle, Check, Flame, RefreshCw } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { MuteButton } from '@/components/ui/MuteButton';
import { soundEngine } from '@/lib/audio/soundEngine';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { SampledGridResult } from '@/lib/demoGenerator';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { uploadDirectToCloudinary } from '@/lib/cloudinaryClient';

const CubeCanvas = dynamic(
  () => import('@/components/canvas/CubeCanvas').then((mod) => mod.CubeCanvas),
  { ssr: false }
);

interface ChallengePageProps {
  params: Promise<{ id: string }>;
}

export default function ChallengePage({ params }: ChallengePageProps) {
  const { id } = use(params);
  const [creation, setCreation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [reported, setReported] = useState(false);
  const [streakCount, setStreakCount] = useState<number | null>(null);
  const [isChallengingBack, setIsChallengingBack] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixSuccess, setRemixSuccess] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

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
      setCreation(data.creation);
      announceToScreenReader('Challenge loaded. Disturb picture and tap revert to reveal.');

      // Record streak / daily completion if this was today's daily challenge
      if (data.creation.is_daily_challenge) {
        fetch('/api/daily-challenge/complete', {
          method: 'POST',
          headers: { 'x-device-id': deviceId },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.streak) {
              setStreakCount(d.streak.current_streak);
              soundEngine.playSuccessChime();
              announceToScreenReader(`Streak milestone! ${d.streak.current_streak} day streak`);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      setError("Hmm, we couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

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

    const handleCanvasReady = () => {
      const physics = (window as any).__unravelPhysics;
      if (physics) {
        if (creation.disturbed_positions && creation.disturbed_positions.length > 0) {
          physics.restoreDisturbedState(creation.disturbed_positions);
        } else {
          physics.triggerDisperse();
        }
      }
    };

    const timer = setTimeout(handleCanvasReady, 300);
    return () => clearTimeout(timer);
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
            if (d.streak) setStreakCount(d.streak.current_streak);
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
      const res = await fetch('/api/creations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: creation.grid_data,
          disturbed_positions: disturbed,
          thumbnail,
          source_mode: creation.source_mode,
          is_public: false,
        }),
      });

      const data = await res.json();
      if (data.shareUrl) {
        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        await navigator.clipboard.writeText(fullUrl);
        setCopiedLink(true);
        soundEngine.playSuccessChime();
        announceToScreenReader('Challenge link copied to clipboard');
        setTimeout(() => setCopiedLink(false), 3000);
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
    if (!creation || isRemixing) return;
    setIsRemixing(true);
    const deviceId = getDeviceId();

    try {
      const thumbnail = await uploadDirectToCloudinary(creation.thumbnail_url);
      const res = await fetch(`/api/creations/${creation.id}/remix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          grid_data: creation.grid_data,
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
        window.location.href = `/challenge/${data.id}`;
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
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', gap: '1rem' }}>
        <BrandLoader size={44} />
        <p className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>LOADING PICTURE...</p>
      </div>
    );
  }

  if (error || !creation) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: '2rem', gap: '1.5rem', textAlign: 'center' }}>
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
    colors: new Float32Array(creation.grid_data.colors),
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}
    >
      {/* Dynamic store synchronization helper */}
      <CanvasInitializer gridData={sampledGrid} />

      {/* 3D WebGL Canvas */}
      <CubeCanvas />

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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MuteButton style={{ width: '36px', height: '36px', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)' }} />
            <Button
              onClick={handleReport}
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
