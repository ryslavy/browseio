# Original User Request

## Initial Request — 2026-07-21T10:44:29Z

# Teamwork Project Prompt — Draft

> Status: Ready for launch — awaiting user approval
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Audit, validate, and comprehensively refactor a Next.js streaming application. Implement a robust solution for sorting and categorizing movies and series, and optimize the overall architecture.

Working directory: e:/User/AppData/Desktop/Projekt2
Integrity mode: benchmark

## Requirements

### R1. Comprehensive Refactor & Architecture Optimization
Perform a deep architectural audit of the Next.js application. Identify inefficient patterns, remove dead code, optimize React components, and implement best practices. The team has full autonomy to choose the best architectural approach for these improvements.

### R2. Robust Sorting and Filtering
Implement a functional and correct sorting and categorization system for series and movies. The team is free to decide the optimal technical solution (e.g., client-side logic, caching, or adding a lightweight database) as long as the end result provides an accurate and seamless user experience.

### R3. Maintain Core Playback Functionality
Ensure that all existing core functionalities, specifically the local FFmpeg HLS transcoder, Webtor integration, and TorBox caching logic, remain fully functional and stable after the refactor. 

## Acceptance Criteria

### Code Quality & Build Stability
- [ ] `npm run build` completes successfully with zero compilation errors, type errors, or out-of-memory crashes.
- [ ] No hydration mismatches occur during client-side rendering.

### Functional Verification
- [ ] A programmatic script or defined visual audit confirms that movies and series are correctly sorted on the main page (e.g., newest first, or by rating).
- [ ] A programmatic test or agent-driven verification confirms that triggering a video playback (using the local P2P transcoder or direct stream) still successfully mounts the player and fetches the stream.
