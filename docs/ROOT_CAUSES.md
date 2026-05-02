# Project Root Causes — NEW-SAMSUNG

Date: 2026-04-30
Scope: High-level root-cause findings across primary app files. This document lists observed root causes (not exhaustive but covering critical areas), short impact notes and suggested remediation.

**Summary**
- Most UX issues stem from three patterns: (1) focus/restore race conditions in sidebar/player interactions; (2) CSS specificity/selector gaps causing visual artifacts (scrollbars/borders); (3) brittle network/playback error handling and retry state machines.

**Per-file root causes**

- `js/player.js`
  - Root causes:
    - Complex, ad-hoc state mutations for `sidebarState` and playback state cause race conditions when the sidebar opens/closes (multiple places call focus/expand routines and re-render categories/channels).
    - Focus restore runs in multiple code paths (sync + deferred) causing late overrides — the primary cause of "focus jumps".
    - Auto-resume logic relied on a few global timestamps/flags; retry window and retry-lock state were not consistently reset across all failure paths (causes stuck popups or no auto-retry).
    - DOM render timing assumptions (focusing before DOM nodes are present) caused missed focus — intermittent on emulator/real TV.
  - Impact: menu navigation anomalies, focus not landing on currently playing channel, playback popup stuck after network restore.
  - Quick remediation: centralize sidebar focus/restore in a single function; mark one authoritative restore-per-open token; use requestAnimationFrame/nextTick before focusing; bound auto-retry windows and clear locks on success/failure.

- `css/pages/player.css`
  - Root causes:
    - Missing or insufficient scrollbar-hide rules on all scrollable containers (e.g. `.categories-list`), and a visible `border-left` on `.inline-channels-wrap` produced a vertical line mistaken for scrollbar.
    - Some visual rules (scrollbar thumb color) were present and visible; insufficient specificity caused overrides on some platforms (Tizen/webkit).
    - Channel-number input used a wide framed box not suitable for TV UX (visual clutter).
  - Impact: visible scrollbar/track lines, unwanted left border, oversized channel-input UI.
  - Quick remediation: enforce scrollbar-hide with webkit/Firefox/IE rules on all scrollable containers with `!important` where needed; remove decorative left border on inline channel wrapper; reduce numpad input width and remove outer frame.

- `js/channels.js`
  - Root causes:
    - Duplicate DOM patterns and focus helpers across `channels.js` and `player.js` cause inconsistent behavior when sidebar logic is shared or duplicated.
    - Category builder and channel DOM creation occasionally rely on synchronous caches that may not be hydrated.
  - Impact: inconsistent category/channel indexes between pages, focus mismatch after navigation.
  - Quick remediation: factor shared focus/DOM helpers into a single shared utility and ensure channel list caching/hydration is consistent.

- `js/api.js` and remote APIs
  - Root causes:
    - Network error detection is spread across modules and sometimes uses different heuristics (navigator.onLine vs webapis); this leads to inconsistent detection on emulator vs real TV.
    - Image/logo URL normalization and cache resolution occur in several places with slightly different rules.
  - Impact: auto-retry triggers not consistent; logos missing or different between pages.
  - Quick remediation: centralize network detection and image URL normalization in `BBNL_API` and call a single helper from players and sidebar.

- `js/avplayer.js` (player wrapper)
  - Root causes:
    - AVPlayer callbacks are relied on heavily; missing/late callbacks (onBufferingComplete/onError/onCurrentPlayTime) can produce inconsistent state if the player instance lifecycle isn't carefully bound to a channel-switch token.
  - Impact: playback retry failures, misattributed errors to wrong channel.
  - Quick remediation: tag each playback attempt with a generation id and ignore stale callbacks; ensure stream-timeout timers are reset on new attempts.

- `js/main.js`, `js/home.js`, `js/home-navigation.js`
  - Root causes:
    - Multiple modules manipulate shared sessionStorage/state keys (`selectedLanguageId`, `playerReferrer`, channel caches) without a strict contract, leading to subtle state mismatches when reopening the sidebar.
  - Impact: sidebar language/category context sometimes differs from player zapping context.
  - Quick remediation: define a small `StateSync` helper with documented keys and accessors.

- HTML (`player.html` and related)
  - Root causes:
    - DOM structure requires specific classes for CSS rules (e.g., `.inline-channels-wrap`, `#sidebarScrollContent`). If DOM class names differ between pages or are rebuilt, CSS or focus selectors may not match.
  - Impact: CSS rules not applied or focus helpers unable to find nodes.
  - Quick remediation: keep class names stable; prefer data-attributes for semantic mapping if DOM can change.

**Cross-cutting root-cause themes**
- Race conditions and multiple focus paths: many fixes require centralizing the focus logic and adding a single guarded restore token for sidebar-open cycles.
- CSS specificity and platform differences: Tizen/webkit sometimes exposes scrollbars or ignores some rules — use explicit `::-webkit-scrollbar { display: none !important }` plus transparent thumb/track fallbacks.
- Global mutable state: many global variables (currentIndex, sidebarState, _lastAttemptedChannel) are mutated in multiple places which increases coupling and bugs. Use small well-documented state accessor functions and reset points on key transitions (sidebar open/close, channel switch).

**Next steps (optional, recommended)**
1. Create `ROOT_CAUSES.md` (this file) in repo root (done).  
2. Add a short `CONTRIBUTING_UI.md` with rules: centralized focus restore flow and state accessors.  
3. Run device tests for playback auto-retry and focus restore on real Samsung TV to validate repairs.  
4. If you want, I can open PR-style patches for the other modules to centralize helpers (`getCurrentPlayingChannelObject`, `syncSidebarWithCurrentPlayback`) and add unit-style smoke tests (DOM-based) for sidebar focus.


---
If you want, I will now commit this file as `ROOT_CAUSES.md` (already created) and then (1) expand each file section with exact line references and example snippets, or (2) generate a short actionable task list per root cause for implementation. Which would you like next?