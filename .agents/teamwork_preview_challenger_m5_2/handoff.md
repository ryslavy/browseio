# CHALLENGE REPORT — STREAMING & SECURITY EMPIRICAL STRESS-TESTS

## 1. Challenge Summary

**Overall risk assessment**: HIGH

Empirical testing was conducted across all streaming API routes (`/api/proxy`, `/api/transcode`, `/api/hls/[...slug]`, `/api/torbox`), transcode cleanup logic, unit test runner (`npm test`), and stream mounting contracts in `src/app/player/page.tsx`.

Key Findings:
1. **Critical Path Traversal Vulnerability in `/api/hls/[...slug]/route.ts`**: The route directly concatenates user-supplied `slug` path parameters (`sessionId` and `filename`) using `path.join(process.cwd(), 'tmp-hls', sessionId, filename)`. Relative path segments such as `..` allow attackers to escape `tmp-hls` and read arbitrary files from the filesystem (e.g. `package.json`, source files, credentials).
2. **Missing Local / Private IP SSRF Prevention in `/api/proxy/route.ts`**: Protocol filtering (`http:` and `https:`) is active, but there are no checks preventing requests to internal IPs (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`).
3. **Stale Directory Cleanup Helper (`cleanupStaleHlsDirectories`)**: Verified empirically. Correctly purges folders modified >1 hour ago while preserving active/recent session folders and skipping folders associated with running FFmpeg processes.
4. **Unit Test Suite (`npm test`)**: Test runner script `scripts/run-e2e-tests.ts` executes cleanly with 21/21 passed tests. Note: PowerShell execution policy blocks running `npm` directly in raw shell, but executing via Node (`node --experimental-strip-types scripts/run-e2e-tests.ts`) succeeds 100%.

---

## 2. Empirical Test Results & Challenges

### [HIGH] Challenge 1: Path Traversal Vulnerability in HLS Delivery Route
- **Target File**: `src/app/api/hls/[...slug]/route.ts`
- **Assumption Challenged**: `path.join(process.cwd(), 'tmp-hls', sessionId, filename)` safe-guards against path traversal.
- **Attack Vector**: Requesting `/api/hls/session/../..%2Fpackage.json` or passing `['session', '..', '..', 'package.json']` in `slug`.
- **Empirical Evidence**: Tested programmatically with Next.js HLS handler. `GET /api/hls/test_session/../../package.json` returned `HTTP 200 OK` with the full raw contents of `package.json`.
- **Blast Radius**: Arbitrary file read access on the application server.
- **Mitigation**: Sanitize `sessionId` and `filename` using `path.basename()` or verify that `filePath.startsWith(baseTmpDir)`.

### [MEDIUM] Challenge 2: SSRF Protocol Filter Lacks Internal IP / Loopback Egress Controls
- **Target File**: `src/app/api/proxy/route.ts`
- **Assumption Challenged**: Filtering for `http:` and `https:` protocols is sufficient to prevent SSRF.
- **Attack Vector**: Target URLs such as `http://127.0.0.1:8080/admin`, `http://169.254.169.254/latest/meta-data/`.
- **Empirical Evidence**: `proxyGET(new Request('http://localhost:3000/api/proxy?url=http://127.0.0.1:9999/test'))` passed protocol validation and attempted `fetch()`. Validated rejection of non-HTTP protocols (`file://`, `ftp://`, `gopher://`, `javascript:`, empty URL).
- **Blast Radius**: Internal service probing / cloud metadata exfiltration if hosted on AWS/GCP/Azure.
- **Mitigation**: Disallow private/loopback IP address targets in `parsedUrl.hostname`.

### [PASS] Challenge 3: Transcode Directory Cleanup Helper (`cleanupStaleHlsDirectories`)
- **Target File**: `src/app/api/transcode/route.ts`
- **Empirical Evidence**:
  - Created artificial stale folder (`mtime` set to 2 hours ago) and active folder (`mtime` set to current time).
  - Executed `cleanupStaleHlsDirectories(3600000)`.
  - Stale folder was purged completely (`fs.existsSync == false`).
  - Active folder was preserved (`fs.existsSync == true`).
  - Running process protection (`if (activeProcesses[dir]) continue;`) verified.

### [PASS] Challenge 4: Stream Mounting Contracts in Player & API Routes
- **Target File**: `src/app/player/page.tsx`, `src/lib/torbox.ts`, `src/app/api/transcode/route.ts`
- **Stream Mounting Modes**:
  1. **Direct Proxy Streaming**: `/api/proxy?url=${encodeURIComponent(url)}` -> standard HTTP/HTTPS mp4 streams.
  2. **Debrid Transcoding**: Resolves stream URL via TorBox API (`resolveTorBoxStreamUrl`), then calls `POST /api/transcode` with `url` and `sessionId`.
  3. **P2P Transcoding**: Calls `POST /api/transcode` with `magnet` and `sessionId`, WebTorrent streams to local FFmpeg pipe.
  4. **Webtor P2P Direct**: Injects `@webtor/player-sdk-js` with fallback trackers (`PUBLIC_TRACKERS`).
- **Empirical Validation**: All parameter validation contracts (`POST /api/transcode` missing `sessionId`/`url`/`magnet` -> `400`, `DELETE` -> `200`, `POST /api/torbox` invalid action -> `400`, missing API key -> `400`) verified empirically.

---

## 3. Test Suite Execution (`npm test`)

- **Command Executed**: `node --experimental-strip-types scripts/run-e2e-tests.ts`
- **Output**:
  ```
  ====================================================
            BROWSEIO E2E TEST SUITE RUNNER            
  ====================================================

  --- Tier 1: Feature Coverage ---
    ✓ parseImdbRating converts valid rating strings to floats
    ✓ parseReleaseYear extracts 4-digit start year from release strings
    ✓ filterCatalogItems filters by media type (movie vs series)
    ✓ filterCatalogItems filters by genre
    ✓ sortCatalogItems sorts by rating_desc correctly
    ✓ sortCatalogItems sorts by rating_asc correctly
    ✓ sortCatalogItems sorts by release_desc correctly
    ✓ sortCatalogItems sorts by title_asc lexicographically
    ✓ Cinemeta getCatalog returns valid metadata structure from API
    ✓ Cinemeta searchCinemeta searches items by query
    ✓ Cinemeta getMetaDetails returns detailed metadata by IMDb ID

  --- Tier 2: Boundary & Corner Cases ---
    ✓ parseImdbRating handles unparseable / missing values safely without throwing
    ✓ parseReleaseYear handles unparseable / missing values safely without throwing
    ✓ filterCatalogItems handles null or missing metadata fields without throwing
    ✓ sortCatalogItems maintains array immutability
    ✓ checkTorBoxCached handles empty hash arrays and missing hashes safely

  --- Tier 3: Cross-Feature Combinations ---
    ✓ Multi-criteria combination: Type + Genre + Search + Sort (Rating Desc)
    ✓ Multi-criteria combination: Series + Action + Sort (Release Desc)
    ✓ Sorting Invariant: rating_desc monotonicity across sorted array
    ✓ Sorting Invariant: release_desc monotonicity across sorted array

  --- Tier 4: Real-World Scenarios ---
    ✓ End-to-End User Path: Movie Search -> Filter Action -> Sort Rating -> Stream Mounting

  ====================================================
  TEST RESULTS: 21 Passed, 0 Failed
  ====================================================
  ```

---

## 4. Verification Method

To independently verify all findings:
1. **Run Unit Tests**: `node --experimental-strip-types scripts/run-e2e-tests.ts`
2. **Run Empirical Challenge Suite**: `node --experimental-strip-types .agents/teamwork_preview_challenger_m5_2/empirical_streaming_tests.ts`
3. **Inspect Output**: Observe Path Traversal exploit output on `/api/hls/[...slug]` and SSRF analysis on `/api/proxy`.
