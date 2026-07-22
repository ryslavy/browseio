'use client';

import { useState, useEffect } from 'react';
import { getInstalledPlugins, savePlugins, installPluginFromUrl, PluginManifest } from '@/lib/plugin-engine';
import { t, getCurrentLanguage, setCurrentLanguage, getAvailableLanguages, getCustomTranslations, saveCustomTranslations } from '@/lib/i18n';

export default function SettingsPage() {
  const [torboxKey, setTorboxKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('torbox_api_key') || '' : ''));
  const [corsProxy, setCorsProxy] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') || '' : ''));
  const [saved, setSaved] = useState(false);

  // Plugins State
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [newPluginUrl, setNewPluginUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

  // Language State
  const [language, setLanguage] = useState(() => getCurrentLanguage());
  const [customTranslationsJson, setCustomTranslationsJson] = useState(() => {
    const ct = getCustomTranslations();
    return Object.keys(ct).length > 0 ? JSON.stringify(ct, null, 2) : '';
  });
  const [translationError, setTranslationError] = useState<string | null>(null);

  useEffect(() => {
    setPlugins(getInstalledPlugins());
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('torbox_api_key', torboxKey);
    localStorage.setItem('custom_cors_proxy', corsProxy);

    // Save language
    setCurrentLanguage(language);

    // Save custom translations
    if (customTranslationsJson.trim()) {
      try {
        const parsed = JSON.parse(customTranslationsJson.trim());
        saveCustomTranslations(parsed);
        setTranslationError(null);
      } catch {
        setTranslationError('Neplatný JSON formát překladů.');
      }
    } else {
      saveCustomTranslations({});
      setTranslationError(null);
    }

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
      setPluginError(err.message || t('settings.install_error'));
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

  const availableLanguages = getAvailableLanguages();

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>{t('settings.title')}</h1>
      
      {saved && (
        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #10b981' }}>
          {t('settings.saved')}
        </div>
      )}

      {/* 1. Addons & Plugins Section */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🧩 {t('settings.plugins_title')}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          {t('settings.plugins_desc')}
        </p>

        <form onSubmit={handleInstallPlugin} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input 
            type="text" 
            value={newPluginUrl} 
            onChange={(e) => setNewPluginUrl(e.target.value)} 
            placeholder={t('settings.plugin_url_placeholder')}
            className="input"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={installing} className="btn btn-primary" style={{ minWidth: '130px' }}>
            {installing ? t('settings.installing') : `➕ ${t('settings.add_plugin')}`}
          </button>
        </form>

        {pluginError && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {pluginError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('settings.installed_plugins')} ({plugins.length})</h4>
          {plugins.length === 0 ? (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
              {t('settings.no_plugins')}
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
                    {p.enabled ? t('settings.active') : t('settings.disabled')}
                  </button>
                  
                  <button 
                    onClick={() => handleRemovePlugin(p.id)}
                    className="btn"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                  >
                    {t('settings.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Language & Translations */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--accent-color)' }}>
          🌍 {t('settings.language_title')}
        </h3>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
            {t('settings.language_label')}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {availableLanguages.map(lang => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={`btn ${language === lang.code ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
            {t('settings.custom_translations_label')}
          </label>
          <textarea
            value={customTranslationsJson}
            onChange={(e) => setCustomTranslationsJson(e.target.value)}
            placeholder='{ "nav.home": "Hlavní stránka", "catalog.movies": "Filmy" }'
            className="input"
            style={{ width: '100%', minHeight: '100px', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {t('settings.custom_translations_hint')}
          </p>
          {translationError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {translationError}
            </div>
          )}
        </div>
      </div>

      {/* 3. Proxy & TorBox Integration */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--accent-color)' }}>
          ⚡ {t('settings.cors_proxy_title')}
        </h3>
        
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
              {t('settings.cors_proxy_label')}
            </label>
            <input 
              type="text" 
              value={corsProxy} 
              onChange={(e) => setCorsProxy(e.target.value)} 
              placeholder={t('settings.cors_proxy_placeholder')}
              className="input"
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              {t('settings.cors_proxy_hint')}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
              {t('settings.torbox_label')}
            </label>
            <input 
              type="password" 
              value={torboxKey} 
              onChange={(e) => setTorboxKey(e.target.value)} 
              placeholder={t('settings.torbox_placeholder')}
              className="input"
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              {t('settings.torbox_hint')}
            </p>
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            💾 {t('settings.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
