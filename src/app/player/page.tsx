'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false });

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlParam = searchParams?.get('url');
  const titleParam = searchParams?.get('title');
  const nameParam = searchParams?.get('name');
  
  const movieTitle = titleParam ? decodeURIComponent(titleParam) : (nameParam ? decodeURIComponent(nameParam) : '');

  return (
    <VideoPlayer 
      src={urlParam || ''} 
      title={movieTitle} 
      onClose={() => router.back()} 
    />
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>}>
      <PlayerContent />
    </Suspense>
  );
}
