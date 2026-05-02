# CI-08 — Language Images Reload on Every Home Redirect

Date: 2026-05-01
Issue: [APP_CURRENT_ISSUES_REFERENCE.md](APP_CURRENT_ISSUES_REFERENCE.md) CI-08
Cross-ref: [ROOT_CAUSES.md](ROOT_CAUSES.md) — "Image/logo URL normalization and cache resolution occur in several places with slightly different rules"

## Symptom (from QA)
Every time the app navigates back to home (from player / channels / settings), the language images visibly reload — empty box → fetch → render. Should reuse from cache.

## Why the previous fix didn't fully resolve it

Earlier I added a cache check at [js/home.js:1632](js/home.js#L1632):
```js
var langLogoCached = (homeLanguageLogoCache[langLogo] === true)
    || (BBNL_API.isImageCached && BBNL_API.isImageCached(langLogo));
if (langLogoCached) {
    img.src = langLogo;          // skip blob queue
} else {
    BBNL_API.setImageSource(img, langLogo);
}
```

That fix correctly **flagged** the URL as cached, but `img.src = langLogo` on Samsung Tizen TV (running off `file://` protocol) **still triggers a network fetch every time** because:

### Root cause #1 — Browser HTTP cache is unreliable for cross-origin images on `file://` page
Samsung Tizen's WebKit doesn't reliably keep `https://` image responses in cache when the host page is `file://` (the platform serves the app from local files but fetches images from a remote CDN). Even `cache: 'force-cache'` priming via `fetch()` is revalidated or evicted on next navigation.

### Root cause #2 — `pagehide` cleanup may disable BFCache
[js/api.js:374](js/api.js#L374):
```js
window.addEventListener('pagehide', _cleanupBlobResources);
```
This handler runs on every navigation. Browsers can disqualify a page from the Back/Forward Cache when a `pagehide` listener does work *unconditionally* (without checking `event.persisted`). If BFCache is disabled, returning to home triggers a full DOM rebuild → all `<img>` elements are new → all sources fetched again.

### Root cause #3 — `homeLanguageLogoCache` is a module-level variable
[js/home.js:13](js/home.js#L13): `var homeLanguageLogoCache = {};` — resets to `{}` on every page load. So the only cross-page signal we have is `BBNL_API._IMAGE_CACHE_MAP` (sessionStorage-backed at [js/api.js:1295-1299](js/api.js#L1295)). That map only stores **boolean flags** ("URL was loaded once"), not the actual image data. Setting `img.src = url` still requires a network round-trip to render.

### Net effect
On every home revisit:
1. DOM rebuilt → `<img>` with no `src`.
2. JS runs → `img.src = langLogo` (a remote `https://` URL).
3. Browser HTTP cache miss (root cause #1) → network fetch.
4. **User sees empty box → fetch progress → image renders.** That's the visible "reload".

## Fix — keep the actual image bytes in `sessionStorage` as data URIs

The only way to make image render **truly instant on revisit** is to skip the network entirely on the second visit. We do that by:

1. **First visit:** fetch the image as a blob, convert to a Base64 data URI, store under `bbnl_lang_logo_dataurl_v1` in `sessionStorage`.
2. **Revisit (same session):** read the data URI synchronously from `sessionStorage` and set `img.src = dataUri` — zero network, paints in the same frame.

Why this is safe:
- 13 language logos × ~8–15 KB each (after Base64 33% inflation) ≈ 150–250 KB total. Well under sessionStorage's ~5–10 MB ceiling.
- Cache is keyed on the normalised URL, so URL changes from API automatically miss the cache and refetch.
- Cache only persists for the current session (sessionStorage). On full app restart, it rebuilds — same lifetime semantics as `_IMAGE_CACHE_MAP`.
- Falls back gracefully: if cache missing or fetch fails, the existing path runs.

The fix is **scoped entirely to language logos in `js/home.js`** — does not touch player, channels, settings, or any non-home image flow.

## Files to change

| File | Change |
|---|---|
| [js/home.js](js/home.js) | Add data-URI cache helpers + use them in `renderLanguagesInHomeGrid` and `prefetchHomeLanguageLogos`. |

No CSS, no HTML, no other JS. No app flow change.

## Acceptance criteria (per CI-08)

| Action | Expected |
|---|---|
| First app open, navigate to home | Language images load (one-time network fetch). |
| Navigate to player / channels / settings, then back to home | **Language images appear instantly with no visible reload.** |
| Force quit app, relaunch, open home | First-load behavior again (cache cleared with sessionStorage). |
| API returns new logo URL for a language | Cache miss for the new URL, refetched once, then cached. |

---

## TODO LIST

```
[ ] 1. Add data-URI cache helpers in js/home.js (top, near homeLanguageLogoCache):
       - _LANG_LOGO_DATAURL_KEY  ('bbnl_lang_logo_dataurl_v1')
       - _langLogoDataUrlCache (in-memory mirror, hydrated from sessionStorage on script init)
       - _getLangLogoDataUrl(originalUrl)
       - _saveLangLogoDataUrl(originalUrl, dataUrl)
       - _fetchAndCacheLangLogoDataUrl(originalUrl) — uses fetch + FileReader

[ ] 2. Update prefetchHomeLanguageLogos to use the data-URI cache:
       - On prefetch, if not already in dataUrl cache, fetch+cache via FileReader.
       - Skip if already present (no-op).

[ ] 3. Update renderLanguagesInHomeGrid to use the data-URI cache:
       - For each lang, FIRST check _getLangLogoDataUrl(langLogo).
       - If hit: img.src = dataUrl  (instant, no network)
       - Else: keep existing path; on img.onload, kick off async _fetchAndCacheLangLogoDataUrl
         so the next visit hits the cache.

[ ] 4. Verify: home → channels → home shows no flash on language tiles.
```

---

## Approval and execution

Per the user's instruction (`you have full access from my side`), proceeding to implement immediately. Will not touch any code outside `js/home.js`.
