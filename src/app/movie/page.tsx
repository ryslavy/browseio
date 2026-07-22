'use client';

import { Suspense } from 'react';
import MovieDetailsClient from '@/components/MovieDetailsClient';

function MoviePageContent() {
  return <MovieDetailsClient />;
}

export default function MoviePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>}>
      <MoviePageContent />
    </Suspense>
  );
}
