'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Flag, Eye, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { getDeviceId } from '@/lib/deviceId';
import { soundEngine } from '@/lib/audio/soundEngine';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';

interface CreationItem {
  id: string;
  thumbnail_url: string;
  source_mode: string;
  created_at: string;
  report_count: number;
}

export default function GalleryPage() {
  const [items, setItems] = useState<CreationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportedMap, setReportedMap] = useState<Record<string, boolean>>({});

  const loadGallery = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/gallery?limit=36');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        announceToScreenReader('Community gallery loaded');
      } else {
        setError("Couldn't load gallery items right now.");
        showToast("Couldn't load gallery — try again later", 'error');
      }
    } catch (err) {
      console.error('Failed to load gallery:', err);
      setError('Connection issue. Please check your internet and try again.');
      showToast('Network error loading gallery', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGallery();
  }, []);

  const handleReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    soundEngine.playUIClick();
    if (reportedMap[id]) return;

    const deviceId = getDeviceId();
    setReportedMap((prev) => ({ ...prev, [id]: true }));
    showToast('Report submitted. Thank you!', 'success');
    announceToScreenReader('Content report submitted');

    try {
      const res = await fetch(`/api/creations/${id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
      });

      const data = await res.json();
      if (data.hidden) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Failed to report creation:', err);
      // Revert optimistic report state on network failure
      setReportedMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast("Report failed to send — check your connection", 'error');
    }
  };

  return (
    <motion.main
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.2 }}
      style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--ink)', padding: '1rem' }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/" aria-label="Go back home">
              <Button variant="secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }}>
                <ArrowLeft size={16} /> HOME
              </Button>
            </Link>
            <Wordmark size="md" />
          </div>

          <h1 className="font-heading" style={{ fontSize: 'min(1.1rem, 5vw)', wordBreak: 'break-word', margin: 0 }}>
            PUBLIC GALLERY
          </h1>
        </div>

        {/* Gallery Grid States */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', gap: '1rem' }}>
            <Loader2 size={36} className="animate-spin" color="var(--accent)" />
            <p className="font-heading" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>LOADING GALLERY...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', backgroundColor: 'var(--surface)', border: '4px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <AlertTriangle size={36} color="var(--accent)" />
            <h3 className="font-heading" style={{ fontSize: '1rem' }}>COULDN'T LOAD GALLERY</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: '400px' }}>{error}</p>
            <Button variant="primary" onClick={loadGallery} style={{ marginTop: '0.5rem' }}>
              <RefreshCw size={16} /> RETRY
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', backgroundColor: 'var(--surface)', border: '4px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)' }}>
            <AlertTriangle size={32} color="var(--accent)" style={{ margin: '0 auto 1rem' }} />
            <h3 className="font-heading" style={{ fontSize: '1rem' }}>NO PUBLIC CREATIONS</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Be the first to share your artwork to the public community gallery!
            </p>
            <Link href="/" style={{ marginTop: '1.25rem', display: 'inline-block' }}>
              <Button variant="primary">CREATE ARTWORK</Button>
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: '1.25rem' }}>
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                whileHover={{ scale: 1.02, x: -2, y: -2 }}
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {/* Thumbnail Preview */}
                <Link href={`/challenge/${item.id}`} aria-label={`View artwork created in {item.source_mode} mode`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ aspectRatio: '4/3', width: '100%', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt="Creation thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: 'var(--font-heading)', fontSize: '0.8rem' }}>
                        UNRAVEL
                      </div>
                    )}

                    <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', backgroundColor: 'var(--ink)', color: '#FFF', padding: '0.15rem 0.5rem', fontSize: '0.6rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                      {item.source_mode}
                    </div>
                  </div>
                </Link>

                {/* Footer Controls */}
                <div style={{ padding: '0.65rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface)', gap: '0.5rem' }}>
                  <Link href={`/challenge/${item.id}`} style={{ textDecoration: 'none' }}>
                    <Button variant="secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}>
                      <Eye size={12} /> PLAY
                    </Button>
                  </Link>

                  <motion.button
                    onClick={(e) => handleReport(item.id, e)}
                    disabled={reportedMap[item.id]}
                    aria-label={reportedMap[item.id] ? "Already reported" : "Report inappropriate content"}
                    whileHover={!reportedMap[item.id] ? { scale: 1.05 } : undefined}
                    whileTap={!reportedMap[item.id] ? { scale: 0.95 } : undefined}
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '2px solid var(--ink)',
                      boxShadow: '2px 2px 0 var(--ink)',
                      padding: '0.35rem 0.5rem',
                      color: reportedMap[item.id] ? '#888' : 'var(--ink)',
                      cursor: reportedMap[item.id] ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-heading)',
                    }}
                  >
                    <Flag size={12} color={reportedMap[item.id] ? '#888' : 'var(--accent)'} /> {reportedMap[item.id] ? 'REPORTED' : 'REPORT'}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.main>
  );
}
