import React from 'react';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#F7F6F2',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '4px solid #1A1A1A',
          boxShadow: '8px 8px 0 #1A1A1A',
          padding: '2.5rem',
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontWeight: 900,
            fontSize: '1.5rem',
            letterSpacing: '0.15em',
            color: '#1A1A1A',
            borderBottom: '3px solid #1A1A1A',
            paddingBottom: '0.5rem',
            width: '100%',
          }}
        >
          UNRAVEL
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1
            style={{
              fontFamily: 'sans-serif',
              fontWeight: 800,
              fontSize: '1.25rem',
              color: '#1A1A1A',
              margin: 0,
            }}
          >
            YOU'RE OFFLINE
          </h1>
          <p
            style={{
              fontFamily: 'sans-serif',
              fontSize: '0.9rem',
              color: '#666666',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Reconnect to the internet to load new routes. Previously cached creations, Draw Mode, and Type Mode remain available offline.
          </p>
        </div>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            backgroundColor: '#FF3B30',
            color: '#FFFFFF',
            fontFamily: 'sans-serif',
            fontWeight: 700,
            fontSize: '0.95rem',
            padding: '0.85rem 1.75rem',
            border: '3px solid #1A1A1A',
            boxShadow: '4px 4px 0 #1A1A1A',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          RETURN HOME
        </Link>
      </div>
    </main>
  );
}
