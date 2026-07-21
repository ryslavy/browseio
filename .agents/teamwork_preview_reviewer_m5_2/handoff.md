# Handoff & Quality Review Report — Core Playback Services (M5.2)

**Agent**: `teamwork_preview_reviewer_m5_2` (Reviewer & Adversarial Critic)  
**Date**: 2026-07-21  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### Codebase Observations
1. **`src/app/api/proxy/route.ts` (Lines 19–36)**:
   ```ts
   if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
     return new NextResponse('Zakázaný protokol: vyžadováno HTTP nebo HTTPS', { status: 400 });
   }
   ...
   const videoRes = await fetch(parsedUrl.toString(), {
     headers,
     redirect: 'follow'
   });
   ```
   *Direct Observation*: The proxy endpoint only checks if the protocol is `http:` or `https:`. It performs no validation on target IP addresses or hostnames (such as `127.0.0.1`, `localhost`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `[::1]`). It also sets `redirect: 'follow'`.

2. **`src/app/api/hls/[...slug]/route.ts` (Lines 12–19)**:
   ```ts
   const sessionId = slug[0];
   const filename = slug[1];
   ...
   const filePath = path.join(process.cwd(), 'tmp-hls', sessionId, filename);
   ```
   *Direct Observation*: The route extracts `sessionId` and `filename` directly from URL path parameters without sanitization or validation against directory traversal tokens (`..`).

3. **`src/app/api/transcode/route.ts` (Lines 98–112)**:
   ```ts
   const baseTmpDir = path.join(process.cwd(), 'tmp-hls');
   if (fs.existsSync(baseTmpDir)) {
     const dirs = fs.readdirSync(baseTmpDir);
     for (const dir of dirs) {
       if (dir !== sessionId && !activeProcesses[dir]) {
         try {
           fs.rmSync(path.join(baseTmpDir, dir), { recursive: true, force: true });
           console.log(`[FFmpeg] Cleaned up inactive session directory: ${dir}`);
         } catch (e) { ... }
       }
     }
   }
   ```
   *Direct Observation*: Upon receiving any POST request, `api/transcode` scans `tmp-hls` and deletes any folder that does not match the current `sessionId` and is not present in the local in-memory `activeProcesses` hash map.

4. **`src/app/api/transcode/route.ts` (Lines 128–143)**:
   ```ts
   const timeout = setTimeout(() => reject(new Error('P2P Timeout - no peers found')), 60000);
   wtClient.add(magnet, (torrent: ...) => { ... });
   ```
   *Direct Observation*: If WebTorrent `wtClient.add` times out after 60 seconds, the Promise rejects, but `wtClient.remove` is never invoked for the pending torrent.

5. **`src/lib/torbox.ts` (Lines 52–103)**:
   *Direct Observation*: `resolveTorBoxStreamUrl` creates a torrent via `/torrents/createtorrent` and requests the stream URL via `/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}`. It handles JSON response variants correctly but does not pass an optional `file_id` for multi-file torrent selection.

### Execution Command Results
- `cmd /c npx tsc --noEmit`: **PASSED** (Exit code 0, 0 type errors).
- `cmd /c npm run build`: **PASSED** (Compiled successfully in 2.0s, Next.js build clean).
- `cmd /c npm test`: **PASSED** (21 tests passed, 0 failed across Tiers 1-4).

---

## 2. Logic Chain

1. **SSRF Vulnerability in `/api/proxy`**:
   - *Premise*: The proxy accepts user-supplied URLs and fetches them server-side.
   - *Observation*: The route only verifies `protocol === 'http:' || protocol === 'https:'`.
   - *Reasoning*: An attacker can provide URLs targeting internal loopback or metadata services (e.g. `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:3000`). The server will issue HTTP GET requests to internal targets and stream responses back to the caller. Setting `redirect: 'follow'` further bypasses naive domain checks via open redirects.
   - *Conclusion*: Critical SSRF security flaw.

2. **Path Traversal in `/api/hls/[...slug]`**:
   - *Premise*: The HLS route serves files from `tmp-hls`.
   - *Observation*: `sessionId` and `filename` are joined directly into `filePath = path.join(process.cwd(), 'tmp-hls', sessionId, filename)` without checking for `..` or validating string format.
   - *Reasoning*: An attacker requesting `/api/hls/..%2F..%2Fpackage.json` resolves `filePath` outside `tmp-hls` to `process.cwd()/package.json`. `fs.createReadStream` will return sensitive files from the server filesystem.
   - *Conclusion*: Critical Path Traversal vulnerability.

3. **Session Interruption & Race Condition in `/api/transcode`**:
   - *Premise*: HLS streams generate segments over time while a user watches.
   - *Observation*: The POST handler deletes all directories in `tmp-hls` not found in the process's `activeProcesses` map.
   - *Reasoning*: In Next.js worker threads or multi-process deployments (or after process restarts), `activeProcesses` is per-process. When User B starts a session, User B's process will see User A's directory in `tmp-hls` as inactive in its local memory and delete User A's HLS segments while User A is watching.
   - *Conclusion*: Major stability flaw in stale directory cleanup.

4. **Resource Leak on WebTorrent Magnet Timeouts**:
   - *Premise*: Torrent swarms with 0 seeds can fail to resolve metadata.
   - *Observation*: On timeout (60s), the request handler returns 500/error, but `wtClient.remove` is never called.
   - *Reasoning*: Unreachable magnets stay active in `wtClient` background memory and network loop indefinitely.
   - *Conclusion*: Major resource leak flaw.

---

## 3. Caveats

- Tests executed in `npm test` pass because the current test suite covers sorter logic, cinemeta metadata fetching, and TorBox caching contracts, but does NOT include integration tests for SSRF, path traversal, or concurrent transcode directory cleanup.
- Real P2P WebTorrent peer resolution speed was tested with mock datasets and local timeouts; real-world swarm connectivity depends on client network firewall settings (NAT/UPnP/WebRTC).

---

## 4. Conclusion

While `npx tsc`, `npm run build`, and `npm test` execute without errors, **code review and security analysis reveal CRITICAL vulnerabilities and stability flaws**.

**Verdict**: **REQUEST_CHANGES**

---

## 5. Verification Method

To independently verify these findings:
1. **SSRF Verification**:
   - Issue request: `curl "http://localhost:3000/api/proxy?url=http://127.0.0.1:3000/"`
   - Observe that `/api/proxy` successfully fetches and proxies the internal endpoint.
2. **Path Traversal Verification**:
   - Issue request: `curl "http://localhost:3000/api/hls/../package.json"`
   - Inspect `src/app/api/hls/[...slug]/route.ts` line 19 to confirm `path.join` receives raw `slug` arguments without regex validation or `path.resolve` boundary checking.
3. **Stale Directory Cleanup Verification**:
   - Inspect `src/app/api/transcode/route.ts` lines 98–112 to confirm immediate non-timestamped `fs.rmSync` of non-active session folders.

---

## 6. Review Report

### Findings Summary

| ID | Severity | Category | File & Line | Issue Summary |
|---|---|---|---|---|
| F-01 | **Critical** | Security (SSRF) | `src/app/api/proxy/route.ts:19-36` | Missing target host/IP validation allows arbitrary server-side requests (IMDS, loopback, internal network). |
| F-02 | **Critical** | Security (Path Traversal) | `src/app/api/hls/[...slug]/route.ts:12-19` | Raw route parameters in `path.join` allow escaping `tmp-hls` to read system files. |
| F-03 | **Major** | Stability | `src/app/api/transcode/route.ts:98-112` | Immediate deletion of `tmp-hls` subdirectories by non-owner sessions breaks active streams on multi-worker setups. |
| F-04 | **Major** | Resource Leak | `src/app/api/transcode/route.ts:128-143` | WebTorrent magnet timeout leaves background torrent objects consuming RAM/sockets. |
| F-05 | **Minor** | Completeness | `src/lib/torbox.ts:90-97` | `/torrents/requestdl` lacks `file_id` parameter support for selecting specific files in multi-file torrents. |

### Verified Claims
- `npx tsc --noEmit` → PASS (0 type errors)
- `npm run build` → PASS (Next.js production build succeeded)
- `npm test` → PASS (21/21 E2E tests passed)

### Coverage Gaps
- Absence of security integration test suite for SSRF and Path Traversal.
- Absence of concurrent user transcode load test suite.

---

## 7. Challenge Report (Adversarial Critic)

### Risk Assessment: **HIGH / CRITICAL**

### Attack Scenarios & Stress Tests

1. **Attack Scenario: Cloud Metadata Theft (IMDS)**
   - *Attack*: Attacker requests `/api/proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/`.
   - *Predicted Result*: Proxies AWS IAM credentials to client.
   - *Status*: **VULNERABLE**

2. **Attack Scenario: Arbitrary File Read via HLS Endpoint**
   - *Attack*: Attacker requests `/api/hls/..%2F..%2Fpackage.json`.
   - *Predicted Result*: Server returns `package.json` contents with `video/MP2T` or `video/mp4` content-type.
   - *Status*: **VULNERABLE**

3. **Stress Test: Concurrent Transcoding Sessions**
   - *Scenario*: User A starts playing stream hash A. User B starts playing stream hash B 5 seconds later.
   - *Predicted Result*: POST handler for User B wipes User A's `tmp-hls/hashA` folder if `activeProcesses` isn't shared across workers.
   - *Status*: **FAIL**

4. **Stress Test: Magnet Link Timeout Memory Accumulation**
   - *Scenario*: 50 requests with dead magnet links submitted to `/api/transcode`.
   - *Predicted Result*: 50 WebTorrent instances remain active in Node event loop indefinitely.
   - *Status*: **FAIL**
