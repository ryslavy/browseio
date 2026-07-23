'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { t, i18nEventTarget } from '@/lib/i18n';

export default function LandingPage() {
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
    <div className="fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem 1rem 4rem 1rem' }}>
      {/* HERO SECTION */}
      <section style={{ textAlign: 'center', padding: '4rem 1.5rem 3rem 1.5rem', position: 'relative' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '0.4rem 1rem', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1.75rem' }}>
          ✨ Antigravity Streaming Experience • BrowseIO v2.0
        </div>

        <h1
          style={{
            fontSize: '3.6rem',
            marginBottom: '1.25rem',
            background: 'linear-gradient(135deg, #ffffff 0%, #93c5fd 40%, #c084fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.15,
          }}
        >
          Objevujte a streamujte v moderním rozhraní
        </h1>

        <p style={{ maxWidth: '720px', margin: '0 auto 2.5rem auto', color: 'var(--text-secondary)', fontSize: '1.15rem', lineHeight: 1.75 }}>
          BrowseIO propojují vaše oblíbené Stremio addony, Nuvio pluginy a TorBox Debrid akceleraci do jednoho bleskového rozhraní bez reklam.
        </p>

        {/* CTA BUTTONS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
          <Link
            href="/?view=catalog&type=movie"
            className="btn btn-primary"
            style={{
              padding: '0.9rem 2.2rem',
              fontSize: '1.1rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              boxShadow: '0 12px 32px rgba(59, 130, 246, 0.4)'
            }}
          >
            🎬 Procházet Filmy
          </Link>

          <Link
            href="/?view=catalog&type=series"
            className="btn btn-secondary"
            style={{
              padding: '0.9rem 2.2rem',
              fontSize: '1.1rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            📺 Procházet Seriály
          </Link>
        </div>

        {/* FEATURE PILLS BADGES */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="glass-pill" style={{ padding: '0.4rem 0.9rem', fontSize: '0.825rem', fontWeight: 600 }}>
            🧩 Podpora Stremio & Nuvio doplňků
          </span>
          <span className="glass-pill" style={{ padding: '0.4rem 0.9rem', fontSize: '0.825rem', fontWeight: 600, borderColor: 'rgba(234, 179, 8, 0.3)', color: '#fbbf24' }}>
            ⚡ TorBox Debrid Akcelerace
          </span>
          <span className="glass-pill" style={{ padding: '0.4rem 0.9rem', fontSize: '0.825rem', fontWeight: 600 }}>
            🍿 PotPlayer, VLC, MPV & Web Player
          </span>
          <span className="glass-pill" style={{ padding: '0.4rem 0.9rem', fontSize: '0.825rem', fontWeight: 600 }}>
            🌐 Česky & English
          </span>
        </div>
      </section>

      {/* FEATURE CARDS GRID */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        {/* CARD 1 */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1.25rem' }}>
            🧩
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.6rem', color: '#fff' }}>
            Multi-Plugin Engine
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            Připojte jakýkoliv Stremio Addon (Torrentio, Cinemeta) i spouštěcí Nuvio JS skripty (4KHDHub, HellSpy, SkTorrent) a prohledávejte všechny zdroje současně.
          </p>
        </div>

        {/* CARD 2 */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1.25rem' }}>
            ⚡
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.6rem', color: '#fff' }}>
            Debrid & TorBox Kešování
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            Automatická detekce cachenutých torrentů. Kliknutím na tlačítko ⚡ přidejte jakýkoliv torrent okamžitě na váš TorBox účet pro přehrání bez čekání.
          </p>
        </div>

        {/* CARD 3 */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1.25rem' }}>
            🍿
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.6rem', color: '#fff' }}>
            Váš Oblíbený Přehrávač
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            Přehrávejte přímo v prohlížeči nebo otevírejte videa jedním kliknutím v desktopovém prehravaci PotPlayer, VLC, MPV nebo Infuse.
          </p>
        </div>
      </section>

      {/* QUICK FOOTER CTA */}
      <section style={{ textAlign: 'center', marginTop: '4rem', padding: '2.5rem 2rem', borderRadius: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fff' }}>
          Připraveni začít?
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1rem' }}>
          Otevřete katalog a objevujte nejnovější a nejpopulárnější tituly.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/?view=catalog&type=movie" className="btn btn-primary" style={{ padding: '0.75rem 1.75rem', borderRadius: '9999px' }}>
            🚀 Otevřít Katalog
          </Link>
          <Link href="/settings" className="btn btn-secondary" style={{ padding: '0.75rem 1.75rem', borderRadius: '9999px' }}>
            ⚙️ Nastavení Doplňků
          </Link>
        </div>
      </section>
    </div>
  );
}
