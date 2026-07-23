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
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <h1
        style={{
          fontSize: '3rem',
          marginBottom: '1.5rem',
          background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 800,
        }}
      >
        {t('catalog.title')}
      </h1>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${type === 'movie' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('movie')}
          style={{ minWidth: '120px' }}
        >
          🎬 {t('catalog.movies')}
        </button>
        <button
          type="button"
          className={`btn ${type === 'series' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('series')}
          style={{ minWidth: '120px' }}
        >
          📺 {t('catalog.series')}
        </button>
      </div>
    </div>
  );
}
