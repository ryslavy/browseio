'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { MetaItem } from '@/lib/cinemeta';

interface MovieCardProps {
  movie: MetaItem;
  defaultType?: string;
}

export function MovieCard({ movie, defaultType = 'movie' }: MovieCardProps) {
  const mediaType = movie.type || defaultType || 'movie';
  const rating = movie.imdbRating ? movie.imdbRating : undefined;
  const year = movie.releaseInfo ? movie.releaseInfo : 'N/A';
  const [imgError, setImgError] = useState(false);

  const altText = movie.name ? `${movie.name} (${year}) - Plakát` : 'Plakát titulu';

  return (
    <Link href={`/?type=${mediaType}&id=${movie.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        className="glass-panel"
        style={{
          overflow: 'hidden',
          transition: 'transform 0.3s, box-shadow 0.3s',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(30, 35, 45, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '2/3', width: '100%', backgroundColor: '#2a2d36', overflow: 'hidden' }}>
          {movie.poster && !imgError ? (
            <img
              src={movie.poster}
              alt={altText}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Bez obrázku
            </div>
          )}
          {rating && (
            <span
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: '#fbbf24',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              ⭐ {rating}
            </span>
          )}
        </div>
        <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h3
            style={{
              fontSize: '1rem',
              marginBottom: '0.35rem',
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 600,
            }}
            title={movie.name}
          >
            {movie.name}
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>{year}</span>
            <span style={{ textTransform: 'capitalize' }}>{mediaType === 'series' ? 'Seriál' : 'Film'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
