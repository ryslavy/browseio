'use client';

import React from 'react';
import type { SortMode } from '@/lib/catalog-sorter';

interface SortDropdownProps {
  currentSort: SortMode;
  onSortChange: (sortMode: SortMode) => void;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'popularity', label: 'Nejoblíbenější' },
  { value: 'rating_desc', label: 'Nejlépe hodnocené (od nejvyššího)' },
  { value: 'rating_asc', label: 'Nejhůře hodnocené (od nejnižšího)' },
  { value: 'release_desc', label: 'Nejnovější (podle roku)' },
  { value: 'release_asc', label: 'Nejstarší (podle roku)' },
  { value: 'title_asc', label: 'Název (A - Z)' },
  { value: 'title_desc', label: 'Název (Z - A)' },
];

export function SortDropdown({ currentSort, onSortChange }: SortDropdownProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <label htmlFor="sort-select" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        Řadit dle:
      </label>
      <select
        id="sort-select"
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value as SortMode)}
        className="input"
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          fontSize: '0.9rem',
          cursor: 'pointer',
          width: 'auto',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary, #fff)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ backgroundColor: '#1a1d24', color: '#fff' }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
