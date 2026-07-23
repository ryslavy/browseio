'use client';

import React, { useState, useEffect } from 'react';
import type { SortMode } from '@/lib/catalog-sorter';
import { t, i18nEventTarget } from '@/lib/i18n';

interface SortDropdownProps {
  currentSort: SortMode;
  onSortChange: (sortMode: SortMode) => void;
}

export function SortDropdown({ currentSort, onSortChange }: SortDropdownProps) {
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

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'popularity', label: t('sort.popularity') },
    { value: 'rating_desc', label: t('sort.rating_desc') },
    { value: 'release_desc', label: t('sort.year_desc') },
    { value: 'release_asc', label: t('sort.year_asc') },
    { value: 'title_asc', label: t('sort.name_asc') },
    { value: 'title_desc', label: t('sort.name_desc') },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <label htmlFor="sort-select" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {t('streams.sort_label')}
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
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ backgroundColor: '#1a1d24', color: '#fff' }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
