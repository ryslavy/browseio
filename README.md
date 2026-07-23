# BrowseIO 🎬

**BrowseIO** is a modern, lightweight, static web-based media aggregator and streaming client. Built with **Next.js 16**, **React 19**, and a custom **Glassmorphism CSS Design System**, BrowseIO offers a seamless, fast, and customizable entertainment center interface right in your web browser.

---

## ✨ Features

- 🎨 **Modern Glassmorphism UI**: High-end visual aesthetics with responsive layouts, fluid micro-animations, dynamic backdrop effects, and dark mode.
- 🔌 **Extensible Plugin Engine**: Flexible client-side plugin framework supporting standard community manifests (Stremio & Nuvio compatible).
- 🚀 **100% Client-Side & Static Export**: Designed to be compiled into static HTML/JS assets (`next build`) ready to host directly on **GitHub Pages**, **Cloudflare Pages**, or any CDN without needing a backend server.
- ☁️ **Cloud Debrid & Stream Resolution**: Integrated support for cloud media management (such as TorBox API) to cache and stream high-speed content directly.
- 📺 **Flexible Playback Options**:
  - NATIVE Web Player with HLS/HTML5 video support.
  - One-click launcher for external desktop players (**PotPlayer**, **VLC**, **MPV**, **Infuse**).
- 🌐 **Multilingual (i18n)**: Built-in internationalization supporting Czech, English, and easily expandable dictionary files.
- ⚙️ **Custom CORS Proxying**: Smart client-side fetch router with automatic proxy fallbacks for seamless browser network requests.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI & Logic**: React 19, TypeScript
- **Styling**: Modern Vanilla CSS (Design Tokens, Glassmorphism, CSS Variables)
- **Video Player**: Video.js / Native HTML5 Video API
- **Deployment**: Static Site Generation (SSG / GitHub Pages)

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
   Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## 📦 Building & Static Deployment

To build and export the application as a static website for **GitHub Pages**:

```bash
npm run build
```

The compiled static assets will be generated inside the `out/` directory. You can host this directory on any web server or use the built-in GitHub Actions workflow.

---

## 🔌 Plugin Engine

BrowseIO allows users to connect custom media source providers dynamically:
1. Navigate to **Nastavení (Settings)** in the web application.
2. Enter a valid Manifest URL (Stremio/Nuvio spec).
3. BrowseIO automatically parses stream capabilities (Web Streams vs. Cloud Cached Streams) and displays appropriate playback options for each source.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
