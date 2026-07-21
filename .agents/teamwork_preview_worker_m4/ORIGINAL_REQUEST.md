## 2026-07-21T10:50:22Z

You are teamwork_preview_worker_m4, an implementation and QA subagent.
Your working directory is: e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_worker_m4

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Review `PROJECT.md` at `e:\User\AppData\Desktop\Projekt2\.agents\orchestrator\PROJECT.md` and `e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_explorer_m1_1\handoff.md`.
2. Implement Architecture Optimization & Code Refactoring:
   - **ESLint Config**: Update `eslint.config.mjs` to add `"various-sources/**"` and `"tmp-hls/**"` to `globalIgnores`.
   - **Refactor Scraper Imports**:
     - Convert dynamic `require()` calls inside `src/app/api/hellspy/route.ts`, `src/app/api/sktorrent/route.ts`, and `src/app/api/sktorrent-classic/route.ts` to static top-level ES imports.
     - Convert `src/lib/hellspy-scraper.js`, `src/lib/sktonline-scraper.js`, and `src/lib/sktorrent-scraper.js` to ESM modules or TypeScript.
   - **SSRF Security Protection**:
     - In `src/app/api/proxy/route.ts`, add protocol and URL validation checks to reject non-http/https protocols or malformed URLs before proxying requests.
   - **Stale HLS Directory Cleanup Guard**:
     - In `src/app/api/transcode/route.ts`, add a cleanup helper that scans `tmp-hls/` on initialization and removes directories older than 1 hour to prevent disk space accumulation.
   - **Image Optimization**:
     - Optimize `<img>` elements in `src/components/catalog/MovieCard.tsx` and `src/app/movie/[type]/[id]/page.tsx` with fallback handling and proper alt tags.
3. Run verification commands:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run build`
   - `npm test`
4. Update `progress.md` in your working directory and submit a detailed handoff report in `e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_worker_m4\handoff.md`.
5. Send a message to the orchestrator (conversation ID: 17751f8b-cdd0-4e13-8c53-6769689be40c) when finished.
