# BrowseIO 🎬

**BrowseIO** is a modern, lightweight, static web-based media aggregator and streaming client. Built with **Next.js 16**, **React 19**, and a custom **Glassmorphism CSS Design System**, BrowseIO offers a seamless, fast, and customizable entertainment center interface right in your web browser.

---

## ✨ Features

- 🎨 **Modern Glassmorphism UI**: High-end visual aesthetics with responsive layouts, fluid micro-animations, dynamic backdrop effects, and dark mode.
- 🔌 **Extensible Plugin Engine**: Flexible client-side plugin framework supporting standard community manifests (**Stremio Addons** & **Nuvio Scrapers / Plugins**).
- 🚀 **100% Client-Side & Static Export**: Designed to be compiled into static HTML/JS assets (`npm run build:pages`) ready to host directly on **GitHub Pages**, **Cloudflare Pages**, or any static CDN without requiring a backend server.
- ☁️ **Cloud Debrid & Stream Resolution**: Integrated support for cloud media management (such as **TorBox API**) with instant cache status checking, direct streaming, manual caching, and file downloading.
- 📺 **Advanced Artplayer Web Player**:
  - Full support for direct HTTP/HLS (`.m3u8`) streaming with adaptive bitrate switching.
  - In-player subtitle management with automatic subtitle detection, custom `.srt` / `.vtt` file upload, font size adjustments (16px–40px), vertical height positioning (30px–160px), and time delay synchronization.
  - Audio track selection and pure TypeScript container probing (EBML/MKV header analysis for audio codecs and multi-audio tracks).
  - Dedicated in-player stream switcher drawer for quick quality and provider switching without leaving playback.
- 🍿 **Desktop Player Integration**: One-click external protocol launcher for desktop media players (**PotPlayer**, **VLC**, **MPV**, **Infuse**).
- 🌐 **Multilingual & Localization (i18n)**: Full internationalization supporting **Czech** and **English**, plus user-defined custom translation overrides via JSON.
- ⚙️ **Universal CORS Proxying**: Smart client-side fetch router with automatic proxy fallbacks (includes a deployable Cloudflare Worker in `cors-proxy/`) for seamless browser network requests.

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **UI & Logic**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Modern Vanilla CSS (Design Tokens, Glassmorphism, CSS Variables, Responsive Layouts)
- **Video Player**: [Artplayer](https://artplayer.org/) & [Hls.js](https://github.com/video-dev/hls.js/)
- **Deployment**: Static Site Generation (SSG / GitHub Pages export)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18.0.0 or higher
- `npm` or `pnpm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ryslavy/browseio.git
   cd browseio
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Linting

BrowseIO includes a built-in end-to-end and unit test suite verifying plugin normalization, stream deduplication, subtitle conversion, container probing, and translation maps:

```bash
# Run the test suite
npm test

# Run ESLint
npm run lint

# Run TypeScript type check
npx tsc --noEmit
```

---

## 📦 Building & GitHub Pages Deployment

BrowseIO supports both a hybrid Next.js build and a static export for static web hosting:

### 1. Static Export (GitHub Pages)
To compile the static bundle for **GitHub Pages** (exported into the `out/` folder):

```bash
npm run build:pages
```

The output in `out/` is ready to be deployed to the `gh-pages` branch.

### 2. Standard Production Build
For Node.js / Vercel server environments:

```bash
npm run build
npm start
```

---

## 🔌 Plugin Engine

BrowseIO allows users to connect custom media source providers dynamically:

1. Navigate to **Nastavení (Settings)** in the web application.
2. Enter a valid Manifest URL (Stremio Addon or Nuvio Plugin manifest).
3. BrowseIO automatically resolves stream capabilities (Direct Web Streams, Debrid Cached Streams, and P2P Torrents) and presents optimal playback options for each source.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
