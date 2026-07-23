'use client';

import React, { useState, useEffect } from 'react';
import { t, i18nEventTarget } from '@/lib/i18n';

interface FilterBarProps {
  currentGenre: string;
  genres: string[];
  searchQuery: string;
  onGenreChange: (genre: string) => void;
  onSearchSubmit: (query: string) => void;
  type: 'movie' | 'series';
  loading?: boolean;
}

export function FilterBar({
  currentGenre,
  genres,
  searchQuery,
  onGenreChange,
  onSearchSubmit,
  type,
  loading = false,
}: FilterBarProps) {
  const [inputVal, setInputVal] = useState(searchQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
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

  if (prevSearchQuery !== searchQuery) {
    setPrevSearchQuery(searchQuery);
    setInputVal(searchQuery);
  }

  // Live debounced search effect (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = inputVal.trim();
      if (trimmed !== searchQuery) {
        onSearchSubmit(trimmed);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [inputVal, searchQuery, onSearchSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(inputVal.trim());
  };

  const handleClearSearch = () => {
    setInputVal('');
    onSearchSubmit('');
  };

  const isSearching = loading && Boolean(searchQuery);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto 2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              className="input"
              placeholder={t('catalog.search_placeholder')}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              style={{ padding: '1rem 3.5rem 1rem 1.5rem', fontSize: '1.1rem', borderRadius: '2rem', width: '100%' }}
            />
            {isSearching ? (
              <div 
                style={{
                  position: 'absolute',
                  right: '1.4rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
              </div>
            ) : inputVal && (
              <button
                type="button"
                onClick={handleClearSearch}
                style={{
                  position: 'absolute',
                  right: '1.4rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  lineHeight: 1,
                  padding: 0,
                  transition: 'background 0.2s ease',
                }}
                title={t('catalog.clear_search')}
              >
                ✕
              </button>
            )}
          </div>
          <button 
            type="submit" 
            disabled={isSearching}
            className="btn btn-primary" 
            style={{ borderRadius: '2rem', padding: '0 2rem', opacity: isSearching ? 0.8 : 1, minWidth: '120px' }}
          >
            {isSearching ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></div>
                {t('catalog.searching')}...
              </span>
            ) : (
              '🔍'
            )}
          </button>
        </form>
      </div>

      {!searchQuery && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: '1rem',
          }}
        >
          {genres.map((g) => {
            const isActive = currentGenre === g;
            const genreLabel = t(`genre.${g}`);
            return (
              <button
                key={g}
                type="button"
                onClick={() => onGenreChange(g)}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '2rem',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--accent-color, #3b82f6)' : 'var(--bg-secondary)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s',
                }}
              >
                {genreLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
