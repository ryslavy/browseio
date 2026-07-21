import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'BrowseIO - Stream Player',
  description: 'Stream torrents and media directly using Cinemeta, Torrentio and SKTorrent',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header className="glass-navbar" style={{ margin: '1rem', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: '1rem', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <Link href="/" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.05em' }}>
              <span style={{ color: 'var(--accent-color)' }}>Browse</span>IO
            </Link>
            <nav style={{ display: 'flex', gap: '1rem' }}>
              <Link href="/" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Domů</Link>
            </nav>
          </div>
          <div>
            <Link href="/settings" className="btn btn-secondary">
              Nastavení ⚙️
            </Link>
          </div>
        </header>

        <main className="container" style={{ padding: '2rem 1.5rem', flex: 1 }}>
          {children}
        </main>

        <footer style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          <p>© 2026 BrowseIO. Využívá Cinemeta, Torrentio, SKTorrent a Hellspy.</p>
        </footer>
      </body>
    </html>
  );
}
