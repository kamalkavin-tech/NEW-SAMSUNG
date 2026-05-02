# Point 6 & 7 — Root Cause Analysis and Solution Plan

Date: 2026-05-01
Project: NEW-SAMSUNG (Tizen TV Web App)
Scope: Two pending feedback items in [CURRENT_FEEDBACK_ISSUES_SOLUTION.md](CURRENT_FEEDBACK_ISSUES_SOLUTION.md).
Status: **Awaiting approval** — no code change yet.
Constraint: No flow / format changes. Targeted bug fixes only.

---

## Point 6 — Playback error popup is slow + no auto-resume after internet restore

### Where the bug lives
- [js/player.js](js/player.js) `startPlayerNetworkWatchdog` (~647)
- [js/player.js](js/player.js) `attemptPlayerAutoResumeRetry` (~544)
- Constants at top of file: `PLAYER_NETWORK_WATCH_INTERVAL_MS = 5000`, `PLAYER_NETWORK_POPUP_DELAY_MS = 1500`, `PLAYER_NETWORK_RESUME_STABLE_MS = 3000`.

### Bug A — Popup takes 5-7 seconds to show

**Trace** (network drops at t=0):
1. Watchdog poll runs every **5000ms**.
2. First poll detects disconnect → line 689-691 just sets `playerNetworkDisconnectSince = t1` and **returns**. No popup yet.
3. Second poll (5000ms later) checks `(Date.now() - playerNetworkDisconnectSince) >= 1500ms` → true → shows popup at line 696.

**Net delay:** 5 s (one full poll cycle) plus up to 1.5 s grace = **5–6.5 s** before user sees the popup. Feels broken.

### Bug B — Auto-resume never fires after network is restored

**Trace** (network restored after popup is showing):
1. When popup was shown (line 694), the code at line 697 sets `playerNetworkDisconnectSince = 0`.
2. Network is restored. Watchdog poll runs. `disconnected = false`. Code enters the "online" branch at line 660.
3. Line 664-665:
   ```js
   if (playerNetworkDisconnectSince > 0 && playerNetworkReconnectSince === 0) {
       playerNetworkReconnectSince = Date.now();
   }
   ```
   `playerNetworkDisconnectSince` is **0** (was reset at popup time), so this `if` does NOT enter.
4. Line 668: `networkRecoveryReady = playerNetworkReconnectSince > 0 && (...)` → **false** because reconnectSince is still 0.
5. `attemptPlayerAutoResumeRetry` is **never called**.
6. User must press "Try Again" manually.

**Root cause:** `playerNetworkDisconnectSince = 0` reset at line 697 destroys the only signal the recovery branch uses to set `playerNetworkReconnectSince`.

### Proposed fixes (no flow change)

**Fix 6A — Faster popup:**
- Drop `PLAYER_NETWORK_WATCH_INTERVAL_MS` from 5000 to **2000** ms. Net popup time becomes ~2 s, well within "feels responsive" threshold.
- (Optional) On first detection, run an immediate elapsed check: if the previous poll had also detected disconnect very recently (within ~1 s), skip the grace and show the popup right away. Prevents a flapping disconnect from delaying the popup further.

**Fix 6B — Working auto-resume:**
- Track network state via a single boolean `_lastNetworkOnline`. On the watchdog tick:
  - If `disconnected && _lastNetworkOnline === true` → state transition online→offline. Set `playerNetworkDisconnectSince = now`. Set `_lastNetworkOnline = false`.
  - If `!disconnected && _lastNetworkOnline === false` → state transition offline→online. Set `playerNetworkReconnectSince = now`. Set `_lastNetworkOnline = true`.
- This decouples `playerNetworkReconnectSince` from `playerNetworkDisconnectSince`, so resetting the latter (when popup shows) doesn't break the former.
- `attemptPlayerAutoResumeRetry` is already wired correctly at line 669–675 — once `playerNetworkReconnectSince` is set and `PLAYER_NETWORK_RESUME_STABLE_MS` (3 s) elapses, it auto-retries.

**Net behavior after fix:**
- Disconnect → popup appears within ~2 s.
- Internet restored → ~3 s of stable connectivity → automatic retry. No "Try Again" press needed.

---

## Point 7 — Menu focus does not land on the streaming channel after CH+/CH-

### Where the bug lives
- [js/player.js](js/player.js) `changeChannel` (~2212)
- [js/player.js](js/player.js) `syncSidebarWithCurrentPlayback` (~2235)
- [js/player.js](js/player.js) `openSidebar` (~3848) — specifically the `hasSavedState ? buildCategoriesForLanguage() : alignSidebarToCurrentPlayback()` branch.
- [js/player.js](js/player.js) `enforceSidebarPlaybackFocusOncePerOpen` (~573)

### Repro
1. User is on language tab "Tamil", Movies category expanded, plays Movie A from menu.
2. Menu auto-closes after idle.
3. User presses **CH+** on remote → `changeChannel(1)` plays the next channel in `allChannels`. This may be a channel in a **different language** (e.g. a Hindi news channel) because `allChannels` is not language-filtered.
4. User reopens menu.
5. Menu shows Tamil tab with Movies still expanded and old Movie A still focused. The actually-playing Hindi News channel is **not visible**, not focused.

### Bug — three contributing causes

**7A — `syncSidebarWithCurrentPlayback` no-ops when menu is closed**
At line 2246:
```js
if (sidebarState.isOpen) {
    // align state, focus, etc.
}
```
When `changeChannel` calls this with the menu closed, the entire alignment block is skipped. `sidebarState.categoryIndex` and `sidebarState.channelIndex` remain at their pre-CH+ values.

**7B — `openSidebar` saved-state path keeps the wrong language tab**
At openSidebar (~3903):
```js
if (hasSavedState) {
    buildCategoriesForLanguage();   // keeps saved language (Tamil)
} else {
    alignSidebarToCurrentPlayback(); // would switch to channel's actual language
}
```
With saved state present, the saved language is preserved (Tamil) even though the now-playing channel is Hindi. `buildCategoriesForLanguage` builds Tamil categories. The Hindi News channel is not present anywhere in those categories.

**7C — Sync block at lines 3911-3919 silently fails**
```js
var syncedCatIdx = getCurrentPlayingCategoryIndex();
if (syncedCatIdx >= 0 && ...) {
    var syncedChIdx = findCurrentChannelInSidebar();
    if (syncedChIdx >= 0) {
        sidebarState.categoryIndex = ...;
        sidebarState.channelIndex = ...;
    }
}
```
`getCurrentPlayingCategoryIndex` looks up the channel only inside the **current language's filtered list** ([js/player.js:3161](js/player.js)). Since the playing channel isn't in Tamil, this returns -1. The whole block is skipped. The 40 ms deferred `enforceSidebarPlaybackFocusOncePerOpen` also returns false (its line 591: same -1 short-circuit), leaving the stale state visible.

### Proposed fixes (no flow change)

**Fix 7A — Update sidebarState even when menu is closed**
In `syncSidebarWithCurrentPlayback`, after the `ensureCache` block, add a closed-menu code path that:
- Resolves the new playing channel.
- Updates `sidebarState.categoryIndex` and `sidebarState.channelIndex` (so reopen has fresh anchor).
- Does **not** touch DOM (menu is closed, no render).

This is a small append; the existing `if (sidebarState.isOpen)` block stays untouched.

**Fix 7B — Open-time fallback when saved language no longer holds the playing channel**
In `openSidebar`, change the branch logic from:
```js
if (hasSavedState) buildCategoriesForLanguage();
else alignSidebarToCurrentPlayback();
```
to:
```js
if (hasSavedState && languageContainsCurrentPlayingChannel(sidebarState.languageIndex)) {
    buildCategoriesForLanguage();
} else {
    alignSidebarToCurrentPlayback();
}
```
`languageContainsCurrentPlayingChannel` already exists at [js/player.js:3195](js/player.js). It returns true when the saved language tab actually contains the current playing channel. If it does — preserve user's saved tab + expansion. If it doesn't — `alignSidebarToCurrentPlayback` switches to the right language and expands the correct category.

**No flow change:** within-language CH+/CH- still keeps the saved language and category expansion. Only when the channel jumped to a different language tab does the menu auto-switch to follow the playing channel.

### Acceptance for Point 7

| Scenario | Behavior after fix |
|---|---|
| User opens menu after CH+/CH- to a channel in the **same** language tab | Saved language + category preserved; focus lands on the new channel within the saved category. |
| User opens menu after CH+/CH- to a channel in a **different** language tab | Menu auto-switches to the channel's actual language, expands its category, focuses the channel. |
| User opens menu without any zapping | Behaves exactly as today (no change). |

---

## TODO LIST

```
[ ] 6A. Faster popup
       - PLAYER_NETWORK_WATCH_INTERVAL_MS: 5000 → 2000
       - File: js/player.js (~line 155)

[ ] 6B. Decouple reconnectSince from disconnectSince
       - Add `var _lastNetworkOnline = true;` near other watchdog state
       - In startPlayerNetworkWatchdog tick, detect online↔offline transitions
         and set playerNetworkReconnectSince on offline→online, regardless
         of playerNetworkDisconnectSince value
       - File: js/player.js (~line 647-700)

[ ] 7A. syncSidebarWithCurrentPlayback updates state even when menu closed
       - After ensureCache block, add closed-menu state-only update that
         resolves playing channel and writes categoryIndex / channelIndex
         without DOM work
       - File: js/player.js (~line 2235-2265)

[ ] 7B. openSidebar uses alignSidebarToCurrentPlayback when saved language
       no longer contains the playing channel
       - Replace `if (hasSavedState)` with
         `if (hasSavedState && languageContainsCurrentPlayingChannel(sidebarState.languageIndex))`
       - File: js/player.js (~line 3903)
```

---

## Constraints (re-affirmed)

- No app flow changes.
- No theme/format changes.
- No remote-key behavior changes.
- Each fix is a small, targeted edit reviewable in isolation.
- All four items are in `js/player.js` only.

---

## Approval needed

Reply **go** to start with the order above (6A → 6B → 7A → 7B), or specify a different order / changes. I'll commit each fix one at a time and re-verify after each.
