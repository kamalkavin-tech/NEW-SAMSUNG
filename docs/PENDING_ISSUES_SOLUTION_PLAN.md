# Pending Issues - Solution Plan

Date: 2026-05-01
Project: NEW-SAMSUNG (Tizen TV Web App)
Scope: Concrete fix plan for items marked **pending** in [CURRENT_FEEDBACK_ISSUES_SOLUTION.md](CURRENT_FEEDBACK_ISSUES_SOLUTION.md), grounded in actual code locations.
Status: **Awaiting approval** before any code changes.

---

## 1. How to Read This Doc

Each item has four blocks:

- **Where** - file:line for the code that needs to change
- **Why current code fails** - what the existing code does and why it produces the observed bug
- **Fix** - the targeted change (no redesign, no flow changes)
- **Acceptance** - what QA should see after the fix

No fix in this plan changes app flow, theme, or remote-key model.

---

## 2. Pending Feedback Points

### Point 7 - Menu Focus After Channel Selection (also CI-07)

**Where**
- [js/player.js](js/player.js) `openSidebar()` ~3837-4010
- [js/player.js](js/player.js) `alignSidebarToCurrentPlayback()` called at ~3919
- [js/player.js](js/player.js) `focusChannelItem()` deferred pass at ~4001-4004
- State: `sidebarState.categoryIndex` / `sidebarState.channelIndex` (~2348-2355)

**Why current code fails**
`openSidebar()` calls focus restore in two passes (sync + deferred RAF). When the user picks a channel via Menu, `sidebarState` is updated by the keydown handler before the player's "now playing" state catches up. On re-open, the deferred pass can run from stale state and override the alignment to the actual playing channel.

**Fix**
1. Introduce a single source of truth: `getCurrentPlayingChannelObject()` that returns `{ categoryIndex, channelIndex }` derived from the active AVPlayer channel id, not from `sidebarState`.
2. In `openSidebar()`, compute the target indices once at entry and stamp an `openToken` on `sidebarState`. The deferred focus pass must check the token; if a newer open has occurred or playback has changed, it bails.
3. When a channel is selected from Menu (`onChannelItemActivate` or equivalent), update both the playback target AND `sidebarState` indices in the same call so they cannot diverge.

**Acceptance**
- Pick channel from Menu, close, reopen: focus lands on the playing channel, every time.
- UP/DOWN immediately after reopen does not jump to a stale category header.

---

### Point 10 - Remove LEFT/RIGHT Movement on Category Change

**Where**
- [js/player.js](js/player.js) `handleSidebarKeydown()` LEFT/RIGHT branches ~4498-4543

**Why current code fails**
LEFT/RIGHT (keycodes 37/39) globally cycle the language tab regardless of which level (category vs channel) the focus is on. The reference UI shows category change as an arrow-icon expand/collapse on the focused category, not as a horizontal language jump.

**Fix**
1. Scope LEFT/RIGHT behavior by `sidebarState.currentLevel`:
   - On a **category row**: LEFT collapses the expanded category (or no-op if already collapsed); RIGHT expands it. No language cycling.
   - On a **channel row** inside an expanded category: LEFT collapses back to the parent category. RIGHT no-op.
   - On the **language tab strip** (top of sidebar): LEFT/RIGHT continues to cycle languages (preserves current behavior at that scope only).
2. Render an arrow indicator (`▸` collapsed / `▾` expanded) on each category row to match the reference UI.
   - Add a `.category-arrow` span inside `.category-item` (rendered by `createChannelItemButton` / category builder).
   - Toggle a `.expanded` class on `.category-item` based on `sidebarState.expandedCategories[catIdx]`.
3. Add CSS for the arrow in [css/pages/player.css](css/pages/player.css) under `.category-item .category-arrow` (small inline glyph, no layout change).

**Acceptance**
- LEFT/RIGHT on a category row expands/collapses only; no language jump.
- Arrow icon visually reflects expanded state.
- Language tab cycling still works when focus is on the language strip.

---

### Point 11 - Channel Names Clipped in Menu (Density)

**Where**
- [css/pages/player.css](css/pages/player.css)
  - `.channel-item` ~832-848 (`min-height: 92px; padding: 12px 14px`)
  - `.channel-item-logo` ~917-931 (`100x100`, image inside `80x80`)
  - `.channel-item-name` ~875-890 (`font-size: 18px`, 2-line clamp)
  - `.channel-item-lcn` ~901-907 (`font-size: 22px; min-width: 54px`)

**Why current code fails**
Each row is 92px tall with a 100px logo and 22px LCN font. On TV viewport this fits very few rows, and the 2-line name clamp still truncates long names because the available text column is too narrow.

**Fix** (purely CSS, no JS / no DOM change)
- `.channel-item`: `min-height: 64px; height: 64px; padding: 8px 12px`
- `.channel-item-logo`: `64x64` outer, image `48x48`
- `.channel-item-name`: `font-size: 15px; -webkit-line-clamp: 1` (single line + ellipsis)
- `.channel-item-lcn`: `font-size: 16px; min-width: 44px`
- Keep focused/selected highlight intact; verify focus ring still visible.

**Acceptance**
- More rows visible per screen.
- Long channel names show single-line ellipsis instead of being clipped/wrapped.
- Focus state remains unmistakable.

---

### Point 12 - Continuous Scroll in Menu Feels Slow

**Where**
- [js/player.js](js/player.js) `handleSidebarKeydown()` UP/DOWN ~4676-4840
- `focusChannelItem()` ~4419-4425 (calls `scrollIntoView`)
- `focusCategoryItem()` ~4313-4317 (calls `scrollIntoView`)

**Why current code fails**
Every UP/DOWN keypress runs through:
1. State mutation
2. `focusChannelItem()` -> `el.focus()` -> `scrollIntoView({ block: 'nearest' })`
3. Possibly a category re-render if a boundary is crossed

On TV remote auto-repeat (~6-10 events/sec), the per-event `scrollIntoView` and focus computation queue up faster than the browser can paint, producing input lag.

**Fix**
1. **Debounce scroll, not focus**: keep `el.focus()` synchronous (so the focus ring is current), but coalesce `scrollIntoView` into a single `requestAnimationFrame` per frame using a `pendingScrollTarget` variable.
2. **Skip redundant work** in the keydown handler: if the new index equals the old index (already at boundary, no wrap), return early before any DOM call.
3. **Avoid category rebuild on every move**: when crossing into the next visible category in an already-rendered list, only update focus + `sidebarState`; do not call any "rebuild category list" routine.

**Acceptance**
- Hold DOWN: focus moves smoothly at remote repeat rate without visible stutter.
- No frames where focus and scroll are out of sync.

---

### Point 13 - Continuous Down-Scroll Still Has an Issue

**Where**
- [js/player.js](js/player.js) `handleSidebarKeydown()` DOWN branch ~4755-4840
- `sidebarState.expandedCategories` (~2352)

**Why current code fails**
The DOWN handler has per-category boundary handling (last channel -> next category header), but in **multi-expanded** mode the wrap-around logic from "last visible row of last expanded category" back to "first visible row" is incomplete. Focus gets trapped cycling within the last expanded category.

**Fix**
1. Build a flat `visibleRows` list at navigation time:
   ```
   [{ kind: 'category', catIdx }, { kind: 'channel', catIdx, chIdx }, ...]
   ```
   from `sidebarState.expandedCategories` and `categories[*].channels`.
2. Replace ad-hoc DOWN logic with: `nextPos = (currentPos + 1) % visibleRows.length`. UP becomes `(currentPos - 1 + len) % len`.
3. Apply the same flat-list approach to UP to make wrap symmetric.
4. Cache the `visibleRows` list and invalidate only when `expandedCategories` or category/channel data changes (keeps Point 12 perf gains).

**Acceptance**
- Hold DOWN through multi-expanded categories: reaches last visible row, then wraps to the first visible row.
- Hold UP from the first row wraps to the last visible row.
- No trapped cycling within one category.

---

### Point 9 - Operator-Aware Default Category

**Where**
- [js/home.js](js/home.js) ~2526 (hardcodes `selectedLanguageName = 'All Channels'`)
- [js/player.js](js/player.js) ~2560-2561 (defaults `sidebarState.languageIndex = 1` -> "Subscribed Channels")
- [js/api.js](js/api.js) DEFAULT_HEADERS ~65-72 (no operator id field today)

**Why current code fails**
Default category is hardcoded in two places and not reconciled with operator identity. There is currently no operator id retrieval anywhere in `BBNL_API`.

**Status: BLOCKED on Suresh's confirmation of the operator -> default-category mapping.**

**Fix** (proposal pending confirmation)
1. Extend `BBNL_API` with `getOperatorId()` - source TBD with Suresh (likely an existing API field on login or device-bind response).
2. Add `js/operator-defaults.js` (or a small map in `js/api.js`) keyed by operator id:
   ```js
   const OPERATOR_DEFAULT_CATEGORY = {
     'OPERATOR_A': 'subscribed',
     'OPERATOR_B': 'all',
     // fallback: 'all'
   };
   ```
3. In [js/home.js](js/home.js) and [js/player.js](js/player.js), replace hardcoded defaults with `getDefaultCategoryForCurrentOperator()`.
4. Fallback for unknown operator id: keep current `'all'` to avoid regression.

**Acceptance**
- Each known operator id opens to its mapped default.
- Unknown operator id falls back to "All Channels" without error.

**Action item**: confirm operator -> category mapping with Suresh before implementation.

---

### Point 8 - Unspecified Behavior

**Status: BLOCKED on symptom description.**

The point is referenced but has no observable repro. Action item: get exact UI flow / repro steps from QA before implementation. No code change should be drafted until this is clarified.

---

## 3. Open QA Items Not Yet Addressed

These come from [APP_CURRENT_ISSUES_REFERENCE.md](APP_CURRENT_ISSUES_REFERENCE.md) and are not yet covered in [CURRENT_FEEDBACK_ISSUES_SOLUTION.md](CURRENT_FEEDBACK_ISSUES_SOLUTION.md).

### CI-06 - Subcategory Order

**Where**: [js/player.js](js/player.js) `buildCategoriesForLanguage()` ~3024-3047 - `categoryPriority` map already exists.

**Fix**: Verify the map matches the required order (Entertainment, Movies, Kids, Sports, Infotainment, Music, News, Devotional, Miscellaneous). Adjust priority numbers if any drift. Single-file change, low risk.

### CI-13 - Scroll Stops at Janam TV

**Where**: No code-level length limit found in [js/player.js](js/player.js) `renderChannelsList()` ~3716. Likely a **data issue**: API response truncates or a category boundary is being hit.

**Fix**: Instrument with one diagnostic log of `sidebarState.channels.length` at sidebar open + log channel count per category. Confirm whether the issue is in data or in the DOWN handler boundary (ties to Point 13 fix).

### CI-14 - Multi-Subcategory End Wrap

Covered by **Point 13 fix** above (flat `visibleRows` wrap).

### CI-10 - Channel Logos Missing

**Where**: [js/player.js](js/player.js) `getChannelLogoUrl()` ~3514, `BBNL_API.isImageCached()` / `setImageSource()` / `markImageCached()` calls ~3526-3531; consumed in sidebar, info-bar, and TV Channels page.

**Why current code likely fails**: Per [ROOT_CAUSES.md](ROOT_CAUSES.md), logo URL normalization happens in several places with slightly different rules.

**Fix**:
1. Centralize logo URL normalization in one helper inside [js/api.js](js/api.js): `BBNL_API.normalizeChannelLogoUrl(channel)`.
2. Replace ad-hoc resolution in `js/player.js`, `js/channels.js`, `js/home.js` with the single helper.
3. Standardize fallback to a single placeholder asset path.

### CI-11 / CI-12 - Banner Layout and Count

**Where**: [js/home.js](js/home.js) `renderHomepageAds()` ~1175-1312 (currently `slice(0, 5)` at ~1187, dynamic height clamp 420-760px at ~1198-1216).

**Fix**:
1. Audit the banner container CSS in [css/pages/homepages.css](css/pages/homepages.css) - `#hero-banner-container` width may be constrained, producing the "centered with side blanks" look.
2. Confirm carousel rotation actually advances all 5 slides; the slice is correct, the rotation timer or auto-advance may be where 2 vs 5 diverges.
3. One CSS fix (full-width container) + one JS check (rotation index increments past slide 2).

### CI-04 - All Channels Menu Slow Load

**Where**: [js/player.js](js/player.js) `ensureSidebarAllChannelsCache()` (called from `openSidebar` ~3841).

**Fix**: Confirm cache hydration is hit on warm open. If a full rebuild runs every open, gate it on a `sidebarState.cacheGeneration` token that only invalidates on subscription change or explicit refresh.

### CI-05 - Border-Line Artifact on Info Bar / Menu Close

**Where**: [css/pages/player.css](css/pages/player.css) `.inline-channels-wrap` has a `border-left` per [ROOT_CAUSES.md](ROOT_CAUSES.md).

**Fix**: Remove decorative `border-left` on `.inline-channels-wrap`; ensure no other element renders a 1px line at the same offset.

### CI-08 - Language Images Reload Each Home Visit

**Where**: [js/home.js](js/home.js) language image render path.

**Fix**: Use `BBNL_API.isImageCached()` before re-issuing image src; mark cached on first successful load. Same pattern as channel logos, applied to language tiles.

### CI-09 (QA list) - Black Screen on Unsubscribed Popup -> Back -> OK

> Note: this is the **CI-09 black-screen flow**, separate from feedback **Point 9 (operator default)**.

**Where**: Player popup state machine in [js/player.js](js/player.js) - search for unsubscribed popup show/hide and idle timeout.

**Fix**: The popup state is being cleared by an idle/timeout path while the menu is open. Add a guard: if Menu is open, defer popup teardown until Menu closes; if user dismisses the popup with Back, do not reopen the menu without the popup state intact.

### CI-01, CI-02, CI-03

CI-03 already partially fixed (per Section 2.1 of [CURRENT_FEEDBACK_ISSUES_SOLUTION.md](CURRENT_FEEDBACK_ISSUES_SOLUTION.md)). CI-01 (cold-start time) and CI-02 (subscription reflect 8-10 min) likely require backend/API tuning beyond client scope; defer until backend owners weigh in.

---

## 4. Implementation Order (Recommended)

Ordered by **risk-adjusted value** - highest user impact + lowest regression risk first:

1. **Point 11** - CSS-only density tweak (no JS, no flow risk)
2. **CI-05** - Remove decorative `border-left` (CSS only)
3. **CI-06** - Verify/correct subcategory priority map (one map, one file)
4. **Point 10** - LEFT/RIGHT scoped to focus level + arrow icon
5. **Point 7** - Sidebar focus restore via `openToken` and single source of truth
6. **Point 13** - Flat `visibleRows` wrap (also covers CI-14)
7. **Point 12** - rAF-coalesced scroll (depends on Point 13's flat list)
8. **CI-10** - Centralize `normalizeChannelLogoUrl` in `BBNL_API`
9. **CI-08** - Language image caching (mirrors CI-10 pattern)
10. **CI-04** - Sidebar cache hydration token
11. **CI-11 / CI-12** - Banner full-width + rotation audit
12. **CI-09 (QA)** - Unsubscribed popup state-machine guard
13. **Point 5** (background opacity refinement) - small CSS follow-up
14. **Point 9** - Operator default category (BLOCKED on Suresh)
15. **Point 8** - (BLOCKED on symptom)

---

## 5. Todo List

```
[ ] 1.  Point 11 - menu density (CSS only)
[ ] 2.  CI-05 - remove .inline-channels-wrap border-left
[ ] 3.  CI-06 - verify subcategory order priority map
[ ] 4.  Point 10 - LEFT/RIGHT scoped behavior + arrow icon
[ ] 5.  Point 7 - openToken focus restore + currentPlaying source of truth
[ ] 6.  Point 13 / CI-14 - flat visibleRows wrap-around
[ ] 7.  Point 12 - rAF-coalesced scrollIntoView, skip-no-op
[ ] 8.  CI-10 - centralize logo URL normalization in BBNL_API
[ ] 9.  CI-08 - language tile image caching
[ ] 10. CI-04 - sidebar cache hydration generation token
[ ] 11. CI-11/CI-12 - banner full-width + rotation audit
[ ] 12. CI-09 (QA) - unsubscribed popup teardown guard
[ ] 13. Point 5 - input background opacity refinement
[ ] 14. Point 9 - operator-aware default category (BLOCKED: confirm map with Suresh)
[ ] 15. Point 8 - awaiting symptom (BLOCKED)
```

---

## 6. Constraints (Reaffirmed)

- No app flow changes.
- No theme or layout redesign.
- Remote-key model unchanged at the **language strip** level; LEFT/RIGHT semantics only refined within sidebar levels (Point 10).
- All fixes scoped to logic / state / render correctness and targeted CSS.
- Each item ships as a small, reviewable change; no bundled mega-edit.

---

## 7. Approval Checklist

Before I start coding, please confirm:

- [ ] Implementation order in Section 4 is OK, or specify a different order.
- [ ] Point 11 CSS values (64px row, 64px logo, 15px name, 16px LCN) are acceptable, or specify different targets.
- [ ] Point 10 arrow indicator (`▸`/`▾`) is acceptable, or attach the reference image so I can match exactly.
- [ ] OK to file diagnostic logging for CI-13 (Janam TV) on a real device.
- [ ] Hold Point 9 until Suresh confirms the mapping.
- [ ] Hold Point 8 until symptom is provided.

Once approved, I will work item-by-item, committing each fix separately.
