'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Key, Check, AlertTriangle, LogOut, Flame, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { soundEngine } from '@/lib/audio/soundEngine';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { Button } from './Button';
import { CustomKeyboard } from './CustomKeyboard';
import { CustomKeypad } from './CustomKeypad';
import Link from 'next/link';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const currentUsername = useAppStore((state) => state.username);
  const setStoreUsername = useAppStore((state) => state.setUsername);
  const setIsAdmin = useAppStore((state) => state.setIsAdmin);

  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [username, setUsername] = useState('');
  const [specialCode, setSpecialCode] = useState('');
  const [showSpecialCode, setShowSpecialCode] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Streak data for logged-in view
  const [streakData, setStreakData] = useState<{ current_streak: number; longest_streak: number } | null>(null);
  const [streakLoading, setStreakLoading] = useState(false);

  // Virtual keyboard touch device detection
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [activeField, setActiveField] = useState<'username' | 'specialCode' | 'pin' | 'confirmPin' | null>(null);

  // Refs for underlying hidden inputs to maintain focus & cursor behavior
  const usernameRef = useRef<HTMLInputElement>(null);
  const specialCodeRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const confirmPinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const detectTouch = () => {
      return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    };
    setIsTouchDevice(detectTouch());
  }, []);

  // Load streak when modal opens for logged-in user
  useEffect(() => {
    if (isOpen && currentUsername) {
      setStreakLoading(true);
      const deviceId = getDeviceId();
      fetch('/api/daily-challenge', { headers: { 'x-device-id': deviceId } })
        .then(r => r.json())
        .then(data => {
          if (data.streak) {
            setStreakData({
              current_streak: data.streak.current_streak || 0,
              longest_streak: data.streak.longest_streak || 0,
            });
          }
        })
        .catch(() => {})
        .finally(() => setStreakLoading(false));
    }
  }, [isOpen, currentUsername]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSuccess(false);
      setIsLoading(false);
      setUsername('');
      setSpecialCode('');
      setShowSpecialCode(false);
      setPin('');
      setConfirmPin('');
      setActiveField(null);
    }
  }, [isOpen, mode]);

  // Detect if typed username requires an admin special code
  useEffect(() => {
    if (mode === 'signup') {
      const trimmed = username.trim();
      const requiresCode = trimmed.toLowerCase().includes('admin') || trimmed === 'Billighost';
      setShowSpecialCode(requiresCode);
    }
  }, [username, mode]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEngine.playUIClick();
    onClose();
  };

  const handleToggleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    soundEngine.playUIClick();
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  const handleLogout = async () => {
    soundEngine.playUIClick();
    setIsLoading(true);
    setError(null);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/accounts/logout', {
        method: 'POST',
        headers: { 'x-device-id': deviceId },
      });
      if (res.ok) {
        setStoreUsername(null);
        setIsAdmin(false);
        showToast('Logged out successfully', 'success');
        announceToScreenReader('Logged out successfully');
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Logout failed.');
      }
    } catch (err) {
      setError('Connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading || isSuccess) return;

    soundEngine.playUIClick();
    setError(null);

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    if (pin.length < 6) {
      setError('PIN must be at least 6 digits.');
      return;
    }

    if (mode === 'signup' && pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    // Client-side admin gating check
    const trimmed = username.trim();
    if (mode === 'signup' && (trimmed.toLowerCase().includes('admin') || trimmed === 'Billighost')) {
      if (!specialCode.trim()) {
        setError('This username is reserved. Please enter the special code below.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const deviceId = getDeviceId();
      const url = mode === 'signup' ? '/api/accounts/signup' : '/api/accounts/login';

      const body: Record<string, string> = {
        username: username.trim(),
        pin,
      };
      if (mode === 'signup' && specialCode.trim()) {
        body.specialCode = specialCode.trim();
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        setIsSuccess(true);
        soundEngine.playSuccessChime();
        setStoreUsername(data.username);
        if (data.isAdmin) {
          setIsAdmin(true);
          showToast('Admin access granted! Welcome.', 'success');
        } else {
          showToast(mode === 'signup' ? 'Account created! Progress saved.' : 'Logged in successfully!', 'success');
        }
        announceToScreenReader(mode === 'signup' ? 'Account created' : 'Logged in');
        
        // Invalidate API caches for creations & gallery so they reload for the logged-in user
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const apiCache = await caches.open('unravel-api-cache');
            const apiKeys = await apiCache.keys();
            for (const key of apiKeys) {
              if (key.url.includes('/api/gallery') || key.url.includes('/api/daily-challenge') || key.url.includes('/api/creations')) {
                await apiCache.delete(key);
              }
            }
          } catch (cErr) {
            console.warn('Failed to prune SW cache on login/signup:', cErr);
          }
        }

        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        if (data.requiresSpecialCode) {
          setShowSpecialCode(true);
          showToast('This username is reserved. Enter the special code to register.', 'error');
        }
        setError(data.error || 'Request failed.');
      }
    } catch (err) {
      setError('Network connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const PinSlots: React.FC<{ value: string; label: string; field: 'pin' | 'confirmPin'; inputRef: React.RefObject<HTMLInputElement | null> }> = ({ value, label, field, inputRef }) => {
    const isFocused = activeField === field;

    const handleFocusSlots = () => {
      setActiveField(field);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
        <label className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>{label}</label>
        <div
          onClick={handleFocusSlots}
          style={{
            display: 'flex',
            gap: '0.4rem',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '0.2rem',
            border: isFocused ? '2px solid var(--accent)' : '2px dashed var(--border)',
            backgroundColor: 'rgba(0,0,0,0.02)',
          }}
        >
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              style={{
                flex: '1',
                aspectRatio: '1/1',
                maxWidth: '44px',
                border: '3px solid var(--ink)',
                boxShadow: '2px 2px 0 var(--ink)',
                backgroundColor: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {value.length > i ? (
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--ink)' }} />
              ) : isFocused && value.length === i ? (
                <motion.div
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  style={{ width: '3px', height: '16px', backgroundColor: 'var(--accent)' }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Keyboard extras padding
  const keyboardPadding = activeField ? '260px' : '1.5rem';

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
            maxWidth: '380px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            position: 'relative',
            maxHeight: '90vh',
            overflowY: 'auto',
            paddingBottom: keyboardPadding,
            transition: 'padding-bottom 0.2s ease',
          }}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close Account Menu"
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

          {currentUsername ? (
            /* ── Logged In View ─────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={{ width: '48px', height: '48px', border: '3px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <User size={24} />
              </div>
              <div>
                <h3 className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                  YOUR ACCOUNT
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Progress and streaks are saved server-side.
                </p>
                <div className="font-heading" style={{ fontSize: '1.15rem', color: 'var(--accent)', marginTop: '0.85rem', wordBreak: 'break-all' }}>
                  {currentUsername}
                </div>
              </div>

              {/* Streak Counter */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                {streakLoading ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading streak...</div>
                ) : streakData ? (
                  <>
                    {/* Current Streak */}
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.75rem 0.5rem',
                      backgroundColor: streakData.current_streak > 0 ? 'rgba(255, 59, 48, 0.08)' : 'var(--bg)',
                      border: `2px solid ${streakData.current_streak > 0 ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                      <Flame size={22} fill={streakData.current_streak > 0 ? 'var(--accent)' : 'var(--border)'} color={streakData.current_streak > 0 ? 'var(--accent)' : 'var(--border)'} />
                      <span className="font-heading" style={{ fontSize: '1.4rem', color: streakData.current_streak > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {streakData.current_streak}
                      </span>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)' }}>
                        CURRENT STREAK
                      </span>
                    </div>
                    {/* Longest Streak */}
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.75rem 0.5rem',
                      backgroundColor: 'var(--bg)',
                      border: '2px solid var(--border)',
                    }}>
                      <Flame size={22} fill="var(--border)" color="var(--border)" />
                      <span className="font-heading" style={{ fontSize: '1.4rem', color: 'var(--ink)' }}>
                        {streakData.longest_streak}
                      </span>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)' }}>
                        LONGEST STREAK
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: 'var(--bg)',
                    border: '2px solid var(--border)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    fontFamily: 'var(--font-body)',
                  }}>
                    Complete today's picture to start your streak! 🔥
                  </div>
                )}
              </div>

              {error && (
                <div style={{ display: 'flex', gap: '0.5rem', border: '2px solid var(--ink)', padding: '0.5rem', backgroundColor: 'rgba(255, 59, 48, 0.08)', color: 'var(--accent)', fontSize: '0.75rem', textAlign: 'left' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <div>{error}</div>
                </div>
              )}

              <Button
                variant="secondary"
                onClick={handleLogout}
                isLoading={isLoading}
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  borderColor: 'var(--accent)',
                  color: 'var(--accent)',
                }}
              >
                <LogOut size={16} /> LOG OUT
              </Button>
            </div>
          ) : (
            /* ── Sign Up / Login Forms ──────────────────────────────── */
            <>
              <div style={{ textAlign: 'center', padding: '0 0.5rem' }}>
                <h2 className="font-heading" style={{ fontSize: 'min(1.1rem, 5vw)', color: 'var(--ink)' }}>
                  {mode === 'signup' ? 'SAVE YOUR PROGRESS' : 'LOG IN'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {mode === 'signup'
                    ? 'Set up a username and PIN to sync your creations across devices.'
                    : 'Access your creations and daily streaks.'}
                </p>
              </div>

              {error && (
                <div style={{ display: 'flex', gap: '0.5rem', border: '2px solid var(--ink)', padding: '0.5rem', backgroundColor: 'rgba(255, 59, 48, 0.08)', color: 'var(--accent)', fontSize: '0.75rem', textAlign: 'left' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <div>{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Username */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>
                    USERNAME
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                      <User size={16} />
                    </span>
                    <input
                      ref={usernameRef}
                      type="text"
                      placeholder="e.g. pixel_artist"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setActiveField('username')}
                      inputMode={isTouchDevice ? 'none' : undefined}
                      readOnly={isTouchDevice}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                        backgroundColor: 'var(--bg)',
                        border: '3px solid var(--ink)',
                        boxShadow: '2px 2px 0 var(--ink)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  
                  {/* Special code field — shown when admin username detected */}
                  {mode === 'signup' && showSpecialCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}
                    >
                      <label className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <ShieldCheck size={13} /> SPECIAL CODE
                      </label>
                      <input
                        ref={specialCodeRef}
                        type="text"
                        placeholder="Enter special access code"
                        value={specialCode}
                        onChange={(e) => setSpecialCode(e.target.value)}
                        onFocus={() => setActiveField('specialCode')}
                        inputMode={isTouchDevice ? 'none' : 'numeric'}
                        pattern="[0-9]*"
                        readOnly={isTouchDevice}
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          backgroundColor: 'rgba(255,59,48,0.05)',
                          border: '2px solid var(--accent)',
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          letterSpacing: '0.15em',
                        }}
                      />
                    </motion.div>
                  )}
                </div>

                {/* PIN (Hidden input with visual slots) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', position: 'relative' }}>
                  <input
                    ref={pinRef}
                    type="password"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      if (/^\d*$/.test(e.target.value)) setPin(e.target.value);
                    }}
                    onFocus={() => setActiveField('pin')}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                  />
                  <PinSlots value={pin} label="6-DIGIT PIN" field="pin" inputRef={pinRef} />
                </div>

                {/* Confirm PIN (Signup only) */}
                {mode === 'signup' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', position: 'relative' }}>
                    <input
                      ref={confirmPinRef}
                      type="password"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => {
                        if (/^\d*$/.test(e.target.value)) setConfirmPin(e.target.value);
                      }}
                      onFocus={() => setActiveField('confirmPin')}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                    <PinSlots value={confirmPin} label="CONFIRM PIN" field="confirmPin" inputRef={confirmPinRef} />
                  </div>
                )}

                {/* Terms Acceptance Note */}
                {mode === 'signup' && (
                  <p style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.4' }}>
                    By continuing, you agree to our{' '}
                    <Link href="/terms" onClick={handleClose} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                      Terms
                    </Link>{' '}
                    &{' '}
                    <Link href="/privacy" onClick={handleClose} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                      Privacy Policy
                    </Link>.
                  </p>
                )}

                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isLoading}
                  isSuccess={isSuccess}
                  successText={mode === 'signup' ? 'SAVED!' : 'LOGGED IN!'}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '0.75rem' }}
                >
                  {mode === 'signup' ? 'CREATE USERNAME' : 'LOG IN'}
                </Button>
              </form>

              {/* Mode Toggle Link */}
              <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                <a
                  href="#"
                  onClick={handleToggleMode}
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-heading)',
                    color: 'var(--accent)',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                  }}
                >
                  {mode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
                </a>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Render touch virtual keyboard/keypad */}
      {isTouchDevice && activeField && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000 }}>
          {activeField === 'username' ? (
            <CustomKeyboard
              value={username}
              onChange={setUsername}
              onDone={() => {
                setActiveField(null);
                usernameRef.current?.blur();
              }}
            />
          ) : (
            <CustomKeypad
              value={activeField === 'pin' ? pin : activeField === 'confirmPin' ? confirmPin : specialCode}
              onChange={activeField === 'pin' ? setPin : activeField === 'confirmPin' ? setConfirmPin : setSpecialCode}
              onDone={() => {
                setActiveField(null);
                pinRef.current?.blur();
                confirmPinRef.current?.blur();
                specialCodeRef.current?.blur();
              }}
            />
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
