'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" aria-label="Go Home" style={{ textDecoration: 'none' }}>
            <Wordmark size="sm" />
          </Link>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <ArrowLeft size={14} /> BACK TO GAME
            </Button>
          </Link>
        </div>

        {/* Panel */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <h1 className="font-heading" style={{ fontSize: '1.8rem', color: 'var(--ink)', borderBottom: '4px solid var(--ink)', paddingBottom: '0.5rem', margin: 0 }}>
            PRIVACY POLICY
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Your privacy matters. Learn how Unravel manages your local device data and account records.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            1. DATA STORAGE & SYNCING
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel stores game progression, daily streaks, and custom artwork. By default, this data is kept locally on your browser. If you opt to register a username and PIN account, your creation list and streak milestones are synced to our cloud database.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            2. CREDENTIAL ENCRYPTION
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Accounts do not collect emails, real names, or phone numbers. PINs are securely hashed on our servers using <code>bcryptjs</code> before storage. Since we have no contact info, lost accounts or forgotten PINs are permanently unrecoverable.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            3. COOKIES & TRACKING
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            We do not run third-party advertising tracking scripts or cookies. Local storage and service worker caching are utilized strictly to ensure full offline playability and smooth application loading.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            4. DISCLAIMER
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', fontStyle: 'italic' }}>
            This privacy policy has not been reviewed by legal counsel and is provided solely for informational transparency. Use at your own risk.
          </p>
        </div>

      </div>
    </div>
  );
}
