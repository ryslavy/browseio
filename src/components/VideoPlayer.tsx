'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
  AudioCodecTag,
} from '../lib/video-player-helpers';

export {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
};

export interface VideoPlayerProps {
  options?: any;
  src?: string;
  title?: string;
  onClose?: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerProps> = ({ options, src: propSrc, title: propTitle, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const src = propSrc || (options && options.sources && options.sources[0]?.src ? options.sources[0].src : '');
  const title = propTitle || (options && (options.title || options.filename || options.sources?.[0]?.title)) || '';

  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [, setRetryCount] = useState(0);

  // Audio Codec Analysis
  const audioAnalysis = useMemo(() => {
    const combinedText = [title, src].filter(Boolean).join(' ');
    const codecs = detectAudioCodecs(combinedText);
    const isUnsupported = codecs.length > 0;
    const warning = getAudioCodecWarning(combinedText);
    return { codecs, isUnsupported, warning };
  }, [title, src]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (src && (src.startsWith('magnet:') || src.toLowerCase().endsWith('.torrent'))) {
      setHasError(true);
      setErrorMessage('Nativní webový přehrávač nepodporuje přímé přehrávání P2P torrentů. Nejprve je nutné odkaz nacachovat na Debrid (např. TorBox).');
    }
  }, [src]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const err = (e.target as HTMLVideoElement).error;
    let msg = 'Chyba při načítání nebo přehrávání videa.';
    if (err) {
      switch (err.code) {
        case err.MEDIA_ERR_ABORTED:
          msg = 'Přehrávání bylo přerušeno uživatelem.';
          break;
        case err.MEDIA_ERR_NETWORK:
          msg = 'Chyba sítě při stahování videa.';
          break;
        case err.MEDIA_ERR_DECODE:
          msg = 'Video nelze dekódovat (nepodporovaný kodek videa nebo zvuku).';
          break;
        case err.MEDIA_ERR_SRC_NOT_SUPPORTED:
          msg = 'Formát videa nebo zvukový kodek (AC3/DTS/TrueHD) není podporován tímto prohlížečem.';
          break;
        default:
          msg = err.message || 'Neznámá chyba přehrávače.';
      }
    }
    setHasError(true);
    setErrorMessage(msg);
  };

  const handleRetry = () => {
    setHasError(false);
    setErrorMessage('');
    setRetryCount((prev) => prev + 1);
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const handleOpenNewTab = () => {
    if (src) {
      window.open(src, '_blank');
    }
  };

  const handleLaunchExternalPlayer = (player: 'potplayer' | 'vlc' | 'mpv' | 'infuse') => {
    if (!src) return;
    const playerUrl = generateExternalPlayerUrl(player, src);
    window.location.href = playerUrl;
  };

  if (typeof window === 'undefined' || !document.body) return null;

  const content = (
    <div
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
      }}
    >
      {/* Header Controls Bar */}
      <div
        style={{
          padding: '0.75rem 1.25rem',
          backgroundColor: 'rgba(15, 17, 23, 0.95)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10,
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🎬</span>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>
            {title || 'Přehrávač videa'}
          </h3>
        </div>

        {/* Audio Codec Warning Indicator */}
        {audioAnalysis.isUnsupported && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '20px',
              padding: '0.35rem 0.85rem',
              fontSize: '0.825rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{audioAnalysis.warning}</span>
          </div>
        )}

        {/* External Player Direct Fallback Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleLaunchExternalPlayer('potplayer')}
            title="Otevřít v PotPlayeru"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(99, 102, 241, 0.25)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            🟣 PotPlayer
          </button>
          <button
            onClick={() => handleLaunchExternalPlayer('vlc')}
            title="Otevřít ve VLC"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(249, 115, 22, 0.25)',
              color: '#fdba74',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            🟠 VLC
          </button>
          <button
            onClick={() => handleLaunchExternalPlayer('mpv')}
            title="Otevřít v MPV"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.25)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            🔴 MPV
          </button>
          <button
            onClick={() => handleLaunchExternalPlayer('infuse')}
            title="Otevřít v Infuse"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              backgroundColor: 'rgba(14, 165, 233, 0.25)',
              color: '#7dd3fc',
              border: '1px solid rgba(14, 165, 233, 0.4)',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            🔵 Infuse
          </button>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                fontSize: '0.85rem',
                padding: '0.4rem 0.9rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                marginLeft: '0.5rem',
                transition: 'background-color 0.2s',
              }}
            >
              ✕ Zavřít (ESC)
            </button>
          )}
        </div>
      </div>

      {/* Main Video Viewport & Fallback Overlay */}
      <div
        style={{
          flex: 1,
          width: '100%',
          height: 'calc(100vh - 60px)',
          backgroundColor: '#000',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasError ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2.5rem',
              maxWidth: '650px',
              backgroundColor: 'rgba(24, 24, 27, 0.95)',
              borderRadius: '16px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
              margin: '1rem',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 style={{ color: '#ef4444', fontSize: '1.4rem', marginTop: 0, marginBottom: '0.5rem' }}>
              Chyba přehrávání videa
            </h3>
            <p style={{ color: '#d1d5db', fontSize: '0.95rem', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              {errorMessage}
            </p>

            {audioAnalysis.isUnsupported && (
              <div
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                {audioAnalysis.warning}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={handleRetry}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                🔄 Zkusit znovu
              </button>

              <button
                onClick={handleOpenNewTab}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#374151',
                  color: '#f3f4f6',
                  border: '1px solid #4b5563',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                🌐 Otevřít v novém okně
              </button>
            </div>

            <div style={{ marginTop: '1.75rem', width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem', fontWeight: 600 }}>
                Spustit v externím přehrávači:
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleLaunchExternalPlayer('potplayer')}
                  style={{
                    padding: '0.5rem 0.9rem',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🟣 PotPlayer
                </button>
                <button
                  onClick={() => handleLaunchExternalPlayer('vlc')}
                  style={{
                    padding: '0.5rem 0.9rem',
                    backgroundColor: 'rgba(249, 115, 22, 0.2)',
                    color: '#fdba74',
                    border: '1px solid rgba(249, 115, 22, 0.4)',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🟠 VLC
                </button>
                <button
                  onClick={() => handleLaunchExternalPlayer('mpv')}
                  style={{
                    padding: '0.5rem 0.9rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔴 MPV
                </button>
                <button
                  onClick={() => handleLaunchExternalPlayer('infuse')}
                  style={{
                    padding: '0.5rem 0.9rem',
                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                    color: '#7dd3fc',
                    border: '1px solid rgba(14, 165, 233, 0.4)',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔵 Infuse
                </button>
              </div>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            controls
            autoPlay
            playsInline
            onError={handleVideoError}
            style={{
              width: '100%',
              height: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              backgroundColor: '#000',
            }}
          />
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default VideoPlayerModal;
