# Handoff Report — BrowseIO Codebase & Next.js 16 Exploration

## 1. Observation

### Core Environment & Configuration
- **Next.js Version**: `16.2.10` (`package.json:15`)
- **React Version**: `19.2.4` (`package.json:18-19`)
- **Build Engine**: Next.js 16 Turbopack (default for `next dev` and `next build`)
- **TypeScript & Target**: Target `ES2017`, `strict: true`, path alias `@/* -> ./src/*` (`tsconfig.json:3-24`)
- **Project Structure**:
  - App Directory: `src/app/`
  - Routes:
    - Root Layout: `src/app/layout.tsx` (Root HTML/Body, Inter font, Navigation header)
    - Home Page: `src/app/page.tsx` (`'use client'`, Cinemeta catalog search & infinite scrolling)
    - Movie Details Page: `src/app/movie/[type]/[id]/page.tsx` (`'use client'`, stream aggregator across Torrentio, SKTorrent, Hellspy, TorBox)
    - Video Player Page: `src/app/player/page.tsx` (`'use client'`, Plyr + HLS.js + Webtor P2P player, wrapped in `<Suspense>`)
    - Settings Page: `src/app/settings/page.tsx` (`'use client'`, player & API configuration stored in `localStorage`)
  - API Routes (`src/app/api/`):
    - `POST /api/hellspy/route.ts` (invokes `hellspy-scraper.js`)
    - `GET /api/hls/[...slug]/route.ts` (serves HLS playlists & fMP4 segments from `tmp-hls/`)
    - `GET /api/proxy/route.ts` (proxies external video URLs with Range header support)
    - `POST /api/sktorrent/route.ts` (invokes `sktonline-scraper.js`)
    - `POST /api/sktorrent-classic/route.ts` (invokes `sktorrent-scraper.js`)
    - `POST /api/torbox/route.ts` (TorBox Debrid cache checking & stream resolution via `lib/torbox.ts`)
    - `POST & DELETE /api/transcode/route.ts` (WebTorrent P2P streaming + FFmpeg live fMP4/HLS transcode)
  - Scraper Libraries (`src/lib/`):
    - `src/lib/cinemeta.ts` (Stremio Cinemeta catalog & metadata API)
    - `src/lib/torrentio.ts` (Torrentio stream source API)
    - `src/lib/torbox.ts` (TorBox debrid REST client)
    - `src/lib/hellspy-scraper.js` (CommonJS scraper for Hellspy)
    - `src/lib/sktonline-scraper.js` (CommonJS scraper for SKTOnline)
    - `src/lib/sktorrent-scraper.js` (CommonJS scraper for SKTorrent)

### Verified Command Outputs
1. **Build (`cmd.exe /c npm run build`)**:
   - Status: **PASSED** (Exit code 0)
   - Output: `▲ Next.js 16.2.10 (Turbopack) - Compiled successfully in 2.1s`. 12 static & dynamic routes generated cleanly without TypeScript errors.
2. **Type Check (`cmd.exe /c npx tsc --noEmit`)**:
   - Status: **PASSED** (Exit code 0, 0 errors).
3. **Lint (`cmd.exe /c npm run lint`)**:
   - Status: **FAILED** (Exit code 1, 1571 problems: 1092 errors, 479 warnings).
   - Root Cause: `eslint.config.mjs` only ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`. It fails to ignore `various-sources/**` and `tmp-hls/**`.

### Next.js 16 Breaking Changes Compliance Audit
- **Async Request APIs (`params`, `searchParams`, `cookies()`, `headers()`)**:
  - In Next.js 16, synchronous access to `params` and `searchParams` in Server Components is removed.
  - Verification: `src/app/api/hls/[...slug]/route.ts:5-7` correctly accepts `{ params }: { params: Promise<{ slug: string[] }> }` and calls `await params`.
  - Client Components (`src/app/movie/[type]/[id]/page.tsx` and `src/app/player/page.tsx`) use `useParams()` and `useSearchParams()` hooks, which remain valid synchronous hooks in client-rendered components.
  - `src/app/player/page.tsx:464-470` wraps the search-params dependent component `PlayerContent` inside `<Suspense>`, satisfying Next.js App Router requirements.
- **Middleware -> Proxy**:
  - Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`. No `middleware.ts` exists in this repository.

### Hydration Mismatch Audit
- All interactive pages (`app/page.tsx`, `app/movie/[type]/[id]/page.tsx`, `app/player/page.tsx`, `app/settings/page.tsx`) carry the `'use client'` directive.
- `localStorage` read/write access is strictly isolated inside `useEffect` or button click handlers (`src/app/settings/page.tsx:12-23`, `src/app/movie/[type]/[id]/page.tsx:72-73`, `100-101`, `134-135`).
- Non-SSR third-party React component `Plyr` is dynamically imported in `src/app/player/page.tsx:11` using `dynamic(() => import('plyr-react').then(mod => mod.Plyr), { ssr: false })`.
- Risk Level: **LOW**. No dynamic server rendering or un-hydrated DOM mismatches were found.

---

## 2. Logic Chain

1. **Observation**: `npm run lint` failed with 1571 errors in `various-sources/webtor-sdk/...` and `various-sources/stremio-web/...`.
   - **Reasoning**: `various-sources/` contains raw third-party repository code included for reference. `tsconfig.json:33` excludes `"various-sources"`, but `eslint.config.mjs:9-15` omits `"various-sources/**"`.
   - **Logic**: Adding `"various-sources/**"` and `"tmp-hls/**"` to `globalIgnores` in `eslint.config.mjs` will isolate linting strictly to active source code (`src/`).

2. **Observation**: Scraper API routes (`src/app/api/hellspy/route.ts:9`, `src/app/api/sktorrent/route.ts:8`, `src/app/api/sktorrent-classic/route.ts:12`) use `require()` inside POST handler functions.
   - **Reasoning**: `require()` inside route handler body causes dynamic runtime require calls on every incoming HTTP request. The target files in `src/lib/*.js` are legacy CommonJS modules with QuickJS polyfills (`String.prototype.padStart`, `String.prototype.startsWith`, etc.).
   - **Logic**: Modernizing `src/lib/hellspy-scraper.js`, `sktonline-scraper.js`, and `sktorrent-scraper.js` to ES Modules (`export default` / named exports) or converting them to TypeScript will eliminate dynamic `require()` calls and improve Turbopack bundling performance.

3. **Observation**: `src/app/api/proxy/route.ts` accepts any query parameter `url` and performs `fetch(targetUrl)` without domain host verification.
   - **Reasoning**: Any client can pass an arbitrary URL (e.g. internal network IPs or loopback addresses) to `/api/proxy?url=...`.
   - **Logic**: A domain/protocol validation guard should be added to prevent potential Server-Side Request Forgery (SSRF) vulnerabilities.

4. **Observation**: `src/app/api/transcode/route.ts:25-31` attaches `wtClient` to `global.wtClient`, and creates temporary HLS segments under `tmp-hls/<sessionId>`.
   - **Reasoning**: `DELETE /api/transcode` and `window.removeEventListener('beforeunload')` clean up active sessions, but if a browser crashes or tab is killed abruptly, orphaned directories remain inside `tmp-hls/`.
   - **Logic**: An automated stale directory cleanup mechanism (e.g. clearing subdirectories older than 1 hour during server startup or cron) will prevent disk space accumulation over time.

5. **Observation**: Standard `<img>` elements are used instead of `next/image` (`src/app/page.tsx:198`, `src/app/movie/[type]/[id]/page.tsx:240`).
   - **Reasoning**: `next/image` provides modern webp/avif encoding, responsive sizing, layout shift prevention, and automatic caching (with Next.js 16 `minimumCacheTTL` defaults).
   - **Logic**: Replacing `<img>` with `next/image` improves performance metrics (LCP and CLS).

---

## 3. Caveats

- **External Scraper Dependencies**: Live scraping capabilities of `Hellspy`, `SKTOnline`, and `SKTorrent` depend on third-party remote HTTP endpoints and HTML structures. Local unit testing requires network access or mocked fixtures.
- **FFmpeg Binary Path**: `src/app/api/transcode/route.ts:9` resolves `ffmpeg-static` manually from `node_modules/ffmpeg-static/ffmpeg.exe`. Ensure `ffmpeg-static` binary exists in production deployment environments (e.g., Docker / Node environment).

---

## 4. Conclusion

The BrowseIO codebase is well-structured, compiles cleanly with TypeScript (`npx tsc --noEmit`), and builds successfully using Next.js 16 Turbopack (`npm run build`).

### Recommended Action Items for Next Milestones:
1. **ESLint Configuration Fix**: Add `"various-sources/**"` and `"tmp-hls/**"` to `globalIgnores` in `eslint.config.mjs`.
2. **Refactor Scraper Imports**: Convert `src/lib/*-scraper.js` from CommonJS to ESM/TypeScript and replace `require()` inside API handlers with static top-level ES imports.
3. **Security Hardening**: Add host validation/allowlisting in `src/app/api/proxy/route.ts` against SSRF.
4. **Image Optimization**: Replace HTML `<img>` tags with `next/image` in `MovieCard` and `MovieDetails`.
5. **Key Prop Cleanup**: Fix array index key usage (`key={idx}` and `key={movie.id + index}`) in `app/page.tsx` and `app/movie/[type]/[id]/page.tsx`.

---

## 5. Verification Method

To independently verify the project state:
1. **Run Production Build**:
   ```cmd
   cmd.exe /c npm run build
   ```
   *Expected output*: Complete build with 12 routes generated successfully under Turbopack.
2. **Run TypeScript Check**:
   ```cmd
   cmd.exe /c npx tsc --noEmit
   ```
   *Expected output*: Zero errors.
3. **Inspect ESLint Issue**:
   ```cmd
   cmd.exe /c npm run lint
   ```
   *Observation*: Fails due to un-ignored `various-sources/` directory.

---
