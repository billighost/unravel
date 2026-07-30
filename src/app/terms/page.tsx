'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ maxWidth: '700px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
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
            padding: '2.5rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          <h1 className="font-heading" style={{ fontSize: '2rem', color: 'var(--ink)', borderBottom: '4px solid var(--ink)', paddingBottom: '0.5rem', margin: 0 }}>
            TERMS OF SERVICE
          </h1>
          
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <strong>Effective Date: July 30, 2026</strong>
          </p>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Welcome to Unravel (unravel.app). By accessing or using our interactive 3D WebGL pixel canvas, games, galleries, and services, you agree to comply with and be bound by the following Terms of Service. If you do not agree to these terms, please do not use the application.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            1. SCOPE OF SERVICES
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel provides an interactive physical block simulator allowing users to generate, render, customize, and share 3D grids of physical pixel blocks. The platform is offered free of charge for recreational, educational, and creative purposes.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            2. USER REGISTRATION AND ACCOUNT SECURITY
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            You may register a user profile using a custom username and a 6-digit numeric PIN.
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li>You are solely responsible for maintaining the confidentiality of your PIN.</li>
            <li>You agree to accept responsibility for all activity occurring under your username.</li>
            <li>Since we do not verify identity via email or collect recovery contact info, <strong>we cannot recover or reset lost account credentials</strong>.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            3. USER-GENERATED CONTENT LICENSE
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            You retain full ownership and copyright of any original drawings, photos, or text patterns you publish or upload on Unravel.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            By submitting, posting, or sharing creations on or through the service (e.g. publishing to the public community gallery), you grant Unravel a non-exclusive, worldwide, royalty-free, perpetual, and transferable license to host, cache, store, format, publicly display, distribute, and reproduce your content for the operations of the application.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            4. PROHIBITED CONDUCT AND USER RESPONSIBILITY
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            You represent and warrant that your creations will not violate any guidelines. You agree not to upload, draw, render, or distribute content that:
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li>Is illegal, harmful, abusive, harassing, defamatory, or threatening.</li>
            <li>Contains explicit sexual content, nudity, or graphic violence.</li>
            <li>Infringes on the intellectual property, copyright, or trademark rights of any third party.</li>
            <li>Contains malicious script code, viruses, or disrupts application performance.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            5. COMMUNITY REPORTING AND AUTOMATED MODERATION
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            To enforce community standards, Unravel utilizes an automated flag threshold:
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li>Any user-generated creation that is reported <strong>three (3) or more times</strong> by other users will be automatically hidden from the public feeds immediately.</li>
            <li>We reserve the right to review, edit, moderate, delete, or ban any creation or account at our sole discretion, without prior notice.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            6. DISCLAIMERS & LIMITATIONS OF LIABILITY
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            UNRAVEL IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR FREE FROM DATA CORRUPTION, OR LOSS OF DRAFTS/STREAKS.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            IN NO EVENT SHALL UNRAVEL, ITS CREATORS, OR CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE SIMULATION ENGINE.
          </p>
        </div>

      </div>
    </div>
  );
}
