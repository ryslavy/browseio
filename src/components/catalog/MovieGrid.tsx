'use client';

import React from 'react';
import type { MetaItem } from '@/lib/cinemeta';
import { MovieCard } from './MovieCard';

interface MovieGridProps {
  movies: MetaItem[];
  defaultType: string;
  loading?: boolean;
  emptyMessage?: string;
}

export function MovieGrid({ movies, defaultType, loading = false, emptyMessage }: MovieGridProps) {
  if (loading && movies.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '1rem',
          margin: '2rem 0',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          {emptyMessage || 'Nenalezeny žádné tituly pro zvolené filtry.'}
        </p>
        <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)' }}>
          Zkuste změnit žánr, vyhledávací dotaz nebo řazení.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} defaultType={defaultType} />
      ))}
    </div>
  );
}
