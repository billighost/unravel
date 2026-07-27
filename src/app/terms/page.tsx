'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';

export default function TermsPage() {
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
            TERMS OF SERVICE
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Welcome to Unravel. By accessing or using our application, you agree to comply with and be bound by the following terms.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            1. CONTENT POLICY
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Users are solely responsible for the patterns and text they publish on Unravel. You agree not to upload, draw, or publish content that is illegal, abusive, harmful, or promotes violence or harassment.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            2. MODERATION & DELETION
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            To protect our community, user creations that are reported 3 or more times by other players are automatically hidden from the public gallery. We reserve the right to remove any creation or account at our discretion without prior notice.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            3. ACCOUNT RESPONSIBILITY
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            If you create an optional account with a username and PIN, you are entirely responsible for maintaining the confidentiality of your PIN. Account credentials cannot be recovered or reset if lost, as credentials are encrypted and we do not collect email addresses or contact details.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            4. DISCLAIMER
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', fontStyle: 'italic' }}>
            Unravel is provided "as is" without warranties of any kind. This policy has not been reviewed by legal counsel and is intended solely for community guidelines. Use at your own risk.
          </p>
        </div>

      </div>
    </div>
  );
}
