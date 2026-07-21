'use client';

import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export interface VideoPlayerProps {
  options: any;
  onReady?: (player: any) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ options, onReady }) => {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement("video");
      videoElement.setAttribute('controls', 'true');
      videoElement.classList.add('video-js');
      videoElement.classList.add('vjs-big-play-centered');
      videoElement.classList.add('vjs-premium-theme');
      videoRef.current.appendChild(videoElement);

      const player = playerRef.current = videojs(videoElement, options, () => {
        videojs.log('player is ready');
        if (onReady) onReady(player);
      });
    } else if (playerRef.current) {
      const player = playerRef.current;
      player.autoplay(options.autoplay);
      player.src(options.sources);
    }
  }, [options, videoRef]);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={videoRef} style={{ width: '100%', height: '100%' }} />
      
      <style dangerouslySetInnerHTML={{__html: `
        .vjs-premium-theme {
          width: 100% !important;
          height: 100% !important;
          font-family: 'Inter', sans-serif;
        }
        
        .vjs-premium-theme .vjs-big-play-button {
          background-color: rgba(229, 9, 20, 0.9);
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
          background-color: rgb(229, 9, 20);
          transform: scale(1.1);
        }
        
        .vjs-premium-theme .vjs-control-bar {
          background-color: rgba(0, 0, 0, 0.75);
          height: 50px;
          backdrop-filter: blur(10px);
        }
        
        .vjs-premium-theme .vjs-play-progress {
          background-color: rgb(229, 9, 20);
        }
        
        .vjs-premium-theme .vjs-volume-level {
          background-color: rgb(229, 9, 20);
        }
        
        .vjs-premium-theme .vjs-slider {
          background-color: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
};

export default VideoPlayer;
