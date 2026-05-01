# Fo-Fi TV (NEW-SAMSUNG) — Project Architecture & Root Causes

Date: 2026-05-01
Audience: Engineers debugging the Tizen TV web app, especially launch-time and sidebar issues.

This document combines:
1. **How the project works** (architecture, boot sequence, data flow).
2. **How the player menu (sidebar) works** end-to-end.
3. **Root causes** for the "menu broken on launch, fixed by reinstall" class of bugs.

If you're debugging something that vanishes after uninstall + reinstall, jump to [§ 5](#5-root-causes--why-reinstall-fixes-it).

---

## 1. Project Overview

**Fo-Fi TV** is a Samsung Tizen Smart TV app (web-based) for live IPTV streaming, OTT app discovery, and subscription management. It runs as a Tizen web application off `file://` protocol with images and video streams fetched from a remote CDN/API.

### Tech stack
- HTML5, CSS3, vanilla JavaScript (ES5/ES6)
- Tizen Web Application platform
- Native `webapis.avplay`, `tizen.tvinputdevice`, `tizen.systeminfo`, `webapis.network`, `webapis.productinfo`

### Pages and entry points
| HTML | Purpose | Notable JS |
|------|---------|------------|
| `index.html` | Login router (decides login vs home) | inline IIFE + `js/login.js` |
| `home.html` | Landing dashboard (banners, languages, OTT) | `js/home.js`, `js/home-navigation.js`, `js/main.js` |
| `player.html` | Live channel player + sidebar menu | `js/player.js`, `js/avplayer.js` |
| `channels.html` | TV Channels grid | `js/channels.js` |
| `settings.html` | Settings + legal pages | `js/settings.js` |
| `feedback.html` | Submit feedback | `js/feedback.js` |
| `payment.html` | Subscription flow | `js/payment.js` |

### Core modules
| Module | Responsibility |
|--------|----------------|
| [js/api.js](js/api.js) | `BBNL_API` HTTP layer, `DeviceInfo`, `CacheManager`, `RemoteKeys`, image cache, persistent storage helpers, auth gate |
| [js/player.js](js/player.js) | AVPlayer wrapper, info bar, **sidebar menu** (categories ↔ channels), network watchdog, error popup |
| [js/home.js](js/home.js) | Hero banner carousel, language grid, OTT grid, auto-tune to LCN 999 |
| [js/channels.js](js/channels.js) | TV Channels grid (subscribed / all / by-language tabs) |
| [js/settings.js](js/settings.js) | Network diagnostics, About / ToS, logout |

---

## 2. App Launch / Boot Sequence

The app's **first painted page** depends on persistent state. This is where most "broken on launch" issues originate.

### 2.1 Login routing — `index.html` (top-of-head IIFE)

1. Read `localStorage.hasLoggedInOnce` and the cookie `bbnl_has_logged_in_once`.
2. Read `localStorage.bbnl_logged_out`.
3. Decide:
   - Never logged in OR `bbnl_logged_out === '1'` → `login.html`
   - `bbnl_relaunch_pending === '1'` → poll for session load, then forward
   - Otherwise → `home.html`
4. **No state validation** — only flag checks. A corrupted `bbnl_user` blob will silently fail later.

### 2.2 Authenticated page boot — same on `player.html` / `channels.html` / `settings.html` / `feedback.html`

Each page has a `(function checkAuth() { ... })()` IIFE near the top of its JS file:
1. Try `BBNL_gateAuthenticatedPage()` from `api.js` (if loaded).
2. Fallback: read `localStorage.bbnl_user` and `localStorage.bbnl_user_backup`.
3. `JSON.parse` both inside `try/catch`. On parse error, **the catch block sets the variable to `null` silently**.
4. If `resolvedUser = primaryUser || backupUser` is null → redirect to `index.html`.
5. Otherwise, sync primary ↔ backup, mark `hasLoggedInOnce = "true"`.

### 2.3 `api.js` initialisation (script tag, before page-specific JS)

1. `BBNL_API`, `CacheManager`, `RemoteKeys` exposed on `window`.
2. `migrateImageCachesIfNeeded()` (line ~703) — version migration.
3. `_hydrateImageCache()` (line 1284) — restores `_IMAGE_CACHE_MAP` from `sessionStorage.bbnl_image_cache_urls_v1`.
4. `pageshow` listener registered at api.js:4478 — handles BFCache restoration.

### 2.4 `player.html` page-specific boot — `window.onload`

1. Initialise AVPlayer module.
2. `loadChannelList()` (async) — fetches channel list from API or CacheManager.
3. Build initial `sidebarState` object (in-memory, **empty** until API/cache populates).
4. Register remote keys via `RemoteKeys.registerAllKeys()`.
5. Auto-tune to `_lastChannel` from `localStorage.bbnl_last_channel` (or LCN 999 / FoFi Info on first launch).
6. `pageshow` handler at [player.js:80](js/player.js#L80) — re-registers keys; if `sidebarState.isOpen`, calls `enforceSidebarPlaybackFocusOncePerOpen()`.

---

## 3. Persistent Storage Reference

Everything that survives across navigation or app restart. **This is the danger zone for "stale state" bugs.**

### 3.1 `localStorage` (survives across app restart, until uninstall or explicit clear)

| Key | Set by | Read by | Shape | Cleared by |
|-----|--------|---------|-------|------------|
| `bbnl_user` | `api.js:2403` (login) | every page's `checkAuth` | `{ userid, mobile, device, ... }` | settings logout (`settings.js:596`) |
| `bbnl_user_backup` | `api.js:2403` | every page | mirror of `bbnl_user` | settings logout |
| `hasLoggedInOnce` | login pages | `index.html` IIFE | `"true"` | settings logout (sets `bbnl_logged_out`) |
| `bbnl_logged_out` | `settings.js:596` | `index.html`, `api.js:4396` | `"1"` | next successful login |
| `bbnl_channels_cache` | `api.js:2681` (CacheManager) | player, channels, home | array of channels | subscription complete, logout (10 min expiry) |
| `bbnl_categories_cache` | `api.js:2779` (CacheManager) | player, channels | array of categories | subscription complete, logout (10 min expiry) |
| `bbnl_languages_cache` | `api.js:3194` (CacheManager) | player, channels | language list | logout (10 min expiry) |
| `bbnl_expiring_cache` | `api.js:3021` (CacheManager) | api.js | expiring channels | logout (10 min expiry) |
| `bbnl_last_channel` | `api.js:3237` (CacheManager) | api.js:4145 | last played channel object | not explicitly (7 day expiry) |
| `bbnl_image_cache_schema` | `api.js:699` | `api.js:656` | schema version string | schema-bump migration |
| `bbnl_image_cache_metadata_v2` | `api.js:1275` | api.js | per-URL metadata | never |
| `darkMode` | settings | channels, settings | `"true"`/`"false"` | never |
| `macAddress`, `deviceId` | device init | settings | strings | preserved across logout |
| `bbnl_relaunch_pending` | settings (relaunch) | `index.html` | `"1"` | after relaunch |
| `home_fofi_logo_url` | home.js | api.js | string URL | clear on logout |

### 3.2 `sessionStorage` (survives within a single app session; cleared on app close)

| Key | Set by | Read by | Shape | Cleared by |
|-----|--------|---------|-------|------------|
| `selectedLanguageId` / `selectedLanguageName` | `channels.js:604`, `home.js` | player applyPreferredSidebarLanguage | language code/name | logout |
| `master_channel_list_cache` | `channels.js:510` | channels.js | `{ ts, data }` | logout, pagehide |
| `bbnl_logo_cache_map` | `channels.js:108` | channels.js | `{ chno: url }` | pagehide |
| `bbnl_channels_category_grid` / `_key` | `channels.js:2376` | player.js (post-redirect hint) | grid/key | after consume |
| `playerReferrer` | `channels.js:129` | (informational) | URL | next-channel set |
| `bbnl_player_channel` | `channels.js:130` | player init | channel JSON | navigate away |
| `subscription_completed` | `api.js:1013` | channels, home, player | `"true"` | after cache invalidate |
| `bbnl_image_cache_urls_v1` | `api.js:_persistImageCache` | `api.js:_hydrateImageCache` | url-set | schema migration |
| `homeFocusedLanguageIndex` | home.js | home.js | string index | (never) |
| `bbnl_lang_logo_dataurl_v1` | home.js (CI-08 fix) | home.js | `{ url: dataURL }` | quota overflow |
| `favorites_channels_cache` | `favorites.js:213` | favorites.js | `{ ts, data }` | pagehide |

### 3.3 In-memory only (lost on page reload)

These look persistent but **don't survive a full page navigation** — they live in the JS heap of the current page only:

| State | Lives in | Implication |
|-------|----------|-------------|
| `sidebarState.languageUiState[key]` | `player.js` | Saved expansion / focus per language **dies the moment the player page reloads** |
| `sidebarState.expandedCategories` | `player.js` | Reset to `{}` on every player.html load |
| `sidebarState.categories[]` / `channels[]` | `player.js` | Always rebuilt from cache or API |
| `_logoCache`, `_logoSourceCache` | `player.js` | Per-page-load only |
| `homeLanguageLogoCache` | `home.js` | Per-page-load only (the data-URI cache *is* persistent, see CI-08 fix) |

---

## 4. The Player Sidebar (Menu) — Detailed Flow

The "menu" the user sees in the player is `#playerSidebar` rendered by [js/player.js](js/player.js). Understanding this flow is essential because most launch-bug reports are about it.

### 4.1 State model — `sidebarState`

Defined in `player.js` and mutated heavily across the file:

```js
sidebarState = {
    isOpen: false,
    currentLevel: 'categories' | 'channels' | 'language',
    languages: [],          // [{ name, code, langid }, ...] from API or cache
    languageIndex: 0,       // 0='All', 1='Subscribed', N=specific language
    apiCategories: [],      // category metadata from chnl_categlist
    categories: [],         // built per language: [{ name, count, grid }, ...]
    categoryIndex: 0,
    expandedCategories: {}, // { "0": true, "2": true, ... }
    channels: [],           // current category's channel rows
    channelIndex: 0,
    allChannelsCache: [],   // ALL channels (subscribed + unsubscribed) for sidebar
    allChannelsCacheVersion: 0,
    languageUiState: {},    // { [langKey]: { expandedCategoryNames, categoryIndex, channelIndex } }
};
```

### 4.2 `openSidebar()` flow ([player.js:3873](js/player.js))

```
┌─ ensureSidebarAllChannelsCache()  → tries _allChannelsUnfiltered → allChannels → CacheManager
│
├─ If cache empty: hydrateSidebarAllChannelsCache().then(...) ── async path
│      (RACE ZONE — sidebar may already be visible while this resolves)
│
├─ sidebarState.isOpen = true
├─ _sidebarOpenCycle += 1                        ← open token for stale-callback guards
├─ applyPreferredSidebarLanguage()
│      reads sessionStorage.selectedLanguageId → matches into sidebarState.languages
│      defaults to languageIndex=1 ("Subscribed Channels") if no selection
│
├─ hasSavedState = !!sidebarState.languageUiState[langKey]
├─ If hasSavedState && languageContainsCurrentPlayingChannel(...)
│      buildCategoriesForLanguage()   ← preserves saved expansion (Point 7B fix)
│   else
│      alignSidebarToCurrentPlayback() ← switches language to match playing channel
│
├─ saveCurrentLanguageUiState()
├─ Show DOM: sidebar.classList.add('open')
├─ Compute focus target → focusChannelItem(...) or focusCategoryItem(...)
└─ setTimeout(40ms, enforceSidebarPlaybackFocusOncePerOpen)  ← final auth pass
```

### 4.3 What can go wrong here

Each numbered point in this section is a known way the sidebar opens *visibly* but *broken*:

1. **Hydration race** ([player.js:3879–3891](js/player.js#L3879)): the user can see the sidebar shell rendered before `hydrateSidebarAllChannelsCache()` resolves. If the user presses Enter before, focus targets nothing.
2. **Stale `apiCategories`** — never cached on disk; refetched per page load. If the network is slow, categories are empty when render runs.
3. **Stale `bbnl_categories_cache`** ([api.js:2710](js/api.js#L2710)) — within the 10 minute window, the API may have changed but the cache still serves old categories.
4. **`languageUiState` is in-memory only** — if you saved "Movies expanded" then quit the player, the next launch starts fresh and runs `alignSidebarToCurrentPlayback` (which auto-expands the playing channel's category — that's why FoFi Info / Infotainment expands at launch).
5. **`expandedCategories` references missing indices** — recovered from `languageUiState` even when fresh categories array has fewer entries.
6. **CH+/CH- with menu closed** — `syncSidebarWithCurrentPlayback` historically no-op'd when `sidebarState.isOpen === false` (now fixed via Point 7A: state-only update).
7. **Saved language tab no longer contains the playing channel** — fixed via Point 7B fallback to `alignSidebarToCurrentPlayback`.
8. **BFCache restore with stale state** — `pageshow` with `event.persisted === true` keeps the old `sidebarState` but data may have changed.

---

## 5. Root Causes — Why Reinstall Fixes It

This is the core of the "broken sometimes / works after reinstall" pattern.

**Reinstall does one thing the app doesn't:** it wipes `localStorage` AND `sessionStorage` AND any BFCache. Every launch issue listed below disappears because the bad data simply isn't there anymore.

### RC-1 — Stale `bbnl_languages_cache` references a deleted language id

**Trigger:** API rotates language list (e.g. removes Tamil for a license issue). Cache still has Tamil for up to 10 min.

**Effect:** `applyPreferredSidebarLanguage` reads cached languages including stale Tamil. `sessionStorage.selectedLanguageId` may still point to Tamil. `getFilteredChannelsByLanguage` matches no channels. **Sidebar renders empty.**

**Code:** [api.js:3127](js/api.js#L3127), [player.js:applyPreferredSidebarLanguage](js/player.js)

**Mitigation idea:** validate language list against API on every player load before using cache; or shorten the languages cache TTL (e.g. 60 s).

---

### RC-2 — Stale `bbnl_categories_cache` after API category restructure

**Trigger:** Operator changes their LCN scheme; categories from API now have different `grid` ids or names. Local cache still serves old structure.

**Effect:** `buildCategoriesForLanguage` filters `allChannelsCache` by old grid/name → empty channel lists → sidebar shows category headers with `(0)` count, no channels under any of them.

**Code:** [api.js:2779](js/api.js), [player.js:2954](js/player.js#L2954) `buildCategoriesForLanguage`, [player.js:filterChannelsByCategory](js/player.js)

**Mitigation idea:** include API response signature (e.g. ETag or response hash) in cache key; or invalidate categories cache when channel-list cache version changes.

---

### RC-3 — Out-of-bounds `expandedCategories` indices

**Trigger:** Saved `languageUiState[key].expandedCategoryNames = ["Movies","Sports","Kids","Docs"]`. New API returns only 3 categories (Docs removed). Restore code maps to indices 0-3 but only 0-2 exist.

**Effect:** `renderCategoriesList()` paints 3 buttons; `focusCategoryItem(3)` → `querySelector('[data-category-index="3"]')` returns null → focus quietly fails. Sidebar visible but unfocused.

**Code:** [player.js:restoreCurrentLanguageUiState](js/player.js), [player.js:focusCategoryItem](js/player.js)

**Mitigation idea:** clamp indices on restore to `Math.min(savedIdx, currentArr.length - 1)`; remove names not present in current categories.

---

### RC-4 — Corrupted `bbnl_user` blob silently treated as logged in

**Trigger:** Power loss / write interrupted / quota partial write produces `{ "userid": "12345", "userName": "User"` with the closing `}` missing.

**Effect:** `JSON.parse` throws inside the auth-gate `try/catch`, sets `primaryUser = null`. If `bbnl_user_backup` is also bad, falls through to `window.location.replace("index.html")` — login. If only the primary is bad, backup wins and the app proceeds normally (the parse error never surfaces).

**Real risk:** if both partially valid (e.g. backup has trailing whitespace or stale shape with missing fields), the user is "logged in" with malformed data → API calls fail or return wrong data → sidebar / channels appear broken.

**Code:** [player.js:18-53](js/player.js#L18) and identical block in channels.js / favorites.js / settings.js / feedback.js.

**Mitigation idea:** add a "user shape valid?" check (ensure `userid && mobile`); on first failure, don't redirect — try `bbnl_user_backup`; if neither matches expected shape, force re-login (clear flags).

---

### RC-5 — `selectedLanguageId` mismatch across pages

**Trigger:** User picks Tamil in `channels.html`. `sessionStorage.selectedLanguageId = "tamil_id"`. They navigate to player, watch a channel. Languages cache refreshes; "tamil_id" no longer in the list.

**Effect:** `applyPreferredSidebarLanguage` finds no matching language, falls back to `languageIndex = 0` (or via the synthesized-fallback path at api.js:2622+ that injects a *fake* language entry). Either way, channels filter doesn't match → empty sidebar.

**Code:** [channels.js:604](js/channels.js#L604), [player.js:applyPreferredSidebarLanguage](js/player.js)

**Mitigation idea:** validate `selectedLanguageId` against the live language list at startup; clear it if not present.

---

### RC-6 — `_IMAGE_CACHE_MAP` (sessionStorage) inflated

**Trigger:** Long sessions that have visited many channels accumulate URL entries. `bbnl_image_cache_urls_v1` grows toward sessionStorage limit.

**Effect:** `_hydrateImageCache` (called on every page load via api.js:1371) does a synchronous `JSON.parse` of a large blob; first-paint stalls. Sidebar shell may render before images load → looks "broken."

**Code:** [api.js:1284-1299](js/api.js#L1284)

**Mitigation idea:** cap the map at e.g. 500 entries; LRU evict on `_persistImageCache`.

---

### RC-7 — BFCache restore with stale `sidebarState`

**Trigger:** User opens player → opens sidebar → presses HOME → goes to home page (`pagehide` fires, BFCache stores the player). User returns to player (`pageshow` fires with `event.persisted === true`). The restored player has the old `sidebarState.isOpen = true` and old `categories` / `channels` arrays — but the user might have switched accounts or the API data changed.

**Effect:** Sidebar appears already-open with previous state, focus enforcement runs against a stale category list, focus lands nowhere.

**Code:** [player.js:80](js/player.js#L80) (pageshow), [player.js:enforceSidebarPlaybackFocusOncePerOpen](js/player.js#L573)

**Mitigation idea:** in the `pageshow` handler, when `event.persisted === true`, force a fresh `ensureSidebarAllChannelsCache()` and `buildCategoriesForLanguage()` *before* re-running focus.

---

### RC-8 — Hydration race in `openSidebar` async path

**Trigger:** User taps the menu button very early after launch, before `loadChannelList()` finishes. `hasSidebarCache` is `false`, so `hydrateSidebarAllChannelsCache().then(...)` runs asynchronously.

**Effect:** Sidebar DOM shows "open" class (animations begin) but `sidebarState.categories` and `sidebarState.channels` are empty until the promise resolves. During the gap the user sees an empty / partial sidebar.

**Code:** [player.js:3879-3891](js/player.js#L3879)

**Mitigation idea:** show a "loading" state inside the sidebar until hydration resolves; or block `openSidebar` with a buffering indicator instead of opening early.

---

### RC-9 — `pagehide` listener disabling BFCache

**Trigger:** [api.js:374](js/api.js#L374) registers `_cleanupBlobResources` on `pagehide` unconditionally. Browsers may treat pages with active `pagehide` listeners (especially ones that mutate state) as ineligible for BFCache.

**Effect:** Returning to home / player triggers a *full* page load (no BFCache restoration). Every navigation back to home re-renders everything from scratch — including all language tile images. (CI-08 root cause #2.)

**Code:** [api.js:374](js/api.js#L374), [api.js:_cleanupBlobResources](js/api.js#L363)

**Mitigation idea:** check `event.persisted` inside the listener and skip cleanup when going into BFCache.

---

## 6. Cross-Reference with [ROOT_CAUSES.md](ROOT_CAUSES.md)

The original file lists per-file root causes. Mapping them to the launch-time menu issue:

| ROOT_CAUSES.md item | Still relevant? | Mapped to RC- above |
|----------------------|------------------|---------------------|
| `js/player.js`: complex sidebarState mutations / race conditions | ✓ confirmed | RC-3, RC-7, RC-8 |
| `js/player.js`: focus restore in multiple code paths | ✓ confirmed | RC-7, RC-8 |
| `js/player.js`: DOM render timing, focusing before nodes present | ✓ confirmed | RC-3, RC-8 |
| `js/player.js`: auto-resume retry-lock state inconsistent | partial — fixed in Point 6B; not directly menu | — |
| `css/pages/player.css`: scrollbar / border artifacts | not menu-launch | — |
| `js/channels.js`: duplicate DOM patterns / focus helpers | tangential | — |
| `js/api.js`: network detection spread across modules | partial | RC-9 |
| `js/api.js`: image URL normalisation in several places | ✓ confirmed (CI-10 already centralised) | — |
| `js/avplayer.js`: AVPlayer callbacks lifecycle | not menu-launch | — |
| `js/main.js`/`home.js`: shared sessionStorage keys without contract | ✓ confirmed | RC-5 |
| HTML class names: stable selectors | indirectly | — |

---

## 7. Recommended Mitigations (priority order)

Targeting the menu-broken-on-launch class specifically. None of these change app flow or theme.

1. **Validate `selectedLanguageId` against live language list at startup** (RC-1, RC-5). Cheap, single check; falls back to "Subscribed".
2. **Clamp restored `sidebarState.categoryIndex` / expanded indices** to `categories.length - 1` (RC-3).
3. **Guard `bbnl_user` parse path: require minimum shape** (`userid` + `mobile`) before treating as logged in (RC-4).
4. **Skip `_cleanupBlobResources` when `event.persisted === true`** (RC-9). One-line fix.
5. **Force `buildCategoriesForLanguage()` on BFCache restore** (RC-7) inside `pageshow`.
6. **Cap `_IMAGE_CACHE_MAP` to e.g. 500 entries with LRU eviction** (RC-6).
7. **Show buffering indicator while sidebar is hydrating** (RC-8) instead of opening empty.
8. **Reduce `CacheManager.EXPIRY.LANGUAGES` from 10 min to 60 s** (RC-1) — minor data-freshness win.
9. **Invalidate `bbnl_categories_cache` whenever `bbnl_channels_cache` is invalidated** (RC-2).

Each is a small, isolated change. Pick any subset; they don't depend on each other.

---

## 8. How to verify a fix
1. Reproduce: clear localStorage + sessionStorage manually (DevTools or via Settings → "Clear data" if available). Confirm app launches cleanly.
2. Force a stale-cache scenario (RC-1 / RC-2): keep localStorage but call the API on a different network so cached data drifts from server.
3. Test BFCache (RC-7, RC-9): navigate Player → Home → back to Player. Should restore in <100 ms with intact menu.
4. Test corruption (RC-4): manually edit `localStorage.bbnl_user` to truncate, reload — app should redirect to login, not crash silently.

---

## 9. Quick Reference — "If sidebar is broken on launch, check…"

| Symptom | First check | Likely RC |
|---------|-------------|-----------|
| Sidebar opens but no categories | `bbnl_categories_cache`, `apiCategories` | RC-2, RC-8 |
| Categories visible, no channels under them | `bbnl_languages_cache`, `selectedLanguageId` | RC-1, RC-5 |
| Menu opens with wrong category expanded | `sidebarState.languageUiState`, `expandedCategories` | RC-3 |
| Menu sometimes empty after navigating Home → Player | BFCache + pagehide cleanup | RC-7, RC-9 |
| Login screen instead of home, no error | corrupted `bbnl_user` | RC-4 |
| First-paint slow / sidebar appears delayed | image cache size | RC-6 |
| Tap menu fast right after launch → empty | hydration race | RC-8 |

---

*This document supersedes nothing — it complements [ROOT_CAUSES.md](ROOT_CAUSES.md) with concrete, code-grounded reasoning for the launch-time bug class. Update both files when adding new findings.*
