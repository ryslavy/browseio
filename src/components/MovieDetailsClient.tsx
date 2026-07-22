'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getMetaDetails, MetaItem, Episode } from '@/lib/cinemeta';
import { getInstalledPlugins, fetchStreamsFromPlugin } from '@/lib/plugin-engine';
import { checkTorBoxCached, resolveTorBoxStreamUrl, cacheTorBoxTorrent } from '@/lib/torbox';

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false });

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

interface MovieDetailsClientProps {
  type?: string;
  id?: string;
}

export default function MovieDetailsClient({ type: propType, id: propId }: MovieDetailsClientProps = {}) {
  const params = useParams();
  const router = useRouter();

  const [searchId, setSearchId] = useState<string>('');
  const [searchType, setSearchType] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      setSearchId(sp.get('id') || '');
      setSearchType(sp.get('type') || '');
    }
  }, []);

  const id = propId || (params?.id as string) || searchId || '';
  const type = propType || (params?.type as string) || searchType || 'movie';

  const [meta, setMeta] = useState<MetaItem | null>(null);
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingStreams, setFetchingStreams] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
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
        const validVideos = metaData.videos.filter(v => v.season > 0);
        setEpisodesList(validVideos);
        
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

    const torboxApiKey = localStorage.getItem('torbox_api_key');
    const activePlugins = getInstalledPlugins().filter(p => p.enabled);

    if (activePlugins.length === 0) {
      setFetchingStreams(false);
      return;
    }

    const checkTorBoxCacheForSources = async (newSources: MediaSource[]) => {
      const hashesToCheck: string[] = [];
      newSources.forEach(s => {
        const hash = s.infoHash || (s.magnet ? new URLSearchParams(s.magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
        if (hash) hashesToCheck.push(hash);
      });

      if (hashesToCheck.length === 0) return newSources;

      try {
        const cachedSet = await checkTorBoxCached(hashesToCheck, torboxApiKey || undefined);
        if (cachedSet.size > 0) {
          return newSources.map(s => {
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
      return newSources;
    };

    Promise.allSettled(
      activePlugins.map(async plugin => {
        try {
          const rawStreams = await fetchStreamsFromPlugin(plugin, type as string, id as string, selectedSeason, selectedEpisode);
          if (activeFetchIdRef.current !== fetchId || !rawStreams || rawStreams.length === 0) return;

          const processedStreams = await checkTorBoxCacheForSources(rawStreams);
          if (activeFetchIdRef.current === fetchId) {
            setSources(prev => {
              const existing = new Set(prev.map(s => s.url || s.magnet || s.title));
              const fresh = processedStreams.filter(s => !existing.has(s.url || s.magnet || s.title));
              return [...prev, ...fresh];
            });
          }
        } catch (e) {
          console.error(`Error loading streams from ${plugin.name}:`, e);
        }
      })
    ).finally(() => {
      if (activeFetchIdRef.current === fetchId) {
        setFetchingStreams(false);
      }
    });

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
    const { infoHash, magnet, url, isTorBoxCached } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const seeders = source.seeders || source.seeds || 0;
    const sourceName = source.name || 'P2P Stream';

    const displayTitle = meta?.name ? `${meta.name}${meta.releaseInfo ? ` (${meta.releaseInfo})` : ''}` : sourceName;

    const playInPotPlayer = async (streamUrl: string) => {
      try {
        window.location.href = `potplayer://${streamUrl}`;
      } catch (e) {
        console.error('Error launching PotPlayer:', e);
        alert('Chyba při spouštění PotPlayeru. Nezapomeňte si stáhnout a nainstalovat .reg soubor!');
      }
    };

    if (mode === 'debrid' && isTorBoxCached && torboxApiKey) {
      try {
        const targetMagnet = magnet || `magnet:?xt=urn:btih:${targetHash}`;
        const streamUrl = await resolveTorBoxStreamUrl(targetMagnet, torboxApiKey, selectedSeason, selectedEpisode);
        if (streamUrl && streamUrl.startsWith('http')) {
          await playInPotPlayer(streamUrl);
          return;
        }
      } catch (e) {
        console.error('TorBox resolution failed:', e);
        alert('Nepodařilo se získat Debrid link.');
      }
      return;
    }

    if (url && !url.startsWith('magnet')) {
      if (mode === 'potplayer') {
        await playInPotPlayer(url);
      } else {
        setPlayingUrl(url);
        setPlayingTitle(displayTitle);
      }
      return;
    }
    
    if (mode === 'potplayer' && (magnet || targetHash)) {
      alert('Tento torrent není v Debrid cache. K přehrání v PotPlayeru potřebuješ přímý HTTP link z Debridu nebo scraperu.');
      return;
    }
  };

  const handleDownload = async (source: MediaSource) => {
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    const { infoHash, magnet, url, isTorBoxCached } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');

    if (isTorBoxCached && torboxApiKey) {
      try {
        const targetMagnet = magnet || `magnet:?xt=urn:btih:${targetHash}`;
        const streamUrl = await resolveTorBoxStreamUrl(targetMagnet, torboxApiKey, selectedSeason, selectedEpisode);
        if (streamUrl && streamUrl.startsWith('http')) {
          const a = document.createElement('a');
          a.href = streamUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.click();
          return;
        }
      } catch (e) {
        console.error('TorBox download resolution failed:', e);
      }
    }

    if (url && url.startsWith('http')) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = '';
      a.click();
      return;
    }

    const magnetUrl = magnet || (targetHash ? `magnet:?xt=urn:btih:${targetHash}` : null);
    if (magnetUrl) {
      window.location.href = magnetUrl;
      return;
    }

    alert('Stahování pro tento zdroj není k dispozici.');
  };

  const [copiedMagnetIdx, setCopiedMagnetIdx] = useState<number | null>(null);
  const [cachingIdx, setCachingIdx] = useState<number | null>(null);
  const [cachedSuccessIdx, setCachedSuccessIdx] = useState<number | null>(null);

  const handleCopyMagnet = async (source: MediaSource, idx: number) => {
    const { infoHash, magnet } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const magnetUrl = magnet || (targetHash ? `magnet:?xt=urn:btih:${targetHash}` : null);

    if (magnetUrl) {
      try {
        await navigator.clipboard.writeText(magnetUrl);
        setCopiedMagnetIdx(idx);
        setTimeout(() => setCopiedMagnetIdx(null), 2000);
      } catch (e) {
        console.error('Failed to copy magnet:', e);
        alert('Nepodařilo se zkopírovat magnet odkaz.');
      }
    } else {
      alert('Magnet odkaz není k dispozici.');
    }
  };

  const handleCacheTorBox = async (source: MediaSource, idx: number) => {
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    if (!torboxApiKey) {
      alert('Chybí TorBox API klíč. Přidejte si jej v Nastavení v pravém horním rohu.');
      return;
    }

    const { infoHash, magnet } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const magnetUrl = magnet || (targetHash ? `magnet:?xt=urn:btih:${targetHash}` : null);

    if (!magnetUrl) {
      alert('Magnet odkaz není k dispozici.');
      return;
    }

    setCachingIdx(idx);
    try {
      const res = await cacheTorBoxTorrent(magnetUrl, torboxApiKey);
      if (res.success) {
        setCachedSuccessIdx(idx);
        setTimeout(() => setCachedSuccessIdx(null), 4000);
      } else {
        alert(res.message || 'Nepodařilo se přidat torrent do TorBoxu.');
      }
    } catch (e) {
      console.error('TorBox cache request failed:', e);
      alert('Chyba při komunikaci s TorBox API.');
    } finally {
      setCachingIdx(null);
    }
  };

  const [playerIdle, setPlayerIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = useCallback(() => {
    setPlayerIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setPlayerIdle(true), 2500);
  }, []);

  useEffect(() => {
    if (playingUrl) {
      resetIdleTimer();
    } else {
      setPlayerIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [playingUrl, resetIdleTimer]);

  const videoOptions = useMemo(() => {
    return {
      autoplay: true,
      controls: true,
      responsive: true,
      fill: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      sources: playingUrl ? [
        {
          src: playingUrl,
          type: playingUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        }
      ] : []
    };
  }, [playingUrl]);

  const availableProviders = useMemo(() => {
    const plugins = getInstalledPlugins().filter(p => p.enabled);
    const providersMap = new Map<string, string>();
    providersMap.set('all', 'Všechny');
    
    plugins.forEach(p => {
      providersMap.set(p.name, p.name);
    });

    sources.forEach(s => {
      if (s.name) {
        providersMap.set(s.name, s.name);
      }
    });

    const result: { id: string; label: string }[] = [];
    providersMap.forEach((label, id) => {
      result.push({ id: id, label: label });
    });
    return result;
  }, [sources]);

  const getFilteredSources = () => {
    if (sourceFilter === 'all') return sources;
    return sources.filter(s => {
       if (sourceFilter === 'TorBox' && s.isTorBoxCached) return true;
       if (s.name && s.name.toLowerCase().includes(sourceFilter.toLowerCase())) return true;
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
          <h1 style={{ fontSize: '2.5rem', marginBottom: meta.czTitle && meta.originalTitle && meta.czTitle !== meta.originalTitle ? '0.2rem' : '0.5rem', lineHeight: 1.15 }}>
            {meta.czTitle || meta.name}
          </h1>
          {meta.czTitle && meta.originalTitle && meta.czTitle !== meta.originalTitle && (
            <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '1rem', fontWeight: 400 }}>
              ({meta.originalTitle})
            </div>
          )}
          {(!meta.czTitle && meta.name && meta.originalTitle && meta.name !== meta.originalTitle) && (
            <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '1rem', fontWeight: 400 }}>
              ({meta.originalTitle})
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            <span>{meta.releaseInfo}</span>
            {(meta as any).released && (
              <span title="Přesné datum vydání">📅 {new Date((meta as any).released).toLocaleDateString('cs-CZ')}</span>
            )}
            <span>⭐ {meta.imdbRating || 'N/A'}</span>
            {meta.genres && <span>{meta.genres.join(' • ')}</span>}
          </div>
          
          <p style={{ fontSize: '1.1rem', lineHeight: 1.8, marginBottom: '2rem' }}>
            {meta.description || 'Popis není k dispozici.'}
          </p>

          {type === 'series' && episodesList.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Série</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {availableSeasons.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        setSelectedSeason(s);
                        const eps = episodesList.filter(ep => ep.season === s).sort((a, b) => a.episode - b.episode);
                        if (eps.length > 0) setSelectedEpisode(eps[0].episode);
                      }}
                      className={`glass-pill ${selectedSeason === s ? 'active' : ''}`}
                      style={{
                        padding: '0.6rem 1.2rem',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontWeight: selectedSeason === s ? 600 : 500,
                      }}
                    >
                      {s === 0 ? 'Speciály' : `Série ${s}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Epizody</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxHeight: '320px', overflowY: 'auto', padding: '0.5rem', margin: '-0.5rem' }}>
                  {availableEpisodes.map(e => {
                    const releaseDate = e.released ? new Date(e.released).toLocaleDateString('cs-CZ') : '';
                    return (
                      <button
                        key={e.episode}
                        onClick={() => setSelectedEpisode(e.episode)}
                        className={`glass-pill ${selectedEpisode === e.episode ? 'active' : ''}`}
                        style={{
                          padding: '0.6rem 1rem',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          minWidth: '140px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem',
                        }}
                      >
                        <span style={{ fontWeight: selectedEpisode === e.episode ? 600 : 500 }}>
                          E{e.episode} {e.title && e.title.length < 25 ? `- ${e.title}` : ''}
                        </span>
                        {releaseDate && (
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            📅 {releaseDate}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-color)' }}>Dostupné</span> streamy ({filteredSources.length})
            {fetchingStreams && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                <div className="spinner" style={{ width: '13px', height: '13px', borderWidth: '2px' }}></div>
                Hledám další zdroje...
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>Zdroj:</span>
            {availableProviders.map(src => (
              <button
                key={src.id}
                onClick={() => setSourceFilter(src.id)}
                className={`glass-pill ${sourceFilter === src.id ? 'active' : ''}`}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {src.label}
              </button>
            ))}
          </div>
        </div>
        
        {fetchingStreams && sources.length === 0 ? (
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
                    <>
                      <button onClick={() => handlePlay(source, 'debrid')} className="btn btn-primary" style={{ backgroundColor: '#eab308', color: '#000', fontWeight: 600 }}>
                        🟣 Přehrát v PotPlayeru (Debrid)
                      </button>
                      <button onClick={() => handleDownload(source)} className="btn btn-secondary" style={{ border: '1px solid rgba(234, 179, 8, 0.4)', color: '#eab308' }}>
                        ⬇️ Stáhnout (Debrid)
                      </button>
                    </>
                  )}
                  {(!source.magnet && !source.infoHash) && (
                    <>
                      <button onClick={() => handlePlay(source, 'direct')} className="btn btn-primary">
                        ▶ Web Player
                      </button>
                      <button onClick={() => handlePlay(source, 'potplayer')} className="btn btn-secondary">
                        🟣 PotPlayer
                      </button>
                      <button onClick={() => handleDownload(source)} className="btn btn-secondary">
                        ⬇️ Stáhnout
                      </button>
                    </>
                  )}
                  {(source.magnet || source.infoHash) && !source.isTorBoxCached && (
                    <>
                      <button 
                        onClick={() => handleCacheTorBox(source, idx)} 
                        disabled={cachingIdx === idx}
                        className="btn btn-secondary" 
                        style={{ border: '1px solid rgba(234, 179, 8, 0.5)', color: '#eab308', opacity: cachingIdx === idx ? 0.7 : 1 }}
                        title="Odeslat torrent do TorBox cloudu k okamžitému stažení / cache"
                      >
                        {cachingIdx === idx ? '⏳ Ukládám...' : cachedSuccessIdx === idx ? '✅ Přidáno do TorBoxu!' : '⚡ Nacacheovat do TorBoxu'}
                      </button>
                      <button onClick={() => handleDownload(source)} className="btn btn-secondary">
                        📥 Stáhnout (Magnet)
                      </button>
                      <button onClick={() => handleCopyMagnet(source, idx)} className="btn btn-secondary" title="Zkopírovat magnet odkaz do schránky">
                        {copiedMagnetIdx === idx ? '✅ Zkopírováno!' : '📋 Zkopírovat magnet'}
                      </button>
                    </>
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

      {playingUrl && typeof document !== 'undefined' && createPortal(
        <div 
          className="fade-in" 
          onMouseMove={resetIdleTimer}
          onClick={resetIdleTimer}
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100vw', 
            height: '100vh', 
            backgroundColor: '#000', 
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ 
            position: 'absolute', 
            top: '15px', 
            left: '15px', 
            zIndex: 100, 
            pointerEvents: playerIdle ? 'none' : 'auto',
            opacity: playerIdle ? 0 : 1,
            transition: 'opacity 0.4s ease'
          }}>
            <button 
              onClick={() => { setPlayingUrl(null); setPlayingTitle(''); }}
              className="glass-pill" 
              style={{ 
                backgroundColor: 'rgba(25, 25, 30, 0.45)', 
                backdropFilter: 'blur(24px) saturate(200%)', 
                border: '1px solid rgba(255,255,255,0.15)', 
                borderTop: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '0.6rem 1.4rem',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Zpět
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
                justifyContent: 'center',
                opacity: playerIdle ? 0 : 1,
                transition: 'opacity 0.4s ease'
              }}>
                <h1 style={{ margin: 0, color: '#fff', fontSize: '1.4rem', fontWeight: 500, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {playingTitle}
                </h1>
              </div>

              <div style={{ width: '100%', height: '100%' }}>
                <VideoPlayer options={videoOptions} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
