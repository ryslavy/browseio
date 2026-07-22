'use client';

import { useState, useEffect } from 'react';
import { getInstalledPlugins, savePlugins, installPluginFromUrl, PluginManifest } from '@/lib/plugin-engine';

export default function SettingsPage() {
  const [torboxKey, setTorboxKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('torbox_api_key') || '' : ''));
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
          {plugins.map(p => (
            <div 
              key={p.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                gap: '1rem'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <strong style={{ fontSize: '1rem' }}>{p.name}</strong>
                  <span style={{ fontSize: '0.75rem', backgroundColor: p.type === 'nuvio' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: p.type === 'nuvio' ? '#c084fc' : '#60a5fa', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                    {p.type === 'nuvio' ? 'Nuvio Plugin' : 'Stremio Addon'}
                  </span>
                  {p.isBuiltIn && (
                    <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                      Vestavěný
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.description || p.manifestUrl}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button 
                  type="button" 
                  onClick={() => handleTogglePlugin(p.id)} 
                  className={`glass-pill ${p.enabled ? 'active' : ''}`}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                >
                  {p.enabled ? 'Povoleno' : 'Vypnuto'}
                </button>
                {!p.isBuiltIn && (
                  <button 
                    type="button" 
                    onClick={() => handleRemovePlugin(p.id)} 
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'var(--danger-color)' }}
                    title="Odebrat doplněk"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

        <button type="submit" className="btn btn-primary" style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Uložit nastavení
        </button>
      </form>
    </div>
  );
}
