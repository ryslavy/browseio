'use client';

import React, { useState } from 'react';

interface FilterBarProps {
  currentGenre: string;
  genres: string[];
  searchQuery: string;
  onGenreChange: (genre: string) => void;
  onSearchSubmit: (query: string) => void;
  type: 'movie' | 'series';
}

export function FilterBar({
  currentGenre,
  genres,
  searchQuery,
  onGenreChange,
  onSearchSubmit,
  type,
}: FilterBarProps) {
  const [inputVal, setInputVal] = useState(searchQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);

  if (prevSearchQuery !== searchQuery) {
    setPrevSearchQuery(searchQuery);
    setInputVal(searchQuery);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(inputVal.trim());
  };

  const handleClearSearch = () => {
    setInputVal('');
    onSearchSubmit('');
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto 2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
          <input
            type="text"
            className="input"
            placeholder={`Hledat ${type === 'movie' ? 'film' : 'seriál'}...`}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            style={{ padding: '1rem 1.5rem', fontSize: '1.1rem', borderRadius: '2rem', flex: 1 }}
          />
          {inputVal && (
            <button
              type="button"
              onClick={handleClearSearch}
              style={{
                position: 'absolute',
                right: '7.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '0.2rem 0.5rem',
              }}
              title="Vymazat hledání"
            >
              ✕
            </button>
          )}
          <button type="submit" className="btn btn-primary" style={{ borderRadius: '2rem', padding: '0 2rem' }}>
            Hledat
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
                {g === 'top' ? 'Populární' : g}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
