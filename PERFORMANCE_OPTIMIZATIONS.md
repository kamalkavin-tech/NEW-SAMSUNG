# Performance Optimizations — BBNL IPTV Samsung TV App

Techniques adopted from Netflix, YouTube, JioTV, Hotstar, and Samsung TV Plus to achieve smooth, lag-free performance on Samsung Tizen Smart TVs.

---

## 1. Key Throttling (120ms)

**Problem:** Samsung TV remotes fire rapid repeated keydown events when buttons are held. Each event triggers DOM operations, causing the UI to freeze.

**Fix:** Added 120ms minimum gap between navigation key events in `player.js` and `channels.js`. Volume, BACK, and number keys are exempt (must always respond instantly).

**Files:** `js/player.js`, `js/channels.js`

---

## 2. GPU-Only Animation

**Problem:** Transitioning `background`, `border-color`, and `color` forces the browser to **repaint** the element on every frame. With 200+ channel cards visible, this means 200 repaints per frame during navigation.

**Fix:** Removed all `transition: background, border-color, color` from hot-path elements. Focus state changes are now **instant** (zero transition delay). Only `transform` and `opacity` are animated — these are the only two CSS properties that skip layout and paint, going directly to the GPU compositor.

**Files:** `css/pages/channels.css`, `css/pages/player.css`

**Elements affected:**
- `.channel-card` — channel grid cards
- `.category-pill` — filter pills
- `.category-item` — player sidebar categories
- `.channel-item` — player sidebar channels

---

## 3. Instant Focus Feedback

**Problem:** 150ms transition delays between focus states make the app feel laggy when navigating with the remote. Users press DOWN rapidly and the visual feedback trails behind.

**Fix:** All focusable navigation elements now have zero transition. The visual change from unfocused to focused is immediate on the same frame as the keypress.

**Files:** `css/pages/channels.css`, `css/pages/player.css`

---

## 4. GPU Compositing Hints

**Problem:** Without explicit GPU layer promotion, the browser may composite channel cards on the CPU, causing flickering and janky scrolling on Samsung TV's limited hardware.

**Fix:** Added `backface-visibility: hidden` on `.channel-card`. This hints to the browser to promote the element to its own GPU layer, reducing flicker during transforms and scrolling.

**Files:** `css/pages/channels.css`

---

## 5. CSS Containment

**Status:** Already in place from previous optimizations.

`contain: layout style` on `.channels-grid` and `.channel-card` isolates each card's repaint scope. When one card's focus state changes, only that card is repainted — not the entire grid.

**Files:** `css/pages/channels.css`

---

## 6. Silent Console in Production

**Problem:** 106 `console.log` calls in AVPlayer fired during every channel switch. 12+ `console.log` calls fired on every keypress in channels navigation. On Samsung TV's limited CPU, string formatting and console output is expensive.

**Fix:**
- AVPlayer: Added `_VERBOSE = false` production flag. All 106 log calls use `_log()` which is a no-op when `_VERBOSE` is false. Set `_VERBOSE = true` to re-enable for debugging.
- Channels: Silenced per-keypress logs (`[DOWN]`, `[UP]`, `[LEFT]`, `[RIGHT]`, `[Channels Navigation]`)
- Player: Removed `"Player Key:"` log that fired on every single keydown event

**Files:** `js/avplayer.js`, `js/channels.js`, `js/player.js`

---

## 7. Batch DOM Insertion

**Status:** Already in place from previous optimizations.

Channel cards are built in a detached `<div>` element (off-DOM), then the entire grid is appended to the container in a single `appendChild()` call. This triggers only one browser reflow instead of one per card.

**Files:** `js/channels.js`

---

## 8. Stale-While-Revalidate Cache

**Status:** Already in place from previous optimizations.

`CacheManager` serves expired localStorage data immediately (via `ignoreExpiry = true` fallback) while fresh data is fetched in the background. The `getChannelData()`, `getCategories()`, and `getLanguageList()` functions all use this "call-once" strategy — data is fetched once per session and reused from cache for all subsequent calls.

**Files:** `js/api.js`

---

## 9. Reduced API Timeout

**Problem:** 10-second API timeout meant the app could hang for 10 seconds on a slow production server before showing an error.

**Fix:** Reduced to 6 seconds. Faster failure means the user can retry sooner, and stale cache data is shown in the meantime.

**Files:** `js/api.js`

---

## 10. Extended Page Cache

**Problem:** 5-minute sessionStorage cache TTL meant returning from the player to the channels page often triggered a fresh API call, showing "Loading Channels..." for several seconds.

**Fix:** Extended to 15 minutes. Combined with the instant-render-from-cache logic at the top of `initPage()`, the channels page now renders immediately from cache on return visits — no loading flash.

**Files:** `js/channels.js`

---

## Additional Speed Fixes

| Change | File | Before | After |
|--------|------|--------|-------|
| IP wait removed (home page) | `js/home.js` | 3s blocking wait | Removed |
| IP wait removed (channels page) | `js/channels.js` | 3s blocking wait | Removed |
| IP wait removed (player page) | `js/player.js` | 3s blocking wait | Removed |
| IP detection per-service timeout | `js/api.js` | 5s per service | 2s |
| Empty-response retry delay | `js/channels.js` | 1000ms | 200ms |
| Sidebar sync method | `js/player.js` | `setTimeout(120ms)` | `requestAnimationFrame` |

---

## TV Freeze Prevention

| Change | File | What |
|--------|------|------|
| Separate try-catch for `stop()`/`close()` | `js/avplayer.js` (5 locations) | `close()` always runs even if `stop()` throws |
| Removed duplicate `stop()`/`close()` | `js/avplayer.js` | `setUrl()` no longer repeats what `destroy()` already did |
| Same split fix | `js/api.js` | HOME button visibility change handler |

---

## Estimated Impact

- **Page load:** 3-6 seconds faster (no IP wait + faster timeout + cache)
- **Navigation:** No lag (throttled keys + no transitions + no console.log)
- **Channel switching:** No freeze (safe stop/close + no duplicate cleanup)
- **Return visits:** Instant (15-min cache + instant render from sessionStorage)

---

## References

- [Samsung Developer: Application Performance Improvement](https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/)
- [Samsung Developer: Launch Time Optimization](https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/launch-time-optimization.html)
- [Tizen Docs: Performance Improvement](https://docs.tizen.org/application/web/guides/w3c/perf-opt/performance-improvement/)
- CSS GPU Animation: Only `transform` and `opacity` skip layout+paint
- Netflix/YouTube TV apps: Key throttling + virtual scrolling + GPU-only transitions
