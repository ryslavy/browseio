import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import GlassMouseEffect from '@/components/GlassMouseEffect';
import Navbar from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'BrowseIO - Stream Player',
  description: 'Vyhledávejte a přehrávejte filmy a seriály pomocí doplňků.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={inter.variable}>
      <body>
        <GlassMouseEffect />
        <Navbar />

        <main className="container" style={{ padding: '2rem 1.5rem', flex: 1 }}>
          {children}
        </main>

        <footer style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        </footer>
      </body>
    </html>
  );
}
