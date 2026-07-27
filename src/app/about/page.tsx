'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';

export default function AboutPage() {
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
            ABOUT UNRAVEL
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Unravel is a responsive 3D WebGL physics toy and interactive art workspace. It bridges tactile physics simulations with digital creativity.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            HOW IT WORKS
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Choose a mode to generate or draw a high-fidelity image:
          </p>
          <ul style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><strong>Photo Mode</strong>: Drag and drop or upload any image to turn it into a 3D grid of vibrant physical cubes.</li>
            <li><strong>Draw Mode</strong>: Draw vector artwork directly onto the grid with custom brush sizes and color pickers.</li>
            <li><strong>Type Mode</strong>: Render text cleanly using anti-aliased font options tailored specifically to grid alignments.</li>
          </ul>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            THE TOY ENGINE
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Once your grid is ready, click or swipe over the cubes to trigger a real-time 3D spring-physics simulation. Watch the cubes bounce, wobble, and scatter, and then double-tap or shake to instantly snap them back to their clean grid arrangement.
          </p>

          <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)', margin: '1rem 0 0 0' }}>
            OFFLINE PLAYABLE
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Built as a Progressive Web App (PWA) with complete offline support. Play from anywhere, and export your wobbling physics interactions directly as shareable WebM and MP4 animations!
          </p>
        </div>

      </div>
    </div>
  );
}
