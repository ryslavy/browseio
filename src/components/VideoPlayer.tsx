'use client';

import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export interface VideoPlayerProps {
  options: {
    autoplay?: boolean;
    controls?: boolean;
    responsive?: boolean;
    fluid?: boolean;
    fill?: boolean;
    playbackRates?: number[];
    sources: { src: string; type?: string }[];
    [key: string]: any;
  };
  onReady?: (player: any) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ options, onReady }) => {
  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<any>(null);
  const [hasError, setHasError] = useState(false);

  const srcUrl = options.sources && options.sources[0]?.src ? options.sources[0].src : '';

  useEffect(() => {
    if (!srcUrl || !videoNodeRef.current) return;

    setHasError(false);

    const isHls = srcUrl.includes('.m3u8');
    const sourceType = options.sources[0]?.type || (isHls ? 'application/x-mpegURL' : undefined);

    const sources = sourceType ? [{ src: srcUrl, type: sourceType }] : [{ src: srcUrl }];

    if (!playerRef.current) {
      const element = videoNodeRef.current;
      try {
        const player = playerRef.current = videojs(element, {
          controls: true,
          autoplay: true,
          preload: 'auto',
          responsive: true,
          fluid: true,
          ...options,
          sources: sources,
        }, () => {
          if (onReady) onReady(player);
        });

        player.on('error', () => {
          console.warn('Video.js error, falling back to native HTML5 video player');
          setHasError(true);
        });
      } catch (err) {
        console.error('Failed to initialize Video.js:', err);
        setHasError(true);
      }
    } else {
      const player = playerRef.current;
      player.src(sources);
      if (options.autoplay) {
        player.play().catch(() => {});
      }
    }
  }, [srcUrl]);

  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        try {
          playerRef.current.dispose();
        } catch (e) {
          // Ignore disposal errors on unmount
        }
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {hasError ? (
        <video
          src={srcUrl}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain', backgroundColor: '#000' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%' }}>
          <video ref={videoNodeRef} className="video-js vjs-big-play-centered vjs-premium-theme" playsInline />
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .vjs-premium-theme {
          width: 100% !important;
          height: 100% !important;
          font-family: 'Inter', sans-serif;
          font-size: 16px !important;
        }
        
        .vjs-premium-theme .vjs-big-play-button {
          background-color: rgba(59, 130, 246, 0.9);
          border: none;
          border-radius: 50%;
          width: 80px;
          height: 80px;
          line-height: 80px;
          margin-top: -40px;
          margin-left: -40px;
          transition: all 0.3s ease;
        }
        
        .vjs-premium-theme:hover .vjs-big-play-button {
          background-color: rgb(59, 130, 246);
          transform: scale(1.1);
        }
        
        .vjs-premium-theme .vjs-control-bar {
          background-color: rgba(0, 0, 0, 0.75);
          height: 50px;
          backdrop-filter: blur(10px);
        }
        
        .vjs-premium-theme .vjs-play-progress {
          background-color: rgb(59, 130, 246);
        }
        
        .vjs-premium-theme .vjs-volume-level {
          background-color: rgb(59, 130, 246);
        }
        
        .vjs-premium-theme .vjs-slider {
          background-color: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
};

export default VideoPlayer;
