'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface VideoPlayerProps {
  options?: any;
  src?: string;
  title?: string;
  onClose?: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerProps> = ({ options, src: propSrc, title, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const src = propSrc || (options && options.sources && options.sources[0]?.src ? options.sources[0].src : '');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
          padding: '0.85rem 1.5rem',
          backgroundColor: 'rgba(15, 17, 23, 0.95)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🎬</span>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.15rem', fontWeight: 700 }}>
            {title || 'Přehrávač videa'}
          </h3>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              fontSize: '0.875rem',
              padding: '0.45rem 1.1rem',
              borderRadius: '9999px',
              backgroundColor: 'rgba(239, 68, 68, 0.85)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 0.2s'
            }}
          >
            ✕ Zavřít (ESC)
          </button>
        )}
      </div>

      {/* Main Fullscreen Video Viewport */}
      <div style={{ flex: 1, width: '100%', height: 'calc(100vh - 60px)', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
          }}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default VideoPlayerModal;
