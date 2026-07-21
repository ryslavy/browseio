'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const VideoPlayer = dynamic(() => import('../../components/VideoPlayer'), { ssr: false });

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlParam = searchParams?.get('url');
  const titleParam = searchParams?.get('title');
  const nameParam = searchParams?.get('name');
  
  const movieTitle = titleParam ? decodeURIComponent(titleParam) : (nameParam ? decodeURIComponent(nameParam) : '');

  const [error] = useState(!urlParam ? 'Nebyla poskytnuta žádná URL k přehrání.' : '');

  const openPotPlayer = async () => {
    if (!urlParam) return;
    try {
      window.location.href = `potplayer://${urlParam}`;
    } catch (e) {
      console.error('Error launching PotPlayer:', e);
      alert('Chyba při spouštění PotPlayeru. Nezapomeňte nainstalovat .reg soubor!');
    }
  };

  return (
    <div 
      className="fade-in" 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: '#000', 
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Floating Back Arrow Button */}
      <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 100, pointerEvents: 'auto' }}>
        <button 
          onClick={() => router.back()}
          className="btn btn-secondary" 
          style={{ 
            backgroundColor: 'rgba(0,0,0,0.6)', 
            backdropFilter: 'blur(12px)', 
            border: '1px solid rgba(255,255,255,0.2)', 
            color: '#fff',
            fontSize: '0.85rem',
            padding: '0.4rem 0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer'
          }}
        >
          ⬅ Zpět
        </button>
      </div>

      {/* Floating PotPlayer Button (Top Right) */}
      {urlParam && (
        <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 100, pointerEvents: 'auto' }}>
          <button 
            onClick={openPotPlayer}
            className="btn btn-secondary"
            style={{ 
              backgroundColor: 'rgba(99, 102, 241, 0.7)', // Indigo/PotPlayerish tone 
              backdropFilter: 'blur(12px)',
              color: '#fff', 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              fontWeight: 600, 
              fontSize: '0.85rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '20px'
            }}
          >
            🟣 Otevřít v PotPlayeru
          </button>
        </div>
      )}

      {/* Main Video Viewport */}
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>Chyba přehrávání</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
            <button onClick={() => router.back()} className="btn btn-primary">
              Návrat zpět
            </button>
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#000', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              padding: '1.5rem 1rem',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
              zIndex: 50,
              pointerEvents: 'none',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <h1 style={{ margin: 0, color: '#fff', fontSize: '1.4rem', fontWeight: 500, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {movieTitle}
              </h1>
            </div>

            <div style={{ width: '100%', height: '100%' }}>
              <VideoPlayer 
                options={{
                  autoplay: true,
                  controls: true,
                  responsive: true,
                  fluid: true,
                  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                  sources: [
                    {
                      src: `/api/proxy?url=${encodeURIComponent(urlParam!)}`,
                      type: 'video/mp4'
                    }
                  ]
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>}>
      <PlayerContent />
    </Suspense>
  );
}
