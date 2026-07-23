// BrowseIO Translation System (i18n)
// Supports Czech (CS) and English (EN) out-of-the-box, plus user-defined custom JSON translations in Settings.

export interface TranslationMap {
  [key: string]: string;
}

const STORAGE_KEY = 'browseio_translations';
const LANG_KEY = 'browseio_language';

// Event target for reactive language changes across components
export const i18nEventTarget = typeof window !== 'undefined' ? new EventTarget() : null;

// Default Czech translations (built-in)
const CS_TRANSLATIONS: TranslationMap = {
  // Navbar & Layout
  'nav.home': 'Domů',
  'nav.catalog': '🎬 Katalog',
  'nav.settings': 'Nastavení',
  'nav.language': 'Jazyk',

  // Landing Page
  'landing.experience': '✨ Antigravity Streaming Experience • BrowseIO v2.0',
  'landing.title': 'Objevujte a streamujte v moderním rozhraní',
  'landing.subtitle': 'BrowseIO propojují vaše oblíbené Stremio addony, Nuvio pluginy a TorBox Debrid akceleraci do jednoho bleskového rozhraní bez reklam.',
  'landing.browse_movies': '🎬 Procházet Filmy',
  'landing.browse_series': '📺 Procházet Seriály',
  'landing.badge_addons': '🧩 Podpora Stremio & Nuvio doplňků',
  'landing.badge_debrid': '⚡ TorBox Debrid Akcelerace',
  'landing.badge_players': '🍿 PotPlayer, VLC, MPV & Web Player',
  'landing.badge_lang': '🌐 Česky & English',
  'landing.feat1_title': 'Multi-Plugin Engine',
  'landing.feat1_desc': 'Připojte jakýkoliv Stremio Addon (Torrentio, Cinemeta) i spouštěcí Nuvio JS skripty (4KHDHub, HellSpy, SkTorrent) a prohledávejte všechny zdroje současně.',
  'landing.feat2_title': 'Debrid & TorBox Kešování',
  'landing.feat2_desc': 'Automatická detekce cachenutých torrentů. Kliknutím na tlačítko ⚡ přidejte jakýkoliv torrent okamžitě na váš TorBox účet pro přehrání bez čekání.',
  'landing.feat3_title': 'Váš Oblíbený Přehrávač',
  'landing.feat3_desc': 'Přehrávejte přímo v prohlížeči nebo otevírejte videa jedním kliknutím v desktopovém prehravaci PotPlayer, VLC, MPV nebo Infuse.',
  'landing.cta_title': 'Připraveni začít?',
  'landing.cta_subtitle': 'Otevřete katalog a objevujte nejnovější a nejpopulárnější tituly.',
  'landing.open_catalog': '🚀 Otevřít Katalog',
  'landing.settings_addons': '⚙️ Nastavení Doplňků',

  // Catalog & Search
  'catalog.title': 'BrowseIO',
  'catalog.hero_subtitle': 'Objevujte a streamujte tisíce filmů a seriálů s okamžitým propojením na Stremio Addony, Nuvio pluginy a TorBox Debrid akceleraci.',
  'catalog.badge_addons': '🧩 Stremio & Nuvio Addony',
  'catalog.badge_debrid': '⚡ TorBox Instant Debrid',
  'catalog.badge_players': '🍿 PotPlayer & Web Player',
  'catalog.clear_search': 'Vymazat hledání',
  'catalog.movies': 'Filmy',
  'catalog.series': 'Seriály',
  'catalog.popular': 'Populární',
  'catalog.searching': 'Vyhledávám',
  'catalog.search_results': 'Výsledky vyhledávání pro',
  'catalog.search_placeholder': 'Hledat filmy a seriály...',
  'catalog.no_results': 'Žádné tituly nebyly nalezeny.',
  'catalog.no_image': 'Bez obrázku',

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

  // Stream Filters & Sorting
  'streams.title': 'Dostupné streamy',
  'streams.searching_more': 'Hledám další zdroje...',
  'streams.filter_source': 'Doplněk:',
  'streams.filter_subsource': 'Pod-zdroj:',
  'streams.filter_quality': 'Kvalita:',
  'streams.filter_audio': 'Jazyk:',
  'streams.sort_label': 'Řadit dle:',
  'streams.sort_quality': 'Kvality (4K → SD)',
  'streams.sort_seeders': 'Počtu seedů (Nejvíce)',
  'streams.sort_size_desc': 'Velikosti (Největší)',
  'streams.sort_size_asc': 'Velikosti (Nejmenší)',
  'streams.sort_name': 'Názvu (A-Z)',
  'streams.quick_all': 'Všechny doplňky',
  'streams.quick_cz': '🔊 Pouze CZ / SK Dabing',
  'streams.quick_debrid': '⚡ Pouze Instant Debrid',
  'streams.quick_4k': '☀️ Pouze 4K / 2160p',
  'streams.quick_1080p': '📺 Pouze 1080p Full HD',
  'streams.quality_all': 'Všechny kvality',
  'streams.quality_4k': '☀️ 4K UHD',
  'streams.quality_1080p': '📺 1080p HD',
  'streams.quality_720p': '📺 720p HD',
  'streams.quality_sd': '📀 SD / 480p',
  'streams.audio_all': 'Všechny jazyky',
  'streams.audio_cz': '🔊 CZ / SK Dabing',
  'streams.audio_en': '🇬🇧 Titulky / EN',
  'streams.debrid_badge': '⚡ TorBox Instant (Debrid)',
  'streams.seeders': 'seedů',
  'streams.unknown_size': 'Neznámá velikost',
  'streams.no_streams': 'Žádné streamy nebyly nalezeny pro vybraný filtr.',
  'streams.no_plugins_notice': 'Zatím nemáte přidané žádné funkční doplňky. Přidejte si doplňky v Nastavení.',
  'streams.manage_plugins': '⚙️ Spravovat doplňky v Nastavení',
  'streams.play_web': '▶ Přehrát v aplikaci',
  'streams.play_debrid': '⚡ Instant Play (TorBox)',
  'streams.cache_debrid': '⚡ Cache na TorBox (Debrid)',
  'streams.caching': '⚡ Ukládám...',
  'streams.cached_success': '✓ Přidáno do TorBoxu!',
  'streams.download': '⬇️ Stáhnout',
  'streams.copy_link': '📋 Kopírovat odkaz',
  'streams.link_copied': '✓ Odkaz zkopírován!',

  // Movie Details Page
  'details.not_found': 'Film nebo seriál nebyl nalezen.',
  'details.back': '← Zpět na katalog',
  'details.seasons': 'Série',
  'details.episodes': 'Epizody',
  'details.specials': 'Speciály',
  'details.released': 'Vydáno:',
  'details.no_description': 'Popis není k dispozici.',

  // Settings Page
  'settings.title': 'Nastavení BrowseIO',
  'settings.plugins_title': 'Doplňky a Scrapery (Stremio & Nuvio Compatible)',
  'settings.plugins_desc': 'Vložte URL adresu jakéhokoliv Stremio Addonu nebo Nuvio Pluginu pro načítání streamů.',
  'settings.plugin_url_placeholder': 'stremio://... nebo https://.../manifest.json',
  'settings.add_plugin': 'Přidat doplněk',
  'settings.installing': 'Instaluji...',
  'settings.install_error': 'Nepodařilo se nainstalovat doplněk.',
  'settings.installed_plugins': 'Nainstalované doplňky',
  'settings.no_plugins': 'Zatím nemáte nainstalované žádné doplňky. Přidejte doplněk výše!',
  'settings.active': 'Aktivní',
  'settings.disabled': 'Vypnuto',
  'settings.delete': 'Smazat',
  'settings.player_title': 'Lokální přehrávač',
  'settings.player_label': 'Preferovaný přehrávač',
  'settings.player_desc': 'Zvolte přehrávač, ve kterém chcete spouštět externí streamy.',
  'settings.cors_proxy_title': 'Vlastní CORS Proxy a TorBox Klíč',
  'settings.cors_proxy_label': 'Vlastní CORS Proxy URL (volitelné)',
  'settings.cors_proxy_placeholder': 'např. https://moje-proxy.workers.dev/?',
  'settings.cors_proxy_hint': 'Umožňuje obcházet blokování klientských scraperů v prohlížeči.',
  'settings.torbox_label': 'TorBox API Klíč (Debrid)',
  'settings.torbox_placeholder': 'Vložte váš TorBox API Key...',
  'settings.torbox_hint': 'Pokud zadáte API klíč, aplikace automaticky ověří a nabídne Instant Debrid přehrávání i uložení kešování pro jakékoliv doplňky.',
  'settings.save': 'Uložit nastavení',
  'settings.saved': 'Nastavení bylo úspěšně uloženo!',
  'settings.language_title': 'Jazyk rozhraní a překlady',
  'settings.language_label': 'Výběr jazyka',
  'settings.custom_translations_label': 'Vlastní překlady (JSON)',
  'settings.custom_translations_hint': 'Zadejte JSON objekt s vlastními klíči překladů. Příklad: { "catalog.movies": "Filmy" }',

  // Catalog Sorter Dropdown
  'sort.popularity': 'Dle popularity',
  'sort.year_desc': 'Nejnovější',
  'sort.year_asc': 'Nejstarší',
  'sort.rating_desc': 'Nejlépe hodnocené',
  'sort.name_asc': 'A-Z',
  'sort.name_desc': 'Z-A',
};

// Full English translations (built-in)
const EN_TRANSLATIONS: TranslationMap = {
  // Navbar & Layout
  'nav.home': 'Home',
  'nav.catalog': '🎬 Catalog',
  'nav.settings': 'Settings',
  'nav.language': 'Language',

  // Landing Page
  'landing.experience': '✨ Antigravity Streaming Experience • BrowseIO v2.0',
  'landing.title': 'Discover and stream in a modern UI',
  'landing.subtitle': 'BrowseIO seamlessly connects your favorite Stremio add-ons, Nuvio plugins, and TorBox Debrid acceleration into one ultra-fast ad-free interface.',
  'landing.browse_movies': '🎬 Browse Movies',
  'landing.browse_series': '📺 Browse Series',
  'landing.badge_addons': '🧩 Stremio & Nuvio Addon Support',
  'landing.badge_debrid': '⚡ TorBox Debrid Acceleration',
  'landing.badge_players': '🍿 PotPlayer, VLC, MPV & Web Player',
  'landing.badge_lang': '🌐 Czech & English',
  'landing.feat1_title': 'Multi-Plugin Engine',
  'landing.feat1_desc': 'Connect any Stremio Addon (Torrentio, Cinemeta) as well as executable Nuvio JS scripts (4KHDHub, HellSpy, SkTorrent) to search all sources simultaneously.',
  'landing.feat2_title': 'Debrid & TorBox Caching',
  'landing.feat2_desc': 'Automatic detection of cached torrents. Click ⚡ to instantly cache any torrent to your TorBox account for zero-buffer instant play.',
  'landing.feat3_title': 'Your Preferred Player',
  'landing.feat3_desc': 'Stream directly in your browser or launch videos with one click into PotPlayer, VLC, MPV, or Infuse desktop players.',
  'landing.cta_title': 'Ready to start?',
  'landing.cta_subtitle': 'Open the catalog and discover the latest and most popular titles.',
  'landing.open_catalog': '🚀 Open Catalog',
  'landing.settings_addons': '⚙️ Addon Settings',

  // Catalog & Search
  'catalog.title': 'BrowseIO',
  'catalog.hero_subtitle': 'Discover and stream thousands of movies and series with instant integration for Stremio Addons, Nuvio plugins, and TorBox Debrid acceleration.',
  'catalog.badge_addons': '🧩 Stremio & Nuvio Addons',
  'catalog.badge_debrid': '⚡ TorBox Instant Debrid',
  'catalog.badge_players': '🍿 PotPlayer & Web Player',
  'catalog.clear_search': 'Clear search',
  'catalog.movies': 'Movies',
  'catalog.series': 'Series',
  'catalog.popular': 'Popular',
  'catalog.searching': 'Searching',
  'catalog.search_results': 'Search results for',
  'catalog.search_placeholder': 'Search movies and series...',
  'catalog.no_results': 'No titles found.',
  'catalog.no_image': 'No image',

  // Genres
  'genre.top': 'Popular',
  'genre.Action': 'Action',
  'genre.Adventure': 'Adventure',
  'genre.Animation': 'Animation',
  'genre.Biography': 'Biography',
  'genre.Comedy': 'Comedy',
  'genre.Crime': 'Crime',
  'genre.Documentary': 'Documentary',
  'genre.Drama': 'Drama',
  'genre.Family': 'Family',
  'genre.Fantasy': 'Fantasy',
  'genre.History': 'History',
  'genre.Horror': 'Horror',
  'genre.Mystery': 'Mystery',
  'genre.Romance': 'Romance',
  'genre.Sci-Fi': 'Sci-Fi',
  'genre.Sport': 'Sport',
  'genre.Thriller': 'Thriller',
  'genre.War': 'War',
  'genre.Western': 'Western',
  'genre.Reality-TV': 'Reality TV',

  // Stream Filters & Sorting
  'streams.title': 'Available Streams',
  'streams.searching_more': 'Searching more sources...',
  'streams.filter_source': 'Plugin:',
  'streams.filter_subsource': 'Sub-source:',
  'streams.filter_quality': 'Quality:',
  'streams.filter_audio': 'Audio/Lang:',
  'streams.sort_label': 'Sort by:',
  'streams.sort_quality': 'Quality (4K → SD)',
  'streams.sort_seeders': 'Seeders Count (Highest)',
  'streams.sort_size_desc': 'File Size (Largest)',
  'streams.sort_size_asc': 'File Size (Smallest)',
  'streams.sort_name': 'Name (A-Z)',
  'streams.quick_all': 'All Plugins',
  'streams.quick_cz': '🔊 CZ / SK Audio Only',
  'streams.quick_debrid': '⚡ Instant Debrid Only',
  'streams.quick_4k': '☀️ 4K / 2160p Only',
  'streams.quick_1080p': '📺 1080p Full HD Only',
  'streams.quality_all': 'All Qualities',
  'streams.quality_4k': '☀️ 4K UHD',
  'streams.quality_1080p': '📺 1080p HD',
  'streams.quality_720p': '📺 720p HD',
  'streams.quality_sd': '📀 SD / 480p',
  'streams.audio_all': 'All Languages',
  'streams.audio_cz': '🔊 CZ / SK Audio',
  'streams.audio_en': '🇬🇧 Subtitles / EN',
  'streams.debrid_badge': '⚡ TorBox Instant (Debrid)',
  'streams.seeders': 'seeders',
  'streams.unknown_size': 'Unknown size',
  'streams.no_streams': 'No streams found matching the selected filter.',
  'streams.no_plugins_notice': 'You do not have any active plugins installed yet. Add plugins in Settings.',
  'streams.manage_plugins': '⚙️ Manage Plugins in Settings',
  'streams.play_web': '▶ Play in App',
  'streams.play_debrid': '⚡ Instant Play (TorBox)',
  'streams.cache_debrid': '⚡ Cache to TorBox (Debrid)',
  'streams.caching': '⚡ Caching...',
  'streams.cached_success': '✓ Added to TorBox!',
  'streams.download': '⬇️ Download',
  'streams.copy_link': '📋 Copy Link',
  'streams.link_copied': '✓ Link Copied!',

  // Movie Details Page
  'details.not_found': 'Movie or series not found.',
  'details.back': '← Back to Catalog',
  'details.seasons': 'Seasons',
  'details.episodes': 'Episodes',
  'details.specials': 'Specials',
  'details.released': 'Released:',
  'details.no_description': 'No description available.',

  // Settings Page
  'settings.title': 'BrowseIO Settings',
  'settings.plugins_title': 'Plugins & Scrapers (Stremio & Nuvio Compatible)',
  'settings.plugins_desc': 'Enter any Stremio Addon or Nuvio Plugin URL to stream media.',
  'settings.plugin_url_placeholder': 'stremio://... or https://.../manifest.json',
  'settings.add_plugin': 'Add Plugin',
  'settings.installing': 'Installing...',
  'settings.install_error': 'Failed to install plugin.',
  'settings.installed_plugins': 'Installed Plugins',
  'settings.no_plugins': 'No plugins installed yet. Add a plugin above!',
  'settings.active': 'Active',
  'settings.disabled': 'Disabled',
  'settings.delete': 'Delete',
  'settings.player_title': 'Local Video Player',
  'settings.player_label': 'Preferred Player',
  'settings.player_desc': 'Choose the external media player installed on your system.',
  'settings.cors_proxy_title': 'Custom CORS Proxy & TorBox Key',
  'settings.cors_proxy_label': 'Custom CORS Proxy URL (optional)',
  'settings.cors_proxy_placeholder': 'e.g. https://my-proxy.workers.dev/?',
  'settings.cors_proxy_hint': 'Allows bypassing browser CORS restrictions for client scrapers.',
  'settings.torbox_label': 'TorBox API Key (Debrid)',
  'settings.torbox_placeholder': 'Enter your TorBox API Key...',
  'settings.torbox_hint': 'If set, the app automatically checks and provides Instant Debrid play & manual caching for any addon.',
  'settings.save': 'Save Settings',
  'settings.saved': 'Settings saved successfully!',
  'settings.language_title': 'Interface Language & Translations',
  'settings.language_label': 'Select Language',
  'settings.custom_translations_label': 'Custom Translations (JSON)',
  'settings.custom_translations_hint': 'Provide a JSON object with custom keys to override UI text.',

  // Catalog Sorter Dropdown
  'sort.popularity': 'By Popularity',
  'sort.year_desc': 'Newest First',
  'sort.year_asc': 'Oldest First',
  'sort.rating_desc': 'Top Rated',
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
  if (i18nEventTarget) {
    i18nEventTarget.dispatchEvent(new Event('languageChange'));
  }
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
  if (i18nEventTarget) {
    i18nEventTarget.dispatchEvent(new Event('languageChange'));
  }
}

/**
 * Get a translated string by key.
 * Priority: custom user translations > current language > Czech fallback > key
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

export function getAvailableLanguages(): { code: string; label: string; flag: string }[] {
  return [
    { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];
}

export function getAllTranslationKeys(): string[] {
  return Object.keys(CS_TRANSLATIONS);
}
