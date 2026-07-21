# Remediation & Security Audit Report — M5.2 Remediation

**Agent**: `teamwork_preview_worker_m5_remediation` (Implementation & Security Remediation Subagent)  
**Date**: 2026-07-21  
**Status**: **COMPLETED / VERIFIED**  

---

## 1. Observation

### Source Code Findings & Remediation Applied

1. **Path Traversal in HLS Route (`src/app/api/hls/[...slug]/route.ts`)**:
   - *Observation Before Fix*: Line 19 used `path.join(process.cwd(), 'tmp-hls', sessionId, filename)` directly with raw `slug` parameters. Path segments containing `..` allowed escaping `tmp-hls` to read system files.
   - *Remediation*:
     ```ts
     const rawSessionId = slug[0];
     const rawFilename = slug[1];
     if (!rawSessionId || !rawFilename) {
       return new NextResponse('Not Found', { status: 404 });
     }
     const sessionId = path.basename(rawSessionId);
     const filename = path.basename(rawFilename);
     const baseTmpDir = path.resolve(process.cwd(), 'tmp-hls');
     const filePath = path.resolve(baseTmpDir, sessionId, filename);

     if (!filePath.startsWith(baseTmpDir) || sessionId === '..' || filename === '..') {
       return new NextResponse('Bad Request', { status: 400 });
     }
     ```

2. **Server-Side Request Forgery (SSRF) in Proxy Route (`src/app/api/proxy/route.ts`)**:
   - *Observation Before Fix*: Protocol validation checked only `http:` / `https:`, allowing egress requests to `127.0.0.1`, `localhost`, `::1`, `0.0.0.0`, `169.254.x.x` (AWS IMDS), `10.x.x.x`, `172.16-31.x.x`, and `192.168.x.x`.
   - *Remediation*: Added `isInternalHost(hostname: string): boolean` helper validating target hostname against all loopback, link-local, and private RFC 1918 / RFC 4193 / IPv6 ranges:
     ```ts
     if (isInternalHost(parsedUrl.hostname)) {
       return new NextResponse('Zakázaný přístup na interní adresu', { status: 400 });
     }
     ```

3. **Multi-Worker Directory Wipe in Transcode Route (`src/app/api/transcode/route.ts`)**:
   - *Observation Before Fix*: Lines 97–112 contained inline non-timestamped directory deletion on POST requests, wiping any directory in `tmp-hls` not tracked in the current process's local `activeProcesses` map, breaking active streams on multi-worker deployments.
   - *Remediation*: Replaced inline deletion with `cleanupStaleHlsDirectories(3600000)`, which prunes only inactive session directories modified over 1 hour ago (`now - stats.mtimeMs > maxAgeMs`).

4. **WebTorrent Magnet Timeout Leak in Transcode Route (`src/app/api/transcode/route.ts`)**:
   - *Observation Before Fix*: Lines 128–143 created a 60s timeout for `wtClient.add(magnet, ...)`. On timeout, the Promise rejected but `wtClient.remove(magnet)` was never called, leaking magnet metadata and background P2P connections.
   - *Remediation*: Updated timeout callback:
     ```ts
     const timeout = setTimeout(() => {
       try {
         wtClient.remove(magnet);
       } catch {
         // ignore cleanup errors
       }
       reject(new Error('P2P Timeout - no peers found'));
     }, 60000);
     ```

5. **Test Suite Enhancement (`scripts/run-e2e-tests.ts`)**:
   - *Addition*: Added Tier 5 Security & Stability Remediation tests verifying HLS path traversal rejection (HTTP 400), loopback proxy rejection (HTTP 400 for `127.0.0.1`, `localhost`, `[::1]`), and private/internal IP proxy rejection (HTTP 400 for `169.254.169.254`, `10.0.0.1`, `172.16.0.1`, `172.31.255.255`, `192.168.1.1`, `0.0.0.0`).

### Verification Command Results

- **`cmd /c npx tsc --noEmit`**: **PASSED** (Exit code 0, 0 type errors).
- **`cmd /c npm run lint`**: **PASSED** (Exit code 0, 0 errors, 2 standard Next.js image element warnings).
- **`cmd /c npm run build`**: **PASSED** (Compiled successfully in 1887ms, static pages generated cleanly in 585ms).
- **`cmd /c npm test`**: **PASSED** (24 tests passed across Tiers 1-5, 0 failed).

---

## 2. Logic Chain

1. **Path Traversal Mitigation**:
   - *Premise*: Attacker uses `..` in URL path parameters (`/api/hls/../package.json`) to break out of `tmp-hls`.
   - *Reasoning*: Applying `path.basename()` strips path separator sequences from route inputs, resolving the target path under `baseTmpDir` via `path.resolve(baseTmpDir, sessionId, filename)`. Checking `filePath.startsWith(baseTmpDir)` and rejecting `..` guarantees that any attempt to traverse outside `tmp-hls` immediately fails with HTTP 400 Bad Request.
   - *Conclusion*: Path Traversal vulnerability fully mitigated.

2. **SSRF Mitigation**:
   - *Premise*: Attacker targets `/api/proxy?url=http://169.254.169.254/latest/meta-data/` or internal admin ports.
   - *Reasoning*: Parsing `targetUrl` via `new URL(targetUrl)` extracts `hostname`. Normalizing IPv6 brackets, trailing dots, and case sensitivity allows regex and integer range validation against loopback (`127.0.0.0/8`, `0.0.0.0/8`, `::1`, `localhost`), cloud metadata (`169.254.0.0/16`), and private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). Rejecting match results with HTTP 400 prevents egress traffic to internal targets.
   - *Conclusion*: SSRF vulnerability fully mitigated.

3. **Multi-Worker Directory Cleanup Fix**:
   - *Premise*: Concurrent transcoding sessions across workers or processes share `tmp-hls`.
   - *Reasoning*: Immediate non-timestamped deletion wiped directories belonging to other workers whose process handles were not in local memory. By delegating directory pruning to `cleanupStaleHlsDirectories(3600000)`, directories are deleted only if they have not been modified for over 60 minutes and are not registered in the active process map.
   - *Conclusion*: Multi-worker transcode directory wipe defect resolved.

4. **WebTorrent Resource Leak Fix**:
   - *Premise*: WebTorrent magnet additions populate internal client swarms.
   - *Reasoning*: Invoking `wtClient.remove(magnet)` inside the 60s timeout handler ensures that unresolvable magnets are immediately detached from the client instance and network sockets.
   - *Conclusion*: WebTorrent timeout memory/socket leak resolved.

---

## 3. Caveats

- **Network Egress Testing**: SSRF tests verify that internal IP ranges and loopbacks are rejected with HTTP 400 at the proxy layer before `fetch()` is attempted. Public Internet outbound HTTP requests during production require external network connectivity.
- **FFmpeg Execution**: Local FFmpeg tests rely on binary presence in `node_modules/ffmpeg-static`. System binary fallback is active if `ffmpeg-static` is absent.

---

## 4. Conclusion

All 4 security vulnerabilities and stability defects identified by Reviewer 2 and Challenger 2 have been remediated cleanly and verified. The codebase builds cleanly with Next.js 16 (Turbopack), passes TypeScript type checking with 0 errors, passes ESLint with 0 errors, and passes all 24 E2E test scenarios in Tier 1 through Tier 5.

---

## 5. Verification Method

To independently verify all changes:

1. **TypeScript Type Check**:
   ```cmd
   cmd /c npx tsc --noEmit
   ```
   *Expected output*: Exit code 0, no errors.

2. **Linter Check**:
   ```cmd
   cmd /c npm run lint
   ```
   *Expected output*: Exit code 0, 0 errors.

3. **Production Build**:
   ```cmd
   cmd /c npm run build
   ```
   *Expected output*: Compiled successfully.

4. **E2E & Security Test Suite**:
   ```cmd
   cmd /c npm test
   ```
   *Expected output*: 24 Passed, 0 Failed.
