'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, Users, Image, Flag, Eye, EyeOff, RefreshCw, Sparkles,
  TrendingUp, Hash, Flame, ShieldCheck, ArrowLeft, Check, X, Calendar,
  Activity, Layers, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { showToast } from '@/components/ui/Toast';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Wordmark } from '@/components/ui/Wordmark';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyActivity {
  date: string;
  creations_count: number;
  public_count: number;
  challenge_completions: number;
  new_accounts: number;
  views: number;
}

interface SourceModeStat { source_mode: string; count: number }
interface TopStreak { username: string | null; device_id: string; current_streak: number; longest_streak: number }
interface ReportedCreation {
  id: string; device_id: string; created_at: string; thumbnail_url: string;
  source_mode: string; report_count: number; is_hidden: boolean; is_public: boolean; username?: string | null;
}

interface Analytics {
  total_creations: number;
  total_public: number;
  total_hidden: number;
  total_accounts: number;
  total_challenge_completions: number;
  total_views: number;
  daily_activity: DailyActivity[];
  source_mode_stats: SourceModeStat[];
  top_streaks: TopStreak[];
  reported_creations: ReportedCreation[];
}

interface User {
  username: string;
  email: string | null;
  created_at: string;
  creation_count: number;
  current_streak: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  upload: '#FF3B30',
  draw: '#FF9500',
  type: '#34C759',
  camera: '#5AC8FA',
  unknown: '#8E8E93',
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode; accent?: string; sub?: string }> = ({ label, value, icon, accent = 'var(--accent)', sub }) => (
  <div style={{
    backgroundColor: 'var(--surface)',
    border: '3px solid var(--ink)',
    boxShadow: '4px 4px 0 var(--ink)',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: accent }}>
      {icon}
      <span className="font-heading" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{label}</span>
    </div>
    <div className="font-heading" style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', color: 'var(--ink)', lineHeight: 1 }}>
      {typeof value === 'number' ? fmtNum(value) : value}
    </div>
    {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{sub}</div>}
  </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode }> = ({ icon, title, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '3px solid var(--ink)', paddingBottom: '0.6rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      {icon}
      <span className="font-heading" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{title}</span>
    </div>
    {action}
  </div>
);

// Simple bar chart using CSS
const BarChart: React.FC<{ data: DailyActivity[]; field: keyof Omit<DailyActivity, 'date'> }> = ({ data, field }) => {
  const max = Math.max(...data.map(d => d[field] as number), 1);
  const reversed = [...data].reverse();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px', width: '100%' }}>
      {reversed.map((d, i) => {
        const h = Math.max(4, ((d[field] as number) / max) * 80);
        const dateLabel = d.date.slice(5); // MM-DD
        return (
          <div key={i} title={`${d.date}: ${d[field]}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: 0 }}>
            <div style={{
              width: '100%',
              height: `${h}px`,
              backgroundColor: 'var(--accent)',
              opacity: 0.7 + (i / reversed.length) * 0.3,
              border: '1px solid var(--ink)',
              transition: 'height 0.4s ease',
            }} />
            <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {dateLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const username = useAppStore(s => s.username);
  const isAdmin = useAppStore(s => s.isAdmin);
  const setIsAdmin = useAppStore(s => s.setIsAdmin);
  const setStoreUsername = useAppStore(s => s.setUsername);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'users' | 'reports' | 'set-daily'>('overview');

  // Public gallery creations for "set today's picture"
  const [galleryPage, setGalleryPage] = useState<any[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [selectedCreationId, setSelectedCreationId] = useState<string | null>(null);
  const [settingDaily, setSettingDaily] = useState(false);

  // Reports hide/unhide state
  const [hidingId, setHidingId] = useState<string | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const deviceId = getDeviceId();
        const res = await fetch('/api/accounts/me', { headers: { 'x-device-id': deviceId } });
        const data = await res.json();
        if (!data.loggedIn || !data.isAdmin) {
          router.replace('/');
          return;
        }
        setStoreUsername(data.username);
        setIsAdmin(true);
      } catch {
        router.replace('/');
      } finally {
        setCheckingAuth(false);
      }
    };
    check();
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/admin/analytics', { headers: { 'x-device-id': deviceId } });
      const data = await res.json();
      if (data.analytics) setAnalytics(data.analytics);
    } catch {
      showToast("Couldn't load analytics", 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/admin/users', { headers: { 'x-device-id': deviceId } });
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      showToast("Couldn't load users", 'error');
    }
  }, []);

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch('/api/gallery?limit=20');
      const data = await res.json();
      if (data.items) setGalleryPage(data.items);
    } catch {
      showToast("Couldn't load gallery", 'error');
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!checkingAuth && isAdmin) {
      loadAnalytics();
    }
  }, [checkingAuth, isAdmin]);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'set-daily') loadGallery();
  }, [activeTab]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSetDaily = async () => {
    if (!selectedCreationId) {
      showToast('Select a creation first', 'error');
      return;
    }
    setSettingDaily(true);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/admin/set-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
        body: JSON.stringify({ creationId: selectedCreationId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Today's picture updated! ✨", 'success');
        setSelectedCreationId(null);
      } else {
        showToast(data.error || 'Failed to set daily', 'error');
      }
    } catch {
      showToast("Couldn't set daily picture", 'error');
    } finally {
      setSettingDaily(false);
    }
  };

  const handleToggleHide = async (creationId: string, hide: boolean) => {
    setHidingId(creationId);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/admin/hide-creation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
        body: JSON.stringify({ creationId, hidden: hide }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(hide ? 'Creation hidden' : 'Creation restored', 'success');
        // Update local state
        if (analytics) {
          setAnalytics({
            ...analytics,
            reported_creations: analytics.reported_creations.map(c =>
              c.id === creationId ? { ...c, is_hidden: hide } : c
            ),
          });
        }
      }
    } catch {
      showToast("Couldn't update visibility", 'error');
    } finally {
      setHidingId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <BrandLoader size={48} />
      </div>
    );
  }

  const tabs: Array<{ id: typeof activeTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'OVERVIEW', icon: <BarChart2 size={16} /> },
    { id: 'daily', label: 'ACTIVITY', icon: <Activity size={16} /> },
    { id: 'users', label: 'USERS', icon: <Users size={16} /> },
    { id: 'reports', label: 'REPORTS', icon: <Flag size={16} /> },
    { id: 'set-daily', label: "TODAY'S PIC", icon: <Sparkles size={16} /> },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'var(--surface)',
        borderBottom: '4px solid var(--ink)',
        boxShadow: '0 4px 0 var(--ink)',
        padding: '0.85rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
        >
          <ArrowLeft size={20} />
        </button>
        <Wordmark size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.25rem' }}>
          <ShieldCheck size={16} color="var(--accent)" />
          <span className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>ADMIN</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{username}</span>
          <button
            onClick={() => { loadAnalytics(); }}
            aria-label="Refresh analytics"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              backgroundColor: 'var(--bg)', border: '2px solid var(--ink)',
              padding: '0.35rem 0.65rem', cursor: 'pointer', color: 'var(--ink)',
              fontFamily: 'var(--font-heading)', fontSize: '0.72rem',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>
      </header>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex',
        overflowX: 'auto',
        borderBottom: '3px solid var(--ink)',
        backgroundColor: 'var(--surface)',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.75rem 1.1rem',
              backgroundColor: activeTab === tab.id ? 'var(--ink)' : 'transparent',
              color: activeTab === tab.id ? '#FFFFFF' : 'var(--ink)',
              border: 'none',
              borderRight: '2px solid var(--border)',
              cursor: 'pointer',
              fontFamily: 'var(--font-heading)',
              fontSize: '0.72rem',
              whiteSpace: 'nowrap',
              transition: 'background 0.1s ease',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main style={{ padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '1100px', margin: '0 auto' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Stat Cards Grid */}
            {loading && !analytics ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><BrandLoader size={40} /></div>
            ) : analytics ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                  <StatCard label="TOTAL CREATIONS" value={analytics.total_creations} icon={<Layers size={16} />} />
                  <StatCard label="PUBLIC" value={analytics.total_public} icon={<Eye size={16} />} accent="#34C759" />
                  <StatCard label="HIDDEN" value={analytics.total_hidden} icon={<EyeOff size={16} />} accent="#FF9500" />
                  <StatCard label="ACCOUNTS" value={analytics.total_accounts} icon={<Users size={16} />} accent="#5AC8FA" />
                  <StatCard label="COMPLETIONS" value={analytics.total_challenge_completions} icon={<Check size={16} />} accent="#FF9500" />
                  <StatCard label="TOTAL VIEWS" value={analytics.total_views} icon={<TrendingUp size={16} />} accent="#5AC8FA" />
                </div>

                {/* Source Mode Breakdown */}
                {analytics.source_mode_stats.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                    <SectionHeader icon={<Hash size={18} />} title="SOURCE MODE BREAKDOWN" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {analytics.source_mode_stats.map(s => {
                        const total = analytics.source_mode_stats.reduce((acc, x) => acc + x.count, 0);
                        const pct = total > 0 ? (s.count / total * 100).toFixed(1) : '0';
                        const color = COLORS[s.source_mode] || COLORS.unknown;
                        return (
                          <div key={s.source_mode} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: '56px', textTransform: 'uppercase' }}>{s.source_mode}</span>
                            <div style={{ flex: 1, height: '18px', backgroundColor: 'var(--bg)', border: '2px solid var(--ink)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s ease' }} />
                            </div>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', minWidth: '40px', textAlign: 'right' }}>{fmtNum(s.count)}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: '36px' }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top Streaks */}
                {analytics.top_streaks.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                    <SectionHeader icon={<Flame size={18} color="var(--accent)" />} title="TOP STREAKS" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {analytics.top_streaks.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', backgroundColor: i === 0 ? 'rgba(255,59,48,0.06)' : 'transparent', border: '2px solid var(--border)' }}>
                          <span className="font-heading" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '20px' }}>#{i + 1}</span>
                          <span className="font-heading" style={{ fontSize: '0.8rem', flex: 1, color: 'var(--ink)' }}>
                            {s.username || s.device_id.slice(0, 8) + '...'}
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Flame size={14} fill="var(--accent)" color="var(--accent)" />
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 'bold' }}>{s.current_streak}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>/ {s.longest_streak} best</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                No analytics data yet. Click Refresh.
              </div>
            )}
          </motion.div>
        )}

        {/* DAILY ACTIVITY TAB */}
        {activeTab === 'daily' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {analytics?.daily_activity && analytics.daily_activity.length > 0 ? (
              <>
                {(['creations_count', 'public_count', 'challenge_completions', 'new_accounts', 'views'] as const).map(field => {
                  const labels: Record<string, string> = {
                    creations_count: 'CREATIONS PER DAY',
                    public_count: 'PUBLIC PER DAY',
                    challenge_completions: 'CHALLENGE COMPLETIONS',
                    new_accounts: 'NEW ACCOUNTS',
                    views: 'VIEWS PER DAY',
                  };
                  return (
                    <div key={field} style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                      <SectionHeader icon={<Activity size={16} />} title={labels[field]} />
                      <BarChart data={analytics.daily_activity} field={field} />
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                No activity data yet. Come back tomorrow!
              </div>
            )}
          </motion.div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
              <SectionHeader
                icon={<Users size={18} />}
                title={`REGISTERED USERS (${users.length})`}
                action={
                  <button onClick={loadUsers} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontFamily: 'var(--font-heading)' }}>
                    <RefreshCw size={12} /> RELOAD
                  </button>
                }
              />
              {users.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                  No registered users yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Header row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '0.5rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--border)' }}>
                    {['USERNAME', 'EMAIL', 'WORKS', 'STREAK'].map(h => (
                      <span key={h} className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{h}</span>
                    ))}
                  </div>
                  {users.map((u) => (
                    <div key={u.username} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--bg)', border: '2px solid var(--border)', alignItems: 'center' }}>
                      <span className="font-heading" style={{ fontSize: '0.78rem', color: 'var(--ink)', wordBreak: 'break-all' }}>{u.username}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', wordBreak: 'break-all' }}>{u.email || '—'}</span>
                      <span className="font-heading" style={{ fontSize: '0.8rem', color: 'var(--ink)', textAlign: 'center' }}>{u.creation_count}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
                        <Flame size={12} fill={u.current_streak > 0 ? 'var(--accent)' : 'var(--border)'} color={u.current_streak > 0 ? 'var(--accent)' : 'var(--border)'} />
                        <span className="font-heading" style={{ fontSize: '0.8rem', color: u.current_streak > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>{u.current_streak}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
              <SectionHeader icon={<Flag size={18} color="var(--accent)" />} title="REPORTED CREATIONS" />
              {!analytics?.reported_creations || analytics.reported_creations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                  🎉 No reported creations right now.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {analytics.reported_creations.map(c => (
                    <div key={c.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: c.is_hidden ? 'rgba(0,0,0,0.04)' : 'var(--bg)',
                      border: `2px solid ${c.is_hidden ? 'var(--border)' : 'var(--ink)'}`,
                      opacity: c.is_hidden ? 0.6 : 1,
                      flexWrap: 'wrap',
                    }}>
                      {/* Thumbnail */}
                      <div style={{ width: '52px', height: '52px', flexShrink: 0, border: '2px solid var(--ink)', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
                        {c.thumbnail_url ? (
                          <img src={c.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Image size={20} color="var(--border)" />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--ink)', wordBreak: 'break-all' }}>{c.id}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: '0.2rem' }}>
                          by {c.username || 'anonymous'} · {c.source_mode} · {fmtDate(c.created_at)}
                        </div>
                      </div>
                      {/* Report count */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: 'rgba(255,59,48,0.1)', padding: '0.25rem 0.5rem', border: '2px solid var(--accent)' }}>
                        <Flag size={12} color="var(--accent)" />
                        <span className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{c.report_count}</span>
                      </div>
                      {/* Hide/Show button */}
                      <button
                        onClick={() => handleToggleHide(c.id, !c.is_hidden)}
                        disabled={hidingId === c.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.35rem',
                          padding: '0.4rem 0.65rem',
                          backgroundColor: c.is_hidden ? 'var(--surface)' : '#FF3B30',
                          color: c.is_hidden ? 'var(--ink)' : '#FFFFFF',
                          border: `2px solid ${c.is_hidden ? 'var(--ink)' : '#FF3B30'}`,
                          fontFamily: 'var(--font-heading)', fontSize: '0.7rem',
                          cursor: 'pointer', flexShrink: 0,
                          opacity: hidingId === c.id ? 0.5 : 1,
                        }}
                      >
                        {c.is_hidden ? <><Eye size={12} /> RESTORE</> : <><EyeOff size={12} /> HIDE</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TODAY'S PICTURE TAB */}
        {activeTab === 'set-daily' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Current daily info */}
            <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
              <SectionHeader icon={<Sparkles size={18} color="var(--accent)" />} title="SET TODAY'S PICTURE" />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                Select a public creation from below to set it as today's daily challenge. Only <strong>public</strong> creations are shown.
              </p>

              {selectedCreationId && (
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'rgba(52,199,89,0.1)', border: '2px solid #34C759' }}>
                  <Check size={16} color="#34C759" />
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-body)', color: 'var(--ink)', flex: 1, wordBreak: 'break-all' }}>
                    Selected: <strong>{selectedCreationId}</strong>
                  </span>
                  <button
                    onClick={handleSetDaily}
                    disabled={settingDaily}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#34C759',
                      color: '#FFFFFF',
                      border: 'none',
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      opacity: settingDaily ? 0.6 : 1,
                    }}
                  >
                    <Sparkles size={14} />
                    {settingDaily ? 'SAVING...' : 'SET AS TODAY'}
                  </button>
                </div>
              )}

              {galleryLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><BrandLoader size={36} /></div>
              ) : galleryPage.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                  No public creations available yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.6rem' }}>
                  {galleryPage.map(c => {
                    const isSelected = selectedCreationId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCreationId(isSelected ? null : c.id)}
                        title={`by ${c.username || 'anonymous'} · ${c.source_mode}`}
                        style={{
                          padding: 0,
                          border: `3px solid ${isSelected ? '#34C759' : 'var(--ink)'}`,
                          boxShadow: isSelected ? '0 0 0 2px #34C759' : '2px 2px 0 var(--ink)',
                          cursor: 'pointer',
                          position: 'relative',
                          aspectRatio: '1/1',
                          overflow: 'hidden',
                          backgroundColor: 'var(--bg)',
                          transition: 'border-color 0.1s ease',
                        }}
                      >
                        {c.thumbnail_url ? (
                          <img
                            src={c.thumbnail_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated', display: 'block' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={22} color="var(--border)" />
                          </div>
                        )}
                        {isSelected && (
                          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(52,199,89,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={24} color="#34C759" strokeWidth={3} />
                          </div>
                        )}
                        {c.is_daily_challenge && (
                          <div style={{ position: 'absolute', top: '3px', right: '3px', backgroundColor: 'var(--accent)', padding: '2px 4px' }}>
                            <Sparkles size={10} color="#FFFFFF" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

      </main>
    </div>
  );
}
