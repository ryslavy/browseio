'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { t, getCurrentLanguage, setCurrentLanguage, getAvailableLanguages, i18nEventTarget } from '@/lib/i18n';

export default function Navbar() {
  const [lang, setLang] = useState('cs');

  useEffect(() => {
    setLang(getCurrentLanguage());
    const handleLangChange = () => setLang(getCurrentLanguage());

    if (i18nEventTarget) {
      i18nEventTarget.addEventListener('languageChange', handleLangChange);
    }
    return () => {
      if (i18nEventTarget) {
        i18nEventTarget.removeEventListener('languageChange', handleLangChange);
      }
    };
  }, []);

  const toggleLanguage = () => {
    const nextLang = lang === 'cs' ? 'en' : 'cs';
    setCurrentLanguage(nextLang);
  };

  const availableLangs = getAvailableLanguages();
  const currentLangObj = availableLangs.find(l => l.code === lang) || availableLangs[0];

  return (
    <header 
      className="glass-navbar" 
      style={{ 
        margin: '1rem', 
        padding: '0.875rem 1.75rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        position: 'sticky', 
        top: '1rem', 
        zIndex: 100 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link href="/" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ color: 'var(--accent-color)', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Browse</span>IO
        </Link>

        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/" style={{ color: 'var(--text-secondary)', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>
            {t('nav.home')}
          </Link>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Language Switcher Toggle */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="btn glass-pill"
          style={{
            fontSize: '0.85rem',
            padding: '0.4rem 0.8rem',
            borderRadius: '9999px',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff'
          }}
          title="Přepnout jazyk / Switch Language"
        >
          <span>{currentLangObj.flag}</span>
          <span>{currentLangObj.code.toUpperCase()}</span>
        </button>

        <Link href="/settings" className="btn btn-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
          {t('nav.settings')} ⚙️
        </Link>
      </div>
    </header>
  );
}
