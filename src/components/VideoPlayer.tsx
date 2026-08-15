'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import type { StreamSource } from '@/lib/plugin-engine';
import {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
  convertSrtToVtt,
  normalizeSubtitles,
  NormalizedSubtitle,
  detectStreamDubbing,
  DubbingLanguage,
} from '@/lib/video-player-helpers';
import { probeMediaStream, MediaProbeResult } from '@/lib/media-prober';
import { useI18n } from '@/lib/i18n';

export {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
  detectStreamDubbing,
};

export interface VideoPlayerSubtitle {
  src?: string;
  url?: string;
  label?: string;
  name?: string;
  srclang?: string;
  lang?: string;
  default?: boolean;
}

export interface AudioTrackItem {
  id: number;
  label: string;
  lang?: string;
}

export interface VideoPlayerProps {
  src?: string;
  title?: string;
  subtitles?: VideoPlayerSubtitle[];
  availableSources?: StreamSource[];
  currentSource?: StreamSource | null;
  onSelectSource?: (source: StreamSource) => void;
  onClose?: () => void;
  options?: {
    sources?: Array<{ src: string; type?: string; title?: string }>;
    title?: string;
    filename?: string;
    autoplay?: boolean;
    controls?: boolean;
    playbackRates?: number[];
    subtitles?: VideoPlayerSubtitle[];
  };
}

export const VideoPlayerModal: React.FC<VideoPlayerProps> = ({
  src: propSrc,
  title: propTitle,
  subtitles: propSubtitles,
  availableSources = [],
  currentSource,
  onSelectSource,
  onClose,
  options,
}) => {
  const { t } = useI18n();
  const artContainerRef = useRef<HTMLDivElement | null>(null);
  const artInstanceRef = useRef<Artplayer | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local override if user switches stream internally
  const [internalSource, setInternalSource] = useState<StreamSource | null>(null);

  // Active Stream Source & URL resolution
  const activeUrl = (internalSource?.url) || propSrc || (options?.sources?.[0]?.src) || '';
  const activeTitle = (internalSource?.title || internalSource?.name) || propTitle || options?.title || options?.filename || options?.sources?.[0]?.title || '';

  // UI Panels & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSwitchingStream, setIsSwitchingStream] = useState(false);

  // Subtitles State
  const normalizedInitialSubs = useMemo(() => {
    const raw = propSubtitles || options?.subtitles || [];
    return normalizeSubtitles(raw);
  }, [propSubtitles, options?.subtitles]);

  const [customSubs, setCustomSubs] = useState<NormalizedSubtitle[]>([]);
  const subtitlesList = useMemo(() => {
    return [...customSubs, ...normalizedInitialSubs];
  }, [customSubs, normalizedInitialSubs]);

  const [activeSubUrl, setActiveSubUrl] = useState<string | null>(() => {
    const def = normalizedInitialSubs.find(s => s.default);
    return def ? def.url : (normalizedInitialSubs.length > 0 ? normalizedInitialSubs[0].url : null);
  });
  const [subFontSize, setSubFontSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('player_subtitle_size');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 12 && parsed <= 60) return parsed;
      }
    }
    return 24;
  });
  const [subBottomOffset, setSubBottomOffset] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('player_subtitle_bottom_offset');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) return parsed;
      }
    }
    return 30;
  });

  // Audio Tracks (HLS / Multi-Audio / Probed) State
  const [audioTracksList, setAudioTracksList] = useState<AudioTrackItem[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(0);
  const [probedMedia, setProbedMedia] = useState<MediaProbeResult | null>(null);

  // Dubbing Language Filter for Stream Drawer
  const [drawerDubbingFilter, setDrawerDubbingFilter] = useState<'all' | DubbingLanguage>('all');

  // P2P Torrent detection
  const isP2P = Boolean(activeUrl && (activeUrl.startsWith('magnet:') || activeUrl.toLowerCase().endsWith('.torrent')));

  // Error state resolution
  const hasError = isP2P || Boolean(playbackError);
  const errorMessage = isP2P
    ? (t('streams.p2p_notice_alert') || 'Nativní webový přehrávač nepodporuje přímé přehrávání P2P torrentů. Nejprve je nutné odkaz nacachovat na Debrid (např. TorBox).')
    : (playbackError || '');

  // Audio Codec Analysis
  const audioAnalysis = useMemo(() => {
    const combinedText = [activeTitle, activeUrl].filter(Boolean).join(' ');
    const codecs = detectAudioCodecs(combinedText);
    const isUnsupported = codecs.length > 0;
    const warning = getAudioCodecWarning(combinedText);
    return { codecs, isUnsupported, warning };
  }, [activeTitle, activeUrl]);

  // Media Container Probing (Pure TypeScript EBML/MP4 Header Inspector)
  useEffect(() => {
    if (!activeUrl || isP2P || activeUrl.includes('.m3u8') || activeUrl.includes('/hls/')) {
      return;
    }

    let isMounted = true;
    probeMediaStream(activeUrl)
      .then((res) => {
        if (!isMounted || !res.success) return;
        setProbedMedia(res);

        if (res.audio && res.audio.length > 0) {
          const mapped: AudioTrackItem[] = res.audio.map((a, idx) => ({
            id: a.trackNumber || idx,
            label: a.label || `Audio ${idx + 1}`,
            lang: a.lang,
          }));
          setAudioTracksList(mapped);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeUrl, isP2P]);

  // Handle stream switching from the in-player drawer
  const handleSwitchStream = useCallback(async (source: StreamSource) => {
    setPlaybackError(null);
    setProbedMedia(null);
    if (onSelectSource) {
      setIsSwitchingStream(true);
      try {
        await onSelectSource(source);
      } catch (err) {
        console.error('Failed to switch source:', err);
      } finally {
        setIsSwitchingStream(false);
      }
    } else {
      setInternalSource(source);
    }
  }, [onSelectSource]);

  // External Player Protocols
  const handleLaunchExternalPlayer = (player: 'potplayer' | 'vlc' | 'mpv' | 'infuse') => {
    if (!activeUrl) return;
    const playerUrl = generateExternalPlayerUrl(player, activeUrl);
    window.location.assign(playerUrl);
  };

  // Copy Stream URL
  const handleCopyLink = async () => {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Switch Audio Track
  const handleAudioTrackChange = (trackId: number) => {
    setActiveAudioTrack(trackId);
    if (artInstanceRef.current) {
      const artHlsHolder = artInstanceRef.current as unknown as { hls?: Hls };
      if (artHlsHolder.hls) {
        artHlsHolder.hls.audioTrack = trackId;
      } else {
        const videoElem = artInstanceRef.current.video;
        if (videoElem && 'audioTracks' in videoElem) {
          const vTracks = (videoElem as unknown as { audioTracks?: Array<{ enabled: boolean }> }).audioTracks;
          if (vTracks) {
            for (let i = 0; i < vTracks.length; i++) {
              vTracks[i].enabled = (i === trackId);
            }
          }
        }
      }
    }
  };

  // Switch Subtitles smoothly
  const switchSubtitle = useCallback((url: string | null) => {
    if (!url || url === 'off') {
      setActiveSubUrl(null);
      if (artInstanceRef.current) {
        artInstanceRef.current.subtitle.show = false;
      }
    } else {
      setActiveSubUrl(url);
      if (artInstanceRef.current) {
        artInstanceRef.current.subtitle.switch(url, {
          type: url.endsWith('.srt') ? 'srt' : 'vtt',
          style: {
            color: '#ffffff',
            fontSize: `${subFontSize}px`,
            bottom: `${subBottomOffset}px`,
            marginBottom: `${subBottomOffset}px`,
            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
          },
        }).then(() => {
          if (artInstanceRef.current) {
            artInstanceRef.current.subtitle.show = true;
            artInstanceRef.current.subtitle.style('fontSize', `${subFontSize}px`);
            artInstanceRef.current.subtitle.style('bottom', `${subBottomOffset}px`);
            artInstanceRef.current.subtitle.style('marginBottom', `${subBottomOffset}px`);
          }
        }).catch(() => {
          if (artInstanceRef.current) {
            artInstanceRef.current.subtitle.url = url;
            artInstanceRef.current.subtitle.show = true;
            artInstanceRef.current.subtitle.style('fontSize', `${subFontSize}px`);
            artInstanceRef.current.subtitle.style('bottom', `${subBottomOffset}px`);
            artInstanceRef.current.subtitle.style('marginBottom', `${subBottomOffset}px`);
          }
        });
      }
    }
  }, [subFontSize, subBottomOffset]);

  // Adjust Subtitle Font Size (+ / - / presets)
  const handleSubFontSizeChange = useCallback((size: number) => {
    const clamped = Math.max(14, Math.min(50, size));
    setSubFontSize(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem('player_subtitle_size', clamped.toString());
    }
    if (artInstanceRef.current) {
      try {
        artInstanceRef.current.subtitle.style('fontSize', `${clamped}px`);
      } catch {
        // Ignore
      }
    }
  }, []);

  // Adjust Subtitle Bottom Offset (Position / Height)
  const handleSubBottomOffsetChange = useCallback((offset: number) => {
    const clamped = Math.max(10, Math.min(300, offset));
    setSubBottomOffset(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem('player_subtitle_bottom_offset', clamped.toString());
    }
    if (artInstanceRef.current) {
      try {
        artInstanceRef.current.subtitle.style('bottom', `${clamped}px`);
        artInstanceRef.current.subtitle.style('marginBottom', `${clamped}px`);
      } catch {
        // Ignore
      }
    }
  }, []);

  // Custom Local Subtitle Upload (.srt / .vtt)
  const handleCustomSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const vttContent = file.name.endsWith('.srt') ? convertSrtToVtt(content) : content;
      const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      const newSub: NormalizedSubtitle = {
        url: blobUrl,
        label: `📁 ${file.name}`,
        lang: 'custom',
        default: true
      };

      setCustomSubs(prev => [newSub, ...prev.filter(s => s.url !== blobUrl)]);
      switchSubtitle(blobUrl);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is focused inside an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        if (drawerOpen) {
          setDrawerOpen(false);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setDrawerOpen(prev => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if (artInstanceRef.current) {
          artInstanceRef.current.subtitle.show = !artInstanceRef.current.subtitle.show;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen, onClose]);

  // Artplayer Lifecycle Initialization
  useEffect(() => {
    if (!artContainerRef.current || !activeUrl || isP2P) return;

    setAudioTracksList([]);

    const art = new Artplayer({
      container: artContainerRef.current,
      url: activeUrl,
      poster: '',
      volume: 0.9,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: false,
      autoMini: true,
      screenshot: true,
      setting: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoPlayback: true,
      airplay: true,
      theme: '#3b82f6',
      lang: 'en',
      moreVideoAttr: {
        playsInline: true,
      },
      subtitle: {
        url: activeSubUrl || '',
        type: activeSubUrl?.endsWith('.srt') ? 'srt' : 'vtt',
        style: {
          color: '#ffffff',
          fontSize: `${subFontSize}px`,
          bottom: `${subBottomOffset}px`,
          marginBottom: `${subBottomOffset}px`,
          textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
        },
        encoding: 'utf-8',
      },
      settings: [
        {
          width: 250,
          html: `💬 ${t('player.subtitles') || 'Titulky'}`,
          tooltip: activeSubUrl ? (subtitlesList.find(s => s.url === activeSubUrl)?.label || 'Aktivní') : (t('player.subtitles_off') || 'Vypnuto'),
          selector: [
            {
              html: t('player.subtitles_off') || 'Vypnuto',
              value: 'off',
              default: !activeSubUrl,
            },
            ...subtitlesList.map(s => ({
              html: s.label,
              value: s.url,
              default: s.url === activeSubUrl,
            })),
            {
              html: `📁 ${t('player.upload_subtitles') || 'Nahrát vlastní (.srt / .vtt)'}`,
              value: '__upload__',
            }
          ],
          onSelect: function (item: { value?: string | number; html?: string }) {
            const val = String(item.value);
            if (val === '__upload__') {
              fileInputRef.current?.click();
              return activeSubUrl ? (subtitlesList.find(s => s.url === activeSubUrl)?.label || 'Aktivní') : (t('player.subtitles_off') || 'Vypnuto');
            }
            switchSubtitle(val === 'off' ? null : val);
            return item.html || '';
          },
        },
        {
          width: 250,
          html: `📏 ${t('player.sub_size') || 'Velikost titulků'}`,
          tooltip: `${subFontSize}px`,
          selector: [
            { html: '16px (Malé)', value: 16, default: subFontSize === 16 },
            { html: '20px', value: 20, default: subFontSize === 20 },
            { html: '24px (Normální)', value: 24, default: subFontSize === 24 },
            { html: '28px (Velké)', value: 28, default: subFontSize === 28 },
            { html: '34px (Extra velké)', value: 34, default: subFontSize === 34 },
            { html: '40px', value: 40, default: subFontSize === 40 },
          ],
          onSelect: function (item: { value?: number; html?: string }) {
            if (typeof item.value === 'number') {
              handleSubFontSizeChange(item.value);
            }
            return item.html || '';
          },
        },
        {
          width: 260,
          html: `📐 ${t('player.sub_position') || 'Pozice titulků (výška)'}`,
          tooltip: `${subBottomOffset}px`,
          selector: [
            { html: 'Dole (30px - Výchozí)', value: 30, default: subBottomOffset === 30 },
            { html: 'Mírně výše (55px)', value: 55, default: subBottomOffset === 55 },
            { html: 'Středně vysoko (85px)', value: 85, default: subBottomOffset === 85 },
            { html: 'Vysoko (120px)', value: 120, default: subBottomOffset === 120 },
            { html: 'Velmi vysoko (160px)', value: 160, default: subBottomOffset === 160 },
          ],
          onSelect: function (item: { value?: number; html?: string }) {
            if (typeof item.value === 'number') {
              handleSubBottomOffsetChange(item.value);
            }
            return item.html || '';
          },
        },
      ],
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, artInstance: Artplayer) {
          const artHlsHolder = artInstance as unknown as { hls?: Hls };
          if (Hls.isSupported()) {
            if (artHlsHolder.hls) artHlsHolder.hls.destroy();
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            artHlsHolder.hls = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (hls.audioTracks && hls.audioTracks.length > 0) {
                const tracks: AudioTrackItem[] = hls.audioTracks.map((t, idx) => ({
                  id: idx,
                  label: t.name || (t.lang ? t.lang.toUpperCase() : `Audio Track ${idx + 1}`),
                  lang: t.lang || ''
                }));
                setAudioTracksList(tracks);
                setActiveAudioTrack(hls.audioTrack);
              }
            });

            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
              setActiveAudioTrack(data.id);
            });

            artInstance.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          } else {
            artInstance.notice.show = 'Unsupported HLS stream on this browser';
          }
        },
      },
      controls: [
        {
          name: 'subtitles-selector',
          position: 'right',
          html: '<span style="font-size: 1.15rem; cursor: pointer; display: flex; align-items: center;" title="Titulky (C)">💬</span>',
          tooltip: t('player.subtitles') || 'Titulky',
          selector: [
            {
              html: t('player.subtitles_off') || 'Vypnuto',
              value: 'off',
              default: !activeSubUrl,
            },
            ...subtitlesList.map(s => ({
              html: s.label,
              value: s.url,
              default: s.url === activeSubUrl,
            })),
            {
              html: `📁 ${t('player.upload_subtitles') || 'Nahrát vlastní (.srt / .vtt)'}`,
              value: '__upload__',
            }
          ],
          onSelect: function (this: Artplayer, selector: { value?: string | number; html: string | HTMLElement }) {
            const val = String(selector.value);
            if (val === '__upload__') {
              fileInputRef.current?.click();
            } else {
              switchSubtitle(val === 'off' ? null : val);
            }
          },
        },
        {
          name: 'stream-switcher',
          position: 'right',
          html: '<span style="font-size: 1.1rem; cursor: pointer;" title="Zdroje videa (S)">📑</span>',
          tooltip: t('player.stream_switcher'),
          click: function () {
            setDrawerOpen(prev => !prev);
          },
        },
      ],
    });

    artInstanceRef.current = art;

    art.on('error', (error: unknown) => {
      console.warn('Artplayer playback error:', error);
      setPlaybackError(t('player.error_unsupported_desc') || 'Tento proud videa nebo zvukový kodek (AC3/DTS/HEVC) vyžaduje externí přehrávač s hardwarovými kodeky.');
    });

    return () => {
      if (art && art.destroy) {
        art.destroy(false);
      }
      artInstanceRef.current = null;
    };
  }, [activeUrl, activeTitle, activeSubUrl, subtitlesList, isP2P, subFontSize, subBottomOffset, switchSubtitle, handleSubFontSizeChange, handleSubBottomOffsetChange, t]);

  // Filter sources for drawer by dubbing language
  const filteredDrawerSources = useMemo(() => {
    if (drawerDubbingFilter === 'all') return availableSources;
    return availableSources.filter(s => {
      const text = `${s.title || ''} ${s.name || ''} ${s.subProvider || ''}`;
      return detectStreamDubbing(text) === drawerDubbingFilter;
    });
  }, [availableSources, drawerDubbingFilter]);

  if (typeof window === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* ─── TOP CONTROL BAR ─── */}
      <header
        style={{
          padding: '0.6rem 1.25rem',
          backgroundColor: 'rgba(10, 12, 18, 0.95)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 50,
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <span style={{ fontSize: '1.25rem' }}>🎬</span>
          <h2
            style={{
              margin: 0,
              color: '#fff',
              fontSize: '1.05rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '420px',
            }}
            title={activeTitle}
          >
            {activeTitle || 'BrowseIO Player'}
          </h2>

          {/* Probed Container & Video Codec Badge */}
          {probedMedia?.video?.[0] && (
            <span
              style={{
                fontSize: '0.725rem',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#93c5fd',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {probedMedia.video[0].resolution || probedMedia.video[0].codec}
            </span>
          )}
        </div>

        {/* Audio Codec Warning Indicator */}
        {audioAnalysis.isUnsupported && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '20px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{audioAnalysis.warning}</span>
          </div>
        )}

        {/* Action Controls & External Players */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Quick Stream Switcher Toggle */}
          {availableSources.length > 0 && (
            <button
              type="button"
              onClick={() => setDrawerOpen(prev => !prev)}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.75rem',
                backgroundColor: drawerOpen ? 'var(--accent-color, #3b82f6)' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                borderColor: drawerOpen ? 'var(--accent-color, #3b82f6)' : 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: 600,
              }}
              title="Otevřít seznam dalších streamů (Klávesa S)"
            >
              <span>📑 {t('player.stream_switcher')}</span>
              <span style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.75rem' }}>
                {availableSources.length}
              </span>
            </button>
          )}

          {/* External Players: PotPlayer, VLC, MPV, Infuse */}
          <button
            type="button"
            onClick={() => handleLaunchExternalPlayer('potplayer')}
            title={`${t('player.launch_in')} PotPlayer`}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              cursor: 'pointer',
            }}
          >
            🟣 PotPlayer
          </button>
          <button
            type="button"
            onClick={() => handleLaunchExternalPlayer('vlc')}
            title={`${t('player.launch_in')} VLC`}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(249, 115, 22, 0.2)',
              color: '#fdba74',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              cursor: 'pointer',
            }}
          >
            🟠 VLC
          </button>
          <button
            type="button"
            onClick={() => handleLaunchExternalPlayer('mpv')}
            title={`${t('player.launch_in')} MPV`}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              cursor: 'pointer',
            }}
          >
            🔴 MPV
          </button>
          <button
            type="button"
            onClick={() => handleLaunchExternalPlayer('infuse')}
            title={`${t('player.launch_in')} Infuse`}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(14, 165, 233, 0.2)',
              color: '#7dd3fc',
              border: '1px solid rgba(14, 165, 233, 0.35)',
              cursor: 'pointer',
            }}
          >
            🔵 Infuse
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: '0.85rem',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                marginLeft: '0.4rem',
              }}
              title="Zavřít přehrávač (ESC)"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* ─── MAIN VIEWPORT AREA ─── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 55px)', overflow: 'hidden' }}>
        {/* Error Fallback View */}
        {hasError ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#0a0d14',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 style={{ color: '#fff', fontSize: '1.4rem', marginBottom: '0.75rem' }}>
              {t('player.error_unsupported_title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '580px', marginBottom: '2rem', lineHeight: 1.6 }}>
              {errorMessage || t('player.error_unsupported_desc')}
            </p>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem' }}>
              <button
                type="button"
                onClick={() => handleLaunchExternalPlayer('potplayer')}
                className="btn btn-primary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
              >
                {t('player.launch_potplayer')}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchExternalPlayer('vlc')}
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
              >
                {t('player.launch_vlc')}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchExternalPlayer('mpv')}
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
              >
                {t('player.launch_mpv')}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchExternalPlayer('infuse')}
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
              >
                {t('player.launch_infuse')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
              >
                {copiedLink ? t('player.copied_link') : t('player.copy_direct_link')}
              </button>
              {availableSources.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="btn btn-primary"
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}
                >
                  {t('player.try_other_stream')} ({availableSources.length})
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Artplayer Video Container */
          <div ref={artContainerRef} style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
        )}

        {/* Hidden File Input for Custom Subtitle Upload from Player Controls (Always Mounted) */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".srt,.vtt"
          onChange={handleCustomSubtitleUpload}
          style={{ display: 'none' }}
        />

        {/* ─── STREAM SWITCHER & MEDIA CONTROLS DRAWER OVERLAY ─── */}
        {drawerOpen && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '400px',
              maxWidth: '92vw',
              height: '100%',
              backgroundColor: 'rgba(15, 18, 26, 0.96)',
              backdropFilter: 'blur(18px)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.7)',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '1.1rem 1.25rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>
                  📑 {t('player.stream_switcher_title')}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {filteredDrawerSources.length} {t('streams.streams_found')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Subtitle & Audio Track Quick Settings Bar */}
            <div
              style={{
                padding: '0.9rem 1.25rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {/* Audio Track Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>🔊 {t('player.audio_tracks')}:</span>
                  <select
                    value={activeAudioTrack}
                    onChange={(e) => handleAudioTrackChange(parseInt(e.target.value, 10))}
                    className="input"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.25rem 0.5rem',
                      width: 'auto',
                      maxWidth: '200px',
                      borderRadius: '6px',
                    }}
                  >
                    {audioTracksList.length === 0 ? (
                      <option value={0}>{t('player.audio_track_default')}</option>
                    ) : (
                      audioTracksList.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Helpful Container Multi-Audio Notice */}
                {probedMedia?.hasMultiAudio && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#bfdbfe',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      lineHeight: 1.4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                  >
                    <div>
                      {t('player.multi_audio_note')}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleLaunchExternalPlayer('potplayer')}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.3)', color: '#fff', border: '1px solid rgba(99, 102, 241, 0.5)', cursor: 'pointer' }}
                      >
                        🟣 PotPlayer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLaunchExternalPlayer('vlc')}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(249, 115, 22, 0.3)', color: '#fff', border: '1px solid rgba(249, 115, 22, 0.5)', cursor: 'pointer' }}
                      >
                        🟠 VLC
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLaunchExternalPlayer('infuse')}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(14, 165, 233, 0.3)', color: '#fff', border: '1px solid rgba(14, 165, 233, 0.5)', cursor: 'pointer' }}
                      >
                        🔵 Infuse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Dubbing Language Filter Tabs for Stream List */}
            <div
              style={{
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                gap: '0.35rem',
                overflowX: 'auto',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
              }}
            >
              {(
                [
                  { id: 'all', label: t('player.dubbing_all') },
                  { id: 'cz', label: t('player.dubbing_cz') },
                  { id: 'sk', label: t('player.dubbing_sk') },
                  { id: 'en', label: t('player.dubbing_en') },
                  { id: 'dual', label: t('player.dubbing_dual') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerDubbingFilter(tab.id)}
                  style={{
                    fontSize: '0.725rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    border: 'none',
                    backgroundColor: drawerDubbingFilter === tab.id ? 'var(--accent-color, #3b82f6)' : 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    fontWeight: drawerDubbingFilter === tab.id ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Stream List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {isSwitchingStream && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-color)' }}>{t('player.switching_stream')}</span>
                </div>
              )}

              {filteredDrawerSources.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {t('player.no_other_streams')}
                </div>
              ) : (
                filteredDrawerSources.map((source, idx) => {
                  const isPlayingThis = (currentSource && currentSource.url === source.url) || activeUrl === source.url;
                  const titleStr = source.title || source.name || `Zdroj #${idx + 1}`;
                  const isDebrid = source.isTorBoxCached || source.type === 'debrid';
                  const dubbing = detectStreamDubbing(`${source.title || ''} ${source.name || ''} ${source.subProvider || ''}`);

                  return (
                    <div
                      key={idx}
                      onClick={() => !isPlayingThis && handleSwitchStream(source)}
                      style={{
                        padding: '0.75rem',
                        marginBottom: '0.5rem',
                        borderRadius: '8px',
                        backgroundColor: isPlayingThis ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: isPlayingThis ? '1px solid var(--accent-color, #3b82f6)' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: isPlayingThis ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isPlayingThis) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isPlayingThis) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: isPlayingThis ? '#60a5fa' : '#fff',
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                          }}
                        >
                          {titleStr}
                        </span>
                        {isPlayingThis && (
                          <span style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                            {t('player.playing_current')}
                          </span>
                        )}
                      </div>

                      {/* Meta Tags: Dubbing / Provider / Size / Seeds */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.75rem' }}>
                        {/* Dubbing Badge */}
                        {dubbing === 'cz' && (
                          <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.25)', color: '#93c5fd', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            🇨🇿 CZ
                          </span>
                        )}
                        {dubbing === 'sk' && (
                          <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', color: '#fcd34d', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            🇸🇰 SK
                          </span>
                        )}
                        {dubbing === 'dual' && (
                          <span style={{ backgroundColor: 'rgba(168, 85, 247, 0.25)', color: '#d8b4fe', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            🌐 Dual
                          </span>
                        )}

                        {source.pluginName && (
                          <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#cbd5e1' }}>
                            {source.pluginName}
                          </span>
                        )}
                        {isDebrid && (
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            ⚡ Instant Debrid
                          </span>
                        )}
                        {source.size && source.size !== 'Unknown' && (
                          <span style={{ color: 'var(--text-secondary)' }}>💾 {source.size}</span>
                        )}
                        {typeof source.seeders === 'number' && source.seeders > 0 && (
                          <span style={{ color: '#34d399' }}>👤 {source.seeders}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer with Shortcuts Help */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              {t('player.shortcuts_hint')}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VideoPlayerModal;
