'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getMetaDetails, MetaItem, Episode } from '@/lib/cinemeta';
import { getTorrentioSources } from '@/lib/torrentio';

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false });
import { getStreams as getHellspyStreams } from '@/lib/hellspy-scraper';

interface MediaSource {
  name?: string;
  title?: string;
  infoHash?: string;
  magnet?: string;
  url?: string | null;
  size?: string;
  seeders?: number;
  seeds?: number;
  isTorBoxCached?: boolean;
}

export default function MovieDetails() {
  const params = useParams();
  const router = useRouter();
  const { type, id } = params;

  const [meta, setMeta] = useState<MetaItem | null>(null);
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingStreams, setFetchingStreams] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // all, Torrentio, SKTOnline, SKTorrent, Hellspy
  const [posterError, setPosterError] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState<string>('');

  // For series
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [episodesList, setEpisodesList] = useState<Episode[]>([]);

  useEffect(() => {
    async function loadMeta() {
      setLoading(true);
      const metaData = await getMetaDetails(type as string, id as string);
      setMeta(metaData);
      
      if (type === 'series' && metaData?.videos && metaData.videos.length > 0) {
        // Exclude Season 0 (Specials) because they rarely have streams and confuse the user
        const validVideos = metaData.videos.filter(v => v.season > 0);
        setEpisodesList(validVideos);
        
        // Prefer Season 1 if it exists, otherwise use the first available
        const s1Eps = validVideos.filter(v => v.season === 1).sort((a, b) => a.episode - b.episode);
        if (s1Eps.length > 0) {
          setSelectedSeason(1);
          setSelectedEpisode(s1Eps[0].episode);
        } else if (validVideos.length > 0) {
          setSelectedSeason(validVideos[0].season);
          setSelectedEpisode(validVideos[0].episode);
        }
      }
      setLoading(false);
    }
    loadMeta();
  }, [type, id]);

  const activeFetchIdRef = useRef(0);

  const fetchStreams = useCallback(async (fetchId: number) => {
    setFetchingStreams(true);
    setSources([]);

    const streamId = type === 'series' ? `${id}:${selectedSeason}:${selectedEpisode}` : (id as string);
    
    // Fetch all in parallel using Promise.allSettled
    const [torrentsRes, hRes, cRes] = await Promise.allSettled([
      getTorrentioSources(type as string, streamId),
      getHellspyStreams(id as string, type as string, selectedSeason, selectedEpisode).then(streams => ({ streams })).catch(e => { console.warn('Hellspy client-side error', e); return { streams: [] }; }),
      (() => {
        const uid = localStorage.getItem('sktorrent_uid');
        const pass = localStorage.getItem('sktorrent_pass');
        if (uid && pass) {
          return fetch('/api/sktorrent-classic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, type, season: selectedSeason, episode: selectedEpisode, uid, pass })
          }).then(r => r.json());
        }
        return Promise.resolve({ streams: [] });
      })()
    ]);

    const torrents: MediaSource[] = torrentsRes.status === 'fulfilled' ? torrentsRes.value : [];
    const hellspyStreams: MediaSource[] = hRes.status === 'fulfilled' && hRes.value.streams ? hRes.value.streams : [];
    const skClassicStreams: MediaSource[] = cRes.status === 'fulfilled' && cRes.value.streams ? cRes.value.streams : [];

    let mergedSources = [...torrents, ...hellspyStreams, ...skClassicStreams];

    // TorBox Debrid Cache Check
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    const hashesToCheck: string[] = [];
    mergedSources.forEach(s => {
      const hash = s.infoHash || (s.magnet ? new URLSearchParams(s.magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
      if (hash) hashesToCheck.push(hash);
    });

    if (hashesToCheck.length > 0) {
      try {
        const tbRes = await fetch('/api/torbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', hashes: hashesToCheck, apiKey: torboxApiKey })
        });
        const tbData = await tbRes.json();
        if (tbData.cached && Array.isArray(tbData.cached)) {
          const cachedSet = new Set(tbData.cached.map((h: string) => h.toLowerCase()));
          mergedSources = mergedSources.map(s => {
            const hash = s.infoHash || (s.magnet ? new URLSearchParams(s.magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
            if (hash && cachedSet.has(hash.toLowerCase())) {
              return { ...s, isTorBoxCached: true };
            }
            return s;
          });
        }
      } catch (e) {
        console.error('TorBox cache check failed:', e);
      }
    }

    // Only update state if this is still the active fetch!
    if (activeFetchIdRef.current === fetchId) {
      setSources(mergedSources);
      setFetchingStreams(false);
    }
  }, [type, id, selectedSeason, selectedEpisode]);

  useEffect(() => {
    if (!meta) return;
    if (type === 'series' && (!selectedSeason || !selectedEpisode)) return;
    
    const fetchId = Date.now();
    activeFetchIdRef.current = fetchId;
    const timeout = setTimeout(() => {
      fetchStreams(fetchId);
    }, 0);
    return () => clearTimeout(timeout);
  }, [meta, selectedSeason, selectedEpisode, type, id, fetchStreams]);

  const handlePlay = async (source: MediaSource, mode: 'debrid' | 'direct' | 'potplayer' = 'direct') => {
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    const playerPref = localStorage.getItem('player_preference') || 'web';
    const { infoHash, magnet, url, isTorBoxCached } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const seeders = source.seeders || source.seeds || 0;
    const sourceName = source.name || 'P2P Stream';

    const displayTitle = meta?.name ? `${meta.name}${meta.releaseInfo ? ` (${meta.releaseInfo})` : ''}` : sourceName;
    const imdbId = meta?.id && meta.id.startsWith('tt') ? meta.id : (id && String(id).startsWith('tt') ? String(id) : '');
    const posterUrl = meta?.poster || '';

    const baseParams = `seeders=${seeders}&name=${encodeURIComponent(sourceName)}&title=${encodeURIComponent(displayTitle)}&imdbId=${imdbId}&poster=${encodeURIComponent(posterUrl)}`;

    const playInPotPlayer = async (streamUrl: string) => {
      try {
        window.location.href = `potplayer://${streamUrl}`;
      } catch (e) {
        console.error('Error launching PotPlayer:', e);
        alert('Chyba při spouštění PotPlayeru. Nezapomeňte si stáhnout a nainstalovat .reg soubor!');
      }
    };

    // Mode: Debrid — resolve via TorBox and open in PotPlayer
    if (mode === 'debrid' && isTorBoxCached && torboxApiKey) {
      try {
        const targetMagnet = magnet || `magnet:?xt=urn:btih:${targetHash}`;
        const res = await fetch('/api/torbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'resolve', 
            magnet: targetMagnet, 
            apiKey: torboxApiKey,
            season: selectedSeason,
            episode: selectedEpisode
          })
        });
        const data = await res.json();
        if (data.url && typeof data.url === 'string' && data.url.startsWith('http')) {
          await playInPotPlayer(data.url);
          return;
        }
      } catch (e) {
        console.error('TorBox resolution failed:', e);
        alert('Nepodařilo se získat Debrid link.');
      }
      return;
    }

    // Mode: Direct stream (Hellspy / SKTOnline)
    if (url && !url.startsWith('magnet')) {
      if (mode === 'potplayer') {
        await playInPotPlayer(url);
      } else {
        setPlayingUrl(url);
        setPlayingTitle(displayTitle);
      }
      return;
    }
    
    // Mode: P2P Raw Torrent -> PotPlayer cannot open magnet links directly, but we can try 
    // passing it to PotPlayer or just alert.
    if (mode === 'potplayer' && (magnet || targetHash)) {
      alert('Tento torrent není v Debrid cache. K přehrání v PotPlayeru potřebuješ přímý HTTP link z Debridu nebo scraperu.');
      return;
    }
  };

  const getFilteredSources = () => {
    if (sourceFilter === 'all') return sources;
    return sources.filter(s => {
       if (sourceFilter === 'TorBox' && s.isTorBoxCached) return true;
       if (sourceFilter === 'Torrentio' && s.name && s.name.toLowerCase().includes('torrentio')) return true;
       if (sourceFilter === 'Torrentio' && !s.name) return true;
       if (sourceFilter === 'SKTorrent' && s.name && s.name === 'SKTorrent') return true;
       if (sourceFilter === 'Hellspy' && s.name && s.name.toLowerCase().includes('hellspy')) return true;
       return false;
    });
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>;
  }

  if (!meta) {
    return <div style={{ textAlign: 'center', padding: '4rem' }}>Film nebyl nalezen.</div>;
  }

  const filteredSources = getFilteredSources();
  const availableSeasons = Array.from(new Set(episodesList.map(e => e.season))).sort((a, b) => a - b);
  const availableEpisodes = episodesList.filter(e => e.season === selectedSeason).sort((a, b) => a.episode - b.episode);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
        <div style={{ flex: '0 0 300px' }}>
          {meta.poster && !posterError ? (
            <img
              src={meta.poster}
              alt={meta.name ? `${meta.name} - Plakát` : 'Plakát titulu'}
              style={{ width: '100%', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
              loading="eager"
              decoding="async"
              onError={() => setPosterError(true)}
            />
          ) : (
            <div style={{ width: '100%', aspectRatio: '2/3', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Bez obrázku
            </div>
          )}
        </div>
        
        <div style={{ flex: '1 1 400px' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{meta.name}</h1>
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            <span>{meta.releaseInfo}</span>
            <span>⭐ {meta.imdbRating || 'N/A'}</span>
            {meta.genres && <span>{meta.genres.join(' • ')}</span>}
          </div>
          
          <p style={{ fontSize: '1.1rem', lineHeight: 1.8, marginBottom: '2rem' }}>
            {meta.description || 'Popis není k dispozici.'}
          </p>

          {type === 'series' && episodesList.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Vyberte epizodu</h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Série</label>
                  <select 
                    value={selectedSeason} 
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      const eps = episodesList.filter(ep => ep.season === Number(e.target.value)).sort((a, b) => a.episode - b.episode);
                      if (eps.length > 0) setSelectedEpisode(eps[0].episode);
                    }}
                    className="input"
                    style={{ width: '120px' }}
                  >
                    {availableSeasons.map(s => (
                      <option key={s} value={s}>{s === 0 ? 'Speciály' : `Série ${s}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Epizoda</label>
                  <select 
                    value={selectedEpisode} 
                    onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                    className="input"
                    style={{ width: '200px' }}
                  >
                    {availableEpisodes.map(e => (
                      <option key={e.episode} value={e.episode}>Epizoda {e.episode} {e.title && `- ${e.title}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--accent-color)' }}>Dostupné</span> streamy {fetchingStreams ? '' : `(${filteredSources.length})`}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>Zdroj:</span>
            {[
              { id: 'all', label: 'Všechny' },
              { id: 'Torrentio', label: 'Torrentio' },
              { id: 'SKTorrent', label: 'SKTorrent' },
              { id: 'Hellspy', label: 'Hellspy' }
            ].map(src => (
              <button
                key={src.id}
                onClick={() => setSourceFilter(src.id)}
                style={{
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.85rem',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  backgroundColor: sourceFilter === src.id ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
                  color: sourceFilter === src.id ? '#fff' : 'var(--text-secondary)',
                  border: sourceFilter === src.id ? '1px solid var(--accent-color)' : '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {src.label}
              </button>
            ))}
          </div>
        </div>
        
        {fetchingStreams ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner"></div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredSources.length > 0 ? filteredSources.map((source, idx) => (
              <div key={idx} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', border: source.isTorBoxCached ? '1px solid rgba(234, 179, 8, 0.4)' : undefined }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                      {source.name}
                    </span>
                    {source.isTorBoxCached && (
                      <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                        ⚡ TorBox Instant (Debrid)
                      </span>
                    )}
                    {typeof source.seeders === 'number' && source.seeders > 0 && (
                      <span style={{ color: 'var(--success-color)', fontSize: '0.9rem', fontWeight: 500 }}>
                        👤 {source.seeders} seeders
                      </span>
                    )}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      💾 {source.size}
                    </span>
                  </div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, whiteSpace: 'pre-line' }}>{source.title}</h4>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {source.isTorBoxCached && (
                    <button onClick={() => handlePlay(source, 'debrid')} className="btn btn-primary" style={{ backgroundColor: '#eab308', color: '#000', fontWeight: 600 }}>
                      🟣 Přehrát v PotPlayeru (Debrid)
                    </button>
                  )}
                  {(!source.magnet && !source.infoHash) && (
                    <>
                      <button onClick={() => handlePlay(source, 'direct')} className="btn btn-primary">
                        ▶ Web Player
                      </button>
                      <button onClick={() => handlePlay(source, 'potplayer')} className="btn btn-secondary">
                        🟣 PotPlayer
                      </button>
                    </>
                  )}
                  {(source.magnet || source.infoHash) && !source.isTorBoxCached && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                      Není v TorBox cache. Potřeba stáhnout ručně.
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px' }}>
                Nebyly nalezeny žádné streamy.
              </div>
            )}
          </div>
        )}
      </div>

      {playingUrl && (
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
              onClick={() => { setPlayingUrl(null); setPlayingTitle(''); }}
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
              ⬅ Zpět k filmu
            </button>
          </div>

          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
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
                  {playingTitle}
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
                        src: playingUrl,
                        type: 'video/mp4'
                      }
                    ]
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
