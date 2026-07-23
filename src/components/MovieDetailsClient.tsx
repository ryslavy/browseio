'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getMetaDetails, MetaItem, Episode } from '@/lib/cinemeta';
import { getInstalledPlugins, fetchStreamsFromPlugin, StreamSource, normalizeInfoHash, isDebridCachedStream } from '@/lib/plugin-engine';
import { checkTorBoxCached, resolveTorBoxStreamUrl, cacheTorBoxTorrent } from '@/lib/torbox';
import { t, getCurrentLanguage, i18nEventTarget } from '@/lib/i18n';

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false });

interface MovieDetailsClientProps {
  type?: string;
  id?: string;
}

type QualityFilter = 'all' | '4k' | '1080p' | '720p' | 'sd';
type AudioFilter = 'all' | 'cz' | 'en';
type StreamSortMode = 'quality_desc' | 'seeders_desc' | 'size_desc' | 'size_asc' | 'name_asc';

export default function MovieDetailsClient({ type: propType, id: propId }: MovieDetailsClientProps = {}) {
  const params = useParams();
  const router = useRouter();

  const [searchId, setSearchId] = useState<string>('');
  const [searchType, setSearchType] = useState<string>('');
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
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingStreams, setFetchingStreams] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState<string>('');

  // 2-TIER PLUGIN & SUB-SOURCE FILTERS
  const [pluginFilter, setPluginFilter] = useState<string>('all');
  const [subSourceFilter, setSubSourceFilter] = useState<string>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [audioFilter, setAudioFilter] = useState<AudioFilter>('all');
  const [streamSort, setStreamSort] = useState<StreamSortMode>('quality_desc');
  const [onlyDebrid, setOnlyDebrid] = useState(false);

  // For series
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [episodesList, setEpisodesList] = useState<Episode[]>([]);

  // Local Player & Caching States
  const [cachingIdx, setCachingIdx] = useState<number | null>(null);
  const [cachedSuccessIdx, setCachedSuccessIdx] = useState<number | null>(null);
  const [preferredPlayer, setPreferredPlayer] = useState('potplayer');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPreferredPlayer(localStorage.getItem('preferred_local_player') || 'potplayer');
    }
  }, []);

  useEffect(() => {
    async function loadMeta() {
      setLoading(true);
      const metaData = await getMetaDetails(type as string, id as string);
      setMeta(metaData);
      if (metaData) {
        const lang = getCurrentLanguage();
        const titleName = lang === 'cs' ? (metaData.czTitle || metaData.name) : (metaData.originalTitle || metaData.name);
        document.title = `${titleName} - BrowseIO`;
      }
      setLoading(false);

      if (type === 'series' && metaData?.videos && metaData.videos.length > 0) {
        setEpisodesList(metaData.videos);
        const seasons = Array.from(new Set(metaData.videos.map(v => v.season))).sort((a, b) => a - b);
        const firstSeason = seasons.includes(1) ? 1 : seasons[0] || 1;
        setSelectedSeason(firstSeason);
        const firstEp = metaData.videos.find(v => v.season === firstSeason);
        if (firstEp) setSelectedEpisode(firstEp.episode);
      }
    }

    if (id) {
      loadMeta();
    }
  }, [type, id]);

  const activeFetchIdRef = useRef(0);

  const fetchStreams = useCallback(async (fetchId: number) => {
    setFetchingStreams(true);
    setSources([]);

    const torboxApiKey = typeof window !== 'undefined' ? localStorage.getItem('torbox_api_key') : null;
    const activePlugins = getInstalledPlugins().filter(p => p.enabled);

    if (activePlugins.length === 0) {
      setFetchingStreams(false);
      return;
    }

    const getHashFromSource = (s: StreamSource): string => {
      return normalizeInfoHash(s.infoHash || s.magnet || s.url || s.behaviorHints?.infoHash || '');
    };

    const checkTorBoxCacheForSources = async (newSources: StreamSource[]) => {
      const hashesToCheck: string[] = [];
      
      const updatedSources = newSources.map(s => {
        const isCached = isDebridCachedStream(s);
        const hash = getHashFromSource(s);
        if (hash) hashesToCheck.push(hash);
        return { ...s, isTorBoxCached: isCached };
      });

      if (hashesToCheck.length === 0) return updatedSources;

      try {
        const cachedSet = await checkTorBoxCached(hashesToCheck, torboxApiKey || undefined);
        if (cachedSet.size > 0) {
          return updatedSources.map(s => {
            const hash = getHashFromSource(s);
            if (hash && cachedSet.has(hash.toLowerCase())) {
              return { ...s, isTorBoxCached: true };
            }
            return s;
          });
        }
      } catch (e) {
        console.error('TorBox cache check failed:', e);
      }
      return updatedSources;
    };

    Promise.allSettled(
      activePlugins.map(async plugin => {
        try {
          const title = meta?.name || meta?.czTitle || meta?.originalTitle;
          const handlePartial = async (partialRaw: StreamSource[]) => {
            if (activeFetchIdRef.current !== fetchId || !partialRaw || partialRaw.length === 0) return;
            const processedStreams = await checkTorBoxCacheForSources(partialRaw);
            if (activeFetchIdRef.current === fetchId) {
              setSources(prev => {
                const existing = new Set(prev.map(s => s.url || s.magnet || s.title));
                const fresh = processedStreams.filter(s => !existing.has(s.url || s.magnet || s.title));
                return [...prev, ...fresh];
              });
            }
          };

          await fetchStreamsFromPlugin(plugin, type as string, id as string, selectedSeason, selectedEpisode, title, handlePartial);
        } catch (e) {
          console.error(`Error loading streams from ${plugin.name}:`, e);
        }
      })
    ).finally(() => {
      if (activeFetchIdRef.current === fetchId) {
        setFetchingStreams(false);
      }
    });

  }, [type, id, selectedSeason, selectedEpisode, meta]);

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

  const launchLocalPlayer = (streamUrl: string) => {
    const player = localStorage.getItem('preferred_local_player') || 'potplayer';
    try {
      if (player === 'vlc') {
        window.location.href = `vlc://${streamUrl}`;
      } else if (player === 'mpv') {
        window.location.href = `mpv://${streamUrl}`;
      } else if (player === 'infuse') {
        window.location.href = `infuse://x-callback-url/play?url=${encodeURIComponent(streamUrl)}`;
      } else {
        window.location.href = `potplayer://${streamUrl}`;
      }
    } catch (e) {
      console.error('Failed to launch local player:', e);
      alert('Chyba při spouštění přehrávače.');
    }
  };

  const getLocalPlayerLabel = () => {
    const p = preferredPlayer;
    if (p === 'vlc') return '🟧 VLC';
    if (p === 'mpv') return '🎬 MPV';
    if (p === 'infuse') return '💧 Infuse';
    return '🍿 PotPlayer';
  };

  const handlePlay = async (source: StreamSource, mode: 'debrid' | 'direct' | 'local' = 'direct') => {
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    const { infoHash, magnet, url, isTorBoxCached } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const sourceName = source.name || 'P2P Stream';

    const displayTitle = meta?.name ? `${meta.name}${meta.releaseInfo ? ` (${meta.releaseInfo})` : ''}` : sourceName;

    // If stream is already a direct HTTP(S) Debrid link (e.g. Torrentio RD / KnightCrawler RD / Nuvio)
    if (url && /^https?:\/\//i.test(url) && !url.toLowerCase().endsWith('.torrent')) {
      if (mode === 'local') {
        launchLocalPlayer(url);
      } else {
        setPlayingUrl(url);
        setPlayingTitle(displayTitle);
      }
      return;
    }

    if (mode === 'debrid' && isTorBoxCached && torboxApiKey) {
      try {
        const targetMagnet = magnet || `magnet:?xt=urn:btih:${targetHash}`;
        const streamUrl = await resolveTorBoxStreamUrl(targetMagnet, torboxApiKey, selectedSeason, selectedEpisode);
        if (streamUrl && streamUrl.startsWith('http')) {
          setPlayingUrl(streamUrl);
          setPlayingTitle(displayTitle);
          return;
        }
      } catch (e) {
        console.error('TorBox resolution failed:', e);
        alert('Nepodařilo se získat Debrid link.');
      }
      return;
    }

    if (mode === 'local') {
      if (isTorBoxCached && torboxApiKey) {
        const targetMagnet = magnet || `magnet:?xt=urn:btih:${targetHash}`;
        const streamUrl = await resolveTorBoxStreamUrl(targetMagnet, torboxApiKey, selectedSeason, selectedEpisode);
        if (streamUrl && streamUrl.startsWith('http')) {
          launchLocalPlayer(streamUrl);
          return;
        }
      } else if (url && !url.startsWith('magnet')) {
        launchLocalPlayer(url);
        return;
      } else {
        alert('Ke spuštění v externím přehrávači je potřeba přímý stream nebo kešovaný TorBox torrent.');
        return;
      }
    }

    if (url && !url.startsWith('magnet')) {
      setPlayingUrl(url);
      setPlayingTitle(displayTitle);
      return;
    }
  };

  const handleCacheTorBox = async (source: StreamSource, idx: number) => {
    const torboxApiKey = localStorage.getItem('torbox_api_key');
    if (!torboxApiKey) {
      alert('Chybí TorBox API klíč. Přidejte si jej v Nastavení.');
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
        // Mark source as cached in state
        setSources(prev => prev.map((s, i) => i === idx ? { ...s, isTorBoxCached: true } : s));
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

  const handleDownload = async (source: StreamSource) => {
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

  const handleCopyMagnet = async (source: StreamSource, idx: number) => {
    const { infoHash, magnet, url } = source;
    const targetHash = infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
    const linkToCopy = url || magnet || (targetHash ? `magnet:?xt=urn:btih:${targetHash}` : null);

    if (linkToCopy) {
      try {
        await navigator.clipboard.writeText(linkToCopy);
        setCopiedMagnetIdx(idx);
        setTimeout(() => setCopiedMagnetIdx(null), 2000);
      } catch (e) {
        console.error('Failed to copy link:', e);
      }
    }
  };

  // ─── TIER 1: MAIN PLUGINS LIST ───
  const availablePlugins = useMemo(() => {
    const installed = getInstalledPlugins().filter(p => p.enabled);
    const pluginsMap = new Map<string, { id: string; name: string }>();
    pluginsMap.set('all', { id: 'all', name: t('streams.quick_all') });

    installed.forEach(p => {
      pluginsMap.set(p.name, { id: p.name, name: p.name });
    });

    sources.forEach(s => {
      if (s.pluginName && !pluginsMap.has(s.pluginName)) {
        pluginsMap.set(s.pluginName, { id: s.pluginName, name: s.pluginName });
      }
    });

    return Array.from(pluginsMap.values());
  }, [sources]);

  // ─── TIER 2: SUB-SOURCES LIST (Filtered by selected Main Plugin) ───
  const availableSubSources = useMemo(() => {
    const subMap = new Map<string, string>();
    subMap.set('all', pluginFilter === 'all' ? 'Všechny pod-zdroje' : `Všechny pod-zdroje (${pluginFilter})`);

    sources.forEach(s => {
      if (pluginFilter !== 'all') {
        const matchesPlugin = (s.pluginName && s.pluginName.toLowerCase() === pluginFilter.toLowerCase()) ||
                              (s.pluginId && s.pluginId.toLowerCase() === pluginFilter.toLowerCase());
        if (!matchesPlugin) return;
      }

      const subName = s.subProvider || s.name;
      if (subName) {
        let cleanSubName = subName;
        if (/hellspy/i.test(subName)) cleanSubName = '😈 HellSpy';
        else if (/sktorrent/i.test(subName) && !/online/i.test(subName)) cleanSubName = '👑 SkTorrent';
        else if (/sktonline/i.test(subName)) cleanSubName = '©️ SkTonline';
        else if (/torrentio/i.test(subName)) cleanSubName = 'Torrentio';

        subMap.set(cleanSubName, cleanSubName);
      }
    });

    return Array.from(subMap.entries()).map(([id, label]) => ({ id, label }));
  }, [sources, pluginFilter]);

  // Helper functions for quality and audio detection
  const detectQuality = (s: StreamSource): '4k' | '1080p' | '720p' | 'sd' => {
    const text = `${s.name || ''} ${s.title || ''} ${s.subProvider || ''}`.toLowerCase();
    if (/4k|2160p|uhd|remux\.2160/i.test(text)) return '4k';
    if (/1080p|fullhd|fhd/i.test(text)) return '1080p';
    if (/720p|hdrip/i.test(text)) return '720p';
    return 'sd';
  };

  const detectAudio = (s: StreamSource): 'cz' | 'en' => {
    const text = `${s.name || ''} ${s.title || ''} ${s.subProvider || ''}`.toLowerCase();
    if (/cz|sk|czdab|skdab|dubbing|dabing|🔊/i.test(text)) return 'cz';
    return 'en';
  };

  const parseSizeBytes = (sizeStr?: string): number => {
    if (!sizeStr || sizeStr === 'Unknown') return 0;
    const match = sizeStr.match(/([0-9.]+)\s*(GB|MB|KB|B)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return val * 1024 * 1024 * 1024;
    if (unit === 'MB') return val * 1024 * 1024;
    if (unit === 'KB') return val * 1024;
    return val;
  };

  // Filtered & Sorted sources
  const processedSources = useMemo(() => {
    let result = [...sources];

    // 1. Primary Plugin Filter
    if (pluginFilter !== 'all') {
      result = result.filter(s => {
        if (s.pluginName && s.pluginName.toLowerCase() === pluginFilter.toLowerCase()) return true;
        if (s.pluginId && s.pluginId.toLowerCase() === pluginFilter.toLowerCase()) return true;
        if (s.name && s.name.toLowerCase().includes(pluginFilter.toLowerCase())) return true;
        return false;
      });
    }

    // 2. Secondary Sub-Source Filter
    if (subSourceFilter !== 'all') {
      result = result.filter(s => {
        const subName = s.subProvider || s.name || '';
        if (subName.toLowerCase().includes(subSourceFilter.toLowerCase())) return true;
        if (subSourceFilter.includes('HellSpy') && /hellspy/i.test(subName)) return true;
        if (subSourceFilter.includes('SkTorrent') && /sktorrent/i.test(subName) && !/online/i.test(subName)) return true;
        if (subSourceFilter.includes('SkTonline') && /sktonline/i.test(subName)) return true;
        if (subSourceFilter.includes('Torrentio') && /torrentio/i.test(subName)) return true;
        return false;
      });
    }

    // 3. Quality Filter
    if (qualityFilter !== 'all') {
      result = result.filter(s => detectQuality(s) === qualityFilter);
    }

    // 4. Audio Filter
    if (audioFilter !== 'all') {
      result = result.filter(s => detectAudio(s) === audioFilter);
    }

    // 5. Quick Only Debrid
    if (onlyDebrid) {
      result = result.filter(s => Boolean(s.isTorBoxCached));
    }

    // 6. Sort
    result.sort((a, b) => {
      if (streamSort === 'quality_desc') {
        const qOrder = { '4k': 4, '1080p': 3, '720p': 2, 'sd': 1 };
        const qA = qOrder[detectQuality(a)];
        const qB = qOrder[detectQuality(b)];
        if (qA !== qB) return qB - qA;
      }
      if (streamSort === 'seeders_desc') {
        const sA = a.seeders || 0;
        const sB = b.seeders || 0;
        if (sA !== sB) return sB - sA;
      }
      if (streamSort === 'size_desc') {
        const szA = parseSizeBytes(a.size);
        const szB = parseSizeBytes(b.size);
        if (szA !== szB) return szB - szA;
      }
      if (streamSort === 'size_asc') {
        const szA = parseSizeBytes(a.size);
        const szB = parseSizeBytes(b.size);
        if (szA !== szB) return szA - szB;
      }
      if (streamSort === 'name_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return result;
  }, [sources, pluginFilter, subSourceFilter, qualityFilter, audioFilter, onlyDebrid, streamSort]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <h2>{t('details.not_found')}</h2>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          {t('details.back')}
        </Link>
      </div>
    );
  }

  const availableSeasons = Array.from(new Set(episodesList.map(e => e.season))).sort((a, b) => a - b);
  const availableEpisodes = episodesList.filter(e => e.season === selectedSeason).sort((a, b) => a.episode - b.episode);
  const activePlugins = getInstalledPlugins().filter(p => p.enabled);

  return (
    <div className="fade-in">
      <Link href={type === 'series' ? '/?type=series' : '/?type=movie'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', textDecoration: 'none', fontWeight: 500 }}>
        {t('details.back')}
      </Link>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
        <div style={{ flex: '0 0 280px' }}>
          {meta.poster && !posterError ? (
            <img
              src={meta.poster}
              alt={meta.name ? `${meta.name} - Plakát` : 'Plakát titulu'}
              style={{ width: '100%', borderRadius: '14px', boxShadow: '0 12px 36px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              loading="eager"
              decoding="async"
              onError={() => setPosterError(true)}
            />
          ) : (
            <div style={{ width: '100%', aspectRatio: '2/3', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              {t('catalog.no_image')}
            </div>
          )}
        </div>
        
        <div style={{ flex: '1 1 400px' }}>
          {(() => {
            const currentLang = getCurrentLanguage();
            const primaryTitle = currentLang === 'cs'
              ? (meta.czTitle || meta.name)
              : (meta.originalTitle || meta.name);
            const secondaryTitle = currentLang === 'cs'
              ? (meta.czTitle && meta.originalTitle && meta.czTitle !== meta.originalTitle ? meta.originalTitle : null)
              : (meta.czTitle && meta.originalTitle && meta.czTitle !== meta.originalTitle ? meta.czTitle : null);

            return (
              <>
                <h1 style={{ fontSize: '2.5rem', marginBottom: secondaryTitle ? '0.2rem' : '0.5rem', lineHeight: 1.15, fontWeight: 800 }}>
                  {primaryTitle}
                </h1>
                {secondaryTitle && (
                  <div style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '1rem', fontWeight: 400 }}>
                    ({secondaryTitle})
                  </div>
                )}
              </>
            );
          })()}
          
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{meta.releaseInfo}</span>
            {(meta as any).released && (
              <span title={t('details.released')}>📅 {new Date((meta as any).released).toLocaleDateString()}</span>
            )}
            <span>⭐ {meta.imdbRating || 'N/A'}</span>
            {meta.genres && <span>{meta.genres.map(g => t(`genre.${g}`) || g).join(' • ')}</span>}
          </div>
          
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, marginBottom: '2rem', color: 'var(--text-primary)' }}>
            {meta.description || t('details.no_description')}
          </p>

          {/* Series Season/Episode Picker */}
          {type === 'series' && episodesList.length > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '18px', marginBottom: '2rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('details.seasons')}</h3>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {availableSeasons.map(s => {
                    const isSelected = selectedSeason === s;
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          setSelectedSeason(s);
                          const eps = episodesList.filter(ep => ep.season === s).sort((a, b) => a.episode - b.episode);
                          if (eps.length > 0) setSelectedEpisode(eps[0].episode);
                        }}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          padding: '0.45rem 1.2rem',
                          borderRadius: '9999px',
                          fontSize: '0.85rem',
                        }}
                      >
                        {s === 0 ? t('details.specials') : `${t('details.season')} ${s}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 style={{ marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('details.episodes')}</h3>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', maxHeight: '320px', overflowY: 'auto', padding: '0.25rem' }}>
                  {availableEpisodes.map(e => {
                    const releaseDate = e.released ? new Date(e.released).toLocaleDateString() : '';
                    const isSelected = selectedEpisode === e.episode;
                    return (
                      <button
                        key={e.episode}
                        onClick={() => setSelectedEpisode(e.episode)}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          padding: '0.5rem 0.9rem',
                          borderRadius: '12px',
                          textAlign: 'left',
                          fontSize: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.15rem',
                        }}
                      >
                        <span>
                          E{e.episode} {e.title && e.title.length < 22 ? `- ${e.title}` : ''}
                        </span>
                        {releaseDate && (
                          <span style={{ fontSize: '0.7rem', opacity: isSelected ? 0.9 : 0.65 }}>
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

      {/* STREAMS SECTION */}
      <div style={{ marginTop: '2.5rem' }}>
        {/* Header Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '1.75rem', fontWeight: 800 }}>
            <span>{t('streams.title')}</span>
            <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.2rem 0.7rem', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 700 }}>
              {processedSources.length}
            </span>
            {fetchingStreams && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '12px' }}>
                <div className="spinner" style={{ width: '13px', height: '13px', borderWidth: '2px' }}></div>
                {t('streams.searching_more')}
              </span>
            )}
          </h2>

          {/* Stream Sorting Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('streams.sort_label')}</span>
            <select
              value={streamSort}
              onChange={(e) => setStreamSort(e.target.value as StreamSortMode)}
              className="input"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', width: 'auto', cursor: 'pointer' }}
            >
              <option value="quality_desc" style={{ backgroundColor: '#1a1d24' }}>{t('streams.sort_quality')}</option>
              <option value="seeders_desc" style={{ backgroundColor: '#1a1d24' }}>{t('streams.sort_seeders')}</option>
              <option value="size_desc" style={{ backgroundColor: '#1a1d24' }}>{t('streams.sort_size_desc')}</option>
              <option value="size_asc" style={{ backgroundColor: '#1a1d24' }}>{t('streams.sort_size_asc')}</option>
              <option value="name_asc" style={{ backgroundColor: '#1a1d24' }}>{t('streams.sort_name')}</option>
            </select>
          </div>
        </div>

        {/* 2-TIER CONTROLS PANEL */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderRadius: '16px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          
          {/* TIER 1: Main Plugin / Addon Selection Pill Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 700, minWidth: '85px' }}>{t('streams.filter_source')}</span>
            {availablePlugins.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setPluginFilter(p.id);
                  setSubSourceFilter('all'); // Reset sub-source filter when main plugin changes
                }}
                className={`btn ${pluginFilter === p.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  padding: '0.4rem 1rem', 
                  fontSize: '0.85rem', 
                  borderRadius: '9999px',
                  fontWeight: pluginFilter === p.id ? 700 : 500
                }}
              >
                {p.id === 'all' ? `📦 ${t('streams.quick_all')}` : `🧩 ${p.name}`}
              </button>
            ))}
          </div>

          {/* TIER 2: Sub-sources / Categories of Selected Plugin */}
          {availableSubSources.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingLeft: '0.5rem', borderLeft: '3px solid var(--accent-color)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '80px' }}>{t('streams.filter_subsource')}</span>
              {availableSubSources.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setSubSourceFilter(sub.id)}
                  className={`btn ${subSourceFilter === sub.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ 
                    padding: '0.35rem 0.85rem', 
                    fontSize: '0.825rem', 
                    borderRadius: '9999px',
                    backgroundColor: subSourceFilter === sub.id ? 'rgba(59, 130, 246, 0.8)' : 'rgba(255,255,255,0.06)'
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0.2rem 0' }} />

          {/* TIER 3 & 4: Quality & Audio Filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {/* Quality Tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('streams.filter_quality')}</span>
                {[
                  { id: 'all', label: t('streams.quality_all') },
                  { id: '4k', label: t('streams.quality_4k') },
                  { id: '1080p', label: t('streams.quality_1080p') },
                  { id: '720p', label: t('streams.quality_720p') },
                  { id: 'sd', label: t('streams.quality_sd') },
                ].map(q => (
                  <button
                    key={q.id}
                    onClick={() => setQualityFilter(q.id as QualityFilter)}
                    className={`btn ${qualityFilter === q.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '9999px' }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Audio Tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('streams.filter_audio')}</span>
                {[
                  { id: 'all', label: t('streams.audio_all') },
                  { id: 'cz', label: t('streams.audio_cz') },
                  { id: 'en', label: t('streams.audio_en') },
                ].map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAudioFilter(a.id as AudioFilter)}
                    className={`btn ${audioFilter === a.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '9999px' }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Debrid Toggle */}
            <button
              onClick={() => setOnlyDebrid(prev => !prev)}
              className={`btn ${onlyDebrid ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '0.35rem 0.85rem',
                fontSize: '0.825rem',
                borderRadius: '9999px',
                backgroundColor: onlyDebrid ? 'rgba(234, 179, 8, 0.3)' : undefined,
                color: onlyDebrid ? '#eab308' : undefined,
                border: onlyDebrid ? '1px solid #eab308' : undefined
              }}
            >
              {t('streams.quick_debrid')}
            </button>
          </div>
        </div>
        
        {/* STREAM CARDS LIST */}
        {fetchingStreams && sources.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner"></div>
          </div>
        ) : activePlugins.length === 0 ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px' }}>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {t('streams.no_plugins_notice')}
            </p>
            <Link href="/settings" className="btn btn-primary">
              {t('streams.manage_plugins')}
            </Link>
          </div>
        ) : processedSources.length === 0 ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px' }}>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {t('streams.no_streams')}
            </p>
            <button 
              onClick={() => { setPluginFilter('all'); setSubSourceFilter('all'); setQualityFilter('all'); setAudioFilter('all'); setOnlyDebrid(false); }} 
              className="btn btn-secondary"
            >
              Obnovit všechny filtry
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {processedSources.map((source, idx) => {
              const quality = detectQuality(source);
              const audio = detectAudio(source);
              const subProviderName = source.subProvider || source.name;
              const hasMagnetOrHash = Boolean(source.magnet || source.infoHash);

              return (
                <div 
                  key={idx} 
                  className={`glass-panel ${source.isTorBoxCached ? 'glass-debrid' : ''}`} 
                  style={{ 
                    padding: '1.25rem 1.5rem', 
                    borderRadius: '16px',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    gap: '1.25rem', 
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    {/* BADGES HEADER */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      {/* Main Plugin Badge */}
                      {source.pluginName && (
                        <span style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          🧩 {source.pluginName}
                        </span>
                      )}

                      {/* Sub-Provider Badge */}
                      <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {subProviderName}
                      </span>

                      {/* Quality Badge */}
                      {quality === '4k' && (
                        <span style={{ background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(168, 85, 247, 0.25))', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                          ☀️ 4K UHD
                        </span>
                      )}
                      {quality === '1080p' && (
                        <span style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          📺 1080p HD
                        </span>
                      )}
                      {quality === '720p' && (
                        <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                          📺 720p HD
                        </span>
                      )}

                      {/* Audio Badge */}
                      {audio === 'cz' && (
                        <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          🔊 CZ / SK Dabing
                        </span>
                      )}

                      {/* Debrid Badge */}
                      {source.isTorBoxCached && (
                        <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#facc15', border: '1px solid rgba(250, 204, 21, 0.5)', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                          ⚡ TorBox Instant
                        </span>
                      )}

                      {/* Seeders & Size */}
                      {typeof source.seeders === 'number' && source.seeders > 0 && (
                        <span style={{ color: '#34d399', fontSize: '0.825rem', fontWeight: 600 }}>
                          👤 {source.seeders} {t('streams.seeders')}
                        </span>
                      )}
                      {source.size && source.size !== 'Unknown' && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                          💾 {source.size}
                        </span>
                      )}
                    </div>

                    {/* STREAM TITLE */}
                    <h4 style={{ margin: 0, fontSize: '0.975rem', fontWeight: 600, color: '#fff', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {source.title}
                    </h4>
                  </div>

                  {/* ACTIONS BUTTONS */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Primary Web Player or Debrid Instant Play */}
                    {source.isTorBoxCached ? (
                      <button 
                        onClick={() => handlePlay(source, 'debrid')} 
                        className="btn btn-primary" 
                        style={{ backgroundColor: '#facc15', color: '#000', fontWeight: 700, padding: '0.5rem 1.1rem', fontSize: '0.9rem' }}
                      >
                        {t('streams.play_debrid')}
                      </button>
                    ) : source.url && !source.url.startsWith('magnet') ? (
                      <button 
                        onClick={() => handlePlay(source, 'direct')} 
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 1.1rem', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        {t('streams.play_web')}
                      </button>
                    ) : null}

                    {/* Manual TorBox Cache Button (for un-cached torrents/magnets) */}
                    {!source.isTorBoxCached && hasMagnetOrHash && (
                      <button
                        onClick={() => handleCacheTorBox(source, idx)}
                        disabled={cachingIdx === idx}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '0.85rem',
                          padding: '0.5rem 0.85rem',
                          borderColor: cachedSuccessIdx === idx ? '#10b981' : 'rgba(234, 179, 8, 0.4)',
                          color: cachedSuccessIdx === idx ? '#10b981' : '#facc15',
                          backgroundColor: cachedSuccessIdx === idx ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.08)'
                        }}
                      >
                        {cachingIdx === idx
                          ? t('streams.caching')
                          : cachedSuccessIdx === idx
                          ? t('streams.cached_success')
                          : t('streams.cache_debrid')}
                      </button>
                    )}

                    {/* Preferred Local Player Button (PotPlayer / VLC / MPV / Infuse) */}
                    <button 
                      onClick={() => handlePlay(source, 'local')} 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                      title={`Spustit v ${preferredPlayer.toUpperCase()}`}
                    >
                      {getLocalPlayerLabel()}
                    </button>

                    {/* Download Button */}
                    <button 
                      onClick={() => handleDownload(source)} 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                    >
                      {t('streams.download')}
                    </button>

                    {/* Copy Link / Magnet */}
                    <button 
                      onClick={() => handleCopyMagnet(source, idx)} 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                    >
                      {copiedMagnetIdx === idx ? t('streams.link_copied') : t('streams.copy_link')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VIDEO PLAYER MODAL */}
      {playingUrl && (
        <VideoPlayer 
          src={playingUrl} 
          title={playingTitle} 
          onClose={() => setPlayingUrl(null)} 
        />
      )}
    </div>
  );
}
