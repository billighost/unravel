'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, Users, Flag, Eye, EyeOff, RefreshCw, Sparkles,
  TrendingUp, Hash, Flame, ShieldCheck, ArrowLeft, Check, X, Calendar,
  Activity, Layers, Search, Download, Clock, ShieldAlert, Image as ImageIcon
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getDeviceId } from '@/lib/deviceId';
import { showToast } from '@/components/ui/Toast';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Wordmark } from '@/components/ui/Wordmark';
import { decompressColors } from '@/lib/storage';

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

interface AuditLogRecord {
  id: number;
  username: string;
  action_type: string;
  creation_id: string | null;
  created_at: string;
  details: string;
}

interface DailyChallengeInfo {
  active_date: string;
  creation_id: string;
  thumbnail_url: string;
  username: string | null;
  source_mode: string;
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
  audit_logs?: AuditLogRecord[];
  daily_challenges?: DailyChallengeInfo[];
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
  canvas: '#AF52DE',
  unknown: '#8E8E93',
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
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

// Interactive SVG Bar Chart with tooltips
const SvgBarChart: React.FC<{ data: DailyActivity[]; field: keyof Omit<DailyActivity, 'date'> }> = ({ data, field }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d[field] as number), 1);
  const reversed = [...data].reverse();
  
  const chartHeight = 110;
  const paddingBottom = 22;
  const totalHeight = chartHeight + paddingBottom;
  const barGap = 6;
  const totalWidth = 360; 

  const labelMap: Record<string, string> = {
    creations_count: 'Creations',
    public_count: 'Public',
    challenge_completions: 'Completions',
    new_accounts: 'Accounts',
    views: 'Views',
  };

  return (
    <div style={{ position: 'relative', width: '100%', marginTop: '0.5rem' }}>
      <svg viewBox={`0 0 ${totalWidth} ${totalHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = chartHeight - ratio * chartHeight;
          return (
            <line
              key={i}
              x1="0"
              y1={y}
              x2={totalWidth}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}
        
        {/* Render Bars */}
        {reversed.map((d, i) => {
          const val = d[field] as number;
          const h = (val / max) * chartHeight;
          const y = chartHeight - h;
          const barWidth = (totalWidth / reversed.length) - barGap;
          const x = i * (barWidth + barGap) + barGap / 2;
          
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(4, h)}
                fill="var(--accent)"
                opacity={hoveredIndex === i ? 1 : 0.7 + (i / reversed.length) * 0.3}
                stroke="var(--ink)"
                strokeWidth="2"
                style={{ cursor: 'pointer', transition: 'all 0.1s ease' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 14}
                textAnchor="middle"
                style={{ fontSize: '9px', fill: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 'bold' }}
              >
                {d.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Tooltip Overlay */}
      {hoveredIndex !== null && (
        <div style={{
          position: 'absolute',
          top: '-24px',
          left: `${(hoveredIndex / reversed.length) * 80 + 10}%`,
          transform: 'translateX(-50%)',
          backgroundColor: 'var(--ink)',
          color: '#FFFFFF',
          padding: '0.25rem 0.5rem',
          fontSize: '0.62rem',
          fontFamily: 'var(--font-body)',
          border: '2px solid var(--ink)',
          boxShadow: '2px 2px 0 var(--border)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          <strong>{reversed[hoveredIndex].date}</strong>: {fmtNum(reversed[hoveredIndex][field] as number)} {labelMap[field] || ''}
        </div>
      )}
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
  const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'users' | 'reports' | 'set-daily' | 'audit'>('overview');

  // Search & Filtering States for Users Tab
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState<'newest' | 'oldest' | 'creations' | 'streak'>('newest');

  // Auto-refresh states
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(30);

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<Record<string, number> | null>(null);

  // Artwork detail modal states
  const [selectedCreation, setSelectedCreation] = useState<any | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Public gallery creations for "set today's picture"
  const [galleryPage, setGalleryPage] = useState<any[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [selectedCreationId, setSelectedCreationId] = useState<string | null>(null);
  const [settingDaily, setSettingDaily] = useState(false);

  // Reports hide/unhide state
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [reportsSubTab, setReportsSubTab] = useState<'unresolved' | 'resolved'>('unresolved');

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const deviceId = getDeviceId();
        // no-store: the session response carries a 60s Cache-Control, and
        // serving a cached pre-login answer here bounces a freshly logged-in
        // admin straight back to the home page.
        const res = await fetch('/api/accounts/me', {
          headers: { 'x-device-id': deviceId },
          cache: 'no-store',
        });
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
  const parseServerTiming = (res: Response, roundtrip: number) => {
    const metrics: Record<string, number> = { roundtrip };
    const timing = res.headers.get('Server-Timing');
    if (timing) {
      timing.split(',').forEach(entry => {
        const parts = entry.split(';');
        const name = parts[0].trim();
        let dur = 0;
        parts.slice(1).forEach(part => {
          if (part.startsWith('dur=')) {
            dur = parseFloat(part.replace('dur=', ''));
          }
        });
        metrics[name] = dur;
      });
    }
    setDiagnostics(metrics);
  };

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = getDeviceId();
      const t0 = performance.now();
      const res = await fetch('/api/admin/analytics', { headers: { 'x-device-id': deviceId } });
      const t1 = performance.now() - t0;
      
      const data = await res.json();
      if (data.analytics) {
        setAnalytics(data.analytics);
        parseServerTiming(res, t1);
      }
    } catch {
      showToast("Couldn't load analytics", 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      const t0 = performance.now();
      const res = await fetch('/api/admin/users', { headers: { 'x-device-id': deviceId } });
      const t1 = performance.now() - t0;

      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
        parseServerTiming(res, t1);
      }
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
    if (!checkingAuth && isAdmin) {
      if (activeTab === 'users') loadUsers();
      if (activeTab === 'set-daily') loadGallery();
    }
  }, [activeTab, checkingAuth, isAdmin, loadUsers, loadGallery]);

  // ── Auto-Refresh Countdown ──────────────────────────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh && activeTab === 'overview') {
      interval = setInterval(() => {
        setRefreshTimer((prev) => {
          if (prev <= 1) {
            loadAnalytics();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setRefreshTimer(30);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, loadAnalytics]);

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
        showToast("Today's picture updated!", 'success');
        setSelectedCreationId(null);
        loadAnalytics(); // Reload to populate audit log & daily challenge grid
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
        loadAnalytics(); // Reload to capture audit action and sync lists
      }
    } catch {
      showToast("Couldn't update visibility", 'error');
    } finally {
      setHidingId(null);
    }
  };

  const handleDismissReports = async (creationId: string) => {
    setDismissingId(creationId);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/admin/dismiss-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
        body: JSON.stringify({ creationId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reports cleared successfully!', 'success');
        loadAnalytics(); // Reload to update list & log action
      } else {
        showToast(data.error || 'Failed to dismiss reports', 'error');
      }
    } catch {
      showToast("Error dismissing reports", 'error');
    } finally {
      setDismissingId(null);
    }
  };

  const handleViewDetails = async (creationId: string) => {
    setLoadingDetailsId(creationId);
    try {
      const res = await fetch(`/api/creations/${creationId}`);
      const data = await res.json();
      if (data.creation) {
        setSelectedCreation(data.creation);
      } else {
        showToast("Creation not found", 'error');
      }
    } catch {
      showToast("Error retrieving creation details", 'error');
    } finally {
      setLoadingDetailsId(null);
    }
  };

  // ── Dataset Exporters ───────────────────────────────────────────────────────
  const exportUsers = (format: 'csv' | 'json') => {
    if (users.length === 0) return;
    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(users, null, 2));
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `unravel_users_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      const headers = ['username', 'created_at', 'creation_count', 'current_streak'];
      const rows = users.map(u => [
        u.username,
        u.created_at,
        u.creation_count,
        u.current_streak
      ].map(val => `"${val}"`).join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `unravel_users_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    showToast(`Exported user list to ${format.toUpperCase()}`, 'success');
  };

  const exportActivity = (format: 'csv' | 'json') => {
    const data = analytics?.daily_activity;
    if (!data || data.length === 0) return;
    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `unravel_activity_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      const headers = ['date', 'creations_count', 'public_count', 'challenge_completions', 'new_accounts', 'views'];
      const rows = data.map(d => [
        d.date,
        d.creations_count,
        d.public_count,
        d.challenge_completions,
        d.new_accounts,
        d.views
      ].map(val => `"${val}"`).join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `unravel_activity_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    showToast(`Exported activity data to ${format.toUpperCase()}`, 'success');
  };

  // ── Render Helpers ──────────────────────────────────────────────────────────
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
    { id: 'audit', label: 'AUDIT LOG', icon: <ShieldAlert size={16} /> },
  ];

  // Filtering users purely in client
  const filteredUsers = users
    .filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase()))
    .sort((a, b) => {
      if (userSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (userSort === 'creations') return b.creation_count - a.creation_count;
      if (userSort === 'streak') return b.current_streak - a.current_streak;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // default: newest
    });

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
            onClick={() => {
              if (activeTab === 'users') loadUsers();
              else if (activeTab === 'set-daily') loadGallery();
              else loadAnalytics();
            }}
            aria-label="Refresh data"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              backgroundColor: 'var(--bg)', border: '2px solid var(--ink)',
              padding: '0.35rem 0.65rem', cursor: 'pointer', color: 'var(--ink)',
              fontFamily: 'var(--font-heading)', fontSize: '0.72rem',
              boxShadow: '2px 2px 0 var(--ink)'
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
        <AnimatePresence mode="wait">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Auto Refresh & Timer Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', padding: '0.6rem 1rem', boxShadow: '3px 3px 0 var(--ink)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-heading)', fontSize: '0.72rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }}
                  />
                  AUTO REFRESH (30s)
                </label>
                {autoRefresh && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={12} color="var(--accent)" />
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', fontWeight: 'bold' }}>Refreshing in {refreshTimer}s</span>
                    <div style={{ width: '60px', height: '6px', border: '1px solid var(--ink)', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ width: `${(refreshTimer / 30) * 100}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 1s linear' }} />
                    </div>
                  </div>
                )}
              </div>

              {loading && !analytics ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><BrandLoader size={40} /></div>
              ) : analytics ? (
                <>
                  {/* System & Query Diagnostics Panel */}
                  {diagnostics && (
                    <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.3rem', marginBottom: '0.3rem' }}>
                        <Activity size={14} color="var(--accent)" />
                        <span className="font-heading" style={{ fontSize: '0.7rem', color: 'var(--ink)' }}>SYSTEM DIAGNOSTICS</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.4rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>DB LATENCY</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{diagnostics.db ? `${diagnostics.db.toFixed(1)}ms` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.4rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>CACHE SPEED</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{diagnostics.cache ? `${diagnostics.cache.toFixed(1)}ms` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.4rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>AUTH GATEWAY</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{diagnostics.auth ? `${diagnostics.auth.toFixed(1)}ms` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.4rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>API ROUNDTRIP</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{diagnostics.roundtrip ? `${diagnostics.roundtrip.toFixed(0)}ms` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  )}

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
                          const total = analytics.source_mode_stats.reduce((acc, x) => acc + Number(x.count), 0);
                          const pct = total > 0 ? ((Number(s.count) / total) * 100).toFixed(1) : '0';
                          const color = COLORS[s.source_mode.toLowerCase()] || COLORS.unknown;
                          return (
                            <div key={s.source_mode} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: '56px', textTransform: 'uppercase' }}>{s.source_mode}</span>
                              <div style={{ flex: 1, height: '18px', backgroundColor: 'var(--bg)', border: '2px solid var(--ink)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s ease' }} />
                              </div>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', minWidth: '40px', textAlign: 'right' }}>{fmtNum(Number(s.count))}</span>
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
                            <span className="font-heading" style={{ fontSize: '0.8rem', flex: 1, color: 'var(--ink)', textTransform: 'none' }}>
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
            <motion.div key="daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {analytics?.daily_activity && analytics.daily_activity.length > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button onClick={() => exportActivity('csv')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', border: '2px solid var(--ink)', backgroundColor: 'var(--surface)', padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', cursor: 'pointer', boxShadow: '2px 2px 0 var(--ink)' }}>
                      <Download size={12} /> EXPORT CSV
                    </button>
                    <button onClick={() => exportActivity('json')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', border: '2px solid var(--ink)', backgroundColor: 'var(--surface)', padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', cursor: 'pointer', boxShadow: '2px 2px 0 var(--ink)' }}>
                      <Download size={12} /> EXPORT JSON
                    </button>
                  </div>
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
                        <SvgBarChart data={analytics.daily_activity} field={field} />
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
            <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }}>
              <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                <SectionHeader
                  icon={<Users size={18} />}
                  title={`REGISTERED USERS (${users.length})`}
                  action={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button onClick={() => exportUsers('csv')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', border: '2px solid var(--ink)', backgroundColor: 'var(--bg)', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', cursor: 'pointer' }}>
                        <Download size={11} /> CSV
                      </button>
                      <button onClick={() => exportUsers('json')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', border: '2px solid var(--ink)', backgroundColor: 'var(--bg)', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', cursor: 'pointer' }}>
                        <Download size={11} /> JSON
                      </button>
                    </div>
                  }
                />

                {/* Filter and Search Bar */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  {/* Search box */}
                  <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', border: '2px solid var(--ink)', padding: '0.4rem 0.65rem', backgroundColor: 'var(--bg)' }}>
                    <Search size={14} color="var(--text-secondary)" style={{ marginRight: '0.4rem' }} />
                    <input
                      type="text"
                      placeholder="Search username..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      style={{ border: 'none', backgroundColor: 'transparent', width: '100%', fontSize: '0.75rem', outline: 'none', fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
                    />
                  </div>
                  {/* Sorting dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', border: '2px solid var(--ink)', backgroundColor: 'var(--surface)', padding: '0 0.5rem' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginRight: '0.4rem', fontWeight: 'bold' }}>SORT BY:</span>
                    <select
                      value={userSort}
                      onChange={(e) => setUserSort(e.target.value as any)}
                      style={{ border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '0.72rem', fontFamily: 'var(--font-heading)', cursor: 'pointer', padding: '0.4rem 0' }}
                    >
                      <option value="newest">NEWEST USERS</option>
                      <option value="oldest">OLDEST USERS</option>
                      <option value="creations">MOST WORKS</option>
                      <option value="streak">ACTIVE STREAK</option>
                    </select>
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    No users match your criteria.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto auto', gap: '0.5rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--border)' }}>
                      {['USERNAME', 'REGISTERED', 'WORKS', 'STREAK'].map(h => (
                        <span key={h} className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{h}</span>
                      ))}
                    </div>
                    {filteredUsers.map((u) => (
                      <div key={u.username} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto auto', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--bg)', border: '2px solid var(--border)', alignItems: 'center' }}>
                        <span className="font-heading" style={{ fontSize: '0.78rem', color: 'var(--ink)', wordBreak: 'break-all', textTransform: 'none' }}>{u.username}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
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
          {activeTab === 'reports' && (() => {
            const reportedList = analytics?.reported_creations || [];
            const unresolvedList = reportedList.filter(c => !c.is_hidden);
            const resolvedList = reportedList.filter(c => c.is_hidden);
            const filteredReports = reportsSubTab === 'resolved' ? resolvedList : unresolvedList;

            return (
              <motion.div key="reports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }}>
                <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                  <SectionHeader icon={<Flag size={18} color="var(--accent)" />} title="REPORTED CREATIONS" />

                  {/* Sub-tabs */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>
                    <button
                      onClick={() => setReportsSubTab('unresolved')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-heading)',
                        backgroundColor: reportsSubTab === 'unresolved' ? 'var(--ink)' : 'transparent',
                        color: reportsSubTab === 'unresolved' ? '#FFFFFF' : 'var(--ink)',
                        border: '2px solid var(--ink)',
                        cursor: 'pointer',
                        boxShadow: reportsSubTab === 'unresolved' ? 'none' : '2px 2px 0 var(--ink)',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      UNRESOLVED ({unresolvedList.length})
                    </button>
                    <button
                      onClick={() => setReportsSubTab('resolved')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-heading)',
                        backgroundColor: reportsSubTab === 'resolved' ? 'var(--ink)' : 'transparent',
                        color: reportsSubTab === 'resolved' ? '#FFFFFF' : 'var(--ink)',
                        border: '2px solid var(--ink)',
                        cursor: 'pointer',
                        boxShadow: reportsSubTab === 'resolved' ? 'none' : '2px 2px 0 var(--ink)',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      RESOLVED ({resolvedList.length})
                    </button>
                  </div>

                  {filteredReports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', border: '2px dashed var(--border)' }}>
                      {reportsSubTab === 'resolved' ? 'No resolved reports. Hide a reported item to see it here.' : 'No reported creations right now.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {filteredReports.map(c => (
                        <div key={c.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          backgroundColor: c.is_hidden ? 'rgba(0,0,0,0.04)' : 'var(--bg)',
                          border: `2px solid ${c.is_hidden ? 'var(--border)' : 'var(--ink)'}`,
                          opacity: c.is_hidden ? 0.8 : 1,
                          flexWrap: 'wrap',
                        }}>
                          {/* Thumbnail Preview wrapper trigger */}
                          <button
                            onClick={() => handleViewDetails(c.id)}
                            title="Click to view details"
                            style={{
                              padding: 0,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'block'
                            }}
                          >
                            <div style={{ width: '52px', height: '52px', flexShrink: 0, border: '2px solid var(--ink)', overflow: 'hidden', backgroundColor: 'var(--bg)', position: 'relative' }}>
                              {c.thumbnail_url ? (
                                <img src={c.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ImageIcon size={20} color="var(--border)" />
                                </div>
                              )}
                              {loadingDetailsId === c.id && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <RefreshCw size={12} className="animate-spin" />
                                </div>
                              )}
                            </div>
                          </button>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                              onClick={() => handleViewDetails(c.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                textAlign: 'left',
                                display: 'block',
                                width: '100%'
                              }}
                            >
                              <div className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--ink)', wordBreak: 'break-all', textDecoration: 'underline' }}>{c.id}</div>
                            </button>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: '0.2rem' }}>
                              by {c.username || 'anonymous'} · {c.source_mode} · {new Date(c.created_at).toLocaleDateString('en-GB')}
                            </div>
                          </div>
                          {/* Report count */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: 'rgba(255,59,48,0.1)', padding: '0.25rem 0.5rem', border: '2px solid var(--accent)' }}>
                            <Flag size={12} color="var(--accent)" />
                            <span className="font-heading" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{c.report_count}</span>
                          </div>
                          
                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {/* Dismiss reports button (only unresolved) */}
                            {!c.is_hidden && (
                              <button
                                onClick={() => handleDismissReports(c.id)}
                                disabled={dismissingId === c.id || hidingId === c.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                                  padding: '0.4rem 0.65rem',
                                  backgroundColor: 'var(--surface)',
                                  color: 'var(--text-secondary)',
                                  border: '2px solid var(--border)',
                                  fontFamily: 'var(--font-heading)', fontSize: '0.7rem',
                                  cursor: 'pointer', flexShrink: 0,
                                  opacity: dismissingId === c.id ? 0.5 : 1,
                                }}
                              >
                                <Check size={12} /> DISMISS
                              </button>
                            )}

                            {/* Hide/Show button */}
                            <button
                              onClick={() => handleToggleHide(c.id, !c.is_hidden)}
                              disabled={hidingId === c.id || dismissingId === c.id}
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}

          {/* TODAY'S PICTURE TAB */}
          {activeTab === 'set-daily' && (
            <motion.div key="set-daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

                {/* Daily Challenges Timeline Grid */}
                {analytics?.daily_challenges && analytics.daily_challenges.length > 0 && (
                  <div style={{ marginTop: '2.5rem', borderTop: '2px solid var(--border)', paddingTop: '1.5rem' }}>
                    <SectionHeader icon={<Calendar size={18} />} title="RECENT DAILY CHALLENGES" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                      {analytics.daily_challenges.map(d => (
                        <div key={d.active_date} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', backgroundColor: 'var(--bg)', border: '2px solid var(--border)' }}>
                          <div style={{ width: '48px', height: '48px', flexShrink: 0, border: '2px solid var(--ink)', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
                            {d.thumbnail_url ? (
                              <img src={d.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ImageIcon size={18} color="var(--border)" />
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--ink)' }}>{d.active_date}</div>
                            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              by {d.username || 'anonymous'}
                            </div>
                            <button
                              onClick={() => handleViewDetails(d.creation_id)}
                              style={{
                                fontSize: '0.65rem',
                                color: 'var(--accent)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                padding: 0,
                                fontFamily: 'var(--font-heading)'
                              }}
                            >
                              View details
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* AUDIT LOG TAB */}
          {activeTab === 'audit' && (
            <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.12 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--surface)', border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', padding: '1.25rem' }}>
                <SectionHeader icon={<ShieldCheck size={18} />} title="ADMIN ACTION AUDIT LOG" />
                {!analytics?.audit_logs || analytics.audit_logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    No audit logs recorded yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {analytics.audit_logs.map(log => (
                      <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.6rem 0.75rem', backgroundColor: 'var(--bg)', border: '2px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span className="font-heading" style={{ fontSize: '0.72rem', color: 'var(--accent)', textTransform: 'none' }}>@{log.username}</span>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{fmtDate(log.created_at)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>
                          <strong>Action: </strong> 
                          <span style={{ 
                            textTransform: 'uppercase', 
                            fontSize: '0.62rem', 
                            padding: '0.1rem 0.35rem', 
                            backgroundColor: log.action_type === 'hide' ? 'rgba(255,59,48,0.1)' : log.action_type === 'set_daily' ? 'rgba(255,149,0,0.1)' : 'rgba(52,199,89,0.1)', 
                            border: '1px solid var(--ink)',
                            fontWeight: 'bold',
                            color: log.action_type === 'hide' ? '#FF3B30' : log.action_type === 'set_daily' ? '#FF9500' : '#34C759'
                          }}>
                            {log.action_type}
                          </span>
                          {log.creation_id && (
                            <button
                              onClick={() => handleViewDetails(log.creation_id!)}
                              style={{
                                marginLeft: '0.6rem',
                                fontSize: '0.65rem',
                                color: 'var(--accent)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                fontFamily: 'var(--font-heading)'
                              }}
                            >
                              View creation details
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: '0.1rem' }}>
                          {log.details}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ─── Artwork Details Modal (Canvas Previewer) ────────────────────── */}
      <AnimatePresence>
        {selectedCreation && (() => {
          const c = selectedCreation;
          return (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: '1rem',
            }} onClick={() => setSelectedCreation(null)}>
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
                  padding: '1.5rem',
                  maxWidth: '480px',
                  width: '100%',
                  position: 'relative',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                {/* Close modal */}
                <button
                  onClick={() => setSelectedCreation(null)}
                  style={{
                    position: 'absolute',
                    top: '0.75rem',
                    right: '0.75rem',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink)'
                  }}
                >
                  <X size={20} />
                </button>

                <h3 className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)', paddingRight: '1.5rem' }}>
                  CREATION DETAILS
                </h3>

                {/* Canvas pixel drawing preview */}
                <div style={{ border: '3px solid var(--ink)', backgroundColor: '#000000', width: '100%', display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  <CanvasPreviewer gridData={c.grid_data} />
                </div>

                {/* Metadata List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '2px solid var(--border)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>ID</span>
                    <strong style={{ wordBreak: 'break-all' }}>{c.id}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>CREATOR</span>
                    <strong>{c.username || 'Anonymous Device'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>SOURCE MODE</span>
                    <strong style={{ textTransform: 'uppercase' }}>{c.source_mode}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>VIEWS</span>
                    <strong>{fmtNum(c.view_count || 0)} views</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>CREATED AT</span>
                    <strong>{fmtDate(c.created_at)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>STATUS</span>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      padding: '0.05rem 0.3rem', 
                      backgroundColor: c.is_hidden ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)', 
                      border: '1px solid var(--ink)',
                      fontWeight: 'bold',
                      color: c.is_hidden ? '#FF3B30' : '#34C759'
                    }}>
                      {c.is_hidden ? 'HIDDEN' : 'VISIBLE'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => {
                      handleToggleHide(c.id, !c.is_hidden);
                      setSelectedCreation(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.8rem',
                      backgroundColor: c.is_hidden ? '#34C759' : '#FF3B30',
                      color: '#FFFFFF',
                      border: '2px solid var(--ink)',
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 var(--ink)'
                    }}
                  >
                    {c.is_hidden ? 'RESTORE VISIBILITY' : 'HIDE CREATION'}
                  </button>
                  <button
                    onClick={() => setSelectedCreation(null)}
                    style={{
                      padding: '0.5rem 1rem',
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.8rem',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--ink)',
                      border: '2px solid var(--ink)',
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 var(--ink)'
                    }}
                  >
                    CLOSE
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// Separate Canvas Previewer sub-component to safely handle canvas mounting and ref lifecycles
const CanvasPreviewer: React.FC<{ gridData: any }> = ({ gridData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !gridData) return;
    const { cols, rows, colors } = gridData;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    try {
      const colorArray = typeof colors === 'string' ? decompressColors(colors) : colors;

      canvasRef.current.width = cols;
      canvasRef.current.height = rows;

      const imgData = ctx.createImageData(cols, rows);
      for (let i = 0; i < cols * rows; i++) {
        const r = Math.round((colorArray[i * 3] || 0) * 255);
        const g = Math.round((colorArray[i * 3 + 1] || 0) * 255);
        const b = Math.round((colorArray[i * 3 + 2] || 0) * 255);
        imgData.data[i * 4] = r;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (err) {
      console.error('Error drawing canvas preview:', err);
    }
  }, [gridData]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: 'auto',
        maxHeight: '260px',
        objectFit: 'contain',
        imageRendering: 'pixelated',
        display: 'block'
      }}
    />
  );
};
