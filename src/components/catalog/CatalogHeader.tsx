'use client';

import React from 'react';

interface CatalogHeaderProps {
  type: 'movie' | 'series';
  onTypeChange: (type: 'movie' | 'series') => void;
  title?: string;
  subtitle?: string;
}

export function CatalogHeader({
  type,
  onTypeChange,
  title = 'Objevujte a streamujte',
  subtitle = 'Hledejte filmy a seriály a přehrávejte je okamžitě díky propojení s webtor a komunitními zdroji.',
}: CatalogHeaderProps) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <h1
        style={{
          fontSize: '3rem',
          marginBottom: '1rem',
          background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 800,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 2rem', color: 'var(--text-secondary)' }}>
        {subtitle}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${type === 'movie' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('movie')}
          style={{ minWidth: '120px' }}
        >
          Filmy
        </button>
        <button
          type="button"
          className={`btn ${type === 'series' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onTypeChange('series')}
          style={{ minWidth: '120px' }}
        >
          Seriály
        </button>
      </div>
    </div>
  );
}
