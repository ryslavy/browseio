// BrowseIO Translation System (i18n)
// Allows users to add custom translations via Settings

export interface TranslationMap {
  [key: string]: string;
}

const STORAGE_KEY = 'browseio_translations';
const LANG_KEY = 'browseio_language';

// Default Czech translations (built-in)
const CS_TRANSLATIONS: TranslationMap = {
  // Navigation
  'nav.home': 'Domů',
  'nav.settings': 'Nastavení',

  // Catalog
  'catalog.movies': 'Filmy',
  'catalog.series': 'Seriály',
  'catalog.popular': 'Populární',
  'catalog.searching': 'Vyhledávám',
  'catalog.search_results': 'Výsledky vyhledávání pro',
  'catalog.search_placeholder': 'Hledat filmy a seriály...',

  // Genres
  'genre.top': 'Populární',
  'genre.Action': 'Akční',
  'genre.Adventure': 'Dobrodružný',
  'genre.Animation': 'Animovaný',
  'genre.Biography': 'Životopisný',
  'genre.Comedy': 'Komedie',
  'genre.Crime': 'Kriminální',
  'genre.Documentary': 'Dokumentární',
  'genre.Drama': 'Drama',
  'genre.Family': 'Rodinný',
  'genre.Fantasy': 'Fantasy',
  'genre.History': 'Historický',
  'genre.Horror': 'Horor',
  'genre.Mystery': 'Mysteriózní',
  'genre.Romance': 'Romantický',
  'genre.Sci-Fi': 'Sci-Fi',
  'genre.Sport': 'Sportovní',
  'genre.Thriller': 'Thriller',
  'genre.War': 'Válečný',
  'genre.Western': 'Western',
  'genre.Reality-TV': 'Reality TV',

  // Movie Details
  'details.streams': 'Dostupné streamy',
  'details.no_streams': 'Žádné dostupné streamy. Přidejte doplňky v Nastavení.',
  'details.loading': 'Načítám streamy z doplňků...',
  'details.source': 'Zdroj',
  'details.all': 'Všechny',
  'details.web_player': 'Web Player',
  'details.potplayer': 'PotPlayer',
  'details.download': 'Stáhnout',
  'details.season': 'Sezóna',
  'details.episode': 'Epizoda',
  'details.episodes': 'Epizody',

  // Settings
  'settings.title': 'Nastavení BrowseIO',
  'settings.plugins_title': 'Doplňky a Scrapery (Stremio & Nuvio Compatible)',
  'settings.plugins_desc': 'Vložte URL adresu jakéhokoliv Stremio Addonu nebo Nuvio Pluginu.',
  'settings.plugin_url_placeholder': 'stremio://... nebo https://.../manifest.json',
  'settings.add_plugin': 'Přidat doplněk',
  'settings.installing': 'Instaluji...',
  'settings.installed_plugins': 'Nainstalované doplňky',
  'settings.no_plugins': 'Zatím nemáte nainstalované žádné doplňky. Přidejte doplněk výše!',
  'settings.active': 'Aktivní',
  'settings.disabled': 'Vypnuto',
  'settings.delete': 'Smazat',
  'settings.cors_proxy_title': 'Vlastní CORS Proxy a TorBox Klíč',
  'settings.cors_proxy_label': 'Vlastní CORS Proxy URL (volitelné)',
  'settings.cors_proxy_placeholder': 'např. https://moje-proxy.workers.dev/?',
  'settings.cors_proxy_hint': 'Umožňuje obcházet blokování klientských scraperů v prohlížeči.',
  'settings.torbox_label': 'TorBox API Klíč (Debrid)',
  'settings.torbox_placeholder': 'Vložte váš TorBox API Key...',
  'settings.torbox_hint': 'Pokud zadáte API klíč, aplikace ověří které torrenty jsou již kešovány.',
  'settings.save': 'Uložit nastavení',
  'settings.saved': 'Nastavení bylo úspěšně uloženo!',
  'settings.language_title': 'Jazyk a překlady',
  'settings.language_label': 'Jazyk rozhraní',
  'settings.custom_translations_label': 'Vlastní překlady (JSON)',
  'settings.custom_translations_hint': 'Zadejte JSON objekt s vlastními překlady. Klíče najdete v dokumentaci.',

  // Sort
  'sort.popularity': 'Dle popularity',
  'sort.year_desc': 'Nejnovější',
  'sort.year_asc': 'Nejstarší',
  'sort.rating_desc': 'Nejlépe hodnocené',
  'sort.name_asc': 'A-Z',
  'sort.name_desc': 'Z-A',
};

const EN_TRANSLATIONS: TranslationMap = {
  'nav.home': 'Home',
  'nav.settings': 'Settings',
  'catalog.movies': 'Movies',
  'catalog.series': 'Series',
  'catalog.popular': 'Popular',
  'catalog.searching': 'Searching',
  'catalog.search_results': 'Search results for',
  'catalog.search_placeholder': 'Search movies and series...',
  'genre.top': 'Popular',
  'details.streams': 'Available streams',
  'details.no_streams': 'No available streams. Add plugins in Settings.',
  'details.loading': 'Loading streams from plugins...',
  'details.source': 'Source',
  'details.all': 'All',
  'details.web_player': 'Web Player',
  'details.potplayer': 'PotPlayer',
  'details.download': 'Download',
  'details.season': 'Season',
  'details.episode': 'Episode',
  'details.episodes': 'Episodes',
  'settings.title': 'BrowseIO Settings',
  'settings.plugins_title': 'Plugins & Scrapers (Stremio & Nuvio Compatible)',
  'settings.plugins_desc': 'Enter a URL of any Stremio Addon or Nuvio Plugin.',
  'settings.plugin_url_placeholder': 'stremio://... or https://.../manifest.json',
  'settings.add_plugin': 'Add plugin',
  'settings.installing': 'Installing...',
  'settings.installed_plugins': 'Installed plugins',
  'settings.no_plugins': 'No plugins installed yet. Add a plugin above!',
  'settings.active': 'Active',
  'settings.disabled': 'Disabled',
  'settings.delete': 'Delete',
  'settings.cors_proxy_title': 'Custom CORS Proxy & TorBox Key',
  'settings.cors_proxy_label': 'Custom CORS Proxy URL (optional)',
  'settings.cors_proxy_placeholder': 'e.g. https://my-proxy.workers.dev/?',
  'settings.cors_proxy_hint': 'Allows bypassing browser CORS restrictions for client scrapers.',
  'settings.torbox_label': 'TorBox API Key (Debrid)',
  'settings.torbox_placeholder': 'Enter your TorBox API Key...',
  'settings.torbox_hint': 'If set, the app will check which torrents are already cached.',
  'settings.save': 'Save settings',
  'settings.saved': 'Settings saved successfully!',
  'settings.language_title': 'Language & Translations',
  'settings.language_label': 'Interface language',
  'settings.custom_translations_label': 'Custom translations (JSON)',
  'settings.custom_translations_hint': 'Enter a JSON object with custom translations. See docs for keys.',
  'sort.popularity': 'By popularity',
  'sort.year_desc': 'Newest first',
  'sort.year_asc': 'Oldest first',
  'sort.rating_desc': 'Top rated',
  'sort.name_asc': 'A-Z',
  'sort.name_desc': 'Z-A',
};

const BUILT_IN_LANGS: Record<string, TranslationMap> = {
  cs: CS_TRANSLATIONS,
  en: EN_TRANSLATIONS,
};

export function getCurrentLanguage(): string {
  if (typeof window === 'undefined') return 'cs';
  return localStorage.getItem(LANG_KEY) || 'cs';
}

export function setCurrentLanguage(lang: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANG_KEY, lang);
}

export function getCustomTranslations(): TranslationMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCustomTranslations(translations: TranslationMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(translations));
}

/**
 * Get a translated string by key.
 * Priority: custom translations > current language > Czech fallback > key itself
 */
export function t(key: string): string {
  const custom = getCustomTranslations();
  if (custom[key]) return custom[key];

  const lang = getCurrentLanguage();
  const langTranslations = BUILT_IN_LANGS[lang];
  if (langTranslations && langTranslations[key]) return langTranslations[key];

  // Fallback to Czech
  if (CS_TRANSLATIONS[key]) return CS_TRANSLATIONS[key];

  return key;
}

export function getAvailableLanguages(): { code: string; label: string }[] {
  return [
    { code: 'cs', label: 'Čeština' },
    { code: 'en', label: 'English' },
  ];
}

export function getAllTranslationKeys(): string[] {
  return Object.keys(CS_TRANSLATIONS);
}
