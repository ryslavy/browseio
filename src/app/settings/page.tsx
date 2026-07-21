'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [torboxKey, setTorboxKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('torbox_api_key') || '' : ''));
  const [sktUser, setSktUser] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('sktorrent_uid') || '' : ''));
  const [sktPass, setSktPass] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('sktorrent_pass') || '' : ''));
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('torbox_api_key', torboxKey);
    localStorage.setItem('sktorrent_uid', sktUser);
    localStorage.setItem('sktorrent_pass', sktPass);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Nastavení BrowseIO</h1>
      
      {saved && (
        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #10b981' }}>
          Nastavení bylo úspěšně uloženo!
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#eab308' }}>⚡ TorBox Debrid Integration</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Zadejte váš API klíč z TorBox.app pro bleskové přehrávání cached torrentů bez čekání na seedery.
          </p>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>TorBox API Key</label>
            <input 
              type="password" 
              value={torboxKey} 
              onChange={(e) => setTorboxKey(e.target.value)} 
              placeholder="Vložte váš TorBox API Token"
              className="input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#3b82f6' }}>🇸🇰 SkTorrent Přihlášení</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Pro vyhledávání v cz/sk torrent databázi SkTorrent zadejte vaše UID a Heslo/Pass z cookies.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>SkTorrent UID</label>
              <input 
                type="text" 
                value={sktUser} 
                onChange={(e) => setSktUser(e.target.value)} 
                placeholder="např. 123456"
                className="input"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>SkTorrent Password Hash</label>
              <input 
                type="password" 
                value={sktPass} 
                onChange={(e) => setSktPass(e.target.value)} 
                placeholder="Heslo nebo md5 pass hash"
                className="input"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>



        <button type="submit" className="btn btn-primary" style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Uložit nastavení
        </button>
      </form>
    </div>
  );
}
