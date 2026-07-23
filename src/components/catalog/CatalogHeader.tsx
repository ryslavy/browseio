'use client';

import React, { useState, useEffect } from 'react';
import { t, i18nEventTarget } from '@/lib/i18n';

interface CatalogHeaderProps {
  type: 'movie' | 'series';
  onTypeChange: (type: 'movie' | 'series') => void;
}

export function CatalogHeader({
  type,
  onTypeChange,
}: CatalogHeaderProps) {
  const [, setLangTick] = useState(0);

  useEffect(() => {
    const handleLangChange = () => setLangTick(t => t + 1);
    if (i18nEventTarget) {
      i18nEventTarget.addEventListener('languageChange', handleLangChange);
    }
    return () => {
      if (i18nEventTarget) {
        i18nEventTarget.removeEventListener('languageChange', handleLangChange);
      }
    };
  }, []);

  return (
    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
      {/* Landing Page Hero Title */}
      <h1
        style={{
          fontSize: '3.2rem',
          marginBottom: '0.75rem',
          background: 'linear-gradient(135deg, #60a5fa 0%, #a855f7 50%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1.15
        }}
      >
        Browse<span style={{ WebkitTextFillColor: '#3b82f6' }}>IO</span>
      </h1>

      <p style={{ maxWidth: '640px', margin: '0 auto 1.5rem auto', color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.6 }}>
        Objevujte a streamujte tisíce filmů a seriálů s okamžitým propojením na Stremio Addony, Nuvio pluginy a TorBox Debrid akceleraci.
      </p>

      {/* Feature Badges */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
          🧩 Stremio & Nuvio Addony
        </span>
        <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
          ⚡ TorBox Instant Debrid
        </span>
        <span style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
          🍿 PotPlayer & Web Player
        </span>
      </div>

      {/* Main Category Switcher Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${type === 'movie' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('movie')}
          style={{ minWidth: '140px', padding: '0.7rem 1.5rem', fontSize: '1rem' }}
        >
          🎬 {t('catalog.movies')}
        </button>
        <button
          type="button"
          className={`btn ${type === 'series' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('series')}
          style={{ minWidth: '140px', padding: '0.7rem 1.5rem', fontSize: '1rem' }}
        >
          📺 {t('catalog.series')}
        </button>
      </div>
    </div>
  );
}
