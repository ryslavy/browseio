'use client';

import { useState, useEffect } from 'react';
import { getInstalledPlugins, savePlugins, installPluginFromUrl, PluginManifest } from '@/lib/plugin-engine';

export default function SettingsPage() {
  const [torboxKey, setTorboxKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('torbox_api_key') || '' : ''));
  const [corsProxy, setCorsProxy] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') || '' : ''));
  const [saved, setSaved] = useState(false);

  // Plugins State
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [newPluginUrl, setNewPluginUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

  useEffect(() => {
    setPlugins(getInstalledPlugins());
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('torbox_api_key', torboxKey);
    localStorage.setItem('custom_cors_proxy', corsProxy);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleInstallPlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPluginUrl.trim()) return;

    setInstalling(true);
    setPluginError(null);

    try {
      await installPluginFromUrl(newPluginUrl.trim());
      setPlugins(getInstalledPlugins());
      setNewPluginUrl('');
    } catch (err: any) {
      setPluginError(err.message || 'Nepodařilo se nainstalovat doplněk.');
    } finally {
      setInstalling(false);
    }
  };

  const handleTogglePlugin = (id: string) => {
    const updated = plugins.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p);
    setPlugins(updated);
    savePlugins(updated);
  };

  const handleRemovePlugin = (id: string) => {
    const updated = plugins.filter(p => p.id !== id);
    setPlugins(updated);
    savePlugins(updated);
  };

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Nastavení BrowseIO</h1>
      
      {saved && (
        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #10b981' }}>
          Nastavení bylo úspěšně uloženo!
        </div>
      )}

      {/* 1. Addons & Plugins Section */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🧩 Doplňky a Scrapery (Stremio & Nuvio Compatible)
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Vložte URL adresu jakéhokoliv <strong>Stremio Addonu</strong> (např. <code>stremio://...</code> nebo <code>https://.../manifest.json</code>) nebo <strong>Nuvio Pluginu</strong>. Aplikace si ho automaticky přidá a načte streamy.
        </p>

        <form onSubmit={handleInstallPlugin} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input 
            type="text" 
            value={newPluginUrl} 
            onChange={(e) => setNewPluginUrl(e.target.value)} 
            placeholder="stremio://... nebo https://.../manifest.json"
            className="input"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={installing} className="btn btn-primary" style={{ minWidth: '130px' }}>
            {installing ? 'Instaluji...' : '➕ Přidat doplněk'}
          </button>
        </form>

        {pluginError && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {pluginError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nainstalované doplňky ({plugins.length})</h4>
          {plugins.length === 0 ? (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
              Zatím nemáte nainstalované žádné doplňky. Přidejte doplněk výše!
            </div>
          ) : (
            plugins.map(p => (
              <div 
                key={p.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '0.75rem 1rem', 
                  backgroundColor: 'rgba(255,255,255,0.03)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>v{p.version || '1.0'}</span></div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.description || p.manifestUrl}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button 
                    onClick={() => handleTogglePlugin(p.id)}
                    className="btn"
                    style={{ 
                      fontSize: '0.8rem', 
                      padding: '0.3rem 0.6rem',
                      backgroundColor: p.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                      color: p.enabled ? '#10b981' : 'var(--text-secondary)'
                    }}
                  >
                    {p.enabled ? 'Aktivní' : 'Vypnuto'}
                  </button>
                  
                  <button 
                    onClick={() => handleRemovePlugin(p.id)}
                    className="btn"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                  >
                    Smazat
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Proxy & TorBox Integration */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--accent-color)' }}>
          ⚡ Vlastní CORS Proxy a TorBox Klíč
        </h3>
        
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
              Vlastní CORS Proxy URL (volitelné)
            </label>
            <input 
              type="text" 
              value={corsProxy} 
              onChange={(e) => setCorsProxy(e.target.value)} 
              placeholder="např. https://moje-proxy.workers.dev/?"
              className="input"
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Umožňuje obcházet blokování klientských scraperů v prohlížeči. Zadejte URL vašeho Cloudflare Workeru nebo lokálního proxy serveru.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
              TorBox API Klíč (Debrid)
            </label>
            <input 
              type="password" 
              value={torboxKey} 
              onChange={(e) => setTorboxKey(e.target.value)} 
              placeholder="Vložte váš TorBox API Key..."
              className="input"
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Pokud zadejte API klíč pro TorBox, aplikace bude automaticky ověřovat a oznamovat, které torrent streamy jsou již kešky (instant play).
            </p>
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            💾 Uložit nastavení
          </button>
        </form>
      </div>
    </div>
  );
}
