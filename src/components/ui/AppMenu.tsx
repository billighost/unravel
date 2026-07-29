'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Volume2, VolumeX, Gauge, Flame, Sparkles, Images, Plus, Check, User, ShieldCheck } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { qualityTierManager, QualityTier } from '@/lib/qualityTier';
import { getDeviceId } from '@/lib/deviceId';
import { showToast } from '@/components/ui/Toast';
import { Button } from './Button';
import { AccountModal } from './AccountModal';
import { useAppStore } from '@/store/useAppStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AppMenuProps {
  onOpenGallery?: () => void;
  onNewCreation?: () => void;
  showNewOption?: boolean;
}

export const AppMenu: React.FC<AppMenuProps> = ({
  onOpenGallery,
  onNewCreation,
  showNewOption = true,
}) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Mute state
  const [muted, setMuted] = useState(false);

  // Performance/Quality state
  const [currentTier, setCurrentTier] = useState<QualityTier>(() => qualityTierManager.getTier());
  const [isManual, setIsManual] = useState<boolean>(() => qualityTierManager.getIsManual());

  // Streak & Daily Challenge state
  const [streakCount, setStreakCount] = useState<number | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);

  // Account modal states
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const username = useAppStore((state) => state.username);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const setStoreUsername = useAppStore((state) => state.setUsername);
  const setIsAdmin = useAppStore((state) => state.setIsAdmin);

  // Check mobile width & sync mute/performance
  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);

    setMuted(soundEngine.getMuted());

    const unsubscribe = qualityTierManager.subscribe((config) => {
      setCurrentTier(config.tier);
      setIsManual(qualityTierManager.getIsManual());
    });

    // Load streak / daily challenge info
    const loadStreakAndChallenge = async () => {
      try {
        const deviceId = getDeviceId();
        const res = await fetch('/api/daily-challenge', {
          headers: { 'x-device-id': deviceId },
        });
        const data = await res.json();
        if (data.streak) {
          setStreakCount(data.streak.current_streak);
        }
        if (data.challenge && data.challenge.id) {
          setChallengeId(data.challenge.id);
        }
      } catch (err) {
        console.error('Failed to load challenge/streak in menu:', err);
      }
    };
    loadStreakAndChallenge();

    const checkSession = async () => {
      try {
        const deviceId = getDeviceId();
        const res = await fetch('/api/accounts/me', {
          headers: { 'x-device-id': deviceId },
        });
        const data = await res.json();
        if (data.loggedIn) {
          setStoreUsername(data.username);
          setIsAdmin(!!data.isAdmin);
        }
      } catch (err) {
        console.error('Failed to restore account session in menu:', err);
      }
    };
    checkSession();

    return () => {
      window.removeEventListener('resize', checkWidth);
      unsubscribe();
    };
  }, []);

  const toggleMenu = () => {
    soundEngine.playUIClick();
    setIsOpen(!isOpen);
  };

  const handleMuteToggle = () => {
    const newMuted = soundEngine.toggleMute();
    setMuted(newMuted);
    if (!newMuted) {
      soundEngine.playUnmuteBlip();
    }
  };

  const handleSelectQuality = (tier: QualityTier | 'auto') => {
    soundEngine.playUIClick();
    if (tier === 'auto') {
      qualityTierManager.clearManualOverride();
    } else {
      qualityTierManager.setManualTier(tier);
    }
  };

  const handleDailyChallengeClick = async () => {
    soundEngine.playUIClick();
    if (challengeId) {
      router.push(`/challenge/${challengeId}`);
      setIsOpen(false);
    } else {
      setLoadingChallenge(true);
      try {
        const deviceId = getDeviceId();
        const res = await fetch('/api/daily-challenge', {
          headers: { 'x-device-id': deviceId },
        });
        const data = await res.json();
        if (data.challenge && data.challenge.id) {
          router.push(`/challenge/${data.challenge.id}`);
          setIsOpen(false);
        } else {
          showToast("No daily picture available right now — try again later", 'info');
        }
      } catch (_) {
        showToast("Couldn't load today's picture — check your connection", 'error');
      } finally {
        setLoadingChallenge(false);
      }
    }
  };

  const handleGalleryClick = () => {
    soundEngine.playUIClick();
    setIsOpen(false);
    if (onOpenGallery) onOpenGallery();
  };

  const handleNewCreationClick = () => {
    soundEngine.playUIClick();
    setIsOpen(false);
    if (onNewCreation) onNewCreation();
  };

  const renderContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Header (Mobile Bottom Sheet only) */}
      {isMobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '3px solid var(--ink)',
            paddingBottom: '0.75rem',
            marginBottom: '0.25rem',
          }}
        >
          <span className="font-heading" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
            MENU
          </span>
          <button
            onClick={toggleMenu}
            aria-label="Close Menu"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Streak display */}
      {streakCount !== null && streakCount > 0 && (
        <div
          aria-label={`${streakCount} day challenge streak`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(255, 59, 48, 0.08)',
            border: '2px solid var(--accent)',
            padding: '0.6rem 0.85rem',
            color: 'var(--accent)',
          }}
        >
          <Flame size={18} fill="var(--accent)" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="font-heading" style={{ fontSize: '0.75rem' }}>
              STREAK ACTIVE!
            </span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-body)', fontWeight: 'bold' }}>
              {streakCount} Day Streak
            </span>
          </div>
        </div>
      )}

      {/* Main Options List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Account / Save Progress */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setIsOpen(false);
            setIsAccountOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.65rem 0.85rem',
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--ink)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <User size={18} color="var(--ink)" />
          <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)', textTransform: username ? 'none' : 'uppercase' }}>
            {username ? `ACCOUNT: ${username}` : 'SAVE YOUR PROGRESS'}
          </span>
        </button>

        {/* Admin Dashboard Link — only for admins */}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => setIsOpen(false)}
            style={{ textDecoration: 'none' }}
          >
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#1A1A1A',
                border: '2px solid var(--accent)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ShieldCheck size={18} color="var(--accent)" />
              <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                ADMIN DASHBOARD
              </span>
            </button>
          </Link>
        )}

        {/* Today's Challenge */}
        <button
          onClick={handleDailyChallengeClick}
          disabled={loadingChallenge}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.65rem 0.85rem',
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--ink)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Sparkles size={18} color="var(--accent)" />
          <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
            {loadingChallenge ? 'LOADING...' : "TODAY'S PICTURE"}
          </span>
        </button>

        {/* Gallery */}
        <button
          onClick={handleGalleryClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.65rem 0.85rem',
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--ink)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Images size={18} color="var(--ink)" />
          <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
            HISTORY GALLERY
          </span>
        </button>

        {/* Community Gallery Link */}
        <Link
          href="/gallery"
          onClick={() => setIsOpen(false)}
          style={{ textDecoration: 'none' }}
        >
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--ink)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Images size={18} color="var(--ink)" />
            <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
              PUBLIC GALLERY
            </span>
          </button>
        </Link>

        {/* Mute Row */}
        <button
          onClick={handleMuteToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '0.65rem 0.85rem',
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--ink)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {muted ? <VolumeX size={18} color="var(--text-secondary)" /> : <Volume2 size={18} color="var(--ink)" />}
            <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
              SOUNDS
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: muted ? 'var(--text-secondary)' : 'var(--accent)', fontWeight: 'bold' }}>
            {muted ? 'OFF' : 'ON'}
          </span>
        </button>

        {/* New Creation Option */}
        {showNewOption && (
          <button
            onClick={handleNewCreationClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--ink)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Plus size={18} color="var(--ink)" />
            <span className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
              NEW ARTWORK
            </span>
          </button>
        )}
      </div>

      {/* Quality Options Section */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: '0.75rem' }}>
        <div
          className="font-heading"
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.4rem',
            paddingLeft: '0.1rem',
            letterSpacing: '0.05em',
          }}
        >
          QUALITY PREFERENCE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
          {[
            { id: 'high', label: 'HIGH' },
            { id: 'medium', label: 'MEDIUM' },
            { id: 'low', label: 'LOW' },
            { id: 'auto', label: isManual ? 'AUTO' : `AUTO (${currentTier.toUpperCase()})` },
          ].map((opt) => {
            const isSelected = opt.id === 'auto' ? !isManual : (isManual && currentTier === opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => handleSelectQuality(opt.id as QualityTier | 'auto')}
                style={{
                  padding: '0.45rem',
                  backgroundColor: isSelected ? 'var(--ink)' : 'var(--surface)',
                  color: isSelected ? '#FFFFFF' : 'var(--ink)',
                  border: '2px solid var(--ink)',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-heading)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem',
                }}
              >
                {isSelected && <Check size={10} />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Legal Links */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
        <Link href="/about" onClick={() => setIsOpen(false)} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)', textDecoration: 'none' }}>ABOUT</Link>
        <span style={{ fontSize: '0.65rem', color: 'var(--border)' }}>|</span>
        <Link href="/terms" onClick={() => setIsOpen(false)} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)', textDecoration: 'none' }}>TERMS</Link>
        <span style={{ fontSize: '0.65rem', color: 'var(--border)' }}>|</span>
        <Link href="/privacy" onClick={() => setIsOpen(false)} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)', textDecoration: 'none' }}>PRIVACY</Link>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block', zIndex: isAccountOpen ? 1000 : isOpen ? 95 : 90 }}>
      {/* Menu Button Trigger */}
      <button
        data-ui-obstacle="true"
        onClick={toggleMenu}
        aria-label="Open App Menu"
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
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Click-outside backdrop */}
            <div
              onClick={() => setIsOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 98,
                backgroundColor: isMobile ? 'rgba(0, 0, 0, 0.4)' : 'transparent',
              }}
            />

            {isMobile ? (
              /* Mobile Bottom Sheet */
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                style={{
                  position: 'fixed',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--surface)',
                  borderTop: '4px solid var(--ink)',
                  boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
                  padding: '1.25rem 1.5rem 2rem 1.5rem',
                  zIndex: 99,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '85vh',
                  overflowY: 'auto',
                }}
              >
                {renderContent()}
              </motion.div>
            ) : (
              /* Desktop Anchored Popover */
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'absolute',
                  top: '52px',
                  right: 0,
                  width: '280px',
                  maxHeight: 'calc(100vh - 70px)',
                  overflowY: 'auto',
                  backgroundColor: 'var(--surface)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  padding: '1rem',
                  zIndex: 99,
                }}
              >
                {renderContent()}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />
    </div>
  );
};
