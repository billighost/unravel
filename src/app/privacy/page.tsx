'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';

export default function PrivacyPage() {
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
            PRIVACY POLICY
          </h1>
          
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <strong>Effective Date: July 30, 2026</strong>
          </p>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            At Unravel, we are committed to protecting your privacy. This Privacy Policy details how we collect, store, encrypt, and handle data when you use the Unravel interactive 3D generative pixel canvas and WebGL physics simulation.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            1. COLLECTION AND PROCESSING OF DATA
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel is designed to minimize the collection of Personally Identifiable Information (PII). We do not require or collect your real name, email address, physical address, or phone number.
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li><strong>Device Identifiers:</strong> We generate a unique cryptographic UUID client-side and store it in your browser storage. This device ID is transmitted as an HTTP header (<code>x-device-id</code>) to validate user sessions, process daily challenge streaks, and secure access to your creations.</li>
            <li><strong>User-Generated Artwork:</strong> When you save a creation, share an artwork link, or submit to the public gallery, the grid coordinates, pixel colors, and scrambled positioning states are stored in our secure database.</li>
            <li><strong>Optional Account Credentials:</strong> If you choose to sync your creations across devices, you must register a custom username and a 6-digit PIN. We store only this username and the bcrypt-hashed value of your PIN.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            2. STORAGE MECHANISMS AND PWAS
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel operates as a Progressive Web App (PWA) with fully offline capabilities. To provide these features:
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li><strong>IndexedDB Storage:</strong> We use local IndexedDB stores (<code>UnravelStorageDB</code>) on your local device to automatically preserve drafts and save recent creations. This data is stored entirely client-side.</li>
            <li><strong>Service Worker Cache:</strong> Service workers cache site static resources and fonts locally to guarantee load speeds and off-network usability.</li>
            <li><strong>No Tracking Cookies:</strong> We do not deploy advertising, tracking, or marketing cookies.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            3. THIRD-PARTY INFRASTRUCTURE
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            To deliver reliable hosting and asset generation, we share specific visual elements with trusted infrastructure partners:
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.25rem' }}>
            <li><strong>Cloudinary:</strong> Low-resolution thumbnail previews generated from your grid canvas are uploaded directly to Cloudinary for optimized delivery when sharing links on social media platforms.</li>
            <li><strong>Neon DB:</strong> Our server-side analytics, session states, and creation logs are stored on Neon serverless databases.</li>
            <li><strong>Upstash:</strong> Redis cache is used to manage API request rate-limits to defend against Denial of Service (DoS) attacks.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            4. CREDENTIAL SECURITY AND RECOVERY LIMITS
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', backgroundColor: 'rgba(255, 59, 48, 0.04)', padding: '0.75rem', borderLeft: '4px solid var(--accent)' }}>
            <strong>CRITICAL NOTICE:</strong> PIN credentials are encrypted one-way using <code>bcryptjs</code> on our server backend. Because we do not collect email addresses, <strong>we cannot recover or reset forgotten PINs</strong>. If you lose your PIN, you will lose access to your online account permanently.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            5. CHILDREN'S ONLINE PRIVACY
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel complies with the Children's Online Privacy Protection Act (COPPA). We do not knowingly collect personal identifiers or contact details from children under 13.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.25rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            6. YOUR RIGHTS: EXPORT AND DELETION
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            You can delete all local creations by clearing your browser site data or choosing "Start Fresh." To request deletion of synced creations associated with your device identifier or registered account, please reach out to admin moderation.
          </p>
        </div>

      </div>
    </div>
  );
}
