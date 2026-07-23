# SkTorrent & Hellspy — Nuvio Plugin 🚀

Tento plugin pro multimediální centrum **Nuvio** integruje dva populární české/slovenské zdroje video obsahu: **SkTorrent.eu** a **Hellspy.to**. Plugin je navržen s důrazem na nulovou konfiguraci (zero-config) a maximální kvalitu streamování.

---

## 🌟 Hlavní vlastnosti

### 1. SkTorrent Scraper (`sktorrent`)
* **Nativní Debrid / TorBox integrace**: Plugin funguje kompletně bezkonfiguračně. Nemusíte zadávat žádné API klíče — vyhodnocení cache a debrid resolve (např. přes TorBox) probíhá nativně přímo v přehrávači Nuvio.
* **Podpora TMDB metadat**: Scraper automaticky překládá a vyhledává alternativní české/slovenské a originální názvy filmů a seriálů podle TMDB ID.
* **Chytré vyhledávání epizod**: Opravené vyhledávání kompletních sérií i konkrétních dílů (např. spolehlivě vyhledá a seřadí i starší série jako *Rick a Morty*).

### 2. Hellspy Scraper (`hellspy`)
* **Přímé přehrávání zdarma**: Přehrávání funguje bez nutnosti debrid služeb, stahování torrentů nebo placeného premium účtu.
* **Bypass limitů**: Při přehrávání přes toto API neplatí standardní 5minutové časové omezení z webu Přehraj.to/Hellspy.
* **Detekce zvuku a titulků**: Přímo ve výběru streamů vidíte ikony pro dostupný dabing a externí titulky (např. `🔊 CZ | 💬 CZ/EN`).
* **Automatické titulky**: Plugin automaticky stahuje a páruje externí titulky (WebVTT) přímo do přehrávače Nuvia.

---

## 🛠️ Instalace do Nuvia

1. Nahrajte tento repozitář na svůj GitHub.
2. Zkopírujte odkaz na soubor `manifest.json` ze složky `plugin` (použijte tlačítko **Raw** na GitHubu).
   * Odkaz bude vypadat přibližně takto:
     `https://raw.githubusercontent.com/<VAŠE-JMÉNO>/<NÁZEV-REPOZITÁŘE>/main/plugin/manifest.json`
3. Otevřete **Nuvio** (na televizi nebo mobilu).
4. Přejděte do **Nastavení** -> **Doplňky / Pluginy** -> **Přidat nový plugin**.
5. Vložte zkopírovaný odkaz na manifest a potvrďte.

---

## 📁 Struktura repozitáře

* `/plugin` — Hlavní složka s pluginem určená k nasazení.
  * `manifest.json` — Manifest definující podporované streamery a nastavení.
  * `/providers` — Samotný zdrojový kód scraperů (`sktorrent.js`, `hellspy.js`).

---

## ⚙️ Řazení streamů

Všechny výsledky vyhledávání jsou automaticky řazeny podle standardu maximální kvality:
1. **Podle rozlišení** (od nejvyššího po nejnižší: `4K` > `1080p` > `720p` > `SD`).
2. **Podle velikosti** (od největšího souboru po nejmenší v rámci stejného rozlišení — větší soubor = vyšší datový tok a lepší kvalita obrazu/zvuku).

---

*Upozornění: Tento plugin je vyvíjen pro studijní a výzkumné účely. Uživatelé jsou zodpovědní za dodržování autorských práv a podmínek cílových služeb.*
