# Handoff Report — Video Preview & Streaming Architecture Inspection

**Agent ID**: `teamwork_preview_explorer_m1_2`  
**Milestone**: m1_2 (Video Preview & Streaming Inspection)  
**Target Directory**: `e:\User\AppData\Desktop\Projekt2`  

---

## 1. Observation

### Key Files & Locations Identified
- `src/app/player/page.tsx`: Client-side player component supporting 3 primary streaming modes, Plyr integration, Hls.js initialization, Webtor SDK lifecycle, and external player protocol routing (`vlc://`, `potplayer://`, `mpv://`).
- `src/app/api/transcode/route.ts`: Server-side FFmpeg HLS transcoder and WebTorrent integration API endpoint. Handles process lifecycle (`POST` to start, `DELETE` to terminate), temporary file cleanup, and HLS playlist readiness polling.
- `src/app/api/hls/[...slug]/route.ts`: Dynamic HLS file serving endpoint for `.m3u8` playlists, `init.mp4` initialization segments, and `.m4s` fMP4 audio/video segments. Rewrites absolute file system URI paths in `.m3u8` playlists to relative paths.
- `src/app/api/proxy/route.ts`: Streaming proxy for direct HTTP video URLs with Range header forwarding, byte-range responses (`206 Partial Content`), and CORS headers.
- `src/app/lib/torbox.ts`: Client library for TorBox Debrid REST API (`https://api.torbox.app/v1/api`). Implements `checkTorBoxCached` for bulk infoHash cache checking and `resolveTorBoxStreamUrl` via `/torrents/createtorrent` and `/torrents/requestdl`.
- `src/app/api/torbox/route.ts`: Internal API proxy route for TorBox cache check (`action: 'check'`) and stream resolution (`action: 'resolve'`).
- `src/app/movie/[type]/[id]/page.tsx`: Movie details and stream selection page. Aggregates stream sources from Torrentio, SKTOnline, SKTorrent, and Hellspy; performs TorBox cache checks; triggers streaming mode navigation.
- `src/app/settings/page.tsx`: User configuration management (`localStorage` persistence for `torbox_api_key`, `sktorrent_uid`, `sktorrent_pass`, and `player_preference`).

---

## 2. Logic Chain

### A. End-to-End Component Hierarchy & Flow

```
[Movie Details Page: src/app/movie/[type]/[id]/page.tsx]
   │
   ├── 1. Aggregates Sources (Torrentio, SKTOnline, Hellspy, SKTorrent Classic)
   ├── 2. TorBox Cache Inspection (`POST /api/torbox`, action: 'check')
   └── 3. Mode Navigation (`handlePlay`):
        ├── [Mode 1: Debrid Stream] -> resolve TorBox URL -> `/player?url=...&localTranscode=true`
        ├── [Mode 2: Local P2P Transcode] -> `/player?url=<magnet>&hash=...&isP2PTranscode=true`
        ├── [Mode 3: Webtor P2P] -> `/player?hash=...`
        └── [Mode 4: Direct Stream] -> `/player?url=...` (or system player vlc://, potplayer://, mpv://)

[Player Page: src/app/player/page.tsx]
   │
   ├── 1. System Player Interception (if player_preference in localStorage !== 'web')
   │    └── Redirects to `vlc://<url>`, `potplayer://<url>`, or `mpv://<url>`
   │
   └── 2. Web Player Mode Selection:
        ├── Mode A: FFmpeg HLS Transcode (needsTranscode = localTranscodeParam || isP2PTranscodeParam)
        │    ├── POST `/api/transcode` { sessionId, url | magnet }
        │    ├── Server: WebTorrent (if magnet) -> FFmpeg (`-c:v copy -c:a aac -f hls -hls_segment_type fmp4`)
        │    ├── Server: Waits for `tmp-hls/<sessionId>/index.m3u8` -> returns `/api/hls/<sessionId>/index.m3u8`
        │    ├── Client: Hls.js loads source -> attached to Plyr HTML5 video element
        │    └── Client: `beforeunload` / unmount triggers DELETE `/api/transcode`
        │
        ├── Mode B: Direct Video Proxy (currentUrl present, needsTranscode = false)
        │    └── Plyr HTML5 video element source set to `/api/proxy?url=<encodedDirectUrl>`
        │
        └── Mode C: Webtor P2P Player (useWebtorMode = true)
             ├── Script loads `@webtor/player-sdk-js`
             ├── Appends `PUBLIC_TRACKERS` (including WebRTC `wss://` trackers) to magnet URI
             └── Pushes configuration to `window.webtor.push(config)` targeting `<div id="webtor-player">`
```

### B. Streaming Modes Detailed Analysis

#### Mode 1: TorBox Debrid Stream
1. **Cache Checking**: `checkTorBoxCached` calls `GET https://api.torbox.app/v1/api/torrents/checkcached?hash=<list>&format=object`. Returned hashes are marked in UI with `⚡ TorBox Instant (Debrid)`.
2. **Resolution**: `resolveTorBoxStreamUrl` posts magnet to `/torrents/createtorrent` (`seed=1`, `allow_zip=false`), extracts `torrent_id`, then calls `/torrents/requestdl?token=<key>&torrent_id=<id>`.
3. **Design Choice**: Bypasses TorBox `/createstream` (which downscales 4K video) to fetch the 100% original quality direct URL via `/requestdl`.
4. **Playback**: Passes resolved direct URL to `/player` with `localTranscode=true`, sending it to FFmpeg transcoder for stereo AAC audio re-encoding and fMP4 container packaging.

#### Mode 2: Local FFmpeg P2P Transcode Stream
1. **Trigger**: Selected when playing a torrent locally without Debrid using FFmpeg (`isP2PTranscode=true`).
2. **Execution**: `POST /api/transcode` passes `{ sessionId: hash, magnet }`.
3. **WebTorrent Integration**: Dynamically loads `webtorrent`, calls `wtClient.add(magnet)`. On metadata load, selects largest file (the main video) and streams NodeJS `ReadableStream` into FFmpeg input.
4. **FFmpeg Transcode Pipeline**:
   - `inputOptions`: `-probesize 50M -analyzeduration 100M` for variable-speed P2P streams.
   - `-c:v copy`: Preserves raw video quality (HEVC/H.264/4K).
   - `-c:a aac -b:a 256k -ac 2`: Converts AC3/DTS audio to browser-compatible 2-channel AAC.
   - `-f hls -hls_time 6 -hls_segment_type fmp4`: Generates fMP4 HLS chunks.
5. **HLS Delivery**: `/api/hls/[sessionId]/index.m3u8` serves index, dynamically replacing absolute path `URI="E:\...\init.mp4"` with relative `URI="init.mp4"`.

#### Mode 3: Webtor P2P Torrent Streaming
1. **Trigger**: Native browser P2P streaming when no local transcode is requested.
2. **SDK Loading**: `<Script src="https://cdn.jsdelivr.net/npm/@webtor/player-sdk-js/dist/index.min.js" />`.
3. **Tracker Injection**: Appends 17 public trackers (including WebRTC trackers `wss://tracker.openwebtorrent.com`, `wss://tracker.btorrent.xyz`, `wss://tracker.files.fm:7070/announce`) to the magnet link to maximize peer connectivity in browser.
4. **Mounting**: Pushes config to `window.webtor.push(config)` which initializes iframe player inside `<div id="webtor-player">`.

---

## 3. Caveats

1. **System FFmpeg Dependency**: The transcoder relies on `ffmpeg-static` binary resolving at `node_modules/ffmpeg-static/ffmpeg.exe` (Windows) or `node_modules/ffmpeg-static/ffmpeg` (Linux/macOS). If binary is missing or incompatible with OS architecture, local transcoding will fail.
2. **Windows File Locks**: Immediately removing `tmp-hls/<sessionId>` in `DELETE /api/transcode` right after sending SIGKILL to FFmpeg can intermittently throw `EBUSY`/`EPERM` on Windows due to file locks. Code wraps deletion in `try-catch` and defers cleanup to the next session startup.
3. **WebTorrent Peer Availability**: Local P2P transcode (`isP2PTranscode=true`) has a 60-second timeout to find peers. If a torrent has zero active seeders, FFmpeg startup will time out (504 Gateway Timeout).
4. **Browser Audio Support**: HTML5 standard `<video>` does not natively support AC3, EAC3, or DTS audio in Chrome/Firefox. Direct playback of raw torrent files without local FFmpeg transcoding will result in silent video.

---

## 4. Conclusion

- The codebase features a well-architected video preview and streaming subsystem with 3 distinct client/server playback paths:
  1. **TorBox Debrid + Local FFmpeg Transcoder**: Instant playback of cached torrents with 100% original video quality (`-c:v copy`) and browser-compatible AAC audio.
  2. **Local WebTorrent + FFmpeg Transcoder**: On-the-fly local P2P torrent downloading and fMP4 HLS conversion.
  3. **Webtor.io Embedded SDK**: Zero-server-overhead P2P client-side torrent streaming.
- Stability mechanisms are present: m3u8 path rewriting, polling for `index.m3u8` creation before API response, sendBeacon cleanup on tab unload, and multi-tracker WebRTC magnet enrichment.

---

## 5. Verification Method

To verify the streaming implementation and data flows independently:

1. **Inspect Code Files**:
   - `src/app/player/page.tsx` (Lines 63–170 for HLS & Webtor state, 271–460 for DOM layout)
   - `src/app/api/transcode/route.ts` (Lines 8–15 for binary resolution, 87–140 for FFmpeg command, 147–160 for readiness polling)
   - `src/app/api/hls/[...slug]/route.ts` (Lines 34–50 for m3u8 init.mp4 URI rewriting)
   - `src/lib/torbox.ts` (Lines 20–50 for cache check, 52–103 for requestdl resolution)

2. **Run Type Checks**:
   - Command: `npx tsc --noEmit` or `npm run lint` from workspace root `e:\User\AppData\Desktop\Projekt2`.

3. **Runtime Verification**:
   - Start development server: `npm run dev`
   - Access `http://localhost:3000/settings` to configure TorBox API key.
   - Navigate to movie page, verify TorBox cache status indicator (`⚡ TorBox Instant`), and test playback buttons for Debrid, Local P2P, and Webtor modes.
