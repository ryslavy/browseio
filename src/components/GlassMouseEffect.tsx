'use client';

import { useEffect } from 'react';

export default function GlassMouseEffect() {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('.glass-panel, .glass-navbar, .btn, .glass-pill') as HTMLElement;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      target.style.setProperty('--mouse-x', `${x}px`);
      target.style.setProperty('--mouse-y', `${y}px`);

      // Dynamic light refraction specular offset
      const relX = (x / rect.width - 0.5) * 2;
      const relY = (y / rect.height - 0.5) * 2;
      target.style.setProperty('--light-x', `${relX * -5}px`);
      target.style.setProperty('--light-y', `${relY * -5}px`);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return null;
}
