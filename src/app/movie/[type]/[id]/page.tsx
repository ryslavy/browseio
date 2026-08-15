import { Suspense } from 'react';
import MovieDetailsClient from '@/components/MovieDetailsClient';

export async function generateStaticParams() {
  return [
    { type: 'movie', id: 'placeholder' },
    { type: 'series', id: 'placeholder' },
  ];
}

export default function MoviePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>}>
      <MovieDetailsClient />
    </Suspense>
  );
}
