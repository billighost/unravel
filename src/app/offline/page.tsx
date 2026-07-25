import React from 'react';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '4px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--ink)',
          padding: '2rem 1.25rem',
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'min(1.4rem, 6vw)',
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            borderBottom: '3px solid var(--ink)',
            paddingBottom: '0.5rem',
            width: '100%',
          }}
        >
          UNRAVEL
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1
            className="font-heading"
            style={{
              fontSize: 'min(1.1rem, 5vw)',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            YOU'RE OFFLINE
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
          >
            You're offline right now. Your saved creations, drawing, and typing modes still work without internet.
          </p>
        </div>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--accent)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-heading)',
            fontSize: '0.85rem',
            padding: '0.75rem 1.5rem',
            border: '3px solid var(--ink)',
            boxShadow: '3px 3px 0 var(--ink)',
            textDecoration: 'none',
            cursor: 'pointer',
            width: '100%',
            maxWidth: '200px',
          }}
        >
          RETURN HOME
        </Link>
      </div>
    </main>
  );
}
