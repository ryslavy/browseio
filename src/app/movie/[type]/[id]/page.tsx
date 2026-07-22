import MovieDetailsClient from '@/components/MovieDetailsClient';

export async function generateStaticParams() {
  return [
    { type: 'movie', id: 'placeholder' },
    { type: 'series', id: 'placeholder' },
  ];
}

export default function MoviePage() {
  return <MovieDetailsClient />;
}
